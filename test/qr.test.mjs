import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { Jimp } from "jimp";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import { RITMO } from "../lib/ritmo.js";

// .qr (plugins/tools-qr.js): a text, a link or the message it answers, as a QR code image. What it draws, pixel by
// pixel, against a code ZXing read back as its text; how big the image gets; what the command answers, with a limit
// that counts characters as people see them; and a caption that tags nobody, through the bot's own sendFile.
const G = "120363000000000132@g.us";
const ANA = "300000000000131@lid";
const BETO = "300000000000132@lid";

let F, Plugin, QR, codigoQR, client;
// Every send waits its turn in the chat (lib/ritmo.js), a second and a half after the one before: here they go at once.
const pausaReal = RITMO.MIN_ENTRE_MENSAJES_MS;
after(() => (RITMO.MIN_ENTRE_MENSAJES_MS = pausaReal));
before(async () => {
  RITMO.MIN_ENTRE_MENSAJES_MS = 0;
  ({ F } = await prepararBase("qr"));
  ({ default: Plugin, QR, codigoQR } = await import("../plugins/tools-qr.js"));
  // The bot's wrapper (lib/wa-socket.js) around a socket that never connects: its sendFile, and the parseMention that
  // turns a caption's "@<digits>" into mentions.
  const WS = await import("../lib/wa-socket.js");
  const crearReal = WS._dep.crearSocket;
  const user = { lid: "200000000000131@lid", jid: "59800000131@s.whatsapp.net", id: "59800000131:7@s.whatsapp.net", name: "Claudia" };
  WS._dep.crearSocket = () => ({ ...clienteFalso(), user, ev: { emit() {}, on() {} } });
  try {
    client = WS.makeWASocket({});
  } finally {
    WS._dep.crearSocket = crearReal;
  }
  // sendFile keeps a copy in the bot's tmp/ to send it by path, read and taken away after each one here: the folder is
  // made as main.js makes it on starting up, since a fresh checkout (the CI's) doesn't bring it (.gitignore).
  fs.mkdirSync(new URL("../tmp/", import.meta.url), { recursive: true });
  F.initDataDB({ chat: G, sender: BETO, senderJid: "59899000132@s.whatsapp.net", pushName: "Beto" });
});

// Every pixel of a code's image against its modules, rows of "#" (dark) and "." (light): the dark ones black, the
// light ones and the quiet zone around them white, all of them opaque. Returns the first few that aren't.
async function pixelesMalos(png, modulos, { modulo, lado }) {
  const { bitmap } = await Jimp.read(png);
  const malos = [];
  if (bitmap.width !== lado || bitmap.height !== lado) return [`mide ${bitmap.width}x${bitmap.height}`];
  for (let y = 0; y < lado && malos.length < 5; y++) {
    for (let x = 0; x < lado && malos.length < 5; x++) {
      const [fila, columna] = [Math.floor(y / modulo) - QR.MARGEN, Math.floor(x / modulo) - QR.MARGEN];
      const tono = modulos[fila]?.[columna] === "#" ? 0 : 255;
      const i = (y * lado + x) * 4;
      if (bitmap.data[i] !== tono || bitmap.data[i + 1] !== tono || bitmap.data[i + 2] !== tono || bitmap.data[i + 3] !== 255) malos.push(`${x},${y}`);
    }
  }
  return malos;
}

// Read back by ZXing (zxing-cpp 3.1.1) when this was written as exactly these 17 bytes of UTF-8: version 2, level M.
// The encoder writes a byte per character, so it only gets the "ñ", the accents and the emoji right as UTF-8 bytes.
const ANO_NANDU = [
  "#######..#...##.#.#######",
  "#.....#.#.#.#.###.#.....#",
  "#.###.#..#.#.##.#.#.###.#",
  "#.###.#....#.##...#.###.#",
  "#.###.#.#.....#.#.#.###.#",
  "#.....#..#.#.#..#.#.....#",
  "#######.#.#.#.#.#.#######",
  ".........#.####.#........",
  "#.#.#.#..#.#..#.#...#..#.",
  "....##.#..#...#..##..#..#",
  "#.#.###.....##.#.##..##..",
  ".#.###.#.###....##..#...#",
  "####.##.#...#..#.#......#",
  "..####...#####.#.#....##.",
  "#....##..#.##.###.####.#.",
  ".##.....##..####..##.#...",
  "#.#..##..#.#..#.#####...#",
  "........#..#..#.#...##.#.",
  "#######..##..#.##.#.#.###",
  "#.....#...##....#...#.#..",
  "#.###.#.#.#.#..######.#.#",
  "#.###.#..#####.#.#####...",
  "#.###.#.#.###.#.##.###..#",
  "#.....#..##.#######..###.",
  "#######.##.#..#.#...##.##",
];

