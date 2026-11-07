import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { prepararBase, clienteFalso } from "./helpers.mjs";

// The group's stickers (lib/stickers-grupo.js): kept as people send them, sent back at random by .stickerazar, when
// someone answers Claudia with one (plugins/_stickers-grupo.js) and on her own in a glance (lib/vistazos.js). Gemini
// is swapped for canned decisions, like in iniciativa.test.mjs.

let F, S, V, C, RITMO, Hook, Azar, Sacar;
const decisiones = [];
const cuerpos = [];
const fetchReal = globalThis.fetch;
const logReal = console.log;

before(async () => {
  ({ F } = await prepararBase("stickers"));
  globalThis.geminiApiKey = "clave";
  globalThis.autoIaCooldown = new Map();
  ({ RITMO } = await import("../lib/ritmo.js"));
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0 });
  console.log = () => {};
  globalThis.fetch = async (url, opciones) => {
    cuerpos.push(JSON.parse(opciones.body));
    const d = decisiones.shift() ?? { motivo: "nada", accion: "nada" };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(d) }] } }] }) };
  };
  S = await import("../lib/stickers-grupo.js");
  V = await import("../lib/vistazos.js");
  C = await import("../lib/contexto-chat.js");
  Hook = (await import("../plugins/_stickers-grupo.js")).default;
  Azar = (await import("../plugins/sticker-azar.js")).default;
  Sacar = (await import("../plugins/sticker-sacar.js")).default;
  V._dep.esperar = async () => {};
  V._dep.random = () => 0.5;
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
});
// What "the AI" answers when looking at a sticker (respuestasIA) or choosing one (elecciones): by default it can't (no
// quota).
let respuestasIA = [];
let elecciones = [];
const pedidosIA = [];
beforeEach(() => {
  S._dep.random = () => 0.5;
  S._dep.esperar = async () => {};
  respuestasIA = [];
  elecciones = [];
  S._dep.preguntar = async (texto, opciones) => {
    pedidosIA.push({ texto, opciones });
    const r = opciones?.schema?.properties?.numero ? elecciones.shift() : respuestasIA.shift();
    return r === undefined ? { ok: false, sinCuota: true } : { ok: true, texto: JSON.stringify(r) };
  };
  Object.assign(S.STICKERS, { MAX_POR_GRUPO: 200, RESPUESTA_PROBABILIDAD: 0.6, DESCRIPCIONES_DIA: 40 });
});
const describir = (buffer, descripcion) => F.db.prepare(`INSERT INTO stickers_descripcion (sha, descripcion, intentos, ultimo_intento) VALUES (?, ?, 1, 0) ON CONFLICT(sha) DO UPDATE SET descripcion = excluded.descripcion`).run(S.shaDe(buffer), descripcion);

// A minimal webp: "RIFF", the size, "WEBP" and something that tells them apart.
const webp = (cual) => {
  const cuerpo = Buffer.from(`VP8 ${cual}`);
  const tam = Buffer.alloc(4);
  tam.writeUInt32LE(cuerpo.length + 4);
  return Buffer.concat([Buffer.from("RIFF"), tam, Buffer.from("WEBP"), cuerpo]);
};
const archivo = (buffer) => path.join("database", "stickers", `${S.shaDe(buffer)}.webp`);
let grupos = 0;
const nuevoGrupo = () => `stickers${++grupos}@g.us`;
const stickerDe = (chat, buffer, extra = {}) => ({ isGroup: true, chat, sender: "ana@lid", mtype: "stickerMessage", msg: { fileLength: buffer.length }, download: async () => buffer, ...extra });

test("guarda los stickers que llegan: una vez el archivo, y cuenta cuántas veces vino", () => {
  const chat = nuevoGrupo();
  assert.equal(S.guardarSticker(chat, "ana@lid", webp("a")), "nuevo");
  assert.ok(fs.existsSync(archivo(webp("a"))));
  assert.equal(S.guardarSticker(chat, "beto@lid", webp("a")), "repetido");
  assert.equal(S.cuantosStickers(chat), 1);
  assert.equal(S.guardarSticker(chat, "ana@lid", Buffer.from("<html>error</html>")), "invalido", "lo que no es webp no se guarda");
  assert.equal(S.guardarSticker(chat, "ana@lid", Buffer.alloc(0)), "invalido");
});

