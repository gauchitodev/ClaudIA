// How many sessions the installed Baileys opens with someone's phone when it asks for their devices again. Run by
// test/parche-baileys.test.mjs in a process of its own, since a socket leaves timers going: it prints one line of JSON
// and exits. The socket is Baileys's own, connected to a server made here, on this machine: nothing goes to WhatsApp.
// The server never answers the hello, so the connection stays where a node goes out as it is, unencrypted, and what
// Baileys asks can be read and answered: a devices query (usync), and a request for someone's keys (encrypt), which
// is what opening a session takes.
import { createRequire } from "module";
import pino from "pino";
import makeWASocket, { initAuthCreds, decodeBinaryNode, Curve, signedKeyPair, NOISE_WA_HEADER } from "@whiskeysockets/baileys";

// ws is Baileys's dependency, not the bot's: asked for from where Baileys would find it.
const { WebSocketServer } = createRequire(import.meta.resolve("@whiskeysockets/baileys"))("ws");

// libsignal prints every session it retires, keys and all.
for (const nivel of ["info", "warn", "error"]) console[nivel] = () => {};

// Whatever goes wrong, it ends: nothing here waits on anyone's answer for long, but a socket is a socket.
setTimeout(() => {
  process.stderr.write("sesiones-de-baileys.mjs: pasó un minuto y medio sin terminar\n");
  process.exit(2);
}, 90_000).unref();

const GENTE = [1, 2, 3].map((i) => ({ pn: `5989900000${i}@s.whatsapp.net`, lid: `20000000000000${i}@lid` }));
const lidDe = new Map(GENTE.map((g) => [g.pn, g.lid]));
const GRUPO = "120363000000000001@g.us";
// Each person's phone (device 0) and a linked device of theirs.
const VINCULADO = 12;

