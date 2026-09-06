import { smsg } from "./lib/wa-socket.js";
import { elegirAlAzar } from "./lib/azar.js";
import { initDataDB, getUser, getChat, getBotSettings, updateUser, syncUserInfo, esOwner, isCommandBlacklisted } from "./database-functions.js";
import { juegosAbiertos, mensajeJuegosCerrados, correspondeAvisar } from "./lib/horario-juegos.js";
import { permisosDe } from "./lib/roles.js";

// Memoria para guardar la última vez que se saludó por grupo
const cooldownSaludos = new Map();
// Tiempo de espera: 30 minutos (en milisegundos)
const TIEMPO_COOLDOWN = 30 * 60 * 1000; 

// Manejo de mensaje entrante desde msgQueue en main.js
export async function handleMessage(nMsg) {
  if (!nMsg) return;
  this.pushMessage(nMsg).catch(console.error);
  let m = nMsg;
  if (!m) return;

  try {
    m = smsg(this, m) || m;

    // ==========================================
    // 0. FILTRO ANTI-RESACA (Ignorar mensajes viejos)
    // ==========================================
    // messageTimestamp puede venir como número o como Long (protobuf); se normaliza a segundos.
    const crudo = m.messageTimestamp ?? m.timestamp ?? 0;
    const tiempoMensaje = Number(typeof crudo?.toNumber === "function" ? crudo.toNumber() : crudo) || 0;
    // Si el mensaje tiene más de 60 segundos de antigüedad, lo descartamos de una
    if (tiempoMensaje && (Date.now() / 1000) - tiempoMensaje > 60) return;

    // Evitar que el bot responda a mensajes de comandos de cuando estaba offline.
    if (m._upsertType === "append" && globalThis.prefix.find((p) => m.text.startsWith(p))) return;

    // inicializar datos si no existen
    initDataDB(m);
    syncUserInfo(m);

    // Obtención de datos del usuario, el chat, y settings del bot.
    const user = getUser(m.sender, m.chat);
    const chat = getChat(m.chat);
    const botSettings = getBotSettings(client.user.lid);

    // autoRead msg
    if (botSettings.autoRead && m.message) await this.readMessages([m.key]);
    // Usuario silenciado
    if (user.inGroup[m.chat]?.mute && m.message) return m.delete();

    // Obtención de permisos actuales
    const groupMetadata = (m.isGroup ? (client.chats[m.chat] || {}).metadata || (await this.groupMetadata(m.chat).catch((_) => null)) : {}) || {};
    const participants = (m.isGroup ? groupMetadata.participants : []) || [];
    const userSender = (m.isGroup ? participants.find((u) => client.decodeJid(u.id) === m.sender) : {}) || {};
    const bot = (m.isGroup ? participants.find((u) => client.decodeJid(u.id) === client.user.lid) : {}) || {};
    // esOwner acepta @lid o @s.whatsapp.net (resuelve el lid del owner por la base), así el owner se reconoce aunque
    // el mensaje venga solo con su LID.
    const isOwner = m.fromMe || esOwner(m.senderJid) || esOwner(m.sender);
    const isRAdmin = userSender?.admin === "superadmin" || false;
    const isWaAdmin = isRAdmin || userSender?.admin === "admin" || false;
    // Roles del bot por grupo (.adminbot / .moderador): el admin del bot cuenta como admin y el moderador solo como
    // mod. Los admins de WhatsApp y el owner tienen los dos sin necesidad de rol.
    const { rol: rolBot, isAdmin, isMod } = permisosDe(m.chat, m.sender, { esOwner: isOwner, esAdminWhatsApp: isWaAdmin });
    let isBotAdmin = !m.isGroup || bot?.admin || false;

    // Retornar si el mensaje es de baileys para evitar conflictos en mensajes propios del bot.
    if (m.isBaileys) return;

    // antiPrivate
    if (botSettings.antiPrivate && !m.isGroup && !isOwner && m.senderJid !== "18002428478@s.whatsapp.net") return;

    // Extracción de text y argumentos separados.
    let text, args;
    text = m.text || "";
    args = text.trim().split(/\s+/);

    // ==========================================
    // 1. LÓGICA DE SALUDOS CON COOLDOWN
    // ==========================================
    // El saludo se apaga por grupo con .saludos (o .modo compraventa).
    if (m.isGroup && text && chat.saludos !== 0) {
        const regexSaludo = /^(hola+|buenas+|buen día|buenos días|holis|q onda)/i;
        
        if (regexSaludo.test(text.trim())) {
            const ahora = Date.now();
            const ultimoSaludo = cooldownSaludos.get(m.chat) || 0;

            // Si ya pasaron los 30 minutos para ESTE grupo...
            if (ahora - ultimoSaludo > TIEMPO_COOLDOWN) {
                
                // Actualizamos el reloj
                cooldownSaludos.set(m.chat, ahora);

                const respuestas = [
                    "¡Buenas! ¿Todo en orden por acá?",
                    "Holaaa, ¿cómo andamos?",
                    "¡Buenas buenas! ¿Qué se cuenta?",
                    "¡Hola grupo!"
                ];
                const respuestaElegida = elegirAlAzar(respuestas);

                // Mandamos el mensaje citando al que saludó
                await this.sendMessage(m.chat, { text: respuestaElegida }, { quoted: m });
            }
        }
    }
    // ==========================================

    // Ejecutar plugins de tipo 'before'
    for (const pluginName in globalThis.plugins) {
      const plugin = globalThis.plugins[pluginName];
      if (typeof plugin.before === "function") {
        await plugin.before(m, { client: this, text, args, participants, isRAdmin, isWaAdmin, isAdmin, isMod, rolBot, isBotAdmin, isOwner, user, chat, botSettings });
      }
    }

    // verificar banchat
    if (chat.isBanned && !isOwner) return;

    // verificar modoadmin
    if (chat.adminMode && !isOwner && !isMod && m.isGroup) return;

    // verificar si el mensaje comienza con un prefijo válido
    const usedPrefix = globalThis.prefix.find((p) => m.text.startsWith(p));
    if (!usedPrefix) return;

    // usuario baneado del bot
    if (user.banned) {
      if (Date.now() - user.lastmining < 3600000) return;
      this.sendMessage(m.chat, { text: "🚫ESTÁS BANEADO(A)🚫", mentions: [m.sender] }, { quoted: m });
      updateUser(m.sender, { lastmining: Date.now() });
      return;
    }

    // obtener el comando y argumentos
    args = m.text.slice(usedPrefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();
    if (!command) return;
    // ignorar comandos que sean solo puntos
    if (/^\.+$/.test(command)) return;
    text = args.join(" ");

    // Modo blacklist del grupo (.blon + .bladd): los comandos bloqueados no corren para nadie salvo el owner.
    if (chat.blacklistMode && !isOwner && isCommandBlacklisted(m.chat, command)) return m.react("🔒");

    // Verificar si el comando existe en algún plugin
    const matchPlugins = Object.values(globalThis.plugins).filter((plugin) => plugin.cmd && plugin.cmd.includes(command));
    if (matchPlugins.length === 0 && usedPrefix !== "@" && !command.includes("_")) return client.sendText(m.chat, txt.noCommandMatch(command), m);

    // Ejecutar los plugins coincidentes
    for (const plugin of matchPlugins) {
      if (plugin.run) {
        // Verificar si el comando requiere ser OWNER
        if (plugin.onlyOwner && !isOwner) {
          return client.sendText(m.chat, txt.onlyOwner, m);
        }

        // Verificar si el comando requiere grupo
        if (plugin.onlyGroup && !m.isGroup) {
          return client.sendText(m.chat, txt.onlyGroup, m);
        }

        // Verificar si el comando requiere que el bot sea admin
        if (plugin.botAdmin && !isBotAdmin) {
          // La metadata guardada puede estar vieja. Antes de rechazar, consultamos a WhatsApp
          // y, si el bot sí es admin, actualizamos la caché para no volver a consultar.
          const metadataFresca = await this.groupMetadata(m.chat).catch(() => null);
          const botFresco = metadataFresca?.participants?.find((u) => client.decodeJid(u.id) === client.user.lid);
          if (!botFresco?.admin) {
            return client.sendText(m.chat, txt.botAdmin, m);
          }
          client.chats[m.chat] = { ...(client.chats[m.chat] || {}), id: m.chat, subject: metadataFresca.subject, isChats: true, metadata: metadataFresca };
          isBotAdmin = true;
        }

        // Verificar si el comando requiere que el usuario sea admin
        if (plugin.onlyAdmin && !isAdmin) {
          return client.sendText(m.chat, txt.onlyAdmin, m);
        }

        // Verificar si el comando requiere ser moderador del bot (los admins también pasan)
        if (plugin.onlyMod && !isMod) {
          return client.sendText(m.chat, txt.onlyMod, m);
        }

        // Juegos (plugin.juego): apagados con .juegos, o fuera del horario del grupo (.horariojuegos). Antes cada plugin
        // de juego chequeaba chat.games por su cuenta; acá se frena una sola vez para todos.
        if (plugin.juego) {
          if (!chat.games) return client.sendText(m.chat, txt.disabledGames, m);
          if (m.isGroup && !juegosAbiertos(chat)) {
            if (correspondeAvisar(m.chat)) return client.sendText(m.chat, mensajeJuegosCerrados(chat), m);
            return m.react("🕒");
          }
        }

        // Economía (plugin.economia): con .monedas apagado (modo compraventa) los comandos de UruCoins no corren.
        if (plugin.economia && m.isGroup && chat.monedas === 0) return client.sendText(m.chat, txt.disabledEconomy, m);

        // Ejecutar plugin de comando si hubo coincidencia de command con algun plugin.
        await plugin.run(m, { client: this, text, args, command, usedPrefix, groupMetadata, participants, isWaAdmin, isAdmin, isMod, rolBot, isBotAdmin, isOwner, user, chat, botSettings });
      }
    }
  } catch (e) {
    console.error(e);
  }
}
