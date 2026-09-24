import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import strings from "../lib/strings.js";

// Claudia's initiative: the glances (lib/vistazos.js), the feedback (lib/iniciativa.js), the hook and the commands.
// Gemini is swapped for canned decisions; the typing wait, the pause between reactions and the dice are pinned.

let F, I, V, C, E, RITMO, Hook, Iniciativa, OwnerVistazo;
const decisiones = []; // what "Gemini" answers, in order: an object (sent as JSON), a raw string, or 429
const cuerpos = []; // every request sent to "Gemini"
let consultas = 0;
const fetchReal = globalThis.fetch;
const logReal = console.log;
const tipeoReal = {};

before(async () => {
  ({ F } = await prepararBase("iniciativa"));
  globalThis.txt = strings;
  globalThis.geminiApiKey = "clave";
  ({ RITMO } = await import("../lib/ritmo.js"));
  for (const k of ["TIPEO_MIN_MS", "TIPEO_MAX_MS", "TIPEO_POR_LETRA_MS"]) tipeoReal[k] = RITMO[k];
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0 });
  console.log = () => {}; // the glances and the AI module narrate what they do
  globalThis.fetch = async (url, opciones) => {
    consultas++;
    cuerpos.push(JSON.parse(opciones.body));
    const d = decisiones.shift();
    if (d === 429) return { ok: false, status: 429, text: async () => "" };
    const texto = typeof d === "string" ? d : JSON.stringify(d ?? { motivo: "nada", accion: "nada" });
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
  };
  I = await import("../lib/iniciativa.js");
  V = await import("../lib/vistazos.js");
  C = await import("../lib/contexto-chat.js");
  E = await import("../lib/envios.js");
  Hook = (await import("../plugins/_iniciativa.js")).default;
  Iniciativa = (await import("../plugins/iniciativa.js")).default;
  OwnerVistazo = (await import("../plugins/owner-vistazo.js")).default;
  V._dep.esperar = async () => {};
  V._dep.random = () => 0.5;
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  Object.assign(RITMO, tipeoReal);
});

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const AHORA = new Date(2026, 8, 24, 15, 0).getTime();
const CHARLA = [
  ["Ana", "che, ¿vieron el partido de anoche?", 20, "A1"],
  ["Beto", "sí, un desastre el arbitraje", 18, "A2"],
  ["Carla", "yo me dormí en el primer tiempo", 15, "A3"],
  ["Ana", "jaja típico de Carla", 10, "A4"],
  ["Beto", "el domingo hay otro, ¿lo vemos juntos?", 2, "A5"],
];

let grupos = 0;
function nuevoGrupo(ahora = AHORA) {
  const chat = `iniciativa${++grupos}@g.us`;
  F.initDataDB({ chat, sender: "111@lid", senderJid: "111@s.whatsapp.net", pushName: "Ana" });
  V.activarIniciativa(chat, ahora);
  return chat;
}
function charlar(chat, mensajes = CHARLA, ahora = AHORA) {
  for (const [quien, texto, haceMin, id] of mensajes) C.recordarMensaje(chat, quien, texto, false, { id, usuario: `${quien}@lid`, participant: `${quien}@lid`, fecha: ahora - haceMin * MIN });
}
function cliente(chat) {
  const salidas = [];
  const salio = () => ({ key: { id: `BOT${salidas.length}` } });
  return {
    salidas,
    user: { lid: "bot@lid", id: "bot@s.whatsapp.net" },
    chats: { [chat]: { subject: "Prueba" } },
    sendPresenceUpdate: async () => {},
    sendMessage: async (jid, contenido) => {
      salidas.push({ jid, contenido });
      return salio();
    },
    sendText: async (jid, text, quoted) => {
      salidas.push({ jid, contenido: { text }, quoted });
      return salio();
    },
  };
}
const ultimoPrompt = () => cuerpos.at(-1).contents[0].parts[0].text;
const ultimoEsquema = () => cuerpos.at(-1).generationConfig.responseSchema;

// ---------- when she glances ----------

