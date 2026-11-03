import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { nodosQue } from "./helpers.mjs";

// Claudia's short-term memory (lib/contexto-chat.js): what stays (the last 6 hours, never fewer than 200 per chat,
// never more than the cap), in the order things were sent, and the changes a copy replays to end up the same.

let CC;
const MIN = 60 * 1000;
const HORA = 60 * MIN;
let n = 0;
const chatNuevo = () => `memoria-${++n}@g.us`;
const errorReal = console.error;

before(async () => {
  CC = await import("../lib/contexto-chat.js");
});
afterEach(() => {
  CC.alCambiarMemoria(null);
  console.error = errorReal;
});

const textos = (chat) => (CC.contextoChat.get(chat) || []).map((e) => e.texto);

test("memoria: guarda lo de las últimas 6 horas y nunca menos de los últimos 200", () => {
  const ahora = Date.now();
  const movido = chatNuevo();
  for (let i = 0; i < 250; i++) CC.recordarMensaje(movido, "Ana", `viejo ${i}`, false, { fecha: ahora - 7 * HORA + i * 1000 });
  for (let i = 0; i < 50; i++) CC.recordarMensaje(movido, "Ana", `nuevo ${i}`, false, { fecha: ahora - 10 * MIN + i * 1000 });
  assert.equal(CC.contextoChat.get(movido).length, 200, "lo de hace más de 6 horas se va mientras queden más de 200");
  assert.equal(textos(movido)[0], "viejo 100");
  assert.equal(CC.contextoChatRecorte.get(movido), ahora - 7 * HORA + 99 * 1000);

  const charlado = chatNuevo();
  for (let i = 0; i < 300; i++) CC.recordarMensaje(charlado, "Beto", `m ${i}`, false, { fecha: ahora - HORA + i * 1000 });
  assert.equal(CC.contextoChat.get(charlado).length, 300, "lo de las últimas 6 horas queda todo");

  const callado = chatNuevo();
  for (let i = 0; i < 150; i++) CC.recordarMensaje(callado, "Caro", `m ${i}`, false, { fecha: ahora - 72 * HORA + i * MIN });
  assert.equal(CC.contextoChat.get(callado).length, 150, "en un chat callado quedan días, como antes");
});

test("memoria: tiene un tope por chat aunque todo sea reciente", () => {
  const tope = CC.MEMORIA_CORTA.TOPE;
  CC.MEMORIA_CORTA.TOPE = 30;
  try {
    const chat = chatNuevo();
    const ahora = Date.now();
    for (let i = 0; i < 50; i++) CC.recordarMensaje(chat, "Ana", `m ${i}`, false, { fecha: ahora - 50 * 1000 + i * 1000 });
    assert.equal(CC.contextoChat.get(chat).length, 30);
    assert.equal(textos(chat)[0], "m 20");
    assert.equal(CC.contextoChatRecorte.get(chat), ahora - 31 * 1000);
  } finally {
    CC.MEMORIA_CORTA.TOPE = tope;
  }
});

test("memoria: lo que llega tarde entra donde se dijo, y lo del mismo momento queda en el orden en que llegó", () => {
  const chat = chatNuevo();
  const t = Date.now() - HORA;
  CC.recordarMensaje(chat, "Ana", "primero", false, { id: "O1", fecha: t + 1000 });
  CC.recordarMensaje(chat, "Ana", "tercero", false, { id: "O3", fecha: t + 3000 });
  CC.recordarMensaje(chat, "Beto", "segundo", false, { id: "O2", fecha: t + 2000 });
  CC.recordarMensaje(chat, "Caro", "segundo también", false, { id: "O2b", fecha: t + 2000 });
  CC.recordarMensaje(chat, "Dani", "antes que todos", false, { id: "O0", fecha: t });
  assert.deepEqual(textos(chat), ["antes que todos", "primero", "segundo", "segundo también", "tercero"]);
  // What reads in order still works off it.
  assert.deepEqual(
    CC.mensajesAntesDe(chat, t + 2500, 2).map((e) => e.texto),
    ["segundo", "segundo también"],
  );
});

