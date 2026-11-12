// Names and texts: how to name someone without tagging them, and what becomes of the "@<digits>" in a text. Whom a
// message names (lidMencionado and the rest) is lib/identidad.js's, which answers who is who for the whole bot.
import { AsyncLocalStorage } from "node:async_hooks";
import { nombresGuardados } from "../database-functions.js";
import { esElBot, identidadesDe, buscarEnGrupo, identidadDelGrupo } from "./identidad.js";

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

// The lists that name people (.familias, .familia, .baltop, .ranking, .aura, .ex, .listaadv, .antecedentes, .cumples,
// .catalogo) take a word, wherever it goes in the text: "nombres" names everyone by their WhatsApp name, with their
// nickname in brackets ("Carlos (Tito)"), "numeros" by their phone number, with what they're called in brackets
// ("+59899123456 (Tito)"), and "alias" (or "apodo") by their nickname, or their name if they have none. The nickname is
// bought in the shop (lib/tienda.js) and can be anything, so a tree or a ranking didn't say who was who. With no word,
// the list's own way (porDefecto): the nickname for most, the WhatsApp name for .cumples and .listaadv, where "alias"
// is the way to the nicknames.
// Returns the mode and the text without the word, for the mention the command takes.
const MODOS = { nombres: "nombres", nombre: "nombres", numeros: "numeros", numero: "numeros", alias: "apodo", apodo: "apodo", apodos: "apodo" };
const sinAcentos = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function modoDeNombre(text, { porDefecto = "apodo" } = {}) {
  const palabras = String(text || "").trim().split(/\s+/).filter(Boolean);
  const i = palabras.findIndex((p) => MODOS[sinAcentos(p)]);
  if (i < 0) return { modo: porDefecto, texto: String(text || "") };
  return { modo: MODOS[sinAcentos(palabras[i])], texto: palabras.filter((_, j) => j !== i).join(" ") };
}

// Builds a text (armar, sync or async) naming people as "modo" says: what nombreDe gives inside it, through its awaits,
// and nowhere else, since two commands may be building at once. With grupo, the group's participants, a number is only
// the one the group lists the person with, for a list that's there to write to them (.catalogo numero): the one they
// have now, and none for whoever the group lists without one, or doesn't list. The one their row has may be one they
// had before, someone else's by now, and one the group doesn't show isn't the bot's to show.
const comoNombrar = new AsyncLocalStorage();
export const nombrandoPor = (modo, armar, { grupo = null } = {}) => (modo && modo !== "apodo" ? comoNombrar.run({ modo, grupo }, armar) : armar());

// The number a group lists someone with, or null: found by their LID, or by the number itself when that's their id.
const numeroEnElGrupo = (id, grupo) => identidadDelGrupo(buscarEnGrupo(grupo, id.endsWith("@lid") ? { lid: id } : { jid: id })).jid;

// nombreDe, with the names already read (fila, nombresGuardados' answer), as the mode in course wants them.
function nombrar(lid, fila) {
  if (lid && esElBot(lid)) return "Claudia";
  const limpio = (s) => String(s || "").trim().replace(/@+(?=\d|$)/g, "").trim();
  const apodo = limpio(fila?.apodo);
  const nombre = limpio(fila?.pushName);
  const { modo, grupo } = comoNombrar.getStore() || {};
  if (modo === "nombres") return nombre ? (apodo && apodo !== nombre ? `${nombre} (${apodo})` : nombre) : apodo || "alguien";
  if (modo === "numeros") {
    const numero = !lid ? null : grupo ? numeroEnElGrupo(lid, grupo) : identidadesDe(lid).jid;
    const como = apodo || nombre || "alguien";
    return numero ? `+${numero.split("@")[0]} (${como})` : `${como} (sin número)`;
  }
  return apodo || nombre || "alguien";
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
