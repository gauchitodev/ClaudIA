import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { prepararBase, nodosQue } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";
import { claveDia } from "../lib/actividad.js";

// The catalogue a buy-and-sell group gets unasked (mostrarCatalogos, lib/compraventa.js). In a real sales group 3
// people in 210 ever typed .catalogo: the list was there and nobody saw it. Now it goes out by itself every few hours,
// within the hours of the day's round, only when the group has been writing, and taking the one before with it.

let F, C, Modo, Config, VerConfig;
const MIN = 60e3;
const HORA = 3600e3;
const DIA = 24 * HORA;
// Today at an hour, whatever the time the tests run at; "today" is the day the file started on.
const INICIO = Date.now();
const hoyALas = (hora, minutos = 0) => new Date(INICIO).setHours(hora, minutos, 0, 0);
const MODO_COMPRAVENTA = { games: 0, charla: 0, saludos: 0, monedas: 0, ascensos: 0, recapSemanal: 0 };

before(async () => {
  ({ F } = await prepararBase("catalogo"));
  C = await import("../lib/compraventa.js");
  Modo = await import("../lib/modo.js");
  Config = (await import("../plugins/config-on-off.js")).default;
  VerConfig = (await import("../plugins/grupo-config.js")).default;
});

// A buy-and-sell group of a test's own, with people named like their ids and something up. A pass goes over every
// group: what a test counts is what was sent to its own.
function grupo(chat, { modo = MODO_COMPRAVENTA, avisos = ["bici rodado 26 $ 4.000", "mesa de luz $ 800"] } = {}) {
  for (const n of [111, 222]) F.initDataDB({ chat, sender: `${n}@lid`, senderJid: `59899000${n}@s.whatsapp.net`, pushName: `P${n}` });
  F.updateChat(chat, modo);
  return avisos.map((texto) => C.publicar(chat, "111@lid", "vendo", texto).numero);
}
// The group writes: so many messages in the hour of a moment (plugins/_actividad-horaria.js counts them by the hour).
function escriben(chat, cuantos, cuando) {
  const d = new Date(cuando);
  for (let i = 0; i < cuantos; i++) F.sumarMensajeHora(chat, claveDia(d), d.getHours());
}
const enviadosA = (chat, desde = 0) => globalThis.enviados.slice(desde).filter((e) => e.chat === chat).map((e) => e.msg);
// The id the fake client gave a message it sent (test/helpers.mjs): its place among everything sent.
const idDe = (msg) => `MSG${globalThis.enviados.findIndex((e) => e.msg === msg) + 1}`;
const estado = (chat) => {
  const { catalogoMostrado, catalogoMensaje } = F.getChat(chat);
  return [catalogoMostrado, catalogoMensaje];
};
const sinErrores = async (hacer) => {
  const real = console.error;
  console.error = () => {};
  try {
    return await hacer();
  } finally {
    console.error = real;
  }
};

test("el catálogo sale solo en un grupo de compraventa: la lista de .catalogo, con título y cómo entrar en ella", async () => {
  const chat = "cat-sale@g.us";
  const [bici, mesa] = grupo(chat);
  const ahora = hoyALas(13);
  escriben(chat, 10, ahora - HORA);
  const antes = globalThis.enviados.length;
  const mostrados = await C.mostrarCatalogos(ahora);
  // A pass goes over every group, another test's too: it returns how many catalogues went out in all.
  assert.equal(mostrados, globalThis.enviados.slice(antes).filter((e) => e.msg.text).length);
  const [catalogo, ...resto] = enviadosA(chat, antes);
  assert.deepEqual(resto, []);
  assert.deepEqual(catalogo, {
    text:
      `🛒 *CATÁLOGO DEL GRUPO*\n\n🏷️ *EN VENTA* (2)\n*#${mesa}* mesa de luz $ 800 — P111\n*#${bici}* bici rodado 26 $ 4.000 — P111\n\n` +
      "Detalle: .catalogo N · teléfonos: .catalogo numero · buscar: .buscar <palabra> · avisos: .avisame <palabra>\n" +
      "📌 ¿Vendés algo? Empezá tu mensaje con «vendo», decí qué es y a cuánto, y queda en esta lista.",
  });
  assert.equal(catalogo.mentions, undefined, "no arroba a nadie");
  assert.deepEqual(estado(chat), [ahora, idDe(catalogo)], "queda anotado cuándo salió y con qué mensaje");
});

