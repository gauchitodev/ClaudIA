// How Claudia answers what's said to her (plugins/_auto-ia.js): with words, as always, or, where it fits, with a
// reaction or with nothing. She used to answer every message that named her: people talking about her among
// themselves got her cutting in, and after a "gracias" or a "jaja" the last word was always hers. What she's offered is
// decided in code, by how she's addressed, and whoever she lets go by gets words if they insist
// (lib/turnos-de-claudia.js).
// Gemini is swapped for canned answers, and her clock and her timers are the test's: nothing waits for real.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import { configuracion } from "../lib/configuracion.js";
import { estadoDe } from "../lib/estado-de-plugins.js";

let F, IA, AutoIA, CC, I, T, E, A, MP, RITMO;
const cuerpos = []; // every request "Gemini" got
let respuesta; // what it answers: an object, or a function that gives one (something that happens while she thinks)
let ahora; // her clock
const relojes = []; // the turns she left for later: { fn, ms }
const fetchReal = globalThis.fetch;
const logReal = console.log;
const ritmoReal = {};
const depReal = {};
const ritmoDeClaudia = estadoDe("ia-ultima-respuesta", () => new Map()); // when she last started to talk, per chat

const S = 1000;
const BOT = "200000000000009@lid";
const [ANA, BETO, CARO] = ["7200001@lid", "7200002@lid", "7200003@lid"];
const NUMERO_DE_ANA = "59899000721@s.whatsapp.net";
const NOMBRES = { [ANA]: "Ana", [BETO]: "Beto", [CARO]: "Caro" };
// The heart she reacts with carries a variation selector; the AI may write it without.
const CORAZON_SOLO = String.fromCodePoint(0x2764);
const CORAZON = CORAZON_SOLO + String.fromCodePoint(0xfe0f);

before(async () => {
  ({ F } = await prepararBase("formas-de-contestar"));
  configuracion.geminiApiKey = "clave";
  ({ RITMO } = await import("../lib/ritmo.js"));
  for (const k of ["TIPEO_MIN_MS", "TIPEO_MAX_MS", "TIPEO_POR_LETRA_MS", "MIN_ENTRE_MENSAJES_MS"]) ritmoReal[k] = RITMO[k];
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0, MIN_ENTRE_MENSAJES_MS: 0 });
  console.log = () => {}; // the AI module narrates which model answered
  globalThis.fetch = async (url, opciones) => {
    cuerpos.push(JSON.parse(opciones.body));
    const r = typeof respuesta === "function" ? await respuesta() : respuesta;
    // A string goes out as it is, the way a web search answers; anything else, as the JSON her chat asks for.
    return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: typeof r === "string" ? r : JSON.stringify(r) }] } }] }) };
  };
  IA = await import("../plugins/_auto-ia.js");
  AutoIA = IA.default;
  CC = await import("../lib/contexto-chat.js");
  I = await import("../lib/iniciativa.js");
  T = await import("../lib/turnos-de-claudia.js");
  E = await import("../lib/envios.js");
  A = await import("../lib/actividad.js");
  MP = await import("../lib/memoria-persona.js");
  Object.assign(depReal, IA._dep);
  IA._dep.ahora = () => ahora;
  IA._dep.programar = (fn, ms) => {
    const reloj = { fn, ms };
    relojes.push(reloj);
    return reloj;
  };
  IA._dep.cancelar = (reloj) => {
    if (relojes.includes(reloj)) relojes.splice(relojes.indexOf(reloj), 1);
  };
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  Object.assign(RITMO, ritmoReal);
  Object.assign(IA._dep, depReal);
});
beforeEach(() => {
  T.reiniciarTurnos();
  ritmoDeClaudia.clear();
  relojes.length = 0;
  cuerpos.length = 0;
  ahora = Date.now();
  respuesta = { comando: "ninguno", respuesta: "Dale." };
});

