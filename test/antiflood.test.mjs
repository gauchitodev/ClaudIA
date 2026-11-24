import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { proto } from "@whiskeysockets/baileys";
import { prepararBase, esperar } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";
import { generoDe, concordar } from "../lib/genero.js";
import txt from "../lib/strings.js";

// The anti-flood (.antiflood): lib/antiflood.js counts what each person sends in a group and says what a flood brings
// (a notice first, a warning if it happens again within ten minutes), and plugins/_antiflood.js is the hook that
// carries it out. The lib goes by the clock it's handed, so the first half of this file passes it in.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOT = "999@lid";
const MOD = "100@lid"; // a WhatsApp admin, who warns by hand
const [S, MIN] = [1000, 60 * 1000];
const T = 1_800_000_000_000; // a moment, in ms
const AVISO = (digitos) => `🌊 @${digitos}, aflojá un poco: mandaste 8 mensajes en 10 segundos y así no se puede seguir la charla. No borro nada, pero si seguís así lo próximo es una advertencia.`;
const MOTIVO = "flood: 8 mensajes en 10 segundos, después del aviso";

let F, A, Hook, Warn, Ant, darAdvertencia;
let expulsiones = [];
let statusExpulsion = "200";

before(async () => {
  ({ F } = await prepararBase("antiflood"));
  conexion.client.user.lid = BOT;
  conexion.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    return ids.map((jid) => ({ status: statusExpulsion, jid }));
  };
  A = await import("../lib/antiflood.js");
  Hook = (await import("../plugins/_antiflood.js")).default;
  Warn = (await import("../plugins/grupo-advertir.js")).default;
  Ant = (await import("../plugins/grupo-antecedentes.js")).default;
  ({ darAdvertencia } = await import("../lib/advertencias.js"));
});

beforeEach(() => {
  A.reiniciarAntiflood();
  // What a test before this one left on its way, if it failed halfway, isn't this one's to wait for.
  Hook.enCurso = undefined;
  expulsiones = [];
  statusExpulsion = "200";
  globalThis.enviados = [];
});

// ---------- the count and the ladder (lib/antiflood.js) ----------

let ids = 0;
// One more message from someone, with an id of its own, sent at "cuando".
const manda = (chat, quien, cuando, extra = {}) => A.contarMensaje(chat, quien, { id: `M${++ids}`, ...extra }, cuando);
// Eight of them, a second apart from "desde": what each one brought.
const ocho = (chat, quien, desde) => Array.from({ length: 8 }, (_, i) => manda(chat, quien, desde + i * S));
const SIETE_NADA = Array(7).fill(null);

test("ventana: el octavo mensaje en 10 segundos avisa; siete, o el octavo fuera de la ventana, no", () => {
  const C = "af-ventana@g.us";
  assert.deepEqual([A.ANTIFLOOD.MENSAJES, A.ANTIFLOOD.VENTANA_MS, A.ANTIFLOOD.MEMORIA_MS], [8, 10 * S, 10 * MIN], "el límite que se decidió");
  assert.deepEqual(
    Array.from({ length: 7 }, (_, i) => manda(C, "1@lid", T + i * S)),
    SIETE_NADA,
  );
  assert.equal(manda(C, "1@lid", T + 9 * S), "aviso", "el octavo, a 9 s del primero");

  // The eighth 10 s after the first: the first is out of the window by then. One more within it, and it's eight.
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 10].map((s) => manda(C, "2@lid", T + s * S)),
    Array(8).fill(null),
    "a 10 s del primero ya no son ocho",
  );
  assert.equal(manda(C, "2@lid", T + 10 * S), "aviso");

  // Each person in each group has a count of their own: 21 messages among three counts, seven in each, are no flood.
  const [G1, G2] = ["af-ventana-1@g.us", "af-ventana-2@g.us"];
  const mezclados = [];
  for (let i = 0; i < 7; i++) mezclados.push(manda(G1, "3@lid", T + i * S), manda(G1, "4@lid", T + i * S), manda(G2, "3@lid", T + i * S));
  assert.deepEqual(mezclados, Array(21).fill(null));
  assert.deepEqual([manda(G1, "3@lid", T + 7 * S), manda(G1, "4@lid", T + 7 * S), manda(G2, "3@lid", T + 7 * S)], ["aviso", "aviso", "aviso"], "el octavo de cada uno");
});

test("ventana: se mide con la hora de cada mensaje, en el orden que lleguen, y los del mismo segundo cuentan cada uno", () => {
  const C = "af-orden@g.us";
  // Handled backwards: the same eight messages of the same ten seconds.
  assert.deepEqual(
    [7, 6, 5, 4, 3, 2, 1, 0].map((s) => manda(C, "1@lid", T + s * S)),
    [...SIETE_NADA, "aviso"],
  );
  // One older than the window, arriving late, isn't one of the eight: counted, it was the eighth.
  const tarde = [20, 21, 22, 23, 24, 25, 26].map((s) => manda(C, "2@lid", T + s * S));
  tarde.push(manda(C, "2@lid", T + 5 * S));
  assert.deepEqual(tarde, Array(8).fill(null));
  assert.equal(manda(C, "2@lid", T + 27 * S), "aviso");
  // WhatsApp stamps whole seconds: eight stickers in one second are eight.
  assert.deepEqual(
    Array.from({ length: 8 }, () => manda(C, "3@lid", T)),
    [...SIETE_NADA, "aviso"],
  );
});

