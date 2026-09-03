import { updateChat, updateSettings } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["antiestados", "antistatus", "modoadmin", "adminmode", "welcome", "detect", "delete", "antieliminar", "modoadulto", "18", "adultmode", "mentions", "menciones", "bc", "banchat", "autoread", "antiprivate", "antiprivado", "anticall", "audios", "anticanales", "antigrupos", "allantilink", "antilink2", "antitiktok", "antitt", "antitelegram", "antitg", "antiinstagram", "antiig", "reactions", "reacciones", "juegos", "games", "preguntadeldia", "triviarelampago", "recapsemanal"];
plugin.botAdmin = true;

plugin.run = async (m, { client, command, isOwner, isAdmin, chat, botSettings }) => {
  // Mapa de comandos, campo real en DB
  const optionsMap = {
    antiestados: { key: "antiStatus", from: "chat" },
    antistatus: { key: "antiStatus", from: "chat" },
    modoadmin: { key: "adminMode", from: "chat" },
    adminmode: { key: "adminMode", from: "chat" },
    welcome: { key: "welcome", from: "chat" },
    detect: { key: "detect", from: "chat" },
    delete: { key: "antiDelete", from: "chat" },
    antieliminar: { key: "antiDelete", from: "chat" },
    modoadulto: { key: "adultMode", from: "chat" },
    18: { key: "adultMode", from: "chat" },
    adultmode: { key: "adultMode", from: "chat" },
    mentions: { key: "mentions", from: "chat" },
    menciones: { key: "mentions", from: "chat" },
    bc: { key: "isBanned", from: "chat" },
    banchat: { key: "isBanned", from: "chat" },
    autoread: { key: "autoRead", from: "bot" },
    antiprivate: { key: "antiPrivate", from: "bot" },
    antiprivado: { key: "antiPrivate", from: "bot" },
    anticall: { key: "antiCall", from: "bot" },
    audios: { key: "audios", from: "chat" },
    anticanales: { key: "antiChannels", from: "chat" },
    antigrupos: { key: "antiGroups", from: "chat" },
    allantilink: { key: "allAntiLinks", from: "chat" },
    antilink2: { key: "allAntiLinks", from: "chat" },
    antitiktok: { key: "antiTiktok", from: "chat" },
    antitt: { key: "antiTiktok", from: "chat" },
    antitelegram: { key: "antiTelegram", from: "chat" },
    antitg: { key: "antiTelegram", from: "chat" },
    antiinstagram: { key: "antiInstagram", from: "chat" },
    antiig: { key: "antiInstagram", from: "chat" },
    reactions: { key: "reactions", from: "chat" },
    reacciones: { key: "reactions", from: "chat" },
    juegos: { key: "games", from: "chat" },
    games: { key: "games", from: "chat" },
    preguntadeldia: { key: "preguntaDia", from: "chat" },
    triviarelampago: { key: "triviaRelampago", from: "chat" },
    recapsemanal: { key: "recapSemanal", from: "chat" },
  };

  const opcion = optionsMap[command];
  if (!opcion) return;

  const esChat = opcion.from === "chat";
  const esBot = opcion.from === "bot";

  // comprobación de permisos.
  if (esChat && !m.isGroup) {
    return client.sendText(m.chat, txt.onlyGroup, m);
  }

  // comandos que requieren ser owner
  if (["mentions", "menciones", "bc", "banchat", "autoread", "antiprivate", "antiprivado", "anticall"].includes(command)) {
    if (!isOwner) {
      return client.sendMessage(m.chat, { text: txt.onlyOwner }, { quoted: m });
    }
  }
  // Verificacion de admin
  else if (!isAdmin && !isOwner) {
    return client.sendText(m.chat, txt.onlyAdmin, m);
  }

  // actualizar DB
  let nuevoValor;

  if (esChat) {
    nuevoValor = !chat[opcion.key]; // valor actual invertido = nuevo
    updateChat(m.chat, { [opcion.key]: nuevoValor });
  } else if (esBot) {
    nuevoValor = !botSettings[opcion.key];
    updateSettings(client.user.lid, { [opcion.key]: nuevoValor });
  }

  // mensaje de confirmación.
  const estado = nuevoValor ? "Activado" : "Desactivado";
  const nombreComando = command === "18" ? "modoadulto" : command;

  client.sendText(m.chat, `*⚙️ Configuración actualizada*\n\n• Opción: \`${nombreComando}\`\n• Estado: ${estado}`, m);
};

export default plugin;
