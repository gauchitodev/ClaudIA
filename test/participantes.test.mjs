import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prepararBase, esperar, nodosQue } from "./helpers.mjs";
import { numeroReciclado, unaLid, unNumero } from "./identidad-escenarios.mjs";

// What changes for the bot when a group's participants do (lib/participantes.js), as main.js hands it each event. It
// lived inline in main.js, and the tests read main.js's text instead: they passed with a cleanup commented out, or with
// the group taken away from the cleanups, and broke when a variable was renamed.

const DIA = 24 * 60 * 60 * 1000;
let F, CG, Cv, CC, I, P;
let grupos = {}; // chat -> what WhatsApp says of the group when the bot asks for it; a chat not here fails
let demora = 0;
before(async () => {
  ({ F } = await prepararBase("participantes"));
  globalThis.txt = (await import("../lib/strings.js")).default;
  globalThis.client.groupMetadata = async (chat) => {
    if (demora) await esperar(demora);
    if (!grupos[chat]) throw new Error("WhatsApp no contestó");
    return { id: chat, subject: "Grupo", announce: false, ...grupos[chat], participants: grupos[chat].participants.map((p) => ({ ...p })) };
  };
  CG = await import("../lib/cache-grupos.js");
  Cv = await import("../lib/compraventa.js");
  CC = await import("../lib/contexto-chat.js");
  I = await import("../lib/inactivos.js");
  P = await import("../lib/participantes.js");
});
beforeEach(() => {
  grupos = {};
  demora = 0;
  globalThis.enviados = [];
});

const cliente = () => globalThis.client;
const yo = (admin = "admin") => ({ id: cliente().user.lid, admin });
const cambio = (chat, action, participants) => P.alCambiarParticipantes(cliente(), { id: chat, action, participants });
// With the console quiet: a group WhatsApp doesn't answer for is logged.
async function callado(fn) {
  const errorReal = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = errorReal;
  }
}

// As of when they left, though the copy of the group asked for then takes a while.
test("quien se va del grupo pierde su rol del bot, sus publicaciones y sus alertas", async () => {
  const chat = "participantes-salida@g.us";
  const [L, N] = [unaLid(700), unNumero(700)];
  F.setRolGrupo(chat, L, "mod");
  const venta = Cv.publicar(chat, L, "vendo", "bici $ 3.000").numero;
  assert.ok(Cv.gestionarAlerta(chat, L, ["heladera"]).ok);
  grupos[chat] = { participants: [{ id: unaLid(701), admin: "admin" }, yo()] };
  demora = 300;
  const antes = Date.now();
  await cambio(chat, "remove", [{ id: L, phoneNumber: N, admin: null }]);
  const publicacion = F.getPublicacion(chat, venta);
  assert.deepEqual([F.rolGrupo(chat, L), publicacion.estado, F.alertasDe(chat, L)], [null, "cerrada", []]);
  assert.ok(publicacion.actualizada - antes < 200, `dada de baja cuando se fue (${publicacion.actualizada - antes} ms después)`);
});

