// Definitions from the Diccionario de la lengua española (dle.rae.es). There is no public API: the page is read with
// Node's core client (Cloudflare answers 403 to undici's native fetch) and the current HTML is parsed, which is
// simple: the title in an h1, the etymology in an intro paragraph, the senses in the first "c-definitions" list and
// the phrases in h3-and-list pairs. A phrase ("mal de ojo") leads to its word's entry ("mal"), so the entry's phrases
// are searched for the one matching the query and that one is shown first. Words that aren't there come back as
// "no está en el Diccionario", with or without similar lemmas.
import { load } from "cheerio";
import { pedirHttp } from "./http.js";

export const RAE = {
  URL: "https://dle.rae.es/",
  MAX_ACEPCIONES: 10, // per article; the rest are summed up as "y N más"
  MAX_EXPRESIONES: 8,
  TIMEOUT_MS: 10000,
  // Cloudflare lets through a client that identifies itself as a bot, and blocks with a "challenge" (403) anything
  // pretending to be Chrome without being it (it lacks the TLS fingerprint and the browser headers). So: no disguises.
  UA: "ClaudIA/1.0 (bot de WhatsApp; +https://github.com/gauchitodev/ClaudIA)",
};

// Injectable for the tests.
export const _dep = {
  pedir: async (url) => {
    const res = await pedirHttp(url, { headers: { "User-Agent": RAE.UA, "Accept-Language": "es-UY,es;q=0.9", Accept: "text/html,application/xhtml+xml" }, timeoutMs: RAE.TIMEOUT_MS });
    if (res.status !== 200) throw new Error(`la RAE respondió ${res.status}`);
    return res.text();
  },
};

const SUPER = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
// "pancho1, cha" → "pancho¹, cha": the homograph number goes right against the word
export const superindices = (t) => String(t).replace(/(?<=\p{L})\d+/gu, (d) => [...d].map((x) => SUPER[x]).join(""));
const limpio = (t) => String(t || "").replace(/\s+/g, " ").trim();
// to compare the query against a phrase's title: no capitals, accents or trailing dot
const clave = (t) =>
  limpio(t)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.¡!¿?]+$/, "");

// Devuelve { tipo: "entrada", articulos: [{ titulo, etimologia, acepciones, expresiones: [{ titulo, acepciones }] }] },
// { tipo: "sugerencias", sugerencias } o { tipo: "nada" }.
export function parsearRae(html) {
  const $ = load(html);
  const articulos = [];
  $("article").each((i, a) => {
    const $a = $(a);
    const titulo = limpio($a.find("h1.c-page-header__title").first().text());
    if (!titulo) return;
    const seccion = $a.find("section.c-section").first();
    const etimologia = limpio(seccion.children("div.n2.c-text-intro").first().text());
    const acepcionesDe = (ol) =>
      $(ol)
        .children("li")
        .map((j, li) => {
          const item = $(li).find(".c-definitions__item").first();
          return limpio((item.length ? item.children("div").first() : $(li)).text());
        })
        .get()
        .filter(Boolean);
    // in order: the first list belongs to the word; after that each h3 opens a phrase and the list that follows is its own
    let acepciones = [];
    const expresiones = [];
    seccion.children("ol.c-definitions, h3").each((j, e) => {
      if (e.tagName === "h3") {
        const t = limpio($(e).text());
        if (t) expresiones.push({ titulo: t, acepciones: [] });
      } else if (expresiones.length) expresiones.at(-1).acepciones.push(...acepcionesDe(e));
      else if (!acepciones.length) acepciones = acepcionesDe(e);
    });
    articulos.push({ titulo: superindices(titulo), etimologia, acepciones, expresiones });
  });
  if (articulos.length) return { tipo: "entrada", articulos };
  const sugerencias = [...new Set($("#resultados article h3 a").map((i, a) => superindices(limpio($(a).text()))).get().filter(Boolean))];
  if (sugerencias.length) return { tipo: "sugerencias", sugerencias };
  return { tipo: "nada" };
}

const PIE = "_Fuente: RAE, Diccionario de la lengua española._";

export function textoRae(palabra, r) {
  const p = limpio(palabra);
  if (r.tipo === "nada") return `«${p}» no está en el diccionario de la RAE.`;
  if (r.tipo === "sugerencias") return `«${p}» no está en el diccionario de la RAE. ¿Quisiste decir ${r.sugerencias.slice(0, 6).join(" · ")}?`;
  // if the query is one of the entry's phrases ("mal de ojo" under "mal"), show just that one
  for (const a of r.articulos) {
    const e = a.expresiones.find((x) => clave(x.titulo) === clave(p));
    if (e?.acepciones.length) return `📚 *${e.titulo}* (en la entrada *${a.titulo}*)\n${e.acepciones.join("\n")}\n${PIE}`;
  }
  const bloques = r.articulos.map((a) => {
    const lineas = [`📚 *${a.titulo}*${a.etimologia ? ` · ${a.etimologia}` : ""}`];
    lineas.push(...a.acepciones.slice(0, RAE.MAX_ACEPCIONES));
    if (a.acepciones.length > RAE.MAX_ACEPCIONES) lineas.push(`…y ${a.acepciones.length - RAE.MAX_ACEPCIONES} acepciones más en dle.rae.es/${encodeURIComponent(p)}`);
    if (!a.acepciones.length) lineas.push("(sin acepciones en la entrada; mirá dle.rae.es)");
    if (a.expresiones.length) {
      const titulos = a.expresiones.map((e) => e.titulo);
      lineas.push(`Expresiones (.rae <expresión>): ${titulos.slice(0, RAE.MAX_EXPRESIONES).join(" · ")}${titulos.length > RAE.MAX_EXPRESIONES ? ` (+${titulos.length - RAE.MAX_EXPRESIONES})` : ""}`);
    }
    return lineas.join("\n");
  });
  return `${bloques.join("\n\n")}\n${PIE}`;
}

// .rae <word or phrase>
export async function definir(palabra) {
  const p = limpio(palabra);
  if (!p) return null;
  let html;
  try {
    html = await _dep.pedir(`${RAE.URL}${encodeURIComponent(p)}`);
  } catch (e) {
    return `No pude consultar la RAE ahora (${String(e.message || e).slice(0, 80)}). Probá en un rato.`;
  }
  return textoRae(p, parsearRae(html));
}
