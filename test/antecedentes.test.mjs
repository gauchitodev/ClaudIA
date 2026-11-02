import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";
import { numeroReciclado, unaLid, unNumero } from "./identidad-escenarios.mjs";
import strings from "../lib/strings.js";

// Each one's record of warnings in a group (.antecedentes): .adv notes the reason, who gave it and when, .unwarn which
// one it took away, and the third one which got them removed; .clearantecedentes erases it. The count of warnings
// alone forgot all of that once the message scrolled away, and went back to 0 on the third one.

let F, S, T, Warn, Unwarn, Ant, Limpiar, Rd;
let expulsiones = [];
let statusExpulsion = "200";
const MOD = "100@lid"; // a WhatsApp admin, who warns
const BOT = "999@lid";

before(async () => {
  ({ F } = await prepararBase("antecedentes"));
  globalThis.txt = strings;
  globalThis.client.user.lid = BOT;
  globalThis.client.groupParticipantsUpdate = async (chat, ids, accion) => {
    expulsiones.push({ chat, ids, accion });
    return ids.map((jid) => ({ status: statusExpulsion, jid }));
  };
  S = await import("../database-schema.js");
  T = await import("../lib/tiempo.js");
  const plugin = async (nombre) => (await import(`../plugins/${nombre}.js`)).default;
  [Warn, Unwarn, Ant, Limpiar, Rd] = await Promise.all(["grupo-advertir", "grupo-advertir-delete", "grupo-antecedentes", "grupo-antecedentes-limpiar", "owner-restaurar-usuario"].map(plugin));
});

beforeEach(() => {
  expulsiones = [];
  statusExpulsion = "200";
  globalThis.enviados = [];
});

// A group of each test's own, with its people (lid, name) listed by LID, and the moderator and the bot as admins.
function grupo(chat, ...gente) {
  for (const [lid, nombre] of [[MOD, "Mod"], ...gente]) F.initDataDB({ chat, sender: lid, senderJid: "", pushName: nombre });
  return [...gente.map(([lid]) => ({ id: lid, admin: null })), { id: MOD, admin: "admin" }, { id: BOT, admin: "admin" }];
}

// A plugin run as the dispatcher would: by the moderator unless said, and what it answered.
async function correr(P, chat, participants, { text = "", mencion = [], sender = MOD, isMod = true, isOwner = false, isWaAdmin = sender === MOD } = {}) {
  globalThis.enviados = [];
  const m = { chat, sender, senderJid: "", text, mentionedJid: mencion, isGroup: true, react: async (emoji) => globalThis.enviados.push({ chat, msg: { react: emoji } }) };
  await P.run(m, { client: globalThis.client, text, args: text.split(" "), command: P.cmd[0], usedPrefix: ".", participants, isMod, isOwner, isWaAdmin, isAdmin: isWaAdmin || isOwner });
  return ultimoEnviado()?.msg ?? {};
}

// What runs inside, at that moment (Date.now), as the bot's clock would have it.
async function a(momento, hacer) {
  const reloj = Date.now;
  Date.now = () => momento;
  try {
    return await hacer();
  } finally {
    Date.now = reloj;
  }
}

// A moment of the bot's own time zone, as fechaYHora shows it: the same in any TZ the tests run under.
const hora = (dia, h, min) => new Date(2026, 9, dia, h, min).getTime();
const advertir = (chat, participants, lid, motivo) => correr(Warn, chat, participants, { text: `@${lid.split("@")[0]} ${motivo}`, mencion: [lid] });
const verDe = (chat, participants, lid, opciones = {}) => correr(Ant, chat, participants, { text: `@${lid.split("@")[0]}`, mencion: [lid], ...opciones });
const renglones = (texto) => texto.split("\n").filter((l) => l.startsWith("• "));

test("fechaYHora: el día y la hora completos", () => {
  assert.equal(T.fechaYHora(hora(2, 8, 5)), "02/10/2026 08:05");
  assert.equal(T.fechaYHora(new Date(2027, 0, 1, 0, 0).getTime()), "01/01/2027 00:00");
});