let grupos = 0;
// A group of the test's own, with the people the bot knows in it.
function grupo() {
  const chat = `formas-${++grupos}@g.us`;
  for (const [lid, pushName] of Object.entries(NOMBRES)) F.initDataDB({ chat, sender: lid, senderJid: lid === ANA ? NUMERO_DE_ANA : "", pushName });
  return chat;
}
// A socket that writes down what went out. sinReacciones: the reactions' queue drops hers (lib/envios.js).
function cliente() {
  const client = { ...clienteFalso(), user: { lid: BOT, id: "59800000009@s.whatsapp.net", jid: "59800000009@s.whatsapp.net" }, salidas: [], presencias: [], sinReacciones: false };
  client.sendPresenceUpdate = async (estado) => void client.presencias.push(estado);
  client.sendMessage = async (chat, contenido) => {
    client.salidas.push(contenido);
    return client.sinReacciones && contenido.react ? undefined : { key: { id: `MSG${client.salidas.length}` } };
  };
  client.sendText = async (chat, text) => client.sendMessage(chat, { text });
  return client;
}
let ids = 0;
const mensaje = (chat, texto, { sender = ANA, ...extra } = {}) => ({
  chat,
  isGroup: true,
  sender,
  senderJid: sender === ANA ? NUMERO_DE_ANA : "",
  pushName: NOMBRES[sender] || "Ana",
  text: texto,
  mentionedJid: [],
  quoted: null,
  key: { remoteJid: chat, fromMe: false, id: `F${++ids}`, participant: sender },
  ...extra,
});
const suyo = (texto = "yo miro desde el banco") => ({ fromMe: true, id: `SUYO${++ids}`, text: texto });
const llega = (client, m, permisos = {}) => AutoIA.before(m, { client, participants: [], isBotAdmin: true, isOwner: false, isAdmin: false, isMod: false, user: {}, chat: {}, ...permisos });
const esquema = () => cuerpos.at(-1).generationConfig.responseSchema;
const formas = () => esquema().properties.forma?.enum ?? null;
const prompt = () => cuerpos.at(-1).contents[0].parts.at(-1).text;
const textos = (client) => client.salidas.map((s) => s.text).filter((t) => t !== undefined);
const registro = (chat) => F.intervencionesDesde(chat, 0).map((f) => [f.tipo, f.objetivoId, f.objetivoUsuario, f.texto]);
// The turn she left for later comes: its timer fires, and it's gone.
const vence = () => relojes.shift().fn();
const NADA = { comando: "ninguno", forma: "nada", respuesta: "" };
const reaccion = (emoji) => ({ comando: "ninguno", forma: "reaccion", emoji, respuesta: "" });

// ---------- what she's offered ----------

