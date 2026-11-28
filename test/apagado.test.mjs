import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prepararBase, ultimoEnviado, fijarSaldo } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// The bot's master switch in a group (.claudia off, plugins/claudia.js) and the door every part of the bot goes through
// (lib/apagado.js): switched off by its admins, or the group banned by an owner (.banchat), the bot reads, does and says
// nothing there. The dispatcher's side is in handle-message.test.mjs, and the sends' in envios.test.mjs.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let F, Ap, Claudia, Pendientes, Participantes, Reacciones, Cache, A, Mines, Rec;
const G = "apagado@g.us";
const ADMIN = "100@lid";
const MIEMBRO = "200@lid";
const LISTADO = "666@lid";
const BOT = { id: "bot@lid", admin: "admin" };

before(async () => {
  ({ F } = await prepararBase("apagado"));
  Ap = await import("../lib/apagado.js");
  Claudia = (await import("../plugins/claudia.js")).default;
  Pendientes = await import("../lib/pendientes.js");
  Participantes = await import("../lib/participantes.js");
  Reacciones = await import("../lib/reacciones.js");
  Cache = await import("../lib/cache-grupos.js");
  A = await import("../lib/actividad.js");
  Mines = await import("../lib/mines.js");
  Rec = await import("../lib/recordatorios.js");
  for (const lid of [ADMIN, MIEMBRO, LISTADO]) F.initDataDB({ chat: G, sender: lid, senderJid: "" });
});

let expulsiones = [];
let miembros = [];
let pedidasDelGrupo = 0;
beforeEach(() => {
  F.updateChat(G, { apagadoDesde: 0, apagadoPor: "", isBanned: 0 });
  globalThis.enviados = [];
  expulsiones = [];
  pedidasDelGrupo = 0;
  miembros = [{ id: ADMIN, admin: "admin" }, { id: MIEMBRO, admin: null }, BOT];
  Object.assign(conexion.client, {
    groupMetadata: async (id) => (pedidasDelGrupo++, { id, subject: "Grupo", participants: miembros }),
    groupParticipantsUpdate: async (chat, ids, accion) => (expulsiones.push({ chat, ids, accion }), ids.map((jid) => ({ status: "200", jid }))),
  });
});

const correr = (text, roles = {}, sender = ADMIN) =>
  Claudia.run({ chat: G, sender, isGroup: true, react: async () => {} }, { client: conexion.client, text, args: text ? text.split(" ") : [], usedPrefix: ".", isOwner: false, isWaAdmin: false, isAdmin: false, ...roles });
const ultimo = () => ultimoEnviado()?.msg?.text || "";

test("la compuerta: un grupo con el bot apagado o baneado queda afuera; uno prendido, un privado o uno sin fila, no", () => {
  assert.equal(Ap.fueraDelGrupo(G), null);
  F.updateChat(G, { apagadoDesde: Date.now() });
  assert.equal(Ap.fueraDelGrupo(G), "apagado");
  F.updateChat(G, { apagadoDesde: 0, isBanned: 1 });
  assert.equal(Ap.fueraDelGrupo(G), "baneado");
  assert.equal(Ap.estaFuera(F.getChat(G)), true);
  assert.equal(Ap.fueraDelGrupo("59899000000@s.whatsapp.net"), null, "un privado no");
  assert.equal(Ap.fueraDelGrupo("nunca-visto@g.us"), null);
  assert.equal(Ap.estaFuera(null), false);
});

