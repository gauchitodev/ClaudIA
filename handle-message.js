import { smsg } from "./lib/wa-socket.js";
import { elegirAlAzar } from "./lib/azar.js";
import { initDataDB, getUser, getChat, getBotSettings, updateUser, syncUserInfo, isCommandBlacklisted } from "./database-functions.js";
import { juegosAbiertos, mensajeJuegosCerrados, correspondeAvisar } from "./lib/horario-juegos.js";
import { juegoApagadoPara, correspondeAvisarApagado, textoJuegoApagado } from "./lib/juegos-apagados.js";
import { CASINO_APAGADO } from "./lib/casino.js";
import { parsearComando, pareceComando, esComando } from "./lib/comandos.js";
import { permisosDe } from "./lib/roles.js";
import { metadataDe } from "./lib/cache-grupos.js";
import { atrasoDeLlegada } from "./lib/tiempo.js";
import { registrarUso } from "./lib/usos.js";
import { hooksEnOrden } from "./load-functions.js";
import { buscarEnGrupo, identidadesDe, esOwnerConfirmado } from "./lib/identidad.js";
import { anotarPresencia, anotarCierreDe } from "./lib/inactivos.js";
import { guardarAtrasado, aplicarAMemoria } from "./lib/memoria-corta.js";
import txt from "./lib/strings.js";

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