test("sale entre las 11 y las 21, como la ronda del día", async () => {
  const horas = [
    [10, 59, 0],
    [11, 0, 1],
    [20, 59, 1],
    [21, 0, 0],
    [23, 30, 0],
    [3, 0, 0],
  ];
  for (const [hora, minutos, sale] of horas) {
    const chat = `cat-hora-${hora}-${minutos}@g.us`;
    grupo(chat);
    const ahora = hoyALas(hora, minutos);
    escriben(chat, 10, ahora - 2 * HORA);
    const antes = globalThis.enviados.length;
    await C.mostrarCatalogos(ahora);
    assert.equal(enviadosA(chat, antes).length, sale, `a las ${hora}:${String(minutos).padStart(2, "0")}`);
  }
});

test("cada 4 horas como mucho, y el anterior se borra cuando sale el nuevo", async () => {
  const chat = "cat-cada@g.us";
  grupo(chat);
  const primera = hoyALas(11);
  escriben(chat, 10, primera - HORA);
  await C.mostrarCatalogos(primera);
  const [, primerMensaje] = estado(chat);
  // The group keeps writing, a lot: it's the time that holds it back.
  escriben(chat, 50, primera + HORA);
  let antes = globalThis.enviados.length;
  await C.mostrarCatalogos(primera + 4 * HORA - MIN);
  assert.deepEqual(enviadosA(chat, antes), [], "a las 3 h 59 todavía no");
  assert.deepEqual(estado(chat), [primera, primerMensaje]);

  antes = globalThis.enviados.length;
  const segunda = primera + 4 * HORA;
  await C.mostrarCatalogos(segunda);
  const [nuevo, borrado, ...resto] = enviadosA(chat, antes);
  assert.match(nuevo.text, /^🛒 \*CATÁLOGO DEL GRUPO\*/);
  assert.deepEqual(borrado, { delete: { remoteJid: chat, fromMe: true, id: primerMensaje } }, "el anterior se borra, y después de mandar el nuevo");
  assert.deepEqual(resto, []);
  assert.deepEqual(estado(chat), [segunda, idDe(nuevo)], "el que queda anotado es el nuevo");
});

test("solo si el grupo estuvo escribiendo desde la hora del anterior", async () => {
  const chat = "cat-actividad@g.us";
  grupo(chat);
  const primera = hoyALas(11, 2);
  escriben(chat, 10, primera - HORA);
  await C.mostrarCatalogos(primera);
  const despues = primera + 4 * HORA;
  const sale = async (cuando = despues) => {
    const antes = globalThis.enviados.length;
    await C.mostrarCatalogos(cuando);
    return enviadosA(chat, antes).filter((e) => e.text).length;
  };
  assert.equal(await sale(), 0, "nadie escribió: el anterior sigue a la vista");
  // What was written in the hour it went out doesn't count: the count is by the hour, and it may be from before.
  escriben(chat, 30, primera);
  assert.equal(await sale(), 0, "lo de esa misma hora no cuenta");
  escriben(chat, 9, primera + HORA);
  assert.equal(await sale(), 0, "con 9 mensajes todavía no");
  escriben(chat, 1, primera + 3 * HORA);
  assert.equal(await sale(), 1, "con 10, sí");

  // The next day counts as well: the hour is compared with its day.
  const manana = hoyALas(11, 2) + DIA;
  escriben(chat, 10, hoyALas(9) + DIA);
  assert.equal(await sale(manana), 1, "lo escrito al otro día, a una hora más temprana, es posterior");
});