// Whoever has a number now leaves with it alone, and the LID the database has for it is whoever had it before, whom
// the group lists with another number: they keep their role and their posts, and whoever left loses theirs, under the
// LID the group knew them by when the event doesn't bring it. By the copy from before (ultimaCopia), however old, and
// the one asked for after: the copy at hand there was none of 5 minutes after the last one, nor after reconnecting, and
// whoever had the number lost both. The copy from before may be older than the number changing hands: whoever the new
// one still lists is still in the group. Failing WhatsApp, the copy from before as it is.
test("al irse con su número solo quien lo tiene ahora, el que lo tuvo antes no pierde su rol ni sus ventas, aunque el bot no tenga una copia vigente del grupo", async () => {
  const salir = async (n, { antes, prepararCopia, contesta = true }) => {
    const chat = `participantes-reciclado-${n}@g.us`;
    const { X, VIEJO, NUEVO } = numeroReciclado(n);
    const [Y, ADMIN] = [unNumero(n + 1), { id: unaLid(n + 2), admin: "admin" }];
    const ventas = {};
    for (const quien of [VIEJO, NUEVO]) {
      F.setRolGrupo(chat, quien, "mod");
      ventas[quien] = Cv.publicar(chat, quien, "vendo", "bici $ 3.000").numero;
    }
    grupos[chat] = { participants: [...antes({ X, Y, VIEJO, NUEVO }), ADMIN, yo()] };
    await prepararCopia(chat);
    // After the departure, as WhatsApp says it now: VIEJO with the number they have now.
    grupos[chat] = { participants: [{ id: Y, lid: VIEJO, admin: null }, ADMIN, yo()] };
    if (!contesta) delete grupos[chat];
    await callado(() => cambio(chat, "remove", [{ id: X, admin: null }]));
    const de = (quien) => [F.rolGrupo(chat, quien), F.getPublicacion(chat, ventas[quien]).estado];
    return { viejo: de(VIEJO), nuevo: de(NUEVO) };
  };
  const reconectar = async (chat) => {
    await CG.metadataDe(cliente(), chat);
    CG.vaciar();
  };
  const vencer = (chat) => CG.metadataDe(cliente(), chat, { ahora: Date.now() - CG.CACHE_GRUPOS.VIDA_MS - 1000 });
  const sinSuLid = ({ X, Y, VIEJO }) => [{ id: Y, lid: VIEJO, admin: null }, { id: X, admin: null }];
  const conSuLid = ({ X, Y, VIEJO, NUEVO }) => [{ id: Y, lid: VIEJO, admin: null }, { id: X, lid: NUEVO, admin: null }];
  const antesDelCambio = ({ X, VIEJO }) => [{ id: X, lid: VIEJO, admin: null }];
  const visto = {
    reconectado: (await salir(710, { antes: sinSuLid, prepararCopia: reconectar })).viejo,
    vencida: await salir(713, { antes: conSuLid, prepararCopia: vencer }),
    sinWhatsApp: await salir(716, { antes: conSuLid, prepararCopia: reconectar, contesta: false }),
    deAntesDelCambio: (await salir(719, { antes: antesDelCambio, prepararCopia: reconectar })).viejo,
  };
  const [sigue, sale] = [["mod", "activa"], [null, "cerrada"]];
  assert.deepEqual(visto, { reconectado: sigue, vencida: { viejo: sigue, nuevo: sale }, sinWhatsApp: { viejo: sigue, nuevo: sale }, deAntesDelCambio: sigue });
});

// Someone comes in: noted right away, under the ids the event brings, for .resumen (recordarIngreso) and for .inactivos
// (anotarIngresos). Not under the LID the database has for their number when the group lists that one with another
// number, by the copy the bot last had, however old: with the copy at hand only, there was none after reconnecting, and
// whoever had the number before looked like they had just come in.
test("quien entra queda anotado en el momento, bajo las ids que trae, aunque el bot se haya reconectado", async () => {
  const chat = "participantes-entrada@g.us";
  const { X, VIEJO } = numeroReciclado(730);
  grupos[chat] = { participants: [{ id: unNumero(731), lid: VIEJO, admin: null }, { id: unaLid(732), admin: "admin" }, yo()] };
  await CG.metadataDe(cliente(), chat); // the copy from before
  CG.vaciar();
  grupos[chat].participants.push({ id: X, admin: null });
  demora = 300;
  const antes = Date.now();
  await cambio(chat, "add", [{ id: X, admin: null }]);
  const presencia = F.presenciaDelGrupo(chat);
  assert.deepEqual(presencia.map((r) => r.usuario), [X], "bajo el número que trajo, no bajo la LID que la base tiene para él");
  assert.ok(presencia[0].ingreso - antes < 200, `cuando entró, sin esperar al grupo (${presencia[0].ingreso - antes} ms después)`);
  assert.ok(CC.ingresoDe(chat, X) >= antes && CC.ingresoDe(chat, X) - antes < 200, ".resumen sabe cuándo entró");
  assert.equal(CC.ingresoDe(chat, VIEJO), 0, "VIEJO, a quien el grupo lista con otro número, no entró");
});

