import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import { configuracion } from "../lib/configuracion.js";
import { estadoDe } from "../lib/estado-de-plugins.js";

// How Claudia addresses the people a conversation shows besides whoever she's answering (lib/genero.js): the AI is
// told the gender each one set with .genero, wherever it's given other people's messages. It used to be told only of
// whoever was talking to her, in the chat and in the birthday greeting: in what she says on her own, in .ia, in the
// summaries and in the recap, and about anybody else, she went by the name.
// Gemini is swapped for a fake that keeps what it was asked.

let F, Ge, CC, AutoIA, Ia, V, R, Recap, A, RITMO;
let pedidos = []; // the prompts the AI got
const fetchReal = globalThis.fetch;
const logReal = console.log;
const tipeoReal = {};
const ritmoDeClaudia = estadoDe("ia-ultima-respuesta", () => new Map()); // her pace in each chat (plugins/_auto-ia.js)
const esperaIa = estadoDe("tools-ia", () => new Map()); // .ia's wait in each chat (plugins/tools-ia.js)

// With the digits a real id has: a mention of fewer than five isn't read as one (lib/menciones.js).
const [ANA, BETO, CARO, DANI, OTRA_ANA, EVA] = ["7000001@lid", "7000002@lid", "7000003@lid", "7000004@lid", "7000005@lid", "7000006@lid"];
const NUMERO_DE_ANA = "59899000701@s.whatsapp.net";
const NOMBRES = { [ANA]: "Ana", [BETO]: "Beto", [CARO]: "Caro", [DANI]: "Dani", [OTRA_ANA]: "Ana", [EVA]: "Eva" };
const LINEA = (quienes, donde = "que aparecen ahí") => `De las personas ${donde}, anotaron su género: ${quienes}. Respetalo cuando les hables o hables de ellas; con las demás, guiate por el nombre.`;
const P = (id, nombre = NOMBRES[id]) => ({ id, nombre });

before(async () => {
  ({ F } = await prepararBase("genero-charla"));
  configuracion.geminiApiKey = "clave";
  ({ RITMO } = await import("../lib/ritmo.js"));
  for (const k of ["TIPEO_MIN_MS", "TIPEO_MAX_MS", "TIPEO_POR_LETRA_MS"]) tipeoReal[k] = RITMO[k];
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0 }); // no "typing..." wait
  console.log = () => {}; // the AI module and the glances narrate what they do
  // One answer that every caller takes: the chat's classification, the glance's decision, and plain text for the rest.
  globalThis.fetch = async (url, opciones) => {
    pedidos.push(JSON.parse(opciones.body).contents[0].parts.at(-1).text);
    const texto = JSON.stringify({ comando: "ninguno", respuesta: "Dale.", motivo: "nada", accion: "nada", reacciones: [], mensaje: 0, texto: "" });
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
  };
  Ge = await import("../lib/genero.js");
  CC = await import("../lib/contexto-chat.js");
  AutoIA = (await import("../plugins/_auto-ia.js")).default;
  Ia = (await import("../plugins/tools-ia.js")).default;
  V = await import("../lib/vistazos.js");
  R = await import("../lib/resumen.js");
  Recap = await import("../lib/recap.js");
  A = await import("../lib/actividad.js");
  V._dep.esperar = async () => {};
  V._dep.random = () => 0.5;
  // Everybody the bot knows, Ana by her number too. Ana and Dani are women, Beto a man; Caro, the other Ana and Eva
  // set nothing.
  for (const [lid, pushName] of Object.entries(NOMBRES)) F.initDataDB({ chat: "genero-gente@g.us", sender: lid, senderJid: lid === ANA ? NUMERO_DE_ANA : "", pushName });
  F.updateUser(ANA, { genero: "mujer" });
  F.updateUser(DANI, { genero: "mujer" });
  F.updateUser(BETO, { genero: "hombre" });
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  Object.assign(RITMO, tipeoReal);
});
beforeEach(() => {
  pedidos = [];
});

