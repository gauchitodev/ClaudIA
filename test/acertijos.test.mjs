import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import txt from "../lib/strings.js";

// The riddles (lib/acertijos.js, plugins/fun-acertijos.js): how an answer is read, the bank, which riddle comes next,
// the tries per person. And .ordenar (plugins/fun-ordenar-palabra.js), whose answers are read without accents too.
const G = "120363000000000111@g.us";
const ANA = "300000000000061@lid";
const BETO = "300000000000062@lid";

let A, JR, Acertijo, Ordenar, client;
before(async () => {
  await prepararBase("acertijos");
  A = await import("../lib/acertijos.js");
  JR = await import("../lib/juego-rapido.js");
  Acertijo = (await import("../plugins/fun-acertijos.js")).default;
  Ordenar = await import("../plugins/fun-ordenar-palabra.js");
  const F = await import("../database-functions.js");
  for (const quien of [ANA, BETO]) F.initDataDB({ chat: G, sender: quien, senderJid: "", pushName: "x" });
});
beforeEach(() => {
  client = clienteFalso();
  A.olvidarRecientes();
  A._dep.azar = Math.random;
});

const de = (respuesta) => A.ACERTIJOS.find((a) => a.respuesta === respuesta);
const textos = () => globalThis.enviados.map((e) => e.msg?.text);

test("normalizarRespuesta: sin artículo, posesivo ni «es» adelante, sin tildes ni signos", () => {
  for (const [texto, esperado] of [
    ["Un pez!", "pez"],
    ["es un pez", "pez"],
    ["LA LETRA A", "letra a"],
    ["la a", "a"],
    ["Río", "rio"],
    ["el muñeco de nieve", "muneco de nieve"],
    ["mi nombre", "nombre"],
    ["  los   fósforos. ", "fosforos"],
    ["la", "la"],
    ["", ""],
  ]) assert.equal(A.normalizarRespuesta(texto), esperado, JSON.stringify(texto));
  assert.equal(JR.limpiarRespuesta("¡Árbol!"), "arbol");
});

test("esRespuesta: la respuesta con o sin artículo, en singular o plural, con un margen para errores que no deja pasar otra palabra", () => {
  const casos = [
    ["un pez", ["pez", "un pez", "Un pez!", "el pez", "es un pez", "PEZ.", "peces", "pescado"], ["paz", "pes", "pan", "", "un"]],
    ["un piano", ["piano", "un piano", "el piano", "piamo"], ["pan", "guitarra"]],
    ["una nube", ["nube", "nubes", "las nubes"], ["nabe", "nuez"]],
    ["la letra A", ["a", "A", "la a", "la letra a", "letra A"], ["b", "la b", "letra b"]],
    ["una mesa", ["mesa", "una silla", "la cama", "un sillón"], ["misa", "mesada"]],
    ["los fósforos", ["fosforos", "fósforo", "los fosforos", "cerillas"], ["fosfato"]],
    ["la sombra del pez", ["sombra", "la sombra", "la sombra del pez", "el reflejo"], ["el pez", "pez"]],
    ["un río", ["rio", "río", "un rio", "el arroyo"], ["ojo", "un ojo", "tio"]],
    ["un muñeco de nieve", ["muneco de nieve", "el muñeco de nieve", "munecos de nieve", "muñeco de niebe"], ["muñeco"]],
    // one typo per word of five letters or more, as agreed: it also lets a neighbouring word through ("hombre"), the
    // price of forgiving "nombr" or "nonbre"
    ["tu nombre", ["nombre", "mi nombre", "el nombre", "su nombre", "nonbre"], ["apellido", "dni"]],
    ["el camaleón", ["camaleon", "camaleón", "el camalion"], ["leon", "cama"]],
    ["la letra C", ["c", "la c", "la letra c"], ["g", "la letra g"]],
  ];
  for (const [respuesta, valen, noValen] of casos) {
    const acertijo = de(respuesta);
    assert.ok(acertijo, `no está el acertijo de ${respuesta}`);
    for (const texto of valen) assert.equal(A.esRespuesta(acertijo, texto), true, `«${texto}» para ${respuesta}`);
    for (const texto of noValen) assert.equal(A.esRespuesta(acertijo, texto), false, `«${texto}» no es ${respuesta}`);
  }
});