// Coming back is a fresh start (registrarIngresoGrupo): noted right away, a message of theirs while the copy of the
// group is on its way doesn't find the warning from before they left, and isn't paid a "Volvió" for it.
test("quien vuelve a entrar y escribe enseguida no cobra un «Volvió» por el aviso de antes de irse", async () => {
  const chat = "participantes-vuelve@g.us";
  const [L, ADMIN] = [unaLid(735), unaLid(736)];
  F.registrarMensajeGrupo(chat, [ADMIN], Date.now() - 40 * DIA);
  F.registrarMensajeGrupo(chat, [L], Date.now() - 30 * DIA);
  F.marcarAvisoInactivo(chat, [L], Date.now() - 4 * DIA);
  grupos[chat] = { participants: [{ id: L, admin: null }, { id: ADMIN, admin: "admin" }, yo()] };
  demora = 300;
  const entra = cambio(chat, "add", [{ id: L, admin: null }]);
  await I.registrarPresencia(cliente(), { chat, sender: L, senderJid: "" }, grupos[chat].participants);
  await entra;
  assert.deepEqual(globalThis.enviados.map((e) => e.msg?.text || "").filter((t) => /Volvió/.test(t)), []);
});

// The bot coming into a group or leaving it: .inactivos starts counting over (reiniciarSiEsElBot), and the copy of the
// group asked for then says whether it's closed. Started over after that copy, the count dropped the closing, and in a
// closed group .inactivos tagged everyone. A promotion of the bot is neither coming nor going.
test("cuando el bot entra a un grupo, la cuenta de .inactivos empieza de nuevo, y si está cerrado queda anotado", async () => {
  // Two groups: two forced copies of one group within REFRESCO_MIN_MS are one query (lib/cache-grupos.js).
  const [chat, otro] = ["participantes-bot-entra@g.us", "participantes-bot-asciende@g.us"];
  const OTRO = unaLid(740);
  const avisado = (c) => F.presenciaDelGrupo(c).find((r) => r.usuario === OTRO)?.avisado ?? null;
  for (const c of [chat, otro]) {
    F.registrarMensajeGrupo(c, [OTRO], Date.now() - 40 * DIA);
    F.marcarAvisoInactivo(c, [OTRO], Date.now() - 4 * DIA);
    grupos[c] = { announce: true, participants: [{ id: OTRO, admin: "admin" }, yo(null)] };
  }
  await cambio(otro, "promote", [yo()]);
  assert.ok(avisado(otro), "un ascenso del bot no reinicia nada");
  await cambio(chat, "add", [yo(null)]);
  assert.deepEqual([avisado(chat), F.cierresGrupo(chat).map((c) => c.hasta)], [null, [null]], "los avisos de antes no valen, y el grupo sigue cerrado");
  F.marcarAvisoInactivo(chat, [OTRO], Date.now() - 4 * DIA);
  await cambio(chat, "remove", [yo(null)]);
  assert.equal(avisado(chat), null, "al irse, también");
});

// A promotion or a demotion asks for the group again: without it the admin list stays as the copy at hand has it, and
// the bot doesn't find out it was made admin (or someone else was) until the copy runs out.
test("un ascenso vuelve a pedir el grupo, y el bot se entera de quién es admin", async () => {
  const chat = "participantes-ascenso@g.us";
  const A = unaLid(745);
  grupos[chat] = { participants: [{ id: A, admin: null }, yo(null)] };
  await CG.metadataDe(cliente(), chat);
  grupos[chat].participants[0].admin = "admin";
  await cambio(chat, "promote", [{ id: A, admin: "admin" }]);
  assert.equal(CG.enCache(chat).participants.find((p) => p.id === A).admin, "admin");
});

