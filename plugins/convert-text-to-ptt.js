import gtts from "node-gtts";
import { readFileSync, unlinkSync } from "fs";
import { join } from "path";

let plugin = {};
plugin.cmd = ["tts"];
plugin.botAdmin = true;

plugin.run = async (m, { client, args }) => {
  const defaultLang = "es";
  // El idioma se indica con "-xx" al principio (ej: .tts -en hello). Antes cualquier palabra de dos letras
  // ("no", "de", "la", "es") se tomaba como idioma y el audio salía en noruego, alemán o latín.
  let lang = defaultLang;
  let text = args.join(" ");
  const marcadorIdioma = (args[0] || "").match(/^-([a-z]{2})$/i);
  if (marcadorIdioma) {
    lang = marcadorIdioma[1].toLowerCase();
    text = args.slice(1).join(" ");
  }
  if (!text && m.quoted?.text) text = m.quoted.text;
  let res;
  try {
    res = await tts(text, lang);
  } catch (e) {
    text = args.join(" ");
    if (!text) return client.sendText(m.chat, txt.textToPTTNull, m);
    await client.sendPresenceUpdate("recording", m.chat);
    res = await tts(text, defaultLang);
  } finally {
    if (res) await client.sendFile(m.chat, res, `textToPTT.mp3`, null, m, true, { seconds: "9999999999999" });
  }
};

export default plugin;

function tts(text, lang = "es") {
  return new Promise((resolve, reject) => {
    try {
      let tts = gtts(lang);
      let filePath = join("./tmp", Date.now() + ".wav");
      tts.save(filePath, text, (err) => {
        if (err) return reject(err);
        try {
          const audio = readFileSync(filePath);
          unlinkSync(filePath);
          resolve(audio);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}
