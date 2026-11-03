import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { nodosQue } from "./helpers.mjs";

// The memory outlives a restart of main.js (lib/relevo-memoria.js): start-process.js keeps a copy, main.js tells it
// every change and asks for it back as it starts. Here the channel between the two is a fake that serializes what
// goes through it, as the real one does; the last test forks for real.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN = 60 * 1000;
const HORA = 60 * MIN;
const errorReal = console.error;
let CC, R, esperaReal;

before(async () => {
  CC = await import("../lib/contexto-chat.js");
  R = await import("../lib/relevo-memoria.js");
  esperaReal = R.RELEVO.ESPERA_MS;
});
afterEach(() => {
  CC.alCambiarMemoria(null);
  R.RELEVO.ESPERA_MS = esperaReal;
  console.error = errorReal;
});

// main.js's end of the channel, with the supervisor's (trabajador) at the other end, or nobody.
function canal(trabajador) {
  const oyentes = new Set();
  const enviados = [];
  return {
    enviados,
    oyentes,
    enviar: (mensaje) => {
      const viaje = JSON.parse(JSON.stringify(mensaje));
      enviados.push(viaje);
      trabajador?.atender(viaje, (respuesta) => setImmediate(() => oyentes.forEach((f) => f(JSON.parse(JSON.stringify(respuesta))))));
    },
    escuchar: (f) => oyentes.add(f),
    dejar: (f) => oyentes.delete(f),
  };
}

// A main.js that starts again: an empty memory, telling nobody.
function mainDeNuevo() {
  CC.alCambiarMemoria(null);
  CC.reiniciarMemoria(Date.now());
}

const cambioAgregar = (chat, texto, ahora = Date.now()) => ({ tipo: "memoria:cambio", cambio: { op: "agregar", chat, ahora, entrada: { nombre: "Ana", texto, fecha: ahora } } });

test("relevo: sin supervisor no hace nada ni deja a nadie escuchando", async () => {
  const antes = process.listenerCount("message");
  await import(`../lib/relevo-memoria.js?sin-oyentes=${Date.now()}`);
  assert.deepEqual(await R.recuperarMemoria(), { restaurada: false, mensajes: 0 }, "en los tests no hay canal");
  assert.equal(process.listenerCount("message"), antes);
});

test("relevo: main.js le pasa cada cambio, y al volver recupera los mensajes, la edición, el borrado, los ingresos y desde cuándo", async () => {
  const T0 = Date.now() - 3 * HORA;
  const copia = R.crearCopiaDeMemoria({ memoria: CC.crearMemoria(T0) });
  mainDeNuevo();
  assert.deepEqual(await R.recuperarMemoria({ canal: canal(copia.trabajadorNuevo()) }), { restaurada: true, mensajes: 0 });
  assert.equal(CC.memoriaDesde(), T0, "la memoria es la que arrancó con el supervisor");

  const chat = "relevo@g.us";
  CC.recordarMensaje(chat, "Ana", "hola", false, { id: "R1", usuario: "1@lid" });
  CC.recordarMensaje(chat, "Ana", "me equivoqué", false, { id: "R2", usuario: "1@lid" });
  CC.recordarMensaje(chat, "Beto", "esto lo borro", false, { id: "R3", usuario: "2@lid" });
  CC.editarMensaje(chat, "R2", "me corrijo", ["1@lid"]);
  CC.olvidarMensaje(chat, "R3");
  CC.recordarIngreso(chat, ["3@lid"], Date.now() - MIN);

  mainDeNuevo();
  assert.equal(CC.contextoChat.get(chat), undefined, "main.js volvió vacío");
  assert.deepEqual(await R.recuperarMemoria({ canal: canal(copia.trabajadorNuevo()) }), { restaurada: true, mensajes: 2 });
  assert.deepEqual(
    CC.contextoChat.get(chat).map((e) => e.texto),
    ["hola", "me corrijo"],
  );
  assert.ok(CC.ingresoDe(chat, "3@lid") > 0, "sigue sabiendo quién entró recién");
  assert.equal(CC.memoriaDesde(), T0);

  // And what it was told after restoring goes on to the copy, not what it restored.
  CC.recordarMensaje(chat, "Ana", "después de volver", false, { id: "R4" });
  assert.deepEqual(
    copia.memoria.chats.get(chat).map((e) => e.texto),
    ["hola", "me corrijo", "después de volver"],
  );
});