test("pasado el tope se van los que vinieron menos veces, y el archivo si nadie más lo tiene", () => {
  S.STICKERS.MAX_POR_GRUPO = 2;
  const chat = nuevoGrupo();
  const otro = nuevoGrupo();
  S.guardarSticker(chat, "x", webp("p1"), 1000);
  S.guardarSticker(chat, "x", webp("p1"), 2000);
  S.guardarSticker(chat, "x", webp("p2"), 1500);
  S.guardarSticker(otro, "x", webp("p2"), 1500);
  S.guardarSticker(chat, "x", webp("p3"), 3000);
  assert.equal(S.cuantosStickers(chat), 2);
  assert.ok(fs.existsSync(archivo(webp("p1"))), "el que vino dos veces se queda");
  assert.ok(fs.existsSync(archivo(webp("p2"))), "el otro grupo lo sigue teniendo");
  S.guardarSticker(chat, "x", webp("p4"), 4000);
  assert.ok(!fs.existsSync(archivo(webp("p3"))), "el que nadie más tiene se borra");
});

test(".sacarsticker: no lo manda más y no lo vuelve a guardar", async () => {
  const chat = nuevoGrupo();
  S.guardarSticker(chat, "x", webp("feo"));
  const client = clienteFalso();
  const m = { chat, isGroup: true, quoted: { mediaType: "stickerMessage", download: async () => webp("feo") } };
  await Sacar.run(m, { client, usedPrefix: ".", command: "sacarsticker" });
  assert.match(globalThis.enviados.at(-1).msg.text, /no lo mando más/);
  assert.equal(S.cuantosStickers(chat), 0);
  assert.ok(!fs.existsSync(archivo(webp("feo"))));
  assert.equal(S.guardarSticker(chat, "x", webp("feo")), "sacado");
  assert.equal(S.cuantosStickers(chat), 0);

  await Sacar.run({ chat, isGroup: true, quoted: null }, { client, usedPrefix: ".", command: "sacarsticker" });
  assert.match(globalThis.enviados.at(-1).msg.text, /Respondé al sticker/);
});

test(".stickerazar manda uno del grupo, y no repite los últimos mientras haya otros", async () => {
  const chat = nuevoGrupo();
  const client = clienteFalso();
  await Azar.run({ chat, isGroup: true }, { client });
  assert.match(globalThis.enviados.at(-1).msg.text, /Todavía no tengo stickers/);

  for (const c of ["s1", "s2", "s3"]) S.guardarSticker(chat, "x", webp(c));
  const salieron = new Set();
  for (let i = 0; i < 3; i++) {
    await Azar.run({ chat, isGroup: true }, { client });
    salieron.add(S.shaDe(globalThis.enviados.at(-1).msg.sticker));
  }
  assert.equal(salieron.size, 3, "con el dado fijo, igual sale uno distinto cada vez");
});

test("si le contestan a ella con un sticker, guarda ese y a veces contesta con otro", async () => {
  const chat = nuevoGrupo();
  for (const c of ["r1", "r2", "r3"]) S.guardarSticker(chat, "x", webp(c));
  const client = clienteFalso();
  const permisos = { client, chat: {}, user: {}, isMod: false, isOwner: false };

  globalThis.enviados = [];
  await Hook.before(stickerDe(chat, webp("suelto")), permisos);
  await Hook.enCurso;
  assert.equal(globalThis.enviados.length, 0, "un sticker suelto se guarda y nada más");
  assert.equal(S.cuantosStickers(chat), 4);

  await Hook.before(stickerDe(chat, webp("a-ella"), { quoted: { fromMe: true, id: "BOT1" } }), { ...permisos, chat: { charla: 0 } });
  await Hook.enCurso;
  assert.equal(globalThis.enviados.length, 0, "con la charla apagada no contesta");

  S._dep.random = () => 0.1;
  await Hook.before(stickerDe(chat, webp("a-ella"), { quoted: { fromMe: true, id: "BOT1" } }), permisos);
  await Hook.enCurso;
  assert.equal(globalThis.enviados.length, 1);
  assert.ok(Buffer.isBuffer(globalThis.enviados[0].msg.sticker));

  await Hook.before(stickerDe(chat, webp("a-ella"), { quoted: { fromMe: true, id: "BOT2" } }), permisos);
  await Hook.enCurso;
  assert.equal(globalThis.enviados.length, 1, "y no de nuevo enseguida");
});

