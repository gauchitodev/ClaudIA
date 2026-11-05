import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { clienteFalso, ultimoEnviado } from "./helpers.mjs";

// .versiculo (plugins/versiculos-biblia.js, lib/biblia.js): one at random, and the one asked for by reference. The
// plugin talks to bolls.life through fetch; here the global fetch is swapped for canned chapters.
const versos = (n, textos = {}) => Array.from({ length: n }, (_, i) => ({ verse: i + 1, text: textos[i + 1] || `Versículo ${i + 1}.` }));
const CAPITULOS = {
  "3/18": versos(30, { 22: "No te echarás con varón como con mujer;  es abominación." }),
  "43/3": versos(36, { 16: "Porque de tal manera amó Dios al mundo,  que ha dado a su Hijo unigénito.", 17: "Porque no envió Dios a su Hijo al mundo para condenar al mundo." }),
  "19/23": versos(6, { 1: "Jehová es mi pastor;  nada me faltará." }),
  "19/119": versos(176),
  "65/1": versos(25),
};
let pedidas = [];
const fetchFalso = async (url) => {
  const ruta = new URL(url).pathname;
  pedidas.push(ruta);
  const json = async (cuerpo) => ({ ok: true, status: 200, json: async () => cuerpo });
  if (ruta === "/get-random-verse/RV1960/") return json({ book: 42, chapter: 17, verse: 36, text: "Dos estarán en el campo;  el uno será tomado,  y el otro dejado." });
  const capitulo = ruta.match(/^\/get-text\/RV1960\/(\d+)\/(\d+)\/$/);
  if (!capitulo) return { ok: false, status: 404, json: async () => ({}) };
  const [, libro, numero] = capitulo;
  if (CAPITULOS[`${libro}/${numero}`]) return json(CAPITULOS[`${libro}/${numero}`]);
  if (libro === "19" || libro === "20") return json(versos(3)); // any other psalm or proverb, for the ones at random
  return json([]); // bolls answers [] for a chapter that isn't there
};
let plugin, B, fetchReal;
before(async () => {
  fetchReal = globalThis.fetch;
  globalThis.fetch = fetchFalso;
  B = await import("../lib/biblia.js");
  ({ default: plugin } = await import("../plugins/versiculos-biblia.js"));
});
beforeEach(() => {
  globalThis.fetch = fetchFalso;
  B.olvidarCapitulos();
  pedidas = [];
});
after(() => {
  globalThis.fetch = fetchReal;
});
const correr = async (command, texto = "", usedPrefix = ".") => {
  const client = clienteFalso();
  await plugin.run({ chat: "grupo@g.us", sender: "a@lid" }, { client, command, args: texto ? texto.split(" ") : [], usedPrefix });
  return ultimoEnviado().msg.text;
};