test("relevo: lo que dice un main.js anterior después de que arrancó el nuevo no entra, ni lo de uno que no la pidió", async () => {
  const copia = R.crearCopiaDeMemoria({ memoria: CC.crearMemoria() });
  mainDeNuevo();
  const viejo = copia.trabajadorNuevo();
  await R.recuperarMemoria({ canal: canal(viejo) });
  const nuevo = copia.trabajadorNuevo();
  viejo.atender(cambioAgregar("orden@g.us", "últimas palabras del anterior"), () => {});
  nuevo.atender(cambioAgregar("orden@g.us", "antes de pedirla"), () => {});
  assert.equal(copia.memoria.chats.has("orden@g.us"), false);
  nuevo.atender({ tipo: "memoria:pido" }, () => {});
  nuevo.atender(cambioAgregar("orden@g.us", "ya la pidió"), () => {});
  assert.deepEqual(
    copia.memoria.chats.get("orden@g.us").map((e) => e.texto),
    ["ya la pidió"],
  );
});

test("relevo: si el supervisor no contesta, main.js arranca vacío, le pide empezar de nuevo y no queda escuchando", async () => {
  R.RELEVO.ESPERA_MS = 50;
  mainDeNuevo();
  const mudo = canal(null);
  assert.deepEqual(await R.recuperarMemoria({ canal: mudo }), { restaurada: false, mensajes: 0 });
  assert.deepEqual(
    mudo.enviados.map((m) => m.cambio?.op ?? m.tipo),
    ["memoria:pido", "reiniciar"],
  );
  assert.equal(mudo.oyentes.size, 0, "una respuesta tardía no encuentra a nadie");
});

test("relevo: una copia que no se entiende se descarta, y la del supervisor vuelve a empezar", async () => {
  mainDeNuevo();
  const roto = { atender: (m, responder) => m.tipo === "memoria:pido" && responder({ tipo: "memoria:copia", copia: { v: 2, chats: "todo" } }) };
  const c = canal(roto);
  const r = await R.recuperarMemoria({ canal: c });
  assert.equal(r.restaurada, false);
  assert.ok(c.enviados.some((m) => m.cambio?.op === "reiniciar"));
});

test("relevo: un main.js que anduvo un rato sin pedirla deja la copia vieja; uno que se cayó al arrancar no", () => {
  const copia = R.crearCopiaDeMemoria({ memoria: CC.crearMemoria() });
  const ahora = Date.now();
  copia.memoria.aplicarCambio({ op: "agregar", chat: "vieja@g.us", ahora, entrada: { texto: "guardado", fecha: ahora } });
  let respuesta;
  copia.trabajadorNuevo().termino(2000);
  copia.trabajadorNuevo().atender({ tipo: "memoria:pido" }, (r) => (respuesta = r), ahora);
  assert.equal(respuesta.copia.chats.length, 1, "el que se cayó al arrancar no tocó nada");

  copia.trabajadorNuevo().termino(R.RELEVO.SIN_PEDIR_MS);
  copia.trabajadorNuevo().atender({ tipo: "memoria:pido" }, (r) => (respuesta = r), ahora + 1);
  assert.deepEqual(respuesta.copia.chats, [], "lo que dijo sin pasarlo, borrados incluidos, no está en la copia");
  assert.equal(respuesta.copia.desde, ahora + 1);
});