test("escalera: aviso, advertencia si repite dentro de los 10 minutos, y aviso de nuevo con 10 minutos de calma", () => {
  const C = "af-escalera@g.us";
  const paso = (desde) => {
    const r = ocho(C, "1@lid", desde);
    assert.deepEqual(r.slice(0, 7), SIETE_NADA);
    A.cerrarPaso(C, "1@lid");
    return r[7];
  };
  assert.equal(paso(T), "aviso");
  assert.equal(paso(T + 5 * MIN), "advertencia", "a los 5 minutos del aviso");
  // The ten minutes count from the last thing they were told, not from the first.
  assert.equal(paso(T + 14 * MIN), "advertencia", "a 14 minutos del aviso, y a 9 de la advertencia");
  assert.equal(paso(T + 24 * MIN - S), "advertencia", "a un segundo de cumplirse los 10 minutos");
  assert.equal(paso(T + 34 * MIN - S), "aviso", "con 10 minutos de calma, de nuevo el aviso");
  assert.equal(paso(T + 35 * MIN), "advertencia");
});

test("con un paso en curso no cuenta nada, y al terminar hacen falta otros 8", () => {
  const C = "af-encurso-lib@g.us";
  assert.equal(ocho(C, "1@lid", T)[7], "aviso");
  // The rest of the burst, while the notice is still on its way: not another step, and not part of the next one.
  assert.deepEqual(
    Array.from({ length: 20 }, (_, i) => manda(C, "1@lid", T + 8 * S + i * 100)),
    Array(20).fill(null),
  );
  A.cerrarPaso(C, "1@lid");
  assert.deepEqual(ocho(C, "1@lid", T + 11 * S), [...SIETE_NADA, "advertencia"], "ocho más, mandados después de que se le dijo");
  A.cerrarPaso(C, "1@lid");
  // Closing what isn't open changes nothing: they aren't taken for removed, so what follows counts...
  A.cerrarPaso(C, "1@lid", { expulsado: true });
  A.cerrarPaso("otro@g.us", "nadie@lid", { expulsado: true });
  assert.equal(ocho(C, "1@lid", T + 30 * S)[7], "advertencia"); // told at T + 37 s, and before that at T + 18 s
  A.cerrarPaso(C, "1@lid");
  // ...and what they were last told isn't taken back: ten minutes are counted from it, not from the one before.
  A.cerrarPaso(C, "1@lid", { fallo: true });
  assert.equal(ocho(C, "1@lid", T + 10 * MIN + 22 * S)[7], "advertencia", "a 9 min 52 s de lo último que se le dijo");
});

test("un aviso que no salió no fue un aviso", () => {
  const C = "af-fallo@g.us";
  assert.equal(ocho(C, "1@lid", T)[7], "aviso");
  A.cerrarPaso(C, "1@lid", { fallo: true });
  assert.equal(ocho(C, "1@lid", T + MIN)[7], "aviso", "no se le llegó a decir: la próxima es el aviso otra vez");
  A.cerrarPaso(C, "1@lid");
  assert.equal(ocho(C, "1@lid", T + 2 * MIN)[7], "advertencia");
  // A warning that failed leaves the notice standing, from when it was given.
  A.cerrarPaso(C, "1@lid", { fallo: true });
  assert.equal(ocho(C, "1@lid", T + 10 * MIN)[7], "advertencia", "a 9 minutos del aviso que sí salió");
  A.cerrarPaso(C, "1@lid", { fallo: true });
  assert.equal(ocho(C, "1@lid", T + 11 * MIN)[7], "aviso", "y a 10, el aviso de nuevo");
});