test("las tareas programadas no ven un grupo con el bot afuera: ni chatsConOpcion ni los horarios del grupo", () => {
  const opciones = ["preguntaDia", "triviaRelampago", "recapSemanal", "iniciativa", "changas", "espias", "encargos", "pueblo"];
  F.updateChat(G, { ...Object.fromEntries(opciones.map((o) => [o, 1])), horarioGrupo: "08:00-22:00" });
  const enTodas = () => opciones.every((o) => F.chatsConOpcion(o).includes(G)) && F.chatsConHorarioGrupo().some((f) => f.remoteJid === G);
  const enNinguna = () => opciones.every((o) => !F.chatsConOpcion(o).includes(G)) && !F.chatsConHorarioGrupo().some((f) => f.remoteJid === G);
  assert.ok(enTodas(), "prendido, en todas");
  F.updateChat(G, { apagadoDesde: Date.now() });
  assert.ok(enNinguna(), "apagado, en ninguna");
  F.updateChat(G, { apagadoDesde: 0, isBanned: 1 });
  assert.ok(enNinguna(), "baneado, tampoco");
  F.updateChat(G, { ...Object.fromEntries(opciones.map((o) => [o, 0])), horarioGrupo: "", isBanned: 0 });
});

// Each task of lib/tareas-programadas.js that goes over the groups does it through the door: chatsConOpcion (and
// chatsConHorarioGrupo), or estaFuera / fueraDelGrupo on the rows it reads, or andanLosMercados, which asks it. A new
// task has to say here which it is, or that it goes over no group: that's how none is left talking in a group switched off.
test("cada tarea programada que recorre grupos pasa por la compuerta", () => {
  const PUERTAS = /\b(chatsConOpcion|chatsConHorarioGrupo|estaFuera|fueraDelGrupo|andanLosMercados)\(/;
  const SIN_GRUPOS = new Set(["backup", "ytdlp", "claros", "bateria", "contexto-chat", "conexion"]);
  const fuente = fs.readFileSync(path.join(RAIZ, "lib", "tareas-programadas.js"), "utf8");
  const modulos = [...fuente.matchAll(/from "\.\/([\w-]+)\.js"/g)].map((x) => x[1]);
  assert.ok(modulos.length > 20, modulos.join(" "));
  const sinPuerta = modulos.filter((mod) => !SIN_GRUPOS.has(mod) && !PUERTAS.test(fs.readFileSync(path.join(RAIZ, "lib", `${mod}.js`), "utf8")));
  assert.deepEqual(sinPuerta, []);
  // And the pending ones, which main.js starts apart.
  assert.match(fs.readFileSync(path.join(RAIZ, "lib", "pendientes.js"), "utf8"), PUERTAS);
});

test("pendientes: los de un grupo con el bot apagado esperan, sin gastar un intento, y salen cuando vuelve", async () => {
  const id = F.crearPendiente(G, MIEMBRO, "recordatorio", { texto: "sacar la pizza" }, Date.now() - 1000);
  const fila = () => db.prepare(`SELECT estado, intentos FROM pendientes WHERE id = ?`).get(id);
  F.updateChat(G, { apagadoDesde: Date.now() });
  await Pendientes.procesarPendientes(conexion.client);
  assert.deepEqual({ ...fila() }, { estado: "pendiente", intentos: 0 });
  assert.equal(globalThis.enviados.length, 0);
  F.updateChat(G, { apagadoDesde: 0 });
  await Pendientes.procesarPendientes(conexion.client);
  assert.equal(fila().estado, "hecho");
  assert.match(globalThis.enviados.at(-1).msg.text, /sacar la pizza/);
});

test("entradas al grupo: con el bot apagado nadie es recibido ni sacado, pero el grupo se vuelve a pedir", async () => {
  F.addToBlacklist(LISTADO, "estafa", ADMIN, G, LISTADO);
  F.updateChat(G, { apagadoDesde: Date.now() });
  miembros.push({ id: LISTADO, admin: null });
  await Participantes.alCambiarParticipantes(conexion.client, { id: G, participants: [{ id: LISTADO }], action: "add" });
  assert.deepEqual(expulsiones, [], "no saca a nadie");
  assert.equal(globalThis.enviados.length, 0, "ni da la bienvenida");
  assert.ok(pedidasDelGrupo > 0, "quién es admin, para .claudia on");
  F.removeFromBlacklist(LISTADO, G);
});

test("reacciones: con el bot apagado no cuentan", () => {
  const contadas = () => db.prepare(`SELECT COUNT(*) AS n FROM interacciones_mensuales WHERE chat = ?`).get(G).n;
  const reaccion = (id) => ({ key: { remoteJid: G, participant: MIEMBRO, id }, reaction: { text: "👍", key: { participant: ADMIN } } });
  F.updateChat(G, { apagadoDesde: Date.now() });
  Reacciones.contarReaccion(conexion.client, reaccion("R1"));
  assert.equal(contadas(), 0);
  F.updateChat(G, { apagadoDesde: 0 });
  Reacciones.contarReaccion(conexion.client, reaccion("R1"));
  assert.ok(contadas() > 0, "prendido, la misma cuenta");
});

test(".claudia: cómo está, quién la prende y la apaga, y el aviso de que se apagó", async () => {
  await correr("");
  assert.match(ultimo(), /^🤖 Estoy prendida en este grupo\. Con \.claudia off un admin del grupo me apaga del todo/);
  for (const roles of [{}, { isAdmin: true }]) {
    await correr("off", roles, MIEMBRO);
    assert.equal(ultimo(), "Prenderme y apagarme es de los admins del grupo y del dueño del bot.", JSON.stringify(roles));
  }
  assert.equal(F.getChat(G).apagadoDesde, 0, "un admin del bot tampoco: está por debajo de los de WhatsApp");
  await correr("off", { isWaAdmin: true });
  assert.match(ultimo(), /^💤 Me apago en este grupo\. Hasta que un admin mande \.claudia on no leo ni contesto nada, no modero \(la lista negra no saca a nadie/);
  assert.ok(F.getChat(G).apagadoDesde > 0);
  assert.equal(F.getChat(G).apagadoPor, ADMIN);
  await correr("off", { isWaAdmin: true });
  assert.equal(ultimo(), "Ya estaba apagada en este grupo.");
  await correr("", {}, MIEMBRO);
  assert.match(ultimo(), /^💤 Estoy apagada en este grupo desde el \d\d\/\d\d\/\d{4} \d\d:\d\d \(me apagó \*@100\*\)/);
  assert.deepEqual(ultimoEnviado().msg.mentions, [ADMIN]);
  await correr("talvez", { isWaAdmin: true });
  assert.match(ultimo(), /^Usá \.claudia on o \.claudia off/);
  await correr("on", { isOwner: true });
  assert.match(ultimo(), /^✅ Prendida de nuevo en este grupo, después de \d+ s\. Los plazos siguen desde donde estaban\.$/);
  assert.equal(F.getChat(G).apagadoDesde, 0);
  await correr("on", { isOwner: true });
  assert.equal(ultimo(), "Ya estaba prendida en este grupo.");
});

// Switching the bot off isn't a way in: whoever on the blacklist got in meanwhile goes when it's back on. Without admin,
// Claudia says who they are.
test(".claudia on: saca a quien entró de la lista negra mientras estaba apagada; sin admin, dice quiénes son", async () => {
  F.addToBlacklist(LISTADO, "estafa", ADMIN, G, LISTADO);
  F.updateUser(LISTADO, { pushName: "Tramposo" });
  try {
    miembros.push({ id: LISTADO, admin: null });
    F.updateChat(G, { apagadoDesde: Date.now() - 3600e3 });
    await correr("on", { isWaAdmin: true });
    assert.deepEqual(expulsiones, [{ chat: G, ids: [LISTADO], accion: "remove" }]);
    assert.match(ultimo(), /^✅ Prendida de nuevo en este grupo, después de 1 h 0 min\. Los plazos siguen desde donde estaban\.\n🚫 Saqué a Tramposo: entraron mientras estaba apagada y están en la lista negra\.$/);

    expulsiones = [];
    miembros = [{ id: ADMIN, admin: "admin" }, { id: LISTADO, admin: null }, { ...BOT, admin: null }];
    // Two fresh copies a moment apart are one (lib/cache-grupos.js): the second would be the first's, with Claudia admin.
    Cache.vaciar();
    F.updateChat(G, { apagadoDesde: Date.now() });
    await correr("on", { isWaAdmin: true });
    assert.deepEqual(expulsiones, []);
    assert.match(ultimo(), /\n🚫 Mientras estaba apagada entraron de la lista negra Tramposo, y no los puedo sacar porque no soy admin: sacalos a mano\.$/);
  } finally {
    F.removeFromBlacklist(LISTADO, G);
  }
});

// ---------- back on: what was going on goes on from where it was ----------
const HORA = 3600e3;
const DIA = 24 * HORA;

test("al volver, los plazos siguen desde donde estaban, lo que tocaba empezar no sale, y un mercado y un recordatorio van a su hora", () => {
  const OTRO = "otro-apagado@g.us";
  const ahora = Date.now();
  const desde = ahora - 5 * HORA;
  const ms = ahora - desde;
  // An errand due an hour after it went off moves on; one due before, and another group's, don't.
  const encargo = (chat, vence) => Number(db.prepare(`INSERT INTO encargos (chat, usuario, clave, creada, vence, estado) VALUES (?, ?, 'x', ?, ?, 'abierto')`).run(chat, MIEMBRO, desde - HORA, vence).lastInsertRowid);
  const [enCurso, yaVencido, deOtro] = [encargo(G, desde + HORA), encargo(G, desde - HORA), encargo(OTRO, desde + HORA)];
  const prestamo = Number(db.prepare(`INSERT INTO banco_prestamos (chat, deudor, monto, total, saldo, cuota, cuotas, creado, proxima, estado) VALUES (?, ?, 100, 120, 120, 40, 3, ?, ?, 'activo')`).run(G, MIEMBRO, desde - HORA, desde + 2 * HORA).lastInsertRowid);
  db.prepare(`INSERT INTO elecciones (chat, mes, anuncio, cierra_inscripcion, cierra_votacion) VALUES (?, '2099-01', ?, ?, ?)`).run(G, desde - HORA, desde - 30 * 60e3, desde + 3 * HORA);
  const termina = F.crearPendiente(G, MIEMBRO, "encargo_vence", {}, desde + HORA);
  const empezaba = F.crearPendiente(G, MIEMBRO, "trivia_relampago", {}, desde + HORA);
  const empiezaDespues = F.crearPendiente(G, MIEMBRO, "trivia_relampago", {}, ahora + HORA);
  const recordatorio = F.crearPendiente(G, MIEMBRO, "recordatorio", { texto: "x" }, desde + HORA);
  const mercado = F.crearPendiente(G, MIEMBRO, "cerrar_mercado", {}, desde + HORA);
  // A post renewed six days before it went off, and one asked about the day before.
  const publicar = (numero, actualizada, aviso) => db.prepare(`INSERT INTO publicaciones (chat, numero, usuario, tipo, texto, creada, actualizada, estado, aviso) VALUES (?, ?, ?, 'vendo', 'bici $ 100', ?, ?, 'activa', ?)`).run(G, numero, MIEMBRO, actualizada, actualizada, aviso);
  publicar(1, desde - 6 * DIA, 0);
  publicar(2, desde - 8 * DIA, desde - DIA);
  try {
    assert.deepEqual(Ap.reanudarPlazos(G, desde, ahora), { corridos: 1, cancelados: 1 });
    const vence = (id) => db.prepare(`SELECT vence FROM encargos WHERE id = ?`).get(id).vence;
    assert.deepEqual([vence(enCurso), vence(yaVencido), vence(deOtro)], [desde + HORA + ms, desde - HORA, desde + HORA]);
    assert.equal(db.prepare(`SELECT proxima FROM banco_prestamos WHERE id = ?`).get(prestamo).proxima, desde + 2 * HORA + ms, "la cuota");
    assert.deepEqual({ ...db.prepare(`SELECT cierra_inscripcion, cierra_votacion FROM elecciones WHERE chat = ?`).get(G) }, { cierra_inscripcion: desde - 30 * 60e3, cierra_votacion: desde + 3 * HORA + ms }, "la votación, no las listas que ya habían cerrado");
    const pendiente = (id) => ({ ...db.prepare(`SELECT estado, ejecutar_en FROM pendientes WHERE id = ?`).get(id) });
    assert.deepEqual(pendiente(termina), { estado: "pendiente", ejecutar_en: desde + HORA + ms });
    assert.equal(pendiente(empezaba).estado, "cancelado", "la trivia que tocaba mientras tanto");
    assert.deepEqual(pendiente(empiezaDespues), { estado: "pendiente", ejecutar_en: ahora + HORA });
    assert.deepEqual([pendiente(recordatorio), pendiente(mercado)], [{ estado: "pendiente", ejecutar_en: desde + HORA }, { estado: "pendiente", ejecutar_en: desde + HORA }], "a su hora: salen tarde");
    const publicacion = (numero) => ({ ...db.prepare(`SELECT actualizada, aviso FROM publicaciones WHERE chat = ? AND numero = ?`).get(G, numero) });
    assert.deepEqual([publicacion(1), publicacion(2)], [{ actualizada: desde - 6 * DIA + ms, aviso: 0 }, { actualizada: desde - 8 * DIA + ms, aviso: desde - DIA + ms }], "el tiempo apagado no cuenta para el «¿sigue en pie?»");
    assert.ok(F.cierresGrupo(G).some((c) => c.desde === desde && c.hasta === ahora), "ni para .inactivos: un tramo cerrado");
  } finally {
    for (const tabla of ["encargos", "banco_prestamos", "elecciones", "pendientes", "publicaciones", "cierres_grupo"]) db.prepare(`DELETE FROM ${tabla} WHERE chat IN (?, ?)`).run(G, OTRO);
  }
});

test("al volver, una racha viva cuando se apagó sigue; una ya cortada, no; y el mismo día, nada cambia", () => {
  const dia = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };
  const clave = (n) => A.claveDia(dia(n));
  F.setRacha(G, "esedia@lid", 5, clave(-3)); // wrote that day, before it went off
  F.setRacha(G, "deantes@lid", 4, clave(-4)); // still had that day to keep it
  F.setRacha(G, "cortada@lid", 2, clave(-6));
  Ap.reanudarPlazos(G, dia(-3).setHours(12, 0, 0, 0), Date.now());
  assert.deepEqual(["esedia@lid", "deantes@lid", "cortada@lid"].map((u) => F.getRacha(G, u).ultimoDia), [clave(-1), clave(-1), clave(-6)]);
  F.setRacha(G, "hoy@lid", 3, clave(0));
  Ap.reanudarPlazos(G, Date.now() - 60e3, Date.now());
  assert.equal(F.getRacha(G, "hoy@lid").ultimoDia, clave(0));
  db.prepare(`DELETE FROM rachas WHERE chat = ?`).run(G);
  db.prepare(`DELETE FROM cierres_grupo WHERE chat = ?`).run(G);
});

// Every until-when column of a group's table, and every kind of pending work, says what happens to it when the bot is
// back: moved on, or not (a market's close is its match's hour). A new one has to be put on one of the lists, or a
// group switched off would have it run out while nobody could do anything.
test("cada plazo de la base y cada tipo de pendiente dicen qué les pasa cuando el bot vuelve", () => {
  const NO_SON_HORAS = new Set(["banco_prestamos.vencido", "iniciativa_estado.motivoProximo"]);
  const esquema = fs.readFileSync(path.join(RAIZ, "database-schema.js"), "utf8");
  const plazos = [];
  for (const [, tabla, cuerpo] of esquema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([^]*?)\n\s*\)/g)) {
    const columnas = cuerpo
      .split("\n")
      .map((l) => l.trim().split(/\s+/)[0])
      .filter(Boolean);
    if (!columnas.includes("chat")) continue;
    for (const c of columnas) if (/(vence|hasta|cierra|proxim)/i.test(c) && !NO_SON_HORAS.has(`${tabla}.${c}`)) plazos.push(`${tabla}.${c}`);
  }
  assert.ok(plazos.length >= 20, plazos.join(" "));
  const dichos = new Set([...F.PLAZOS_QUE_SE_CORREN, ...F.PLAZOS_QUE_NO_SE_CORREN].map(([tabla, columna]) => `${tabla}.${columna}`));
  assert.deepEqual(plazos.filter((p) => !dichos.has(p)), []);
  const tipos = new Set([...fs.readFileSync(path.join(RAIZ, "lib", "pendientes.js"), "utf8").matchAll(/p\.tipo === "(\w+)"/g)].map((x) => x[1]));
  assert.ok(tipos.size >= 18, [...tipos].join(" "));
  for (const tipo of tipos) assert.equal([F.PENDIENTES_QUE_TERMINAN, F.PENDIENTES_QUE_EMPIEZAN, F.PENDIENTES_A_SU_HORA].filter((l) => l.includes(tipo)).length, 1, tipo);
});

