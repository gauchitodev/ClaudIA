import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import pino from "pino";
import { DEFAULT_CONNECTION_CONFIG, useMultiFileAuthState, makeCacheableSignalKeyStore, addTransactionCapability, initAuthCreds, generateSignalPubKey, getNextPreKeys, Curve, proto } from "@whiskeysockets/baileys";
import { nodosQue, prepararBase } from "./helpers.mjs";
import { abrirSesion, cerrarSesion, borrarSesion, SESION } from "../lib/sesion.js";

// WhatsApp's session in its own database (lib/sesion.js), checked against what it replaces: Baileys's
// useMultiFileAuthState, which kept it as files and is here both what the answers are compared with and what leaves the
// files the first start has to bring in. Nothing here connects to WhatsApp: the last two tests encrypt for real, with
// Baileys's own Signal repository, between the bot and two contacts.

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-sesion-"));
process.on("exit", () => fs.rmSync(TMP, { recursive: true, force: true }));
let carpetas = 0;
const carpeta = () => path.join(TMP, `sesion-${++carpetas}`);
const DIA = 24 * 60 * 60 * 1000;
const LOGGER = pino({ level: "silent" });
const K = proto.Message.AppStateSyncKeyData;

// abrirSesion, with what it said as it opened (it tells of the files it brought in, as the database's migrations do).
function abrir(dir, ahora) {
  const dicho = [];
  const logReal = console.log;
  console.log = (...partes) => dicho.push(partes.join(" "));
  try {
    return { ...abrirSesion(dir, ahora), dicho };
  } finally {
    console.log = logReal;
  }
}

// The rows of a folder's database, as another connection finds them in the file: { clave: valor }.
function filas(dir) {
  const base = new Database(path.join(dir, SESION.ARCHIVO));
  try {
    return Object.fromEntries(base.prepare(`SELECT clave, valor FROM sesion`).all().map((f) => [f.clave, f.valor]));
  } finally {
    base.close();
  }
}
// The session files in a folder, { name: text }.
const archivos = (dir) => Object.fromEntries(fs.readdirSync(dir).filter((a) => a.endsWith(".json")).map((a) => [a, fs.readFileSync(path.join(dir, a), "utf8")]));

const [ANA_PN, ANA_LID, BETO_LID] = ["59899000001", "200000000000001", "200000000000002"];
const SESION_DE_ANA = `${ANA_LID}_1.0`;
const GRUPO = "120363000000000001@g.us";
const GRUPO_VIEJO = "59899000002-1612345678@g.us"; // a group from before 2021: its id has a dash of its own
// A key of each type Baileys keeps, with the shape it gives each one (Types/Auth.d.ts): the ones the v7 added too
// (lid-mapping, device-list, tctoken, identity-key), ids with ":" and "/" in them, which a file name couldn't have,
// and an app state sync key as it comes off a message, a proto.
const muestra = () => ({
  "pre-key": { 1: Curve.generateKeyPair(), 2: Curve.generateKeyPair() },
  session: { [`${ANA_PN}.0`]: Buffer.from("sesión con Ana"), [SESION_DE_ANA]: Buffer.alloc(300, 7) },
  "sender-key": { [`${GRUPO}::${ANA_LID}_1::0`]: Buffer.from(JSON.stringify([{ senderKeyId: 1 }])), [`${GRUPO_VIEJO}::${BETO_LID}_1::5`]: Buffer.from("[]") },
  "sender-key-memory": { [GRUPO]: { [`${ANA_PN}@s.whatsapp.net`]: true, [`${BETO_LID}@lid`]: true } },
  "app-state-sync-key": { "AAAAAK/x+w==": K.decode(K.encode({ keyData: Buffer.alloc(32, 9), fingerprint: { rawId: 7, currentIndex: 1, deviceIndexes: [0, 3] }, timestamp: 1763000000000 }).finish()) },
  "app-state-sync-version": { critical_block: { version: 12, hash: Buffer.alloc(128, 3), indexValueMap: { "aW5kaWNl": { valueMac: Buffer.alloc(32, 4) } } } },
  "lid-mapping": { [ANA_PN]: ANA_LID, [`${ANA_LID}_reverse`]: ANA_PN },
  "device-list": { [ANA_PN]: ["0", "5", "12"] },
  tctoken: { [`${ANA_LID}@lid`]: { token: Buffer.from("token de Ana"), timestamp: "1763000000", senderTimestamp: 1763000001 }, __index: { token: Buffer.from(JSON.stringify([`${ANA_LID}@lid`])) } },
  "identity-key": { [SESION_DE_ANA]: Buffer.alloc(33, 5) },
});
// Every id of some keys, by type, and one that isn't there.
const idsDe = (...datos) => {
  const ids = {};
  for (const d of datos) for (const [tipo, porId] of Object.entries(d)) ids[tipo] = [...new Set([...(ids[tipo] || []), ...Object.keys(porId), "no-está"])];
  return ids;
};
// An app state sync key by what Baileys does with it: it derives the keys of the app state from keyData's bytes
// (chat-utils.js), and as a message it's these bytes. fromObject and create leave the rest of it differently.
const comoSeUsa = (clave) => {
  assert.ok(clave instanceof K, "es el proto");
  assert.ok(clave.keyData instanceof Uint8Array, "con sus bytes como bytes, no como texto");
  return { keyData: Buffer.from(clave.keyData), mensaje: Buffer.from(K.encode(clave).finish()) };
};
async function leerTodo(keys, ids) {
  const todo = {};
  for (const [tipo, lista] of Object.entries(ids)) {
    todo[tipo] = await keys.get(tipo, lista);
    if (tipo === "app-state-sync-key") for (const id of lista) if (todo[tipo][id]) todo[tipo][id] = comoSeUsa(todo[tipo][id]);
  }
  return todo;
}