test("qué se le ofrece además de palabras depende de cómo le hablan", async () => {
  const chat = grupo();
  const client = cliente();
  // Each one alone, with her turn free: she answers "Dale." to all of them.
  const ofrecido = async (m, permisos) => {
    ritmoDeClaudia.delete(m.chat);
    client.presencias.length = 0;
    await llega(client, m, permisos);
    return { formas: formas(), escribeAntes: client.presencias[0] === "composing" };
  };

  // Named by the word alone, they may not be talking to her: anything goes.
  assert.deepEqual(await ofrecido(mensaje(chat, "che, el bot anda lento hoy")), { formas: ["texto", "reaccion", "nada"], escribeAntes: false });
  assert.deepEqual(Object.keys(esquema().properties), ["comando", "argumento", "forma", "emoji", "respuesta", "recordar", "cuando", "reintentar", "buscar", "fuentes", "resumenAudio"], "la forma va antes que la respuesta: decide cómo antes de escribir qué");
  assert.deepEqual(esquema().properties.emoji.enum, I.EMOJIS_INICIATIVA, "sus emojis de siempre, ninguno de los del sistema");
  assert.deepEqual(esquema().required, ["comando", "forma", "respuesta"]);
  assert.match(prompt(), /\n\n\(También solo para vos: en ese mensaje te nombran, pero fijate en el hilo si te hablan a vos[^\n]*o si dudás, poné "texto" y contestá como siempre\.\)$/);

  // A reply to a message of hers is to her: words or a reaction, never nothing.
  assert.deepEqual(await ofrecido(mensaje(chat, "jajaja", { quoted: suyo() })), { formas: ["texto", "reaccion"], escribeAntes: false });
  assert.match(prompt(), /\n\n\(También solo para vos: te responden a un mensaje tuyo, y en "forma" decís cómo seguís[^\n]*\)$/);
  assert.deepEqual((await ofrecido(mensaje(chat, "gracias claudia", { quoted: suyo() }))).formas, ["texto", "reaccion"], "aunque además la nombre");

  // Mentioned with @, she's being talked to: words, with the schema and the prompt as they were, and "typing…" at once.
  assert.deepEqual(await ofrecido(mensaje(chat, `@${BOT.split("@")[0]} ¿a qué hora juega Uruguay?`, { mentionedJid: [BOT] })), { formas: null, escribeAntes: true });
  assert.deepEqual(esquema().required, ["comando", "respuesta"]);
  assert.equal(Object.keys(esquema().properties).includes("emoji"), false);
  assert.doesNotMatch(prompt(), /"forma"|También solo para vos/);
  assert.equal((await ofrecido(mensaje(chat, `bot @${BOT.split("@")[0]} jaja`, { mentionedJid: [BOT], quoted: suyo() }))).formas, null, "arrobada, aunque sea un cierre");

  // In private whoever names her is talking to her.
  assert.deepEqual(await ofrecido(mensaje("7200001@s.whatsapp.net", "claudia, ¿cómo va?", { isGroup: false })), { formas: null, escribeAntes: true });
  // A voice note for her, or an audio she's asked to hear: she listens, and says what she makes of it.
  const audio = { seconds: 3, mimetype: "audio/ogg; codecs=opus", download: async () => Buffer.from("OggS-audio") };
  assert.equal((await ofrecido(mensaje(chat, "", { mtype: "audioMessage", msg: audio, download: audio.download, quoted: suyo("¿cómo andan?") }))).formas, null);
  assert.equal((await ofrecido(mensaje(chat, "claudia, ¿qué dice?", { quoted: { mtype: "audioMessage", fromMe: false, sender: BETO, ...audio } }))).formas, null);
  assert.equal(cuerpos.length, 8, "a todos les preguntó a la IA");
});

test("llamada por su nombre solo, y con varios esperando, contesta con palabras", async () => {
  const chat = grupo();
  const client = cliente();
  // "Claudia" alone waits for its question; the question, which doesn't name her, is for her: nothing else is offered.
  await llega(client, mensaje(chat, "Claudia"));
  assert.deepEqual([cuerpos.length, relojes.map((r) => r.ms)], [0, [T.TURNOS.ESPERA_PREGUNTA_MS]]);
  ahora += 2 * S;
  await llega(client, mensaje(chat, "¿a qué hora juega Uruguay?"));
  assert.deepEqual([cuerpos.length, formas(), relojes.length], [1, null, 0]);

  // Called and left at that, she answers the call; and the question that comes later, with her name nowhere in it,
  // is still for her.
  const llamada = grupo();
  cuerpos.length = 0;
  await llega(client, mensaje(llamada, "hola bot", { sender: BETO }));
  ahora += T.TURNOS.ESPERA_PREGUNTA_MS;
  await vence();
  assert.deepEqual([cuerpos.length, formas(), relojes.length], [1, null, 0], "a quien la llama no lo deja hablando solo");
  ahora += T.TURNOS.PAUSA_MS + S;
  await llega(client, mensaje(llamada, "¿sabés a qué hora abre el museo?", { sender: BETO }));
  assert.deepEqual([cuerpos.length, formas()], [2, null]);

  // Two people name her while she can't answer yet: when her turn comes, somebody among them is owed an answer.
  const otro = grupo();
  ritmoDeClaudia.set(otro, ahora);
  cuerpos.length = 0;
  await llega(client, mensaje(otro, "el bot está lento"));
  await llega(client, mensaje(otro, "sí, el bot anda mal", { sender: BETO }));
  assert.deepEqual([cuerpos.length, relojes.length], [0, 1], "esperan su turno");
  ahora += T.TURNOS.PAUSA_MS + S;
  await vence();
  assert.equal(formas(), null);
  assert.match(prompt(), /Antes de ese mensaje también te escribieron/);

  // One alone that had to wait is still what it was when it came.
  const tercero = grupo();
  ritmoDeClaudia.set(tercero, ahora);
  await llega(client, mensaje(tercero, "el bot está lento"));
  ahora += T.TURNOS.PAUSA_MS + S;
  await vence();
  assert.deepEqual([formas(), relojes.length], [["texto", "reaccion", "nada"], 0]);
});

