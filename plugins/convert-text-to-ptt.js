import { sintetizar } from "../lib/tts.js";

const plugin = {};
plugin.cmd = ["tts"];
plugin.botAdmin = true;

plugin.run = async (m, { client, args }) => {
  const defaultLang = "es";
  // The language is given with "-xx" up front (e.g. .tts -en hello). Any two-letter word ("no", "de", "la", "es")
  // used to be taken as the language, and the audio came out in Norwegian, German or Latin.
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
    res = await sintetizar(text, lang);
  } catch (e) {
    text = args.join(" ");
    if (!text) return client.sendText(m.chat, txt.textToPTTNull, m);
    await client.sendPresenceUpdate("recording", m.chat);
    res = await sintetizar(text, defaultLang);
  } finally {
    // No "seconds": Baileys measures the audio. SawBot sent a made-up 9999999999999, which WhatsApp showed as an
    // hour-long voice note for a single word.
    if (res) await client.sendFile(m.chat, res, `textToPTT.mp3`, null, m, true);
  }
};

export default plugin;