test("un álbum cuenta una vez, llegue primero la tapa o las fotos; la copia HD no cuenta; dos álbumes son dos", () => {
  const C = "af-album@g.us";
  const foto = (album) => ({ pieza: { de: album, album: true } });
  // The cover first (its id is what every photo points at), then twelve photos: one message.
  const tapaPrimero = [A.contarMensaje(C, "1@lid", { id: "ALBUM-A" }, T), ...Array.from({ length: 12 }, () => manda(C, "1@lid", T + S, foto("ALBUM-A")))];
  for (let i = 0; i < 6; i++) tapaPrimero.push(manda(C, "1@lid", T + 2 * S));
  assert.deepEqual(tapaPrimero, Array(19).fill(null), "el álbum y seis mensajes son siete");
  assert.equal(manda(C, "1@lid", T + 3 * S), "aviso");

  // The photos first, the cover in the middle.
  const fotosPrimero = [manda(C, "2@lid", T, foto("ALBUM-B")), manda(C, "2@lid", T, foto("ALBUM-B")), A.contarMensaje(C, "2@lid", { id: "ALBUM-B" }, T), manda(C, "2@lid", T + S, foto("ALBUM-B"))];
  for (let i = 0; i < 6; i++) fotosPrimero.push(manda(C, "2@lid", T + 2 * S));
  assert.deepEqual(fotosPrimero, Array(10).fill(null));
  assert.equal(manda(C, "2@lid", T + 3 * S), "aviso");

  // The HD copy of a photo is no message of its own: twenty of them and seven messages are seven.
  const conHD = Array.from({ length: 20 }, () => manda(C, "3@lid", T, { pieza: { de: "FOTO", album: false } }));
  for (let i = 0; i < 7; i++) conHD.push(manda(C, "3@lid", T + S));
  assert.deepEqual(conHD, Array(27).fill(null));
  assert.equal(manda(C, "3@lid", T + 2 * S), "aviso");

  // Two albums are two messages.
  const dos = [manda(C, "4@lid", T, foto("ALBUM-C")), manda(C, "4@lid", T, foto("ALBUM-C")), manda(C, "4@lid", T + S, foto("ALBUM-D")), manda(C, "4@lid", T + S, foto("ALBUM-D"))];
  for (let i = 0; i < 5; i++) dos.push(manda(C, "4@lid", T + 2 * S));
  assert.deepEqual(dos, Array(9).fill(null), "dos álbumes y cinco mensajes son siete");
  assert.equal(manda(C, "4@lid", T + 3 * S), "aviso");
});

test("el mismo mensaje dos veces cuenta una", () => {
  const C = "af-repetido@g.us";
  const repetido = Array.from({ length: 20 }, () => A.contarMensaje(C, "1@lid", { id: "EL-MISMO" }, T));
  for (let i = 0; i < 6; i++) repetido.push(manda(C, "1@lid", T + S));
  assert.deepEqual(repetido, Array(26).fill(null));
  assert.equal(manda(C, "1@lid", T + 2 * S), "aviso");
  // With no id to tell them by, each one counts.
  assert.deepEqual(
    Array.from({ length: 8 }, () => A.contarMensaje(C, "2@lid", {}, T)),
    [...SIETE_NADA, "aviso"],
  );
});

test("piezaDe: de qué álbum es una foto, también envuelta; no de lo que cita", () => {
  // As they arrive: decoded from bytes by Baileys' own protos.
  const deBytes = (contenido) => proto.Message.decode(proto.Message.encode(proto.Message.create(contenido)).finish());
  const { MEDIA_ALBUM, HD_IMAGE_DUAL_UPLOAD } = proto.MessageAssociation.AssociationType;
  const asociado = (tipo, id) => ({ messageContextInfo: { messageAssociation: { associationType: tipo, parentMessageKey: { remoteJid: "g@g.us", fromMe: false, id } } } });
  const foto = { imageMessage: { caption: "la playa" } };

  const deAlbum = deBytes({ ...foto, ...asociado(MEDIA_ALBUM, "TAPA") });
  assert.deepEqual(A.piezaDe(deAlbum), { de: "TAPA", album: true });
  assert.deepEqual(A.piezaDe(JSON.parse(JSON.stringify(deAlbum))), { de: "TAPA", album: true }, "y después de pasar por JSON");
  assert.deepEqual(A.piezaDe(asociado("MEDIA_ALBUM", "TAPA")), { de: "TAPA", album: true }, "con el tipo por su nombre");
  assert.deepEqual(A.piezaDe(deBytes({ ephemeralMessage: { message: { ...foto, ...asociado(MEDIA_ALBUM, "TAPA") } } })), { de: "TAPA", album: true }, "en un grupo con mensajes temporales");
  // The HD copy of a photo: a piece of the photo, not of an album.
  assert.deepEqual(A.piezaDe(deBytes({ associatedChildMessage: { message: { ...foto, ...asociado(HD_IMAGE_DUAL_UPLOAD, "FOTO") } } })), { de: "FOTO", album: false });

  // A message of its own: a photo, an album's cover, a text that quotes a photo of an album.
  assert.equal(A.piezaDe(deBytes(foto)), null);
  assert.equal(A.piezaDe(deBytes({ albumMessage: { expectedImageCount: 3 } })), null);
  const cita = deBytes({ extendedTextMessage: { text: "qué linda", contextInfo: { stanzaId: "UNA", participant: "1@lid", quotedMessage: { ...foto, ...asociado(MEDIA_ALBUM, "TAPA") } } } });
  assert.equal(cita.extendedTextMessage.contextInfo.quotedMessage.messageContextInfo.messageAssociation.parentMessageKey.id, "TAPA", "la cita trae la marca");
  assert.equal(A.piezaDe(cita), null, "y no es la del mensaje");
  for (const nada of [null, undefined, "texto", {}, { conversation: "hola" }]) assert.equal(A.piezaDe(nada), null);
});