test(".adv anota el motivo, quién y cuándo; .antecedentes @persona los muestra de la más nueva a la más vieja, sin arrobar", async () => {
  const C = "ant-lista@g.us";
  const gente = grupo(C, ["211@lid", "Fulano"]);
  await a(hora(12, 18, 42), () => advertir(C, gente, "211@lid", "spam de links"));
  await a(hora(13, 9, 5), () => advertir(C, gente, "211@lid", "insultos"));
  const r = await verDe(C, gente, "211@lid");
  assert.equal(
    r.text,
    ["📋 *Antecedentes de Fulano en este grupo*", "⚠️ Vigentes: 2/3 · Anotadas: 2", "", "• 13/10/2026 09:05 — «insultos» (de Mod) ⚠️ vigente", "• 12/10/2026 18:42 — «spam de links» (de Mod) ⚠️ vigente"].join("\n"),
  );
  assert.equal(r.mentions, undefined, "no la arroba");
});

test(".unwarn marca como sacada la última vigente, con quién y cuándo", async () => {
  const C = "ant-unwarn@g.us";
  const gente = grupo(C, ["221@lid", "Mengana"]);
  await a(hora(1, 10, 0), () => advertir(C, gente, "221@lid", "primera"));
  await a(hora(2, 10, 0), () => advertir(C, gente, "221@lid", "segunda"));
  await a(hora(3, 11, 30), () => correr(Unwarn, C, gente, { text: "@221", mencion: ["221@lid"] }));
  const { text } = await verDe(C, gente, "221@lid");
  assert.match(text, /⚠️ Vigentes: 1\/3 · Anotadas: 2/);
  assert.deepEqual(renglones(text), ["• 02/10/2026 10:00 — «segunda» (de Mod) ✅ la sacó Mod el 03/10/2026 11:30", "• 01/10/2026 10:00 — «primera» (de Mod) ⚠️ vigente"]);
});

test("la tercera expulsa: queda marcada, las de antes cerradas con la expulsión, y se empieza de nuevo", async () => {
  const C = "ant-tercera@g.us";
  const gente = grupo(C, ["231@lid", "Zutano"]);
  for (const [dia, motivo] of [[4, "uno"], [5, "dos"], [6, "tres"]]) await a(hora(dia, 20, 0), () => advertir(C, gente, "231@lid", motivo));
  assert.deepEqual(expulsiones.map((e) => e.ids), [["231@lid"]], "la tercera lo saca");
  let { text } = await verDe(C, gente, "231@lid");
  assert.match(text, /⚠️ Vigentes: 0\/3 · Anotadas: 3 · Expulsiones: 1/);
  assert.deepEqual(renglones(text), [
    "• 06/10/2026 20:00 — «tres» (de Mod) 🚪 con esta llegó a 3 y quedó afuera del grupo",
    "• 05/10/2026 20:00 — «dos» (de Mod) · cerrada con la expulsión del 06/10/2026 20:00",
    "• 04/10/2026 20:00 — «uno» (de Mod) · cerrada con la expulsión del 06/10/2026 20:00",
  ]);
  await a(hora(7, 9, 0), () => advertir(C, gente, "231@lid", "volvió y siguió"));
  ({ text } = await verDe(C, gente, "231@lid"));
  assert.match(text, /⚠️ Vigentes: 1\/3 · Anotadas: 4 · Expulsiones: 1/);
  assert.equal(renglones(text)[0], "• 07/10/2026 09:00 — «volvió y siguió» (de Mod) ⚠️ vigente");
});