test("el banco: cada acertijo con su pregunta, respuesta y pista, sin repetir preguntas ni respuestas, y los que estaban mal, arreglados", () => {
  assert.ok(A.ACERTIJOS.length >= 60, `quedaron pocos acertijos (${A.ACERTIJOS.length})`);
  const preguntas = new Set();
  const respuestas = new Map();
  for (const a of A.ACERTIJOS) {
    for (const campo of ["pregunta", "respuesta", "pista"]) assert.ok(typeof a[campo] === "string" && a[campo].trim(), `${campo} vacío en «${a.pregunta}»`);
    assert.ok(!preguntas.has(a.pregunta), `pregunta repetida: ${a.pregunta}`);
    preguntas.add(a.pregunta);
    const principal = A.normalizarRespuesta(a.respuesta);
    assert.ok(!respuestas.has(principal), `«${a.respuesta}» responde dos acertijos: ${respuestas.get(principal)} y ${a.pregunta}`);
    respuestas.set(principal, a.pregunta);
    // each one takes its own answers, and the others add something
    assert.equal(A.esRespuesta(a, a.respuesta), true, a.respuesta);
    for (const otra of a.otras || []) {
      assert.ok(A.normalizarRespuesta(otra) && A.normalizarRespuesta(otra) !== principal, `«${otra}» en ${a.respuesta}`);
      assert.equal(A.esRespuesta(a, otra), true, `${otra} para ${a.respuesta}`);
    }
  }
  assert.equal(A.ACERTIJOS.find((a) => a.pregunta.includes("medio de la noche")).respuesta, "la letra C", "el medio de «noche» es la C");
  assert.equal(A.ACERTIJOS.find((a) => a.pregunta.startsWith("Lana sube")).respuesta, "la navaja");
  assert.ok(!A.ACERTIJOS.some((a) => /bigotes|manecillas|lo vendes/.test(a.pregunta)), "los que no tenían sentido no están");
});

test("elegirAcertijo: no repite uno de los últimos 20 del grupo, y cada grupo lleva su cuenta", () => {
  A._dep.azar = () => 0; // always the first one free: the order of the bank
  const vistos = Array.from({ length: A.ACERTIJO.RECIENTES + 1 }, () => A.elegirAcertijo(G));
  assert.equal(new Set(vistos).size, vistos.length, "veintiuno seguidos, todos distintos");
  assert.equal(A.elegirAcertijo(G), vistos[0], "el primero vuelve cuando salió de los últimos 20");
  assert.equal(A.elegirAcertijo("otro@g.us"), A.ACERTIJOS[0], "en otro grupo la cuenta arranca de cero");
  A._dep.azar = () => 0.99999;
  assert.ok(A.ACERTIJOS.includes(A.elegirAcertijo(G)), "con el azar en el borde también sale uno");
});

// An update restarts main.js: the latest riddles of each group are in the database, and a lib/acertijos.js loaded
// again, as after a restart, still knows them. In memory, they started over.
test("elegirAcertijo: los últimos del grupo sobreviven a un reinicio", async () => {
  A._dep.azar = () => 0;
  const [primero, segundo, tercero] = A.ACERTIJOS;
  assert.deepEqual([A.elegirAcertijo(G), A.elegirAcertijo(G)], [primero, segundo]);
  const DeNuevo = await import(`../lib/acertijos.js?reinicio=${Date.now()}`);
  DeNuevo._dep.azar = () => 0;
  assert.equal(DeNuevo.elegirAcertijo(G).pregunta, tercero.pregunta, "los dos de recién no vuelven");
});

// Kept by their question, not by their place in the bank: an update that adds a riddle at the top would have moved
// the ones asked onto others, and the one just asked could come back.
test("elegirAcertijo: lo ya preguntado sigue siéndolo aunque el banco cambie", (t) => {
  A._dep.azar = () => 0;
  const [primero, segundo] = A.ACERTIJOS;
  assert.equal(A.elegirAcertijo(G), primero);
  const nuevo = { pregunta: "¿Qué es lo que llegó con la actualización?", respuesta: "un acertijo nuevo", pista: "Es nuevo." };
  A.ACERTIJOS.unshift(nuevo);
  t.after(() => A.ACERTIJOS.shift());
  assert.deepEqual([A.elegirAcertijo(G), A.elegirAcertijo(G)], [nuevo, segundo], "el de recién, ahora segundo en el banco, no vuelve");
});

