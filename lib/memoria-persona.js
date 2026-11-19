// What Claudia learns of each person while chatting (the "recordar" field of her replies), kept per group, in
// inGroup[chat].memoria. It used to be one memory per person for the whole bot: something told to her in private, or in
// another group, came up in the prompt of every group that person talked to her in, and in their birthday greeting.
// In private she keeps nothing. Whoever it's about can see it and have it forgotten, all of it or one thing (.notas
// yo / .notas olvidame).
//
// Each thing with when she learned it, in that order. It used to be one text, "a | b | c", of the last six: with no
// dates, "rinde Anatomía en diciembre" read the same in January as the day it was said, and the seventh thing pushed
// out the first, whatever it was. Now she's told how long ago each one is from, the same thing told again is the one
// she had, as of now, and when they're too many she goes over them herself (repasarRecuerdos): what says the same
// becomes one, what changed stays as it is now, and what goes first is what was passing.
//
// And when each person last talked to her (inGroup[chat].ultimaCharla, only the moment): she notices who's back after a
// while (lib/quien-escribe.js).
import { getUser, updateUserInGroup } from "../database-functions.js";
import { SENSIBLE } from "./memoria-grupo.js";
import { preguntarGemini } from "./gemini.js";
import { haceCuanto } from "./tiempo.js";

export const MEMORIA_PERSONA = {
  MAX_DATOS: 6, // what's left of a person once she has gone over what she knows of them
  TOPE: 10, // what's kept of one at most: reaching it, she goes over them
  MAX_DATO: 200,
  REPASOS_DIA: 30, // AI calls a day to go over them, for everybody together: Gemini's quota is the chat's too
};

// Only Gemini, as her glances and the stickers: the backup providers are kept for when people talk to her. Swappable
// by the tests.
export const _dep = { preguntar: (...a) => preguntarGemini(...a) };

const limpiar = (dato) =>
  String(dato || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MEMORIA_PERSONA.MAX_DATO);

// What she knows of someone in a group: [{ dato, fecha }], from what she heard longest ago to the newest. What was kept
// before the dates, as one text, is read as it is, with no date (0): she doesn't know since when.
export function recuerdosDe(usuario, chat) {
  const guardado = getUser(usuario)?.inGroup?.[chat]?.memoria;
  if (Array.isArray(guardado)) return guardado.filter((r) => typeof r?.dato === "string" && r.dato).map((r) => ({ dato: r.dato, fecha: Number(r.fecha) || 0 }));
  return String(guardado || "")
    .split(" | ")
    .map((dato) => dato.trim())
    .filter(Boolean)
    .map((dato) => ({ dato, fecha: 0 }));
}

// The same, as plain text: "" when she knows nothing.
export const memoriaDe = (usuario, chat) =>
  recuerdosDe(usuario, chat)
    .map((r) => r.dato)
    .join(" | ");

// For a prompt: each thing with how long ago she learned it, and what the dates are for when there are any. With no
// full stop at the end: whoever uses it closes the sentence.
export function textoDeRecuerdos(recuerdos, ahora = Date.now()) {
  const lista = recuerdos.map((r) => (r.fecha ? `${r.dato} (${haceCuanto(r.fecha, ahora)})` : r.dato)).join(" · ");
  return recuerdos.some((r) => r.fecha) ? `${lista}. Entre paréntesis va cuándo te enteraste de cada cosa: lo de hace mucho puede haber cambiado` : lista;
}

const guardar = (usuario, chat, recuerdos) => updateUserInGroup(usuario, chat, { memoria: recuerdos.length ? recuerdos : "" });

// Whether two notes say the same thing, word for word: case, accents and signs aside.
const base = (texto) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
const loMismo = (a, b) => base(a) === base(b);

// Adds what she learned to what she knew, read from the row right then: two chats at once each used to write back the
// memory they had read on arrival, and the last one wiped the other's. The prompt asks her not to keep anything
// sensitive; the same filter as .recordá makes sure. Told the same thing again, it's the one she had, as of now: it
// goes last, where the newest is, instead of taking another place (three "le gusta el mate" left three for the rest).
// Past the cap the first one goes, the one she heard longest ago: where this ends up if she can't go over them
// (repasarRecuerdos). Returns what she knows now, or null if nothing was kept.
export function anotarDe(usuario, chat, dato, ahora = Date.now()) {
  const limpio = limpiar(dato);
  if (!limpio || !String(chat).endsWith("@g.us") || SENSIBLE.test(limpio)) return null;
  const recuerdos = [...recuerdosDe(usuario, chat).filter((r) => !loMismo(r.dato, limpio)), { dato: limpio, fecha: ahora }].slice(-MEMORIA_PERSONA.TOPE);
  return guardar(usuario, chat, recuerdos) ? recuerdos : null;
}

// .notas olvidame: all she knows of them there, and when they last talked to her. Returns whether she knew anything.
export function olvidarDe(usuario, chat) {
  const sabia = recuerdosDe(usuario, chat).length > 0;
  if (sabia || getUser(usuario)?.inGroup?.[chat]?.ultimaCharla) updateUserInGroup(usuario, chat, { memoria: "", ultimaCharla: 0 });
  return sabia;
}