// Whoever comes in on the blacklist is removed, by the group as WhatsApp says it is then: the bot made admin since the
// copy at hand can remove them. The rest get the group rules.
test("a quien entra y está en la lista negra lo saco con el grupo de ahora, y a los demás les mando las reglas", async () => {
  const chat = "participantes-lista-negra@g.us";
  db.prepare("INSERT OR IGNORE INTO chats (remoteJid) VALUES (?)").run(chat);
  F.updateChat(chat, { reglas: "Nada de spam." });
  const [ANOTADO, OTRO] = [unaLid(750), unaLid(751)];
  F.addToBlacklist(unNumero(750), "spam", unNumero(752), chat, ANOTADO);
  grupos[chat] = { participants: [{ id: unaLid(752), admin: "superadmin" }, yo(null)] };
  await CG.metadataDe(cliente(), chat); // the copy at hand: the bot isn't an admin
  grupos[chat].participants = [{ id: unaLid(752), admin: "superadmin" }, { id: ANOTADO, admin: null }, { id: OTRO, admin: null }, yo()];
  const expulsiones = [];
  cliente().groupParticipantsUpdate = async (c, ids, accion) => {
    expulsiones.push({ c, ids, accion });
    return ids.map((jid) => ({ status: "200", jid }));
  };
  try {
    await cambio(chat, "add", [{ id: ANOTADO, admin: null }, { id: OTRO, admin: null }]);
  } finally {
    delete cliente().groupParticipantsUpdate;
  }
  const bienvenida = globalThis.enviados.find((e) => /Bienvenid@s/.test(e.msg?.text || ""))?.msg;
  assert.deepEqual([expulsiones, bienvenida?.mentions], [[{ c: chat, ids: [ANOTADO], accion: "remove" }], [OTRO]]);
});

// main.js hands each event over as it comes, with the client, from the handler of the event itself. Read as code
// (nodosQue): commented out, it isn't there, and the event's name in the handler doesn't matter.
test("main.js le pasa a lib/participantes.js cada cambio de participantes, con el cliente", async () => {
  const LLAMADA = 'CallExpression[callee.property.name="on"][arguments.0.value="group-participants.update"] CallExpression[callee.name="alCambiarParticipantes"]';
  const loPasa = async (codigo) =>
    (await nodosQue(LLAMADA, codigo)).some((llamada) => {
      let manejador = llamada.parent;
      while (manejador && !manejador.type.includes("Function")) manejador = manejador.parent;
      const [quien, evento] = llamada.arguments;
      return manejador?.parent.arguments?.[1] === manejador && quien?.name === "client" && evento?.type === "Identifier" && evento.name === manejador.params[0]?.name;
    });
  const en = (manejador, evento = "group-participants.update") => `client.ev.on("${evento}", ${manejador});`;
  const formas = [
    en("(evento) => alCambiarParticipantes(client, evento)"),
    en("async (e) => {\n  await alCambiarParticipantes(client, e);\n}"),
    `// ${en("(evento) => alCambiarParticipantes(client, evento)")}`,
    en("(evento) => {\n  // alCambiarParticipantes(client, evento);\n}"),
    en("(evento) => alCambiarParticipantes(client)"),
    en("(evento) => setTimeout(() => alCambiarParticipantes(client, evento), 0)"),
    en("(evento) => alCambiarParticipantes(client, evento)", "messages.upsert"),
  ];
  assert.deepEqual(await Promise.all(formas.map(loPasa)), [true, true, false, false, false, false, false]);
  assert.ok(await loPasa(fs.readFileSync(new URL("../main.js", import.meta.url), "utf8")), "main.js no le pasa el evento a alCambiarParticipantes");
});