test("relevo: el supervisor no se cae con mensajes rotos ni con una respuesta que falla", () => {
  const errores = [];
  console.error = (...a) => errores.push(a.join(" "));
  const copia = R.crearCopiaDeMemoria({ memoria: CC.crearMemoria() });
  const t = copia.trabajadorNuevo();
  for (const mensaje of [null, "hola", 42, { tipo: "memoria:cambio" }]) t.atender(mensaje, () => {});
  assert.doesNotThrow(() =>
    t.atender({ tipo: "memoria:pido" }, () => {
      throw new Error("canal cerrado");
    }),
  );
  t.atender({ tipo: "memoria:cambio", cambio: { op: "agregar", chat: "rotos@g.us" } }, () => {});
  t.atender(cambioAgregar("rotos@g.us", "este sí"), () => {});
  assert.deepEqual(
    copia.memoria.chats.get("rotos@g.us").map((e) => e.texto),
    ["este sí"],
  );
  assert.equal(errores.length, 1);
});

test("relevo: main.js recupera la memoria antes de la base, las tareas, los plugins y la conexión", async () => {
  const fuente = fs.readFileSync(path.join(RAIZ, "main.js"), "utf8");
  const nombres = ["recuperarMemoria", "loadDatabase", "instalarDevolucionAlCerrar", "iniciarPendientes", "iniciarTareasProgramadas", "loadPlugins", "startBot"];
  const nodos = await nodosQue(`Program > :matches(ExpressionStatement, VariableDeclaration) CallExpression[callee.name=/^(${nombres.join("|")})$/]`, fuente);
  const donde = (nombre) => nodos.filter((n) => n.callee.name === nombre).map((n) => n.range[0]);
  for (const nombre of nombres) assert.ok(donde(nombre).length, `main.js ya no llama a ${nombre} al arrancar`);
  const recuperar = nodos.find((n) => n.callee.name === "recuperarMemoria");
  assert.equal(recuperar.parent.type, "AwaitExpression", "la espera antes de seguir");
  for (const nombre of nombres.slice(1)) assert.ok(donde("recuperarMemoria")[0] < Math.min(...donde(nombre)), `${nombre} va antes de recuperar la memoria`);
});

test("relevo: con start-process.js de verdad, lo que guardó un main.js que se cayó lo tiene el siguiente", () => {
  // A copy of the supervisor in a temp folder, with a main.js that the first time stores a message, sends some junk and
  // dies, and the second time writes down what it got back.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-relevo-"));
  try {
    fs.mkdirSync(path.join(dir, "lib"));
    for (const archivo of ["start-process.js", "lib/reinicio.js", "lib/relevo-memoria.js", "lib/contexto-chat.js"]) fs.copyFileSync(path.join(RAIZ, archivo), path.join(dir, archivo));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
    fs.writeFileSync(
      path.join(dir, "main.js"),
      `import fs from "fs";
import { recuperarMemoria } from "./lib/relevo-memoria.js";
import { recordarMensaje, contextoChat } from "./lib/contexto-chat.js";
const marca = new URL("./ya-arranco", import.meta.url);
const r = await recuperarMemoria();
if (!fs.existsSync(marca)) {
  fs.writeFileSync(marca, "");
  process.send("basura");
  process.send({ tipo: "memoria:cambio", cambio: { op: "agregar" } });
  recordarMensaje("e2e@g.us", "Ana", "sobrevivo al reinicio", false, { id: "E1" });
  setTimeout(() => process.exit(1), 300);
} else {
  fs.writeFileSync(new URL("./resultado.json", import.meta.url), JSON.stringify({ r, mensajes: contextoChat.get("e2e@g.us") || [] }));
  process.exit(0);
}
`,
    );
    spawnSync(process.execPath, ["start-process.js"], { cwd: dir, timeout: 15_000 });
    const resultado = JSON.parse(fs.readFileSync(path.join(dir, "resultado.json"), "utf8"));
    assert.deepEqual(resultado.r, { restaurada: true, mensajes: 1 });
    assert.deepEqual(
      resultado.mensajes.map((e) => e.texto),
      ["sobrevivo al reinicio"],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
