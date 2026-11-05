// The Bible by reference: .versiculo Levítico 18:22, Juan 3:16-17 (a stretch), Salmos 23 (a chapter), Proverbios (one
// of its verses at random) or nothing (one of the whole Bible). Reina-Valera 1960 from bolls.life, which numbers the
// 66 books as below: /get-text/RV1960/<libro>/<capítulo>/ answers the chapter's verses, and [] for a chapter that
// isn't there. The books' names and chapters live here, so a reference is read and checked without asking anything.
import { elegirAlAzar } from "./azar.js";

export const BIBLIA = {
  API: "https://bolls.life",
  TRADUCCION: "RV1960",
  MAX_VERSICULOS: 30, // a chapter or a stretch goes out this many verses at a time, with how to go on
  TIMEOUT_MS: 15000,
};

// [id as bolls.life numbers them, name as the RV1960 prints it, chapters, other ways people write it]: the usual
// abbreviations (Gn, Lv, 1 S, Jn...) and the names other editions use. Beyond these, any unambiguous start of a name.
const TABLA = [
  [1, "Génesis", 50, "gn gen"],
  [2, "Éxodo", 40, "ex exo"],
  [3, "Levítico", 27, "lv lev"],
  [4, "Números", 36, "nm num"],
  [5, "Deuteronomio", 34, "dt deut"],
  [6, "Josué", 24, "jos"],
  [7, "Jueces", 21, "jue jc"],
  [8, "Rut", 4, "rt ruth"],
  [9, "1 Samuel", 31, "1s 1sam 1sm"],
  [10, "2 Samuel", 24, "2s 2sam 2sm"],
  [11, "1 Reyes", 22, "1r 1re 1rey"],
  [12, "2 Reyes", 25, "2r 2re 2rey"],
  [13, "1 Crónicas", 29, "1cr 1cro"],
  [14, "2 Crónicas", 36, "2cr 2cro"],
  [15, "Esdras", 10, "esd"],
  [16, "Nehemías", 13, "neh ne"],
  [17, "Ester", 10, "est"],
  [18, "Job", 42, "jb"],
  [19, "Salmos", 150, "sal salmo"],
  [20, "Proverbios", 31, "pr prov proverbio"],
  [21, "Eclesiastés", 12, "ec ecl qohelet"],
  [22, "Cantares", 8, "cnt cantar cantardeloscantares"],
  [23, "Isaías", 66, "is isa"],
  [24, "Jeremías", 52, "jer jr"],
  [25, "Lamentaciones", 5, "lm lam"],
  [26, "Ezequiel", 48, "ez eze ezq"],
  [27, "Daniel", 12, "dn dan"],
  [28, "Oseas", 14, "os"],
  [29, "Joel", 3, "jl"],
  [30, "Amós", 9, "am"],
  [31, "Abdías", 1, "abd ab"],
  [32, "Jonás", 4, "jon"],
  [33, "Miqueas", 7, "mi miq"],
  [34, "Nahum", 3, "nah na"],
  [35, "Habacuc", 3, "hab"],
  [36, "Sofonías", 3, "sof"],
  [37, "Hageo", 2, "hag ag ageo"],
  [38, "Zacarías", 14, "zac za"],
  [39, "Malaquías", 4, "mal ml"],
  [40, "Mateo", 28, "mt mat"],
  [41, "Marcos", 16, "mr mc mar"],
  [42, "Lucas", 24, "lc luc"],
  [43, "Juan", 21, "jn"],
  [44, "Hechos", 28, "hch hech hechosdelosapostoles"],
  [45, "Romanos", 16, "ro rom"],
  [46, "1 Corintios", 16, "1co 1cor"],
  [47, "2 Corintios", 13, "2co 2cor"],
  [48, "Gálatas", 6, "ga gal"],
  [49, "Efesios", 6, "ef efe"],
  [50, "Filipenses", 4, "fil flp"],
  [51, "Colosenses", 4, "col"],
  [52, "1 Tesalonicenses", 5, "1ts 1tes"],
  [53, "2 Tesalonicenses", 3, "2ts 2tes"],
  [54, "1 Timoteo", 6, "1ti 1tim"],
  [55, "2 Timoteo", 4, "2ti 2tim"],
  [56, "Tito", 3, "tit"],
  [57, "Filemón", 1, "flm film filem"],
  [58, "Hebreos", 13, "heb hb"],
  [59, "Santiago", 5, "stg sant stgo"],
  [60, "1 Pedro", 5, "1p 1pe 1ped"],
  [61, "2 Pedro", 3, "2p 2pe 2ped"],
  [62, "1 Juan", 5, "1jn"],
  [63, "2 Juan", 1, "2jn"],
  [64, "3 Juan", 1, "3jn"],
  [65, "Judas", 1, "jud"],
  [66, "Apocalipsis", 22, "ap apoc rev revelacion"],
];

