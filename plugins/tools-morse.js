// .morse: a text in Morse code, the one typed or the one of the message it answers. What's in Morse already (dots,
// dashes, spaces and the slashes between words, nothing else) goes back to text instead: answering a message in Morse
// with .morse is the first thing anyone tries. .tmorse (or .traducirmorse) only reads. Letters go apart by a space and
// words by " / ", and lines stay lines.
import { conNombres, sinMenciones } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["morse", "tmorse", "traducirmorse"];
plugin.convertidores = true;
plugin.botAdmin = true;

// The text's limit counts characters as people see them, an emoji being one, as .qr's does. The code's is what .morse
// makes of that many at most: the longest code, the "$", has 7 signs, and a space goes after each. At 500 as well, the
// code of a 259-character text was too long to be read back.
export const MORSE = { MAX_CARACTERES: 500, MAX_CODIGO: 500 * 8 };

// Letters, figures and signs as Recommendation ITU-R M.1677-1 gives them, and the Ñ, "!", "&", ";", "_" and "$",
// which aren't in it, as they're commonly sent (Wikipedia's "Morse code"). The "¿" and "¡" had codes no source gives,
// which other readers wouldn't know: they're left out, without a notice, as the closing "?" and "!" say it.
const CODIGOS = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
  N: "-.", Ñ: "--.--", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..",
  0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.",
  ".": ".-.-.-", ",": "--..--", ":": "---...", "?": "..--..", "'": ".----.", "-": "-....-", "/": "-..-.", "(": "-.--.",
  ")": "-.--.-", '"': ".-..-.", "=": "-...-", "+": ".-.-.", "@": ".--.-.",
  "!": "-.-.--", "&": ".-...", ";": "-.-.-.", _: "..--.-", $: "...-..-",
};
// And back. "...---..." is SOS keyed as one sign, with no gaps between its letters, the way it's sent.
const LETRAS = { ...Object.fromEntries(Object.entries(CODIGOS).map(([letra, codigo]) => [codigo, letra])), "...---...": "SOS" };

const GRAFEMAS = new Intl.Segmenter("es", { granularity: "grapheme" });
const caracteres = (texto) => Array.from(GRAFEMAS.segment(texto), ({ segment }) => segment);

// A character as the letters of the table: upper case, without accents or other marks but the Ñ's tilde (NFD gives
// the Ñ as an N and a combining tilde, as some keyboards type it, and they're put back together before the marks go),
// and with the signs a phone's keyboard writes (“” «» ’ – ×) as the table has them: the ITU's own gives the quotes
// curly and the hyphen as a dash, and says to send an X for the multiplication sign. The Ñ used to be set aside as a
// "\u0001" while the accents went, and a text with one had an Ñ there; typed as an N and a tilde, it was an N.
const aLetras = (c) =>
  c
    .toUpperCase()
    .normalize("NFD")
    .replace(/N\u0303/g, "Ñ")
    .replace(/\p{M}/gu, "")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/×/g, "X");

// What has no code and isn't worth a notice: the "¿" and "¡", and what can't be seen (a zero-width space, a direction
// mark, a lone variation selector). The rest goes on the notice as it was written, an emoji whole: split by code
// points, a family was three people and an invisible joiner, a flag two letters and a skin tone a square of color.
const SIN_AVISO = /^(?:[¿¡]|[\p{Cc}\p{Cf}\p{M}]+)$/u;

// A text in Morse, and what it left out for having no code.
export function aMorse(texto) {
  const sinCodigo = new Set();
  const codigoDe = (c) => {
    const letras = [...aLetras(c)];
    if (letras.length && letras.every((letra) => CODIGOS[letra])) return letras.map((letra) => CODIGOS[letra]).join(" ");
    if (!SIN_AVISO.test(c)) sinCodigo.add(c);
    return "";
  };
  const lineas = String(texto ?? "")
    .split("\n")
    .map((linea) =>
      linea
        .split(/\s+/)
        .map((palabra) => caracteres(palabra).map(codigoDe).filter(Boolean).join(" "))
        .filter(Boolean)
        .join(" / "),
    )
    .filter(Boolean);
  return { morse: lineas.join("\n"), sinCodigo: [...sinCodigo] };
}

// Dots and dashes as other keyboards and pages write them (· • ∙ ⋅, the hyphens and dashes from ‐ to ― and the
// minus −, and the _), and the ellipsis, one character, as its three dots. A long dash (— –) is one, as some pages
// write each. An iPhone's keyboard, though, can turn two or three hyphens in a row into one (Smart Punctuation, on
// by default), and how many they were is lost: the answer says so (RAYA_LARGA).
const aSignos = (texto) =>
  String(texto ?? "")
    .replace(/…/g, "...")
    .replace(/[\u00B7\u2022\u2219\u22C5]/g, ".")
    .replace(/[\u2010-\u2015\u2212_]/g, "-");
const RAYA_LARGA = /[—–]/;

// Whether a text is in Morse already: signs, spaces and the slashes between words, and nothing else.
const esMorse = (texto) => /^[.\-/|\s]+$/.test(aSignos(texto)) && /[.-]/.test(aSignos(texto));