// A command stays outside .modoadmin when every plugin that answers to it says so: one that shares the command and
// doesn't say so isn't let through along with it.
function fueraDelModoAdmin(command) {
  const suyos = Object.values(globalThis.plugins).filter((plugin) => plugin.cmd && plugin.cmd.includes(command));
  return suyos.length > 0 && suyos.every((plugin) => plugin.fueraDelModoAdmin);
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
    // It's still a sign of life for .inactivos (anotarPresencia), like the two cuts below, and part of what was said:
    // it goes into Claudia's memory where it was said, for .resumen, unless the moderation would have deleted it
    // (guardarAtrasado, lib/memoria-corta.js).
    if (atrasoDeLlegada(m) > 60) {
      guardarAtrasado(m);
      return anotarPresencia(m, { antesDelNumero: true });
    }

    // Keeps the bot from answering command messages from while it was offline. Into the memory, as the command it was.
    // A command as the dispatcher tells it below (lib/comandos.js): "@Juan, ¿venís?" from back then is chat.
    if (m._upsertType === "append" && esComando(m.text)) {
      guardarAtrasado(m);
      return anotarPresencia(m, { antesDelNumero: true });
    }

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
    const botSettings = getBotSettings(this.user.lid);

    // autoRead msg
    if (botSettings.autoRead && m.message) await this.readMessages([m.key]);
    // Muted user. What they take back still leaves Claudia's memory: muted after writing, their deletion never got
    // there, since no hook sees their messages.
    if (user.inGroup[m.chat]?.mute && m.message) {
      anotarPresencia(m);
      try {
        aplicarAMemoria(m, { guardar: false });
      } catch (e) {
        console.error("[memoria corta] ERROR:", e); // the deletion below goes out all the same
      }
      return m.delete();
    }

    // Current permissions
    const groupMetadata = (m.isGroup ? await metadataDe(this, m.chat) : {}) || {};
    const participants = (m.isGroup ? groupMetadata.participants : []) || [];
    // Whoever wrote, and the bot, by either identity (lib/identidad.js): a group that lists people by number names them
    // by it, and the message may bring their LID.
    const userSender = (m.isGroup ? identidadesDe([m.sender, m.senderJid], participants).participante : {}) || {};
    const bot = (m.isGroup ? buscarEnGrupo(participants, { lid: this.user.lid, jid: this.user.jid }) : {}) || {};
    // By the number the message brings, or by the LID WhatsApp says has an owner's number (lib/identidad.js), so the
    // owner is recognized when the message only carries their LID, and nobody else is for having the number on a row.
    const isOwner = m.fromMe || esOwnerConfirmado([m.senderJid, m.sender]);
    const isRAdmin = userSender?.admin === "superadmin" || false;
    const isWaAdmin = isRAdmin || userSender?.admin === "admin" || false;
    // Per-group bot roles (.adminbot / .moderador): the bot admin counts as admin and the moderator only as mod.
    // WhatsApp admins and the owner get both without needing a role.
    const { rol: rolBot, isAdmin, isMod } = permisosDe(m.chat, m.sender, { esOwner: isOwner, esAdminWhatsApp: isWaAdmin, participants });
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

    // The command, read the same way as everywhere else (lib/comandos.js): a prefix with the name right against it.
    // What isn't one stops here, before admin mode and the banned notice: ". hola" and "...pero bueno" are someone
    // talking, and they got "that command doesn't exist" (a banned person, the banned notice). "@59899… vení" is a
    // mention unless a plugin declares the word, and a name that doesn't look like a command (".5 kilos") isn't one.
    const pedido = parsearComando(m.text);
    if (!pedido) return;
    const usedPrefix = pedido.prefijo;
    const command = pedido.comando;
    args = pedido.args;
    text = pedido.texto;
    // The text after the command as it was typed, line breaks included, for the ones that send or keep free text.
    const { textoCompleto } = pedido;
    const matchPlugins = Object.values(globalThis.plugins).filter((plugin) => plugin.cmd && plugin.cmd.includes(command));
    if (matchPlugins.length === 0 && (usedPrefix === "@" || !pareceComando(command))) return;

    // Admin mode: the bot is for the owner, the admins and the mods, but for the commands that stay outside it
    // (fueraDelModoAdmin). .notagall and .sitagall are a preference about oneself: with the mode on, nobody else could
    // get out of the calls to everyone, nor back in.
    if (chat.adminMode && !isOwner && !isMod && m.isGroup && !fueraDelModoAdmin(command)) return;

    // user banned from the bot
    if (user.banned) {
      if (Date.now() - user.lastmining < 3600000) return;
      this.sendMessage(m.chat, { text: "🚫ESTÁS BANEADO(A)🚫", mentions: [m.sender] }, { quoted: m });
      updateUser(m.sender, { lastmining: Date.now() });
      return;
    }

    // Group blacklist mode (.blon + .bladd): blocked commands run for nobody except the owner.
    if (chat.blacklistMode && !isOwner && isCommandBlacklisted(m.chat, command)) return m.react("🔒");

    // A name that looks like a command, after "." or "/", that no plugin declares.
    if (matchPlugins.length === 0) return this.sendText(m.chat, txt.noCommandMatch(command), m);

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
        rechazar(() => this.sendText(m.chat, txt.onlyOwner, m));
        continue;
      }

      // Check whether the command requires a group
      if (plugin.onlyGroup && !m.isGroup) {
        rechazar(() => this.sendText(m.chat, txt.onlyGroup, m));
        continue;
      }

      // Check whether the command requires the bot to be admin
      if (plugin.botAdmin && !isBotAdmin) {
        // The stored metadata may be stale. Before rejecting, ask WhatsApp; the cache keeps the answer, so the
        // next command doesn't ask again.
        const metadataFresca = await metadataDe(this, m.chat, { fresca: true });
        const botFresco = buscarEnGrupo(metadataFresca?.participants, { lid: this.user.lid, jid: this.user.jid });
        if (!botFresco?.admin) {
          rechazar(() => this.sendText(m.chat, txt.botAdmin, m));
          continue;
        }
        isBotAdmin = true;
      }

      // Check whether the command requires the user to be admin
      if (plugin.onlyAdmin && !isAdmin) {
        rechazar(() => this.sendText(m.chat, txt.onlyAdmin, m));
        continue;
      }

      // Check whether the command requires being a bot moderator (admins pass too)
      if (plugin.onlyMod && !isMod) {
        rechazar(() => this.sendText(m.chat, txt.onlyMod, m));
        continue;
      }

      // Games (plugin.juego): turned off with .juegos. Each game plugin used to check chat.games on its own; here it's
      // stopped once for all of them.
      if (plugin.juego && !chat.games) {
        rechazar(() => this.sendText(m.chat, txt.disabledGames, m));
        continue;
      }

      // Casino (plugin.casino): its own switch, separate from .juegos. Lets you turn off just the betting —roulette,
      // slots, blackjack, poker, duels, races, lottery, markets and the 4 en línea's bets— leaving the rest running.
      if (plugin.casino && m.isGroup && chat.casino === 0) {
        rechazar(() => this.sendText(m.chat, CASINO_APAGADO, m));
        continue;
      }

      // One game switched off here (.juego mines off, lib/juegos-apagados.js): only what starts it, by the command
      // typed, so a game going on is played out through its moves and exits, which are other commands. After the
      // group-wide switches, which say more, and before the hours, whose notice promises an opening time. The notice
      // goes out once every 10 minutes per group and game; it's decided inside the deferred rejection, as the hours'.
      if ((plugin.juego || plugin.casino) && m.isGroup) {
        const apagado = juegoApagadoPara(chat, command, args);
        if (apagado) {
          rechazar(() => (correspondeAvisarApagado(m.chat, apagado.clave) ? this.sendText(m.chat, textoJuegoApagado(apagado, usedPrefix), m) : m.react("⛔")));
          continue;
        }
      }

      // The .horariojuegos schedule stops the casino (plugin.casino) and the board games (plugin.conHorario: the
      // tic-tac-toe and the 4 en línea). It stops starting one: their moves are plain messages that their hooks take,
      // so a game already going is played out, and cancelling and giving up live in plugins of their own. The rest of
      // the games —trivia, hangman, flags, canvas, raffles— run at any hour. Plugins that are a casino only sometimes
      // (a .4enlinea with a bet) check the same switches with frenoDelCasino (lib/casino.js).
      // correspondeAvisar() marks the group as already notified, so it goes inside the notice and not here: if the
      // command ends up running through another plugin, the 10-minute notice isn't spent.
      if ((plugin.casino || plugin.conHorario) && m.isGroup && !juegosAbiertos(chat)) {
        rechazar(() => (correspondeAvisar(m.chat) ? this.sendText(m.chat, mensajeJuegosCerrados(chat), m) : m.react("🕒")));
        continue;
      }

      // Economy (plugin.economia): with .monedas off (marketplace mode) the UruCoins commands don't run.
      if (plugin.economia && m.isGroup && chat.monedas === 0) {
        rechazar(() => this.sendText(m.chat, txt.disabledEconomy, m));
        continue;
      }

      // Run the command plugin if the command matched one. The use is counted here, once (lib/usos.js): before running,
      // because a command that then fails was still used, and two plugins sharing it are a single use.
      if (!corrioAlguno) registrarUso(m.chat, command);
      corrioAlguno = true;
      await plugin.run(m, { client: this, text, textoCompleto, args, command, usedPrefix, groupMetadata, participants, isWaAdmin, isAdmin, isMod, rolBot, isBotAdmin, isOwner, user, chat, botSettings });
    }

    // If no plugin for the command could run, now we say why.
    if (!corrioAlguno && avisarRechazo) await avisarRechazo();
  } catch (e) {
    console.error(e);
  }
}