test("si WhatsApp no deja expulsar, la tercera queda vigente y no cuenta como expulsión", async () => {
  const C = "ant-sin-permiso@g.us";
  const gente = grupo(C, ["241@lid", "Perengano"]);
  statusExpulsion = "403";
  for (const [dia, motivo] of [[8, "uno"], [9, "dos"], [10, "tres"]]) await a(hora(dia, 12, 0), () => advertir(C, gente, "241@lid", motivo));
  const { text } = await verDe(C, gente, "241@lid");
  assert.match(text, /⚠️ Vigentes: 3\/3 · Anotadas: 3\n/, "sin expulsiones");
  assert.ok(renglones(text).every((l) => l.endsWith("⚠️ vigente")), text);
});

test("muestra las últimas 30, y dice de cuántas", async () => {
  const C = "ant-muchas@g.us";
  const gente = grupo(C, ["251@lid", "Reincidente"]);
  for (let i = 1; i <= 35; i++) F.anotarAdvertencia("251@lid", C, { motivo: `n${i}`, dadoPor: MOD, fecha: hora(1, 0, 0) + i * 60_000 });
  F.setAdvertencias("251@lid", C, 2);
  const { text } = await verDe(C, gente, "251@lid");
  const lineas = renglones(text);
  assert.equal(lineas.length, 30);
  assert.match(lineas[0], /«n35» \(de Mod\) ⚠️ vigente$/);
  assert.match(lineas[1], /«n34» \(de Mod\) ⚠️ vigente$/);
  assert.match(lineas[2], /«n33» \(de Mod\) · ya no cuenta$/, "más abiertas que las que cuenta el contador");
  assert.match(lineas[29], /«n6» /);
  assert.match(text, /\n\n_Te muestro las últimas 30 de 35\._$/);
});

test("cada uno ve los suyos; los de otro, solo los moderadores y los admins", async () => {
  const C = "ant-permisos@g.us";
  const gente = grupo(C, ["261@lid", "Advertido"], ["262@lid", "Curioso"]);
  await a(hora(11, 15, 0), () => advertir(C, gente, "261@lid", "flood"));
  const comun = { isMod: false, isWaAdmin: false };
  const propio = await correr(Ant, C, gente, { sender: "261@lid", ...comun });
  assert.match(propio.text, /^📋 \*Tus antecedentes en este grupo\*\n⚠️ Vigentes: 1\/3/);
  assert.match((await verDe(C, gente, "261@lid", { sender: "261@lid", ...comun })).text, /^📋 \*Tus antecedentes/, "mencionándose a sí mismo, también");
  assert.match((await verDe(C, gente, "261@lid", { sender: "262@lid", ...comun })).text, /los ven los moderadores y los admins/);
  assert.equal((await correr(Ant, C, gente, { sender: "262@lid", ...comun })).text, "📋 No tenés antecedentes en este grupo.");
  assert.match((await verDe(C, gente, BOT)).text, /^📋 Esa soy yo/, "respondiéndole a ella, no son los de nadie");
  assert.match((await correr(Ant, C, gente, { text: "@Advertido" })).text, /No sé de quién querés ver los antecedentes/);
});

test("las de antes del registro las cuenta el contador, sin detalle", async () => {
  const C = "ant-de-antes@g.us";
  const gente = grupo(C, ["271@lid", "Veterano"]);
  F.setAdvertencias("271@lid", C, 1);
  let { text } = await verDe(C, gente, "271@lid");
  assert.equal(text, "📋 *Antecedentes de Veterano en este grupo*\n⚠️ Vigentes: 1/3 · Anotadas: 0\n\n_Y 1 vigente de antes de que las anotara, sin detalle._");
  await a(hora(12, 8, 0), () => advertir(C, gente, "271@lid", "otra vez"));
  ({ text } = await verDe(C, gente, "271@lid"));
  assert.match(text, /Vigentes: 2\/3 · Anotadas: 1\n\n• 12\/10\/2026 08:00 — «otra vez» \(de Mod\) ⚠️ vigente\n\n_Y 1 vigente de antes/);
  await a(hora(12, 9, 0), () => correr(Unwarn, C, gente, { text: "@271", mencion: ["271@lid"] }));
  ({ text } = await verDe(C, gente, "271@lid"));
  assert.match(text, /Vigentes: 1\/3 · Anotadas: 1\n\n• 12\/10\/2026 08:00 — «otra vez» \(de Mod\) ✅ la sacó Mod el 12\/10\/2026 09:00\n\n_Y 1 vigente de antes/);
});