test("memoria: el mismo mensaje dos veces queda una vez, y lo que ya se cortó no vuelve a entrar", () => {
  const chat = chatNuevo();
  const ahora = Date.now();
  assert.equal(CC.recordarMensaje(chat, "Ana", "hola", false, { id: "R1", fecha: ahora - 1000 }), true);
  assert.equal(CC.recordarMensaje(chat, "Ana", "hola", false, { id: "R1", fecha: ahora - 1000 }), false);
  assert.equal(CC.contextoChat.get(chat).length, 1);

  const tope = CC.MEMORIA_CORTA.TOPE;
  CC.MEMORIA_CORTA.TOPE = 5;
  try {
    for (let i = 0; i < 10; i++) CC.recordarMensaje(chat, "Ana", `m ${i}`, false, { fecha: ahora - 100 * 1000 + i * 1000 });
    const recorte = CC.contextoChatRecorte.get(chat);
    assert.equal(CC.recordarMensaje(chat, "Beto", "de antes del corte", false, { fecha: recorte }), false, "entrar lo haría parecer completo");
    assert.equal(CC.recordarMensaje(chat, "Beto", "de después del corte", false, { fecha: recorte + 1 }), true);
  } finally {
    CC.MEMORIA_CORTA.TOPE = tope;
  }
});

test("memoria: podarMemoria corta lo viejo de un chat que se calló", () => {
  const chat = chatNuevo();
  const ahora = Date.now();
  for (let i = 0; i < 300; i++) CC.recordarMensaje(chat, "Ana", `m ${i}`, false, { fecha: ahora - 300 * 1000 + i * 1000 });
  assert.equal(CC.contextoChat.get(chat).length, 300);
  CC.podarMemoria(ahora + 7 * HORA);
  assert.equal(CC.contextoChat.get(chat).length, 200, "siete horas después, sin nada nuevo que lo dispare");
});

test("memoria: cada cambio, repetido en otra memoria, la deja igual", () => {
  const chat = chatNuevo();
  const copia = CC.crearMemoria();
  CC.alCambiarMemoria((cambio) => assert.equal(copia.aplicarCambio(JSON.parse(JSON.stringify(cambio))), true, `la copia no pudo con ${cambio.op}`));
  const tope = CC.MEMORIA_CORTA.TOPE;
  const maxIngresos = CC.MEMORIA_CORTA.MAX_INGRESOS;
  CC.MEMORIA_CORTA.TOPE = 20;
  try {
    const ahora = Date.now();
    for (let i = 0; i < 25; i++) CC.recordarMensaje(chat, "Ana", `m ${i}`, false, { id: `C${i}`, usuario: "1@lid", fecha: ahora - 60 * 1000 + i * 1000, comando: i === 3 });
    CC.recordarMensaje(chat, "Claudia", "lo mío", true, { id: "CB", fecha: ahora });
    CC.recordarMensaje(chat, "Ana", "🎤 (audio) algo", false, { id: "CA", usuario: "1@lid", esAudio: true, fecha: ahora - 30 * 1000 });
    CC.alCambiarMemoria((cambio) => copia.aplicarCambio(JSON.parse(JSON.stringify(cambio))));
    assert.equal(CC.editarMensaje(chat, "C10", "  editado   así ", ["1@lid"], { comando: false }), true);
    assert.equal(CC.editarMensaje(chat, "C11", "de otro", ["2@lid"]), false, "la edición de otro no cuenta, tampoco en la copia");
    assert.equal(CC.olvidarMensaje(chat, "C12"), true);
    CC.MEMORIA_CORTA.MAX_INGRESOS = 2;
    CC.recordarIngreso(chat, ["1@lid", "3@lid"], ahora - 1000);
    CC.recordarIngreso(chat, ["4@lid"], ahora);
    CC.podarMemoria(ahora + 7 * HORA);

    assert.deepEqual(copia.chats.get(chat), CC.contextoChat.get(chat));
    assert.equal(copia.recortes.get(chat), CC.contextoChatRecorte.get(chat));
    assert.deepEqual([...copia.ingresos].filter(([k]) => k.startsWith(chat)), [...CC.ingresosGrupo].filter(([k]) => k.startsWith(chat)));
    assert.equal(CC.contextoChat.get(chat).find((e) => e.id === "C10").texto, "editado así");
    assert.equal(CC.contextoChat.get(chat).some((e) => e.id === "C12"), false);
  } finally {
    CC.MEMORIA_CORTA.TOPE = tope;
    CC.MEMORIA_CORTA.MAX_INGRESOS = maxIngresos;
  }
});