// A session as a version from before left it in a folder: paired, with its keys, each in its file.
async function enArchivos(dir, datos = muestra()) {
  const vieja = await useMultiFileAuthState(dir);
  Object.assign(vieja.state.creds, { me: { id: "59899000000:3@s.whatsapp.net", lid: "200000000000000:3@lid", name: "Claudia" }, registered: true });
  await vieja.saveCreds();
  await vieja.state.keys.set(datos);
  return { datos, ids: idsDe(datos), antes: archivos(dir) };
}
const deArchivos = async (dir) => (await useMultiFileAuthState(dir)).state;

test("una sesión nueva pide vincular, y las credenciales guardadas vuelven como las dejaban los archivos", async () => {
  const [dir, dirDeArchivos] = [carpeta(), carpeta()];
  const nueva = abrir(dir);
  assert.equal(nueva.state.creds.registered, false, "sin vincular: main.js pide el código o muestra el QR");
  assert.equal(nueva.state.creds.me, undefined);
  assert.deepEqual(nueva.dicho, [], "sin archivos de antes, no hay nada que contar");
  assert.deepEqual(filas(dir), {}, "hasta que Baileys las guarda no queda nada, como con los archivos");
  assert.notDeepEqual(abrir(dir).state.creds.noiseKey, nueva.state.creds.noiseKey, "y sin guardar, cada vez son otras");

  // As Baileys changes them (socket.js): on the object it was handed, and then creds.update, which main.js gives
  // saveCreds.
  const vinculada = { me: { id: "59899000000:3@s.whatsapp.net", lid: "200000000000000:3@lid", name: "Claudia" }, registered: true, routingInfo: Buffer.from("por dónde entra"), nextPreKeyId: 31, firstUnuploadedPreKeyId: 31, myAppStateKeyId: "AAAAAK/x+w==" };
  Object.assign(nueva.state.creds, vinculada);
  await nueva.saveCreds();
  const vieja = await useMultiFileAuthState(dirDeArchivos);
  Object.assign(vieja.state.creds, nueva.state.creds);
  await vieja.saveCreds();

  // A reconnect asks for the session again: the credentials are read again, not the object from before.
  const otraVez = abrir(dir);
  assert.notEqual(otraVez.state.creds, nueva.state.creds);
  assert.equal(otraVez.state.creds.registered, true);
  assert.deepEqual(otraVez.state.creds.routingInfo, Buffer.from("por dónde entra"));
  assert.ok(Buffer.isBuffer(otraVez.state.creds.noiseKey.private), "las claves, como bytes");
  cerrarSesion(dir);
  const otroArranque = abrir(dir);
  assert.deepEqual(otroArranque.state.creds, (await deArchivos(dirDeArchivos)).creds, "y en otro arranque, lo mismo que leen los archivos");

  otroArranque.state.creds.nextPreKeyId = 61;
  await otroArranque.saveCreds();
  assert.deepEqual(Object.keys(filas(dir)), ["creds"], "una sola fila, que se pisa");
  assert.equal(abrir(dir).state.creds.nextPreKeyId, 61);

  // The database closed under a socket that's still saving (nothing does it: only borrarSesion closes it, and that's
  // another matter): it fails out loud, for Baileys to know, and doesn't pass for saved.
  cerrarSesion(dir);
  await assert.rejects(otroArranque.saveCreds(), /not open/);
  await assert.rejects(otroArranque.state.keys.set({ session: { [SESION_DE_ANA]: Buffer.from("x") } }), /not open/);
  await assert.rejects(otroArranque.state.keys.get("session", [SESION_DE_ANA]), /not open/);
});

test("guarda y devuelve cada tipo de clave como los archivos de Baileys, los de la v7 también", async () => {
  const [dir, dirDeArchivos] = [carpeta(), carpeta()];
  const [mia, vieja] = [abrir(dir), await useMultiFileAuthState(dirDeArchivos)];
  const datos = muestra();
  await mia.state.keys.set(datos);
  await vieja.state.keys.set(datos);
  const ids = idsDe(datos);

  // Read by another start: what comes back is what was written down, not what was handed over.
  cerrarSesion(dir);
  const leido = await leerTodo(abrir(dir).state.keys, ids);
  assert.deepEqual(leido, await leerTodo((await deArchivos(dirDeArchivos)).keys, ids));
  assert.deepEqual(leido.session[SESION_DE_ANA], Buffer.alloc(300, 7));
  assert.equal(leido.session["no-está"], null);
  assert.deepEqual(leido["pre-key"][1], { private: Buffer.from(datos["pre-key"][1].private), public: Buffer.from(datos["pre-key"][1].public) });
  assert.deepEqual(leido["sender-key"][`${GRUPO_VIEJO}::${BETO_LID}_1::5`], Buffer.from("[]"));
  assert.deepEqual(leido["app-state-sync-key"]["AAAAAK/x+w=="].keyData, Buffer.alloc(32, 9));
  assert.deepEqual(leido["app-state-sync-version"].critical_block, datos["app-state-sync-version"].critical_block);
  // The four the v7 asks an auth state for (docs/migration/to-v7.0.0.md).
  assert.equal(leido["lid-mapping"][ANA_PN], ANA_LID);
  assert.equal(leido["lid-mapping"][`${ANA_LID}_reverse`], ANA_PN);
  assert.deepEqual(leido["device-list"][ANA_PN], ["0", "5", "12"]);
  assert.deepEqual(leido.tctoken[`${ANA_LID}@lid`], { token: Buffer.from("token de Ana"), timestamp: "1763000000", senderTimestamp: 1763000001 });
  assert.deepEqual(leido["identity-key"][SESION_DE_ANA], Buffer.alloc(33, 5));

  // What Baileys does to them afterwards: a key written over, one deleted (null), one deleted that wasn't there, new
  // ones, and two ids that shared a file (":" was written as "-"), which share a row.
  const cambios = {
    session: { [SESION_DE_ANA]: Buffer.from("la sesión avanzó"), [`${ANA_PN}.0`]: null, "59899000009.0": null, "59899000003:7.0": Buffer.from("con dos puntos"), "59899000003-7.0": Buffer.from("con guion") },
    "pre-key": { 1: null, 3: Curve.generateKeyPair() },
    "device-list": { [ANA_PN]: ["0"] },
    tctoken: { [`${ANA_LID}@lid`]: null },
    "sender-key-memory": { [GRUPO]: { [`${ANA_PN}@s.whatsapp.net`]: true } },
  };
  const mia2 = abrir(dir);
  await mia2.state.keys.set(cambios);
  await vieja.state.keys.set(cambios);
  const despues = await leerTodo(mia2.state.keys, idsDe(datos, cambios));
  assert.deepEqual(despues, await leerTodo((await deArchivos(dirDeArchivos)).keys, idsDe(datos, cambios)));
  assert.deepEqual(despues.session[SESION_DE_ANA], Buffer.from("la sesión avanzó"));
  assert.equal(despues.session[`${ANA_PN}.0`], null);
  assert.equal(despues["pre-key"][1], null);
  assert.deepEqual(despues.session["59899000003:7.0"], Buffer.from("con guion"));
  assert.deepEqual(Object.keys(filas(dir)).sort(), Object.keys(archivos(dirDeArchivos)).map((a) => a.slice(0, -5)).sort(), "una fila por cada archivo que habría, con su nombre");
});