test("agenda: los vistazos caen en las horas despierta y se tiran hacia las horas en que el grupo habla", () => {
  const permitidas = V.horasPermitidas(null);
  assert.deepEqual(permitidas, [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  assert.deepEqual(V.horasPermitidas({ horarioGrupo: "10:00-18:00" }), [10, 11, 12, 13, 14, 15, 16, 17], "y dentro del horario del grupo");

  // Even: about eight a day over fourteen hours, one every 105 minutes; with the dice at the middle, 73 after the
  // 40-minute gap that follows every glance.
  const mediodia = new Date(2026, 8, 24, 12, 0).getTime();
  const t = V.proximoVistazo(mediodia, { random: () => 0.5, permitidas });
  const minutos = (t - mediodia) / MIN;
  assert.ok(minutos > 110 && minutos < 116, `cae a los ${minutos} minutos`);

  const tarde = new Date(2026, 8, 24, 22, 50).getTime();
  const manana = new Date(V.proximoVistazo(tarde, { random: () => 0.5, permitidas }));
  assert.deepEqual([manana.getDate(), manana.getHours()], [25, 10], "de noche no mira: pasa a la mañana siguiente");

  const perfil = Array(24).fill(0);
  perfil[21] = 1000;
  assert.equal(new Date(V.proximoVistazo(mediodia, { perfil, random: () => 0.5, permitidas })).getHours(), 21, "un grupo que habla a las 21 la tiene mirando a las 21");
  assert.equal(V.proximoVistazo(mediodia, { permitidas: [] }), null);
});

// ---------- the glance ----------

test("vistazo: sin nada nuevo no gasta ninguna llamada", async () => {
  const chat = nuevoGrupo();
  const antes = consultas;
  const informe = await V.hacerVistazo(cliente(chat), chat, { ahora: AHORA });
  assert.equal(consultas, antes);
  assert.equal(informe.tacto, "no hay nada nuevo");
  assert.equal(F.estadoIniciativa(chat).ultimoVistazo, AHORA, "queda leído");
});

test("vistazo: reacciona con la key del mensaje guardado", async () => {
  const chat = nuevoGrupo();
  charlar(chat);
  decisiones.push({ motivo: "me causó gracia", reacciones: [{ mensaje: 4, emoji: "😂" }], accion: "nada", mensaje: 0, texto: "" });
  const client = cliente(chat);
  await V.hacerVistazo(client, chat, { ahora: AHORA });

  assert.match(ultimoPrompt(), /\[4\] Ana \(hace 10 min\): jaja típico de Carla/, "le llegan los mensajes numerados, con hace cuánto");
  assert.deepEqual(ultimoEsquema().properties.accion.enum, ["nada", "responder", "comentar"]);
  assert.deepEqual(ultimoEsquema().propertyOrdering[0], "motivo");
  assert.deepEqual(client.salidas, [{ jid: chat, contenido: { react: { text: "😂", key: { remoteJid: chat, fromMe: false, id: "A4", participant: "Ana@lid" } } } }]);
  assert.deepEqual(
    F.intervencionesDesde(chat, 0).map((f) => [f.tipo, f.objetivoId, f.texto, f.motivo]),
    [["reaccion", "A4", "😂", "me causó gracia"]],
  );
  assert.equal(F.estadoIniciativa(chat).ultimoVistazo, AHORA);
});

test("vistazo: responde citando el mensaje, sin arrobar a nadie", async () => {
  const chat = nuevoGrupo();
  charlar(chat);
  decisiones.push({ motivo: "me prendo", reacciones: [], accion: "responder", mensaje: 5, texto: "@59899111222 yo me prendo, llevo el mate" });
  const client = cliente(chat);
  await V.hacerVistazo(client, chat, { ahora: AHORA });

  const salida = client.salidas.at(-1);
  assert.equal(salida.contenido.text, "yo me prendo, llevo el mate");
  assert.deepEqual(salida.quoted, { key: { remoteJid: chat, fromMe: false, id: "A5", participant: "Beto@lid" }, message: { conversation: "el domingo hay otro, ¿lo vemos juntos?" } });
  const fila = F.intervencionesDesde(chat, 0).at(-1);
  assert.deepEqual([fila.tipo, fila.mensajeId, fila.objetivoId, fila.objetivoUsuario], ["respuesta", "BOT1", "A5", "Beto@lid"]);
  const suyo = C.mensajesRecientes(chat, 0).at(-1);
  assert.deepEqual([suyo.esBot, suyo.id, suyo.texto], [true, "BOT1", "yo me prendo, llevo el mate"], "queda en la memoria corta, para la charla");
});

test("vistazo: la IA no puede pasarse de lo que permite el tacto", async () => {
  const chat = nuevoGrupo();
  charlar(chat);
  // Her last message went unanswered: today she only reacts.
  F.registrarIntervencion({ chat, fecha: AHORA - 90 * MIN, tipo: "comentario", mensajeId: "BOTVIEJO", texto: "¿alguien vio la lluvia?" });
  decisiones.push({
    motivo: "todo",
    reacciones: [
      { mensaje: 1, emoji: "😂" },
      { mensaje: 1, emoji: "🤣" }, // the same message twice
      { mensaje: 9, emoji: "😂" }, // doesn't exist
      { mensaje: 2, emoji: "🔥" }, // not hers: it's the streaks'
      { mensaje: 3, emoji: "👍" },
      { mensaje: 4, emoji: "👏" }, // one too many
    ],
    accion: "comentar",
    mensaje: 0,
    texto: "hola a todos",
  });
  const client = cliente(chat);
  await V.hacerVistazo(client, chat, { ahora: AHORA });

  const esquema = ultimoEsquema();
  assert.deepEqual(esquema.properties.accion.enum, ["nada"], "ni se le ofrece escribir");
  assert.equal(esquema.properties.texto, undefined);
  assert.equal(esquema.properties.reacciones.maxItems, 2);
  assert.match(ultimoPrompt(), /"¿alguien vio la lluvia\?" \(hace 1 h 30 min; nadie te dio bola\)/);
  assert.deepEqual(
    client.salidas.map((s) => [s.contenido.react?.key.id, s.contenido.react?.text]),
    [
      ["A1", "😂"],
      ["A3", "👍"],
    ],
  );
});

test("vistazo: si la IA falla o devuelve cualquier cosa, no hace nada y no da nada por leído", async () => {
  const chat = nuevoGrupo();
  charlar(chat);
  const leido = F.estadoIniciativa(chat).ultimoVistazo;

  decisiones.push("esto no es JSON");
  let client = cliente(chat);
  let informe = await V.hacerVistazo(client, chat, { ahora: AHORA });
  assert.equal(informe.error, "JSON roto");
  assert.equal(client.salidas.length, 0);
  assert.equal(F.estadoIniciativa(chat).ultimoVistazo, leido);

  decisiones.push(429, 429, 429); // the three Gemini models out of quota
  client = cliente(chat);
  informe = await V.hacerVistazo(client, chat, { ahora: AHORA });
  globalThis.modeloSinCuotaDesde.clear();
  assert.equal(informe.error, "sin cuota");
  assert.equal(client.salidas.length, 0);
  assert.equal(F.estadoIniciativa(chat).ultimoVistazo, leido);
});

test("vistazo: no reacciona donde ya reaccionó el bot, que le pisaría la reacción", async () => {
  const chat = nuevoGrupo();
  charlar(chat);
  const envuelto = { sendMessage: async () => ({ key: { id: "X" } }) };
  E.envolverEnvios(envuelto);
  await envuelto.sendMessage(chat, { react: { text: "🔥", key: { id: "A2" } } }); // the streak's 🔥
  decisiones.push({ motivo: "x", reacciones: [{ mensaje: 2, emoji: "😂" }], accion: "nada", mensaje: 0, texto: "" });
  const client = cliente(chat);
  await V.hacerVistazo(client, chat, { ahora: AHORA });
  assert.equal(client.salidas.length, 0);
});

test("vistazo: si mientras pensaba ya contestó en la charla, no escribe", async () => {
  const chat = nuevoGrupo();
  charlar(chat);
  decisiones.push({ motivo: "x", reacciones: [], accion: "comentar", mensaje: 0, texto: "qué partido" });
  const client = cliente(chat);
  // Someone named her a moment ago: the chat answered, so her pace says wait.
  globalThis.autoIaCooldown.set(chat, Date.now());
  const informe = await V.hacerVistazo(client, chat, { ahora: AHORA });
  assert.equal(client.salidas.length, 0);
  assert.equal(informe.retenido, true);
});

// ---------- reading the room ----------

test("ambiente: citarla o nombrarla es contestarle, y una reacción también cuenta", () => {
  const chat = nuevoGrupo();
  F.registrarIntervencion({ chat, fecha: AHORA - 30 * MIN, tipo: "comentario", mensajeId: "BOTC1", texto: "uno" });
  assert.equal(I.registrarMensajeDelGrupo({ chat, text: "jaja sí", quoted: { fromMe: true, id: "BOTC1" } }, AHORA), "respondida");
  F.registrarIntervencion({ chat, fecha: AHORA - 5 * MIN, tipo: "respuesta", mensajeId: "BOTC2", texto: "dos" });
  assert.equal(I.registrarMensajeDelGrupo({ chat, text: "Claudia, tenés razón" }, AHORA), "respondida");
  assert.equal(I.registrarMensajeDelGrupo({ chat, text: "qué lindo día" }, AHORA), null, "si no la nombra ni la cita, no es para ella");
  assert.equal(I.registrarReaccionAClaudia(chat, "BOTC2"), true);
  assert.equal(I.registrarReaccionAClaudia(chat, "NO-ES-SUYO"), false);
  assert.deepEqual(Object.fromEntries(F.intervencionesDesde(chat, 0).map((f) => [f.mensajeId, [f.respondida, f.reaccionada]])), { BOTC1: [1, 0], BOTC2: [1, 1] });
});

test("ambiente: una ráfaga de mensajes adelanta el próximo vistazo, una vez", () => {
  const chat = nuevoGrupo();
  F.guardarEstadoIniciativa(chat, { ultimoVistazo: AHORA - HORA, proximoVistazo: AHORA + 2 * HORA });
  V._dep.random = () => 0;
  const resultados = Array.from({ length: 8 }, (_, i) => V.anotarMensaje(chat, AHORA + i * 1000));
  V._dep.random = () => 0.5;
  assert.deepEqual(resultados, [false, false, false, false, false, false, false, true]);
  const e = F.estadoIniciativa(chat);
  assert.deepEqual([e.proximoVistazo, e.motivoProximo], [AHORA + 7000 + MIN, "rafaga"], "un minuto después del octavo mensaje");
  assert.equal(Array.from({ length: 8 }, (_, i) => V.anotarMensaje(chat, AHORA + 10_000 + i * 1000)).some(Boolean), false, "la siguiente ráfaga espera");
});

test("ambiente: el hook anota lo que llega y deja pasar comandos y reacciones", async () => {
  const chat = nuevoGrupo();
  const fila = F.getChat(chat);
  const base = { chat, isGroup: true, message: {}, sender: "222@lid", mtype: "conversation" };
  F.registrarIntervencion({ chat, fecha: AHORA - 5 * MIN, tipo: "comentario", mensajeId: "BOTH1", texto: "uno" });
  const respondida = () => F.intervencionesDesde(chat, 0)[0].respondida;
  await Hook.before({ ...base, text: ".menu claudia", _llegada: AHORA }, { chat: fila });
  await Hook.before({ ...base, text: "claudia 😂", mtype: "reactionMessage", _llegada: AHORA }, { chat: fila });
  assert.equal(respondida(), 0, "un comando o una reacción no le contestan");
  await Hook.before({ ...base, text: "jaja bot", _llegada: AHORA }, { chat: fila });
  assert.equal(respondida(), 1);
});

// ---------- the ticker ----------

test("ticker: lanza el vistazo que toca, re-sortea el vencido y no pisa uno en curso", async () => {
  db.prepare(`UPDATE chats SET iniciativa = 0`).run(); // only this test's group
  const chat = nuevoGrupo();
  const client = cliente(chat);

  F.guardarEstadoIniciativa(chat, { proximoVistazo: AHORA - MIN });
  let lanzados = V.tickVistazos(client, AHORA);
  assert.equal(lanzados.length, 1);
  await Promise.all(lanzados);
  assert.ok(F.estadoIniciativa(chat).proximoVistazo >= AHORA + 40 * MIN, "el siguiente ya quedó sorteado");

  F.guardarEstadoIniciativa(chat, { proximoVistazo: AHORA - 30 * MIN });
  lanzados = V.tickVistazos(client, AHORA);
  assert.equal(lanzados.length, 0, "el bot estuvo caído: no mira tarde");
  assert.ok(F.estadoIniciativa(chat).proximoVistazo > AHORA);

  F.guardarEstadoIniciativa(chat, { proximoVistazo: AHORA - MIN });
  globalThis.vistazosEnCurso.add(chat);
  lanzados = V.tickVistazos(client, AHORA);
  globalThis.vistazosEnCurso.delete(chat);
  assert.equal(lanzados.length, 0);
});

// ---------- the commands ----------

test("comandos: .iniciativa muestra, prende y apaga; .vistazo prueba no toca nada", async () => {
  const chat = "comandos@g.us";
  F.initDataDB({ chat, sender: "111@lid", senderJid: "111@s.whatsapp.net", pushName: "Ana" });
  const client = cliente(chat);
  const m = { chat, isGroup: true, id: "CMD", sender: "111@lid", senderJid: "59899111222@s.whatsapp.net" };
  const ultimo = () => client.salidas.at(-1).contenido.text;

  await Iniciativa.run(m, { client, args: [], isAdmin: false, isOwner: false });
  assert.match(ultimo(), /\*Iniciativa de Claudia\*: apagada/);
  await Iniciativa.run(m, { client, args: ["on"], isAdmin: false, isOwner: false });
  assert.equal(ultimo(), strings.onlyAdmin);
  assert.equal(F.getChat(chat).iniciativa, 0);
  await Iniciativa.run(m, { client, args: ["on"], isAdmin: true, isOwner: false });
  assert.match(ultimo(), /\.iniciativa off lo apaga\./);
  assert.equal(F.getChat(chat).iniciativa, 1);
  assert.ok(F.estadoIniciativa(chat).proximoVistazo > 0);
  await Iniciativa.run(m, { client, args: [], isAdmin: false, isOwner: false });
  assert.match(ultimo(), /prendida\.\n\nHoy: 0 vistazos, 0 mensajes y 0 reacciones por mi cuenta\./);

  // .vistazo prueba asks the AI but sends nothing to the group and changes nothing.
  const ahora = Date.now();
  charlar(chat, CHARLA.map(([quien, texto, haceMin, id]) => [quien, texto, haceMin, `P${id}`]), ahora);
  decisiones.push({ motivo: "para probar", reacciones: [{ mensaje: 1, emoji: "😂" }], accion: "comentar", mensaje: 0, texto: "jaja qué partido" });
  const leido = F.estadoIniciativa(chat).ultimoVistazo;
  const enElGrupo = client.salidas.filter((s) => s.jid === chat).length;
  await OwnerVistazo.run(m, { client, args: ["prueba"] });
  assert.equal(client.salidas.filter((s) => s.jid === chat).length, enElGrupo);
  assert.equal(client.salidas.at(-1).jid, m.senderJid, "el informe va por privado");
  assert.match(ultimo(), /Vistazo de prueba\* en Prueba/);
  assert.match(ultimo(), /habría hecho una reacción y un comentario \(para probar\)/);
  assert.equal(F.estadoIniciativa(chat).ultimoVistazo, leido);

  // .vistazo cita quotes the last message from someone the way a glance would, without the AI.
  await OwnerVistazo.run(m, { client, args: ["cita"] });
  const cita = client.salidas.find((s) => s.contenido.text === "(prueba de cita)");
  assert.equal(cita.quoted.key.id, "PA5");

  await Iniciativa.run(m, { client, args: ["off"], isAdmin: true, isOwner: false });
  assert.equal(F.getChat(chat).iniciativa, 0);
  assert.equal(F.estadoIniciativa(chat).proximoVistazo, 0);
});