test("no sale donde no es un grupo de compraventa, ni apagado, ni con el bot callado, ni sin nada publicado", async () => {
  const ahora = hoyALas(13);
  const casos = [
    ["cat-amigos@g.us", "en un grupo de amigos", () => F.updateChat("cat-amigos@g.us", { games: 1, monedas: 1 })],
    ["cat-juegos@g.us", "con los juegos prendidos", () => F.updateChat("cat-juegos@g.us", { games: 1 })],
    ["cat-apagado@g.us", "con .catalogoauto off", () => F.updateChat("cat-apagado@g.us", { catalogoAuto: 0 })],
    ["cat-banchat@g.us", "con .banchat", () => F.updateChat("cat-banchat@g.us", { isBanned: 1 })],
    ["cat-modoadmin@g.us", "con .modoadmin", () => F.updateChat("cat-modoadmin@g.us", { adminMode: 1 })],
    ["cat-vacio@g.us", "sin nada publicado", () => C.cambiarPorComando("cat-vacio@g.us", "111@lid", false, "baja", "todas")],
  ];
  for (const [chat, , preparar] of casos) {
    grupo(chat);
    preparar();
    escriben(chat, 10, ahora - HORA);
  }
  grupo("cat-testigo@g.us");
  escriben("cat-testigo@g.us", 10, ahora - HORA);
  const antes = globalThis.enviados.length;
  await C.mostrarCatalogos(ahora);
  for (const [chat, cuando] of casos) {
    assert.deepEqual(enviadosA(chat, antes), [], cuando);
    assert.equal(F.getChat(chat).catalogoMostrado, 0, `${cuando}: tampoco queda como mostrado`);
  }
  assert.equal(enviadosA("cat-testigo@g.us", antes).length, 1, "y en el mismo paso, el que sí es de compraventa lo recibe");
  assert.deepEqual(F.chatsConPublicaciones().filter((c) => c === "cat-vacio@g.us"), [], "sin publicaciones activas, el grupo ni se mira");
});

test("una reservada también es catálogo, y con solo pedidos se muestra igual", async () => {
  const chat = "cat-reservada@g.us";
  const [numero] = grupo(chat, { avisos: ["heladera $ 9.000"] });
  C.cambiarEstado(chat, numero, "111@lid", false, "reservado");
  const pedidos = "cat-pedidos@g.us";
  grupo(pedidos, { avisos: [] });
  C.publicar(pedidos, "222@lid", "compro", "cochecito de bebé");
  const ahora = hoyALas(13);
  for (const c of [chat, pedidos]) escriben(c, 10, ahora - HORA);
  const antes = globalThis.enviados.length;
  await C.mostrarCatalogos(ahora);
  assert.match(enviadosA(chat, antes)[0].text, new RegExp(`🔒 \\*#${numero}\\* heladera`));
  assert.match(enviadosA(pedidos, antes)[0].text, /🔎 \*SE BUSCA\* \(1\)/);
});

test("dos pasadas a la vez muestran uno solo", async () => {
  const chat = "cat-dos-pasadas@g.us";
  grupo(chat);
  const ahora = hoyALas(13);
  escriben(chat, 10, ahora - HORA);
  const antes = globalThis.enviados.length;
  const mostrados = await Promise.all([C.mostrarCatalogos(ahora), C.mostrarCatalogos(ahora + 1)]);
  assert.equal(enviadosA(chat, antes).length, 1);
  // Between the two, each group that was due got one, whichever pass reached it first.
  const enTotal = globalThis.enviados.slice(antes).filter((e) => e.msg.text);
  assert.equal(mostrados[0] + mostrados[1], enTotal.length);
  assert.equal(new Set(enTotal.map((e) => e.chat)).size, enTotal.length, "ningún grupo lo recibió dos veces");
});