test("cada clave está en el archivo cuando Baileys termina de guardarla, detrás de la caché y las transacciones del socket", async () => {
  const dir = carpeta();
  const { state } = abrir(dir);
  // As the socket puts the keys to work (main.js and socket.js).
  const keys = addTransactionCapability(makeCacheableSignalKeyStore(state.keys, LOGGER), LOGGER, { maxCommitRetries: 1, delayBetweenTriesMs: 0 });
  const guardada = (clave) => filas(dir)[clave] ?? null;
  const conTexto = (texto) => JSON.stringify({ type: "Buffer", data: Buffer.from(texto).toString("base64") });

  await keys.set({ session: { [SESION_DE_ANA]: Buffer.from("uno") } });
  assert.equal(guardada(`session-${SESION_DE_ANA}`), conTexto("uno"), "al volver de set ya la ve otra conexión");

  // A message being decrypted: Baileys holds what changes until the end, and saves it all at once. The pre-key is
  // read before it's used up, as libsignal does: Baileys drops the deletion of one the message didn't read.
  await keys.set({ "pre-key": { 4: Curve.generateKeyPair() } });
  assert.ok(guardada("pre-key-4"));
  await keys.transaction(async () => {
    assert.ok((await keys.get("pre-key", ["4"]))[4]);
    await keys.set({ session: { [SESION_DE_ANA]: Buffer.from("dos") } });
    await keys.set({ "pre-key": { 4: null }, "identity-key": { [SESION_DE_ANA]: Buffer.alloc(33, 1) } });
    assert.equal(guardada(`session-${SESION_DE_ANA}`), conTexto("uno"), "a mitad del mensaje todavía no");
  }, `${ANA_LID}@lid`);
  assert.equal(guardada(`session-${SESION_DE_ANA}`), conTexto("dos"));
  assert.equal(guardada("pre-key-4"), null, "la pre-clave que gastó el mensaje, borrada");
  assert.ok(guardada(`identity-key-${SESION_DE_ANA}`));
  assert.deepEqual(await keys.get("session", [SESION_DE_ANA]), { [SESION_DE_ANA]: Buffer.from("dos") });
});

test("lo que Baileys guarda junto queda todo o nada", async () => {
  const dir = carpeta();
  const { state } = abrir(dir);
  const par = Curve.generateKeyPair();
  await state.keys.set({ session: { [SESION_DE_ANA]: Buffer.from("antes") }, "pre-key": { 9: par } });
  // A session that moved on and the pre-key it used up, with a key that can't be written down between them: with the
  // files, the session stayed changed and the pre-key stayed there.
  const aMedias = { session: { [SESION_DE_ANA]: Buffer.from("después") }, tctoken: { [`${ANA_LID}@lid`]: { token: 10n } }, "pre-key": { 9: null } };
  await assert.rejects(state.keys.set(aMedias), TypeError, "Baileys se entera de que no se guardó");
  assert.deepEqual(await state.keys.get("session", [SESION_DE_ANA]), { [SESION_DE_ANA]: Buffer.from("antes") });
  assert.deepEqual(await state.keys.get("pre-key", ["9"]), { 9: { private: Buffer.from(par.private), public: Buffer.from(par.public) } });
  assert.deepEqual(await state.keys.get("tctoken", [`${ANA_LID}@lid`]), { [`${ANA_LID}@lid`]: null });
});

// The log is what makes a save one sync, and FULL what makes it a sync at all: this SQLite's default with the log is
// NORMAL, which leaves the last saves out of the disk for a while. Neither shows from outside, so what's checked is
// that each start asks for them.
test("abre su base con el registro de escrituras y pide que cada guardado llegue al disco, en cada arranque", () => {
  const dir = carpeta();
  const pedidos = [];
  const pragmaReal = Database.prototype.pragma;
  Database.prototype.pragma = function (texto, ...resto) {
    pedidos.push(texto);
    return pragmaReal.call(this, texto, ...resto);
  };
  try {
    abrir(dir);
    cerrarSesion(dir);
    abrir(dir);
  } finally {
    Database.prototype.pragma = pragmaReal;
  }
  assert.equal(pedidos.filter((p) => /^synchronous\s*=\s*FULL$/i.test(p)).length, 2, `pidió: ${pedidos.join(" | ")}`);
  assert.equal(pedidos.filter((p) => /^journal_mode\s*=\s*WAL$/i.test(p)).length, 2);
  const otra = new Database(path.join(dir, SESION.ARCHIVO));
  assert.equal(otra.pragma("journal_mode", { simple: true }), "wal");
  otra.close();
});

