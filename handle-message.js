import { smsg } from "./lib/wa-socket.js";
import { initDataDB, getUser, getChat, getBotSettings, updateUser, syncUserInfo } from "./database-functions.js";

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
    const tiempoMensaje = m.messageTimestamp || m.timestamp || 0;
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
    if (botSettings.autoRead) await this.readMessages([m.key]);
    // Usuario silenciado
    if (user.inGroup[m.chat]?.mute) return m.delete();

    // Obtención de permisos actuales
    const groupMetadata = (m.isGroup ? (client.chats[m.chat] || {}).metadata || (await this.groupMetadata(m.chat).catch((_) => null)) : {}) || {};
    const participants = (m.isGroup ? groupMetadata.participants : []) || [];
    const userSender = (m.isGroup ? participants.find((u) => client.decodeJid(u.id) === m.sender) : {}) || {};
    const bot = (m.isGroup ? participants.find((u) => client.decodeJid(u.id) == client.user.lid) : {}) || {};
    const isOwner = [...globalThis.owners.map((number) => number.replace(/[^0-9]/g, "") + "@s.whatsapp.net")].includes(m.senderJid) || m.fromMe;
    const isRAdmin = userSender?.admin == "superadmin" || false;
    const isAdmin = isOwner || isRAdmin || userSender?.admin == "admin" || false;
    const isBotAdmin = !m.isGroup || bot?.admin || false;

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
    if (m.isGroup && text) {
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
                const respuestaElegida = respuestas[Math.floor(Math.random() * respuestas.length)];

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
        await plugin.before(m, { client: this, text, args, participants, isRAdmin, isAdmin, isBotAdmin, isOwner, user, chat, botSettings });
      }
    }

    // verificar banchat
    if (chat.isBanned && !isOwner) return;

    // verificar modoadmin
    if (chat.adminMode && !isOwner && !isAdmin && m.isGroup) return;

    // verificar si el mensaje comienza con un prefijo válido
    const usedPrefix = globalThis.prefix.find((p) => m.text.startsWith(p));
    if (!usedPrefix) return;

    // usuario baneado del bot
    if (user.banned) {
      if (new Date() - user.lastmining < 3600000) return;
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
          return client.sendText(m.chat, txt.botAdmin, m);
        }

        // Verificar si el comando requiere que el usuario sea admin
        if (plugin.onlyAdmin && !isAdmin) {
          return client.sendText(m.chat, txt.onlyAdmin, m);
        }

        // Ejecutar plugin de comando si hubo coincidencia de command con algun plugin.
        await plugin.run(m, { client: this, text, args, command, usedPrefix, groupMetadata, participants, isAdmin, isBotAdmin, isOwner, user, chat, botSettings });
      }
    }
  } catch (e) {
    console.error(e);
  }
}