test(".claudia off cancela lo que está en juego en el grupo, y lo devuelve; .claudia on corre los plazos", async () => {
  const OTRO = "otro-mines@g.us";
  fijarSaldo(F, G, MIEMBRO, 100);
  fijarSaldo(F, OTRO, MIEMBRO, 100);
  assert.ok(Mines.iniciar(G, MIEMBRO, 25, "3", () => {}).ok);
  assert.ok(Mines.iniciar(OTRO, MIEMBRO, 10, "3", () => {}).ok);
  await correr("off", { isWaAdmin: true });
  assert.match(ultimo(), / Cancelé lo que estaba en juego y devolví 1 apuesta \(25 UruCoins\)\. Solo contesto /);
  assert.equal(F.getSaldoCoins(G, MIEMBRO), 100);
  assert.deepEqual([...Mines.partidasMines.values()].map((p) => p.chat), [OTRO], "la del otro grupo sigue");
  Mines.devolverPartidasMines();
  // An hour off, with an errand that had two hours left when it went off: it still has them.
  const desde = Date.now() - HORA;
  F.updateChat(G, { apagadoDesde: desde });
  const id = Number(db.prepare(`INSERT INTO encargos (chat, usuario, clave, creada, vence, estado) VALUES (?, ?, 'x', ?, ?, 'abierto')`).run(G, MIEMBRO, desde, desde + 2 * HORA).lastInsertRowid);
  await correr("on", { isWaAdmin: true });
  const vence = db.prepare(`SELECT vence FROM encargos WHERE id = ?`).get(id).vence;
  assert.ok(Math.abs(vence - (Date.now() + 2 * HORA)) < 5000, `le siguen quedando las dos horas (${vence - Date.now()} ms)`);
  db.prepare(`DELETE FROM encargos WHERE chat = ?`).run(G);
});

test("un recordatorio que sale tarde dice para cuándo era", async () => {
  const ahora = Date.now();
  await Rec.ejecutarRecordatorio(conexion.client, { chat: G, usuario: MIEMBRO, datos: { texto: "sacar la pizza" }, ejecutar_en: ahora - 2 * HORA }, ahora);
  assert.match(ultimo(), /^⏰ @200, me pediste que te recuerde \(era para (hoy|el \d+\/\d+) \d\d:\d\d\): \*sacar la pizza\*$/);
  await Rec.ejecutarRecordatorio(conexion.client, { chat: G, usuario: MIEMBRO, datos: { texto: "a tiempo" }, ejecutar_en: ahora - 60e3 }, ahora);
  assert.equal(ultimo(), "⏰ @200, me pediste que te recuerde: *a tiempo*");
});