test("después de una expulsión, lo que todavía llega no cuenta", () => {
  const C = "af-fuera@g.us";
  assert.equal(ocho(C, "1@lid", T)[7], "aviso");
  A.cerrarPaso(C, "1@lid");
  assert.equal(ocho(C, "1@lid", T + MIN)[7], "advertencia"); // told at T + 1 min + 7 s
  A.cerrarPaso(C, "1@lid", { expulsado: true });
  const dicho = T + MIN + 7 * S;
  assert.deepEqual(ocho(C, "1@lid", dicho + S), Array(8).fill(null), "lo que venía en camino");
  assert.deepEqual(ocho(C, "1@lid", dicho + 52 * S), Array(8).fill(null), "hasta un minuto después");
  assert.deepEqual(ocho(C, "1@lid", dicho + MIN), [...SIETE_NADA, "advertencia"], "si después sigue en el grupo, se lo cuenta de nuevo");
});

test("barrido: lo vencido sale del mapa, y quien fue avisado queda sus 10 minutos", () => {
  const C = "af-barrido@g.us";
  for (let i = 0; i < 3; i++) manda(C, "1@lid", T);
  assert.equal(ocho(C, "2@lid", T)[7], "aviso");
  A.cerrarPaso(C, "2@lid");
  assert.equal(ocho(C, "3@lid", T)[7], "aviso"); // a step that never closes
  assert.equal(A.personasEnMemoria(), 3);

  // Within the minute nothing is swept, though the first one's window is long over.
  manda(C, "4@lid", T + 30 * S);
  manda(C, "5@lid", T + 40 * S);
  for (let i = 0; i < 7; i++) manda(C, "5@lid", T + 58 * S);
  assert.equal(A.personasEnMemoria(), 5);
  // Past it: whoever only chatted, and a window ago, goes. Whoever was told stays, and so does whoever wrote just now,
  // though their first message is older than that: their eighth is still the eighth.
  manda(C, "6@lid", T + 61 * S);
  assert.equal(A.personasEnMemoria(), 4, "quedan los dos avisados, quien venía escribiendo y quien acaba de escribir");
  assert.equal(manda(C, "5@lid", T + 62 * S), "aviso");
  A.cerrarPaso(C, "5@lid");
  assert.equal(ocho(C, "2@lid", T + 3 * MIN)[7], "advertencia", "se acuerda del aviso");
  A.cerrarPaso(C, "2@lid");

  // Ten minutes after being told, they go too; and so does the step that never closed, which is counted again.
  manda(C, "7@lid", T + 10 * MIN + 8 * S);
  assert.equal(A.personasEnMemoria(), 3, "quedan el avisado del minuto 1, el advertido del minuto 3 y quien acaba de escribir");
  assert.deepEqual(ocho(C, "3@lid", T + 11 * MIN), [...SIETE_NADA, "aviso"]);
});

// ---------- the hook (plugins/_antiflood.js) ----------

const BASE_S = 1_800_000_000; // a messageTimestamp, in seconds
let numero = 0;
// A message as the hook gets it, sent at second "segundo".
function mensaje(chat, sender, segundo, extra = {}) {
  const m = { chat, isGroup: true, sender, senderJid: "", key: { id: `HOOK${++numero}`, remoteJid: chat, participant: sender }, message: { conversation: "hola" }, mtype: "conversation", messageTimestamp: BASE_S + segundo, ...extra };
  m.delete = async () => (m.borrado = true);
  return m;
}
// The hook on it, as handle-message.js calls it, and whatever it set going.
async function llega(m, { client = conexion.client, participants = [], chat = { antiFlood: 1 }, ...rango } = {}) {
  await Hook.before(m, { client, participants, isMod: false, isOwner: false, isBotAdmin: true, chat, ...rango });
  await Hook.enCurso;
  return m;
}
// Eight messages from someone, a second apart from "desde".
async function rafaga(chat, sender, desde, opciones) {
  const mensajes = [];
  for (let i = 0; i < 8; i++) mensajes.push(await llega(mensaje(chat, sender, desde + i), opciones));
  return mensajes;
}
const textos = () => globalThis.enviados.map((e) => e.msg?.text);
// What a promise gives, or SIGUE if it's still pending a moment later: for what must not be left waiting behind a
// send or an answer the test is holding back. Awaited as it is, a wrong one hung the test instead of failing it.
const SIGUE = "sigue esperando";
const pronto = (promesa) => Promise.race([promesa, esperar(200).then(() => SIGUE)]);
// A group of each test's own, with its people (lid, name), the moderator and the bot.
function grupo(chat, ...gente) {
  for (const [lid, nombre] of [[MOD, "Mod"], ...gente]) F.initDataDB({ chat, sender: lid, senderJid: "", pushName: nombre });
  return [...gente.map(([lid]) => ({ id: lid, admin: null })), { id: MOD, admin: "admin" }, { id: BOT, admin: "admin" }];
}
// A plugin's command run by the moderator, and what it answered.
async function comando(P, chat, participants, text, mencion) {
  globalThis.enviados = [];
  const m = { chat, sender: MOD, senderJid: "", text, mentionedJid: [mencion], isGroup: true, react: async () => {} };
  await P.run(m, { client: conexion.client, text, args: text.split(" "), command: P.cmd[0], usedPrefix: ".", participants, isMod: true, isOwner: false, isWaAdmin: true, isAdmin: true });
  return textos().join("\n");
}

