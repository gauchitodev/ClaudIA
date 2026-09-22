import { smsg } from "./lib/wa-socket.js";
import { elegirAlAzar } from "./lib/azar.js";
import { initDataDB, getUser, getChat, getBotSettings, updateUser, syncUserInfo, esOwner, isCommandBlacklisted } from "./database-functions.js";
import { juegosAbiertos, mensajeJuegosCerrados, correspondeAvisar } from "./lib/horario-juegos.js";
import { permisosDe } from "./lib/roles.js";
import { metadataDe } from "./lib/cache-grupos.js";

// Keeps the last time each group was greeted
const cooldownSaludos = new Map();
// Cooldown: 30 minutes (in milliseconds)
const TIEMPO_COOLDOWN = 30 * 60 * 1000; 

// Handles an incoming message from msgQueue in main.js
export async function handleMessage(nMsg) {
  if (!nMsg) return;
  this.pushMessage(nMsg).catch(console.error);
  let m = nMsg;
  if (!m) return;

  try {
    m = smsg(this, m) || m;

    // ==========================================
    // 0. HANGOVER FILTER (ignore stale messages)
    // ==========================================
    // messageTimestamp may arrive as a number or as a Long (protobuf); it's normalized to seconds.
    const crudo = m.messageTimestamp ?? m.timestamp ?? 0;
    const tiempoMensaje = Number(typeof crudo?.toNumber === "function" ? crudo.toNumber() : crudo) || 0;
    // If the message is more than 60 seconds old, drop it right away
    if (tiempoMensaje && (Date.now() / 1000) - tiempoMensaje > 60) return;

    // Keeps the bot from answering command messages from while it was offline.
    if (m._upsertType === "append" && globalThis.prefix.find((p) => m.text.startsWith(p))) return;

    // initialize data if it doesn't exist yet
    initDataDB(m);
    syncUserInfo(m);

    // Fetch the user's data, the chat's, and the bot settings.
    const user = getUser(m.sender, m.chat);
    const chat = getChat(m.chat);
    const botSettings = getBotSettings(client.user.lid);

    // autoRead msg
    if (botSettings.autoRead && m.message) await this.readMessages([m.key]);
    // Muted user
    if (user.inGroup[m.chat]?.mute && m.message) return m.delete();

    // Current permissions
    const groupMetadata = (m.isGroup ? await metadataDe(this, m.chat) : {}) || {};
    const participants = (m.isGroup ? groupMetadata.participants : []) || [];
    const userSender = (m.isGroup ? participants.find((u) => client.decodeJid(u.id) === m.sender) : {}) || {};
    const bot = (m.isGroup ? participants.find((u) => client.decodeJid(u.id) === client.user.lid) : {}) || {};
    // esOwner takes @lid or @s.whatsapp.net (it resolves the owner's lid through the database), so the owner is
    // recognized even when the message only carries their LID.
    const isOwner = m.fromMe || esOwner(m.senderJid) || esOwner(m.sender);
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

    // ==========================================
    // 1. GREETINGS, WITH A COOLDOWN
    // ==========================================
    // Greetings are turned off per group with .saludos (or .modo compraventa).
    if (m.isGroup && text && chat.saludos !== 0) {
        const regexSaludo = /^(hola+|buenas+|buen día|buenos días|holis|q onda)/i;
        
        if (regexSaludo.test(text.trim())) {
            const ahora = Date.now();
            const ultimoSaludo = cooldownSaludos.get(m.chat) || 0;

            // If the 30 minutes are up for THIS group...
            if (ahora - ultimoSaludo > TIEMPO_COOLDOWN) {
                
                // Reset the clock
                cooldownSaludos.set(m.chat, ahora);

                const respuestas = [
                    "¡Buenas! ¿Todo en orden por acá?",
                    "Holaaa, ¿cómo andamos?",
                    "¡Buenas buenas! ¿Qué se cuenta?",
                    "¡Hola grupo!"
                ];
                const respuestaElegida = elegirAlAzar(respuestas);

                // Reply quoting whoever said hello
                await this.sendMessage(m.chat, { text: respuestaElegida }, { quoted: m });
            }
        }
    }
    // ==========================================

    // Run the 'before' plugins
    for (const pluginName in globalThis.plugins) {
      const plugin = globalThis.plugins[pluginName];
      if (typeof plugin.before === "function") {
        await plugin.before(m, { client: this, text, args, participants, isRAdmin, isWaAdmin, isAdmin, isMod, rolBot, isBotAdmin, isOwner, user, chat, botSettings });
      }
    }

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
        const botFresco = metadataFresca?.participants?.find((u) => client.decodeJid(u.id) === client.user.lid);
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

      // Run the command plugin if the command matched one.
      corrioAlguno = true;
      await plugin.run(m, { client: this, text, args, command, usedPrefix, groupMetadata, participants, isWaAdmin, isAdmin, isMod, rolBot, isBotAdmin, isOwner, user, chat, botSettings });
    }

    // If no plugin for the command could run, now we say why.
    if (!corrioAlguno && avisarRechazo) await avisarRechazo();
  } catch (e) {
    console.error(e);
  }
}