test("nunca contesta con el mismo sticker que le mandaron; si no tiene otro, no contesta", async () => {
  const client = clienteFalso();
  const permisos = { client, chat: {}, user: {}, isMod: false, isOwner: false };
  S._dep.random = () => 0.1;
  globalThis.autoIaCooldown = new Map();

  const solo = nuevoGrupo();
  globalThis.enviados = [];
  await Hook.before(stickerDe(solo, webp("unico"), { quoted: { fromMe: true, id: "BOT1" } }), permisos);
  await Hook.enCurso;
  assert.equal(globalThis.enviados.length, 0, "el único que tiene es el que le mandaron");

  const chat = nuevoGrupo();
  S.guardarSticker(chat, "x", webp("otro"));
  for (const dado of [0, 0.1, 0.99]) {
    S._dep.random = () => dado;
    globalThis.enviados = [];
    await Hook.before(stickerDe(`${chat}`, webp("mio"), { quoted: { fromMe: true, id: "BOT1" } }), permisos);
    await Hook.enCurso;
    if (globalThis.enviados.length) assert.equal(S.shaDe(globalThis.enviados[0].msg.sticker), S.shaDe(webp("otro")));
  }
});

// ---------- in a glance ----------

const MIN = 60 * 1000;
const AHORA = new Date(2026, 8, 24, 15, 0).getTime();
function grupoCharlando() {
  const chat = nuevoGrupo();
  F.initDataDB({ chat, sender: "111@lid", senderJid: "111@s.whatsapp.net", pushName: "Ana" });
  V.activarIniciativa(chat, AHORA);
  const charla = [
    ["Ana", "jajaja no puedo más", 20, "B1"],
    ["Beto", "qué desastre el asado", 18, "B2"],
    ["Carla", "se quemó todo jaja", 15, "B3"],
    ["Ana", "jaja típico de Beto", 10, "B4"],
    ["Beto", "la próxima lo hacés vos", 2, "B5"],
  ];
  for (const [quien, texto, haceMin, id] of charla) C.recordarMensaje(chat, quien, texto, false, { id, usuario: `${quien}@lid`, participant: `${quien}@lid`, fecha: AHORA - haceMin * MIN });
  return chat;
}
function cliente(chat) {
  const salidas = [];
  return {
    salidas,
    user: { lid: "bot@lid", id: "bot@s.whatsapp.net" },
    chats: { [chat]: { subject: "Prueba" } },
    sendPresenceUpdate: async () => {},
    sendMessage: async (jid, contenido) => {
      salidas.push({ jid, contenido });
      return { key: { id: `BOT${salidas.length}` } };
    },
    sendText: async (jid, text) => {
      salidas.push({ jid, contenido: { text } });
      return { key: { id: `BOT${salidas.length}` } };
    },
  };
}

test("vistazo: sin stickers descriptos ni se le ofrece; con ellos, elige uno de la lista", async () => {
  const chat = grupoCharlando();
  for (const c of ["n1", "n2", "n3"]) S.guardarSticker(chat, "x", webp(c)); // kept, but not looked at yet
  decisiones.push({ motivo: "nada", accion: "nada", mensaje: 0, texto: "" });
  await V.hacerVistazo(cliente(chat), chat, { ahora: AHORA });
  assert.equal(cuerpos.at(-1).generationConfig.responseSchema.properties.sticker, undefined);

  const otro = grupoCharlando();
  const lista = { v1: "perro riéndose a carcajadas, para algo muy gracioso", v2: "gato triste llorando", v3: "señor aplaudiendo, aprobación" };
  for (const [c, d] of Object.entries(lista)) {
    S.guardarSticker(otro, "x", webp(c));
    describir(webp(c), d);
  }
  decisiones.push({ motivo: "están en joda con el asado", reacciones: [], sticker: 1, accion: "nada", mensaje: 0, texto: "" });
  const client = cliente(otro);
  const informe = await V.hacerVistazo(client, otro, { ahora: AHORA });
  const prompt = cuerpos.at(-1).contents[0].parts[0].text;
  assert.deepEqual(cuerpos.at(-1).generationConfig.responseSchema.properties.sticker, { type: "integer" });
  assert.match(prompt, /Stickers del grupo que podés mandar/);
  assert.match(prompt, /\d\. perro riéndose a carcajadas/);
  const primero = prompt.match(/1\. (.+)/)[1];
  const elegido = Object.keys(lista).find((c) => lista[c] === primero);
  assert.equal(client.salidas.length, 1);
  assert.equal(S.shaDe(client.salidas[0].contenido.sticker), S.shaDe(webp(elegido)), "manda el que eligió, no uno al azar");
  assert.deepEqual(
    F.intervencionesDesde(otro, 0).map((f) => [f.tipo, f.mensajeId, f.texto]),
    [["sticker", "BOT1", primero]],
  );
  assert.match(informe.resumen, /un sticker/);

  // A number that isn't on the list sends nothing.
  const tercero = grupoCharlando();
  for (const [c, d] of Object.entries(lista)) {
    S.guardarSticker(tercero, "x", webp(c));
    describir(webp(c), d);
  }
  decisiones.push({ motivo: "x", reacciones: [], sticker: 9, accion: "nada", mensaje: 0, texto: "" });
  const c3 = cliente(tercero);
  await V.hacerVistazo(c3, tercero, { ahora: AHORA });
  assert.equal(c3.salidas.length, 0);
});

