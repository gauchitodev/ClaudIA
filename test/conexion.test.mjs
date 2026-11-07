import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prepararBase, clienteFalso, G, nodosQue, fijarSaldo } from "./helpers.mjs";
import { conexion, idsDelBot, lidDelBot, nombreDelBot } from "../lib/conexion.js";
import { configuracion } from "../lib/configuracion.js";

// The WhatsApp connection is in lib/conexion.js, and not on globalThis: the socket main.js makes (a new one on each
// reconnect, so whoever needs it asks each time), how the connection is doing, and who the bot is by it.
let F, I, WS;
const ANTES = {};
before(async () => {
  ({ F } = await prepararBase("conexion"));
  I = await import("../lib/identidad.js");
  WS = await import("../lib/wa-socket.js");
  Object.assign(ANTES, conexion);
});
afterEach(() => Object.assign(conexion, ANTES));

// A socket of the bot, as far as who it is goes.
const socketDe = (lid, numero, name = "Claudia") => ({ ...clienteFalso(), user: { lid, jid: `${numero}@s.whatsapp.net`, id: `${numero}:7@s.whatsapp.net`, name } });

test("quién es el bot sale del socket de ahora: después de una reconexión, del nuevo", () => {
  conexion.client = socketDe("200000000000101@lid", "59800000101");
  assert.deepEqual(idsDelBot(), ["200000000000101@lid", "59800000101@s.whatsapp.net"]);
  assert.deepEqual([lidDelBot(), nombreDelBot(), I.esElBot("200000000000101@lid")], ["200000000000101@lid", "Claudia", true]);
  // main.js makes a new socket on reconnect: this one with other ids and name, so that which one is read shows.
  conexion.client = socketDe("200000000000102@lid", "59800000102", "Claudia ✨");
  assert.deepEqual([I.esElBot("200000000000101@lid"), I.esElBot("200000000000102@lid"), I.esElBot("59800000102@s.whatsapp.net")], [false, true, true]);
  assert.equal(nombreDelBot(), "Claudia ✨");
  // Before the first connection there's none: nobody is the bot.
  conexion.client = null;
  assert.deepEqual([idsDelBot(), lidDelBot(), nombreDelBot(), I.esElBot("200000000000102@lid")], [[], undefined, undefined, false]);
});

test("la base le pregunta a lib/conexion.js quién es el bot: su nombre, su fila de ajustes, y la deja fuera del top", () => {
  const BOT = "200000000000111@lid";
  const ANA = "300000000000111@lid";
  conexion.client = socketDe(BOT, "59800000111");
  // A message of her own comes without a pushName: her row takes the connection's name.
  const suyo = { chat: G, sender: BOT, senderJid: "59800000111@s.whatsapp.net", pushName: "", fromMe: true };
  F.initDataDB(suyo);
  F.syncUserInfo(suyo);
  assert.equal(F.getUser(BOT).pushName, "Claudia");
  assert.ok(F.getBotSettings(BOT), "la fila de sus ajustes, por su LID");
  F.initDataDB({ chat: G, sender: ANA, senderJid: "59899000111@s.whatsapp.net", pushName: "Ana" });
  fijarSaldo(F, G, BOT, 900);
  fijarSaldo(F, G, ANA, 100);
  assert.deepEqual(F.topCoins(G).map((f) => f.usuario), [ANA]);
});

test("los archivos llevan la etiqueta del canal de lib/conexion.js y la tarjeta de lib/configuracion.js", async (t) => {
  const crearReal = WS._dep.crearSocket;
  WS._dep.crearSocket = () => ({ ...socketDe("200000000000121@lid", "59800000121"), ev: { emit() {}, on() {} } });
  let client;
  try {
    client = WS.makeWASocket({});
  } finally {
    WS._dep.crearSocket = crearReal;
  }
  const tarjetaAntes = configuracion.tarjetaGrupo;
  t.after(() => (configuracion.tarjetaGrupo = tarjetaAntes));
  // A 1×1 PNG. sendFile keeps a copy in tmp/ to send it by path: taken away after each one.
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const contexto = async () => {
    await client.sendFile(G, PNG, "foto.png", "una foto");
    const { msg } = globalThis.enviados.at(-1);
    fs.rmSync(msg.image.url, { force: true });
    const { forwardedNewsletterMessageInfo: canal, externalAdReply: tarjeta } = msg.contextInfo;
    return { canal: canal && { jid: canal.newsletterJid, nombre: canal.newsletterName }, tarjeta: tarjeta && { titulo: tarjeta.title, enlace: tarjeta.sourceUrl } };
  };
  assert.deepEqual(await contexto(), { canal: undefined, tarjeta: undefined }, "sin canal ni enlace, nada");
  conexion.canal = { jid: "120363000000000121@newsletter", nombre: "Canal de Claudia" };
  configuracion.tarjetaGrupo = { titulo: "ClaudIA :)", cuerpo: "Unite al grupo", enlace: "https://chat.whatsapp.com/GRUPO" };
  assert.deepEqual(await contexto(), {
    canal: { jid: "120363000000000121@newsletter", nombre: "Canal de Claudia" },
    tarjeta: { titulo: "ClaudIA :)", enlace: "https://chat.whatsapp.com/GRUPO" },
  });
});

// main.js can't run here (it connects to WhatsApp): read as code (nodosQue), each socket it makes goes to
// lib/conexion.js, in startBot, which each reconnect runs again, and the connection's state goes with it.
test("main.js pone cada socket nuevo en lib/conexion.js, y cómo anda la conexión", async () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const puestos = await nodosQue('AssignmentExpression[left.object.name="conexion"][left.property.name="client"][right.callee.name="makeWASocket"]', main);
  assert.equal(puestos.length, 1, "el socket que hace main.js va a lib/conexion.js");
  let funcion = puestos[0].parent;
  while (funcion && funcion.type !== "FunctionDeclaration") funcion = funcion.parent;
  assert.equal(funcion?.id.name, "startBot");
  const enLaRama = (rama, campo, valor = "") =>
    nodosQue(`CallExpression[callee.property.name="on"][arguments.0.value="connection.update"] IfStatement[test.right.value="${rama}"] > BlockStatement.consequent AssignmentExpression[left.object.name="conexion"][left.property.name="${campo}"]${valor}`, main);
  assert.equal((await enLaRama("open", "botConectado", "[right.value=true]")).length, 1, "conectada al abrirse");
  assert.equal((await enLaRama("close", "botConectado", "[right.value=false]")).length, 1, "desconectada al cerrarse");
  assert.equal((await enLaRama("open", "horaConexion")).length, 1, "la hora en que se abrió");
  assert.equal((await enLaRama("close", "horaCaida")).length, 1, "la hora en que se cayó");
});
