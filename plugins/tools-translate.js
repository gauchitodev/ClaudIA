import translate from "@vitalets/google-translate-api";

let plugin = {};
plugin.cmd = ["traducir", "translate"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  // Si no hay texto pero se responde a un mensaje, se traduce el mensaje citado (antes este orden estaba invertido).
  if (!text && m.quoted && m.quoted.text) text = m.quoted.text;
  if (!text) return client.sendText(m.chat, txt.translateNull, m);
  try {
    const result = await translate(`${text}`, { to: "es", autoCorrect: true });
    await client.sendText(m.chat, result.text, m);
  } catch (e) {
    console.log(e);
  }
};

export default plugin;
