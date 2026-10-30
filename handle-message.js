import { smsg } from "./lib/wa-socket.js";
import { elegirAlAzar } from "./lib/azar.js";
import { initDataDB, getUser, getChat, getBotSettings, updateUser, syncUserInfo, isCommandBlacklisted } from "./database-functions.js";
import { juegosAbiertos, mensajeJuegosCerrados, correspondeAvisar } from "./lib/horario-juegos.js";
import { permisosDe } from "./lib/roles.js";
import { metadataDe } from "./lib/cache-grupos.js";
import { atrasoDeLlegada } from "./lib/tiempo.js";
import { registrarUso } from "./lib/usos.js";
import { hooksEnOrden } from "./load-functions.js";
import { buscarEnGrupo, esOwnerConfirmado } from "./lib/identidad.js";
import { anotarPresencia, anotarCierreDe } from "./lib/inactivos.js";

// Keeps the last time each group was greeted
const cooldownSaludos = new Map();
// Cooldown: 30 minutes (in milliseconds)
const TIEMPO_COOLDOWN = 30 * 60 * 1000;
const SALUDO = /^(hola+|buenas+|buen día|buenos días|holis|q onda)/i;
const RESPUESTAS_SALUDO = ["¡Buenas! ¿Todo en orden por acá?", "Holaaa, ¿cómo andamos?", "¡Buenas buenas! ¿Qué se cuenta?", "¡Hola grupo!"];

// A greeting back to a message that starts with one, at most every 30 minutes per group. Turned off per group with
// .saludos (or .modo compraventa).
function saludar(client, m, text, chat) {
  if (!m.isGroup || !text || chat.saludos === 0 || !SALUDO.test(text.trim())) return;
  const ahora = Date.now();
  if (ahora - (cooldownSaludos.get(m.chat) || 0) <= TIEMPO_COOLDOWN) return;
  cooldownSaludos.set(m.chat, ahora);
  // Quoting whoever said hello. Not awaited: it waits its turn (lib/envios.js), and the hooks after it shouldn't wait
  // for a greeting.
  client.sendMessage(m.chat, { text: elegirAlAzar(RESPUESTAS_SALUDO) }, { quoted: m }).catch(console.error);
}