// Baileys 7's protos keep create(), encode() and decode() and nothing else (test/protos-v7.test.mjs): without toJSON, a
// key is written with its bytes as bytes instead of as base64 text, and without fromObject, useMultiFileAuthState's way
// of bringing it back is gone. A database written by today's protos has to read with those, and the other way round.
test("una clave de sincronización se lee bien con los protos de hoy y con los de Baileys 7, la haya escrito quien la haya escrito", async () => {
  const dir = carpeta();
  const { state } = abrir(dir);
  const laClave = () => K.decode(K.encode({ keyData: Buffer.alloc(32, 9), fingerprint: { rawId: 7, currentIndex: 1, deviceIndexes: [0, 3] }, timestamp: 1763000000000 }).finish());
  const HUELLA = proto.Message.AppStateSyncKeyFingerprint;
  const conProtosDeV7 = async (fn) => {
    const sacados = [[K, "fromObject"], [K, "toObject"], [K.prototype, "toJSON"], [HUELLA, "fromObject"], [HUELLA, "toObject"], [HUELLA.prototype, "toJSON"]].map(([donde, nombre]) => [donde, nombre, donde[nombre]]);
    for (const [donde, nombre, valor] of sacados) {
      assert.equal(typeof valor, "function", `${nombre} ya no está: este test ya no prueba nada`);
      delete donde[nombre];
    }
    try {
      return await fn();
    } finally {
      for (const [donde, nombre, valor] of sacados) donde[nombre] = valor;
    }
  };
  const bienLeidas = async () => {
    const leidas = await state.keys.get("app-state-sync-key", ["de-hoy", "de-la-v7"]);
    for (const id of ["de-hoy", "de-la-v7"]) assert.deepEqual(comoSeUsa(leidas[id]).keyData, Buffer.alloc(32, 9), id);
    assert.deepEqual(comoSeUsa(leidas["de-la-v7"]).mensaje, comoSeUsa(leidas["de-hoy"]).mensaje, "y como mensaje son la misma");
  };

  await state.keys.set({ "app-state-sync-key": { "de-hoy": laClave() } });
  await conProtosDeV7(async () => {
    await state.keys.set({ "app-state-sync-key": { "de-la-v7": laClave() } });
    await bienLeidas();
  });
  await bienLeidas();
  const escritas = filas(dir);
  assert.equal(typeof JSON.parse(escritas["app-state-sync-key-de-hoy"]).keyData, "string", "hoy los bytes se escriben como texto");
  assert.equal(JSON.parse(escritas["app-state-sync-key-de-la-v7"]).keyData.type, "Buffer", "y con la v7, como los demás bytes");
});

test("el primer arranque pasa a la base la sesión que estaba en archivos, cada uno tal cual, y los aparta", async () => {
  const dir = carpeta();
  const { ids, antes } = await enArchivos(dir);
  const leidoDeArchivos = await leerTodo((await deArchivos(dir)).keys, ids);
  const credsDeArchivos = (await deArchivos(dir)).creds;
  // The names Baileys gave the files, which the rows keep: "::" as "--" and "/" as "__".
  assert.ok(antes[`sender-key-${GRUPO_VIEJO}--${BETO_LID}_1--5.json`] && antes["app-state-sync-key-AAAAAK__x+w==.json"], Object.keys(antes).join(" "));

  const { state, dicho } = abrir(dir);
  assert.equal(dicho.length, 1);
  assert.match(dicho[0], new RegExp(`Migración: la sesión de WhatsApp pasó .* \\(${Object.keys(antes).length} claves\\)\\. Los archivos quedan 7 días en .*archivos-viejos/`));
  assert.equal(fs.statSync(path.join(dir, `${SESION.ARCHIVO}-wal`)).size, 0, "y el registro por el que pasó todo junto queda vacío, no del tamaño de la sesión");
  assert.deepEqual(filas(dir), Object.fromEntries(Object.entries(antes).map(([archivo, texto]) => [archivo.slice(0, -5), texto])), "cada archivo es una fila, con su nombre y su texto");
  assert.deepEqual(state.creds, credsDeArchivos);
  assert.equal(state.creds.registered, true, "no hay que volver a vincular");
  assert.deepEqual(await leerTodo(state.keys, ids), leidoDeArchivos, "y cada clave se lee como se leía");

  assert.deepEqual(archivos(dir), {}, "en la carpeta no queda ningún archivo suelto");
  assert.deepEqual(archivos(path.join(dir, SESION.VIEJOS)), antes, "están todos apartados, como eran");

  // From here on the session is the database's: nothing is written to the files again.
  await state.keys.set({ session: { "59899000004.0": Buffer.from("después de pasar") } });
  cerrarSesion(dir);
  const segundo = abrir(dir);
  assert.deepEqual(segundo.dicho, [], "el segundo arranque no trae nada");
  assert.deepEqual(await segundo.state.keys.get("session", ["59899000004.0", SESION_DE_ANA]), { "59899000004.0": Buffer.from("después de pasar"), [SESION_DE_ANA]: Buffer.alloc(300, 7) });
  assert.deepEqual(archivos(dir), {});
  assert.deepEqual(archivos(path.join(dir, SESION.VIEJOS)), antes);
});

