import { sintetizar } from "../lib/tts.js";
import { hablar } from "../lib/voz.js";
import { conNombres } from "../lib/menciones.js";
import { esAudio } from "../lib/audios.js";

// Claudia's own voice (lib/voz.js, edge-tts) for a Spanish text when the command is there and the text isn't too long
// for it; Google's, as always, otherwise and for the other languages.
const leer = async (texto, lang, defaultLang) => (lang === defaultLang && (await hablar(texto))) || sintetizar(texto, lang);

const plugin = {};
plugin.cmd = ["tts"];
plugin.botAdmin = true;

plugin.run = async (m, { client, args }) => {
  // Only for text, typed or in the message it replies to. Replying to an audio, someone's voice note, it answered it
  // with an audio of whatever was typed, and with nothing typed asked for a text as if the audio's could be read.
  // esAudio (lib/audios.js) tells a view-once one too.
  if (esAudio(m.quoted)) return client.sendText(m.chat, txt.textToPTTAudio, m);
  const defaultLang = "es";
  // The language is given with "-xx" up front (e.g. .tts -en hello). Any two-letter word ("no", "de", "la", "es")
  // used to be taken as the language, and the audio came out in Norwegian, German or Latin.
  let lang = defaultLang;
  let text = args.join(" ");
  let menciones = m.mentionedJid;
  const marcadorIdioma = (args[0] || "").match(/^-([a-z]{2})$/i);
  if (marcadorIdioma) {
    lang = marcadorIdioma[1].toLowerCase();
    text = args.slice(1).join(" ");
  }
  if (!text && m.quoted?.text) {
    text = m.quoted.text;
    menciones = m.quoted.contextInfo?.mentionedJid;
  }
  // Mentions read out as names, not as the LID digits they carry in the text (lib/menciones.js).
  let res;
  try {
    res = await leer(conNombres(text, menciones, { arroba: false }), lang, defaultLang);
  } catch (e) {
    text = args.join(" ");
    if (!text) return client.sendText(m.chat, txt.textToPTTNull, m);
    await client.sendPresenceUpdate("recording", m.chat);
    res = await leer(conNombres(text, m.mentionedJid, { arroba: false }), defaultLang, defaultLang);
  } finally {
    // No "seconds": Baileys measures the audio. SawBot sent a made-up 9999999999999, which WhatsApp showed as an
    // hour-long voice note for a single word.
    if (res) await client.sendFile(m.chat, res, `textToPTT.mp3`, null, m, true);
  }
};

export default plugin;