// What was said in a chat before, as the memory keeps it: [who, text], oldest first, a minute apart.
function charlar(chat, mensajes, hasta = Date.now()) {
  mensajes.forEach(([quien, texto], i) => CC.recordarMensaje(chat, NOMBRES[quien], texto, false, { id: `${chat}-${i}`, usuario: quien, participant: quien, fecha: hasta - (mensajes.length - i) * 60 * 1000 }));
}

test("el trato de quienes aparecen: quién anotó qué, por el nombre con que se lo ve, y nada de quien no anotó", () => {
  assert.equal(Ge.tratoDeQuienesAparecen([]), "");
  assert.equal(Ge.tratoDeQuienesAparecen(null), "");
  assert.equal(Ge.tratoDeQuienesAparecen([P(CARO), P(EVA)]), "", "nadie anotó nada");
  assert.equal(Ge.tratoDeQuienesAparecen([P(ANA)]), LINEA("Ana (mujer)"));
  assert.equal(Ge.tratoDeQuienesAparecen([P(BETO), P(CARO), P(ANA)]), LINEA("Beto (hombre) y Ana (mujer)"), "en el orden en que aparecen, sin Caro");
  assert.equal(Ge.tratoDeQuienesAparecen([P(ANA), P(BETO), P(ANA), P(DANI), P(BETO)]), LINEA("Ana (mujer), Beto (hombre) y Dani (mujer)"), "cada una una vez");
  // By the name the prompt shows them with, whatever their own.
  assert.equal(Ge.tratoDeQuienesAparecen([P(BETO, "Betito")]), LINEA("Betito (hombre)"));
  // By either of their ids.
  assert.equal(Ge.tratoDeQuienesAparecen([P(NUMERO_DE_ANA, "Ana")]), LINEA("Ana (mujer)"));
  assert.equal(Ge.tratoDeQuienesAparecen([P(ANA)], { donde: "que nombra la pregunta" }), LINEA("Ana (mujer)", "que nombra la pregunta"));
  // Without an id or a name there's nobody to tell about, and it doesn't count as someone who set nothing.
  assert.equal(Ge.tratoDeQuienesAparecen([P(null, "Ana"), P(ANA, ""), P(ANA)]), LINEA("Ana (mujer)"));
});

// The lines of a prompt say "Ana: …" and nothing else: with two of them, what one set can't be told of the other.
test("el trato de quienes aparecen: un nombre que comparten dos personas se dice solo si las dos anotaron lo mismo", () => {
  assert.equal(Ge.tratoDeQuienesAparecen([P(ANA), P(OTRA_ANA)]), "", "la otra Ana no anotó nada");
  assert.equal(Ge.tratoDeQuienesAparecen([P(OTRA_ANA), P(ANA), P(BETO)]), LINEA("Beto (hombre)"));
  assert.equal(Ge.tratoDeQuienesAparecen([P(ANA), P("999000@lid", "Ana")]), "", "ni alguien a quien el bot no conoce");
  F.updateUser(OTRA_ANA, { genero: "hombre" });
  try {
    assert.equal(Ge.tratoDeQuienesAparecen([P(ANA), P(OTRA_ANA)]), "");
    F.updateUser(OTRA_ANA, { genero: "mujer" });
    assert.equal(Ge.tratoDeQuienesAparecen([P(ANA), P(OTRA_ANA)]), LINEA("Ana (mujer)"));
  } finally {
    F.updateUser(OTRA_ANA, { genero: "" });
  }
});

test("el trato de quienes aparecen: sin quien el prompt ya distingue, por cualquiera de sus dos ids", () => {
  const gente = [P(ANA), P(BETO), P(DANI)];
  assert.equal(Ge.tratoDeQuienesAparecen(gente, { menos: [ANA] }), LINEA("Beto (hombre) y Dani (mujer)"));
  assert.equal(Ge.tratoDeQuienesAparecen(gente, { menos: [NUMERO_DE_ANA, undefined] }), LINEA("Beto (hombre) y Dani (mujer)"));
  assert.equal(Ge.tratoDeQuienesAparecen([P(NUMERO_DE_ANA, "Ana"), P(BETO)], { menos: [ANA] }), LINEA("Beto (hombre)"));
  assert.equal(Ge.tratoDeQuienesAparecen([P(ANA)], { menos: [ANA] }), "");
  // Leaving her out doesn't leave out the other Ana, who still keeps that name from being told.
  assert.equal(Ge.tratoDeQuienesAparecen([P(ANA), P(OTRA_ANA), P(BETO)], { menos: [BETO] }), "");
});