// ---------- nothing ----------

test("nada: no manda nada, ni «escribiendo…», y su turno vuelve como estaba", async () => {
  const chat = grupo();
  const client = cliente();
  const haceUnMinuto = ahora - 60 * S;
  ritmoDeClaudia.set(chat, haceUnMinuto);
  respuesta = { ...NADA, recordar: "dice que el bot anda lento" };
  await llega(client, mensaje(chat, "che, el bot anda lento hoy"));
  assert.equal(cuerpos.length, 1, "lo leyó: para decidir tiene que preguntar");
  assert.deepEqual(client.salidas, []);
  assert.deepEqual(client.presencias, [], "el grupo no la ve escribir para después no decir nada");
  assert.deepEqual(registro(chat), [["silencio", null, null, ""]], "queda contado, sin de quién era");
  assert.equal((CC.contextoChat.get(chat) || []).some((e) => e.esBot), false);
  assert.equal(ritmoDeClaudia.get(chat), haceUnMinuto, "la pausa no cuenta desde un mensaje que no mandó");
  assert.equal(MP.memoriaDe(ANA, chat), "dice que el bot anda lento", "lo que aprendió leyendo lo guarda igual");
  assert.deepEqual(relojes, []);

  // What she wrote anyway isn't sent, nor an emoji she left there: how she answers is what she chose.
  respuesta = { ...NADA, respuesta: "igual digo algo", emoji: "😂" };
  await llega(client, mensaje(chat, "ese bot es cualquiera", { sender: BETO }));
  assert.deepEqual([client.salidas, registro(chat).map(([tipo]) => tipo)], [[], ["silencio", "silencio"]]);
});

// ---------- a reaction ----------

