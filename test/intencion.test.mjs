import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import * as I from "../lib/intencion.js";
import { entrenar, partesPorAutor, medir, ENTRENAMIENTO } from "../lib/intencion-entrenamiento.js";

// The classifier that reads whether a message is someone selling or looking for something (lib/intencion.js), and how
// its weights are made (lib/intencion-entrenamiento.js). What the bot does with what it reads is in
// test/compraventa-intencion.test.mjs. The phrases here were written for these tests.

const ARCHIVO = new URL("../lib/intencion-modelo.json", import.meta.url);

test("las palabras de un mensaje: sin mayúsculas ni acentos, los dígitos todos iguales, los signos aparte y el link como una", () => {
  assert.deepEqual(I.palabrasDe("¡Vendo CAMPERA talle M a $1.500! A las Órdenes: https://ejemplo.com/a?b=1 (2x1)"), ["¡", "vendo", "campera", "talle", "m", "a", "$", "0", ".", "000", "!", "a", "las", "ordenes", ":", "URL", "(", "0x0", ")"]);
  assert.deepEqual(I.palabrasDe("$ 300"), I.palabrasDe("$ 457"), "dos precios tienen la misma forma, y ningún número queda");
  assert.equal(I.palabrasDe("palabra ".repeat(200)).length, I.INTENCION.MAX_PALABRAS);
  for (const nada of ["", "   ", null, undefined]) assert.deepEqual(I.palabrasDe(nada), []);
});

// The weights in the file were trained with these very slots: a change in how a message is cut up or hashed moves
// every feature to another's weight, and nothing fails but the answers. This does.
test("los rasgos de un mensaje caen siempre en las mismas cubetas", () => {
  assert.deepEqual(I.rasgos("vendo", 16384).sort((a, b) => a - b), [2573, 2599, 3213, 3377, 3849, 3892, 4811, 5258, 7832, 9065, 9563, 9782, 11639, 15069, 15560]);
  assert.deepEqual(I.rasgos("   ", 16384), [3849], "sin palabras, solo el largo");
  // Three words: each one, the two pairs, their pieces of 3, 4 and 5 letters (5 + 4 + 3, 4 + 3 + 2 and 6 + 5 + 4),
  // the word and the pair it opens with, and the length.
  assert.equal(I.rasgos("vendo mesa ratona", 16384).length, 3 + 2 + 12 + 9 + 15 + 2 + 1);
  const largo = I.rasgos("Buenas tardes, tengo una bicicleta rodado 26 casi sin uso, cualquier consulta me escriben al privado", 64);
  assert.equal(new Set(largo).size, largo.length, "cada cubeta una vez");
  assert.ok(largo.every((s) => Number.isInteger(s) && s >= 0 && s < 64));
  assert.deepEqual(I.rasgos("Vendo", 16384).sort(), I.rasgos("VENDO", 16384).sort());
  assert.notDeepEqual(I.rasgos("vendo mesa", 16384).sort(), I.rasgos("mesa vendo", 16384).sort(), "el orden cuenta: con qué abre, y qué palabra sigue a cuál");
});

test("puntuar: los pesos de sus cubetas, sumados, con el mensaje pesando lo mismo sea largo o corto", () => {
  const cubetas = 16384;
  const vacio = { cubetas, escala: 0.1, sesgo: [0, Math.log(3), 0], pesos: new Int8Array(cubetas * 3) };
  const [n, v, c] = I.puntuar(vacio, "lo que sea");
  assert.ok(Math.abs(n - 0.2) < 1e-9 && Math.abs(v - 0.6) < 1e-9 && Math.abs(c - 0.2) < 1e-9, "sin pesos, lo que diga el sesgo");
  // Every slot of "vendo" pushes "vender" by 10 * 0.1: 15 slots, divided by the root of 15.
  const modelo = { ...vacio, sesgo: [0, 0, 0], pesos: new Int8Array(cubetas * 3) };
  for (const s of I.rasgos("vendo", cubetas)) modelo.pesos[s * 3 + 1] = 10;
  const esperado = Math.exp(Math.sqrt(15)) / (Math.exp(Math.sqrt(15)) + 2);
  const p = I.puntuar(modelo, "vendo");
  assert.ok(Math.abs(p[1] - esperado) < 1e-9, `${p[1]} en vez de ${esperado}`);
  assert.ok(Math.abs(p[0] + p[1] + p[2] - 1) < 1e-9);
  assert.ok(Math.abs(p[0] - p[2]) < 1e-12);
});