test("qr: el código de un texto con tildes, ñ y un emoji es, píxel por píxel, el que ZXing leyó como ese texto", async () => {
  const { png, n, modulo, lado } = await codigoQR("Año ñandú 🧉");
  assert.deepEqual({ n, modulo, lado }, { n: 25, modulo: 12, lado: 396 });
  assert.deepEqual(await pixelesMalos(png, ANO_NANDU, { modulo, lado }), []);
});

// The biggest code the limit lets in, 1500 bytes, drawn at 12 pixels a module was 1836 px a side, and making its PNG
// held the bot almost two seconds: it's drawn smaller, every module still whole. The modules are the encoder's own.
test("qr: el código más grande que deja pasar el límite mide menos de 1000 px, con cada módulo entero; uno chico va a 12 px por módulo", async () => {
  const requerir = createRequire(import.meta.url);
  const QRCode = requerir("qrcode-terminal/vendor/QRCode");
  const NIVEL = requerir("qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel");
  const modulosDe = (texto) => {
    const qr = new QRCode(-1, NIVEL.M);
    qr.addData(Buffer.from(texto, "utf8").toString("latin1"));
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, f) => Array.from({ length: n }, (_, c) => (qr.isDark(f, c) ? "#" : ".")).join(""));
  };
  const pesado = "€".repeat(QR.MAX_CARACTERES);
  assert.equal(Buffer.byteLength(pesado), QR.MAX_BYTES);
  const grande = await codigoQR(pesado);
  assert.deepEqual({ n: grande.n, modulo: grande.modulo, lado: grande.lado }, { n: 145, modulo: 6, lado: 918 });
  assert.deepEqual(await pixelesMalos(grande.png, modulosDe(pesado), grande), []);
  const link = await codigoQR("https://ejemplo.com");
  assert.deepEqual({ n: link.n, modulo: link.modulo, lado: link.lado }, { n: 25, modulo: 12, lado: 396 });
  assert.deepEqual(await pixelesMalos(link.png, modulosDe("https://ejemplo.com"), link), []);
});

// .qr as someone in the group types it, through the bot's sendFile: the text it answered with, or the image's file
// (read back and taken away), its caption and the mentions WhatsApp would get from it.
async function qr(text, extra = {}) {
  globalThis.enviados = [];
  const reacciones = [];
  const m = { chat: G, sender: ANA, isGroup: true, mentionedJid: [], quoted: null, react: (e) => reacciones.push(e), ...extra };
  await Plugin.run(m, { client, text, usedPrefix: ".", command: "qr" });
  assert.equal(globalThis.enviados.length, 1, "un mensaje por pedido");
  const { msg } = globalThis.enviados[0];
  if (!msg.image) return { texto: msg.text, reacciones };
  const png = fs.readFileSync(msg.image.url);
  fs.rmSync(msg.image.url, { force: true });
  return { png, caption: msg.caption, menciones: msg.contextInfo.mentionedJid, reacciones };
}
const imagenDe = async (texto) => (await codigoQR(texto)).png;

test(".qr: sin texto explica cómo se usa; respondiendo a un mensaje, el código es el de ese mensaje", async () => {
  const ayuda = "Escribí el texto o el link: .qr https://ejemplo.com\nO respondé a un mensaje con .qr.";
  assert.equal((await qr("")).texto, ayuda);
  assert.equal((await qr("", { quoted: { text: "", contextInfo: {} } })).texto, ayuda, "una foto sin texto");
  const citando = await qr("", { quoted: { text: "nos vemos en la puerta 3", contextInfo: {} } });
  assert.deepEqual(citando.png, await imagenDe("nos vemos en la puerta 3"));
  assert.equal(citando.caption, "📱 nos vemos en la puerta 3");
  assert.deepEqual(citando.reacciones, ["⏳"]);
  // With a text of its own, that one, even answering a message.
  assert.deepEqual((await qr("https://ejemplo.com", { quoted: { text: "otra cosa", contextInfo: {} } })).png, await imagenDe("https://ejemplo.com"));
});