test("biblia: salmo y versículo al azar con el formato de siempre, y aviso si la API falla", async () => {
  assert.match(await correr("salmo"), /^\*📖 LIBRO DE:\* Salmos\n\n\*✍️Capítulo:\* \d+\n\n\*Versículo: #\d+\*\n\n📝 .+\n$/);
  assert.match(pedidas[0], /^\/get-text\/RV1960\/19\/\d+\/$/, "un salmo al azar");
  const texto = await correr("versiculo");
  assert.match(texto, /^\*📖 LIBRO DE:\* Lucas\n\n\*✍️Capítulo:\* 17\n\n\*Versículo: #36\*/);
  assert.ok(texto.includes("Dos estarán en el campo; el uno será tomado, y el otro dejado."), "colapsa los espacios dobles de bolls");
  assert.equal(pedidas.at(-1), "/get-random-verse/RV1960/", "sin pedir la lista de libros");
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const errorReal = console.error;
  console.error = () => {};
  try {
    assert.equal(await correr("salmo"), "No pude traer el versículo ahora, probá más tarde.");
    assert.equal(await correr("versiculo", "Juan 3:16"), "No pude traer el versículo ahora, probá más tarde.");
  } finally {
    console.error = errorReal;
  }
});

test("leerReferencia: libro, capítulo y versículos como los escribe la gente", () => {
  const leer = (t) => {
    const r = B.leerReferencia(t);
    return r.error ? r : [r.libro.nombre, r.capitulo, r.desde, r.hasta];
  };
  for (const forma of ["Levítico 18:22", "levitico 18.22", "LEVITICO 18 22", "Lv 18,22", "lv18:22", "Lev 18 : 22", "  Levit 18:22  "]) {
    assert.deepEqual(leer(forma), ["Levítico", 18, 22, 22], forma);
  }
  assert.deepEqual(leer("1 Corintios 13:4-7"), ["1 Corintios", 13, 4, 7]);
  assert.deepEqual(leer("1corintios 13:4-7"), ["1 Corintios", 13, 4, 7]);
  assert.deepEqual(leer("I Corintios 13"), ["1 Corintios", 13, undefined, undefined]);
  assert.deepEqual(leer("1 Co 13:4"), ["1 Corintios", 13, 4, 4]);
  assert.deepEqual(leer("II Reyes 2:3"), ["2 Reyes", 2, 3, 3]);
  assert.deepEqual(leer("1 Juan 4:8"), ["1 Juan", 4, 8, 8]);
  assert.deepEqual(leer("Juan 4:8"), ["Juan", 4, 8, 8]);
  assert.deepEqual(leer("Jn 3:16"), ["Juan", 3, 16, 16]);
  assert.deepEqual(leer("Cantar de los Cantares 2:1"), ["Cantares", 2, 1, 1]);
  assert.deepEqual(leer("Salmo 23"), ["Salmos", 23, undefined, undefined]);
  assert.deepEqual(leer("Sal 23:1"), ["Salmos", 23, 1, 1]);
  assert.deepEqual(leer("Salmos 23 1-3"), ["Salmos", 23, 1, 3]);
  assert.deepEqual(leer("Isaías 53"), ["Isaías", 53, undefined, undefined], "la I de Isaías no es un número romano");
  assert.deepEqual(leer("Apocalipsis"), ["Apocalipsis", undefined, undefined, undefined]);
  assert.deepEqual(leer("Hechos 2:1-4"), ["Hechos", 2, 1, 4]);
  assert.deepEqual(leer("Juan 3:17-16"), ["Juan", 3, 16, 17], "al revés, se da vuelta");
  // one-chapter books: the number is the verse, unless it's a 1 by itself
  assert.deepEqual(leer("Judas 3"), ["Judas", 1, 3, 3]);
  assert.deepEqual(leer("Judas 3-5"), ["Judas", 1, 3, 5]);
  assert.deepEqual(leer("Judas 1:3"), ["Judas", 1, 3, 3]);
  assert.deepEqual(leer("Judas 1"), ["Judas", 1, undefined, undefined]);
  assert.deepEqual(leer("Judas 1-5"), ["Judas", 1, 1, 5]);
  assert.deepEqual(leer("Filemón 6"), ["Filemón", 1, 6, 6]);
  assert.deepEqual(leer("3 Juan 4"), ["3 Juan", 1, 4, 4]);
  // what can't be read
  assert.deepEqual(leer("ju 3"), { error: "ambiguo", nombre: "ju", opciones: ["Jueces", "Juan", "Judas"] });
  assert.deepEqual(leer("Es 1"), { error: "ambiguo", nombre: "Es", opciones: ["Esdras", "Ester"] });
  assert.deepEqual(leer("levitiko 1"), { error: "libro", nombre: "levitiko" });
  for (const forma of ["18:22", "", "   ", "Levítico 0:3", "Juan 3:0", "Juan 3-5"]) assert.deepEqual(leer(forma), { error: "formato" }, JSON.stringify(forma));
  assert.equal(B.LIBROS.length, 66);
  assert.deepEqual(B.LIBROS.map((l) => l.capitulos).reduce((a, b) => a + b), 1189, "los capítulos de la Biblia");
});

test(".versiculo Levítico 18:22 trae ese; un tramo, un capítulo o un libro al azar; los límites y los errores", async () => {
  assert.equal(await correr("versiculo", "Levítico 18:22"), "*📖 LIBRO DE:* Levítico\n\n*✍️Capítulo:* 18\n\n*Versículo: #22*\n\n📝 No te echarás con varón como con mujer; es abominación.\n");
  assert.equal(await correr("biblia", "lv 18 22"), await correr("versículo", "Levitico 18.22"), "con cualquier alias y forma");
  assert.deepEqual(pedidas, ["/get-text/RV1960/3/18/"], "el capítulo se pide una vez y queda");
  // a stretch, numbered
  assert.equal(await correr("versiculo", "Juan 3:16-17"), "*📖 LIBRO DE:* Juan\n\n*✍️Capítulo:* 3\n\n*Versículos: #16 al 17*\n\n*16* Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito.\n*17* Porque no envió Dios a su Hijo al mundo para condenar al mundo.\n");
  // a whole chapter, and .salmo 23 is the same
  const salmo23 = await correr("versiculo", "Salmos 23");
  assert.match(salmo23, /^\*📖 LIBRO DE:\* Salmos\n\n\*✍️Capítulo:\* 23\n\n\*Versículos: #1 al 6\*\n\n\*1\* Jehová es mi pastor; nada me faltará\.\n\*2\* Versículo 2\.\n/);
  assert.ok(salmo23.endsWith("*6* Versículo 6.\n"), "termina en el último, sin aviso de que sigue");
  assert.equal(await correr("salmo", "23"), salmo23);
  assert.equal(await correr("salmos", "23:1"), "*📖 LIBRO DE:* Salmos\n\n*✍️Capítulo:* 23\n\n*Versículo: #1*\n\n📝 Jehová es mi pastor; nada me faltará.\n");
  // a long chapter goes out 30 at a time, with how to go on, with the prefix in use
  const largo = await correr("versiculo", "Salmos 119", "!");
  assert.match(largo, /\*Versículos: #1 al 30 \(de 176\)\*\n\n\*1\* Versículo 1\.\n/);
  assert.ok(largo.includes("\n*30* Versículo 30.\n") && !largo.includes("*31*"), "corta en el 30");
  assert.ok(largo.endsWith("\n_Sigue con !versiculo Salmos 119:31-60_\n"), largo.slice(-80));
  const sigue = await correr("versiculo", "Salmos 119:31-60");
  assert.match(sigue, /\*Versículos: #31 al 60\*\n\n\*31\* /);
  assert.ok(sigue.endsWith("*60* Versículo 60.\n"), "un tramo de 30 justos no avisa");
  assert.ok((await correr("versiculo", "Salmos 119:150-176")).endsWith("*176* Versículo 176.\n"));
  const tramoLargo = await correr("versiculo", "Salmos 119:100-176");
  assert.ok(tramoLargo.includes("*Versículos: #100 al 129 (de 176)*") && tramoLargo.endsWith("_Sigue con .versiculo Salmos 119:130-159_\n"), "un tramo largo también se corta");
  // past the end: the end is cut to the chapter's, the start says how many there are
  assert.match(await correr("versiculo", "Levítico 18:29-40"), /\*Versículos: #29 al 30\*\n\n\*29\* Versículo 29\.\n\*30\* Versículo 30\.\n$/);
  assert.match(await correr("versiculo", "Levítico 18:30-40"), /\*Versículo: #30\*\n\n📝 Versículo 30\.\n$/, "un tramo que queda en uno");
  assert.equal(await correr("versiculo", "Levítico 18:31"), "❌ Levítico 18 tiene 30 versículos.");
  assert.equal(await correr("versiculo", "Levítico 28"), "❌ Levítico tiene 27 capítulos.");
  assert.equal(await correr("versiculo", "Judas 2:1"), "❌ Judas tiene un solo capítulo.");
  assert.match(await correr("versiculo", "Judas 3"), /^\*📖 LIBRO DE:\* Judas\n\n\*✍️Capítulo:\* 1\n\n\*Versículo: #3\*/);
  // a book: one of its verses at random
  for (let i = 0; i < 10; i++) {
    const proverbio = await correr("versiculo", "Proverbios");
    assert.match(proverbio, /^\*📖 LIBRO DE:\* Proverbios\n\n\*✍️Capítulo:\* (\d+)\n\n\*Versículo: #[123]\*/);
    assert.ok(Number(proverbio.match(/Capítulo:\* (\d+)/)[1]) <= 31, "un capítulo que Proverbios tiene");
    assert.match(pedidas.at(-1), /^\/get-text\/RV1960\/20\/\d+\/$/);
  }
  // what can't be read, with the prefix in use
  assert.equal(await correr("versiculo", "ju 3"), "❌ «ju» puede ser Jueces, Juan o Judas: decime cuál.");
  assert.equal(await correr("versiculo", "levitiko 18:22"), "❌ No conozco el libro «levitiko». Escribilo como en la Biblia (Génesis, 1 Samuel, Juan...) o abreviado (Gn, 1 S, Jn).");
  assert.equal(await correr("versiculo", "18:22", "!"), "❌ Decime libro, capítulo y versículo: !versiculo Levítico 18:22. También un tramo (!versiculo Juan 3:16-17), un capítulo (!versiculo Salmos 23) o un libro (!versiculo Proverbios, uno al azar).");
  // .salmo with a book written out reads as written
  assert.match(await correr("salmo", "Juan 3:16"), /^\*📖 LIBRO DE:\* Juan\n\n\*✍️Capítulo:\* 3\n\n\*Versículo: #16\*/);
});