test(".respuestastickers off: no los manda sola, ni contestando ni en el vistazo; .stickerazar sigue", async () => {
  const chat = grupoCharlando();
  for (const c of ["o1", "o2", "o3"]) {
    S.guardarSticker(chat, "x", webp(c));
    describir(webp(c), `sticker ${c}`);
  }
  F.updateChat(chat, { stickersAuto: false });
  decisiones.push({ motivo: "nada", accion: "nada", mensaje: 0, texto: "" });
  await V.hacerVistazo(cliente(chat), chat, { ahora: AHORA });
  assert.equal(cuerpos.at(-1).generationConfig.responseSchema.properties.sticker, undefined);

  const client = clienteFalso();
  S._dep.random = () => 0.1;
  globalThis.autoIaCooldown = new Map();
  globalThis.enviados = [];
  await Hook.before(stickerDe(chat, webp("off"), { quoted: { fromMe: true, id: "BOT1" } }), { client, chat: F.getChat(chat), user: {}, isMod: false, isOwner: false });
  await Hook.enCurso;
  assert.equal(globalThis.enviados.length, 0);
  assert.equal(S.cuantosStickers(chat), 4, "igual lo guarda");

  await Azar.run({ chat, isGroup: true }, { client });
  assert.ok(Buffer.isBuffer(globalThis.enviados.at(-1).msg.sticker));
});

// ---------- choosing with some sense ----------

test("describe los stickers de a uno, con la imagen, con tope por día, y para al primer fallo", async () => {
  await S.describirPendientes(); // whatever an earlier test left running
  F.db.exec(`DELETE FROM stickers_grupo; DELETE FROM stickers_descripcion`); // only these three, and none tried today
  const chat = nuevoGrupo();
  for (const c of ["d1", "d2", "d3"]) S.guardarSticker(chat, "x", webp(c));
  pedidosIA.length = 0;
  respuestasIA = [{ descripcion: "  \"un perro riendo\"  " }];
  await S.describirPendientes();
  assert.equal(pedidosIA.length, 2, "el segundo falló (sin cuota) y no siguió con el tercero");
  assert.deepEqual(pedidosIA[0].opciones.adjuntos.map((a) => a.mimeType), ["image/webp"]);
  const descriptos = ["d1", "d2", "d3"].map((c) => S.descripcionDe(S.shaDe(webp(c)))).filter(Boolean);
  assert.deepEqual(descriptos, ["un perro riendo"]);

  // The one that failed waits for its retry; the third goes now, and the day's cap stops the rest.
  S.STICKERS.DESCRIPCIONES_DIA = 3;
  respuestasIA = [{ descripcion: "gato" }, { descripcion: "loro" }];
  pedidosIA.length = 0;
  await S.describirPendientes();
  assert.equal(pedidosIA.length, 1, "dos intentos hoy ya, uno más y llegó al tope");
});

// A run with nothing to do never awaited anything, ended before its mark was set, and the mark stayed on: no sticker
// was described again until a restart. In the group: the day's cap reached, a new sticker comes in, and from then on
// nothing, that day or any other.
test("una corrida sin nada que hacer no traba las siguientes: pasado el tope del día, se vuelve a describir", async () => {
  await S.describirPendientes(); // whatever an earlier test left
  F.db.exec(`DELETE FROM stickers_grupo; DELETE FROM stickers_descripcion`);
  const chat = nuevoGrupo();
  S.STICKERS.DESCRIPCIONES_DIA = 0; // the day's cap, reached
  S.guardarSticker(chat, "x", webp("trabado"));
  pedidosIA.length = 0;
  await S.describirPendientes();
  assert.equal(pedidosIA.length, 0, "con el tope alcanzado, ninguno");
  // the cap leaves room again, as the next day does
  S.STICKERS.DESCRIPCIONES_DIA = 40;
  respuestasIA = [{ descripcion: "un loro" }];
  await S.describirPendientes();
  assert.equal(pedidosIA.length, 1, "la corrida vacía no dejó la marca puesta");
  assert.equal(S.descripcionDe(S.shaDe(webp("trabado"))), "un loro");
});

