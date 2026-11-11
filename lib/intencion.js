// Whether a message reads as someone selling something or looking for something: a classifier small enough to run on
// the phone the bot lives on, with nothing to install. One layer over the message's words and pieces of words: each
// adds a weight to "nada", "vender" and "comprar", and the sums say which (a logistic regression over hashed n-grams).
// It's for what the rules of lib/compraventa.js read as nothing: in a real sales group those caught 6 in 10 of the
// offers written as text and 3 in 10 of the requests, and what got past them was said in ways no list of openings
// covers ("$ 300" under a photo, "tengo una bici", "de casualidad alguien vende una tele?").
// It doesn't say what is for sale nor its price: only that the message looks like an offer or a request, which is
// enough to tell its author how to post it. The weights are lib/intencion-modelo.json, written by
// scripts/entrenar-intencion.mjs from messages labelled by hand, which aren't in the repo: they're people's.
import { readFileSync } from "node:fs";

export const CLASES = ["nada", "vender", "comprar"];

export const INTENCION = {
  // How sure it has to be to say so. On people it hadn't seen, in that group (870 text messages in 48 days) and from
  // here up, it added to what the rules read 24 offers and 7 requests, and spoke out of turn 8 times: a seller's loose
  // line ("a las órdenes!"), a joke, an offer put as a question. At 0.7 it added 19 more and was out of turn 13 more
  // times. The bot answers with an explanation in the group, and one out of turn costs more than one missed.
  UMBRAL: 0.9,
  MAX_PALABRAS: 60, // what someone wants is said early: the rest of a long ad adds nothing, and is slow to read
};

// The message as the words the weights are for: lowercase and without accents, every digit the same digit ("$ 300" and
// "$ 450" are one shape, and no number is kept), a link as one word, and the signs that carry something ("$", "?")
// as words of their own.
export function palabrasDe(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/https?:\/\/\S+/g, " URL ")
    .replace(/\d/g, "0")
    .replace(/([$?¿!¡.,:;()#@*/])/g, " $1 ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, INTENCION.MAX_PALABRAS);
}

// FNV-1a over the text, into one of `cubetas` slots. The weights were trained with this very function: changed, every
// feature would land on another's weight, and nothing would say so but the answers.
function cubeta(rasgo, cubetas) {
  let h = 2166136261;
  for (let i = 0; i < rasgo.length; i++) h = Math.imul(h ^ rasgo.charCodeAt(i), 16777619);
  return (h >>> 0) % cubetas;
}

// What a message has, as the slots of the weights it adds: each word, each pair of words in a row, the pieces of 3 to
// 5 letters of each word (with its ends marked: "<vendo>", so "vend" at the start of a word isn't "vend" in the middle
// of one, and a word never seen still shares pieces with the ones that were), the word and the pair it opens with,
// and how long it is. Each slot once, however many times the message has it.
export function rasgos(texto, cubetas) {
  const w = palabrasDe(texto);
  const r = new Set([cubeta(`L:${Math.floor(Math.min(w.length, 40) / 5)}`, cubetas)]);
  w.forEach((p, i) => {
    r.add(cubeta(`w:${p}`, cubetas));
    if (i + 1 < w.length) r.add(cubeta(`b:${p} ${w[i + 1]}`, cubetas));
    const q = `<${p}>`;
    for (let n = 3; n <= 5; n++) for (let j = 0; j + n <= q.length; j++) r.add(cubeta(`c:${q.slice(j, j + n)}`, cubetas));
  });
  if (w.length) r.add(cubeta(`1:${w[0]}`, cubetas));
  if (w.length > 1) r.add(cubeta(`2:${w[0]} ${w[1]}`, cubetas));
  return [...r];
}

// How likely each class is for a message, in CLASES' order: the weights of its slots added up, each message weighing
// the same whatever its length (the sum is divided by the root of how many slots it has), and a softmax.
// modelo: { cubetas, escala, sesgo: [3], pesos: Int8Array(cubetas * 3) }, a weight being pesos[slot * 3 + class] *
// escala: one byte each, which is what keeps the file at 64 KB.
export function puntuar(modelo, texto) {
  const slots = rasgos(texto, modelo.cubetas);
  const z = [0, 0, 0];
  for (const s of slots) for (let c = 0; c < 3; c++) z[c] += modelo.pesos[s * 3 + c];
  const k = modelo.escala / Math.sqrt(slots.length);
  const e = z.map((suma, c) => suma * k + modelo.sesgo[c]);
  const tope = Math.max(...e);
  const exp = e.map((x) => Math.exp(x - tope));
  const total = exp[0] + exp[1] + exp[2];
  return exp.map((x) => x / total);
}

// The model as the file keeps it, and back: the weights in base64, and what tells one training from another (when,
// and with how many messages of each class).
export const aArchivo = (modelo, datos = {}) => ({ formato: 1, clases: CLASES, cubetas: modelo.cubetas, escala: modelo.escala, sesgo: [...modelo.sesgo], ...datos, pesos: Buffer.from(modelo.pesos.buffer, modelo.pesos.byteOffset, modelo.pesos.byteLength).toString("base64") });

export function deArchivo(archivo) {
  const bytes = Buffer.from(String(archivo?.pesos || ""), "base64");
  const bien = archivo?.formato === 1 && CLASES.every((c, i) => archivo.clases?.[i] === c) && Number.isInteger(archivo.cubetas) && archivo.cubetas > 0 && bytes.length === archivo.cubetas * 3;
  if (!bien || !(archivo.escala > 0) || archivo.sesgo?.length !== 3 || !archivo.sesgo.every(Number.isFinite)) throw new Error("lib/intencion-modelo.json no es un modelo de intención que este código sepa leer");
  return { cubetas: archivo.cubetas, escala: archivo.escala, sesgo: [...archivo.sesgo], pesos: new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length) };
}

// The model in the file, or null when there's none or it doesn't read, which the log is told: the bot goes on as before
// the classifier, reading nothing as an intent, rather than fail on every message.
export function cargarModelo(leer = () => readFileSync(new URL("./intencion-modelo.json", import.meta.url), "utf8")) {
  try {
    return deArchivo(JSON.parse(leer()));
  } catch (e) {
    console.error("[intencion] sin modelo, no se leen intenciones:", e.message);
    return null;
  }
}

// What the weights in the file make of a text (puntuar), or null without them. They're read the first time they're
// needed, and once: a group of friends never asks for them.
let cargado;
export function probabilidades(texto) {
  if (cargado === undefined) cargado = cargarModelo();
  return cargado ? puntuar(cargado, texto) : null;
}

// Swappable from the tests, which start with one that reads nothing (test/helpers.mjs): what the bot does with an
// intent is tested apart from what these weights make of a text, which changes with every training.
export const _dep = { probabilidades };

// "vender" or "comprar" when the message reads as one of them, that sure; null otherwise, and for one with no words.
export function intencionDe(texto, umbral = INTENCION.UMBRAL) {
  if (!palabrasDe(texto).length) return null;
  const p = _dep.probabilidades(texto);
  if (!p) return null;
  const clase = p[1] >= p[2] ? 1 : 2;
  return p[clase] >= umbral ? CLASES[clase] : null;
}
