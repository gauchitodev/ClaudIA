import { test, before } from "node:test";
import assert from "node:assert/strict";
import { Jimp } from "jimp";
import { prepararBase, G } from "./helpers.mjs";

// The effects on someone's profile photo (.gay, .trans, .bi, .cárcel, .licenciahot, .simp) and .gpu, when the bot can't
// see that photo: lib/foto-perfil.js gave a grey generic avatar instead, and the effects went on it as if it were that
// person's photo. And when the image doesn't come out: the effects stayed at the ⏳, saying nothing.
const EFECTOS = [
  ["fun-canvas-gay", "gay"],
  ["fun-canvas-trans", "trans"],
  ["fun-canvas-bisexual", "bi"],
  ["fun-canvas-carcel", "carcel"],
  ["fun-canvas-horny-card", "hornycard"],
  ["fun-canvas-simp", "simp"],
];
const FOTO = "https://pps.whatsapp.net/v/t61/foto-de-111.jpg";
// How Baileys 7 leaves it when WhatsApp doesn't give the photo: it throws the error WhatsApp answers with
// (assertNodeErrorFree), and gives undefined when WhatsApp doesn't answer in time (waitForMessage).
const SIN_FOTO = {
  "WhatsApp contesta con un error": async () => {
    throw new Error("error de WhatsApp");
  },
  "WhatsApp no contesta a tiempo": async () => undefined,
};
const NO_SALIO = "No pude armar la foto; probá de nuevo en un rato.";

let Foto;
const bajadas = [];
let noBaja = () => false;
before(async () => {
  await prepararBase("foto-perfil");
  globalThis.txt = (await import("../lib/strings.js")).default;
  Foto = await import("../lib/foto-perfil.js");
  const cuadrado = await new Jimp({ width: 64, height: 64, color: 0xff0000ff }).getBuffer("image/png");
  // Neither the photo nor the flags come from the internet: every image asked for is the same red square, unless
  // noBaja says that one answers 404.
  (await import("../lib/canvas.js"))._dep.pedirHttp = async (url) => {
    bajadas.push(url);
    if (noBaja(url)) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, arrayBuffer: async () => cuadrado.buffer.slice(cuadrado.byteOffset, cuadrado.byteOffset + cuadrado.byteLength) };
  };
});

// A plugin run on "@111", with WhatsApp answering for the photo as fotoDe says: what it sent, reacted and downloaded.
// noBajan picks the images that don't come down, and mandar stands for sendFile.
async function correr(archivo, command, fotoDe, { noBajan = () => false, mandar } = {}) {
  const P = (await import(`../plugins/${archivo}.js`)).default;
  const r = { textos: [], archivos: [], reacciones: [] };
  const client = {
    sendText: async (chat, texto, citado) => (r.textos.push({ texto, citado }), { key: { id: "T" } }),
    sendFile: mandar || (async (chat, archivo, nombre, caption) => (r.archivos.push({ archivo, caption }), {})),
    profilePictureUrl: async (jid) => fotoDe(jid),
  };
  r.m = { chat: G, sender: "555@lid", react: (e) => r.reacciones.push(e), mentionedJid: ["111@lid"], quoted: null };
  bajadas.length = 0;
  noBaja = noBajan;
  await P.run(r.m, { client, text: "@111", usedPrefix: ".", command, participants: [{ id: "111@lid" }, { id: "555@lid" }] });
  r.bajadas = [...bajadas];
  return r;
}

test("sin la foto visible, .gay, .trans y los demás efectos lo dicen, sin ⏳ ni imagen", async () => {
  for (const [archivo, command] of EFECTOS) {
    for (const [como, fotoDe] of Object.entries(SIN_FOTO)) {
      const r = await correr(archivo, command, fotoDe);
      const caso = `.${command}, ${como}`;
      assert.deepEqual(r.textos.map((t) => t.texto), [txt.defaultNoPP], caso);
      assert.equal(r.textos[0].citado, r.m, `${caso}: citando el pedido`);
      assert.deepEqual(r.reacciones, [], `${caso}: sin ⏳`);
      assert.deepEqual(r.archivos, [], `${caso}: sin imagen`);
      assert.deepEqual(r.bajadas, [], `${caso}: ni baja la capa`);
    }
  }
});