test("antiflood: apagado no hace nada; prendido, al octavo avisa una vez, arrobando, sin borrar ni marcar", async () => {
  const C = "af-hook@g.us";
  const ANA = "301@lid";
  grupo(C, [ANA, "Ana"]);

  await rafaga(C, ANA, 0, { chat: { antiFlood: 0 } });
  await rafaga(C, ANA, 8, { chat: {} });
  assert.deepEqual(textos(), []);
  assert.equal(A.personasEnMemoria(), 0, "apagado, ni se cuenta");

  const primeros = [];
  for (let i = 0; i < 7; i++) primeros.push(await llega(mensaje(C, ANA, 20 + i)));
  assert.deepEqual(textos(), [], "siete no son un flood");
  const octavo = await llega(mensaje(C, ANA, 27));
  assert.deepEqual(globalThis.enviados, [{ chat: C, msg: { text: AVISO("301"), mentions: [ANA] } }]);
  assert.equal(A.avisoDeFlood(ANA), AVISO("301"));
  // The rest of the burst brings nothing else, and nothing was deleted, marked or warned.
  const resto = [await llega(mensaje(C, ANA, 27)), await llega(mensaje(C, ANA, 28))];
  assert.equal(globalThis.enviados.length, 1, "un solo aviso");
  for (const m of [...primeros, octavo, ...resto]) assert.deepEqual([m.borrado, m.moderado], [undefined, undefined]);
  assert.equal(F.advertenciasDe(ANA, C), 0);
});

test("antiflood: ni a moderadores ni a admins ni al owner, ni sin ser admin Claudia, ni por privado", async () => {
  const C = "af-exentos@g.us";
  const casos = [
    ["311@lid", { isMod: true }, "un moderador (o un admin: isMod los incluye)"],
    ["312@lid", { isOwner: true }, "el owner"],
    ["313@lid", { isBotAdmin: false }, "Claudia sin admin: no podría sacar a nadie"],
  ];
  for (const [quien, rango, cual] of casos) {
    await rafaga(C, quien, 0, rango);
    await rafaga(C, quien, 8, rango);
    assert.deepEqual(textos(), [], cual);
    assert.equal(A.personasEnMemoria(), 0, `${cual}: ni se cuenta`);
  }
  for (let i = 0; i < 16; i++) await llega(mensaje("314@lid", "314@lid", i, { isGroup: false }));
  assert.deepEqual(textos(), [], "por privado");
  assert.equal(A.personasEnMemoria(), 0);
  // The same messages from someone with no role do bring it.
  await rafaga(C, "315@lid", 0);
  assert.deepEqual(textos(), [AVISO("315")]);
});

test("antiflood: reacciones, ediciones, borrados, votos, avisos y lo indescifrable no cuentan; un ver una vez sí", async () => {
  const C = "af-tipos@g.us";
  const ANA = "321@lid";
  const de = (tipo) => ({ message: { [tipo]: {} }, mtype: tipo });
  for (let i = 0; i < 7; i++) await llega(mensaje(C, ANA, i));
  const noSon = [
    ...["reactionMessage", "encReactionMessage", "protocolMessage", "editedMessage", "pollUpdateMessage", "pinInChatMessage", "keepInChatMessage", "senderKeyDistributionMessage", "messageContextInfo"].map(de),
    { message: {}, mtype: undefined }, // nothing left in it once pushMessage took its messageContextInfo
    { message: null, mtype: "", messageStubType: 27 }, // a group notice
    { message: null, mtype: "", messageStubType: 2 }, // one the bot couldn't decrypt
    { message: null, mtype: "" }, // with no content and no view-once mark
  ];
  for (const extra of noSon) await llega(mensaje(C, ANA, 7, extra));
  assert.deepEqual(textos(), [], "siete mensajes y trece cosas que no lo son");
  // A view-once reaches the bot with no content, and it's a message in the chat.
  const vistaUnica = mensaje(C, ANA, 8, { message: null, mtype: "" });
  vistaUnica.key.isViewOnce = true;
  await llega(vistaUnica);
  assert.deepEqual(textos(), [AVISO("321")]);
});

test("antiflood: lo que borró un anti-link cuenta igual", async () => {
  const C = "af-moderado@g.us";
  for (let i = 0; i < 8; i++) await llega(mensaje(C, "331@lid", i, { moderado: true }));
  assert.deepEqual(textos(), [AVISO("331")]);
});