test("si una versión de antes volvió a andar sobre los archivos, valen ellos y reemplazan lo que tenía la base", async () => {
  const dir = carpeta();
  const { ids } = await enArchivos(dir);
  const primero = abrir(dir);
  await primero.state.keys.set({ session: { "59899000005.0": Buffer.from("solo la base lo tiene") } });
  cerrarSesion(dir);

  // Going back, as the README says: the files out of archivos-viejos/, and the version from before at work on them.
  const viejos = path.join(dir, SESION.VIEJOS);
  fs.cpSync(viejos, dir, { recursive: true });
  const vieja = await useMultiFileAuthState(dir);
  await vieja.state.keys.set({ session: { "59899000006.0": Buffer.from("lo guardó la versión de antes") }, "pre-key": { 1: null } });
  vieja.state.creds.me.name = "Claudia, de vuelta";
  await vieja.saveCreds();
  const enLaCarpeta = archivos(dir);

  const { state, dicho } = abrir(dir);
  assert.equal(dicho.length, 1);
  assert.match(dicho[0], /Reemplazó a la que había en la base \(\d+ claves\)/);
  assert.equal(state.creds.me.name, "Claudia, de vuelta");
  assert.deepEqual(await state.keys.get("session", ["59899000006.0", "59899000005.0"]), { "59899000006.0": Buffer.from("lo guardó la versión de antes"), "59899000005.0": null });
  assert.deepEqual(await leerTodo(state.keys, ids), await leerTodo((await deArchivos(viejos)).keys, ids), "todo como lo dejó esa versión");
  assert.deepEqual(filas(dir), Object.fromEntries(Object.entries(enLaCarpeta).map(([archivo, texto]) => [archivo.slice(0, -5), texto])));
  // And the files put away are these ones: the pre-key that version used up isn't among them any more.
  assert.deepEqual(archivos(viejos), enLaCarpeta);
  assert.equal(fs.existsSync(path.join(viejos, "pre-key-1.json")), false);
  assert.deepEqual(archivos(dir), {});
});

// The two ways the first start can die halfway, made to happen: a file that can't be read while they're coming in, and
// the process cut off while they're being put away.
test("si falla mientras trae los archivos no toca nada, y el arranque siguiente los trae todos", async () => {
  const dir = carpeta();
  const { ids, antes } = await enArchivos(dir);
  const leidoDeArchivos = await leerTodo((await deArchivos(dir)).keys, ids);
  // The last one it gets to, so the rest are already in when it fails.
  const elQueFalla = path.join(dir, fs.readdirSync(dir).filter((a) => a.endsWith(".json") && a !== "creds.json").at(-1));
  const leerReal = fs.readFileSync;
  fs.readFileSync = (archivo, ...resto) => {
    if (archivo === elQueFalla) throw Object.assign(new Error("EIO: i/o error, read"), { code: "EIO" });
    return leerReal(archivo, ...resto);
  };
  try {
    assert.throws(() => abrir(dir), { code: "EIO" }, "el arranque falla: main.js para ahí, y start-process.js prueba de nuevo");
  } finally {
    fs.readFileSync = leerReal;
  }
  assert.deepEqual(archivos(dir), antes, "los archivos, donde estaban");
  assert.equal(fs.existsSync(path.join(dir, SESION.VIEJOS)), false);
  assert.deepEqual(fs.readdirSync(dir).filter((a) => a.startsWith(SESION.ARCHIVO)), [SESION.ARCHIVO], "la base quedó cerrada, sin su registro abierto al lado");
  assert.deepEqual(filas(dir), {}, "y en ella no quedó la mitad");

  const { state, dicho } = abrir(dir);
  assert.match(dicho[0], new RegExp(`\\(${Object.keys(antes).length} claves\\)`));
  assert.equal(state.creds.registered, true);
  assert.deepEqual(await leerTodo(state.keys, ids), leidoDeArchivos);
  assert.deepEqual(archivos(path.join(dir, SESION.VIEJOS)), antes);
});

test("un arranque cortado mientras apartaba los archivos: creds.json ya salió, la base tiene todo, y el siguiente termina de apartarlos", async () => {
  const dir = carpeta();
  const { ids, antes } = await enArchivos(dir);
  const leidoDeArchivos = await leerTodo((await deArchivos(dir)).keys, ids);
  const comoFilas = Object.fromEntries(Object.entries(antes).map(([archivo, texto]) => [archivo.slice(0, -5), texto]));
  const viejos = path.join(dir, SESION.VIEJOS);

  // Cut off at the first file that isn't creds.json, with the folder listed in an order where creds.json isn't first
  // (the disk gives them in any): it goes first all the same, since while it's there the files are the session.
  const [moverReal, listarReal] = [fs.renameSync, fs.readdirSync];
  fs.readdirSync = (...args) => listarReal(...args).sort();
  fs.renameSync = (de, a) => {
    if (path.basename(de) !== "creds.json") throw new Error("se cortó la luz");
    return moverReal(de, a);
  };
  try {
    assert.throws(() => abrir(dir), /se cortó la luz/);
  } finally {
    [fs.renameSync, fs.readdirSync] = [moverReal, listarReal];
  }
  assert.ok(Object.keys(antes).sort()[0] !== "creds.json", "creds.json no era el primero de la lista");
  assert.deepEqual(Object.keys(archivos(viejos)), ["creds.json"], "creds.json sale primero");
  assert.equal(Object.keys(archivos(dir)).length, Object.keys(antes).length - 1, "y el resto quedó en la carpeta");
  assert.deepEqual(filas(dir), comoFilas, "en la base ya estaba todo antes de mover nada");

  // What that leaves is files without creds.json: they aren't the session any more, only on their way out.
  const { state, dicho } = abrir(dir);
  assert.deepEqual(dicho, [`🟢 ${Object.keys(antes).length - 1} archivo(s) sueltos de la sesión de antes pasaron a ${dir}/archivos-viejos/`]);
  assert.deepEqual(filas(dir), comoFilas, "la base queda como estaba");
  assert.equal(state.creds.registered, true);
  assert.deepEqual(await leerTodo(state.keys, ids), leidoDeArchivos);
  assert.deepEqual(archivos(dir), {});
  assert.deepEqual(archivos(viejos), antes, "y los apartados están todos");

  // And what the session saved since then isn't undone by the ones that were left.
  await state.keys.set({ session: { [SESION_DE_ANA]: Buffer.from("avanzó") } });
  cerrarSesion(dir);
  fs.renameSync(path.join(viejos, `session-${SESION_DE_ANA}.json`), path.join(dir, `session-${SESION_DE_ANA}.json`));
  const despues = abrir(dir);
  assert.match(despues.dicho[0], /^🟢 1 archivo\(s\) sueltos/);
  assert.deepEqual(await despues.state.keys.get("session", [SESION_DE_ANA]), { [SESION_DE_ANA]: Buffer.from("avanzó") });
});