// The riddle a game will ask: the dice pinned on it, with nothing recent.
function tocara(respuesta) {
  const i = A.ACERTIJOS.findIndex((a) => a.respuesta === respuesta);
  A._dep.azar = () => (i + 0.5) / A.ACERTIJOS.length;
}
const responder = async (quien, text, { pregunta, reacciones }) => {
  await Acertijo.before({ chat: G, sender: quien, isGroup: true, text, quoted: { id: pregunta }, react: async (e) => reacciones.push([quien, e]) }, { client });
};

test(".acertijo: tres intentos por persona; pasados, 🙅 aunque acierte; otro gana con la respuesta sin artículo", async () => {
  tocara("un pez");
  await Acertijo.run({ chat: G, sender: ANA, isGroup: true }, { client });
  const pregunta = `MSG${globalThis.enviados.length}`;
  assert.match(textos().at(-1), /^\*\[🧠\] Acertijo:\*\n\* Vive en el agua y, si lo sacás de ella, se muere\. ¿Qué es\?\n\n\*\[💡\] PISTA:\* .+\n\n\*\[❗\] RESPONDE A ESTE MENSAJE\* con la respuesta\.\n\*\[⏱️\]\* Tienen 30 segundos y 3 intentos cada uno\.$/);
  const reacciones = [];
  const r = { pregunta, reacciones };

  for (const intento of ["paz", "pan", "pes"]) await responder(ANA, intento, r);
  await responder(ANA, "un pez", r);
  assert.deepEqual(reacciones, [[ANA, "❌"], [ANA, "❌"], [ANA, "❌"], [ANA, "🙅"]], "el cuarto de Ana no cuenta, aunque sea la respuesta");
  // what doesn't quote the question, or is a command, isn't an answer
  await Acertijo.before({ chat: G, sender: BETO, isGroup: true, text: "pez", quoted: null, react: async (e) => reacciones.push([BETO, e]) }, { client });
  await responder(BETO, ".pez", r);
  assert.equal(reacciones.length, 4);
  // Beto has his own three
  await responder(BETO, "Pez!", r);
  assert.equal(reacciones.length, 4, "el que acierta no recibe reacción, recibe el mensaje");
  assert.match(textos().at(-1), /^\*\[🎉\] RESPUESTA CORRECTA!\*/);
  // the game is over: nothing more is taken
  const antes = globalThis.enviados.length;
  await responder(BETO, "pez", r);
  assert.deepEqual([globalThis.enviados.length, reacciones.length], [antes, 4]);
});

test(".acertijo: con uno en juego no abre otro, y lo elegido no cuenta como visto", async () => {
  tocara("una nube");
  await Acertijo.run({ chat: G, sender: ANA, isGroup: true }, { client });
  const pregunta = `MSG${globalThis.enviados.length}`;
  await Acertijo.run({ chat: G, sender: BETO, isGroup: true }, { client });
  assert.equal(textos().at(-1), txt.gameAlready);
  assert.deepEqual(A.recientesDe(G), [de("una nube")], "el pedido que no abrió nada no gastó un acertijo");
  await responder(BETO, "las nubes", { pregunta, reacciones: [] });
  assert.match(textos().at(-1), /RESPUESTA CORRECTA/);
});

test(".ordenar: la palabra vale con o sin tildes y en mayúsculas; otra cosa, ❌", async (t) => {
  const i = Ordenar.PALABRAS.indexOf("árbol");
  assert.ok(i >= 0, "las palabras van con su tilde");
  assert.ok(!Ordenar.PALABRAS.some((p) => ["rio", "arbol", "dia", "lapiz", "sueno", "cancion"].includes(p)), "sin las que estaban mal escritas");
  for (const respuesta of ["arbol", "ÁRBOL", "árbol"]) {
    t.mock.method(Math, "random", () => (i + 0.5) / Ordenar.PALABRAS.length);
    await Ordenar.default.run({ chat: G, sender: ANA, isGroup: true }, { client });
    t.mock.restoreAll();
    const pregunta = `MSG${globalThis.enviados.length}`;
    const reacciones = [];
    const mensaje = (text) => ({ chat: G, sender: BETO, isGroup: true, text, quoted: { id: pregunta }, react: async (e) => reacciones.push(e) });
    await Ordenar.default.before(mensaje("barol"), { client });
    assert.deepEqual(reacciones, ["❌"]);
    await Ordenar.default.before(mensaje(respuesta), { client });
    assert.match(textos().at(-1), /RESPUESTA CORRECTA/, respuesta);
  }
});