// The send may fail: the mark goes back and the next pass tries again, a few times and no more (as the round's
// notices, lib/avisos-programados.js). The one before isn't deleted for a catalogue that didn't go out.
test("si no sale, la pasada siguiente lo intenta de nuevo, sin borrar el anterior; al quinto fallo espera al próximo turno", async () => {
  const chat = "cat-falla@g.us";
  grupo(chat);
  const primera = hoyALas(11);
  escriben(chat, 10, primera - HORA);
  await C.mostrarCatalogos(primera);
  const anterior = estado(chat);
  escriben(chat, 10, primera + HORA);

  const intentos = [];
  const sinConexion = {
    sendMessage: async (aQuien, msg) => {
      if (aQuien === chat) intentos.push(msg);
      throw new Error("sin conexión");
    },
  };
  const segunda = primera + 4 * HORA;
  await sinErrores(() => C.mostrarCatalogos(segunda, sinConexion));
  assert.equal(intentos.length, 1);
  assert.ok(intentos[0].text, "lo que intentó mandar es el catálogo, no el borrado");
  assert.deepEqual(estado(chat), anterior, "vuelve a como estaba: el anterior sigue siendo el que está en el chat");

  // The next pass, with the connection back.
  const antes = globalThis.enviados.length;
  await C.mostrarCatalogos(segunda + 5 * MIN);
  const [nuevo, borrado] = enviadosA(chat, antes);
  assert.match(nuevo.text, /^🛒/);
  assert.deepEqual(borrado, { delete: { remoteJid: chat, fromMe: true, id: anterior[1] } });

  // A group it can't send to: five tries, one per pass, and then nothing until its next turn. Each group has its own
  // five: another one in the same state doesn't use them up.
  const mudo = "cat-mudo@g.us";
  const otroMudo = "cat-mudo-2@g.us";
  for (const c of [mudo, otroMudo]) {
    grupo(c);
    escriben(c, 10, primera - HORA);
  }
  const aMudo = [];
  const alOtro = [];
  const expulsado = {
    sendMessage: async (aQuien) => {
      if (aQuien !== mudo && aQuien !== otroMudo) return { key: { id: "X" } };
      (aQuien === mudo ? aMudo : alOtro).push(aQuien);
      throw new Error("forbidden");
    },
  };
  await sinErrores(async () => {
    for (let i = 0; i < 8; i++) await C.mostrarCatalogos(primera + i * 5 * MIN, expulsado);
  });
  assert.equal(aMudo.length, 5, "cinco intentos y no más");
  assert.equal(alOtro.length, 5, "y cinco para el otro grupo");
  const quinto = primera + 4 * 5 * MIN;
  assert.equal(F.getChat(mudo).catalogoMostrado, quinto, "el quinto queda como mostrado: hasta dentro de 4 horas no insiste");
  // Its next turn, with the group still writing, is another catalogue, with its own tries.
  escriben(mudo, 10, quinto + HORA);
  await sinErrores(async () => {
    for (let i = 0; i < 2; i++) await C.mostrarCatalogos(quinto + 4 * HORA + i * 5 * MIN, expulsado);
  });
  assert.equal(aMudo.length, 7, "al turno siguiente vuelve a intentar, y a reintentar");
  assert.equal(alOtro.length, 5, "el otro, que no escribió más, no");
});

// Baileys returns nothing when it sends nothing. With no id for the new one there'd be no deleting it next time: the
// one before stays in the chat and on record.
test("un envío sin id deja el anterior en su lugar; y si el borrado falla, el catálogo nuevo vale igual", async () => {
  const chat = "cat-sin-id@g.us";
  grupo(chat);
  const primera = hoyALas(11);
  escriben(chat, 10, primera - HORA);
  await C.mostrarCatalogos(primera);
  const [, anterior] = estado(chat);
  escriben(chat, 10, primera + HORA);
  const mandados = [];
  const sinId = { sendMessage: async (aQuien, msg) => void (aQuien === chat && mandados.push(msg)) };
  const segunda = primera + 4 * HORA;
  await C.mostrarCatalogos(segunda, sinId);
  assert.equal(mandados.length, 1, "no borra el anterior");
  assert.deepEqual(estado(chat), [segunda, anterior]);

  escriben(chat, 10, segunda + HORA);
  const tercera = segunda + 4 * HORA;
  const borradoFalla = {
    sendMessage: async (aQuien, msg) => {
      if (msg.delete) throw new Error("muy viejo");
      return { key: { id: "NUEVO" } };
    },
  };
  await C.mostrarCatalogos(tercera, borradoFalla);
  assert.deepEqual(estado(chat), [tercera, "NUEVO"]);
});