test("memoria: un borrado o una edición de algo que no está igual se le pasan a la copia", () => {
  const cambios = [];
  CC.alCambiarMemoria((cambio) => cambios.push(cambio));
  assert.equal(CC.olvidarMensaje("no-esta@g.us", "X1"), false);
  assert.equal(CC.editarMensaje("no-esta@g.us", "X2", "otro texto", ["1@lid"]), false);
  assert.deepEqual(
    cambios.map((c) => [c.op, c.id]),
    [
      ["olvidar", "X1"],
      ["editar", "X2"],
    ],
  );
});

test("memoria: la copia se restaura y se junta sin repetir, sin avisarle a nadie; una que no se entiende no cambia nada", () => {
  const ahora = Date.now();
  const origen = CC.crearMemoria(ahora - 5 * HORA);
  const chat = "restaurar@g.us";
  origen.aplicarCambio({ op: "agregar", chat, ahora, entrada: { nombre: "Ana", texto: "de antes", fecha: ahora - 2 * HORA, id: "A1" } });
  origen.aplicarCambio({ op: "agregar", chat, ahora, entrada: { nombre: "Ana", texto: "repetido", fecha: ahora - HORA, id: "A2" } });
  origen.aplicarCambio({ op: "ingreso", chat, ids: ["9@lid"], cuando: ahora - 3 * HORA });
  const copia = JSON.parse(JSON.stringify(origen.instantanea(ahora)));

  const destino = CC.crearMemoria(ahora);
  destino.aplicarCambio({ op: "agregar", chat, ahora, entrada: { nombre: "Beto", texto: "repetido (el de acá)", fecha: ahora - HORA, id: "A2" } });
  destino.aplicarCambio({ op: "agregar", chat, ahora, entrada: { nombre: "Beto", texto: "recién", fecha: ahora - 1000, id: "B1" } });
  const intacta = JSON.stringify([...destino.chats]);
  for (const rota of [null, { ...copia, v: 2 }, { ...copia, desde: "ayer" }, { ...copia, chats: [[chat, { mensajes: [{ texto: "sin fecha" }] }]] }, { ...copia, ingresos: [["x", "y"]] }]) {
    assert.equal(destino.restaurar(rota, ahora), false);
  }
  assert.equal(JSON.stringify([...destino.chats]), intacta, "una copia rota no tocó nada");

  assert.equal(destino.restaurar(copia, ahora), true);
  assert.deepEqual(
    destino.chats.get(chat).map((e) => e.texto),
    ["de antes", "repetido (el de acá)", "recién"],
  );
  assert.equal(destino.ingresos.get(`${chat}|9@lid`), ahora - 3 * HORA);
  assert.equal(destino.desde(), ahora - 5 * HORA, "la memoria arrancó cuando arrancó la copia");

  // The bot's own: restoring tells nobody, it came from the copy.
  const avisados = [];
  CC.alCambiarMemoria((cambio) => avisados.push(cambio));
  assert.equal(CC.restaurarMemoria({ v: 1, desde: CC.memoriaDesde(), chats: [["restaurada@g.us", { mensajes: [{ nombre: "Ana", texto: "hola", fecha: ahora, id: "Z1" }], recorte: null }]], ingresos: [] }), true);
  assert.deepEqual(textos("restaurada@g.us"), ["hola"]);
  assert.deepEqual(avisados, []);
});