test("con la foto visible, el efecto sale sobre esa foto", async () => {
  for (const [archivo, command] of EFECTOS) {
    const r = await correr(archivo, command, async () => FOTO);
    assert.deepEqual(r.textos, [], `.${command}`);
    assert.deepEqual(r.reacciones, ["⏳"], `.${command}`);
    assert.equal(r.archivos.length, 1, `.${command}: una imagen`);
    assert.ok(Buffer.isBuffer(r.archivos[0].archivo), `.${command}: la que armó`);
    assert.equal(r.bajadas.length, 2, `.${command}: su foto y la capa`);
    assert.ok(r.bajadas.includes(FOTO), `.${command}: sobre su foto`);
  }
});

test("si no baja su foto o la capa, o la imagen no sale, los efectos lo dicen", async () => {
  const casos = {
    "no baja su foto": { noBajan: (url) => url === FOTO },
    "no baja la capa": { noBajan: (url) => url !== FOTO },
    "la imagen no sale": {
      mandar: async () => {
        throw new Error("Connection Closed");
      },
    },
  };
  const errorReal = console.error;
  const errores = [];
  console.error = (...partes) => errores.push(partes.join(" "));
  try {
    for (const [archivo, command] of EFECTOS) {
      for (const [como, opciones] of Object.entries(casos)) {
        const r = await correr(archivo, command, async () => FOTO, opciones);
        const caso = `.${command}, ${como}`;
        assert.deepEqual(r.textos.map((t) => t.texto), [NO_SALIO], caso);
        assert.equal(r.textos[0].citado, r.m, `${caso}: citando el pedido`);
        assert.deepEqual(r.reacciones, ["⏳"], caso);
        assert.deepEqual(r.archivos, [], `${caso}: sin imagen`);
        assert.ok(errores.at(-1)?.startsWith(`[${command}] no pude armar la foto: `), `${caso}: queda en el log`);
      }
    }
  } finally {
    console.error = errorReal;
  }
});

test("obtenerFotoPerfil: la foto, o null si no se ve; nunca un avatar en su lugar", async () => {
  const con = (fotoDe, pedidas = []) => ({ profilePictureUrl: async (jid) => (pedidas.push(jid), fotoDe(jid)) });
  assert.equal(await Foto.obtenerFotoPerfil(con(async () => FOTO), "111@lid"), FOTO);
  for (const [como, fotoDe] of Object.entries(SIN_FOTO)) assert.equal(await Foto.obtenerFotoPerfil(con(fotoDe), "111@lid"), null, como);
  assert.equal(await Foto.obtenerFotoPerfil(con(async () => FOTO), null), null, "sin nadie a quien pedírsela");

  // Someone whose number the bot knows: by the number first and, if that one doesn't show it, by the LID.
  const [LID, NUMERO] = ["222@lid", "59899000222@s.whatsapp.net"];
  db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)").run(LID, NUMERO, "Beto", 1);
  const casos = [
    ["el número la muestra", (jid) => (jid === NUMERO ? FOTO : undefined), FOTO, [NUMERO]],
    ["solo la LID la muestra", (jid) => (jid === LID ? FOTO : undefined), FOTO, [NUMERO, LID]],
    ["ninguno la muestra", () => undefined, null, [NUMERO, LID]],
  ];
  for (const [como, fotoDe, sale, pide] of casos) {
    const pedidas = [];
    assert.equal(await Foto.obtenerFotoPerfil(con(async (jid) => fotoDe(jid), pedidas), LID), sale, como);
    assert.deepEqual(pedidas, pide, como);
  }
});

test(".gpu: sin la foto visible lo dice, y si se ve la manda", async () => {
  for (const [como, fotoDe] of Object.entries(SIN_FOTO)) {
    const r = await correr("get-pp-user", "gpu", fotoDe);
    assert.deepEqual(r.textos.map((t) => t.texto), [txt.defaultNoPP], como);
    assert.deepEqual(r.archivos, [], como);
  }
  const r = await correr("get-pp-user", "gpu", async () => FOTO);
  assert.deepEqual(r.textos, []);
  assert.deepEqual(r.archivos.map((a) => a.archivo), [FOTO]);
});
