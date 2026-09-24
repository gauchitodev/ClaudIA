import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, esperar } from "./helpers.mjs";
import strings from "../lib/strings.js";

// Asking Claudia in plain words ("claudia, llamá a @111") runs .llamar or .tagall straight from the _auto-ia hook, past
// the dispatcher's checks. So the hook has to apply the same rule the command has: .tagall for moderators, .llamar
// only for admins. Gemini is swapped for a canned classification.

let AutoIA, Llamar, Tagall, RITMO;
let clasificacion; // what "Gemini" answers
let consultasIA = 0; // how many times Claudia asked the AI
const fetchReal = globalThis.fetch;
const logReal = console.log;
const tipeoReal = {};

before(async () => {
  await prepararBase("auto-ia");
  globalThis.txt = strings;
  globalThis.geminiApiKey = "clave";
  ({ RITMO } = await import("../lib/ritmo.js"));
  for (const k of ["TIPEO_MIN_MS", "TIPEO_MAX_MS", "TIPEO_POR_LETRA_MS"]) tipeoReal[k] = RITMO[k];
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0 }); // no "typing..." wait
  console.log = () => {}; // the AI module narrates which model answered
  globalThis.fetch = async () => {
    consultasIA++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(clasificacion) }] } }] }) };
  };
  AutoIA = (await import("../plugins/_auto-ia.js")).default;
  Llamar = (await import("../plugins/grupo-llamar.js")).default;
  Tagall = (await import("../plugins/grupo-tagall.js")).default;
  globalThis.plugins = { "grupo-llamar.js": Llamar, "grupo-tagall.js": Tagall };
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  Object.assign(RITMO, tipeoReal);
});

const C = "ia@g.us";
const participants = [{ id: "111@lid", admin: null }, { id: "555@lid", admin: null }];
async function pedir(texto, rango) {
  globalThis.autoIaCooldown.delete(C); // she answers once every 20 s per group
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const m = { chat: C, isGroup: true, sender: "555@lid", pushName: "Ana", text: texto, mentionedJid: ["111@lid"], quoted: null };
  await AutoIA.before(m, { client, participants, isBotAdmin: true, isOwner: false, user: {}, chat: { mentions: 1 }, ...rango });
  await esperar(30); // .llamar's first mention goes out on a timer
  return { client, m, textos: globalThis.enviados.map((e) => e.msg?.text || "") };
}
const MODERADOR = { isAdmin: false, isMod: true };
const ADMIN = { isAdmin: true, isMod: true };

test("pedido a Claudia: un moderador no consigue un .llamar", async () => {
  clasificacion = { comando: "llamar", respuesta: "¡Dale, ya lo llamo!" };
  const { textos } = await pedir("claudia llamá a @111", MODERADOR);
  assert.deepEqual(textos, ["Che, eso lo puede pedir solo un admin del grupo."]);
});

test("pedido a Claudia: un admin sí, y un moderador sigue pudiendo pedir un tagall", async () => {
  clasificacion = { comando: "llamar", respuesta: "¡Dale, ya lo llamo!" };
  const { client, m, textos } = await pedir("claudia llamá a @111", ADMIN);
  await Llamar.run(m, { client, text: "", command: "cancelar" }); // the other nine mentions aren't needed
  assert.deepEqual(textos, ["¡Dale, ya lo llamo!", "@111"]);

  clasificacion = { comando: "tagall", respuesta: "Ahí van todos." };
  const tagall = await pedir("claudia arrobá a todos", MODERADOR);
  assert.equal(tagall.textos[0], "Ahí van todos.");
  assert.match(tagall.textos[1], /@111 @555/, "la mención a todos salió");
});

// ---------- replies to a game's message ----------
// Trivia, riddles, flags and unscramble are answered by quoting the bot's question, and so is today's question. Claudia
// took each answer as spoken to her, with the game's question in her prompt: she chatted back to every one, and
// sometimes gave the right answer away.

async function citando(id, texto) {
  globalThis.autoIaCooldown.delete(C);
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const m = { chat: C, isGroup: true, sender: "555@lid", pushName: "Ana", text: texto, mentionedJid: [], quoted: { id, fromMe: true, text: "🎓 *Trivia* ¿Cuál es la capital de Japón?" } };
  const antes = consultasIA;
  await AutoIA.before(m, { client, participants, isBotAdmin: true, isOwner: false, user: {}, chat: {}, ...MODERADOR });
  return { consultas: consultasIA - antes, textos: globalThis.enviados.map((e) => e.msg?.text || "") };
}