test("memoria: un cambio roto no rompe nada", () => {
  const memoria = CC.crearMemoria();
  for (const cambio of [
    null,
    "agregar",
    {},
    { op: "otra" },
    { op: "agregar", chat: 1, ahora: 1, entrada: { texto: "x", fecha: 1 } },
    { op: "agregar", chat: "c", ahora: 1, entrada: { texto: "", fecha: 1 } },
    { op: "agregar", chat: "c", ahora: null, entrada: { texto: "x", fecha: 1 } },
    { op: "agregar", chat: "c", ahora: 1, entrada: { texto: "x", fecha: "ayer" } },
    { op: "olvidar", chat: "c" },
    { op: "editar", chat: "c", id: "x", texto: 3, autores: [] },
    { op: "editar", chat: "c", id: "x", texto: "y", autores: "1@lid" },
    { op: "ingreso", chat: "c", ids: "1@lid", cuando: 1 },
    { op: "podar", ahora: Number.NaN },
    { op: "reiniciar", desde: "hoy" },
  ]) {
    assert.equal(memoria.aplicarCambio(cambio), false, JSON.stringify(cambio));
  }
  assert.equal(memoria.chats.size + memoria.ingresos.size, 0);
});

test("memoria: borrar o editar cambia la versión del chat; agregar no", () => {
  const chat = chatNuevo();
  CC.recordarMensaje(chat, "Ana", "uno", false, { id: "V1", usuario: "1@lid" });
  CC.recordarMensaje(chat, "Ana", "dos", false, { id: "V2", usuario: "1@lid" });
  const v0 = CC.versionDe(chat);
  CC.recordarMensaje(chat, "Ana", "tres", false, { id: "V3", usuario: "1@lid" });
  assert.equal(CC.versionDe(chat), v0);
  CC.editarMensaje(chat, "V1", "uno bis", ["1@lid"]);
  assert.equal(CC.versionDe(chat), v0 + 1);
  CC.editarMensaje(chat, "V2", "de otro", ["2@lid"]);
  assert.equal(CC.versionDe(chat), v0 + 1, "lo que no cambió nada, tampoco");
  CC.olvidarMensaje(chat, "V2");
  assert.equal(CC.versionDe(chat), v0 + 2);
});

test("memoria: el historial está completo desde que arrancó la memoria, o desde lo atrasado de antes", () => {
  const ahora = Date.now();
  CC.reiniciarMemoria(ahora - HORA);
  const chat = chatNuevo();
  for (let i = 0; i < 10; i++) CC.recordarMensaje(chat, "Ana", `m ${i}`, false, { fecha: ahora - 30 * MIN + i * MIN });
  assert.equal(CC.memoriaDesde(), ahora - HORA);
  assert.equal(CC.historialCompletoDesde(chat, ahora - 6 * HORA), ahora - HORA, "de antes de que arrancara no hay nada");
  assert.equal(CC.historialCompletoDesde(chat, ahora - 20 * MIN), ahora - 20 * MIN);
  // What was said while the bot was down, which came late, takes it back to then.
  CC.recordarMensaje(chat, "Beto", "de cuando estaba caída", false, { fecha: ahora - 2 * HORA });
  assert.equal(CC.historialCompletoDesde(chat, ahora - 6 * HORA), ahora - 2 * HORA);
});

test("memoria: si el aviso a la copia falla, el mensaje igual se guarda", () => {
  const chat = chatNuevo();
  const errores = [];
  console.error = (...a) => errores.push(a.join(" "));
  CC.alCambiarMemoria(() => {
    throw new Error("canal cerrado");
  });
  assert.equal(CC.recordarMensaje(chat, "Ana", "igual queda", false), true);
  assert.equal(CC.recordarMensaje(chat, "Ana", "y este también", false), true);
  assert.deepEqual(textos(chat), ["igual queda", "y este también"]);
  assert.ok(errores.length <= 1, "lo dice una vez, no con cada mensaje");
});

// A chat that went quiet after a burst has nothing new to trigger the cut: the scheduled pass does it.
test("memoria: la pasada de las tareas programadas la poda", async () => {
  const fuente = fs.readFileSync(new URL("../lib/tareas-programadas.js", import.meta.url), "utf8");
  const nodos = await nodosQue('VariableDeclarator[id.name="correr"] CallExpression[callee.name="podarMemoria"]', fuente);
  assert.equal(nodos.length, 1, "lib/tareas-programadas.js dejó de podar la memoria en cada pasada");
});
