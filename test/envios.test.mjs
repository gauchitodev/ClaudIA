import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";

// What the bot sends: the pace every send goes through (lib/ritmo.js) and the count of what went out (lib/envios.js).
// Claudia was blocked by WhatsApp for volume, and the pace used to apply only to sendText: the roulette, reactions and
// every direct sendMessage went out without waiting. The queue's minimum is lowered so the tests run in milliseconds.

let F, R, E, A;
before(async () => {
  ({ F } = await prepararBase("envios"));
  R = await import("../lib/ritmo.js");
  E = await import("../lib/envios.js");
  A = await import("../lib/actividad.js");
  R.RITMO.MIN_ENTRE_MENSAJES_MS = 40;
});

// A client whose sendMessage (what Baileys provides) writes down what went out and when. Wrapped the way
// lib/wa-socket.js wraps the real one.
function clienteEnvuelto({ falla = null } = {}) {
  const salidas = [];
  const client = {
    sendMessage: async (jid, contenido) => {
      if (falla && falla(jid, contenido)) throw new Error("WhatsApp dijo que no");
      salidas.push({ jid, contenido, cuando: Date.now() });
      return { key: { id: `MSG${salidas.length}` } };
    },
  };
  E.envolverEnvios(client);
  return { client, salidas };
}
const hoy = () => A.claveDia();
const contados = (chat) => Object.fromEntries(F.enviosBotPorTipo(chat, [hoy()]).map((r) => [r.tipo, r.total]));

// ---------- the queue ----------

test("ritmo: dos mensajes al mismo chat se separan, y otro chat no espera", async () => {
  const esperas = await Promise.all([R.esperarTurno("fila1@g.us"), R.esperarTurno("fila1@g.us"), R.esperarTurno("otro1@g.us")]);
  assert.equal(esperas[0], 0);
  assert.ok(esperas[1] >= 35, `el segundo espera su turno (esperó ${esperas[1]} ms)`);
  assert.equal(esperas[2], 0, "otro chat no espera al primero");
});

test("ritmo: las reacciones tienen su propia fila y se descartan si el turno queda lejos", async () => {
  const chat = "fila2@g.us";
  // A burst of five with a 100 ms limit: turns at 0, 40 and 80 ms fit; the next ones would wait too long.
  const esperas = await Promise.all([1, 2, 3, 4, 5].map(() => R.esperarTurno(chat, { fila: "reacciones", descartarSiPasa: 100 })));
  assert.deepEqual(
    esperas.map((e) => e === null),
    [false, false, false, true, true],
    "las que llegarían tarde no se mandan",
  );
  // The messages' queue for that chat is untouched: a message goes out right away.
  assert.equal(await R.esperarTurno(chat), 0, "las reacciones no le reservan turnos a los mensajes");
});

// ---------- the wrapper: every send waits its turn and gets counted ----------

test("envíos: el tipo sale del contenido", () => {
  assert.equal(E.tipoDeEnvio({ text: "hola" }), "texto");
  assert.equal(E.tipoDeEnvio({ text: "" }), "texto", "un hidetag sin texto sigue siendo un mensaje");
  assert.equal(E.tipoDeEnvio({ image: { url: "x.jpg" }, caption: "foto" }), "multimedia");
  assert.equal(E.tipoDeEnvio({ sticker: Buffer.alloc(1) }), "multimedia");
  assert.equal(E.tipoDeEnvio({ react: { text: "🔥", key: {} } }), "reaccion");
  assert.equal(E.tipoDeEnvio({ react: { text: "", key: {} } }), "reaccion", "sacar una reacción también es una");
  assert.equal(E.tipoDeEnvio({ delete: { id: "X" } }), "borrado");
  assert.equal(E.tipoDeEnvio({ poll: { name: "¿?", values: ["a", "b"] } }), "otro");
  // A forward (the anti-delete, the hidetags) is whatever it forwards.
  assert.equal(E.tipoDeEnvio({ forward: { message: { stickerMessage: {} } } }), "multimedia");
  assert.equal(E.tipoDeEnvio({ forward: { message: { conversation: "hola" } } }), "texto");
  assert.equal(E.tipoDeEnvio({ forward: { message: { locationMessage: {} } } }), "otro");
  // An edit wraps any content, text included.
  assert.equal(E.tipoDeEnvio({ text: "corregido", edit: { id: "X" } }), "otro");
  // It runs before every send, so nothing can make it throw.
  for (const raro of [null, undefined, "texto suelto", 42]) assert.equal(E.tipoDeEnvio(raro), "otro");
});