test("el modelo va al archivo y vuelve igual, y uno que no se sabe leer se rechaza", () => {
  const modelo = { cubetas: 8, escala: 0.25, sesgo: [0.5, -1, 2], pesos: Int8Array.from({ length: 24 }, (_, i) => i * 11 - 127) };
  const archivo = JSON.parse(JSON.stringify(I.aArchivo(modelo, { entrenado: "2026-01-02" })));
  assert.equal(archivo.entrenado, "2026-01-02");
  const vuelto = I.deArchivo(archivo);
  assert.deepEqual([vuelto.cubetas, vuelto.escala, vuelto.sesgo, [...vuelto.pesos]], [8, 0.25, [0.5, -1, 2], [...modelo.pesos]]);
  for (const [que, roto] of [
    ["otro formato", { ...archivo, formato: 2 }],
    ["las clases en otro orden", { ...archivo, clases: ["nada", "comprar", "vender"] }],
    ["pesos de menos", { ...archivo, pesos: archivo.pesos.slice(4) }],
    ["otra cantidad de cubetas", { ...archivo, cubetas: 16 }],
    ["sin escala", { ...archivo, escala: 0 }],
    ["un sesgo que no es un número", { ...archivo, sesgo: [0.5, null, 2] }],
    ["nada", null],
  ]) {
    assert.throws(() => I.deArchivo(roto), /no es un modelo de intención/, que);
  }
});

test("sin el archivo de pesos, o con uno que no se lee, no hay modelo y el log lo dice", (t) => {
  const dicho = t.mock.method(console, "error", () => {});
  const modelo = { cubetas: 8, escala: 0.25, sesgo: [0.5, -1, 2], pesos: new Int8Array(24) };
  assert.equal(I.cargarModelo(() => JSON.stringify(I.aArchivo(modelo))).cubetas, 8);
  assert.equal(dicho.mock.callCount(), 0);
  const noEsta = () => {
    throw new Error("ENOENT: no such file");
  };
  for (const [leer, motivo] of [[noEsta, /ENOENT/], [() => "{ esto no es JSON", /JSON/], [() => JSON.stringify({ formato: 1 }), /no es un modelo de intención/]]) {
    assert.equal(I.cargarModelo(leer), null);
    assert.match(dicho.mock.calls.at(-1).arguments.join(" "), motivo);
  }
  assert.equal(dicho.mock.callCount(), 3);
});

test("la intención: la clase más probable entre vender y comprar, si llega al umbral", (t) => {
  const real = I._dep.probabilidades;
  t.after(() => (I._dep.probabilidades = real));
  const con = (p, texto = "algo", ...resto) => {
    I._dep.probabilidades = () => p;
    return I.intencionDe(texto, ...resto);
  };
  assert.equal(I.INTENCION.UMBRAL, 0.9);
  assert.equal(con([0.05, 0.9, 0.05]), "vender");
  assert.equal(con([0.11, 0.89, 0]), null);
  assert.equal(con([0.02, 0.03, 0.95]), "comprar");
  assert.equal(con([0.04, 0.48, 0.48]), null, "entre las dos, ninguna llega");
  assert.equal(con([0.99, 0.005, 0.005]), null);
  assert.equal(con([0.3, 0.7, 0], "algo", 0.7), "vender", "con otro umbral");
  assert.equal(con(null), null, "sin modelo no lee nada");
  I._dep.probabilidades = () => assert.fail("un mensaje sin palabras no se le pregunta al modelo");
  for (const nada of ["", "  \n ", null]) assert.equal(I.intencionDe(nada), null);
});

