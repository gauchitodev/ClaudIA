// .emojimix (plugins/sticker-emojimix.js, lib/emojimix.js): the index of Emoji Kitchen's mixes, built from the
// community's catalogue and kept on disk, and the command that answers from it. Nothing here goes out to the network:
// fetch is a fake that serves a small catalogue shaped like the real one, in pieces that cut its objects in half.
import { test, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { iniciarEmojimix, buscarMezcla, bajarMezcla, _pruebas } from "../lib/emojimix.js";

const AQUI = process.cwd();
const CATALOGO = "https://raw.githubusercontent.com/xsalazar/emoji-kitchen-backend/main/app/metadata.json";
const GSTATIC = "https://www.gstatic.com/android/keyboard/emojikitchen/";
const INDICE = path.join("database", "emojimix.tsv");
const fetchReal = globalThis.fetch;
const consola = { log: console.log, error: console.error };
const dicho = []; // what the lib logged
const carpetas = [];

// One combination, as metadata.json writes it.
const combinacion = (izquierda, derecha, fecha, extra = {}) => ({
  gStaticUrl: `${GSTATIC}${fecha}/u${izquierda}/u${izquierda}_u${derecha}.png`,
  alt: `${izquierda}-${derecha}`,
  leftEmoji: "x",
  leftEmojiCodepoint: izquierda,
  rightEmoji: "y",
  rightEmojiCodepoint: derecha,
  date: fecha,
  isLatest: true,
  gBoardOrder: 1,
  ...extra,
});

// A catalogue with the real one's shape and enough pairs to pass for whole (over 10.000): every pair among 150 faces,
// and a handful written by hand for what the tests ask.
const CARAS = Array.from({ length: 150 }, (_, i) => (0x1f600 + i).toString(16));
function catalogo({ pares = true } = {}) {
  const lista = [];
  if (pares) for (let i = 0; i < CARAS.length; i++) for (let j = i + 1; j < CARAS.length; j++) lista.push(combinacion(CARAS[i], CARAS[j], "20201001"));
  lista.push(
    combinacion("1f525", "1f60e", "20200101"), // 🔥+😎, an older image of the pair...
    combinacion("1f60e", "1f525", "20230301"), // ...and the newest, written the other way round
    combinacion("1f60e", "1f525", "20990101", { isLatest: false }), // one that isn't the latest doesn't count
    combinacion("2764-fe0f", "1f44d", "20210521"), // ❤️+👍
    combinacion("1f525", "1f44d", "20210521", { gStaticUrl: "https://ejemplo.invalid/u1f525_u1f44d.png" }), // not Google's
  );
  const data = {};
  for (const c of lista) ((data[c.leftEmojiCodepoint] ??= { alt: "x", keywords: ["x"], emojiCodepoint: c.leftEmojiCodepoint, combinations: {} }).combinations[c.rightEmojiCodepoint] ??= []).push(c);
  return JSON.stringify({ knownSupportedEmoji: Object.keys(data), data });
}
const ENTERO = catalogo();

// The answer GitHub gives: the catalogue in pieces of 1000 bytes, with its ETag.
function respuestaCon(texto, etag = 'W/"v1"') {
  const bytes = new TextEncoder().encode(texto);
  const cuerpo = new ReadableStream({
    start(c) {
      for (let i = 0; i < bytes.length; i += 1000) c.enqueue(bytes.subarray(i, i + 1000));
      c.close();
    },
  });
  return new Response(cuerpo, { status: 200, headers: etag ? { etag } : {} });
}

// fetch, answering the catalogue's address with what `responder` gives each time. Returns the requests it got.
function github(responder) {
  const pedidos = [];
  globalThis.fetch = async (url, opciones = {}) => {
    assert.equal(String(url), CATALOGO);
    pedidos.push(opciones.headers || {});
    return responder(pedidos.length);
  };
  return pedidos;
}

// Waits for the download in progress, if there's one.
const terminarDescarga = async () => {
  await _pruebas.descarga();
};

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-emojimix-"));
  carpetas.push(dir);
  process.chdir(dir);
  _pruebas.reiniciar();
  dicho.length = 0;
  console.log = (...a) => dicho.push(a.join(" "));
  console.error = (...a) => dicho.push(a.join(" "));
  globalThis.fetch = async () => assert.fail("nadie tendría que salir a la red");
});
after(() => {
  process.chdir(AQUI);
  globalThis.fetch = fetchReal;
  Object.assign(console, consola);
  mock.timers.reset();
  for (const dir of carpetas) fs.rmSync(dir, { recursive: true, force: true });
});