test(".catalogoauto off lo apaga y on lo vuelve a prender; .config y .modo lo muestran", async () => {
  const chat = "cat-interruptor@g.us";
  grupo(chat);
  const ahora = hoyALas(13);
  escriben(chat, 10, ahora - HORA);
  const msg = { chat, sender: "111@lid", isGroup: true, key: { id: "CFG" } };
  const config = (args) => Config.run(msg, { client: conexion.client, command: "catalogoauto", args, usedPrefix: ".", isOwner: false, isAdmin: true, chat: F.getChat(chat), botSettings: {} });
  const verConfig = async () => {
    await VerConfig.run(msg, { client: conexion.client, groupMetadata: { id: chat, subject: "Ventas" }, chat: F.getChat(chat) });
    return globalThis.enviados.at(-1).msg.text;
  };
  assert.ok(Config.cmd.includes("catalogoauto"));
  assert.equal(F.getChat(chat).catalogoAuto, 1, "prendido de entrada");
  assert.match(await verConfig(), /✅ Catálogo cada tanto, en modo compraventa \(\.catalogoauto\)/);
  assert.match(Modo.textoModo(chat), /apagados\. Muestro el catálogo cada 4 horas, de 11 a 21 \(\.catalogoauto off lo apaga\)\.\n/);

  await config(["off"]);
  assert.equal(F.getChat(chat).catalogoAuto, 0);
  assert.match(await verConfig(), /❌ Catálogo cada tanto, en modo compraventa \(\.catalogoauto\)/);
  assert.match(Modo.textoModo(chat), /apagados\. El catálogo no lo muestro por mi cuenta \(\.catalogoauto on\)\.\n/);
  let antes = globalThis.enviados.length;
  await C.mostrarCatalogos(ahora);
  assert.deepEqual(enviadosA(chat, antes), []);

  await config(["on"]);
  antes = globalThis.enviados.length;
  await C.mostrarCatalogos(ahora);
  assert.equal(enviadosA(chat, antes).length, 1);

  F.updateChat(chat, { games: 1 });
  assert.doesNotMatch(Modo.textoModo(chat), /catálogo/i, "fuera del modo compraventa, .modo no habla del catálogo");
  F.updateChat(chat, { games: 0 });

  // Someone who isn't an admin doesn't switch it.
  await Config.run(msg, { client: conexion.client, command: "catalogoauto", args: ["off"], usedPrefix: ".", isOwner: false, isAdmin: false, chat: F.getChat(chat), botSettings: {} });
  assert.equal(F.getChat(chat).catalogoAuto, 1);
});

test("mensajesDespuesDe cuenta lo escrito después de una hora de un día, sin esa hora y solo en ese grupo", () => {
  const chat = "cat-cuenta@g.us";
  const otro = "cat-cuenta-otro@g.us";
  for (const [fecha, hora, n] of [["2026-03-10", 9, 1], ["2026-03-10", 14, 2], ["2026-03-10", 15, 4], ["2026-03-10", 23, 8], ["2026-03-11", 0, 16], ["2026-03-11", 14, 32], ["2026-04-01", 3, 64]]) {
    for (let i = 0; i < n; i++) F.sumarMensajeHora(chat, fecha, hora);
  }
  for (let i = 0; i < 5; i++) F.sumarMensajeHora(otro, "2026-03-11", 10);
  assert.equal(F.mensajesDespuesDe(chat, "2026-03-10", 14), 4 + 8 + 16 + 32 + 64);
  assert.equal(F.mensajesDespuesDe(chat, "2026-03-10", 23), 16 + 32 + 64);
  assert.equal(F.mensajesDespuesDe(chat, "2026-03-11", 14), 64);
  assert.equal(F.mensajesDespuesDe(chat, "2026-04-01", 3), 0);
  assert.equal(F.mensajesDespuesDe(chat, "1970-01-01", 0), 127, "sin catálogo anterior, todo lo que hay");
  assert.equal(F.mensajesDespuesDe("cat-cuenta-nadie@g.us", "2026-03-10", 14), 0);
});

// lib/tareas-programadas.js can't be run in a test (it sets timers): read as a syntax tree.
test("las tareas de cada 5 minutos muestran el catálogo después de la ronda del día", async () => {
  const fuente = fs.readFileSync(new URL("../lib/tareas-programadas.js", import.meta.url), "utf8");
  const llamadas = await nodosQue('VariableDeclarator[id.name="correr"] CallExpression[callee.name="mostrarCatalogos"]', fuente);
  assert.equal(llamadas.length, 1);
  // It hangs from the round's promise, after it: .then(() => mostrarCatalogos()) on what chequearPublicaciones() gives.
  const cadena = fuente.slice(fuente.indexOf("chequearPublicaciones()"), llamadas[0].range ? llamadas[0].range[1] : undefined);
  assert.match(cadena, /^chequearPublicaciones\(\)\s*\.catch\([^\n]*\)\s*\.then\(\(\) => mostrarCatalogos\(\)/);
  assert.match(fuente, /\.then\(\(\) => mostrarCatalogos\(\)\)\s*\.catch\(/, "y su error no se pierde");
});