test("reacción: uno de sus emojis sobre el mensaje, sin texto; si no puede ser, nada", async () => {
  const chat = grupo();
  const client = cliente();
  assert.ok(I.EMOJIS_INICIATIVA.includes(CORAZON) && !I.EMOJIS_INICIATIVA.includes(CORAZON_SOLO));
  const responde = (texto, extra = {}) => mensaje(chat, texto, { quoted: suyo("de nada"), ...extra });

  respuesta = reaccion(CORAZON_SOLO); // as the AI may write it, without the variation selector
  const gracias = responde("gracias");
  await llega(client, gracias);
  assert.deepEqual(client.salidas, [{ react: { text: CORAZON, key: gracias.key } }]);
  assert.deepEqual(client.presencias, []);
  assert.deepEqual(registro(chat), [["reaccion-charla", gracias.key.id, ANA, CORAZON]], "contada aparte de las de sus vistazos, que tienen su tope");
  assert.equal(ritmoDeClaudia.has(chat), false, "una reacción no gasta su turno");
  assert.equal((CC.contextoChat.get(chat) || []).some((e) => e.esBot), false);

  // An emoji that isn't hers (the streak's is the system's), or none: she says nothing.
  const sinReaccion = async (r, m) => {
    const antes = client.salidas.length;
    respuesta = r;
    await llega(client, m);
    return [client.salidas.length - antes, registro(chat).at(-1)[0]];
  };
  assert.deepEqual(await sinReaccion(reaccion("🔥"), responde("jaja", { sender: BETO })), [0, "silencio"]);
  assert.deepEqual(await sinReaccion({ comando: "ninguno", forma: "reaccion", respuesta: "" }, responde("dale", { sender: CARO })), [0, "silencio"]);

  // Not over a reaction of the bot's on that message: WhatsApp keeps one per account, and hers would take its place.
  const otro = grupo();
  const delSistema = { sendMessage: async () => ({ key: { id: "X" } }) };
  E.envolverEnvios(delSistema);
  const conRacha = mensaje(otro, "jajaja", { quoted: suyo() });
  await delSistema.sendMessage(otro, { react: { text: "🔥", key: conRacha.key } });
  respuesta = reaccion("😂");
  await llega(client, conRacha);
  assert.equal(client.salidas.length, 1, "sigue la del sistema");
  assert.deepEqual(registro(otro), [["silencio", null, null, ""]]);

  // The queue dropped it, or WhatsApp said no: it counts as having said nothing, and her turn comes back all the same.
  const tercero = grupo();
  client.sinReacciones = true;
  respuesta = reaccion("👍");
  await llega(client, mensaje(tercero, "ok", { quoted: suyo() }));
  assert.deepEqual([client.salidas.at(-1).react.text, registro(tercero)], ["👍", [["silencio", null, null, ""]]]);
  client.sinReacciones = false;
  const roto = cliente();
  roto.sendMessage = async () => {
    throw new Error("WhatsApp dijo que no");
  };
  await llega(roto, mensaje(tercero, "ok", { sender: BETO, quoted: suyo() }));
  assert.deepEqual([registro(tercero).length, ritmoDeClaudia.has(tercero)], [2, false]);

  // And if .charla went off while she thought, not even a reaction.
  const cuarto = grupo();
  respuesta = () => (F.updateChat(cuarto, { charla: 0 }), reaccion("😂"));
  const antes = client.salidas.length;
  await llega(client, mensaje(cuarto, "jaja", { quoted: suyo() }));
  assert.equal(client.salidas.length, antes);
});

test("emojiPropio: los suyos, con o sin el selector de variación, y ningún otro", () => {
  assert.equal(I.emojiPropio(CORAZON), CORAZON);
  assert.equal(I.emojiPropio(CORAZON_SOLO), CORAZON);
  assert.equal(I.emojiPropio(` 😂${String.fromCodePoint(0xfe0f)} `), "😂");
  for (const e of I.EMOJIS_INICIATIVA) assert.equal(I.emojiPropio(e), e, e);
  for (const otro of ["🔥", "🪙", "✅", "jaja", "😂😂", "", null, undefined, 3]) assert.equal(I.emojiPropio(otro), null, String(otro));
});

// ---------- insisting ----------

