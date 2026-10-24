import { updateChat, updateSettings } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["antiestados", "antistatus", "modoadmin", "adminmode", "welcome", "detect", "delete", "antieliminar", "modoadulto", "18", "adultmode", "mentions", "menciones", "bc", "banchat", "autoread", "antiprivate", "antiprivado", "anticall", "audios", "anticanales", "antigrupos", "allantilink", "antilink2", "antitiktok", "antitt", "antitelegram", "antitg", "antiinstagram", "antiig", "antiubicacion", "antiubicación", "reactions", "reacciones", "juegos", "games", "preguntadeldia", "triviarelampago", "recapsemanal", "charla", "saludos", "monedas", "ascensos", "casino"];
plugin.botAdmin = true;

// The same words .iniciativa takes.
const PRENDER = new Set(["on", "prender", "activar", "si", "sí"]);
const APAGAR = new Set(["off", "apagar", "desactivar", "no"]);

plugin.run = async (m, { client, command, args = [], usedPrefix = ".", isOwner, isAdmin, chat, botSettings }) => {
  // Command map, with the real DB field
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
    antiubicacion: { key: "antiLiveLocation", from: "chat" },
    antiubicación: { key: "antiLiveLocation", from: "chat" },
    reactions: { key: "reactions", from: "chat" },
    reacciones: { key: "reactions", from: "chat" },
    juegos: { key: "games", from: "chat" },
    games: { key: "games", from: "chat" },
    preguntadeldia: { key: "preguntaDia", from: "chat" },
    triviarelampago: { key: "triviaRelampago", from: "chat" },
    casino: { key: "casino", from: "chat" },
    recapsemanal: { key: "recapSemanal", from: "chat" },
    // marketplace mode switches: Claudia's automatic chat, the automatic greeting, the UruCoins economy and promotion notices
    charla: { key: "charla", from: "chat" },
    saludos: { key: "saludos", from: "chat" },
    monedas: { key: "monedas", from: "chat" },
    ascensos: { key: "ascensos", from: "chat" },
  };

  const opcion = optionsMap[command];
  if (!opcion) return;

  const esChat = opcion.from === "chat";
  const esBot = opcion.from === "bot";

  // permission check.
  if (esChat && !m.isGroup) {
    return client.sendText(m.chat, txt.onlyGroup, m);
  }

  // commands that require being the owner
  if (["mentions", "menciones", "bc", "banchat", "autoread", "antiprivate", "antiprivado", "anticall"].includes(command)) {
    if (!isOwner) {
      return client.sendMessage(m.chat, { text: txt.onlyOwner }, { quoted: m });
    }
  }
  // admin check
  else if (!isAdmin && !isOwner) {
    return client.sendText(m.chat, txt.onlyAdmin, m);
  }

  // "on" / "off" set the switch, and nothing after the command flips it. It used to flip whatever came after, so
  // ".casino on" with the casino already on switched it off — and on/off is how the README, Claudia's manual and the
  // casino's own notice (handle-message.js) tell people to use it. Any other word touches nothing: ".bc hola" used to
  // ban the chat.
  const nombreComando = command === "18" ? "modoadulto" : command;
  const pedido = (args[0] || "").toLowerCase();
  if (pedido && !PRENDER.has(pedido) && !APAGAR.has(pedido)) {
    return client.sendText(m.chat, `Usá ${usedPrefix}${nombreComando} on o ${usedPrefix}${nombreComando} off (sin nada, lo invierte).`, m);
  }

  // actualizar DB
  const actual = Boolean(esChat ? chat[opcion.key] : botSettings[opcion.key]);
  const nuevoValor = PRENDER.has(pedido) ? true : APAGAR.has(pedido) ? false : !actual;

  if (nuevoValor !== actual) {
    if (esChat) updateChat(m.chat, { [opcion.key]: nuevoValor });
    else if (esBot) updateSettings(client.user.lid, { [opcion.key]: nuevoValor });
  }

  // confirmation message.
  const estado = nuevoValor ? "Activado" : "Desactivado";

  client.sendText(m.chat, `*⚙️ Configuración actualizada*\n\n• Opción: \`${nombreComando}\`\n• Estado: ${estado}${nuevoValor === actual ? " (ya estaba así)" : ""}`, m);
};

export default plugin;