// Nine messages a class, from three people, as plain as they come.
const DE_JUGUETE = [
  ["vender", ["vendo mesa", "vendo silla", "vendo bici usada", "tengo mesa en venta", "tengo silla en venta", "tengo bici en venta", "liquido mesa barata", "liquido silla barata", "liquido bici barata"]],
  ["comprar", ["busco mesa", "busco silla", "busco bici usada", "necesito una mesa", "necesito una silla", "necesito una bici", "quien tiene una mesa", "quien tiene una silla", "quien tiene una bici"]],
  ["nada", ["hola que tal", "muchas gracias", "buen dia gente", "jaja me muero", "nos vemos manana", "que frio hace hoy", "feliz cumple", "ya llego el colectivo", "que lindo dia"]],
].flatMap(([clase, textos]) => textos.map((texto, i) => ({ texto, clase, autor: `persona ${i % 3}`, fecha: `2026-01-${String(10 + i).padStart(2, "0")}` })));
const masProbable = (modelo, texto) => {
  const p = I.puntuar(modelo, texto);
  return I.CLASES[p.indexOf(Math.max(...p))];
};

test("entrenar: aprende de los mensajes etiquetados, y de los mismos mensajes salen los mismos pesos", () => {
  const modelo = entrenar(DE_JUGUETE);
  assert.equal(modelo.cubetas, ENTRENAMIENTO.CUBETAS);
  assert.equal(modelo.pesos.length, ENTRENAMIENTO.CUBETAS * 3);
  assert.ok(modelo.pesos.some((w) => Math.abs(w) === 127), "los pesos ocupan todo el byte");
  for (const [texto, clase] of [["vendo un sillon", "vender"], ["tengo heladera en venta", "vender"], ["busco un sillon", "comprar"], ["necesito una heladera", "comprar"], ["gracias gente", "nada"], ["que tal el dia", "nada"]]) {
    assert.equal(masProbable(modelo, texto), clase, texto);
  }
  const otraVez = entrenar(DE_JUGUETE);
  assert.deepEqual([otraVez.escala, otraVez.sesgo, Buffer.from(otraVez.pesos.buffer).toString("base64")], [modelo.escala, modelo.sesgo, Buffer.from(modelo.pesos.buffer).toString("base64")]);
  assert.throws(() => entrenar([{ texto: "hola", clase: "saludar" }]), /clase desconocida: saludar/);
});

// Sellers repeat their ads: what only one of them writes (a brand, a turn of phrase) says who wrote the message and
// not what it's for, and it would be that person's words in a public file.
test("entrenar: lo que escribió una sola persona no lleva peso", () => {
  const conMarca = [...DE_JUGUETE, ...["zapallito premium", "zapallito premium oferta", "zapallito premium hoy"].map((texto) => ({ texto, clase: "vender", autor: "una sola", fecha: "2026-01-20" }))];
  const cubetas = ENTRENAMIENTO.CUBETAS;
  const deLosDemas = new Set(DE_JUGUETE.flatMap((e) => I.rasgos(e.texto, cubetas)));
  const soloSuyas = I.rasgos("zapallito premium", cubetas).filter((s) => !deLosDemas.has(s));
  assert.ok(soloSuyas.length > 10);
  const pesosEn = (modelo, slots) => slots.flatMap((s) => [...modelo.pesos.subarray(s * 3, s * 3 + 3)]);
  assert.ok(pesosEn(entrenar(conMarca, { minAutores: 1 }), soloSuyas).some((w) => w !== 0), "contando lo de una sola persona, sus palabras pesan");
  const modelo = entrenar(conMarca);
  assert.equal(ENTRENAMIENTO.MIN_AUTORES, 2);
  assert.ok(pesosEn(modelo, soloSuyas).every((w) => w === 0), "y sin contarlo, ninguna");
  // What three people wrote does: "vendo", from the toy messages.
  assert.ok(pesosEn(modelo, I.rasgos("vendo", cubetas)).some((w) => w !== 0));
});

test("las partes para medir: cada persona entera en una sola, y parejas", () => {
  const ejemplos = [10, 7, 5, 3, 3, 2, 2, 1, 1, 1].flatMap((cuantos, a) => Array.from({ length: cuantos }, () => ({ texto: "x", clase: "nada", autor: a })));
  const parte = partesPorAutor(ejemplos, 5);
  const deCada = new Map();
  ejemplos.forEach((e, i) => deCada.set(e.autor, (deCada.get(e.autor) || new Set()).add(parte[i])));
  assert.ok([...deCada.values()].every((partes) => partes.size === 1), "nadie en dos partes");
  const tamanos = [0, 1, 2, 3, 4].map((j) => parte.filter((p) => p === j).length);
  assert.deepEqual([...tamanos].sort((a, b) => b - a), [10, 7, 6, 6, 6]);
  // Without an author, each message is its own.
  assert.equal(new Set(partesPorAutor([{ texto: "a" }, { texto: "b" }, { texto: "c" }], 3)).size, 3);
});