test("pedido a Claudia: lo que contesta cuenta como charla para la iniciativa", async () => {
  const F = await import("../database-functions.js");
  clasificacion = { comando: "ninguno", respuesta: "¡Hola, Ana!" };
  const antes = F.intervencionesDesde(C, 0).length;
  await pedir("hola claudia", MODERADOR);
  const filas = F.intervencionesDesde(C, 0);
  assert.equal(filas.length, antes + 1);
  assert.deepEqual([filas.at(-1).tipo, filas.at(-1).texto], ["charla", "¡Hola, Ana!"]);
  assert.match(filas.at(-1).mensajeId, /^MSG\d+$/, "con el id de lo que mandó");
  assert.equal(globalThis.contextoChat.get(C).at(-1).id, filas.at(-1).mensajeId, "y su memoria corta lo tiene");
});

test("memoria corta: guarda quién dijo qué con su id, no toma las reacciones como mensajes y olvida lo borrado", async () => {
  const B = "buffer@g.us";
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const base = { chat: B, isGroup: true, sender: "555@lid", pushName: "Ana", mentionedJid: [], quoted: null };
  const correr = (m) => AutoIA.before({ ...base, ...m }, { client, participants, isBotAdmin: true, isOwner: false, user: {}, chat: { charla: 0 }, ...MODERADOR });

  await correr({ text: "hola a todos", key: { id: "M1", participant: "555@lid" } });
  const entrada = globalThis.contextoChat.get(B).at(-1);
  assert.deepEqual([entrada.texto, entrada.id, entrada.usuario, entrada.participant], ["hola a todos", "M1", "555@lid", "555@lid"]);

  await correr({ text: "😂", mtype: "reactionMessage", key: { id: "R1" } });
  assert.equal(globalThis.contextoChat.get(B).length, 1, "una reacción no es algo que alguien dijo");

  await correr({ text: "", message: { protocolMessage: { type: 0, key: { id: "M1" } } } });
  assert.equal(globalThis.contextoChat.get(B).length, 0, "lo que alguien borró se olvida");
});

test("pedido a Claudia: responder a la pregunta de un juego no le habla a ella", async () => {
  const Tr = await import("../lib/trivia.js");
  const J = await import("../lib/juego-rapido.js");
  const F = await import("../database-functions.js");
  const { claveDia } = await import("../lib/actividad.js");
  clasificacion = { comando: "ninguno", respuesta: "¡Es la C, Tokio!" };

  Tr.abrirRonda(C, { tipo: "trivia", pregunta: { pregunta: "¿Capital de Japón?", opciones: ["Osaka", "Kioto", "Tokio", "Nara"], correcta: "c" }, mensajeId: "TRIVIA-1", segundos: 30, client: clienteFalso() });
  assert.deepEqual(await citando("TRIVIA-1", "c"), { consultas: 0, textos: [] }, "una respuesta a la trivia");
  assert.deepEqual(await citando("TRIVIA-1", "claudia es la c?"), { consultas: 0, textos: [] }, "ni nombrándola: no sirve para sacar la respuesta");
  Tr.cerrarRonda(C);

  const juegos = {};
  await J.abrirJuego(juegos, C, { juego: {}, enviar: async () => ({ key: { id: "ACERTIJO-1" } }), alVencer: () => {} });
  clearTimeout(juegos[C].timeout);
  assert.deepEqual(await citando("ACERTIJO-1", "la sombra"), { consultas: 0, textos: [] }, "una respuesta al acertijo");

  F.guardarPreguntaDia(C, claveDia(), "¿Playa o campo?", "PREGUNTA-DIA-1");
  assert.deepEqual(await citando("PREGUNTA-DIA-1", "playa, obvio"), { consultas: 0, textos: [] }, "una respuesta a la pregunta del día");

  // Replying to anything else she said still talks to her.
  const otra = await citando("OTRO-MENSAJE", "jaja sí");
  assert.equal(otra.consultas, 1);
  assert.deepEqual(otra.textos, ["¡Es la C, Tokio!"]);
});
