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
//
// What's to happen on a day ("el viernes rindo física") is kept with that day (cuando, "2026-11-20"), as the AI read it
// from today's date: she's told it's that day, or that it was, and once it has come and gone, the first time that
// person talks to her in the week after it she's told she doesn't know how it went (seguimientosDe), once. With no day,
// "rinde física el viernes" read the same on Saturday as on Monday, and she never asked how it went.
import { getUser, updateUserInGroup } from "../database-functions.js";
import { SENSIBLE } from "./memoria-grupo.js";
import { preguntarGemini } from "./gemini.js";
import { haceCuanto, elDia, mediodiaDe, diasDeCalendario } from "./tiempo.js";

export const MEMORIA_PERSONA = {
  MAX_DATOS: 6, // what's left of a person once she has gone over what she knows of them
  TOPE: 10, // what's kept of one at most: reaching it, she goes over them
  MAX_DATO: 200,
  REPASOS_DIA: 30, // AI calls a day to go over them, for everybody together: Gemini's quota is the chat's too
  VISTA_MS: 24 * 60 * 60 * 1000, // .notas olvidame <n> reads the number on the list .notas yo showed, this long at most
  SEGUIMIENTO_DIAS: 7, // the days after what was to happen in which she's told she doesn't know how it went
  CUANDO_MAX_DIAS: 366, // how far ahead the day of something to happen can be
};

// Only Gemini, as her glances and the stickers: the backup providers are kept for when people talk to her. Swappable
// by the tests.
export const _dep = { preguntar: (...a) => preguntarGemini(...a) };

const limpiar = (dato) =>
  String(dato || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MEMORIA_PERSONA.MAX_DATO);

// ---------- the day of what's to happen ----------

const DIA = /^\d{4}-\d{2}-\d{2}$/;
// From today to that day, by the calendar: 0 today, less once it's gone.
const diasHasta = (dia, ahora) => diasDeCalendario(ahora, mediodiaDe(dia));

// The day the AI gave for what it noted, if it's one: a day of the calendar (no 31st of November), from today up to
// CUANDO_MAX_DIAS ahead. Anything else is no day, and the note is kept all the same.
function diaDe(texto, ahora) {
  const dia = String(texto || "").trim();
  if (!DIA.test(dia)) return "";
  const [anio, mes, numero] = dia.split("-").map(Number);
  const d = new Date(mediodiaDe(dia));
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== numero) return "";
  const dias = diasHasta(dia, ahora);
  return dias >= 0 && dias <= MEMORIA_PERSONA.CUANDO_MAX_DIAS ? dia : "";
}

// Come and gone in the SEGUIMIENTO_DIAS days before today, and she hasn't had the chance to ask how it went.
function sinPreguntar(r, ahora) {
  if (!r.cuando || r.preguntado) return false;
  const dias = diasHasta(r.cuando, ahora);
  return dias < 0 && dias >= -MEMORIA_PERSONA.SEGUIMIENTO_DIAS;
}

// Still to come, or come and gone without her having had the chance to ask about it: the cap and her reviews leave it
// as it is, with its day.
const porVenir = (r, ahora) => Boolean(r.cuando) && (diasHasta(r.cuando, ahora) >= 0 || sinPreguntar(r, ahora));

// "es mañana", "es hoy", "fue el viernes".
const suDia = (r, ahora) => `${diasHasta(r.cuando, ahora) >= 0 ? "es" : "fue"} ${elDia(mediodiaDe(r.cuando), ahora)}`;