// Lower case, no accents, letters and digits only: "1 Corintios", "1corintios" and "1 CORINTIOS" are the same book.
const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export const LIBROS = TABLA.map(([id, nombre, capitulos, alias]) => ({ id, nombre, capitulos, claves: [normalizar(nombre), ...alias.split(" ")] }));
const libroPorId = (id) => LIBROS.find((l) => l.id === id) || { id, nombre: `Libro ${id}`, capitulos: 0 };

// The book someone wrote: by its name or an abbreviation, or by an unambiguous start of a name ("Levit", "1 Cor").
export function libroDe(nombre) {
  const clave = normalizar(nombre);
  if (!clave) return { error: "formato" };
  const exacto = LIBROS.find((l) => l.claves.includes(clave));
  if (exacto) return { libro: exacto };
  const parecidos = LIBROS.filter((l) => l.claves[0].startsWith(clave));
  if (parecidos.length === 1) return { libro: parecidos[0] };
  if (parecidos.length > 1) return { error: "ambiguo", nombre: nombre.trim(), opciones: parecidos.map((l) => l.nombre) };
  return { error: "libro", nombre: nombre.trim() };
}

// "Libro", "Libro 3", "Libro 3:16", "Libro 3:16-17"; the book may start with 1, 2, 3 or I, II, III, the chapter and the
// verse may be split by ":", "." , "," or a space. The roman numeral needs a space after it: "Isaías" isn't "I saías".
const REFERENCIA = /^\s*(?:([123])\s*|(i{1,3})\s+)?([^\d]+?)\s*(?:(\d+)(?:(?:\s*[:.,]\s*|\s+)(\d+))?(?:\s*[-–—]\s*(\d+))?)?\s*$/i;

// What a reference says: { libro, capitulo, desde, hasta } (capitulo missing: the whole book; desde missing: the whole
// chapter; desde and hasta equal: one verse), or { error } with "formato", "libro" or "ambiguo" (with the options).
export function leerReferencia(texto) {
  const partes = String(texto || "").match(REFERENCIA);
  if (!partes) return { error: "formato" };
  const [, digito, romano, nombre, cap, verso, fin] = partes;
  const numero = romano ? romano.length : digito || "";
  const buscado = libroDe(`${numero} ${nombre}`);
  if (buscado.error) return buscado;
  const { libro } = buscado;
  let capitulo = cap == null ? undefined : Number(cap);
  let desde = verso == null ? undefined : Number(verso);
  let hasta = fin == null ? undefined : Number(fin);
  if ([capitulo, desde, hasta].some((n) => n !== undefined && n < 1)) return { error: "formato" };
  // In a one-chapter book, "Judas 3" is verse 3 and "Judas 3-5" verses 3 to 5; "Judas 1" alone is the chapter.
  if (libro.capitulos === 1 && capitulo !== undefined && desde === undefined && !(capitulo === 1 && hasta === undefined)) {
    [capitulo, desde] = [1, capitulo];
  }
  if (hasta !== undefined && desde === undefined) return { error: "formato" }; // "Juan 3-5": chapters don't go in stretches
  if (desde !== undefined && hasta === undefined) hasta = desde;
  if (hasta < desde) [desde, hasta] = [hasta, desde];
  return { libro, capitulo, desde, hasta };
}

const lista = (opciones) => (opciones.length > 1 ? `${opciones.slice(0, -1).join(", ")} o ${opciones.at(-1)}` : opciones[0]);
export function errorDeReferencia(ref, usedPrefix = ".") {
  if (ref.error === "libro") return `❌ No conozco el libro «${ref.nombre}». Escribilo como en la Biblia (Génesis, 1 Samuel, Juan...) o abreviado (Gn, 1 S, Jn).`;
  if (ref.error === "ambiguo") return `❌ «${ref.nombre}» puede ser ${lista(ref.opciones)}: decime cuál.`;
  return `❌ Decime libro, capítulo y versículo: ${usedPrefix}versiculo Levítico 18:22. También un tramo (${usedPrefix}versiculo Juan 3:16-17), un capítulo (${usedPrefix}versiculo Salmos 23) o un libro (${usedPrefix}versiculo Proverbios, uno al azar).`;
}