test("contestando un sticker, la IA elige cuál según lo que dijo ella; 0 es ninguno, y sin IA va al azar", async () => {
  const chat = nuevoGrupo();
  const lista = { e1: "perro riéndose", e2: "gato enojado", e3: "señor aplaudiendo" };
  for (const [c, d] of Object.entries(lista)) {
    S.guardarSticker(chat, "x", webp(c));
    describir(webp(c), d);
  }
  const client = clienteFalso();
  const permisos = { client, chat: {}, user: {}, isMod: false, isOwner: false };
  S._dep.random = () => 0.1;
  const contestar = async (id) => {
    globalThis.autoIaCooldown = new Map();
    globalThis.enviados = [];
    await Hook.before(stickerDe(chat, webp("recibido"), { quoted: { fromMe: true, id, text: "hoy no hay asado, se suspende" } }), permisos);
    await Hook.enCurso;
  };

  pedidosIA.length = 0;
  elecciones = [{ numero: 2 }];
  await contestar("BOT1");
  const pedido = pedidosIA.find((p) => p.opciones.schema?.properties?.numero);
  assert.match(pedido.texto, /hoy no hay asado/);
  assert.equal(pedido.opciones.adjuntos.length, 1, "ve el sticker que le mandaron");
  const segundo = pedido.texto.match(/2\. (.+)/)[1];
  const esperado = Object.keys(lista).find((c) => lista[c] === segundo);
  assert.equal(S.shaDe(globalThis.enviados[0].msg.sticker), S.shaDe(webp(esperado)));

  // "recibido" got kept as new and its description was attempted: the pause between answers is per group, so a fresh
  // group each time.
  const otro = nuevoGrupo();
  for (const [c, d] of Object.entries(lista)) {
    S.guardarSticker(otro, "x", webp(c));
    describir(webp(c), d);
  }
  elecciones = [{ numero: 0 }];
  globalThis.autoIaCooldown = new Map();
  globalThis.enviados = [];
  await Hook.before(stickerDe(otro, webp("recibido"), { quoted: { fromMe: true, id: "BOT2", text: "hola" } }), permisos);
  await Hook.enCurso;
  assert.equal(globalThis.enviados.length, 0, "ninguno pegaba: no manda nada");

  const tercero = nuevoGrupo();
  for (const [c, d] of Object.entries(lista)) {
    S.guardarSticker(tercero, "x", webp(c));
    describir(webp(c), d);
  }
  elecciones = []; // no AI
  globalThis.enviados = [];
  await Hook.before(stickerDe(tercero, webp("recibido"), { quoted: { fromMe: true, id: "BOT3", text: "hola" } }), permisos);
  await Hook.enCurso;
  assert.equal(globalThis.enviados.length, 1, "sin IA, al azar");
  assert.notEqual(S.shaDe(globalThis.enviados[0].msg.sticker), S.shaDe(webp("recibido")));
});

test(".stickerazar <tema> busca en lo que la IA vio de cada uno", async () => {
  const chat = nuevoGrupo();
  S.guardarSticker(chat, "x", webp("t1"));
  describir(webp("t1"), "Perro riéndose a carcajadas, para algo gracioso");
  S.guardarSticker(chat, "x", webp("t2"));
  describir(webp("t2"), "gato enojado");
  const client = clienteFalso();
  await Azar.run({ chat, isGroup: true }, { client, text: "perro" });
  assert.equal(S.shaDe(globalThis.enviados.at(-1).msg.sticker), S.shaDe(webp("t1")));
  await Azar.run({ chat, isGroup: true }, { client, text: "ENOJADO" });
  assert.equal(S.shaDe(globalThis.enviados.at(-1).msg.sticker), S.shaDe(webp("t2")));
  await Azar.run({ chat, isGroup: true }, { client, text: "dinosaurio" });
  assert.match(globalThis.enviados.at(-1).msg.text, /No tengo ninguno de "dinosaurio"/);
});