test("sin índice, el arranque baja el catálogo, guarda solo el índice y no lo carga hasta que alguien usa el comando", async () => {
  const pedidos = github(() => respuestaCon(ENTERO));
  await iniciarEmojimix();
  await terminarDescarga();
  assert.deepEqual(pedidos, [{}], "un pedido, y sin ETag: no hay índice que conservar");
  const lineas = fs.readFileSync(INDICE, "utf8").split("\n");
  assert.equal(lineas.length, (CARAS.length * (CARAS.length - 1)) / 2 + 2, "cada par una vez");
  assert.ok(lineas.includes("1f525|1f60e\t20230301/u1f60e/u1f60e_u1f525.png"), "del par repetido, la imagen más nueva de las vigentes");
  assert.ok(!lineas.some((l) => l.includes("ejemplo.invalid") || l.startsWith("1f44d|1f525")), "lo que no es de gstatic no entra");
  assert.equal(fs.readFileSync(`${INDICE}.etag`, "utf8"), 'W/"v1"');
  assert.ok(!fs.existsSync(`${INDICE}.tmp`));
  assert.equal(_pruebas.enMemoria(), false, "en memoria, recién con el primer uso");

  assert.deepEqual(await buscarMezcla("😎", "🔥"), { estado: "ok", url: `${GSTATIC}20230301/u1f60e/u1f60e_u1f525.png` });
  assert.equal(_pruebas.enMemoria(), true);
  assert.deepEqual(await buscarMezcla("🔥", "😎"), { estado: "ok", url: `${GSTATIC}20230301/u1f60e/u1f60e_u1f525.png` }, "en cualquier orden");
  assert.equal(pedidos.length, 1, "buscar no sale a la red");
});

test("buscarMezcla: con o sin selector de variación, el tono de piel cae al emoji base, y dice qué falta", async () => {
  github(() => respuestaCon(ENTERO));
  await iniciarEmojimix();
  await terminarDescarga();
  const corazon = { estado: "ok", url: `${GSTATIC}20210521/u2764-fe0f/u2764-fe0f_u1f44d.png` };
  assert.deepEqual(await buscarMezcla("❤️", "👍"), corazon);
  assert.deepEqual(await buscarMezcla("\u2764", "👍"), corazon, "el corazón sin el selector es el mismo emoji");
  assert.deepEqual(await buscarMezcla("❤️", "👍🏽"), corazon, "con tono de piel, el pulgar amarillo");
  assert.deepEqual(await buscarMezcla("🔥", "👍"), { estado: "sin_combinacion" }, "los dos están, pero no juntos");
  assert.deepEqual(await buscarMezcla("🦖", "🔥"), { estado: "no_soportado", sinCatalogo: ["🦖"] });
  assert.deepEqual(await buscarMezcla("🦖", "🧉"), { estado: "no_soportado", sinCatalogo: ["🦖", "🧉"] });
});

test("sin catálogo todavía dice no_disponible, y una descarga que falla se reintenta cada vez más espaciada", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T12:00:00Z") });
  try {
    const pedidos = github(() => new Response("no", { status: 503 }));
    const usar = async () => {
      const r = await buscarMezcla("😎", "🔥");
      await terminarDescarga();
      return r;
    };
    assert.deepEqual(await usar(), { estado: "no_disponible" });
    assert.equal(pedidos.length, 1);
    assert.match(dicho.join("\n"), /no pude bajar el catálogo: GitHub respondió 503/);
    await usar();
    assert.equal(pedidos.length, 1, "enseguida no reintenta");
    // 10 minutes after the first failure, 20 after the second, 40 after the third
    for (const [minutos, esperados] of [[9, 1], [1, 2], [19, 2], [1, 3], [39, 3], [1, 4]]) {
      mock.timers.tick(minutos * 60 * 1000);
      await usar();
      assert.equal(pedidos.length, esperados, `a los ${minutos} minutos más`);
    }
    assert.ok(!fs.existsSync(INDICE));
  } finally {
    mock.timers.reset();
  }
});