// Code back into text. Words go apart by " / " or " | ", or, with neither, by two spaces or more; lines stay lines,
// and a slash at either end of one is nothing. What isn't a code it knows, or isn't dots and dashes, is a "?", and
// goes on the list: it used to be left out, while the notice said it had been put as "?". "reconocidos" counts the
// codes it knew, a "?" among them: the "?" it put used to be taken out to see whether anything was left, and the
// real one went with them, so a "..--.." alone wasn't understood.
export function deMorse(morse) {
  const normal = aSignos(morse);
  const separador = /[/|]/.test(normal) ? /\s*[/|]\s*/ : /\s{2,}/;
  const invalidos = new Set();
  let reconocidos = 0;
  const letraDe = (codigo) => {
    const letra = /^[.-]+$/.test(codigo) ? LETRAS[codigo] : undefined;
    if (!letra) {
      invalidos.add(codigo);
      return "?";
    }
    reconocidos++;
    return letra;
  };
  const lineas = normal
    .split("\n")
    .map((linea) =>
      linea
        .split(separador)
        .map((palabra) => palabra.split(/\s+/).filter(Boolean).map(letraDe).join(""))
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);
  return { texto: lineas.join("\n"), invalidos: [...invalidos], reconocidos };
}

// What its answers start with. Read back (.morse or .tmorse answering one of them), an answer goes without its mark
// and without what follows its first blank line, the notices; neither has blank lines of its own. The 📡 was a code
// it didn't know, the words of a notice made the code "not Morse", and .morse put the 🔤 on its notice.
const MARCA = { CODIGO: "📡", TEXTO: "🔤" };
const DE_UNA_RESPUESTA = new RegExp(`^\\s*(?:${MARCA.CODIGO}|${MARCA.TEXTO})\\s*`, "u");
const sinMarcas = (texto) => (DE_UNA_RESPUESTA.test(texto) ? texto.replace(DE_UNA_RESPUESTA, "").split("\n\n")[0] : texto);

async function escribir(m, client, texto) {
  const largo = caracteres(texto).length;
  if (largo > MORSE.MAX_CARACTERES) return client.sendText(m.chat, `Es muy largo: hasta ${MORSE.MAX_CARACTERES} caracteres (el tuyo tiene ${largo}).`, m);
  const { morse, sinCodigo } = aMorse(texto);
  if (!morse) return client.sendText(m.chat, "No encontré nada que se pueda pasar a morse (solo letras, números y algunos signos).", m);
  const aviso = sinCodigo.length ? `\n\n⚠️ Sin código en morse, los salteé: ${sinCodigo.join(" ")}` : "";
  return client.sendText(m.chat, `${MARCA.CODIGO} ${morse}${aviso}`, m);
}

async function leer(m, client, texto) {
  if (/[\p{L}\p{N}]/u.test(texto)) return client.sendText(m.chat, "Eso no parece morse: tiene que tener solo puntos, rayas y espacios (y / entre palabras).", m);
  const largo = caracteres(texto).length;
  if (largo > MORSE.MAX_CODIGO) return client.sendText(m.chat, `Es muy largo: hasta ${MORSE.MAX_CODIGO} caracteres de código (el tuyo tiene ${largo}).`, m);
  const { texto: leido, invalidos, reconocidos } = deMorse(texto);
  if (!reconocidos) return client.sendText(m.chat, "No pude entender ese código. Revisá que sean solo puntos y rayas separados por espacios.", m);
  const avisos = [];
  if (invalidos.length) avisos.push(`⚠️ Códigos que no conozco (puestos como ?): ${invalidos.join(" ")}`);
  if (RAYA_LARGA.test(texto)) {
    avisos.push("⚠️ Si lo escribiste en un iPhone: el teclado puede cambiar dos o tres guiones seguidos por una raya larga (—), y no sé cuántos eran. Escribí las rayas con _ (guion bajo).");
  }
  // sendText turns every "@<digits>" into a mention (parseMention, lib/wa-socket.js): the code of an "@" and the
  // digits of someone's LID had Claudia tag them, as many as the code named. A LID the bot knows goes as the name,
  // other digits without the "@" (sinMenciones, lib/menciones.js).
  return client.sendText(m.chat, [`${MARCA.TEXTO} ${sinMenciones(leido)}`, ...avisos].join("\n\n"), m);
}

plugin.run = async (m, { client, text: unaLinea, textoCompleto, usedPrefix, command }) => {
  // The text as it was typed (textoCompleto, lib/comandos.js): "text" has its spaces joined into one, and the two
  // spaces between words, or a word per line, ran a code's words together. With nothing typed, the message it answers.
  // Mentions go as names, as in .qr: in the text they're the digits of a LID, which only the admins get to see (.id),
  // and anyone reading the code would have them.
  const escrito = textoCompleto ?? unaLinea ?? "";
  const texto = sinMarcas(escrito ? conNombres(escrito, m.mentionedJid) : conNombres(m.quoted?.text || "", m.quoted?.contextInfo?.mentionedJid)).trim();
  const soloLee = command !== "morse";
  if (!texto) {
    const ayuda = soloLee
      ? `Pegá el código morse: ${usedPrefix}${command} ... --- ...\nLas letras van separadas por espacios y las palabras por « / ». También podés responder a un mensaje.`
      : `Escribí el texto: ${usedPrefix}${command} hola mundo\nO respondé a un mensaje con ${usedPrefix}${command}; si está en morse, te lo paso a texto.`;
    return client.sendText(m.chat, ayuda, m);
  }
  return soloLee || esMorse(texto) ? leer(m, client, texto) : escribir(m, client, texto);
};

export default plugin;