test("antiflood: una tanda atrasada se mide por la hora de cada mensaje, no por cuándo llega", async () => {
  const C = "af-tanda@g.us";
  // Eight messages sent over 35 s, handled in the same instant (a reconnection): no flood.
  for (let i = 0; i < 8; i++) await llega(mensaje(C, "341@lid", i * 5));
  assert.deepEqual(textos(), []);
  // With no timestamp on them there's only the moment they're handled: seven now and seven 11 s later aren't eight.
  const sinHora = () => llega(mensaje(C, "342@lid", 0, { messageTimestamp: undefined }));
  const reloj = Date.now;
  try {
    Date.now = () => T;
    for (let i = 0; i < 7; i++) await sinHora();
    Date.now = () => T + 11 * S;
    for (let i = 0; i < 7; i++) await sinHora();
    assert.deepEqual(textos(), []);
    await sinHora();
    assert.deepEqual(textos(), [AVISO("342")]);
  } finally {
    Date.now = reloj;
  }
});

test("antiflood: la segunda vez es la advertencia de .advertir, a nombre de Claudia", async () => {
  const C = "af-advertencia@g.us";
  const ANA = "351@lid";
  const gente = grupo(C, [ANA, "Ana"]);

  await rafaga(C, ANA, 0, { participants: gente });
  assert.deepEqual(textos(), [AVISO("351")]);
  assert.equal(F.advertenciasDe(ANA, C), 0, "el aviso no es una advertencia");

  globalThis.enviados = [];
  await rafaga(C, ANA, 5 * 60, { participants: gente });
  assert.deepEqual(globalThis.enviados, [{ chat: C, msg: { text: txt.advertirSuccess(ANA, MOTIVO, 1, 3), mentions: [ANA] } }]);
  assert.equal(A.motivoDeFlood(), MOTIVO);
  assert.equal(F.advertenciasDe(ANA, C), 1);
  assert.deepEqual(expulsiones, []);

  // In their record, as given by Claudia, however the names are asked for.
  const renglon = /^• \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} — «flood: 8 mensajes en 10 segundos, después del aviso» \(de Claudia\) ⚠️ vigente$/m;
  for (const text of ["@351", "@351 nombres", "numeros @351"]) {
    const record = await comando(Ant, C, gente, text, ANA);
    assert.match(record, /⚠️ Vigentes: 1\/3 · Anotadas: 1/, text);
    assert.match(record, renglon, text);
  }

  // With the bot's LID not known yet, in her name all the same (as lib/partidos.js signs what the bot opens).
  const BETO = "352@lid";
  F.initDataDB({ chat: C, sender: BETO, senderJid: "", pushName: "Beto" });
  const sinLid = { ...conexion.client, user: { ...conexion.client.user, lid: undefined } };
  await rafaga(C, BETO, 0, { client: sinLid });
  await rafaga(C, BETO, 60, { client: sinLid });
  assert.deepEqual([F.antecedentesDe(ANA, C).ultimas[0].dadoPor, F.antecedentesDe(BETO, C).ultimas[0].dadoPor], [BOT, "claudia"]);

  // Again within the ten minutes: the second one, and it's one a moderator can take away like any other.
  globalThis.enviados = [];
  await rafaga(C, ANA, 9 * 60, { participants: gente });
  assert.deepEqual(textos(), [txt.advertirSuccess(ANA, MOTIVO, 2, 3)]);
  assert.equal(F.advertenciasDe(ANA, C), 2);
});

test("antiflood: con dos advertencias de un moderador, primero el aviso y después la tercera lo saca", async () => {
  const C = "af-tercera@g.us";
  const ANA = "361@lid";
  const NUMERO = "59899000361@s.whatsapp.net";
  // The group lists Ana by her number: that's the id WhatsApp takes for removing her, not her LID.
  F.initDataDB({ chat: C, sender: MOD, senderJid: "", pushName: "Mod" });
  F.initDataDB({ chat: C, sender: ANA, senderJid: NUMERO, pushName: "Ana" });
  const gente = [
    { id: NUMERO, lid: ANA, admin: null },
    { id: MOD, admin: "admin" },
    { id: BOT, admin: "admin" },
  ];
  await comando(Warn, C, gente, "@361 spam", ANA);
  await comando(Warn, C, gente, "@361 insultos", ANA);
  assert.equal(F.advertenciasDe(ANA, C), 2);
  const deAna = (segundo) => mensaje(C, ANA, segundo, { senderJid: NUMERO });

  globalThis.enviados = [];
  for (let i = 0; i < 8; i++) await llega(deAna(i), { participants: gente });
  assert.deepEqual(textos(), [AVISO("361")], "primero el aviso, tenga las que tenga");
  assert.equal(F.advertenciasDe(ANA, C), 2);
  assert.deepEqual(expulsiones, []);

  globalThis.enviados = [];
  for (let i = 0; i < 8; i++) await llega(deAna(60 + i), { participants: gente });
  assert.deepEqual(globalThis.enviados, [{ chat: C, msg: { text: concordar(txt.advertirKick(ANA), generoDe(ANA)), mentions: [ANA] } }]);
  assert.deepEqual(expulsiones, [{ chat: C, ids: [NUMERO], accion: "remove" }], "por el id con que el grupo la lista");
  assert.equal(F.advertenciasDe(ANA, C), 0, "afuera, la cuenta vuelve a cero");
  const record = await comando(Ant, C, gente, "@361", ANA);
  assert.match(record, /«flood: 8 mensajes en 10 segundos, después del aviso» \(de Claudia\) 🚪 con esta llegó a 3 y quedó afuera del grupo/);
  assert.match(record, /Anotadas: 3 · Expulsiones: 1/);

  // What she had sent before leaving still arrives: it brings nothing.
  globalThis.enviados = [];
  for (let i = 0; i < 8; i++) await llega(deAna(68 + i), { participants: gente });
  assert.deepEqual([textos(), expulsiones.length, F.advertenciasDe(ANA, C)], [[], 1, 0]);
});