// A mention travels in the text as the digits of a LID, which only the admins get to see (.id): in the code it's the
// name, as .ttp draws it. And the caption repeated the text: sendFile turned each "@<digits>" into a mention, and four
// of them, cut off at the end, tagged three people and a fourth that was nobody.
test(".qr: una mención va con el nombre, en el código y al pie, y el pie no arroba a nadie", async () => {
  const una = await qr("@300000000000132 te espera abajo", { mentionedJid: [BETO] });
  assert.deepEqual(una.png, await imagenDe("@Beto te espera abajo"), "el código dice el nombre, no la LID");
  assert.equal(una.caption, "📱 @Beto te espera abajo");
  assert.deepEqual(una.menciones, []);
  // Someone mentioned who never wrote has no name to put: "alguien", and not the digits. Only the message's own list
  // of mentions says they're someone; the database knows Beto either way.
  const NADIE = "300000000000009@lid";
  const dos = await qr("@300000000000009 y @300000000000132", { mentionedJid: [NADIE, BETO] });
  assert.deepEqual(dos.png, await imagenDe("@alguien y @Beto"));
  assert.equal(dos.caption, "📱 @alguien y @Beto");
  const citada = await qr("", { quoted: { text: "hola @300000000000009", contextInfo: { mentionedJid: [NADIE] } } });
  assert.deepEqual(citada.png, await imagenDe("hola @alguien"), "las menciones del mensaje citado, también");
  assert.deepEqual(citada.menciones, []);
  // Numbers typed by hand stay in the code as they were typed, and go at the foot without the "@".
  const numeros = "@300000000000222 @300000000000333 @300000000000444 @300000000000555";
  const varios = await qr(numeros);
  assert.deepEqual(varios.png, await imagenDe(numeros));
  assert.equal(varios.caption, "📱 300000000000222 300000000000333 300000000000444 300000000...");
  assert.deepEqual(varios.menciones, []);
});

test(".qr: el límite cuenta los caracteres como se ven, y también los bytes, que son lo que llena un código", async () => {
  const muyLargo = (n) => `Es muy largo para un QR: entran hasta 500 caracteres, menos si lleva muchos emojis (el tuyo tiene ${n}).`;
  assert.equal((await qr("x".repeat(501))).texto, muyLargo(501));
  assert.ok((await qr("x".repeat(500))).png, "500 letras entran");
  // An emoji is one character, with its skin tone or as a flag too: 251 mates said 502.
  assert.equal((await qr("🧉".repeat(501))).texto, muyLargo(501));
  assert.equal((await qr("👍🏽".repeat(501))).texto, muyLargo(501));
  assert.equal((await qr("🇺🇾".repeat(501))).texto, muyLargo(501));
  // Fewer than 500 that don't fit: 376 mates are 1504 bytes, and 375 are the 1500 that do.
  assert.equal((await qr("🧉".repeat(376))).texto, muyLargo(376));
  assert.ok((await qr("🧉".repeat(375))).png, "375 mates entran");
});

// Cut by UTF-16 units, the 57th character of a text of emojis was half of one, and the caption ended in "�".
test(".qr: el pie muestra hasta 60 caracteres, enteros, y si sigue, los primeros 57 y tres puntos", async () => {
  assert.equal((await qr("🧉".repeat(60))).caption, `📱 ${"🧉".repeat(60)}`);
  assert.equal((await qr("🧉".repeat(100))).caption, `📱 ${"🧉".repeat(57)}...`);
  assert.equal((await qr("👍🏽".repeat(100))).caption, `📱 ${"👍🏽".repeat(57)}...`);
});

test(".qr: solo donde Claudia es admin, como las otras herramientas; está en el menú y en la sección de los convertidores", async () => {
  assert.deepEqual([Plugin.cmd, Plugin.botAdmin], [["qr"], true]);
  const { seccionesDelMenu } = await import("../lib/menu.js");
  const { getComandosDeSeccion } = await import("../lib/secciones.js");
  assert.match(seccionesDelMenu(".").find((s) => s.clave === "convertidores").lineas, /^▸ \.qr </m);
  assert.ok(getComandosDeSeccion("convertidores").includes("qr"));
});

test(".qr: si la imagen no sale, lo dice", async () => {
  const errorReal = console.error;
  console.error = () => {};
  const sinRed = { ...clienteFalso(), sendFile: async () => Promise.reject(new Error("sin conexión")) };
  try {
    await Plugin.run({ chat: G, sender: ANA, isGroup: true, mentionedJid: [], quoted: null, react: () => {} }, { client: sinRed, text: "hola", usedPrefix: ".", command: "qr" });
  } finally {
    console.error = errorReal;
  }
  assert.deepEqual(globalThis.enviados.map((e) => e.msg.text), ["No me salió el QR. Probá de nuevo en un rato."]);
});