// What she knows of someone in a group: [{ dato, fecha, cuando?, preguntado? }], from what she heard longest ago to
// the newest. What was kept before the dates, as one text, is read as it is, with no date (0): she doesn't know since
// when.
export function recuerdosDe(usuario, chat) {
  const guardado = getUser(usuario)?.inGroup?.[chat]?.memoria;
  if (Array.isArray(guardado)) {
    return guardado
      .filter((r) => typeof r?.dato === "string" && r.dato)
      .map((r) => ({ dato: r.dato, fecha: Number(r.fecha) || 0, ...(DIA.test(r.cuando) ? { cuando: r.cuando, ...(r.preguntado === true ? { preguntado: true } : {}) } : {}) }));
  }
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

// For a prompt: each thing with how long ago she learned it, and with its day what's to happen on one ("es el
// viernes", "fue ayer"); and what the dates are for when there are any. With no full stop at the end: whoever uses it
// closes the sentence.
export function textoDeRecuerdos(recuerdos, ahora = Date.now()) {
  const entre = (r) => [r.fecha ? haceCuanto(r.fecha, ahora) : "", r.cuando ? suDia(r, ahora) : ""].filter(Boolean).join("; ");
  const lista = recuerdos.map((r) => (entre(r) ? `${r.dato} (${entre(r)})` : r.dato)).join(" · ");
  if (!recuerdos.some((r) => r.fecha || r.cuando)) return lista;
  const queVa = recuerdos.some((r) => r.cuando) ? "cuándo te enteraste de cada cosa, y el día de lo que tiene uno" : "cuándo te enteraste de cada cosa";
  return `${lista}. Entre paréntesis va ${queVa}: lo de hace mucho puede haber cambiado`;
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
// Past the cap the first one goes, the one she heard longest ago, of what isn't still to come (porVenir): where this
// ends up if she can't go over them (repasarRecuerdos). cuando: the day it's to happen on, as the AI gave it; told
// again with no day, it keeps the one it had, and whether she had the chance to ask about it. Returns what she knows
// now, or null if nothing was kept.
export function anotarDe(usuario, chat, dato, ahora = Date.now(), cuando = "") {
  const limpio = limpiar(dato);
  if (!limpio || !String(chat).endsWith("@g.us") || SENSIBLE.test(limpio)) return null;
  const sabia = recuerdosDe(usuario, chat);
  const viejo = sabia.find((r) => loMismo(r.dato, limpio));
  const dia = diaDe(cuando, ahora) || viejo?.cuando || "";
  const preguntado = Boolean(dia) && viejo?.cuando === dia && viejo.preguntado === true;
  const recuerdos = [...sabia.filter((r) => !loMismo(r.dato, limpio)), { dato: limpio, fecha: ahora, ...(dia ? { cuando: dia } : {}), ...(preguntado ? { preguntado } : {}) }];
  while (recuerdos.length > MEMORIA_PERSONA.TOPE) recuerdos.splice(Math.max(0, recuerdos.findIndex((r) => !porVenir(r, ahora))), 1);
  return guardar(usuario, chat, recuerdos) ? recuerdos : null;
}

// .notas yo numbers what she knows of someone, and .notas olvidame <n> takes the number from there. It used to be read
// on the list as it was by then, and the list moves: each thing forgotten moves the ones after it up ("olvidame 4"
// after "olvidame 2" took what had been shown as the fifth), and so do a review, the cap letting the oldest go and
// something told again going last. So the list is kept as it was shown, for a while (VISTA_MS), and the number is
// read there: "person|chat" -> { cuando, recuerdos: [{ dato, olvidado }] }.
const vistas = new Map();

// What .notas yo shows: what she knows of them there, kept as shown.
export function mostrarRecuerdos(usuario, chat, ahora = Date.now()) {
  for (const [clave, vista] of vistas) if (ahora - vista.cuando >= MEMORIA_PERSONA.VISTA_MS) vistas.delete(clave);
  const recuerdos = recuerdosDe(usuario, chat);
  vistas.set(`${usuario}|${chat}`, { cuando: ahora, recuerdos: recuerdos.map((r) => ({ dato: r.dato, olvidado: false })) });
  return recuerdos;
}

// .notas olvidame: all she knows of them there, and when they last talked to her. What she showed them is all forgotten
// then: "olvidame 2" after it says so. Returns whether she knew anything.
export function olvidarDe(usuario, chat) {
  for (const visto of vistas.get(`${usuario}|${chat}`)?.recuerdos || []) visto.olvidado = true;
  const sabia = recuerdosDe(usuario, chat).length > 0;
  if (sabia || getUser(usuario)?.inGroup?.[chat]?.ultimaCharla) updateUserInGroup(usuario, chat, { memoria: "", ultimaCharla: 0 });
  return sabia;
}

// .notas olvidame <n>: one thing, by its number in what .notas yo showed them, wherever it is now; with nothing shown
// lately, by its number as they are. Returns { olvidado } with what she forgot; { yaOlvidado } with what was shown
// under that number, when they had her forget it already; { cambio: true } when it isn't among what she knows any more
// (a review made it into something else), and then nothing is forgotten; or null if there's no number like that
// (whatever isn't the place of one finds nothing there).
export function olvidarUno(usuario, chat, numero, ahora = Date.now()) {
  const recuerdos = recuerdosDe(usuario, chat);
  const vista = vistas.get(`${usuario}|${chat}`);
  const vigente = Boolean(vista) && ahora - vista.cuando < MEMORIA_PERSONA.VISTA_MS;
  const visto = (vigente ? vista.recuerdos : recuerdos)[numero - 1];
  if (!visto) return null;
  // Told again since, it's another place and another date, and the same thing.
  const olvidado = recuerdos.find((r) => loMismo(r.dato, visto.dato));
  if (!olvidado) return visto.olvidado ? { yaOlvidado: visto } : { cambio: true };
  guardar(usuario, chat, recuerdos.filter((r) => r !== olvidado));
  if (vigente) visto.olvidado = true;
  return { olvidado };
}

// She answered them with words, there: when, and nothing of what was said. In a group only, as what she learns. Each
// person once, though she answers several of their messages together.
export function anotarCharla(usuarios, chat, ahora = Date.now()) {
  if (!String(chat).endsWith("@g.us")) return;
  for (const usuario of new Set(usuarios)) updateUserInGroup(usuario, chat, { ultimaCharla: ahora });
}

// ---------- how it went ----------

// What they had told her was to happen and has come and gone, in the SEGUIMIENTO_DIAS days before today, if she hasn't
// had the chance to ask about it yet: for her chat's prompt (plugins/_auto-ia.js), and to be marked once she has.
export const seguimientosDe = (recuerdos, ahora = Date.now()) => recuerdos.filter((r) => sinPreguntar(r, ahora));

// Those, for the prompt: "" with none. She asks if it fits, once: the "how did it go" a friend asks the first time they
// see you after it, and not if something newer says it changed, or they told her already.
export function textoDeSeguimientos(seguimientos, ahora = Date.now()) {
  if (!seguimientos.length) return "";
  const lista = seguimientos.map((r) => `"${r.dato}" (${suDia(r, ahora)})`).join(" · ");
  return `De lo que te había contado que iba a pasar, ya pasó esto y no sabés cómo le fue: ${lista}. Si viene al caso, preguntale cómo le fue, una vez y sin insistir; si ya te lo contó, o algo más nuevo de lo que sabés dice que cambió, no.`;
}

// She answered them with words with those in her prompt: she had her chance to ask, and they aren't offered again.
export function marcarPreguntados(usuario, chat, seguimientos) {
  const recuerdos = recuerdosDe(usuario, chat);
  const marcados = recuerdos.filter((r) => r.cuando && !r.preguntado && seguimientos.some((s) => s.cuando === r.cuando && loMismo(s.dato, r.dato)));
  for (const r of marcados) r.preguntado = true;
  if (marcados.length) guardar(usuario, chat, recuerdos);
  return marcados.length;
}

// ---------- going over them ----------

const ESQUEMA_REPASO = {
  type: "object",
  properties: { notas: { type: "array", items: { type: "object", properties: { texto: { type: "string" }, de: { type: "array", items: { type: "integer" } } }, required: ["texto", "de"] } } },
  required: ["notas"],
};

function promptDeRepaso(nombre, recuerdos, ahora) {
  const lista = recuerdos.map((r, i) => `${i + 1}. (${[r.fecha ? haceCuanto(r.fecha, ahora) : "hace mucho, no sabés cuándo", r.cuando ? suDia(r, ahora) : ""].filter(Boolean).join("; ")}) ${r.dato}`).join("\n");
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
// the next time she learns something of that person. What's still to come (porVenir) isn't hers to go over: it stays
// as it is, with its day, and the AI gets the rest. Returns whether she went over them.
export async function repasarRecuerdos(usuario, chat, nombre = "esa persona", ahora = Date.now()) {
  const clave = `${usuario}|${chat}`;
  const antes = recuerdosDe(usuario, chat);
  if (antes.length < MEMORIA_PERSONA.TOPE || enRepaso.has(clave)) return false;
  const aparte = antes.filter((r) => porVenir(r, ahora));
  const aRepasar = antes.filter((r) => !porVenir(r, ahora));
  // Those few already: there's nothing to make fewer, and the cap lets the oldest of them go.
  if (aRepasar.length <= MEMORIA_PERSONA.MAX_DATOS) return false;
  const hoy = new Date(ahora).toDateString();
  if (repasos.dia !== hoy) Object.assign(repasos, { dia: hoy, hechos: 0 });
  if (repasos.hechos >= MEMORIA_PERSONA.REPASOS_DIA) return false;
  repasos.hechos++;
  enRepaso.add(clave);
  try {
    const r = await _dep.preguntar(promptDeRepaso(nombre, aRepasar, ahora), { schema: ESQUEMA_REPASO });
    const repasados = r?.ok ? leerRepaso(r.texto, aRepasar) : null;
    if (!repasados || JSON.stringify(recuerdosDe(usuario, chat)) !== JSON.stringify(antes)) return false;
    guardar(usuario, chat, [...repasados, ...aparte].sort((a, b) => a.fecha - b.fecha));
    return true;
  } finally {
    enRepaso.delete(clave);
  }
}

// For the tests: as just started.
export const _pruebas = {
  reiniciar() {
    enRepaso.clear();
    vistas.clear();
    Object.assign(repasos, { dia: "", hechos: 0 });
  },
};