test("un archivo cortado no era una clave y no pasa; con creds.json cortado no pasa ninguno, y la base se queda con lo suyo", async () => {
  // A key's file cut short: useMultiFileAuthState read it as no key.
  const dir = carpeta();
  const { ids } = await enArchivos(dir);
  const cortado = path.join(dir, `session-${SESION_DE_ANA}.json`);
  fs.writeFileSync(cortado, fs.readFileSync(cortado, "utf8").slice(0, 40));
  fs.writeFileSync(path.join(dir, "pre-key-2.json"), "");
  const leidoDeArchivos = await leerTodo((await deArchivos(dir)).keys, ids);
  assert.equal(leidoDeArchivos.session[SESION_DE_ANA], null, "para Baileys ya no estaba");
  const { state, dicho } = abrir(dir);
  assert.match(dicho[0], /2 archivo\(s\) no se pudieron leer y no pasaron\./);
  assert.deepEqual(await leerTodo(state.keys, ids), leidoDeArchivos, "lo demás pasa, y eso se lee como se leía: no está");
  assert.equal(state.creds.registered, true);
  assert.deepEqual(archivos(dir), {}, "los cortados se apartan con el resto");

  // creds.json cut short: for useMultiFileAuthState there was no session, and it made a new one.
  const sinCredenciales = carpeta();
  await enArchivos(sinCredenciales);
  fs.writeFileSync(path.join(sinCredenciales, "creds.json"), '{"noiseKey":{"private":{"type":"Buf');
  assert.equal((await deArchivos(sinCredenciales)).creds.registered, false, "para Baileys ya no había sesión: armaba una nueva");
  const nueva = abrir(sinCredenciales);
  assert.deepEqual(nueva.dicho, [`🟠 ${sinCredenciales}/creds.json no se pudo leer, así que esos archivos no eran una sesión que sirva: no pasaron a la base y quedaron en ${sinCredenciales}/archivos-viejos/`]);
  assert.equal(nueva.state.creds.registered, false, "hay que vincular, como habría pasado con los archivos");
  assert.deepEqual(filas(sinCredenciales), {}, "y las claves de esa sesión no quedan mezcladas con la nueva");
  assert.deepEqual(archivos(sinCredenciales), {});

  // The same files turning up where the database already has a session: it keeps it.
  const conSesion = carpeta();
  await enArchivos(conSesion);
  abrir(conSesion);
  cerrarSesion(conSesion);
  const enLaBase = filas(conSesion);
  fs.cpSync(path.join(conSesion, SESION.VIEJOS), conSesion, { recursive: true });
  fs.writeFileSync(path.join(conSesion, "creds.json"), "");
  const sigue = abrir(conSesion);
  assert.match(sigue.dicho[0], /creds\.json no se pudo leer/);
  assert.equal(sigue.state.creds.registered, true);
  assert.deepEqual(filas(conSesion), enLaBase);
  assert.deepEqual(archivos(conSesion), {});
});

test("los archivos apartados se borran solos a la semana, no antes, y la sesión sigue", async () => {
  const dir = carpeta();
  const { ids, antes } = await enArchivos(dir);
  const leido = await leerTodo(abrir(dir).state.keys, ids);
  cerrarSesion(dir);
  const viejos = path.join(dir, SESION.VIEJOS);
  const apartados = fs.statSync(viejos).mtimeMs;

  const casi = abrir(dir, apartados + SESION.DIAS_DE_LOS_VIEJOS * DIA - 1);
  assert.deepEqual(casi.dicho, []);
  assert.deepEqual(archivos(viejos), antes, "a los 6 días y pico siguen ahí, por si hay que volver atrás");
  cerrarSesion(dir);

  const yaEsta = abrir(dir, apartados + SESION.DIAS_DE_LOS_VIEJOS * DIA);
  assert.deepEqual(yaEsta.dicho, [`🧹 Borré ${dir}/archivos-viejos/: los archivos de la sesión de antes ya no sirven para volver atrás.`]);
  assert.equal(fs.existsSync(viejos), false);
  assert.equal(yaEsta.state.creds.registered, true);
  assert.deepEqual(await leerTodo(yaEsta.state.keys, ids), leido);
  cerrarSesion(dir);
  assert.deepEqual(abrir(dir, apartados + 30 * DIA).dicho, [], "y sin carpeta no hay nada que borrar");
});

test("cuando WhatsApp cierra la sesión se va la carpeta entera, y lo que el socket viejo todavía guarda no deja nada", async () => {
  const dir = carpeta();
  await enArchivos(dir);
  const cerrada = abrir(dir);
  assert.ok(fs.existsSync(path.join(dir, SESION.VIEJOS)));
  borrarSesion(dir);
  assert.equal(fs.existsSync(dir), false, "la base y los archivos apartados");

  // main.js gives the process two seconds before it exits: a message still being decrypted saves its keys in them.
  await cerrada.state.keys.set({ session: { [SESION_DE_ANA]: Buffer.from("tarde") } });
  await cerrada.saveCreds();
  assert.deepEqual(await cerrada.state.keys.get("session", [SESION_DE_ANA]), {}, "ni encuentra nada");
  assert.equal(fs.existsSync(dir), false, "ni vuelve a aparecer");

  const nueva = abrir(dir);
  assert.equal(nueva.state.creds.registered, false, "el próximo arranque pide vincular");
  assert.notDeepEqual(nueva.state.creds.noiseKey, cerrada.state.creds.noiseKey);
  assert.deepEqual(filas(dir), {});
  borrarSesion(dir);
  borrarSesion(dir); // and with nothing there, nothing happens
});