test("el trato de una charla guardada: quien escribió cada mensaje, sin los de Claudia", () => {
  const chat = "genero-guardada@g.us";
  charlar(chat, [[BETO, "che, ¿salimos el sábado?"], [CARO, "yo no puedo"], [ANA, "yo sí"]]);
  CC.recordarMensaje(chat, "Claudia", "pasenla lindo", true, { id: "BOT1" });
  CC.recordarMensaje(chat, "Dani", "mensaje sin autor guardado", false, { id: "SIN-AUTOR" });
  const entradas = CC.entradasDeContexto(chat);
  assert.equal(entradas.length, 5);
  assert.equal(Ge.tratoDeLaCharla(entradas), LINEA("Beto (hombre) y Ana (mujer)"));
  assert.equal(Ge.tratoDeLaCharla(entradas, { menos: [ANA], donde: "que aparecen en la charla" }), LINEA("Beto (hombre)", "que aparecen en la charla"));
  assert.equal(Ge.tratoDeLaCharla([]), "");
  assert.equal(Ge.tratoDeLaCharla(undefined), "");
  // By the name each message is stored with, which is the one the prompt shows: a nickname, here.
  assert.equal(Ge.tratoDeLaCharla([{ usuario: BETO, nombre: "Betito", texto: "buenas" }]), LINEA("Betito (hombre)"));
  // Hers aside even when one is kept with an author.
  assert.equal(Ge.tratoDeLaCharla([{ esBot: true, usuario: BETO, nombre: "Claudia", texto: "dale" }]), "");
  // The entries are the ones the context's text is made of: the same lines, up to the message being answered.
  assert.equal(CC.textoContexto(chat).split("\n").length, 5);
  assert.match(CC.textoContexto(chat), /\n- Ana: yo sí\n- Claudia \(vos\): pasenla lindo\n- Dani: mensaje sin autor guardado$/);
  assert.deepEqual(CC.entradasDeContexto(chat, `${chat}-2`).map((e) => e.texto), ["che, ¿salimos el sábado?", "yo no puedo"]);
  assert.equal(CC.textoContexto(chat, `${chat}-2`), "- Beto: che, ¿salimos el sábado?\n- Caro: yo no puedo");
  assert.equal(CC.textoContexto("genero-sin-nada@g.us"), "");
});

// Talking to Claudia: her prompt already told how to address whoever is talking to her.
async function hablarle(chat, sender, texto, { mentionedJid = [], id = null } = {}) {
  ritmoDeClaudia.delete(chat); // she answers once every 20 s per group
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const m = { chat, isGroup: true, sender, senderJid: sender === ANA ? NUMERO_DE_ANA : "", pushName: NOMBRES[sender], text: texto, mentionedJid, quoted: null, ...(id && { key: { id } }) };
  await AutoIA.before(m, { client, participants: [], isBotAdmin: true, isOwner: false, isAdmin: false, isMod: false, user: {}, chat: { mentions: 1 } });
  assert.equal(pedidos.length, 1, "le preguntó a la IA");
  return pedidos.pop();
}