test("envíos: los mensajes esperan su turno, los borrados no, y otro chat no espera al primero", async () => {
  const { client, salidas } = clienteEnvuelto();
  const G1 = "cola1@g.us";
  await Promise.all([
    client.sendMessage(G1, { text: "uno" }),
    client.sendMessage(G1, { text: "dos" }),
    client.sendMessage(G1, { delete: { id: "SPAM" } }),
    client.sendMessage("cola2@g.us", { text: "en otro grupo" }),
  ]);
  const cuando = (pred) => salidas.find(pred).cuando;
  const t0 = cuando((s) => s.contenido.text === "uno");
  assert.ok(cuando((s) => s.contenido.text === "dos") - t0 >= 35, "el segundo mensaje esperó su turno");
  assert.ok(cuando((s) => s.contenido.delete) - t0 < 20, "el borrado salió sin esperar: es moderación");
  assert.ok(cuando((s) => s.jid === "cola2@g.us") - t0 < 20, "otro grupo no espera la cola de este");
});

test("envíos: una ráfaga de reacciones se espacia, las tardías no salen y los mensajes no las esperan", async () => {
  const { client, salidas } = clienteEnvuelto();
  const G1 = "trivia@g.us";
  const limiteReal = R.RITMO.REACCION_ESPERA_MAX_MS;
  R.RITMO.REACCION_ESPERA_MAX_MS = 100;
  try {
    const antes = E.reaccionesDescartadas();
    // Ten wrong answers in a busy trivia, and the bot's "¡correcto!" in the middle of them.
    const reacciones = Array.from({ length: 10 }, (_, i) => client.sendMessage(G1, { react: { text: "❌", key: { id: `R${i}` } } }));
    const correcto = client.sendMessage(G1, { text: "¡correcto!" });
    const resultados = await Promise.all(reacciones);
    await correcto;

    assert.equal(resultados.filter((r) => r === undefined).length, 7, "entran las de 0, 40 y 80 ms; las demás llegarían tarde");
    assert.equal(E.reaccionesDescartadas() - antes, 7);
    const t0 = salidas[0].cuando;
    assert.ok(salidas.find((s) => s.contenido.text === "¡correcto!").cuando - t0 < 20, "el mensaje no esperó detrás de las reacciones");
    assert.deepEqual(contados(G1), { reaccion: 3, texto: 1 }, "solo cuenta lo que salió");
  } finally {
    R.RITMO.REACCION_ESPERA_MAX_MS = limiteReal;
  }
});

test("envíos: cuenta por chat, hora y tipo, y los privados van todos juntos", async () => {
  const { client } = clienteEnvuelto();
  await client.sendMessage("conteo@g.us", { text: "hola" });
  await client.sendMessage("conteo@g.us", { image: { url: "x.jpg" } });
  await client.sendMessage("123@lid", { text: "por privado" });
  await client.sendMessage("456@s.whatsapp.net", { text: "otro privado" });

  assert.deepEqual(contados("conteo@g.us"), { texto: 1, multimedia: 1 });
  assert.equal(contados("privado").texto, 2, "a quién le habló por privado no se guarda");
  const hora = new Date().getHours();
  assert.ok(F.enviosBotPorHora("conteo@g.us", [hoy()]).some((r) => r.hora === hora && r.total === 2), "queda en la hora en que salió");
});

test("envíos: lo que falla no cuenta, y el error le llega a quien mandó", async () => {
  const { client } = clienteEnvuelto({ falla: (jid) => jid === "falla@g.us" });
  await assert.rejects(() => client.sendMessage("falla@g.us", { text: "no sale" }), /WhatsApp dijo que no/);
  assert.deepEqual(contados("falla@g.us"), {}, "no se cuenta lo que no salió");
});