test("antiflood: si WhatsApp no deja expulsar, queda como con .advertir, y la próxima vez lo intenta de nuevo", async () => {
  const C = "af-403@g.us";
  const ANA = "371@lid";
  const gente = grupo(C, [ANA, "Ana"]);
  F.setAdvertencias(ANA, C, 2);
  statusExpulsion = "403";

  await rafaga(C, ANA, 0, { participants: gente });
  globalThis.enviados = [];
  await rafaga(C, ANA, 60, { participants: gente });
  assert.deepEqual(textos(), [concordar(txt.advertirKick(ANA), generoDe(ANA)), "No me dejaron echarlo (error 403). Le quedan anotadas las 3 advertencias."]);
  assert.deepEqual(expulsiones, [{ chat: C, ids: [ANA], accion: "remove" }]);
  assert.equal(F.advertenciasDe(ANA, C), 3);

  // Still in the group and at it: not left uncounted as someone removed would be.
  statusExpulsion = "200";
  globalThis.enviados = [];
  await rafaga(C, ANA, 70, { participants: gente });
  assert.deepEqual(textos(), [concordar(txt.advertirKick(ANA), generoDe(ANA))]);
  assert.equal(expulsiones.length, 2);
  assert.equal(F.advertenciasDe(ANA, C), 0);
});

test("antiflood: no espera el envío, y una ráfaga mientras sale el aviso o la expulsión no sube otro escalón ni saca dos veces", async () => {
  const C = "af-encurso@g.us";
  const ANA = "381@lid";
  const gente = grupo(C, [ANA, "Ana"]);
  // A client whose texts wait at a gate, as they wait their turn in the bot (lib/envios.js).
  let abrir;
  let puerta = new Promise((r) => (abrir = r));
  const citados = [];
  const client = { ...conexion.client, sendText: async (...a) => (await puerta, citados.push(a[2]), conexion.client.sendText(...a)) };
  const sinEsperar = (m) => Hook.before(m, { client, participants: gente, isMod: false, isOwner: false, isBotAdmin: true, chat: { antiFlood: 1 } });

  for (let i = 0; i < 7; i++) await sinEsperar(mensaje(C, ANA, i));
  // The eighth sets the notice going and is done: its own message isn't held behind the send.
  const octavo = sinEsperar(mensaje(C, ANA, 7)).then(() => "listo");
  assert.equal(await Promise.race([octavo, esperar(50).then(() => "esperando el envío")]), "listo");
  const aviso = Hook.enCurso;
  for (let i = 0; i < 24; i++) await sinEsperar(mensaje(C, ANA, 8 + (i % 2)));
  assert.equal(Hook.enCurso, aviso, "24 más con el aviso en camino: ningún otro paso");
  assert.deepEqual(textos(), []);
  abrir();
  await aviso;
  assert.deepEqual(textos(), [AVISO("381")]);

  // The third warning, removing her: the rest of the burst neither warns again nor removes her twice.
  F.setAdvertencias(ANA, C, 2);
  globalThis.enviados = [];
  puerta = new Promise((r) => (abrir = r));
  for (let i = 0; i < 8; i++) await sinEsperar(mensaje(C, ANA, 20 + i));
  const salida = Hook.enCurso;
  assert.notEqual(salida, aviso, "otros ocho: el siguiente escalón");
  for (let i = 0; i < 24; i++) await sinEsperar(mensaje(C, ANA, 28 + (i % 2)));
  assert.equal(Hook.enCurso, salida);
  assert.deepEqual([textos(), expulsiones], [[], []], "todavía esperando su turno");
  abrir();
  await salida;
  assert.deepEqual(textos(), [concordar(txt.advertirKick(ANA), generoDe(ANA))]);
  assert.deepEqual(expulsiones, [{ chat: C, ids: [ANA], accion: "remove" }]);
  assert.equal(F.advertenciasDe(ANA, C), 0);
  // Neither text quotes a message: the one that set them off is one among eight.
  assert.deepEqual(citados, [null, null]);
});

