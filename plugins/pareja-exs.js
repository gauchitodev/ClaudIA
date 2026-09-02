import { getUser } from "../database-functions.js";

let plugin = {};
plugin.cmd = ["ex", "miex", "exs"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who, whoJid, whoLid;
  const numberRegex = /@[0-9]+/g;
  const numberMatches = text.match(numberRegex);

  if (numberMatches && numberMatches.length > 0) {
    who = numberMatches[0].replace("@", "") + "@lid";
  } else if (m.quoted) {
    who = m.quoted.sender;
  } else {
    who = m.sender;
  }

  if (who) {
    who = getUser(who);
  }

  whoLid = who?.lid;
  whoJid = who?.jid;

  if (!whoJid || !whoLid) return client.sendText(m.chat, txt.parejaDefaultWho(usedPrefix, command), m);

  let mensaje = `*Historial de relaciones de @${whoLid.split("@")[0]}:*\n\n`;

  const historialParejas = who?.couplesHistory;

  if (!historialParejas || historialParejas.length === 0) {
    mensaje += "No hay parejas anteriores.\n";
  } else {
    for (const pareja of historialParejas) {
      const parejaData = getUser(pareja);
      const parejaLid = parejaData?.lid;
      if (!parejaData || !parejaLid) continue;
      mensaje += `@${parejaLid.split("@")[0]}\n`;
    }
  }

  const actual = who?.couple;
  const actualData = getUser(actual);
  const actualLid = actualData?.lid;
  const parejaDeActual = actualData?.couple;

  if (actual && actualLid && actualData) {
    if (parejaDeActual === whoJid) {
      mensaje += `\n*Pareja actual:* @${actualLid.split("@")[0]}`;
    } else {
      mensaje += `\n*Pareja actual: no tiene*`;
    }
  } else {
    mensaje += `\n*Pareja actual: no tiene*`;
  }

  await client.sendText(m.chat, mensaje, m);
};

export default plugin;
