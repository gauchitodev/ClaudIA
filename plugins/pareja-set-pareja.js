import { getUser, updateUser } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["setpareja"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text }) => {
  let persona1;
  let persona2;

  const numberRegex = /@[0-9]+/g;
  const numberMatches = text.match(numberRegex);
  const phoneMatches = text.match(/\+\d[\d\s]*/g);
  if (phoneMatches && phoneMatches.length >= 2) {
    persona1 = `${phoneMatches[0].replace(/\+|\s+/g, "")}@s.whatsapp.net`;
    persona2 = `${phoneMatches[1].replace(/\+|\s+/g, "")}@s.whatsapp.net`;
  } else if (numberMatches && numberMatches.length >= 2) {
    persona1 = `${numberMatches[0].replace("@", "")}@lid`;
    persona2 = `${numberMatches[1].replace("@", "")}@lid`;
  }

  if (persona1) {
    persona1 = getUser(persona1);
  }

  if (persona2) {
    persona2 = getUser(persona2);
  }

  const persona1Lid = persona1?.lid;
  const persona2Lid = persona2?.lid;
  const persona1Jid = persona1?.jid;
  const persona2Jid = persona2?.jid;

  if (!persona1Lid || !persona1Jid || !persona2Lid || !persona2Jid)
    return client.sendText(
      m.chat,
      `❌ No se pudieron obtener los dos usuarios.

Puede que:
• No hayas mencionado correctamente a ambos.
• Uno de los usuarios no exista en la base de datos.
• Alguno aún no haya hablado con el bot.

Ejemplo válido:
+59899999999 +59898888888
`,
      m
    );

  const convertToMilliseconds = (timeText) => {
    let totalMilliseconds = 0;
    const regex = /(\d+)\s*(días?|dia?s?|horas?|hora?s?|minutos?|minuto?s?|segundos?|segundo?s?)/g;
    for (const match of timeText.matchAll(regex)) {
      const value = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      if (unit === "días" || unit === "dia" || unit === "día" || unit === "dias") {
        totalMilliseconds += value * 24 * 60 * 60 * 1000;
      } else if (unit === "horas" || unit === "hora") {
        totalMilliseconds += value * 60 * 60 * 1000;
      } else if (unit === "minutos" || unit === "minuto") {
        totalMilliseconds += value * 60 * 1000;
      } else if (unit === "segundos" || unit === "segundo") {
        totalMilliseconds += value * 1000;
      }
    }
    return totalMilliseconds;
  };

  const parts = text.split("|");
  let time;

  if (parts.length < 2) {
    time = 1000;
  } else {
    const timeText = parts[1].trim();
    time = convertToMilliseconds(timeText);

    if (time === 0) {
      return client.sendText(m.chat, "Formato de tiempo incorrecto. Asegúrate de usar días, horas o minutos válidos.", m);
    }
  }

  // si anteriormente fueron pareja, limpiar historial
  const oldHistory1 = Array.isArray(persona1.couplesHistory) ? persona1.couplesHistory : [];
  const oldHistory2 = Array.isArray(persona2.couplesHistory) ? persona2.couplesHistory : [];
  const esParejaAntigua = oldHistory1.includes(persona2Jid);
  const newHistory1 = esParejaAntigua ? oldHistory1.filter((id) => id !== persona2Jid) : oldHistory1;

  const newHistory2 = esParejaAntigua ? oldHistory2.filter((id) => id !== persona1Jid) : oldHistory2;

  // actualizar ambos usuarios en db
  updateUser(persona1Lid, { couplesHistory: JSON.stringify(newHistory1), couple: persona2Jid, coupleTime: Date.now() - time });
  updateUser(persona2Lid, { couplesHistory: JSON.stringify(newHistory2), couple: persona1Jid, coupleTime: Date.now() - time });

  const kz = await client.sendText(m.chat, txt.parejaAccept(persona1Lid, persona2Lid), m);
  client.sendMessage(m.chat, { react: { text: "❤️", key: kz.key } });
};

export default plugin;