test("insistir: a quien dejó pasar, si le habla de nuevo enseguida, le contesta con palabras", async () => {
  const chat = grupo();
  const client = cliente();
  respuesta = NADA;
  await llega(client, mensaje(chat, "el bot es un desastre"));
  assert.deepEqual([formas(), client.salidas], [["texto", "reaccion", "nada"], []]);

  // Thirty seconds later, the same person, by their number alone this time, names her again: words, whatever the AI
  // makes of it.
  ahora += 30 * S;
  respuesta = { ...NADA, respuesta: "acá estoy, ¿qué pasó?" };
  await llega(client, mensaje(chat, "bot, te estoy hablando", { sender: NUMERO_DE_ANA, senderJid: NUMERO_DE_ANA }));
  assert.equal(formas(), null, "ni se le ofrece callarse");
  assert.deepEqual(textos(client), ["acá estoy, ¿qué pasó?"]);

  // Answered, what comes next from them is a message like any other; and after a reaction it's the same as after
  // nothing.
  ahora += 30 * S;
  respuesta = reaccion("👍");
  const cierre = mensaje(chat, "ta, gracias bot");
  await llega(client, cierre);
  assert.deepEqual([formas(), client.salidas.at(-1)], [["texto", "reaccion", "nada"], { react: { text: "👍", key: cierre.key } }]);
  ahora += 10 * S;
  respuesta = { ...NADA, respuesta: "decime" };
  await llega(client, mensaje(chat, "che bot, una cosa más"));
  assert.deepEqual([formas(), textos(client).at(-1)], [null, "decime"]);

  // Somebody else isn't insisting, and past the two minutes neither is the one she let go by.
  ahora += 30 * S;
  respuesta = NADA;
  await llega(client, mensaje(chat, "el bot hoy está raro"));
  const callada = ahora;
  ahora += 5 * S;
  await llega(client, mensaje(chat, "sí, el bot anda mal", { sender: BETO }));
  assert.deepEqual(formas(), ["texto", "reaccion", "nada"], "Beto no insistió: es la primera vez que la nombra");
  ahora = callada + T.TURNOS.INSISTE_MS + S;
  await llega(client, mensaje(chat, "y el bot sigue raro"));
  assert.deepEqual(formas(), ["texto", "reaccion", "nada"]);
  assert.equal(textos(client).length, 2, "en todo eso habló dos veces");

  // The other way around: let go by when the message brought only their number, they insist with their LID alongside.
  const porNumero = grupo();
  respuesta = NADA;
  await llega(client, mensaje(porNumero, "el bot no entiende nada", { sender: NUMERO_DE_ANA, senderJid: NUMERO_DE_ANA }));
  assert.deepEqual(formas(), ["texto", "reaccion", "nada"]);
  ahora += 20 * S;
  respuesta = { ...NADA, respuesta: "a ver, decime" };
  await llega(client, mensaje(porNumero, "bot, es con vos"));
  assert.deepEqual([formas(), textos(client).at(-1)], [null, "a ver, decime"]);
  // And someone whose messages bring no number at all, as in a group that lists people by LID.
  ahora += 30 * S;
  respuesta = NADA;
  await llega(client, mensaje(porNumero, "qué bot más raro", { sender: BETO }));
  assert.deepEqual([formas(), relojes.length], [["texto", "reaccion", "nada"], 0], "sola y en su turno: lo dejó pasar");
  ahora += 20 * S;
  respuesta = { ...NADA, respuesta: "¿raro yo?" };
  await llega(client, mensaje(porNumero, "sí, bot, vos", { sender: BETO }));
  assert.deepEqual([formas(), textos(client).at(-1)], [null, "¿raro yo?"]);
});

// ---------- when there's something to say ----------