test(".clearantecedentes: un admin borra el registro del grupo y las vigentes; nadie los suyos, y solo desde más arriba", async () => {
  const [C, OTRO] = ["ant-limpiar@g.us", "ant-limpiar-otro@g.us"];
  const gente = grupo(C, ["281@lid", "Arrepentido"], ["282@lid", "Admin del bot"]);
  const otros = grupo(OTRO, ["281@lid", "Arrepentido"]);
  assert.equal(Limpiar.onlyAdmin, true, "un moderador no: borra lo que anotan los moderadores");
  await advertir(C, gente, "281@lid", "uno");
  await advertir(C, gente, "281@lid", "dos");
  await advertir(OTRO, otros, "281@lid", "en otro grupo");
  const limpiar = (lid, opciones = {}) => correr(Limpiar, C, gente, { text: `@${lid.split("@")[0]}`, mencion: [lid], ...opciones });
  const r = await limpiar("281@lid");
  assert.equal(r.text, "🧹 Listo: *@281* queda sin antecedentes en este grupo: borré las 2 advertencias anotadas y le saqué las 2 vigentes.");
  assert.deepEqual(r.mentions, ["281@lid"]);
  assert.equal(F.advertenciasDe("281@lid", C), 0);
  assert.equal((await verDe(C, gente, "281@lid")).text, "📋 Arrepentido no tiene antecedentes en este grupo.");
  assert.equal(F.antecedentesDe("281@lid", OTRO).total, 1, "los de otro grupo quedan");
  assert.equal((await limpiar("281@lid")).text, "No tiene antecedentes en este grupo.");
  F.setRolGrupo(C, "282@lid", "admin");
  const comoAdminDelBot = { sender: "282@lid", isWaAdmin: false };
  assert.match((await limpiar("282@lid", comoAdminDelBot)).text, /^Tus propios antecedentes no los podés borrar vos/);
  assert.match((await limpiar(MOD, comoAdminDelBot)).text, /^No le puedo borrar los antecedentes: /, "a un admin de WhatsApp, un admin del bot no");
  assert.equal((await limpiar(BOT)).react, "❌");
});

test(".rd borra el registro de la persona, y el de nadie más", async () => {
  const C = "ant-rd@g.us";
  const gente = grupo(C, ["291@lid", "Borrado"], ["292@lid", "Testigo"]);
  await advertir(C, gente, "291@lid", "algo");
  await advertir(C, gente, "292@lid", "otra cosa");
  await correr(Rd, C, gente, { text: "@291", mencion: ["291@lid"], isOwner: true });
  assert.equal(globalThis.db.prepare("SELECT COUNT(*) AS n FROM antecedentes WHERE usuario = ?").get("291@lid").n, 0);
  assert.equal(F.antecedentesDe("292@lid", C).total, 1);
});

// With a number that changed hands, .adv and .antecedentes go to whoever the group lists with it now
// (destinatarioActual): the record is kept under the row the count is, and is shown from there.
test("con un número reciclado, el registro es de quien lo tiene ahora", async () => {
  const C = "ant-reciclado@g.us";
  const { X, VIEJO, NUEVO, porNumero } = numeroReciclado(601);
  const gente = [...porNumero, { id: MOD, admin: "admin" }, { id: BOT, admin: "admin" }];
  F.initDataDB({ chat: C, sender: MOD, senderJid: "", pushName: "Mod" });
  await correr(Warn, C, gente, { text: `@${X.split("@")[0]} spam`, mencion: [X] });
  assert.equal(F.antecedentesDe(NUEVO, C).total, 1);
  assert.equal(F.antecedentesDe(VIEJO, C).total, 0);
  assert.match((await correr(Ant, C, gente, { text: `@${X.split("@")[0]}`, mencion: [X] })).text, /^📋 \*Antecedentes de Nuevo en este grupo\*/);
});