test("envíos: si contar falla, el mensaje igual se da por mandado", async () => {
  const { client, salidas } = clienteEnvuelto();
  const baseReal = globalThis.db;
  const errorReal = console.error;
  const errores = [];
  globalThis.db = {
    prepare: () => {
      throw new Error("base caída");
    },
  };
  console.error = (...args) => errores.push(args.join(" "));
  try {
    const enviado = await client.sendMessage("sinbase@g.us", { text: "igual sale" });
    assert.equal(enviado.key.id, "MSG1", "devuelve lo que devolvió WhatsApp");
    assert.equal(salidas.length, 1);
    assert.ok(errores.some((e) => /\[envios\].*base caída/.test(e)), "el conteo falló de verdad, y quedó anotado");
  } finally {
    globalThis.db = baseReal;
    console.error = errorReal;
  }
});

test("envíos: devuelve lo que devuelve Baileys y le pasa todos los argumentos", async () => {
  const llamadas = [];
  const client = {
    sendMessage: async (...args) => {
      llamadas.push(args);
      return { key: { id: "DE_BAILEYS" } };
    },
  };
  E.envolverEnvios(client);
  const cita = { key: { id: "Q" } };
  // The hidetags pass a fourth argument: it has to get there too.
  const r = await client.sendMessage("args@g.us", { text: "hola" }, { quoted: cita }, { ephemeralExpiration: 60 });
  assert.equal(r.key.id, "DE_BAILEYS", "lo usan después para reaccionar sobre su key");
  assert.deepEqual(llamadas[0], ["args@g.us", { text: "hola" }, { quoted: cita }, { ephemeralExpiration: 60 }]);
});

test("envíos: si Baileys no manda nada, no se cuenta", async () => {
  // Baileys returns nothing when it sends nothing, as with a disappearing-messages setting in a group.
  const client = { sendMessage: async () => undefined };
  E.envolverEnvios(client);
  await client.sendMessage("nada@g.us", { text: "?" });
  assert.deepEqual(contados("nada@g.us"), {});
});

test("envíos: envolver dos veces no hace esperar dos veces", () => {
  const { client } = clienteEnvuelto();
  const envuelto = client.sendMessage;
  E.envolverEnvios(client);
  assert.equal(client.sendMessage, envuelto);
});

// ---------- the hooks that send: they don't wait for their turn ----------
// With every send waiting its turn, a before-hook that awaited one held up everything after it for that message.

test("reacciones automáticas: no frenan al resto del mensaje", async () => {
  const Reacciones = (await import("../plugins/bot-reactions.js")).default;
  // A reaction whose turn never comes: the hook has to finish anyway.
  const m = { text: "la verdad que sí", react: () => new Promise(() => {}) };
  const tarde = new Promise((resolve) => setTimeout(() => resolve("tarde"), 200));
  const quien = await Promise.race([Reacciones.before(m, { chat: { reactions: 1 } }).then(() => "a tiempo"), tarde]);
  assert.equal(quien, "a tiempo", "el hook terminó sin esperar la reacción");
});

test("anti-links: borra antes de avisar", async () => {
  globalThis.txt = (await import("../lib/strings.js")).default;
  const orden = [];
  const client = {
    sendText: async () => {
      orden.push("aviso");
    },
  };
  const m = { isGroup: true, chat: "links@g.us", sender: "x@lid", text: "miren esto https://spam.com", delete: async () => orden.push("borrado") };
  const AntiLinks = (await import("../plugins/_all-anti-links.js")).default;
  await AntiLinks.before(m, { client, isMod: false, isBotAdmin: true, isOwner: false, participants: [], chat: { allAntiLinks: 1 } });
  assert.deepEqual(orden, ["borrado", "aviso"], "el link no queda a la vista mientras el aviso espera su turno");
});

// ---------- the panels: .enviados and the bot's line in .actividad ----------
// A fixed date years away, so what the wrapper tests above counted (today, for real) stays out of its week.