test("un índice vencido se confirma con el ETag: con un 304 no se baja nada y vale por dos semanas más", async () => {
  github(() => respuestaCon(ENTERO));
  await iniciarEmojimix();
  await terminarDescarga();
  const guardado = fs.readFileSync(INDICE, "utf8");

  // The bot starts again 15 days later.
  const viejo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  fs.utimesSync(INDICE, viejo, viejo);
  _pruebas.reiniciar();
  const pedidos = github(() => new Response(null, { status: 304 }));
  await iniciarEmojimix();
  await terminarDescarga();
  assert.deepEqual(pedidos, [{ "If-None-Match": 'W/"v1"' }]);
  assert.equal(fs.readFileSync(INDICE, "utf8"), guardado);
  assert.ok(Date.now() - fs.statSync(INDICE).mtimeMs < 60 * 1000, "la fecha del índice dice que se confirmó recién");
  assert.equal(_pruebas.enMemoria(), false);
  assert.equal((await buscarMezcla("😎", "🔥")).estado, "ok", "y sirve el que estaba");
  await terminarDescarga();
  assert.equal(pedidos.length, 1, "no vuelve a preguntar");

  // And once more, with the index fresh: nothing to ask.
  _pruebas.reiniciar();
  await iniciarEmojimix();
  await terminarDescarga();
  assert.equal(pedidos.length, 1);
});

test("un catálogo que cambió reemplaza el índice y su ETag; uno roto no pisa el que anda", async () => {
  github(() => respuestaCon(ENTERO));
  await iniciarEmojimix();
  await terminarDescarga();
  assert.equal((await buscarMezcla("😎", "🔥")).estado, "ok"); // in use: the index is in memory from here on
  const guardado = fs.readFileSync(INDICE, "utf8");
  const vencer = () => {
    const viejo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    fs.utimesSync(INDICE, viejo, viejo);
    _pruebas.reiniciar();
  };

  // A catalogue cut short (a handful of pairs): the index stays as it was, and so does its ETag.
  vencer();
  let pedidos = github(() => respuestaCon(catalogo({ pares: false }), 'W/"roto"'));
  assert.equal((await buscarMezcla("😎", "🔥")).estado, "ok", "mientras tanto contesta con el que tiene");
  await terminarDescarga();
  assert.equal(pedidos.length, 1);
  assert.match(dicho.join("\n"), /no pude bajar el catálogo \(sigo con el anterior\): el catálogo trae solo 2 combinaciones/);
  assert.equal(fs.readFileSync(INDICE, "utf8"), guardado);
  assert.equal(fs.readFileSync(`${INDICE}.etag`, "utf8"), 'W/"v1"');
  assert.equal((await buscarMezcla("😎", "🔥")).estado, "ok");

  // A new one, with one more mix: on disk, and in memory at once since the command is in use.
  vencer();
  const nuevo = JSON.parse(ENTERO);
  nuevo.data["1f525"].combinations["1f44d"] = [combinacion("1f525", "1f44d", "20261101")];
  pedidos = github(() => respuestaCon(JSON.stringify(nuevo), 'W/"v2"'));
  assert.deepEqual(await buscarMezcla("🔥", "👍"), { estado: "sin_combinacion" }, "todavía con el viejo");
  await terminarDescarga();
  assert.deepEqual(pedidos, [{ "If-None-Match": 'W/"v1"' }]);
  assert.deepEqual(await buscarMezcla("🔥", "👍"), { estado: "ok", url: `${GSTATIC}20261101/u1f525/u1f525_u1f44d.png` });
  assert.equal(fs.readFileSync(`${INDICE}.etag`, "utf8"), 'W/"v2"');
  assert.ok(fs.readFileSync(INDICE, "utf8").includes("1f44d|1f525\t20261101/u1f525/u1f525_u1f44d.png"));
});