// Someone whose message comes with their number alone is their LID's row, which the number stands for: their count is
// read from there (getUser), and so is their record, kept under the LID as .adv named them.
test("quien escribe solo con su número ve los suyos, anotados bajo su LID", async () => {
  const C = "ant-por-numero@g.us";
  const [L, X] = [unaLid(605), unNumero(605)];
  const gente = grupo(C, [L, "Con número"]);
  F.syncUserInfo({ sender: L, senderJid: X, pushName: "Con número" });
  await a(hora(14, 16, 20), () => advertir(C, gente, L, "por las dudas"));
  const { text } = await correr(Ant, C, gente, { sender: X, isMod: false, isWaAdmin: false });
  assert.match(text, /^📋 \*Tus antecedentes en este grupo\*\n⚠️ Vigentes: 1\/3 · Anotadas: 1\n\n• 14\/10\/2026 16:20 — «por las dudas» \(de Mod\) ⚠️ vigente$/);
});

// What was noted under a number with no LID known goes to the LID the number was on when another one comes with it
// (seguirALaPersona, atarAlLid), as a bot role does: left under the number, its next owner would have shown it.
test("lo anotado bajo un número va a la LID que lo tenía, y no al que llega con él", () => {
  const C = "ant-numero@g.us";
  const [X, VIEJO, NUEVO] = [unNumero(602), unaLid(602, 1), unaLid(602, 2)];
  F.initDataDB({ chat: C, sender: X, senderJid: X, pushName: "Por número" });
  F.anotarAdvertencia(X, C, { motivo: "cuando era solo su número", dadoPor: MOD });
  for (const lid of [VIEJO, NUEVO]) {
    F.initDataDB({ chat: C, sender: lid, senderJid: X, pushName: "Alguien" });
    F.syncUserInfo({ sender: lid, senderJid: X, pushName: "Alguien" });
  }
  assert.equal(F.antecedentesDe(VIEJO, C).total, 1);
  assert.equal(F.antecedentesDe(NUEVO, C).total, 0);
  assert.equal(globalThis.db.prepare("SELECT COUNT(*) AS n FROM antecedentes WHERE usuario = ?").get(X).n, 0);
});

// The rows of a device ("…:12@lid") join their LID's on start (juntarFilasDeDispositivo), the count of warnings with
// them: their record goes along, also when the device's row becomes the LID's.
test("el registro de una fila de dispositivo pasa a la de su LID", () => {
  const otra = new Database(":memory:");
  S.ponerAlDia(otra);
  const [L, M] = [unaLid(603), unaLid(604)];
  const fila = otra.prepare("INSERT INTO users (lid, jid, pushName, inGroup) VALUES (?, '', '', ?)");
  fila.run(L, JSON.stringify({ g: { warn: 1 } }));
  fila.run(L.replace("@lid", ":12@lid"), JSON.stringify({ g: { warn: 1 } }));
  fila.run(M.replace("@lid", ":3@lid"), JSON.stringify({ g: { warn: 1 } }));
  const anotar = otra.prepare("INSERT INTO antecedentes (chat, usuario, tipo, motivo, fecha) VALUES ('g', ?, 'advertencia', ?, 1)");
  anotar.run(L.replace("@lid", ":12@lid"), "del dispositivo");
  anotar.run(M.replace("@lid", ":3@lid"), "del que pasa a ser su LID");
  F.juntarFilasDeDispositivo(otra);
  const deQuien = otra.prepare("SELECT usuario, motivo FROM antecedentes ORDER BY id").all().map((a) => [a.usuario, a.motivo]);
  assert.deepEqual(deQuien, [[L, "del dispositivo"], [M, "del que pasa a ser su LID"]]);
  otra.close();
});