// .notas olvidame <n>: one thing, by its number in .notas yo. Returns it, or null if there's none with that number
// (whatever isn't the place of one finds nothing there).
export function olvidarUno(usuario, chat, numero) {
  const recuerdos = recuerdosDe(usuario, chat);
  const olvidado = recuerdos[numero - 1];
  if (!olvidado) return null;
  guardar(usuario, chat, recuerdos.filter((r) => r !== olvidado));
  return olvidado;
}

// She answered them with words, there: when, and nothing of what was said. In a group only, as what she learns. Each
// person once, though she answers several of their messages together.
export function anotarCharla(usuarios, chat, ahora = Date.now()) {
  if (!String(chat).endsWith("@g.us")) return;
  for (const usuario of new Set(usuarios)) updateUserInGroup(usuario, chat, { ultimaCharla: ahora });
}

// ---------- going over them ----------

const ESQUEMA_REPASO = {
  type: "object",
  properties: { notas: { type: "array", items: { type: "object", properties: { texto: { type: "string" }, de: { type: "array", items: { type: "integer" } } }, required: ["texto", "de"] } } },
  required: ["notas"],
};

function promptDeRepaso(nombre, recuerdos, ahora) {
  const lista = recuerdos.map((r, i) => `${i + 1}. (${r.fecha ? haceCuanto(r.fecha, ahora) : "hace mucho, no sabés cuándo"}) ${r.dato}`).join("\n");
  return `Estas son las notas que fuiste tomando de ${nombre} charlando en un grupo, cada una con cuándo la anotaste:\n${lista}\n\n(Instrucción para vos, no la muestres: son demasiadas. Dejá como mucho ${MEMORIA_PERSONA.MAX_DATOS}, cada una en una frase corta. Juntá las que dicen lo mismo o hablan de lo mismo; si dos se contradicen, vale la más nueva; y si igual sobran, sacá primero lo viejo y pasajero y dejá lo que es de siempre. No agregues nada que no esté en la lista ni lo adornes. En "de" poné los números de las notas de las que sale cada una.)`;
}

// What the AI made of them, checked: no more than MAX_DATOS, each one out of notes that were there (their numbers, in
// "de"), nothing sensitive. Each is from when she last heard of it: the newest of the notes it comes from. null if any
// of it doesn't hold: then they stay as they were.
function leerRepaso(texto, recuerdos) {
  let notas;
  try {
    ({ notas } = JSON.parse(texto));
  } catch {
    return null;
  }
  if (!Array.isArray(notas) || !notas.length || notas.length > MEMORIA_PERSONA.MAX_DATOS) return null;
  const repasados = [];
  for (const nota of notas) {
    const dato = limpiar(nota?.texto);
    const fuentes = (Array.isArray(nota?.de) ? nota.de : []).map((numero) => recuerdos[Number(numero) - 1]).filter(Boolean);
    if (!dato || SENSIBLE.test(dato) || !fuentes.length) return null;
    repasados.push({ dato, fecha: Math.max(...fuentes.map((r) => r.fecha)) });
  }
  return repasados.sort((a, b) => a.fecha - b.fecha);
}

const enRepaso = new Set(); // "person|chat" she's going over right now
const repasos = { dia: "", hechos: 0 }; // the AI calls made for this today

// When what she knows of someone reached the cap: one AI call makes them fewer, the way she'd do it. In the
// background, while she answers (plugins/_auto-ia.js): nobody waits for it. Nothing changes if the AI fails or what
// comes back doesn't hold, or if what she knew changed meanwhile: they asked to be forgotten, or she learned something
// else, and what she made of the list as it was would bring back what's gone and lose what's new. She goes over them
// the next time she learns something of that person. Returns whether she went over them.
export async function repasarRecuerdos(usuario, chat, nombre = "esa persona", ahora = Date.now()) {
  const clave = `${usuario}|${chat}`;
  const antes = recuerdosDe(usuario, chat);
  if (antes.length < MEMORIA_PERSONA.TOPE || enRepaso.has(clave)) return false;
  const hoy = new Date(ahora).toDateString();
  if (repasos.dia !== hoy) Object.assign(repasos, { dia: hoy, hechos: 0 });
  if (repasos.hechos >= MEMORIA_PERSONA.REPASOS_DIA) return false;
  repasos.hechos++;
  enRepaso.add(clave);
  try {
    const r = await _dep.preguntar(promptDeRepaso(nombre, antes, ahora), { schema: ESQUEMA_REPASO });
    const repasados = r?.ok ? leerRepaso(r.texto, antes) : null;
    if (!repasados || JSON.stringify(recuerdosDe(usuario, chat)) !== JSON.stringify(antes)) return false;
    guardar(usuario, chat, repasados);
    return true;
  } finally {
    enRepaso.delete(clave);
  }
}

// For the tests: as just started.
export const _pruebas = {
  reiniciar() {
    enRepaso.clear();
    Object.assign(repasos, { dia: "", hechos: 0 });
  },
};