test("lo que no se le ofreció, o cuando hay algo que decir, va con palabras", async () => {
  const chat = grupo();
  const client = cliente();
  const dice = async (r, m) => {
    ritmoDeClaudia.delete(chat);
    T.reiniciarTurnos();
    const antes = client.salidas.length;
    respuesta = r;
    await llega(client, m);
    return client.salidas.slice(antes).map((s) => s.text ?? s);
  };
  const alPasar = () => mensaje(chat, "che, el bot anda lento hoy");

  // A model that makes a form up where none was offered (the fallbacks get the schema as text): words.
  assert.deepEqual(await dice({ ...NADA, respuesta: "acá estoy" }, mensaje(chat, `@${BOT.split("@")[0]} ¿estás?`, { mentionedJid: [BOT] })), ["acá estoy"]);
  assert.deepEqual(await dice({ ...NADA, respuesta: "de nada" }, mensaje(chat, "gracias", { quoted: suyo() })), ["de nada"], "a quien le responde no puede no decirle nada");
  assert.deepEqual(await dice({ comando: "ninguno", forma: "silencio", respuesta: "¿qué pasa?" }, alPasar()), ["¿qué pasa?"], "ni una forma que no existe");
  assert.deepEqual(await dice({ comando: "ninguno", respuesta: "todo bien" }, alPasar()), ["todo bien"], "sin forma, como siempre");
  // A command, sources or a retry are things to say, whatever she chose.
  assert.deepEqual(await dice({ ...NADA, comando: "play", argumento: "la cumparsita" }, alPasar()), ["Para eso pedímelo directo con el comando: .play la cumparsita"]);
  assert.deepEqual(await dice({ ...NADA, fuentes: true, respuesta: "lo dije de memoria" }, alPasar()), ["lo dije de memoria"]);
  assert.match((await dice({ ...reaccion("😂"), reintentar: true }, alPasar()))[0], /^No tengo ninguna descarga tuya que haya fallado/);
  // And so is something to look up: what the search found is hers to tell.
  let pedidos = 0;
  assert.deepEqual(await dice(() => (pedidos++ ? "Sí, es verdad: salió ayer." : { ...NADA, buscar: "¿es verdad que cierra el museo?", respuesta: "ni idea" }), alPasar()), ["Sí, es verdad: salió ayer."]);
  assert.deepEqual(registro(chat).map(([tipo]) => tipo), Array(8).fill("charla"), "todo eso fue charla");
});

// ---------- what waited meanwhile ----------

test("lo que quedó esperando mientras leía se atiende apenas decide callarse, no veinte segundos después", async () => {
  const chat = grupo();
  const client = cliente();
  let soltar;
  const leyendo = new Promise((resolve) => (soltar = resolve));
  respuesta = async () => (await leyendo, NADA);
  const alPasar = llega(client, mensaje(chat, "el bot anda lento"));
  // Meanwhile somebody talks to her: it waits for the turn she's in.
  await llega(client, mensaje(chat, `@${BOT.split("@")[0]} ¿a qué hora juega Uruguay?`, { sender: BETO, mentionedJid: [BOT] }));
  assert.deepEqual(relojes.map((r) => r.ms), [T.TURNOS.PAUSA_MS]);
  soltar();
  await alPasar;
  assert.deepEqual(relojes.map((r) => r.ms), [0], "el turno que no usó vuelve, y lo que esperaba va ya");
  respuesta = { comando: "ninguno", respuesta: "¡Hola, Beto!" };
  await vence();
  assert.deepEqual(textos(client), ["¡Hola, Beto!"]);
  assert.equal(formas(), null);
});

// ---------- how often ----------

test(".actividad cuenta cuántas veces contestó, reaccionó o lo dejó pasar cuando la nombraron", () => {
  const chat = grupo();
  const hoy = new Date();
  F.sumarMensajeHora(chat, A.claveDia(hoy), hoy.getHours());
  const anotar = (tipo, n, fecha = hoy.getTime()) => {
    for (let i = 0; i < n; i++) F.registrarIntervencion({ chat, tipo, fecha });
  };
  anotar("charla", 3);
  assert.doesNotMatch(A.textoActividad(chat, hoy).texto, /Cuando la nombraron/, "si contestó siempre, no hay nada que contar");
  anotar("reaccion-charla", 1);
  anotar("silencio", 2);
  anotar("reaccion", 4); // the ones of her glances are the initiative's, not this
  anotar("silencio", 5, new Date(hoy).setHours(0, 0, 0, 0) - 1); // yesterday's
  assert.match(A.textoActividad(chat, hoy).texto, /\n💬 Cuando la nombraron: contestó 3 · reaccionó 1 · dejó pasar 2\n/);
  // And her glances' own count isn't touched by the reactions she gives when named (lib/tacto.js goes by "reaccion").
  assert.equal(F.intervencionesDesde(chat, new Date(hoy).setHours(0, 0, 0, 0)).filter((i) => i.tipo === "reaccion").length, 4);
});