const AHORA = new Date(2031, 0, 15, 15, 30); // January 15, 15:30
const dia = (atras) => A.claveDia(new Date(AHORA.getTime() - atras * 24 * 3600e3));
const sembrar = (chat, atras, hora, tipo, n) => {
  for (let i = 0; i < n; i++) F.sumarEnvioBot(chat, dia(atras), hora, tipo);
};

test(".enviados en un grupo: días, horas pico y tipos de lo que mandó ahí", async () => {
  const G1 = "panel@g.us";
  sembrar(G1, 0, 21, "texto", 30);
  sembrar(G1, 0, 21, "reaccion", 10);
  sembrar(G1, 0, 13, "multimedia", 5);
  sembrar(G1, 1, 22, "texto", 20);

  const { texto } = await E.textoEnviados(globalThis.client, { chat: G1, ahora: AHORA });
  assert.match(texto, /LO QUE MANDÉ EN ESTE GRUPO/);
  assert.match(texto, /Hoy: \*45\* mensajes · ayer 20/);
  assert.match(texto, /Últimos 2 días: \*65\* · 33 por día/, "el promedio, sobre los días que contó");
  assert.match(texto, /21:00 █+░* 40\n22:00 █+░* 20\n13:00 █+░* 5/, "las horas pico, de mayor a menor");
  assert.match(texto, /\*Por tipo:\* 50 textos · 10 reacciones · 5 multimedia/);
  assert.doesNotMatch(texto, /\*Dónde\*/, "el de un grupo no lista los demás");

  const vacio = await E.textoEnviados(globalThis.client, { chat: "mudo@g.us", ahora: AHORA });
  assert.match(vacio.texto, /No tengo envíos contados de los últimos 7 días en este grupo/);
});

test(".enviados general: todos juntos, con los grupos que más la hacen hablar", async () => {
  // The group from the test above is in this same week too: it's the one that talked the most.
  globalThis.client.chats["panel@g.us"] = { subject: "Panel" };
  globalThis.client.chats["casino@g.us"] = { subject: "Casino de los pibes" };
  globalThis.client.chats["ventas@g.us"] = { subject: "Compraventa Pocitos" };
  sembrar("casino@g.us", 0, 22, "texto", 60);
  sembrar("ventas@g.us", 0, 10, "texto", 25);
  sembrar("privado", 0, 9, "texto", 15);

  const { texto } = await E.textoEnviados(globalThis.client, { ahora: AHORA });
  assert.match(texto, /🤖 \*LO QUE MANDÉ\*\n/);
  assert.match(texto, /Hoy: \*145\* mensajes/, "todos los chats juntos");
  assert.match(
    texto,
    /\*Dónde\*\nPanel: 65 · 39%\nCasino de los pibes: 60 · 36%\nCompraventa Pocitos: 25 · 15%\nprivados: 15 · 9%/,
    "por nombre, de más a menos, con su parte del total; los privados, todos juntos",
  );
  // The burst test above dropped seven reactions in this same process.
  assert.match(texto, /Reacciones que la cola no mandó desde que arranqué: 7/);
});

test(".enviados: en un grupo muestra ese grupo; con todo, o por privado, el general", async () => {
  const P = (await import("../plugins/owner-enviados.js")).default;
  assert.equal(P.onlyOwner, true, "el general lista todos los grupos: solo el owner");
  const correr = (m, args = []) => P.run(m, { client: globalThis.client, args });

  await correr({ chat: "panel@g.us", isGroup: true });
  assert.match(ultimoEnviado().msg.text, /LO QUE MANDÉ EN ESTE GRUPO/);
  await correr({ chat: "panel@g.us", isGroup: true }, ["todo"]);
  assert.match(ultimoEnviado().msg.text, /🤖 \*LO QUE MANDÉ\*\n/);
  await correr({ chat: "59899111222@s.whatsapp.net", isGroup: false });
  assert.match(ultimoEnviado().msg.text, /🤖 \*LO QUE MANDÉ\*\n/);
});