// A moderator's .adv may be removing them at that very moment: the anti-flood's warning finds the removal under way
// (lib/advertencias.js), announces nothing, and takes them for removed.
test("antiflood: si la advertencia de un moderador ya lo está sacando, no lo anuncia de nuevo ni le cuenta lo que sigue llegando", async () => {
  const C = "af-saliendo@g.us";
  const ANA = "401@lid";
  const gente = grupo(C, [ANA, "Ana"]);
  await rafaga(C, ANA, 0, { participants: gente });
  F.setAdvertencias(ANA, C, 2);
  const anuncios = () => textos().filter((t) => /SERÁS ELIMINAD/.test(t)).length;
  // WhatsApp takes its time to answer the removal.
  const responder = conexion.client.groupParticipantsUpdate;
  let contestar;
  const espera = new Promise((r) => (contestar = r));
  conexion.client.groupParticipantsUpdate = async (...a) => (await espera, responder(...a));
  try {
    // The moderator's third warning (what .adv gives): announced, and waiting for WhatsApp.
    const delModerador = darAdvertencia(conexion.client, C, ANA, { motivo: "flood", dadoPor: MOD, expulsarA: ANA });
    assert.equal(anuncios(), 1);
    // The flood goes on meanwhile, and the anti-flood's own warning comes due: it doesn't announce it again, and it
    // isn't left waiting for WhatsApp either.
    for (let i = 0; i < 8; i++) await Hook.before(mensaje(C, ANA, 60 + i), { client: conexion.client, participants: gente, isMod: false, isOwner: false, isBotAdmin: true, chat: { antiFlood: 1 } });
    assert.notEqual(await pronto(Hook.enCurso), SIGUE, "la del anti-flood no queda esperando la expulsión");
    assert.equal(anuncios(), 1, "ni la anuncia de nuevo");
    contestar();
    assert.deepEqual(await delModerador, { advertencias: 3, expulsion: { ok: true, status: "200" } });
  } finally {
    conexion.client.groupParticipantsUpdate = responder;
  }
  assert.deepEqual([expulsiones.length, F.advertenciasDe(ANA, C)], [1, 0]);
  // And what she had sent before leaving brings nothing: no warning to someone who's gone.
  globalThis.enviados = [];
  await rafaga(C, ANA, 70, { participants: gente });
  assert.deepEqual([textos(), F.advertenciasDe(ANA, C), expulsiones.length], [[], 0, 1]);
});

test("antiflood: si el aviso no se pudo mandar, no cuenta como dicho", async () => {
  const C = "af-sin-envio@g.us";
  const ANA = "391@lid";
  grupo(C, [ANA, "Ana"]);
  const error = console.error;
  const errores = [];
  console.error = (...a) => errores.push(a.join(" "));
  try {
    const roto = { ...conexion.client, sendText: async () => Promise.reject(new Error("sin conexión")) };
    await rafaga(C, ANA, 0, { client: roto });
    assert.equal(errores.length, 1);
    assert.match(errores[0], /^\[antiflood\] ERROR: Error: sin conexión/);
  } finally {
    console.error = error;
  }
  await rafaga(C, ANA, 60);
  assert.deepEqual(textos(), [AVISO("391")], "la próxima es el aviso, no una advertencia");
  assert.equal(F.advertenciasDe(ANA, C), 0);
});

// ---------- what tells about it ----------

test("consistencia: el menú, el manual y el README dicen el límite del código, y preguntar por el flood trae el manual", async () => {
  assert.equal(A.limiteEnPalabras(), "8 mensajes en 10 segundos");
  const M = await import("../lib/menu.js");
  const config = M.seccionesDelMenu(".").find((s) => s.clave === "config").lineas;
  assert.match(config, /^▸ \.antiflood 🌊 – `A quien manda 8 mensajes en 10 segundos sin ser admin ni moderador le pide que afloje y, si sigue, le pone una advertencia \(a la tercera, afuera\)\. No borra nada\.`$/m);
  const { MANUAL, conocimientoPara } = await import("../lib/manual-claudia.js");
  const minutos = A.ANTIFLOOD.MEMORIA_MS / MIN;
  assert.ok(MANUAL.includes(`o .antiflood, que a quien no es admin ni moderador y manda ${A.limiteEnPalabras()} primero le pide que afloje y, si lo vuelve a hacer en los ${minutos} minutos siguientes, le pone una advertencia como las de .advertir (a la tercera queda afuera); no borra nada, un álbum de fotos cuenta como un solo mensaje, y también viene apagada)`));
  const readme = fs.readFileSync(path.join(RAIZ, "README.md"), "utf8");
  assert.ok(readme.includes(`\`.antiflood\` (a quien manda ${A.limiteEnPalabras()} le avisa y, si sigue, lo advierte)`));
  // Asked about it, Claudia has the manual in front of her: the warning's reason says "flood".
  for (const pregunta of ["che claudia, ¿qué es eso del flood?", "¿cómo prendo el antiflood?"]) assert.ok(conocimientoPara(pregunta).includes(MANUAL), pregunta);
  assert.ok(!conocimientoPara("qué lindo día para ir a la rambla").includes(MANUAL));
});