// --- For real: Baileys's Signal repository, as the socket uses it, between the bot and whoever writes to it ---

const [CLAUDIA, ANA, BETO] = ["200000000000000@lid", `${ANA_LID}@lid`, `${BETO_LID}@lid`];
// A contact's keys, in memory: only the bot's are under test.
function enMemoria() {
  const datos = new Map();
  return {
    get: async (tipo, ids) => Object.fromEntries(ids.map((id) => [id, datos.get(`${tipo}/${id}`) ?? null])),
    set: async (cambios) => {
      for (const tipo in cambios) for (const id in cambios[tipo]) cambios[tipo][id] ? datos.set(`${tipo}/${id}`, cambios[tipo][id]) : datos.delete(`${tipo}/${id}`);
    },
  };
}
// A session at work, as the socket sets it up (socket.js): the keys behind the cache and the transactions, and the
// repository that encrypts and decrypts with them. Each call is a start: the cache is new, so what it reads is what
// was stored.
function parte({ creds, keys }) {
  const claves = addTransactionCapability(makeCacheableSignalKeyStore(keys, LOGGER), LOGGER, { maxCommitRetries: 1, delayBetweenTriesMs: 0 });
  return { creds, keys: claves, repo: DEFAULT_CONNECTION_CONFIG.makeSignalRepository({ creds, keys: claves }, LOGGER, async () => []) };
}
// What WhatsApp hands whoever writes to someone for the first time: their identity, their signed pre-key and one of
// the pre-keys they uploaded (which Baileys makes and counts in the credentials: getNextPreKeys, then creds.update).
async function paqueteDe(p, guardarCredenciales) {
  const { update, preKeys } = await getNextPreKeys(p, 1);
  Object.assign(p.creds, update);
  await guardarCredenciales();
  const [id] = Object.keys(preKeys);
  return {
    registrationId: p.creds.registrationId,
    identityKey: generateSignalPubKey(p.creds.signedIdentityKey.public),
    signedPreKey: { keyId: p.creds.signedPreKey.keyId, publicKey: generateSignalPubKey(p.creds.signedPreKey.keyPair.public), signature: p.creds.signedPreKey.signature },
    preKey: { keyId: Number(id), publicKey: generateSignalPubKey(preKeys[id].public) },
  };
}
// A private message from one to the other: how it went out ("pkmsg" opens a session, "msg" goes on with one) once the
// other read it.
async function privado([de, deJid], [a, aJid], texto) {
  const { type, ciphertext } = await de.repo.encryptMessage({ jid: aJid, data: Buffer.from(texto) });
  assert.equal(Buffer.from(await a.repo.decryptMessage({ jid: deJid, type, ciphertext })).toString(), texto);
  return type;
}
// A message to the group. Its key reaches the others once, with the first one (conClave): after that they read with the
// one they have, so a sender who lost its own and made another isn't read.
async function alGrupo([de, deJid], [a], texto, { conClave }) {
  const { ciphertext, senderKeyDistributionMessage } = await de.repo.encryptGroupMessage({ group: GRUPO, meId: deJid, data: Buffer.from(texto) });
  if (conClave) await a.repo.processSenderKeyDistributionMessage({ item: { groupId: GRUPO, axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage }, authorJid: deJid });
  assert.equal(Buffer.from(await a.repo.decryptGroupMessage({ group: GRUPO, authorJid: deJid, msg: ciphertext })).toString(), texto);
}
// The talk goes on where it was: both ways in private, with the session there is, and both ways in the group, with the
// keys handed out before.
async function sigueLaCharla(claudia, ana) {
  assert.equal(await privado([ana, ANA], [claudia, CLAUDIA], "¿seguís ahí?"), "msg");
  assert.equal(await privado([claudia, CLAUDIA], [ana, ANA], "acá estoy"), "msg");
  await alGrupo([claudia, CLAUDIA], [ana, ANA], "sigo en el grupo", { conClave: false });
  await alGrupo([ana, ANA], [claudia, CLAUDIA], "y yo", { conClave: false });
}
async function empiezaLaCharla(claudia, ana, guardarCredenciales) {
  await ana.repo.injectE2ESession({ jid: CLAUDIA, session: await paqueteDe(claudia, guardarCredenciales) });
  assert.equal(await privado([ana, ANA], [claudia, CLAUDIA], "hola Claudia"), "pkmsg", "el primero abre la sesión, con una pre-clave");
  assert.equal(await privado([claudia, CLAUDIA], [ana, ANA], "hola Ana"), "msg");
  assert.equal(await privado([ana, ANA], [claudia, CLAUDIA], "¿todo bien?"), "msg");
  await alGrupo([claudia, CLAUDIA], [ana, ANA], "buenas al grupo", { conClave: true });
  await alGrupo([ana, ANA], [claudia, CLAUDIA], "buenas", { conClave: true });
}

test("cifrando de verdad: después de reiniciar, la charla sigue con las sesiones y las claves de grupo que quedaron guardadas", async () => {
  const dir = carpeta();
  const ana = parte({ creds: initAuthCreds(), keys: enMemoria() });
  let sesion = abrir(dir);
  await empiezaLaCharla(parte(sesion.state), ana, sesion.saveCreds);
  const guardadas = Object.keys(filas(dir)).sort();
  assert.deepEqual(guardadas, ["creds", `identity-key-${SESION_DE_ANA}`, `sender-key-${GRUPO}--200000000000000_1--0`, `sender-key-${GRUPO}--${ANA_LID}_1--0`, `session-${SESION_DE_ANA}`], "la pre-clave que gastó el primer mensaje ya no está");

  for (let arranque = 0; arranque < 2; arranque++) {
    cerrarSesion(dir);
    sesion = abrir(dir);
    await sigueLaCharla(parte(sesion.state), ana);
  }
  assert.deepEqual(Object.keys(filas(dir)).sort(), guardadas);
});

