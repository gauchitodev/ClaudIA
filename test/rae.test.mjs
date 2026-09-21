import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parsearRae, textoRae, definir, superindices, _dep, RAE } from "../lib/rae.js";

// Real dle.rae.es pages saved on 2026-09-05 (trimmed to #resultados; the synonym footers were stripped from "hacer").
const pagina = (nombre) => fs.readFileSync(new URL(`./fixtures/rae/${nombre}.html`, import.meta.url), "utf8");

test("una entrada con dos homógrafos: títulos con superíndice, etimología y acepciones", () => {
  const r = parsearRae(pagina("pancho"));
  assert.equal(r.tipo, "entrada");
  assert.deepEqual(
    r.articulos.map((a) => [a.titulo, a.etimologia, a.acepciones.length]),
    [
      ["pancho¹, cha", "Del lat. pantex, -ĭcis 'panza'.", 4],
      ["pancho²", "Acrón. de pan y chorizo.", 2],
    ],
  );
  assert.equal(r.articulos[0].acepciones[0], "1. adj. Tranquilo, inalterado.");
  assert.equal(r.articulos[1].acepciones[0], "1. m. Arg. y Ur. perrito caliente.");
  const t = textoRae("pancho", r);
  assert.match(t, /^📚 \*pancho¹, cha\* · Del lat\. pantex, -ĭcis 'panza'\.\n1\. adj\. Tranquilo, inalterado\.\n/);
  assert.match(t, /\n\n📚 \*pancho²\* · Acrón\. de pan y chorizo\.\n1\. m\. Arg\. y Ur\. perrito caliente\.\n2\. m\. Par\./);
  assert.match(t, /\n_Fuente: RAE, Diccionario de la lengua española\._$/);
  assert.doesNotMatch(t, /Sin\.:|Expresiones/, "sin sinónimos ni expresiones cuando no hay");
});

test("una entrada larga se recorta a diez acepciones y lista las expresiones", () => {
  const r = parsearRae(pagina("hacer"));
  const [a] = r.articulos;
  assert.equal(a.titulo, "hacer");
  assert.equal(a.acepciones.length, 58);
  assert.equal(a.expresiones.length, 43);
  assert.equal(a.expresiones[0].titulo, "a medio hacer");
  assert.deepEqual(a.expresiones[0].acepciones, ["1. loc. adj. Dicho de una cosa: A medio camino entre su comienzo y su terminación. U. t. c. loc. adv."]);
  assert.ok(a.expresiones.every((e) => e.acepciones.length >= 1), "cada expresión tiene al menos una acepción");
  const t = textoRae("hacer", r);
  assert.match(t, /\n10\. tr\. Componer, mejorar, perfeccionar\..*\n…y 48 acepciones más en dle\.rae\.es\/hacer\n/);
  assert.doesNotMatch(t, /\n11\. /);
  assert.match(t, /\nExpresiones \(\.rae <expresión>\): a medio hacer · haberla hecho buena · .* \(\+35\)\n/);
});

test("consultar una expresión muestra solo esa, aunque la RAE devuelva la entrada de la palabra", () => {
  const r = parsearRae(pagina("hacer"));
  const esperado = "📚 *a medio hacer* (en la entrada *hacer*)\n1. loc. adj. Dicho de una cosa: A medio camino entre su comienzo y su terminación. U. t. c. loc. adv.\n_Fuente: RAE, Diccionario de la lengua española._";
  assert.equal(textoRae("a medio hacer", r), esperado);
  assert.equal(textoRae("  A MEDIO   hacer. ", r), esperado, "sin importar mayúsculas, espacios ni punto final");
  assert.equal(textoRae("hacer alguna", r).split("\n").length, 2 + 1, "otra expresión, la suya");
  assert.match(textoRae("hacer algo raro", r), /^📚 \*hacer\* · Del lat\. facĕre\.\n1\. tr\./, "si no coincide con ninguna expresión, va la entrada entera");
});

test("palabra que no está pero tiene parecidas, y palabra que no está y punto", () => {
  const s = parsearRae(pagina("chivito"));
  assert.deepEqual(s, { tipo: "sugerencias", sugerencias: ["chinito, ta", "chivato, ta"] });
  assert.deepEqual(parsearRae(pagina("chivito").replace("chinito, ta", "be1")).sugerencias, ["be¹", "chivato, ta"], "los homógrafos sugeridos también con superíndice");
  assert.equal(textoRae("chivito", s), "«chivito» no está en el diccionario de la RAE. ¿Quisiste decir chinito, ta · chivato, ta?");
  const n = parsearRae(pagina("asdfgh"));
  assert.deepEqual(n, { tipo: "nada" });
  assert.equal(textoRae("asdfgh", n), "«asdfgh» no está en el diccionario de la RAE.");
  assert.deepEqual(parsearRae("<html><body><p>nada</p></body></html>"), { tipo: "nada" }, "una página rara no rompe");
});

test("superíndices solo para el número pegado a la palabra", () => {
  assert.equal(superindices("pancho1, cha"), "pancho¹, cha");
  assert.equal(superindices("casa12"), "casa¹²");
  assert.equal(superindices("mal de ojo"), "mal de ojo");
  assert.equal(superindices("1. m. 2 cosas"), "1. m. 2 cosas");
});

test("definir pide la página codificada, con user agent propio, y responde bien ante errores", async () => {
  const original = _dep.pedir;
  const pedidos = [];
  _dep.pedir = async (url) => {
    pedidos.push(url);
    return pagina("pancho");
  };
  try {
    assert.equal(await definir(""), null);
    assert.equal(await definir("  "), null);
    assert.match(await definir("  mal de   ojo "), /^📚 \*pancho¹, cha\*/);
    assert.deepEqual(pedidos, ["https://dle.rae.es/mal%20de%20ojo"], "la frase entera, codificada");
    _dep.pedir = async () => {
      throw new Error("la RAE respondió 503");
    };
    assert.equal(await definir("casa"), "No pude consultar la RAE ahora (la RAE respondió 503). Probá en un rato.");
  } finally {
    _dep.pedir = original;
  }
  assert.match(RAE.UA, /^ClaudIA\/1\.0 /, "user agent honesto: Cloudflare deja pasar a un bot declarado y corta al Chrome falso");
});