test("charlando: le llega el trato de quienes escribieron antes y de quien se menciona, además del de quien le habla", async () => {
  const chat = "genero-charla@g.us";
  charlar(chat, [[BETO, "che, ¿salimos el sábado?"], [CARO, "yo no puedo"], [ANA, "yo sí, re va"]]);
  const prompt = await hablarle(chat, ANA, `claudia, ¿le avisamos a @${DANI.split("@")[0]}?`, { mentionedJid: [DANI] });
  assert.match(prompt, /Ana es mujer: tratala en femenino\./);
  assert.ok(prompt.includes(LINEA("Beto (hombre) y Dani (mujer)", "que aparecen en la charla")), prompt);
  assert.match(prompt, /Mensaje de Ana: "claudia, ¿le avisamos a @Dani\?"/, "con el nombre con que la IA la ve");
  // Who's talking to her isn't told twice, and nobody who set nothing is told at all.
  assert.equal(prompt.match(/anotaron su género/g).length, 1);
  assert.doesNotMatch(prompt, /Ana \(mujer\)|Caro \(/);

  // Asked by someone who set nothing: the others' still goes.
  const deCaro = await hablarle(chat, CARO, "claudia, ¿qué hacemos?");
  assert.doesNotMatch(deCaro, /tratal[ao] en/);
  assert.ok(deCaro.includes(LINEA("Beto (hombre) y Ana (mujer)", "que aparecen en la charla")), deCaro);

  // Only who wrote before the message she answers: what came in after it, while she was getting to it, isn't above.
  const cruzada = "genero-charla-cruzada@g.us";
  charlar(cruzada, [[BETO, "¿quién trae el hielo?"]]);
  CC.recordarMensaje(cruzada, "Caro", "claudia, ¿quién trae el hielo?", false, { id: "LA-PREGUNTA", usuario: CARO });
  CC.recordarMensaje(cruzada, "Dani", "yo llevo", false, { id: "DESPUES", usuario: DANI });
  const aTiempo = await hablarle(cruzada, CARO, "claudia, ¿quién trae el hielo?", { id: "LA-PREGUNTA" });
  assert.ok(aTiempo.includes(LINEA("Beto (hombre)", "que aparecen en la charla")), aTiempo);

  // With nobody who set anything in sight, nothing is added.
  const solas = "genero-charla-sin@g.us";
  charlar(solas, [[CARO, "hola"], [EVA, "buenas"]]);
  assert.doesNotMatch(await hablarle(solas, EVA, "claudia, ¿cómo va?"), /anotaron su género|tratal[ao] en/);
});

test(".ia: le llega el trato de quien pregunta y el de quien nombra la pregunta", async () => {
  const preguntar = async (sender, text, mentionedJid = []) => {
    const chat = "genero-ia@g.us";
    esperaIa.delete(chat); // one question every 20 s per chat
    const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
    await Ia.run({ chat, isGroup: true, sender, senderJid: sender === ANA ? NUMERO_DE_ANA : "", mentionedJid }, { client, text });
    assert.equal(pedidos.length, 1, text);
    return pedidos.pop();
  };
  assert.equal(await preguntar(CARO, "¿cuánto es 2 + 2?"), "¿cuánto es 2 + 2?", "sin nada anotado, la pregunta como vino");
  assert.equal(await preguntar(ANA, "¿cuánto es 2 + 2?"), "¿cuánto es 2 + 2?\n\n(Aparte, solo para vos, no lo muestres: Quien te pregunta es mujer: tratala en femenino.)");
  assert.equal(await preguntar(BETO, "¿cuánto es 2 + 2?"), "¿cuánto es 2 + 2?\n\n(Aparte, solo para vos, no lo muestres: Quien te pregunta es hombre: tratalo en masculino.)");
  assert.equal(
    await preguntar(CARO, `decile algo lindo a @${DANI.split("@")[0]} y a @${EVA.split("@")[0]}`, [DANI, EVA]),
    `decile algo lindo a @Dani y a @Eva\n\n(Aparte, solo para vos, no lo muestres: ${LINEA("Dani (mujer)", "que nombra la pregunta")})`,
  );
  // Whoever asks and names themselves is told once, as whoever asks.
  assert.equal(
    await preguntar(ANA, `¿qué pensás de @${ANA.split("@")[0]} y de @${BETO.split("@")[0]}?`, [ANA, BETO]),
    `¿qué pensás de @Ana y de @Beto?\n\n(Aparte, solo para vos, no lo muestres: Quien te pregunta es mujer: tratala en femenino. ${LINEA("Beto (hombre)", "que nombra la pregunta")})`,
  );
});

// What she does on her own (lib/vistazos.js): nobody is talking to her, so nobody's was told.
test("la iniciativa: en lo que lee por su cuenta le llega el trato de quienes escribieron", async () => {
  const AHORA = new Date(2026, 8, 24, 15, 0).getTime();
  const chat = "genero-iniciativa@g.us";
  F.initDataDB({ chat, sender: ANA, senderJid: NUMERO_DE_ANA, pushName: "Ana" });
  V.activarIniciativa(chat, AHORA);
  // Dani only shows in what she had already read, which goes as context: hers is told too.
  charlar(chat, [[DANI, "¿alguien vio el partido?"], [CARO, "yo no"]], AHORA - 30 * 60 * 1000);
  F.guardarEstadoIniciativa(chat, { ultimoVistazo: AHORA - 20 * 60 * 1000 });
  charlar(chat, [[ANA, "che, ¿vieron el partido de anoche?"], [BETO, "sí, un desastre el arbitraje"], [CARO, "yo me dormí en el primer tiempo"], [ANA, "jaja típico"], [BETO, "el domingo hay otro"]], AHORA);
  const client = { user: { lid: "bot@lid", id: "bot@s.whatsapp.net" }, chats: { [chat]: { subject: "Prueba" } }, sendPresenceUpdate: async () => {}, sendMessage: async () => ({ key: { id: "BOT" } }), sendText: async () => ({ key: { id: "BOT" } }) };
  await V.hacerVistazo(client, chat, { ahora: AHORA });
  assert.equal(pedidos.length, 1);
  assert.match(pedidos[0], /Lo último que ya habías leído[^\n]*\n- Dani \([^)]*\): ¿alguien vio el partido\?\n- Caro/);
  assert.match(pedidos[0], /Lo que te perdiste, del más viejo al más nuevo/);
  assert.ok(pedidos[0].includes(`\n\n${LINEA("Dani (mujer), Ana (mujer) y Beto (hombre)")}\n\n`), pedidos[0]);

  // The prompt takes it as it's given, after the lines it's about; without it, as before.
  const base = { grupo: "Prueba", ahora: AHORA, estado: {}, lectura: { previos: [], nuevos: [], numerados: [], omitidos: 0 }, permisos: { maxReacciones: 1, puedeHablar: true, puedeSticker: 0 }, propiasHoy: [], memoria: "MEMORIA DEL GRUPO" };
  const con = V.armarPrompt({ ...base, trato: "EL TRATO" });
  assert.ok(con.indexOf("Lo que te perdiste") < con.indexOf("EL TRATO") && con.indexOf("EL TRATO") < con.indexOf("MEMORIA DEL GRUPO"));
  assert.equal(V.armarPrompt(base), con.replace("EL TRATO\n\n", ""));
});