test("un índice en disco que no sirve se baja entero de nuevo, sin ETag", async () => {
  fs.mkdirSync("database");
  fs.writeFileSync(INDICE, "1f525|1f60e\t20230301/u1f60e/u1f60e_u1f525.png");
  fs.writeFileSync(`${INDICE}.etag`, 'W/"v1"');
  const pedidos = github(() => respuestaCon(ENTERO, 'W/"v2"'));
  assert.deepEqual(await buscarMezcla("😎", "🔥"), { estado: "no_disponible" });
  await terminarDescarga();
  assert.deepEqual(pedidos, [{}], "con el ETag, un 304 lo habría dejado sin nada");
  assert.match(dicho.join("\n"), /el índice guardado no sirve \(solo tiene 1 combinaciones\)/);
  assert.equal((await buscarMezcla("😎", "🔥")).estado, "ok");
  assert.equal(fs.readFileSync(`${INDICE}.etag`, "utf8"), 'W/"v2"');
});

test("bajarMezcla: devuelve el PNG, y falla si gstatic no responde bien o manda otra cosa", async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("resto")]);
  globalThis.fetch = async () => new Response(png);
  assert.deepEqual(await bajarMezcla(`${GSTATIC}a.png`), png);
  globalThis.fetch = async () => new Response("<html>", { status: 200 });
  await assert.rejects(bajarMezcla(`${GSTATIC}a.png`), /no devolvió un PNG/);
  globalThis.fetch = async () => new Response("no", { status: 404 });
  await assert.rejects(bajarMezcla(`${GSTATIC}a.png`), /gstatic respondió 404/);
});

test(".emojimix: pide dos emojis, dice por qué no hay mezcla, y si la imagen no baja lo dice", async () => {
  const Plugin = (await import("../plugins/sticker-emojimix.js")).default;
  assert.deepEqual([Plugin.cmd, Plugin.botAdmin], [["emojimix"], true], "como los demás comandos de stickers");
  const textos = [];
  const client = { sendText: async (chat, texto) => textos.push(texto), sendFile: async () => assert.fail("no hay sticker que mandar") };
  const correr = async (text, quoted = null) => {
    textos.length = 0;
    await Plugin.run({ chat: "g@g.us", quoted, react: async () => {} }, { client, text, usedPrefix: "." });
    return textos.join("\n");
  };
  github(() => new Response("no", { status: 503 }));
  for (const texto of ["", "😎", "😎+🔥+👍", "hola + chau"]) assert.match(await correr(texto), /Mandame exactamente dos emojis/, JSON.stringify(texto));
  assert.match(await correr("😎+🔥"), /Todavía no tengo el catálogo/);
  await terminarDescarga();

  _pruebas.reiniciar();
  github(() => respuestaCon(ENTERO));
  await iniciarEmojimix();
  await terminarDescarga();
  assert.equal(await correr("🦖 + 🔥"), "❌ 🦖 no está en Emoji Kitchen: no todos los emojis se pueden mezclar.");
  assert.equal(await correr("🦖🧉"), "❌ 🦖 🧉 no están en Emoji Kitchen: no todos los emojis se pueden mezclar.");
  assert.equal(await correr("🔥+👍"), "❌ 🔥 + 👍 no se pueden combinar. Probá con otros emojis.");
  // the mix exists, and gstatic doesn't give its image: by the quoted message's emojis this time
  const pedidas = [];
  globalThis.fetch = async (url) => (pedidas.push(String(url)), new Response("no", { status: 500 }));
  assert.equal(await correr("", { text: "mirá 😎 y 🔥" }), "❌ No pude armar el sticker. Probá de nuevo en un rato.");
  assert.deepEqual(pedidas, [`${GSTATIC}20230301/u1f60e/u1f60e_u1f525.png`]);
});