test("cifrando de verdad: una charla empezada con la sesión en archivos sigue después de pasarla a la base, y las pre-claves subidas antes sirven", async () => {
  const dir = carpeta();
  const [ana, beto] = [parte({ creds: initAuthCreds(), keys: enMemoria() }), parte({ creds: initAuthCreds(), keys: enMemoria() })];
  const vieja = await useMultiFileAuthState(dir);
  const antes = parte(vieja.state);
  await empiezaLaCharla(antes, ana, vieja.saveCreds);
  // A pre-key WhatsApp has and nobody used yet: Beto gets it now and writes once the bot has updated.
  const paraBeto = await paqueteDe(antes, vieja.saveCreds);
  const cuantos = Object.keys(archivos(dir)).length;

  const sesion = abrir(dir);
  assert.match(sesion.dicho[0], new RegExp(`\\(${cuantos} claves\\)`));
  assert.equal(sesion.state.creds.nextPreKeyId, vieja.state.creds.nextPreKeyId, "la cuenta de pre-claves sigue donde iba");
  const claudia = parte(sesion.state);
  await sigueLaCharla(claudia, ana);
  await beto.repo.injectE2ESession({ jid: CLAUDIA, session: paraBeto });
  assert.equal(await privado([beto, BETO], [claudia, CLAUDIA], "hola, soy Beto"), "pkmsg");
  assert.equal(await privado([claudia, CLAUDIA], [beto, BETO], "hola Beto"), "msg");

  cerrarSesion(dir);
  const otroArranque = abrir(dir);
  assert.deepEqual(otroArranque.dicho, []);
  await sigueLaCharla(parte(otroArranque.state), ana);
});

// --- Where it's plugged in ---

// main.js can't run here (it connects to WhatsApp): read as code (nodosQue).
test("main.js tiene la sesión en lib/sesion.js: la abre al arrancar y en cada conexión, le pasa cada cambio, y la borra si WhatsApp la cierra", async () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const cuantos = async (selector) => (await nodosQue(selector, main)).length;
  assert.equal(await cuantos('Program > ExpressionStatement > CallExpression[callee.name="abrirSesion"]'), 1, "al arrancar, fuera de startBot: si falla traer los archivos, el bot para ahí");
  const EN_STARTBOT = 'FunctionDeclaration[id.name="startBot"]';
  assert.equal(await cuantos(`${EN_STARTBOT} VariableDeclarator[init.callee.name="abrirSesion"] > ObjectPattern > Property[key.name=/^(state|saveCreds)$/]`), 2, "cada conexión pide la sesión");
  assert.equal(await cuantos(`${EN_STARTBOT} Property[key.name="auth"] Property[key.name="creds"][value.object.name="state"][value.property.name="creds"]`), 1, "las credenciales, las de la sesión");
  assert.equal(
    await cuantos(`${EN_STARTBOT} Property[key.name="auth"] Property[key.name="keys"] > CallExpression[callee.name="makeCacheableSignalKeyStore"] > MemberExpression.arguments:first-child[object.name="state"][property.name="keys"]`),
    1,
    "las claves, las de la sesión, detrás de la caché de Baileys",
  );
  assert.equal(await cuantos(`${EN_STARTBOT} CallExpression[callee.property.name="on"][arguments.0.value="creds.update"][arguments.1.name="saveCreds"]`), 1, "cada cambio de las credenciales se guarda");
  const CERRADA = 'CallExpression[callee.property.name="on"][arguments.0.value="connection.update"] IfStatement[test.right.operator="==="][test.right.right.object.name="DisconnectReason"][test.right.right.property.name="loggedOut"] > BlockStatement.consequent';
  assert.equal(await cuantos(`${CERRADA} CallExpression[callee.name="borrarSesion"]`), 1, "si WhatsApp cierra la sesión, se borra");
  assert.equal(await cuantos('CallExpression[callee.name="borrarSesion"]'), 1, "y solo entonces");
  assert.equal(await cuantos('ImportSpecifier[imported.name="useMultiFileAuthState"], CallExpression[callee.name="useMultiFileAuthState"]'), 0, "ya no usa los archivos");
});

// Why the session isn't a table of database.db: the backups copy that file whole, and one a week goes to the owner over
// WhatsApp (lib/backup.js). The folder is the one .gitignore and the README name.
test("la sesión va a botSession/, en su propio archivo: los backups de la base no la llevan", async () => {
  await prepararBase("sesion");
  const { hacerBackup } = await import("../lib/backup.js");
  const { state, saveCreds, dicho } = abrir();
  assert.deepEqual(dicho, []);
  state.creds.advSecretKey = "NO-VA-EN-EL-BACKUP";
  await saveCreds();
  await state.keys.set({ session: { [SESION_DE_ANA]: Buffer.from("TAMPOCO-ESTA-CLAVE") } });
  assert.match(filas("botSession").creds, /NO-VA-EN-EL-BACKUP/, "está en botSession/sesion.db");
  assert.match(fs.readFileSync(new URL("../.gitignore", import.meta.url), "utf8"), /^botSession\/$/m, "que git no sube");

  const copia = await hacerBackup();
  const bytes = fs.readFileSync(copia);
  for (const marca of ["NO-VA-EN-EL-BACKUP", Buffer.from("TAMPOCO-ESTA-CLAVE").toString("base64")]) assert.equal(bytes.includes(marca), false, marca);
  const base = new Database(copia, { readonly: true });
  assert.equal(base.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'sesion'`).get().n, 0);
  base.close();
  assert.equal(fs.readdirSync("database").some((archivo) => archivo.includes("sesion")), false, "ni está al lado de la base");
  borrarSesion();
  assert.equal(fs.existsSync("botSession"), false);
});