test(".resumen: con los mensajes va el trato de quienes aparecen en ellos", async () => {
  const chat = "genero-resumen@g.us";
  const Resumen = (await import("../plugins/resumen.js")).default;
  const pedir = async () => {
    R.resumenesGuardados.delete(chat);
    R.ultimoResumen.delete(chat);
    await Resumen.run({ chat, isGroup: true, sender: CARO }, { client: { ...clienteFalso(), sendPresenceUpdate: async () => {} }, args: [] });
    return pedidos.splice(0);
  };
  charlar(chat, [[ANA, "me anoté en el torneo de truco"], [BETO, "yo llevo las cartas"], [CARO, "yo miro nomás"], [ANA, "dale"], [BETO, "listo"], [DANI, "¿a qué hora?"]]);
  const [unico, ...mas] = await pedir();
  assert.equal(mas.length, 0);
  assert.ok(unico.includes(`- Dani: ¿a qué hora?\n\n${LINEA("Ana (mujer), Beto (hombre) y Dani (mujer)")}\n\n(Instrucción para vos, no la muestres: hacé un resumen`), unico);

  // In parts: each part with the people in it, and the one that puts them together with everybody's.
  const reales = { ...R.RESUMENES };
  CC.contextoChat.delete(chat);
  charlar(chat, [[ANA, `primera parte ${"bla ".repeat(40)}`], [CARO, `sigue la primera ${"bla ".repeat(40)}`], [BETO, `segunda parte ${"bla ".repeat(40)}`], [CARO, `sigue la segunda ${"bla ".repeat(40)}`], [EVA, "chau"], [EVA, "ahora sí"]]);
  R.RESUMENES.MAX_CARACTERES = 700; // two of the long ones fit in a part, three don't
  try {
    const partes = await pedir();
    assert.equal(partes.length, 3, "dos partes y la que las junta");
    assert.ok(partes[0].includes(`\n\n${LINEA("Ana (mujer)")}\n\n(Instrucción para vos, no la muestres: es un borrador`), partes[0]);
    assert.ok(partes[1].includes(`\n\n${LINEA("Beto (hombre)")}\n\n(Instrucción para vos, no la muestres: es un borrador`), partes[1]);
    assert.ok(partes[2].includes(`\n\n${LINEA("Ana (mujer) y Beto (hombre)")}\n\n(Instrucción para vos, no la muestres: hacé un resumen`), partes[2]);
  } finally {
    Object.assign(R.RESUMENES, reales);
  }

  // Nobody who set anything: the prompt as it was.
  CC.contextoChat.delete(chat);
  charlar(chat, [[CARO, "hola"], [EVA, "buenas"], [CARO, "¿todo bien?"], [EVA, "todo bien"], [CARO, "me alegro"], [EVA, "igualmente"]]);
  const [sinNadie] = await pedir();
  assert.doesNotMatch(sinNadie, /anotaron su género/);
  assert.ok(sinNadie.includes("- Eva: igualmente\n\n(Instrucción para vos, no la muestres: hacé un resumen"), sinNadie);
});