test(".actividad muestra lo que dijo Claudia hoy y qué parte del grupo es", () => {
  const G1 = "charla@g.us";
  for (let i = 0; i < 30; i++) F.sumarMensajeHora(G1, dia(0), 20);
  sembrar(G1, 0, 20, "texto", 10);
  assert.match(A.textoActividad(G1, AHORA).texto, /Hoy: \*30\* mensajes\n🤖 Claudia hoy: \*10\* · 25% del grupo/);

  // A group where the bot said nothing today gets no line.
  const G2 = "callada@g.us";
  F.sumarMensajeHora(G2, dia(0), 20);
  assert.doesNotMatch(A.textoActividad(G2, AHORA).texto, /Claudia hoy/);
});

test(".podar también saca los envíos de más de 90 días, en todos los chats", () => {
  // Pruning is global: what the tests above left before the cutoff goes first, so the count below comes out exact.
  E.podarEnvios(AHORA.getTime());
  const P = "vieja@g.us";
  sembrar(P, 100, 10, "texto", 1);
  sembrar(P, 91, 10, "texto", 1);
  sembrar(P, 90, 10, "texto", 1);
  sembrar(P, 5, 10, "texto", 1);

  assert.equal(E.podarEnvios(AHORA.getTime()), 2, "solo lo anterior a los 90 días");
  assert.equal(F.enviosBotPorDia(P, [dia(90)])[0].total, 1, "el día 90 justo se conserva");
  assert.equal(F.enviosBotPorDia(P, [dia(5)])[0].total, 1);
  assert.equal(E.podarEnvios(AHORA.getTime()), 0, "correrlo de nuevo no borra nada");
});

// ---------- consistency: scanning the source ----------
// Neither of these shows when it breaks: without the wrapper the bot keeps working, it just stops pacing and counting;
// with a second wait in some helper, those messages wait twice. Modelled on test/cache-grupos.test.mjs.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const archivosDe = (carpeta) =>
  fs
    .readdirSync(path.join(RAIZ, carpeta))
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(RAIZ, carpeta, f));

test("consistencia: wa-socket envuelve sendMessage, y la cola se pide en un solo lugar", () => {
  const socket = fs.readFileSync(path.join(RAIZ, "lib/wa-socket.js"), "utf8");
  assert.match(socket, /envolverEnvios\(client\)/, "lib/wa-socket.js dejó de envolver client.sendMessage: el bot manda sin cola y sin contar");

  const fuentes = [...archivosDe("lib"), ...archivosDe("plugins"), path.join(RAIZ, "main.js"), path.join(RAIZ, "handle-message.js")];
  assert.ok(fuentes.length > 100, `se encontraron muy pocos archivos (${fuentes.length}): el escaneo no está andando`);
  const piden = [];
  for (const archivo of fuentes) {
    const rel = path.relative(RAIZ, archivo);
    if (rel === "lib/ritmo.js") continue; // where it's defined
    fs.readFileSync(archivo, "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (/esperarTurno\(/.test(linea)) piden.push(`${rel}:${i + 1}`);
      });
  }
  assert.ok(piden.some((d) => d.startsWith("lib/envios.js")), "el escaneo no encuentra la espera de lib/envios.js");
  const deMas = piden.filter((d) => !d.startsWith("lib/envios.js"));
  assert.deepEqual(deMas, [], `piden turno por su cuenta, y esos mensajes esperarían dos veces:\n${deMas.join("\n")}`);

  // Nothing sends around sendMessage: relayMessage straight to Baileys would skip both the queue and the count. It's
  // only in two helpers of lib/wa-socket.js that nobody calls.
  const porAfuera = [];
  for (const archivo of fuentes) {
    const rel = path.relative(RAIZ, archivo);
    if (rel === "lib/wa-socket.js") continue;
    fs.readFileSync(archivo, "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (/\.(relayMessage|relayWAMessage|copyNForward)\(/.test(linea)) porAfuera.push(`${rel}:${i + 1}`);
      });
  }
  assert.deepEqual(porAfuera, [], `mandan por fuera de sendMessage, sin cola ni conteo:\n${porAfuera.join("\n")}`);
});
