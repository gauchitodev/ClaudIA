// Definiciones del Diccionario de la lengua española (dle.rae.es). No hay API pública: se lee la página con el cliente
// del core de Node (Cloudflare le responde 403 al fetch nativo de undici) y se parsea el HTML actual, que es simple: título en un
// h1, etimología en un párrafo de intro, acepciones en la primera lista "c-definitions" y las expresiones en pares de
// h3 y lista. Una expresión ("mal de ojo") lleva a la entrada de su palabra ("mal"), así que se busca entre las
// expresiones de la entrada la que coincide con lo consultado y se muestra esa primero. Las palabras que no están
// vienen como "no está en el Diccionario", con o sin lemas parecidos.
import { load } from "cheerio";
import { pedirHttp } from "./http.js";

export const RAE = {
  URL: "https://dle.rae.es/",
  MAX_ACEPCIONES: 10, // por artículo; el resto se resume en "y N más"
  MAX_EXPRESIONES: 8,
  TIMEOUT_MS: 10000,
  // Cloudflare deja pasar a un cliente que se identifica como bot, y corta con un "challenge" (403) al que se hace
  // pasar por Chrome sin serlo (le faltan la huella TLS y las cabeceras del navegador). Así que nada de disfraces.
  UA: "ClaudIA/1.0 (bot de WhatsApp; +https://github.com/gauchitodev/ClaudIA-mi-edit-de-SawBot)",
};

// Inyectable para los tests.
export const _dep = {
  pedir: async (url) => {
    const res = await pedirHttp(url, { headers: { "User-Agent": RAE.UA, "Accept-Language": "es-UY,es;q=0.9", Accept: "text/html,application/xhtml+xml" }, timeoutMs: RAE.TIMEOUT_MS });
    if (res.status !== 200) throw new Error(`la RAE respondió ${res.status}`);
    return res.text();
  },
};

const SUPER = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
// "pancho1, cha" → "pancho¹, cha": el número de homógrafo va pegado a la palabra
export const superindices = (t) => String(t).replace(/(?<=\p{L})\d+/gu, (d) => [...d].map((x) => SUPER[x]).join(""));
const limpio = (t) => String(t || "").replace(/\s+/g, " ").trim();
// para comparar lo consultado con el título de una expresión: sin mayúsculas, tildes ni punto final
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
    // en orden: la primera lista es la de la palabra; después, cada h3 abre una expresión y la lista que sigue es la suya
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
  // si lo consultado es una expresión de la entrada ("mal de ojo" en "mal"), va esa sola
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

// .rae <palabra o expresión>
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