test("medir: las reglas solas y con el modelo detrás, sobre mensajes con los que no se entrenó", () => {
  // The "rules" here read what opens with "vendo" and nothing else, and one thing that isn't an offer.
  const reglaDe = (texto) => (/^vendo\b/.test(texto) || texto === "jaja me muero" ? "vender" : null);
  const m = medir(DE_JUGUETE, { reglaDe, umbral: 0.5 });
  assert.deepEqual(m.porAutor.reglas, { vender: { hay: 9, aciertos: 3, deMas: 1 }, comprar: { hay: 9, aciertos: 0, deMas: 0 } });
  assert.ok(m.porAutor.conModelo.vender.aciertos > 3 && m.porAutor.conModelo.comprar.aciertos > 0, "el modelo suma a las reglas");
  assert.ok(m.porAutor.conModelo.vender.deMas >= 1, "lo que las reglas leen mal, mal queda: al modelo no se le pregunta");
  assert.equal(m.porAutor.lecturas.length, DE_JUGUETE.length);
  assert.equal(m.porAutor.lecturas[DE_JUGUETE.findIndex((e) => e.texto === "jaja me muero")], "vender");
  // The last third by date: the three latest of each class.
  assert.deepEqual([m.alFinal.reglas.vender.hay, m.alFinal.reglas.comprar.hay], [3, 3]);
  assert.equal(m.alFinal.lecturas.filter((x) => x !== undefined).length, 9);
  assert.equal(medir(DE_JUGUETE.map(({ fecha, ...e }) => e), { umbral: 0.5 }).alFinal, null, "sin fechas no hay último tercio");
  // With a threshold nothing reaches, the model adds nothing.
  assert.deepEqual(medir(DE_JUGUETE, { reglaDe, umbral: 1.1 }).porAutor.conModelo, m.porAutor.reglas);
});

// The weights the bot ships with. If a new training breaks one of these, look at it before changing the phrase: they
// are as plain as an offer, a request and a chat message come.
test("los pesos del repo se leen, y leen lo más claro", () => {
  const archivo = JSON.parse(readFileSync(ARCHIVO, "utf8"));
  assert.equal(archivo.cubetas, ENTRENAMIENTO.CUBETAS);
  assert.ok(archivo.ejemplos.vender > 0 && archivo.ejemplos.comprar > 0 && archivo.ejemplos.nada > 0);
  assert.match(archivo.entrenado, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(statSync(ARCHIVO).size < 100 * 1024, "es chico: cabe en un mensaje de WhatsApp");
  assert.doesNotThrow(() => I.deArchivo(archivo));
  const p = I.probabilidades("vendo una mesa");
  assert.ok(p.length === 3 && Math.abs(p[0] + p[1] + p[2] - 1) < 1e-9);
  for (const texto of ["$ 350", "200 pesos cada una", "2 por $ 300", "Buenas! Tengo una cuna para vender, cualquier consulta al privado", "Les comparto mi emprendimiento de velas artesanales, cualquier consulta a las órdenes", "Tengo lote de ropa de bebé, todo impecable"]) {
    assert.equal(I.intencionDe(texto), "vender", texto);
  }
  for (const texto of ["Buenas, alguien de casualidad vende una mochila?", "Alguien que venda un monitor?", "Hola, alguien tiene una cuna para vender?", "Hola alguien vende zapatillas talle 40?"]) {
    assert.equal(I.intencionDe(texto), "comprar", texto);
  }
  for (const texto of ["jajaja", "gracias!", "qué talle es?", "Precio?", "buen día gente", "ok dale", "me pasás fotos?", "feliz cumple!", "no entendí cómo se usa el bot", "muchas gracias por la compra", "hola"]) {
    assert.equal(I.intencionDe(texto), null, texto);
  }
});