// Handles an incoming message from msgQueue in main.js
export async function handleMessage(nMsg) {
  if (!nMsg) return;
  this.pushMessage(nMsg).catch(console.error);
  let m = nMsg;
  if (!m) return;

  try {
    m = smsg(this, m) || m;

    // A group closed or opened: .inactivos doesn't count the time it was closed. Ahead of the cut below, with the time
    // it happened: a notice from while the bot was offline arrives late.
    anotarCierreDe(m);

    // ==========================================
    // 0. HANGOVER FILTER (ignore stale messages)
    // ==========================================
    // A message that reached the bot more than 60 seconds after it was sent is dropped (the bot was offline, or the
    // connection stalled). Measured at arrival, not now: waiting behind the rest of its batch doesn't make it stale.
    // It's still a sign of life for .inactivos (anotarPresencia), like the two cuts below.
    if (atrasoDeLlegada(m) > 60) return anotarPresencia(m, { antesDelNumero: true });

    // Keeps the bot from answering command messages from while it was offline.
    if (m._upsertType === "append" && globalThis.prefix.find((p) => m.text.startsWith(p))) return anotarPresencia(m, { antesDelNumero: true });

    // Someone who's neither a LID nor a number (Meta AI writes as …@bot) has no row to keep it under: by "" getUser
    // found someone else's, one without a number, and every answer of Meta AI went to their message count. A group
    // notice goes on without one, and without a row for anybody: Baileys keys it by whoever acted
    // (Socket/messages-recv.js), which a notice may not name (a join request names the one asking inside it), and cut
    // here, plugins/_detect-events.js didn't turn away whoever on the blacklist asked to join.
    if (!m.sender && !m.messageStubType) return;

    // initialize data if it doesn't exist yet
    initDataDB(m);
    syncUserInfo(m);

    // Fetch the user's data, the chat's, and the bot settings.
    const user = getUser(m.sender, m.chat) || { inGroup: {} };
    const chat = getChat(m.chat);
    const botSettings = getBotSettings(client.user.lid);

    // autoRead msg
    if (botSettings.autoRead && m.message) await this.readMessages([m.key]);
    // Muted user
    if (user.inGroup[m.chat]?.mute && m.message) {
      anotarPresencia(m);
      return m.delete();
    }

    // Current permissions
    const groupMetadata = (m.isGroup ? await metadataDe(this, m.chat) : {}) || {};
    const participants = (m.isGroup ? groupMetadata.participants : []) || [];
    // Whoever wrote, and the bot, by either identity (lib/identidad.js): a group that lists people by number names them
    // by it, and the message may bring their LID.
    const userSender = (m.isGroup ? buscarEnGrupo(participants, { lid: m.sender, jid: m.senderJid || user?.jid }) : {}) || {};
    const bot = (m.isGroup ? buscarEnGrupo(participants, { lid: client.user.lid, jid: client.user.jid }) : {}) || {};
    // By the number the message brings, or by the LID WhatsApp says has an owner's number (lib/identidad.js), so the
    // owner is recognized when the message only carries their LID, and nobody else is for having the number on a row.
    const isOwner = m.fromMe || esOwnerConfirmado([m.senderJid, m.sender]);
    const isRAdmin = userSender?.admin === "superadmin" || false;
    const isWaAdmin = isRAdmin || userSender?.admin === "admin" || false;
    // Per-group bot roles (.adminbot / .moderador): the bot admin counts as admin and the moderator only as mod.
    // WhatsApp admins and the owner get both without needing a role.
    const { rol: rolBot, isAdmin, isMod } = permisosDe(m.chat, m.sender, { esOwner: isOwner, esAdminWhatsApp: isWaAdmin });
    let isBotAdmin = !m.isGroup || bot?.admin || false;

    // Bail out on baileys messages to avoid clashing with the bot's own.
    if (m.isBaileys) return;

    // antiPrivate
    if (botSettings.antiPrivate && !m.isGroup && !isOwner && m.senderJid !== "18002428478@s.whatsapp.net") return;

    // Pull out the text and its arguments.
    let text, args;
    text = m.text || "";
    args = text.trim().split(/\s+/);

    // Run the 'before' plugins: the moderation first and Claudia's chat last (hooksEnOrden, load-functions.js). A hook
    // that throws takes only itself down: with the moderation first, a deletion that failed there would otherwise leave
    // the message without its count, its place in Claudia's memory and its command.
    const hooks = hooksEnOrden(globalThis.plugins);
    const correrHook = async (plugin) => {
      try {
        await plugin.before(m, { client: this, text, args, participants, isRAdmin, isWaAdmin, isAdmin, isMod, rolBot, isBotAdmin, isOwner, user, chat, botSettings });
      } catch (e) {
        console.error("[hooks] ERROR:", e);
      }
    };
    for (const plugin of hooks.filter((p) => p.moderacion)) await correrHook(plugin);
    // Whoever wrote, wrote: what the moderation deleted (a banned link, too many mentions) is a sign of life for
    // .inactivos all the same, though no counter counts it (anotarPresencia). Someone warned who answered "acá estoy"
    // with a link stayed warned, and could be removed.
    if (m.moderado) anotarPresencia(m);
    // The greeting, once the moderation has had its say, and still ahead of the other hooks (Claudia's chat among
    // them). Ahead of the moderation, a spam with a link got a greeting quoting it, with the deleted link in sight, and
    // so did whoever the blacklist was about to remove.
    if (!m.moderado) saludar(this, m, text, chat);
    for (const plugin of hooks.filter((p) => !p.moderacion)) {
      // What the moderation deleted (m.moderado) reaches no other hook: no game takes it as an answer, no counter
      // counts it, nothing reacts to it. Checked here once for all of them, the ones still to come included. Only
      // Claudia's short-term memory still gets it: a deletion or an edit from someone on the blacklist applies there
      // all the same.
      if (m.moderado && !plugin.trasModeracion) continue;
      await correrHook(plugin);
    }

    // What the moderation deleted (m.moderado: an anti-link, the blacklist, the mass mentions) doesn't run as a command
    // either. ".tt <link>" with TikTok links banned had the link deleted and warned about, and then .tt downloaded the
    // video and posted it.
    if (m.moderado) return;

    // check banchat
    if (chat.isBanned && !isOwner) return;

    // check admin mode
    if (chat.adminMode && !isOwner && !isMod && m.isGroup) return;

    // check whether the message starts with a valid prefix
    const usedPrefix = globalThis.prefix.find((p) => m.text.startsWith(p));
    if (!usedPrefix) return;

    // user banned from the bot
    if (user.banned) {
      if (Date.now() - user.lastmining < 3600000) return;
      this.sendMessage(m.chat, { text: "🚫ESTÁS BANEADO(A)🚫", mentions: [m.sender] }, { quoted: m });
      updateUser(m.sender, { lastmining: Date.now() });
      return;
    }

    // get the command and its arguments
    args = m.text.slice(usedPrefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();
    if (!command) return;
    // ignore commands that are just dots
    if (/^\.+$/.test(command)) return;
    text = args.join(" ");

    // Group blacklist mode (.blon + .bladd): blocked commands run for nobody except the owner.
    if (chat.blacklistMode && !isOwner && isCommandBlacklisted(m.chat, command)) return m.react("🔒");

    // Check whether the command exists in any plugin
    const matchPlugins = Object.values(globalThis.plugins).filter((plugin) => plugin.cmd && plugin.cmd.includes(command));
    if (matchPlugins.length === 0 && usedPrefix !== "@" && !command.includes("_")) return client.sendText(m.chat, txt.noCommandMatch(command), m);

    // Run every matching plugin.
    // A missing permission stops ONLY the plugin that asks for it, not the others sharing the command: hence the
    // "continue" instead of "return". The first rejection notice is stored and sent once, at the end, and only if
    // no plugin got to run; that way two plugins with the same cmd neither mask each other nor send two messages.
    let corrioAlguno = false;
    let avisarRechazo = null;
    const rechazar = (aviso) => {
      if (!avisarRechazo) avisarRechazo = aviso;
    };

    for (const plugin of matchPlugins) {
      if (!plugin.run) continue;

      // Check whether the command requires being the OWNER
      if (plugin.onlyOwner && !isOwner) {
        rechazar(() => client.sendText(m.chat, txt.onlyOwner, m));
        continue;
      }

      // Check whether the command requires a group
      if (plugin.onlyGroup && !m.isGroup) {
        rechazar(() => client.sendText(m.chat, txt.onlyGroup, m));
        continue;
      }

      // Check whether the command requires the bot to be admin
      if (plugin.botAdmin && !isBotAdmin) {
        // The stored metadata may be stale. Before rejecting, ask WhatsApp; the cache keeps the answer, so the
        // next command doesn't ask again.
        const metadataFresca = await metadataDe(this, m.chat, { fresca: true });
        const botFresco = buscarEnGrupo(metadataFresca?.participants, { lid: client.user.lid, jid: client.user.jid });
        if (!botFresco?.admin) {
          rechazar(() => client.sendText(m.chat, txt.botAdmin, m));
          continue;
        }
        isBotAdmin = true;
      }

      // Check whether the command requires the user to be admin
      if (plugin.onlyAdmin && !isAdmin) {
        rechazar(() => client.sendText(m.chat, txt.onlyAdmin, m));
        continue;
      }

      // Check whether the command requires being a bot moderator (admins pass too)
      if (plugin.onlyMod && !isMod) {
        rechazar(() => client.sendText(m.chat, txt.onlyMod, m));
        continue;
      }

      // Games (plugin.juego): turned off with .juegos, or outside the group's hours (.horariojuegos). Each game
      // plugin used to check chat.games on its own; here it's stopped once for all of them.
      if (plugin.juego && !chat.games) {
        rechazar(() => client.sendText(m.chat, txt.disabledGames, m));
        continue;
      }

      // Casino (plugin.casino): its own switch, separate from .juegos. Lets you turn off just the betting
      // —roulette, slots, blackjack, duels, races, lottery and markets— leaving the rest running.
      if (plugin.casino && m.isGroup && chat.casino === 0) {
        rechazar(() => client.sendText(m.chat, "🎰 El casino está apagado en este grupo. Un admin lo prende con .casino on", m));
        continue;
      }

      // The .horariojuegos schedule stops ONLY the casino (plugin.casino). The rest of the games —trivia, hangman,
      // flags, canvas, raffles— run at any hour.
      // correspondeAvisar() marks the group as already notified, so it goes inside the notice and not here: if the
      // command ends up running through another plugin, the 10-minute notice isn't spent.
      if (plugin.casino && m.isGroup && !juegosAbiertos(chat)) {
        rechazar(() => (correspondeAvisar(m.chat) ? client.sendText(m.chat, mensajeJuegosCerrados(chat), m) : m.react("🕒")));
        continue;
      }

      // Economy (plugin.economia): with .monedas off (marketplace mode) the UruCoins commands don't run.
      if (plugin.economia && m.isGroup && chat.monedas === 0) {
        rechazar(() => client.sendText(m.chat, txt.disabledEconomy, m));
        continue;
      }

      // Run the command plugin if the command matched one. The use is counted here, once (lib/usos.js): before running,
      // because a command that then fails was still used, and two plugins sharing it are a single use.
      if (!corrioAlguno) registrarUso(m.chat, command);
      corrioAlguno = true;
      await plugin.run(m, { client: this, text, args, command, usedPrefix, groupMetadata, participants, isWaAdmin, isAdmin, isMod, rolBot, isBotAdmin, isOwner, user, chat, botSettings });
    }

    // If no plugin for the command could run, now we say why.
    if (!corrioAlguno && avisarRechazo) await avisarRechazo();
  } catch (e) {
    console.error(e);
  }
}