// ---- The server ------------------------------------------------------------------------------------------------
const visto = { consultas: 0, claves: 0, forzadas: 0, mensajes: 0 };
const identidades = new Map();
let proximaClave = 1;
const tres = (n) => Buffer.from([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
const hijo = (nodo, tag) => (Array.isArray(nodo?.content) ? nodo.content.find((c) => c.tag === tag) : undefined);

// Someone's keys, as WhatsApp hands them over: signed for real, since libsignal checks the signature.
function claves(jid) {
  if (!identidades.has(jid)) identidades.set(jid, Curve.generateKeyPair());
  const identidad = identidades.get(jid);
  const firmada = signedKeyPair(identidad, proximaClave++);
  return {
    tag: "user",
    attrs: { jid },
    content: [
      { tag: "registration", attrs: {}, content: Buffer.from([0, 0, 0, 77]) },
      { tag: "type", attrs: {}, content: Buffer.from([5]) },
      { tag: "identity", attrs: {}, content: Buffer.from(identidad.public) },
      { tag: "skey", attrs: {}, content: [{ tag: "id", attrs: {}, content: tres(firmada.keyId) }, { tag: "value", attrs: {}, content: Buffer.from(firmada.keyPair.public) }, { tag: "signature", attrs: {}, content: Buffer.from(firmada.signature) }] },
      { tag: "key", attrs: {}, content: [{ tag: "id", attrs: {}, content: tres(proximaClave++) }, { tag: "value", attrs: {}, content: Buffer.from(Curve.generateKeyPair().public) }] },
    ],
  };
}

function respuestaA(nodo) {
  if (nodo.tag === "message") visto.mensajes++;
  if (nodo.tag !== "iq") return null;
  const base = { tag: "iq", attrs: { type: "result", id: nodo.attrs.id, from: "s.whatsapp.net" } };
  if (nodo.attrs.xmlns === "usync") {
    visto.consultas++;
    // Each one's phone and linked device, and their LID: whether asked about by number or by LID, which is when
    // Baileys forces a session with every phone in a group.
    const lista = hijo(hijo(nodo, "usync"), "list").content.map(({ attrs: { jid } }) => ({
      tag: "user",
      attrs: { jid },
      content: [
        { tag: "devices", attrs: {}, content: [{ tag: "device-list", attrs: {}, content: [{ tag: "device", attrs: { id: "0", "key-index": "0" } }, { tag: "device", attrs: { id: String(VINCULADO), "key-index": "3" } }] }] },
        { tag: "lid", attrs: { val: lidDe.get(jid) || jid } },
      ],
    }));
    return { ...base, content: [{ tag: "usync", attrs: {}, content: [{ tag: "list", attrs: {}, content: lista }] }] };
  }
  if (nodo.attrs.xmlns === "encrypt" && nodo.attrs.type === "get") {
    const pedidas = hijo(nodo, "key").content;
    visto.claves += pedidas.length;
    // Baileys says why it asks when it does it over a session it already has.
    visto.forzadas += pedidas.filter((u) => u.attrs.reason === "identity").length;
    return { ...base, content: [{ tag: "list", attrs: {}, content: pedidas.map((u) => claves(u.attrs.jid)) }] };
  }
  return { ...base, content: [] };
}

const servidor = new WebSocketServer({ port: 0, host: "127.0.0.1" });
await new Promise((listo) => servidor.once("listening", listo));

// ---- The bot's side --------------------------------------------------------------------------------------------
const guardado = new Map();
const keys = {
  get: async (tipo, ids) => Object.fromEntries(ids.filter((id) => guardado.has(`${tipo}-${id}`)).map((id) => [id, guardado.get(`${tipo}-${id}`)])),
  set: async (datos) => {
    for (const tipo in datos) {
      for (const id in datos[tipo]) {
        if (datos[tipo][id] === null || datos[tipo][id] === undefined) guardado.delete(`${tipo}-${id}`);
        else guardado.set(`${tipo}-${id}`, datos[tipo][id]);
      }
    }
  },
};
const creds = initAuthCreds();
creds.me = { id: "59800000001:5@s.whatsapp.net", lid: "100000000000001:5@lid", name: "bot" };
// Baileys's list of each person's devices, which it keeps five minutes: here it's emptied by hand.
const lista = new Map();
const dispositivos = { get: (clave) => lista.get(clave), set: (clave, valor) => void lista.set(clave, valor), del: (clave) => void lista.delete(clave) };
const pasanCincoMinutos = () => lista.clear();

const sock = makeWASocket({
  auth: { creds, keys },
  waWebSocketUrl: `ws://127.0.0.1:${servidor.address().port}`,
  logger: pino({ level: "silent" }),
  connectTimeoutMs: 120000,
  defaultQueryTimeoutMs: 5000,
  userDevicesCache: dispositivos,
  cachedGroupMetadata: async () => ({ id: GRUPO, subject: "prueba", addressingMode: "lid", participants: GENTE.map((g) => ({ id: g.lid, admin: null })) }),
  getMessage: async () => undefined,
  syncFullHistory: false,
  markOnlineOnConnect: false,
});
// What Baileys sends, read and answered: the socket has only asked to connect, so nothing has come yet.
let tramas = 0;
servidor.on("connection", (conexion) => {
  conexion.on("message", async (dato) => {
    // The first one has Baileys's header in front, and is the hello, which is no node. Each of the rest is one node,
    // behind its length in three bytes.
    let resto = tramas === 0 ? Buffer.from(dato).subarray(NOISE_WA_HEADER.length) : Buffer.from(dato);
    while (resto.length >= 3) {
      const largo = resto.readUIntBE(0, 3);
      const cuerpo = Buffer.from(resto.subarray(3, 3 + largo));
      resto = resto.subarray(3 + largo);
      if (tramas++ === 0) continue;
      const nodo = await decodeBinaryNode(cuerpo);
      const respuesta = respuestaA(nodo);
      if (respuesta) setImmediate(() => sock.ws.emit(`TAG:${nodo.attrs.id}`, respuesta));
    }
  });
});

const hasta = async (condicion, ms) => {
  for (const fin = Date.now() + ms; Date.now() < fin && !condicion(); ) await new Promise((sigue) => setTimeout(sigue, 10));
  return condicion();
};
if (!(await hasta(() => sock.ws.isOpen, 5000))) throw new Error("el socket no llegó a abrirse contra el servidor de acá");

const sesiones = (lid, dispositivo) => Object.keys(guardado.get(`session-${lid.split("@")[0]}_1.${dispositivo}`)?._sessions || {}).length;
const corte = () => {
  const hasta_aca = { ...visto };
  for (const cual in visto) visto[cual] = 0;
  return hasta_aca;
};

// By number, as in a private chat: three times over, the list of devices gone each time.
const porNumero = { sesiones: [] };
for (let i = 0; i < 3; i++) {
  pasanCincoMinutos();
  await sock.getUSyncDevices([GENTE[0].pn], true, false);
  porNumero.sesiones.push(sesiones(GENTE[0].lid, 0));
}
Object.assign(porNumero, corte());

// A group of three, by LID: three messages, the list of devices gone each time.
for (let i = 1; i <= 3; i++) {
  pasanCincoMinutos();
  await sock.sendMessage(GRUPO, { text: `mensaje ${i}` });
}
await hasta(() => visto.mensajes === 3, 3000);
const grupo = { telefonos: GENTE.map((g) => sesiones(g.lid, 0)), vinculados: GENTE.map((g) => sesiones(g.lid, VINCULADO)), ...corte() };

process.stdout.write(`${JSON.stringify({ porNumero, grupo })}\n`);
process.exit(0);
