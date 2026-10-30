// Names and texts: how to name someone without tagging them, and what becomes of the "@<digits>" in a text. Whom a
// message names (lidMencionado and the rest) is lib/identidad.js's, which answers who is who for the whole bot.
import { nombresGuardados } from "../database-functions.js";
import { esElBot } from "./identidad.js";

// How to name someone without tagging them: their nickname or WhatsApp name, and failing that "alguien", because the
// digits of their id would be their LID, which only the admins get to see (.id). For rankings and long lists, where
// mentioning everyone sends each of them a notification. It takes the id alone: it's handed to .map() as is. A WhatsApp
// name is whatever the person typed: an "@" with digits in it would tag whoever those digits are, since sendText turns
// every "@<digits>" into a mention (parseMention in lib/wa-socket.js), and so would "@@<digits>" with only one "@"
// taken out, or one at the end of the name: put in place of a LID in a text (sinMenciones), the digits after it came
// together with it, "Dani@" and "300…". Claudia is named by her own ids, which may have no row: otherwise a "@Claudia"
// in a message would read "@alguien".
export function nombreDe(lid) {
  return nombrar(lid, nombresGuardados(lid));
}

// nombreDe, with the names already read (fila, nombresGuardados' answer).
function nombrar(lid, fila) {
  if (lid && esElBot(lid)) return "Claudia";
  return (fila?.apodo || fila?.pushName || "").trim().replace(/@+(?=\d|$)/g, "").trim() || "alguien";
}

// The names of each id a text names, read once each, and only for so many different ones: a message of the same LID
// over and over, or of thousands of different digits, was a lookup for each "@", and a single one held the bot for
// seconds (plugins/_memoria-corta.js goes through every message). Past that many they're taken as unknown, as they'd
// be for nobody. Returns a function of the id.
const BUSQUEDAS_POR_TEXTO = 200;
function buscador() {
  const vistos = new Map();
  return (id) => {
    if (!vistos.has(id)) vistos.set(id, vistos.size < BUSQUEDAS_POR_TEXTO ? nombresGuardados(id) : null);
    return vistos.get(id);
  };
}

// A text the AI wrote, or someone typed (an alert, a post for sale), without the "@<digits>" that sendText turns into
// real mentions (parseMention in lib/wa-socket.js, with this same pattern): asked to "repeat" a list of numbers,
// Claudia tagged thirty people in a group with mentions off and .tagall blocked. A LID the bot knows is named instead;
// any other digits stay, without the "@": looking a phone number up would tell whose it is. Every "@" in a row goes:
// with only one taken out, "@@<digits>" was a mention again. Right after a digit it leaves a space: "@3000@00000000091"
// had the second one taken out and the digits came together, a mention again, and "3@50000 pesos" became "350000
// pesos", with that price. It used to take them out over and over until none was left, a pass for each one, and a
// #vendo full of "@1" held the whole bot for half a minute. Each match starts at the first "@" of a run: a long one was
// tried again from every "@" in it.
export function sinMenciones(texto) {
  const filaDe = buscador();
  return String(texto || "").replace(/(?<!@)@+([0-9]{5,16}|0)/g, (_, digitos, donde, todo) => {
    const lid = `${digitos}@lid`;
    const fila = filaDe(lid);
    const queda = fila ? nombrar(lid, fila) : digitos;
    return /\d/.test(todo[donde - 1] || "") ? ` ${queda}` : queda;
  });
}

// A text with its mentions the way WhatsApp shows them, "@Name", for where it won't turn them into names: a sticker, a
// voice note, a sticker pack's name. A mention travels in the text as "@" and the digits of the id it points at, a LID
// nowadays, which only the admins get to see (.id): ".ttp @persona" drew it on the sticker. Named are the message's own
// mentions (mencionados, its mentionedJid) and any LID the bot knows; someone without a name is "alguien". Other digits
// stay as typed: looking a phone number up would tell whose it is. arroba: false leaves the "@" out, to read it aloud,
// and a name that sendText would read as a mention goes without it too (five digits or more, or a 0, as parseMention
// takes them in lib/wa-socket.js): .recordá answers with this text, and a WhatsApp name of digits tagged whoever those
// digits are. "2Pac" keeps it. Each match starts at the first "@" of a run: a long one was tried again from every "@"
// in it, and a message of nothing but "@" held the bot for seconds (plugins/_memoria-corta.js runs this on every
// message).
export function conNombres(texto, mencionados = [], { arroba = true } = {}) {
  const porDigitos = new Map();
  for (const id of mencionados || []) {
    const [usuario = "", dominio] = String(id).split("@");
    const digitos = usuario.split(":")[0];
    if (/^\d+$/.test(digitos) && dominio) porDigitos.set(digitos, `${digitos}@${dominio}`);
  }
  const filaDe = buscador();
  return String(texto || "").replace(/(?<!@)@+(\d{5,16})(?!\d)/g, (tal, digitos) => {
    const id = porDigitos.get(digitos) || (filaDe(`${digitos}@lid`) ? `${digitos}@lid` : null);
    if (!id) return tal;
    const nombre = nombrar(id, filaDe(id));
    return `${arroba && !/^(\d{5}|0)/.test(nombre) ? "@" : ""}${nombre}`;
  });
}