// ---------- bolls.life ----------
const pedir = async (ruta) => {
  const res = await fetch(`${BIBLIA.API}${ruta}`, { signal: AbortSignal.timeout(BIBLIA.TIMEOUT_MS) });
  if (!res.ok) throw new Error(`bolls.life respondió ${res.status}`);
  return res.json();
};

// A chapter's verses, [{ verse, text }], kept once they came: the text doesn't change, and the same chapters come up.
const capitulos = new Map();
export async function pedirCapitulo(libro, capitulo) {
  const clave = `${libro.id}:${capitulo}`;
  if (!capitulos.has(clave)) {
    const versos = await pedir(`/get-text/${BIBLIA.TRADUCCION}/${libro.id}/${capitulo}/`);
    if (!Array.isArray(versos) || !versos.length) throw new Error(`${libro.nombre} ${capitulo} vino vacío`);
    if (capitulos.size >= 200) capitulos.delete(capitulos.keys().next().value);
    capitulos.set(clave, versos);
  }
  return capitulos.get(clave);
}
export const olvidarCapitulos = () => capitulos.clear(); // for the tests

// ---------- the texts ----------
const limpiar = (t) => String(t).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const cabecera = (libro, capitulo) => `*📖 LIBRO DE:* ${libro.nombre}\n\n*✍️Capítulo:* ${capitulo}\n\n`;
export const textoVersiculo = (libro, capitulo, v) => `${cabecera(libro, capitulo)}*Versículo: #${v.verse}*\n\n📝 ${limpiar(v.text)}\n`;

// Verses desde..hasta of a chapter: one verse as always; several, numbered, MAX_VERSICULOS at a time with the reference
// of the next stretch; a start past the last verse says how many the chapter has.
function textoTramo(libro, capitulo, versos, desde, hasta, usedPrefix) {
  const ultimoDelCapitulo = versos.at(-1).verse;
  if (desde > ultimoDelCapitulo) return `❌ ${libro.nombre} ${capitulo} tiene ${ultimoDelCapitulo} versículos.`;
  hasta = Math.min(hasta, ultimoDelCapitulo);
  if (desde === hasta) return textoVersiculo(libro, capitulo, versos.find((v) => v.verse === desde));
  const ultimo = Math.min(hasta, desde + BIBLIA.MAX_VERSICULOS - 1);
  const lineas = versos.filter((v) => v.verse >= desde && v.verse <= ultimo).map((v) => `*${v.verse}* ${limpiar(v.text)}`);
  const corte = ultimo < hasta ? ` (de ${hasta})` : "";
  const sigue = ultimo < hasta ? `\n_Sigue con ${usedPrefix}versiculo ${libro.nombre} ${capitulo}:${ultimo + 1}-${Math.min(hasta, ultimo + BIBLIA.MAX_VERSICULOS)}_\n` : "";
  return `${cabecera(libro, capitulo)}*Versículos: #${desde} al ${ultimo}${corte}*\n\n${lineas.join("\n")}\n${sigue}`;
}

async function versiculoAlAzar() {
  const v = await pedir(`/get-random-verse/${BIBLIA.TRADUCCION}/`);
  return textoVersiculo(libroPorId(v.book), v.chapter, v);
}
async function versiculoAlAzarDe(libro) {
  const capitulo = 1 + Math.floor(Math.random() * libro.capitulos);
  return textoVersiculo(libro, capitulo, elegirAlAzar(await pedirCapitulo(libro, capitulo)));
}

// What .versiculo answers to what was typed after it: a verse at random with nothing, or what the reference asks for.
export async function responderBiblia(pedido, { usedPrefix = "." } = {}) {
  try {
    if (!String(pedido || "").trim()) return await versiculoAlAzar();
    const ref = leerReferencia(pedido);
    if (ref.error) return errorDeReferencia(ref, usedPrefix);
    const { libro, capitulo, desde, hasta } = ref;
    if (capitulo === undefined) return await versiculoAlAzarDe(libro);
    if (capitulo > libro.capitulos) return libro.capitulos === 1 ? `❌ ${libro.nombre} tiene un solo capítulo.` : `❌ ${libro.nombre} tiene ${libro.capitulos} capítulos.`;
    const versos = await pedirCapitulo(libro, capitulo);
    return textoTramo(libro, capitulo, versos, desde ?? 1, hasta ?? versos.at(-1).verse, usedPrefix);
  } catch (error) {
    console.error("[biblia]", error.message);
    return "No pude traer el versículo ahora, probá más tarde.";
  }
}