test("el recap: la frase de lo más comentado se pide con el trato de quienes escribieron", async () => {
  const chat = "genero-recap@g.us";
  F.initDataDB({ chat, sender: ANA, senderJid: NUMERO_DE_ANA, pushName: "Ana" });
  F.sumarMensajeDiario(chat, ANA, A.claveDia());
  // Dani wrote the first ten of 160: the AI gets the last 150, and hers isn't told of messages it doesn't get.
  for (let i = 0; i < 10; i++) CC.recordarMensaje(chat, "Dani", `mensaje viejo ${i}`, false, { id: `D${i}`, usuario: DANI });
  for (let i = 0; i < 150; i++) CC.recordarMensaje(chat, i % 2 ? "Beto" : "Caro", `mensaje ${i} de la semana`, false, { id: `R${i}`, usuario: i % 2 ? BETO : CARO });
  const recap = await Recap.armarRecap(chat);
  assert.match(recap.texto, /🗣️ Lo más comentado: /);
  assert.equal(pedidos.length, 1);
  assert.doesNotMatch(pedidos[0], /mensaje viejo/);
  assert.ok(pedidos[0].includes(`- Beto: mensaje 149 de la semana\n\n${LINEA("Beto (hombre)")}\n\n(Instrucción para vos, no la muestres: decí en UNA sola frase`), pedidos[0]);

  // Nobody who set anything: the prompt as it was.
  const otro = "genero-recap-sin@g.us";
  F.initDataDB({ chat: otro, sender: CARO, senderJid: "", pushName: "Caro" });
  F.sumarMensajeDiario(otro, CARO, A.claveDia());
  for (let i = 0; i < 30; i++) CC.recordarMensaje(otro, "Caro", `mensaje ${i} de la semana`, false, { id: `S${i}`, usuario: CARO });
  pedidos = [];
  await Recap.armarRecap(otro);
  assert.ok(pedidos[0].includes("- Caro: mensaje 29 de la semana\n\n(Instrucción para vos, no la muestres: decí en UNA sola frase"), pedidos[0]);
});
