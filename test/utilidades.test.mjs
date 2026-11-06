import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { prepararBase, G, ultimoEnviado, nodosQue, manejadorDe, dentroDe } from "./helpers.mjs";

let F, Rec, C, B, Av, CC, Mem, E, LT;
before(async () => {
  ({ F } = await prepararBase("utilidades"));
  Rec = await import("../lib/recordatorios.js");
  C = await import("../lib/cumpleanos.js");
  B = await import("../lib/backup.js");
  Av = await import("../lib/avisos.js");
  CC = await import("../lib/contexto-chat.js");
  Mem = await import("../lib/memoria-grupo.js");
  E = await import("../lib/economia.js");
  LT = await import("../lib/limpieza-tmp.js");
});

test("recordatorios", async () => {
  const H = 3600e3;
  const r1 = Rec.crearRecordatorio(G, "u", ["en", "2h", "sacar", "la", "pizza"]);
  assert.match(r1.mensaje, /sacar la pizza/);
  assert.ok(Rec.crearRecordatorio(G, "u", ["mañana", "9:00", "pagar", "la", "luz"]).ok);
  assert.ok(Rec.crearRecordatorio(G, "u", ["en", "2", "h", "y", "esto"]).ok);
  assert.match(Rec.crearRecordatorio(G, "u", ["en", "2h"]).error, /¿Qué te recuerdo/);
  assert.match(Rec.crearRecordatorio(G, "u", ["sacar", "la", "pizza"]).error, /¿Cuándo/);
  assert.match(Rec.crearRecordatorio(G, "u", ["en", "90d", "x"]).error, /60 días/);
  for (let i = 0; i < 7; i++) Rec.crearRecordatorio(G, "u", ["en", "1h", `x${i}`]);
  assert.match(Rec.crearRecordatorio(G, "u", ["en", "1h", "otro"]).error, /Ya tenés 10/);
  assert.match(Rec.textoRecordatorios("u"), /#1 · /);
  assert.ok(Rec.olvidarRecordatorio("u", 1).ok && !Rec.olvidarRecordatorio("u", 1).ok && !Rec.olvidarRecordatorio("otro", 2).ok);
  await Rec.ejecutarRecordatorio(globalThis.client, { chat: G, usuario: "598@lid", datos: { texto: "sacar la pizza" } });
  assert.match(ultimoEnviado().msg.text, /@598, me pediste que te recuerde: \*sacar la pizza\*/);
  void H;
});

test("cumpleaños", async () => {
  assert.match(C.registrarCumple(G, "a", "").error, /Anotá tu cumple/);
  assert.ok(C.registrarCumple(G, "a", "14/03/1990").ok);
  assert.match(C.registrarCumple(G, "a", "").mensaje, /14 de marzo de 1990/);
  assert.ok(C.registrarCumple(G, "b", "29-02-1992").ok);
  assert.ok(!C.registrarCumple(G, "d", "31/04/1990").ok && !C.registrarCumple(G, "d", "hola").ok);
  assert.equal(C.diasHasta(2, 9, new Date(2026, 8, 2)), 0);
  assert.equal(C.diasHasta(1, 9, new Date(2026, 8, 2)), 364);
  assert.equal(C.textoCumples(G).mentions.length, 2);
  assert.ok(C.registrarCumple(G, "b", "borrar").ok);
  const hoy = new Date();
  // 28 years back, a 29 February is still a date that exists.
  assert.ok(C.registrarCumple(G, "598@lid", `${hoy.getDate()}/${hoy.getMonth() + 1}/${hoy.getFullYear() - 28}`).ok);
  C.CUMPLE.HORA_SALUDO = 0;
  // 598's greetings alone: chequearCumpleanos greets every group, and on the day of another birthday noted in this
  // file ("a"'s 14/03 above, or one of the next tests' in a group of their own), it counted here too.
  const suyos = () => globalThis.enviados.filter((e) => e.msg?.mentions?.includes("598@lid"));
  const antes = suyos().length;
  await C.chequearCumpleanos();
  await C.chequearCumpleanos();
  const saludos = suyos().slice(antes);
  assert.equal(saludos.length, 1, "una sola vez, aunque pase dos veces");
  assert.match(saludos[0].msg.text, /@598\b.*\b28 años\b/);
});

// The year is a must: with it, the greeting, .cumples and the profile say the age. It used to be read and dropped, so
// "14/03/1990" ended up as 14/03 alone. On a day of its own, in a group of its own.
test("cumpleaños: el año es obligatorio, y .cumple y .cumples dicen la edad", () => {
  const Z = "cumple-anio@g.us";
  const ahora = new Date(2026, 10, 2, 12); // 2 de noviembre de 2026
  const anotar = (quien, texto) => C.registrarCumple(Z, quien, texto, ahora);
  assert.equal(anotar("ana@lid", "").error, "Anotá tu cumple con .cumple 08/10/1997 (día/mes/año)");
  assert.equal(anotar("ana@lid", "14/03").error, "Poné también el año: .cumple 08/10/1997 (día/mes/año).");
  assert.equal(F.getCumple(Z, "ana@lid"), null, "sin el año no se anota");
  assert.equal(anotar("ana@lid", "14/03/1990").mensaje, "🎂 Anotado: tu cumple es el 14 de marzo de 1990. Ese día te saludo en el grupo por tus 37.");
  assert.equal(anotar("ana@lid", "").mensaje, "🎂 Tu cumple está anotado el 14 de marzo de 1990 (tenés 36). Para cambiarlo: .cumple 08/10/1997 · para borrarlo: .cumple borrar");
  // Two digits: the last year ending in them that isn't past this one.
  assert.match(anotar("beto@lid", "5-11-95").mensaje, /el 5 de noviembre de 1995\. .* por tus 31\.$/);
  assert.match(anotar("beto@lid", "05.11.05").mensaje, /de 2005\. .* por tus 21\.$/);
  assert.match(anotar("beto@lid", "05/11/27").mensaje, /de 1927\. .* por tus 99\.$/);
  // On the day itself, the age they turn today.
  assert.match(anotar("caro@lid", "02/11/2000").mensaje, /por tus 26\.$/);
  // Dates that don't exist or haven't come yet, and years that make no age to believe.
  assert.equal(anotar("dani@lid", "29/02/1990").error, "Esa fecha no existe.");
  assert.ok(anotar("dani@lid", "29/02/1992").ok, "1992 sí tuvo 29 de febrero");
  assert.equal(anotar("eva@lid", "03/11/2026").error, "Esa fecha todavía no llegó: fijate el año.");
  assert.equal(anotar("eva@lid", "14/03/24").error, "Con ese año tendrías 2 años: fijate el año.");
  assert.equal(anotar("eva@lid", "01/11/2025").error, "Con ese año tendrías 1 año: fijate el año.");
  assert.equal(anotar("eva@lid", "03/11/2021").error, "Con ese año tendrías 4 años: fijate el año.");
  assert.equal(anotar("eva@lid", "02/11/1905").error, "Con ese año tendrías 121 años: fijate el año.");
  assert.equal(anotar("eva@lid", "14/03/199").error, "No entendí la fecha. Poné día/mes/año, por ejemplo .cumple 08/10/1997");
  assert.equal(F.getCumple(Z, "eva@lid"), null, "nada de eso se anotó");
  assert.ok(anotar("eva@lid", "02/11/2021").ok, "5 años, recién cumplidos");
  assert.ok(anotar("eva@lid", "03/11/1905").ok, "120 años, y mañana 121");
  assert.ok(anotar("eva@lid", "borrar").ok);
  // Noted before the year was asked for: it stays, and .cumple asks for the year.
  F.setCumple(Z, "fede@lid", 10, 1);
  assert.equal(anotar("fede@lid", "").mensaje, "🎂 Tu cumple está anotado el 10 de enero, pero sin el año: volvé a anotarlo con el año (.cumple 08/10/1997) y ese día digo cuántos cumplís. Para borrarlo: .cumple borrar");
  const r = C.textoCumples(Z, ahora);
  assert.deepEqual(r.texto.split("\n"), [
    "🎂 *Cumpleaños del grupo*",
    "02/11 @caro — ¡es hoy! 🎉 (cumple 26)",
    "05/11 @beto — en 3 días (cumple 99)",
    "10/01 @fede — en 69 días (le falta el año)",
    "29/02 @dani — en 118 días (cumple 35)",
    "14/03 @ana — en 132 días (cumple 37)",
  ]);
  assert.deepEqual(r.mentions, ["caro@lid", "beto@lid", "fede@lid", "dani@lid", "ana@lid"]);
});

// The greeting says how many they turn. The ones noted before the year was asked for are greeted as before, without
// the age. In a group of its own: chequearCumpleanos greets every group, and only this one's are looked at.
test("cumpleaños: el saludo dice cuántos cumple, y sin el año saluda igual", async () => {
  const Z = "cumple-saludo@g.us";
  C.CUMPLE.HORA_SALUDO = 0;
  assert.ok(C.registrarCumple(Z, "1403@lid", "14/03/1990", new Date(2026, 10, 2)).ok);
  F.setCumple(Z, "1503@lid", 15, 3);
  const saludos = async (fecha) => {
    const antes = globalThis.enviados.length;
    await C.chequearCumpleanos(fecha);
    return globalThis.enviados.slice(antes).filter((e) => e.chat === Z).map((e) => e.msg);
  };
  const conAnio = await saludos(new Date(2027, 2, 14, 10));
  assert.equal(conAnio.length, 1);
  assert.match(conAnio[0].text, /@1403\b.*\b37 años\b/);
  assert.deepEqual(conAnio[0].mentions, ["1403@lid"]);
  const sinAnio = await saludos(new Date(2027, 2, 15, 10));
  assert.equal(sinAnio.length, 1);
  assert.match(sinAnio[0].text, /@1503\b/);
  assert.doesNotMatch(sinAnio[0].text, /\d+ años/);
});

test("cumpleaños del 29/02: en los años sin 29 se festeja el 28", async () => {
  // They were only greeted in leap years, and .cumples said "¡es hoy!" on 1 March.
  assert.equal(C.diasHasta(29, 2, new Date(2027, 1, 28)), 0, "2027 no tiene 29 de febrero");
  assert.equal(C.diasHasta(29, 2, new Date(2027, 2, 1)), 365, "el 1/3 ya falta para el de 2028");
  assert.equal(C.diasHasta(29, 2, new Date(2028, 1, 28)), 1, "2028 sí lo tiene");
  // And they turn a year older on the 28th, the day they're greeted.
  assert.equal(C.edad({ dia: 29, mes: 2, anio: 2000 }, new Date(2027, 1, 27)), 26);
  assert.equal(C.edad({ dia: 29, mes: 2, anio: 2000 }, new Date(2027, 1, 28)), 27);
  assert.equal(C.edad({ dia: 29, mes: 2, anio: 2000 }, new Date(2028, 1, 28)), 27);
  assert.equal(C.edad({ dia: 29, mes: 2, anio: 2000 }, new Date(2028, 1, 29)), 28);
  assert.equal(C.edad({ dia: 29, mes: 2, anio: null }, new Date(2028, 1, 29)), null, "sin el año, no se sabe");
  const Z = "bisiesto@g.us";
  assert.ok(C.registrarCumple(Z, "2902@lid", "29/02/2000").ok);
  C.CUMPLE.HORA_SALUDO = 0;
  const saludos = async (fecha) => {
    const antes = globalThis.enviados.length;
    await C.chequearCumpleanos(fecha);
    return globalThis.enviados.slice(antes).filter((e) => e.chat === Z).map((e) => e.msg.text);
  };
  const de2027 = await saludos(new Date(2027, 1, 28, 12));
  assert.equal(de2027.length, 1, "2027: el 28");
  assert.match(de2027[0], /\b27 años\b/);
  assert.deepEqual(await saludos(new Date(2028, 1, 28, 12)), [], "2028: el 28 todavía no");
  const de2028 = await saludos(new Date(2028, 1, 29, 12));
  assert.equal(de2028.length, 1, "2028: el 29");
  assert.match(de2028[0], /\b28 años\b/);
});

// .setcumple: an admin notes someone else's birthday with .cumple's checks, the answers speaking of that person, and
// what's noted is theirs as if they had noted it. On a day of its own, in a group of its own.
test("cumpleaños: .setcumple anota el de otro con los chequeos de .cumple, y queda como si lo hubiera anotado esa persona", () => {
  const Z = "cumple-admin@g.us";
  const ahora = new Date(2026, 10, 2, 12); // 2 de noviembre de 2026
  const anotar = (quien, texto) => C.anotarCumpleDe(Z, quien, texto, ahora);
  assert.equal(anotar("ana@lid", "").error, "Poné la fecha, con el año: .setcumple @persona 08/10/1997 (día/mes/año). Para borrarlo: .delcumple @persona");
  assert.equal(anotar("ana@lid", "14/03").error, "Poné también el año: .setcumple @persona 08/10/1997 (día/mes/año).");
  assert.equal(anotar("ana@lid", "14/03/199").error, "No entendí la fecha. Poné día/mes/año, por ejemplo .setcumple @persona 08/10/1997");
  assert.equal(anotar("ana@lid", "29/02/1990").error, "Esa fecha no existe.");
  assert.equal(anotar("ana@lid", "03/11/2026").error, "Esa fecha todavía no llegó: fijate el año.");
  assert.equal(anotar("ana@lid", "14/03/24").error, "Con ese año tendría 2 años: fijate el año.");
  assert.equal(anotar("ana@lid", "02/11/1905").error, "Con ese año tendría 121 años: fijate el año.");
  assert.equal(anotar("ana@lid", "borrar").error, "Esa persona no tenía cumple anotado.");
  assert.equal(F.getCumple(Z, "ana@lid"), null, "nada de eso se anotó");
  assert.deepEqual(anotar("ana@lid", "14/03/1990"), { ok: true, mensaje: "🎂 Anotado: el cumple de @ana es el 14 de marzo de 1990. Ese día le mando el saludo en el grupo por sus 37.", mentions: ["ana@lid"] });
  // Hers: she sees it with .cumple as her own.
  assert.equal(C.registrarCumple(Z, "ana@lid", "", ahora).mensaje, "🎂 Tu cumple está anotado el 14 de marzo de 1990 (tenés 36). Para cambiarlo: .cumple 08/10/1997 · para borrarlo: .cumple borrar");
  // Over what someone noted themselves, two digits for the year as .cumple takes them, and then deleted.
  assert.ok(C.registrarCumple(Z, "beto@lid", "05/11/1995", ahora).ok);
  assert.match(anotar("beto@lid", "5.11.96").mensaje, /^🎂 Anotado: el cumple de @beto es el 5 de noviembre de 1996\. .* por sus 30\.$/);
  assert.deepEqual(F.getCumple(Z, "beto@lid"), { dia: 5, mes: 11, anio: 1996 });
  assert.deepEqual(anotar("beto@lid", "quitar"), { ok: true, mensaje: "🗑️ Listo, borré el cumple de @beto (5 de noviembre).", mentions: ["beto@lid"] });
  assert.equal(F.getCumple(Z, "beto@lid"), null);
  assert.deepEqual(C.textoCumples(Z, ahora).texto.split("\n"), ["🎂 *Cumpleaños del grupo*", "14/03 @ana — en 132 días (cumple 37)"]);
});

// .setcumple as the admins write it: the person mentioned, before or after the date, or the author of the message it
// replies to; never the bot, nor someone the bot knows nothing of. Only the answers that note or delete tag them. With
// a client of its own: other tests here swap the global one.
test("cumpleaños: .setcumple @persona o respondiendo un mensaje suyo; ni a la bot ni a quien no conoce", async () => {
  const Z = "cumple-setcumple@g.us";
  const P = (await import("../plugins/cumple-set.js")).default;
  assert.ok(P.onlyAdmin && P.onlyGroup, "solo los admins, y en un grupo");
  const enviados = [];
  const client = { user: { lid: "bot@lid", jid: "bot@s.whatsapp.net" }, sendText: async (chat, text, quoted, opciones) => enviados.push(opciones?.mentions ? { text, mentions: opciones.mentions } : { text }) };
  for (const [lid, nombre] of [["7001@lid", "Admin"], ["7002@lid", "Ana"], ["7003@lid", "Beto"]]) F.initDataDB({ chat: Z, sender: lid, senderJid: "", pushName: nombre });
  const participants = ["7001@lid", "7002@lid", "7003@lid", "bot@lid"].map((id) => ({ id, admin: id === "7001@lid" ? "admin" : null }));
  const correr = async (text, { mencion = [], citado = null } = {}) => {
    const antes = enviados.length;
    const m = { chat: Z, sender: "7001@lid", senderJid: "", text, mentionedJid: mencion, quoted: citado && { sender: citado }, isGroup: true };
    await P.run(m, { client, text, args: text.split(" "), command: "setcumple", usedPrefix: ".", participants, isAdmin: true, isWaAdmin: true });
    assert.equal(enviados.length, antes + 1, "contesta una vez");
    return enviados.at(-1);
  };
  assert.match((await correr("14/03/1990")).text, /^❌ ¿De quién\? Mencioná a la persona .* o respondé un mensaje suyo: \.setcumple @persona 08\/10\/1997$/);
  const anotado = await correr("@7002 14/03/1990", { mencion: ["7002@lid"] });
  assert.match(anotado.text, /^🎂 Anotado: el cumple de @7002 es el 14 de marzo de 1990\. Ese día le mando el saludo en el grupo por sus \d+\.$/);
  assert.deepEqual(anotado.mentions, ["7002@lid"]);
  assert.deepEqual(F.getCumple(Z, "7002@lid"), { dia: 14, mes: 3, anio: 1990 });
  // The date before the mention, and replying to one of their messages.
  await correr("15/04/1991 @7002", { mencion: ["7002@lid"] });
  assert.deepEqual(F.getCumple(Z, "7002@lid"), { dia: 15, mes: 4, anio: 1991 });
  await correr("20/05/1992", { citado: "7003@lid" });
  assert.deepEqual(F.getCumple(Z, "7003@lid"), { dia: 20, mes: 5, anio: 1992 });
  // A date it won't take says why, tagging nobody, and leaves what there was.
  assert.deepEqual(await correr("@7002 15/04", { mencion: ["7002@lid"] }), { text: "❌ Poné también el año: .setcumple @persona 08/10/1997 (día/mes/año)." });
  assert.deepEqual(F.getCumple(Z, "7002@lid"), { dia: 15, mes: 4, anio: 1991 });
  // Not the bot, replying to one of her messages, nor an "@" with digits typed by hand that match nobody.
  assert.deepEqual(await correr("20/05/1992", { citado: "bot@lid" }), { text: "❌ Esa soy yo: mencioná a la persona, o respondé un mensaje suyo." });
  assert.deepEqual(await correr("@7099 20/05/1992"), { text: "❌ No tengo datos de esa persona todavía: cuando escriba algo en el grupo, se lo podés anotar." });
  assert.equal(F.getCumple(Z, "7099@lid"), null);
  assert.deepEqual(await correr("@7003 borrar", { mencion: ["7003@lid"] }), { text: "🗑️ Listo, borré el cumple de @7003 (20 de mayo).", mentions: ["7003@lid"] });
  assert.equal(F.getCumple(Z, "7003@lid"), null);
});

// .delcumple as the admins write it: the person mentioned, the author of the message it answers, or their number, with
// or without the "+", spaced or not. The number is how whoever left the group is named, since WhatsApp no longer offers
// them when typing @: it's whoever WhatsApp says has it now, and failing an answer, whoever the database knows by it.
// With a client of its own: other tests here swap the global one.
test("cumpleaños: .delcumple por mención, respondiendo o con el número, también el de quien ya no está", async (t) => {
  const Z = "cumple-delcumple@g.us";
  const P = (await import("../plugins/cumple-del.js")).default;
  const { usyncFalso } = await import("./identidad-escenarios.mjs");
  assert.ok(P.onlyAdmin && P.onlyGroup, "solo los admins, y en un grupo");
  const enviados = [];
  const client = { user: { lid: "bot@lid", jid: "bot@s.whatsapp.net" }, sendText: async (chat, text, quoted, opciones) => enviados.push(opciones?.mentions ? { text, mentions: opciones.mentions } : { text }) };
  // Ana and Beto are in the group; Caro and Dani left it, with their numbers on their rows.
  const gente = [["7101@lid", "Admin", ""], ["7102@lid", "Ana", ""], ["7103@lid", "Beto", ""], ["7104@lid", "Caro", "59899000104@s.whatsapp.net"], ["7105@lid", "Dani", "59899000105@s.whatsapp.net"]];
  for (const [lid, nombre, jid] of gente) F.initDataDB({ chat: Z, sender: lid, senderJid: jid, pushName: nombre });
  for (const [lid] of gente.slice(1)) F.setCumple(Z, lid, 14, 3, 1990);
  const participants = ["7101@lid", "7102@lid", "7103@lid", "bot@lid"].map((id) => ({ id, admin: id === "7101@lid" ? "admin" : null }));
  const correr = async (text, { mencion = [], citado = null } = {}) => {
    const antes = enviados.length;
    const m = { chat: Z, sender: "7101@lid", senderJid: "", text, mentionedJid: mencion, quoted: citado && { sender: citado }, isGroup: true };
    await P.run(m, { client, text, args: text.split(" "), command: "delcumple", usedPrefix: ".", participants, isAdmin: true, isWaAdmin: true });
    assert.equal(enviados.length, antes + 1, "contesta una vez");
    return enviados.at(-1);
  };
  const borrado = (n) => ({ text: `🗑️ Listo, borré el cumple de @${n} (14 de marzo).`, mentions: [`${n}@lid`] });

  assert.deepEqual(await correr(""), { text: "❌ ¿De quién? Mencioná a la persona, respondé un mensaje suyo o poné su número (así se borra el de quien ya no está en el grupo): .delcumple @persona o .delcumple +598 99 123 456" });
  assert.deepEqual(await correr("@7102", { mencion: ["7102@lid"] }), borrado(7102));
  assert.equal(F.getCumple(Z, "7102@lid"), null);
  assert.deepEqual(await correr("@7102", { mencion: ["7102@lid"] }), { text: "❌ Esa persona no tenía cumple anotado." });
  assert.deepEqual(await correr("", { citado: "7103@lid" }), borrado(7103), "respondiendo un mensaje suyo");
  // Caro left: by her number, which WhatsApp says is hers.
  const consultas = usyncFalso(t, { "59899000104@s.whatsapp.net": "7104@lid" }, client);
  assert.deepEqual(await correr("59899000104"), borrado(7104), "el número solo");
  assert.equal(consultas.length, 1, "le preguntó a WhatsApp de quién es");
  F.setCumple(Z, "7104@lid", 14, 3, 1990);
  // With the + and spaced, answering a message of Claudia's: the number typed wins over the message it answers.
  assert.deepEqual(await correr("+598 99 000 104", { citado: "bot@lid" }), borrado(7104), "con el + y espaciado");
  // With WhatsApp not answering, whoever the database knows by the number: Dani.
  delete client.executeUSyncQuery;
  assert.deepEqual(await correr("598-99-000-105"), borrado(7105));
  // Claudia, answering her message with no number; a number as it's dialed at home; and digits too few to be one.
  assert.deepEqual(await correr("", { citado: "bot@lid" }), { text: "❌ Esa soy yo: mencioná a la persona, respondé un mensaje suyo o poné su número." });
  assert.deepEqual(await correr("099 000 105"), { text: "❌ Poné el número con el código del país: .delcumple +598 99 123 456" });
  assert.match((await correr("12")).text, /^❌ ¿De quién\?/);
  assert.deepEqual(gente.map(([lid]) => F.getCumple(Z, lid)), [null, null, null, null, null]);

  // Eva noted hers when the group showed her by her number, and again by her LID: both go, whichever she's named by.
  const EVA = ["7106@lid", "59899000106@s.whatsapp.net"];
  F.initDataDB({ chat: Z, sender: EVA[0], senderJid: EVA[1], pushName: "Eva" });
  for (const id of EVA) F.setCumple(Z, id, 14, 3, 1990);
  participants.push({ id: EVA[0], phoneNumber: EVA[1] });
  assert.deepEqual(await correr("@7106", { mencion: [EVA[0]] }), borrado(7106));
  assert.deepEqual(EVA.map((id) => F.getCumple(Z, id)), [null, null]);
  // Fede left, and the number on his row is Gabi's now, who's in the group by it: Gabi's birthday isn't Fede's.
  const GABI = "59899000107@s.whatsapp.net";
  F.initDataDB({ chat: Z, sender: "7107@lid", senderJid: GABI, pushName: "Fede" });
  F.initDataDB({ chat: Z, sender: GABI, senderJid: "", pushName: "Gabi" });
  F.setCumple(Z, "7107@lid", 14, 3, 1990);
  F.setCumple(Z, GABI, 9, 9, 1999);
  participants.push({ id: GABI });
  assert.deepEqual(await correr("@7107"), borrado(7107));
  assert.deepEqual(F.getCumple(Z, GABI), { dia: 9, mes: 9, anio: 1999 }, "el de Gabi sigue");
});

// Whoever isn't in the group anymore goes apart in .cumples, with the day alone: they're not greeted, and an admin
// deletes theirs with .delcumple. The plugin hands over the group's list; with none (empty), nobody is set apart, since
// everyone would be.
test("cumpleaños: .cumples muestra aparte a los que ya no están en el grupo", async () => {
  const Z = "cumple-idos@g.us";
  const ahora = new Date(2026, 10, 2, 12); // 2 de noviembre de 2026
  F.setCumple(Z, "7201@lid", 5, 11, 1995);
  F.setCumple(Z, "7202@lid", 14, 3, 1990);
  F.setCumple(Z, "7203@lid", 10, 1);
  const r = C.textoCumples(Z, ahora, (lid) => lid === "7201@lid");
  assert.deepEqual(r.texto.split("\n"), ["🎂 *Cumpleaños del grupo*", "05/11 @7201 — en 3 días (cumple 31)", "", "🚪 *Ya no están en el grupo* (no los saludo; un admin borra su cumple con .delcumple)", "10/01 @7203", "14/03 @7202"]);
  assert.deepEqual(r.mentions, ["7201@lid", "7203@lid", "7202@lid"]);
  assert.equal(C.textoCumples(Z, ahora, () => false).texto.split("\n")[1], "Nadie de los que están anotó su cumple todavía. Anotá el tuyo con .cumple 08/10/1997");

  const P = (await import("../plugins/cumple.js")).default;
  const enviados = [];
  const client = { sendMessage: async (chat, contenido) => enviados.push(contenido) };
  const pedir = async (participants) => {
    await P.run({ chat: Z, sender: "7201@lid", isGroup: true }, { client, text: "", command: "cumples", participants });
    return enviados.at(-1).text;
  };
  const idos = await pedir([{ id: "7201@lid" }, { id: "bot@lid" }]);
  assert.match(idos, /\n\n🚪 \*Ya no están en el grupo\* .*\n10\/01 @7203\n14\/03 @7202$/);
  assert.doesNotMatch(await pedir([]), /Ya no están/, "sin la lista del grupo, todos juntos");
  // .cumpleaños is .cumples: the parser takes the ñ out (lib/comandos.js) and the plugin declares that name
  const { parsearComando } = await import("../lib/comandos.js");
  const { comando } = parsearComando(".cumpleaños", ["."]);
  assert.ok(P.cmd.includes(comando), comando);
  await P.run({ chat: Z, sender: "7201@lid", isGroup: true }, { client, text: "", command: comando, participants: [{ id: "7201@lid" }, { id: "bot@lid" }] });
  assert.equal(enviados.at(-1).text, idos, "la misma lista que .cumples");
});

// The greeting skips whoever left: it tagged someone who was gone. Their birthday stays noted. With no list of the
// group (WhatsApp didn't give one, and there's no copy), they're greeted as before. Each in a group of its own, its
// list as lib/cache-grupos.js keeps it.
test("cumpleaños: el saludo no va para quien ya no está en el grupo, y sin la lista del grupo saluda igual", async () => {
  const { guardar } = await import("../lib/cache-grupos.js");
  const [Z, SIN_LISTA, VACIA] = ["120363000000000301@g.us", "120363000000000302@g.us", "120363000000000303@g.us"];
  C.CUMPLE.HORA_SALUDO = 0;
  for (const lid of ["7301@lid", "7302@lid"]) F.setCumple(Z, lid, 20, 6, 1990);
  F.setCumple(SIN_LISTA, "7303@lid", 20, 6, 1990);
  F.setCumple(VACIA, "7304@lid", 20, 6, 1990);
  guardar(globalThis.client, Z, { id: Z, subject: "Cumples", participants: [{ id: "7301@lid" }, { id: "bot@lid" }] });
  guardar(globalThis.client, VACIA, { id: VACIA, subject: "Sin gente", participants: [] }); // a list that came empty
  const antes = globalThis.enviados.length;
  const errorReal = console.error;
  console.error = () => {}; // lib/cache-grupos.js says it couldn't get SIN_LISTA's list
  try {
    await C.chequearCumpleanos(new Date(2027, 5, 20, 10));
  } finally {
    console.error = errorReal;
  }
  const saludos = globalThis.enviados.slice(antes);
  assert.deepEqual(saludos.filter((e) => e.chat === Z).map((e) => e.msg.mentions), [["7301@lid"]], "solo a quien está");
  assert.deepEqual(F.getCumple(Z, "7302@lid"), { dia: 20, mes: 6, anio: 1990 }, "el de quien se fue sigue anotado");
  assert.deepEqual(saludos.filter((e) => e.chat === SIN_LISTA).map((e) => e.msg.mentions), [["7303@lid"]], "sin la lista, saluda igual");
  assert.deepEqual(saludos.filter((e) => e.chat === VACIA).map((e) => e.msg.mentions), [["7304@lid"]], "y con una vacía, también");
});

test("backup con la copia real de SQLite, rotación y envío semanal", async () => {
  const archivo = await B.hacerBackup();
  assert.ok(fs.existsSync(archivo) && !fs.existsSync(`${archivo}.tmp`));
  for (let i = 1; i <= 9; i++) fs.writeFileSync(path.join(B.BACKUP.CARPETA, `database-2020-01-0${i % 10}.db`), "viejo");
  await B.hacerBackup();
  assert.equal(fs.readdirSync(B.BACKUP.CARPETA).filter((f) => f.endsWith(".db")).length, 7);
  assert.equal(B.ultimoBackup().archivo, archivo);
  assert.equal(B.tamano(2.5 * 1024 * 1024), "2.5 MB");
  B.BACKUP.HORA = 0;
  const antes = globalThis.enviados.length;
  await B.chequearBackupProgramado();
  await B.chequearBackupProgramado();
  assert.equal(globalThis.enviados.length, antes + 1, "una copia semanal al owner");
  assert.equal(Av.jidOwner(), "59899111222@s.whatsapp.net");
  assert.equal(await Av.avisarOwner("hola", "k", 60e3), true);
  assert.equal(await Av.avisarOwner("hola", "k", 60e3), false);
});

// A config edited by hand can start with an empty owner (config.example.toml comes with owners = [""]): the notices and
// the weekly backup went to nobody.
test("avisos al owner: van al primer owner con número, aunque el primero esté vacío", async () => {
  const ownersReal = globalThis.owners;
  try {
    globalThis.owners = ["", " ", "+598 99 333 444", "59899111222"];
    assert.equal(Av.jidOwner(), "59899333444@s.whatsapp.net");
    globalThis.enviados = [];
    assert.equal(await Av.avisarOwner("hola", "primero-vacio"), true);
    assert.equal(globalThis.enviados.at(-1).chat, "59899333444@s.whatsapp.net");
    globalThis.owners = [""];
    assert.equal(Av.jidOwner(), null);
  } finally {
    globalThis.owners = ownersReal;
  }
});

test("memoria corta y memoria del grupo", () => {
  for (let i = 0; i < 250; i++) CC.recordarMensaje("c", `u${i}`, `mensaje ${i}`);
  assert.equal(CC.contextoChat.get("c").length, 250, "lo de las últimas 6 horas queda todo");
  assert.equal(CC.textoContexto("c", false).split("\n").length, 14);
  assert.match(Mem.recordar(G, "u", "que Fulano siempre llega tarde").mensaje, /Anotado \(#1\): Fulano siempre llega tarde/);
  assert.match(Mem.recordar(G, "u", "x").error, /¿Qué tengo que recordar/);
  assert.match(Mem.recordar(G, "u", "que la contraseña del wifi es 1234").error, /no lo guardo/);
  assert.match(Mem.textoMemoria(G), /#1 · Fulano siempre llega tarde/);
  assert.match(Mem.textoParaPrompt(G), /"Fulano siempre llega tarde"/);
  assert.match(Mem.borrar(G, "otro", 1, false).error, /otra persona/);
  assert.ok(Mem.borrar(G, "otro", 1, true).ok, "un admin borra lo de otro");
  assert.equal(Mem.textoParaPrompt(G), "");
});

test("economía", () => {
  F.ganarCoins(G, "a", 100, "reaccion_recibida");
  F.gastarCoins(G, "a", 30, "casino_ruleta");
  F.ganarCoins(G, "b", 40, "racha_dia");
  const e = E.resumenEconomia(G, 7);
  assert.equal(e.total, 110);
  assert.equal(e.personas, 2);
  assert.equal(e.entradas, 140);
  assert.equal(e.salidas, 30);
  assert.ok(e.rubros.some((r) => r.nombre === "Reacciones" && r.entradas === 100));
  assert.ok(e.rubros.some((r) => r.nombre === "Ruleta" && r.salidas === 30));
  const t = E.textoEconomia(G, 7);
  assert.match(t.texto, /En circulación: \*110 UruCoins\* entre 2 personas/);
  assert.match(t.texto, /📈/);
  assert.deepEqual(t.mentions, [], "el panel nombra sin etiquetar");
  // "a" and "b" have no name on record: "alguien", never the digits of their id.
  assert.match(t.texto, /Saldos más altos:\*\n1\. alguien — 70\n2\. alguien — 40/);
});

// These two in groups of their own: in G, run first, they changed the totals "economía" checks.
test("economía: los movimientos de los laburos tienen rubro propio", () => {
  const chat = "economia-laburos@g.us";
  F.moverCoins(chat, "laburante@lid", 9, "sueldo_laburo");
  F.moverCoins(chat, "laburante@lid", -20, "cambio_laburo");
  const rubros = E.resumenEconomia(chat, 7).rubros;
  const nombres = rubros.map((r) => r.nombre);
  assert.ok(nombres.includes("Sueldos de laburos") && nombres.includes("Cambios de laburo"), nombres.join(", "));
  assert.ok(!nombres.includes("Otros"), "antes caían en Otros");
  assert.equal(rubros.find((r) => r.nombre === "Sueldos de laburos").entradas, 9);
  assert.equal(rubros.find((r) => r.nombre === "Cambios de laburo").salidas, 20);
  assert.match(E.textoEconomia(chat).texto, /• Sueldos de laburos: \+9 \/ −0 \(1 mov\.\)/);
});

test("economía: el premio por volver después de .inactivos tiene rubro propio", () => {
  const chat = "economia-regreso@g.us";
  F.ganarCoins(chat, "volvio@lid", 10, "regreso_inactivo");
  const nombres = E.resumenEconomia(chat, 7).rubros.map((r) => r.nombre);
  assert.ok(nombres.includes("Volver después de .inactivos"), nombres.join(", "));
  assert.match(E.textoEconomia(chat).texto, /• Volver después de \.inactivos: \+10 \/ −0 \(1 mov\.\)/);
});

test("limpieza de tmp: borra lo abandonado y no le saca el archivo a una descarga en curso", () => {
  const dir = "tmp-prueba";
  fs.mkdirSync(dir, { recursive: true });
  const ahora = Date.now();
  const crear = (nombre, edadMs) => {
    const ruta = path.join(dir, nombre);
    fs.writeFileSync(ruta, "x");
    const seg = (ahora - edadMs) / 1000;
    fs.utimesSync(ruta, seg, seg);
    return ruta;
  };
  const viejo = crear("quedo-colgado.mp4", 60 * 60 * 1000);
  // yt-dlp has a 4 min timeout per attempt and up to 3 attempts: ten minutes in, it may still be downloading.
  const enCurso = crear("bajando.mp4", 10 * 60 * 1000);
  const recien = crear("sticker.webp", 0);

  assert.equal(LT.limpiarTmp(dir, ahora), 1);
  assert.ok(!fs.existsSync(viejo), "lo abandonado se borra");
  assert.ok(fs.existsSync(enCurso), "una descarga de 10 minutos sigue viva");
  assert.ok(fs.existsSync(recien), "lo recién creado sigue vivo");

  // Half an hour later there is nothing in progress left to protect.
  assert.equal(LT.limpiarTmp(dir, ahora + 30 * 60 * 1000), 2);
  assert.equal(fs.readdirSync(dir).length, 0);
  // A folder that doesn't exist doesn't break the cleanup.
  assert.equal(LT.limpiarTmp("tmp-que-no-existe", ahora), 0);
});

// Mentioning Claudia is talking to her, and plugins/_auto-ia.js answers it with the group's context
// (test/auto-ia.test.mjs). Her number used to be a command of .ia, which answered without it.
test("IA por mención: el número del bot no es un comando de .ia", async () => {
  const previo = globalThis.client;
  globalThis.client = { user: { lid: "59899111222@lid" } };
  const P = (await import("../plugins/tools-ia.js")).default;
  assert.deepEqual(P.cmd, ["gemini", "ia", "bot"]);
  globalThis.client = previo;
});

test("el .s no manda nada cuando la descarga del archivo viene vacía, y el log dice por qué", async () => {
  const P = (await import("../plugins/sticker.js")).default;
  const enviados = [];
  const client = { sendText: async (c, t) => enviados.push(t), sendFile: async () => enviados.push("archivo") };
  const errores = [];
  const original = console.error;
  console.error = (...a) => errores.push(a.join(" "));
  try {
    // A quoted message claiming to be an image but whose download() the serializer deleted: wa-socket.js does that
    // when the message has no mediaMessage, and with the plugin's optional chaining it silently returned undefined.
    await P.run({ chat: G, sender: "u@lid", message: {}, quoted: { msg: { mimetype: "image/jpeg" } } }, { client, isOwner: false });
  } finally {
    console.error = original;
  }
  assert.deepEqual(enviados, [], "no se le pasa basura a sendFile");
  assert.match(errores.join("\n"), /la descarga del archivo vino vacía/);
  assert.match(errores.join("\n"), /NO es problema de ffmpeg/, "el log tiene que descartar ffmpeg explícitamente");
});


// ---------- how late a message arrived (the 60-second filter in handle-message) ----------
// The age used to be measured when the message got processed. A batch goes one message at a time and every reply
// waits its turn in the queue, so the last command of a busy batch could pass the 60 s mark while waiting and be
// dropped without a word.

test("atraso: se mide contra la llegada, no contra cuándo se procesa", async () => {
  const { atrasoDeLlegada } = await import("../lib/tiempo.js");
  const enviado = 1_800_000_000; // seconds, like messageTimestamp
  const llegada = enviado * 1000 + 2000; // it reached the bot 2 s after it was sent
  const m = { messageTimestamp: enviado, _llegada: llegada };
  // Processed 90 s later, after the rest of its batch: its age is still the 2 s it took to arrive.
  assert.equal(atrasoDeLlegada(m, llegada + 90_000), 2);
  assert.equal(atrasoDeLlegada({ messageTimestamp: enviado }, llegada + 90_000), 92, "sin marca de llegada mide contra ahora, como antes");

  // What the filter is for: a message delivered late, because the bot was offline, is still stale.
  assert.ok(atrasoDeLlegada({ messageTimestamp: enviado, _llegada: (enviado + 300) * 1000 }) > 60);
  // The timestamp may come as a protobuf Long, and a message with none isn't dropped.
  assert.equal(atrasoDeLlegada({ messageTimestamp: { toNumber: () => enviado }, _llegada: llegada }), 2);
  assert.equal(atrasoDeLlegada({ _llegada: llegada }), 0);
});

// Read as code (nodosQue): the time taken once for the whole batch, in the handler and not for each message, and put on
// each message inside procesarTanda's callback; and handle-message dropping, as a sign of life, what came over 60 s
// late. Read as text, commented out it passed, and a renamed variable broke it.
test("atraso: main.js marca la llegada de cada tanda y handle-message filtra con ella", async () => {
  const { fileURLToPath } = await import("url");
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const main = fs.readFileSync(path.join(raiz, "main.js"), "utf8");
  const nodos = await nodosQue('CallExpression[callee.property.name="on"][arguments.0.value="messages.upsert"] CallExpression[callee.name="procesarTanda"], AssignmentExpression[left.property.name="_llegada"]', main);
  const tanda = nodos.find((n) => n.type === "CallExpression");
  const porMensaje = tanda?.arguments[1];
  const declaradas = (manejadorDe(tanda)?.body.body || []).flatMap((s) => (s.type === "VariableDeclaration" ? s.declarations : []));
  const llegada = declaradas.find((d) => d.init?.callee?.object?.name === "Date" && d.init.callee.property?.name === "now")?.id.name;
  const marca = nodos.find((n) => n.type === "AssignmentExpression" && n.right.name === llegada && n.left.object?.name === porMensaje?.params[0]?.name);
  assert.ok(llegada && marca && dentroDe(marca, porMensaje), "main.js dejó de marcar cuándo llegó la tanda");
  const handle = fs.readFileSync(path.join(raiz, "handle-message.js"), "utf8");
  const filtro = 'IfStatement[test.left.callee.name="atrasoDeLlegada"][test.operator=">"][test.right.value=60] ReturnStatement > CallExpression[callee.name="anotarPresencia"] > ObjectExpression > Property[key.name="antesDelNumero"][value.value=true]';
  assert.equal((await nodosQue(filtro, handle)).length, 1, "handle-message dejó de filtrar por el atraso de llegada");
  // What's cut there, and the commands from while it was off, still go into Claudia's memory (lib/memoria-corta.js).
  const atrasado = 'IfStatement[test.left.callee.name="atrasoDeLlegada"][test.operator=">"][test.right.value=60] CallExpression[callee.name="guardarAtrasado"]';
  const apagado = 'IfStatement[test.left.left.property.name="_upsertType"][test.left.right.value="append"] CallExpression[callee.name="guardarAtrasado"]';
  assert.equal((await nodosQue(atrasado, handle)).length, 1, "lo atrasado dejó de ir a la memoria");
  assert.equal((await nodosQue(apagado, handle)).length, 1, "los comandos de cuando estaba apagado dejaron de ir a la memoria");
});

test("consistencia: ningún plugin deja archivos multimedia en la raíz del repo", async () => {
  // .toimg wrote its temporary .webp and .jpg next to the code: a conversion cut short left someone's sticker there,
  // one "git add ." away from a commit, since .gitignore only covers tmp/ and database/. A merge that brings back an
  // old copy of a plugin would bring that back without anything failing.
  const { fileURLToPath } = await import("url");
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const archivos = ["plugins", "lib"].flatMap((c) => fs.readdirSync(path.join(raiz, c)).filter((f) => f.endsWith(".js")).map((f) => path.join(c, f)));
  assert.ok(archivos.length > 100, `se encontraron muy pocos archivos (${archivos.length}): el escaneo no está andando`);
  const enLaRaiz = [];
  for (const archivo of archivos) {
    fs.readFileSync(path.join(raiz, archivo), "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (/["'`]\.\/[^"'`/\s]+\.(jpe?g|png|webp|gif|mp3|mp4|ogg|opus|wav|m4a|webm)["'`]/i.test(linea)) enLaRaiz.push(`${archivo}:${i + 1}`);
      });
  }
  assert.deepEqual(enLaRaiz, [], `los temporales van en ./tmp/, que el .gitignore tapa:\n${enLaRaiz.join("\n")}`);
});

// The plugins' pauses for show (lib/pausas.js) pass at once in the tests (test/helpers.mjs), and for real everywhere
// else: a copy of the module of its own, which prepararBase didn't touch.
test("las pausas de los plugins esperan de verdad fuera de los tests", async () => {
  const { pausa } = await import("../lib/pausas.js?sin-tocar");
  const desde = performance.now();
  await pausa(60);
  assert.ok(performance.now() - desde >= 50, "la pausa no esperó");
});

// ---------- tanda 5d: files and the owner's commands ----------

// A link that didn't answer with the file went out as a ".bin" with the error page inside, and a failed sticker as an
// empty ".bin". sendFile throws now (lib/wa-socket.js); its whole run is checked with Baileys mocked out in the audit.
test("sendFile: un 404, un archivo vacío o el error de un sticker no salen como .bin", async () => {
  const { motivoSinArchivo } = await import("../lib/wa-socket.js");
  assert.equal(motivoSinArchivo({ res: { ok: false, status: 404 }, data: Buffer.from("<html>404</html>") }), "no se pudo bajar el archivo (HTTP 404)");
  assert.equal(motivoSinArchivo({ data: Buffer.alloc(0) }), "no hay archivo para mandar");
  assert.equal(motivoSinArchivo({ res: { ok: true, status: 200 }, data: Buffer.from([0xff, 0xd8, 0xff]) }), null);
  const fuente = fs.readFileSync(new URL("../lib/wa-socket.js", import.meta.url), "utf8");
  assert.match(fuente, /sendFile: \{\s*async value\([^)]*\) \{[\s\S]{0,400}if \(path instanceof Error\) throw path;[\s\S]{0,200}const motivo = motivoSinArchivo\(type\);/);
});

test("con imagen: si la imagen no llega, manda el texto igual, y sin imagen ni la intenta", async () => {
  const { mandarConImagen } = await import("../lib/con-imagen.js");
  const archivos = [];
  const textos = [];
  const client = { sendFile: async (chat, archivo) => (archivos.push(archivo), Promise.reject(new Error("no se pudo bajar el archivo (HTTP 404)"))), sendText: async (chat, t) => (textos.push(t), { key: { id: "H" } }) };
  const errorReal = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await mandarConImagen(client, G, "https://telegra.ph/file/x.jpg", "*♈ ARIES ♈*\nHoy te va bien.", null, "horoscopo"), { key: { id: "H" } });
    await mandarConImagen(client, G, null, "sin imagen", null);
  } finally {
    console.error = errorReal;
  }
  assert.deepEqual(textos, ["*♈ ARIES ♈*\nHoy te va bien.", "sin imagen"]);
  assert.deepEqual(archivos, ["https://telegra.ph/file/x.jpg"]);
});

// A picture from the internet that doesn't come down: since sendFile throws, .pelicula, .serie and .ig lost their text
// with it, and .getpp and .gpu went quiet. Now the text goes alone, or they say they couldn't.
test("una imagen que no baja: .pelicula e .ig mandan el texto igual, y .getpp y .gpu lo avisan", async () => {
  globalThis.txt = (await import("../lib/strings.js")).default;
  const Cine = (await import("../plugins/recomendar-cine.js")).default;
  const Ig = (await import("../plugins/insta-usuario.js")).default;
  const FotoGrupo = (await import("../plugins/get-pp-group.js")).default;
  const FotoPersona = (await import("../plugins/get-pp-user.js")).default;
  const fetchReal = globalThis.fetch;
  const errorReal = console.error;
  let recomendacion = { name: "Una de terror", genres: "Terror", vote: 6, date: "1999-01-01", overview: "Da miedo.", urlImage: "/poster.jpg" };
  globalThis.fetch = async () => ({ json: async () => ({ success: true, recommendation: recomendacion }) });
  console.error = () => {};
  const archivos = [];
  const textos = [];
  const client = {
    sendFile: async (chat, archivo) => (archivos.push(archivo), Promise.reject(new Error("no se pudo bajar el archivo (HTTP 404)"))),
    sendText: async (chat, t) => (textos.push(t), { key: { id: "T" } }),
    profilePictureUrl: async () => "https://pps.whatsapp.net/foto.jpg",
  };
  const m = { chat: G, sender: "555@lid", react: async () => {}, mentionedJid: ["111@lid"], quoted: null };
  try {
    await Cine.run(m, { client, text: "terror", usedPrefix: ".", command: "pelicula" });
    recomendacion = { ...recomendacion, name: "Otra sin póster", urlImage: null };
    await Cine.run(m, { client, text: "terror", usedPrefix: ".", command: "pelicula" });
    await Ig.run(m, { client, text: "@claudia.bot" });
    await FotoGrupo.run(m, { client });
    await FotoPersona.run(m, { client, text: "@111", usedPrefix: ".", command: "gpu", participants: [{ id: "111@lid" }] });
  } finally {
    globalThis.fetch = fetchReal;
    console.error = errorReal;
  }
  assert.equal(textos.length, 5, JSON.stringify(textos));
  assert.match(textos[0], /Una de terror/);
  assert.match(textos[1], /Otra sin póster/);
  assert.match(textos[2], /instagram\.com\/claudia\.bot/);
  assert.equal(textos[3], "No pude bajar la foto del grupo; probá de nuevo en un rato.");
  assert.equal(textos[4], "No pude bajar esa foto de perfil; probá de nuevo en un rato.");
  assert.equal(archivos.length, 4, "sin póster, ni lo intenta");
});

test(".emojimix: un sticker que no se pudo armar no sale como archivo, y si no sale ninguno lo dice", async () => {
  const P = (await import("../plugins/sticker-emoji-mix.js")).default;
  const fetchReal = globalThis.fetch;
  const errorReal = console.error;
  globalThis.tenorApiKey = "clave";
  globalThis.fetch = async (url) => (String(url).includes("tenor.googleapis.com") ? { ok: true, status: 200, json: async () => ({ results: [{ url: "http://127.0.0.1:9/a.png" }, { url: "http://127.0.0.1:9/b.png" }] }) } : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
  console.error = () => {};
  const archivos = [];
  const textos = [];
  try {
    const client = { sendFile: async (chat, archivo) => archivos.push(archivo), sendText: async (chat, t) => textos.push(t) };
    await P.run({ chat: G }, { client, text: "😀+🥲", args: ["😀+🥲"], usedPrefix: ".", command: "emojimix" });
  } finally {
    globalThis.fetch = fetchReal;
    console.error = errorReal;
    globalThis.tenorApiKey = "";
  }
  assert.deepEqual(archivos, []);
  assert.deepEqual(textos, ["No pude armar el sticker de esa mezcla, probá de nuevo en un rato."]);
});

// .addowner rewrote config.toml with toml.stringify: every comment explaining the settings was gone.
test(".addowner y .removeowner cambian solo la línea de owners de config.toml", async () => {
  const P = await import("../plugins/owner-add-owner.js");
  const ejemplo = fs.readFileSync(new URL("../config.example.toml", import.meta.url), "utf8").replace('owners = [""]', 'owners = ["59899111222"]');
  fs.writeFileSync("config.toml", ejemplo);
  const ownersAntes = globalThis.owners;
  try {
    const correr = (command, text) => P.default.run({ chat: "59899111222@s.whatsapp.net", sender: "59899111222@s.whatsapp.net", mentionedJid: [], quoted: null }, { client: globalThis.client, text, usedPrefix: ".", command, participants: [] });
    await correr("addowner", "+598 99 333 444");
    const despues = fs.readFileSync("config.toml", "utf8");
    assert.equal(despues, ejemplo.replace('owners = ["59899111222"]', 'owners = ["59899111222", "59899333444"]'), "todo lo demás, comentarios incluidos, queda igual");
    assert.deepEqual(globalThis.owners, ["59899111222", "59899333444"]);
    await correr("removeowner", "+598 99 333 444");
    assert.equal(fs.readFileSync("config.toml", "utf8"), ejemplo);
    assert.ok(!fs.existsSync("config.toml.tmp"), "el archivo de paso no queda");
  } finally {
    globalThis.owners = ownersAntes;
    fs.rmSync("config.toml", { force: true });
  }
  assert.equal(P.conOwners("# x\nowners = [\n  \"1\",\n]\n", ["1", "2"]), '# x\nowners = ["1", "2"]\n', "una lista en varias líneas");
  assert.equal(P.conOwners("numberBot = \"\"\n", ["5"]), 'owners = ["5"]\nnumberBot = ""\n', "sin la clave, la agrega arriba");
  assert.equal(P.conOwners("[tabla]\nowners = [\"1\"]\n", ["1", "2"]), null, "si no queda bien, no toca nada");
});

// .info says the code is open, under the MIT license, and links to it.
test(".info: el código es abierto, con el link al repo", async () => {
  const Info = (await import("../plugins/info-bot.js")).default;
  const textos = [];
  await Info.run({ chat: G }, { client: { sendText: async (chat, t) => textos.push(t) } });
  assert.match(textos[0], /🔗 https:\/\/github\.com\/gauchitodev\/ClaudIA$/);
  assert.match(textos[0], /El código es abierto, con licencia MIT/);
  assert.doesNotMatch(textos[0], /privad|pedime acceso/i);
});

// The same text to every group every 1.5 s, the ones with .banchat included: a burst like that is what WhatsApp's spam
// filter looks for.
test(".avisartodos: saltea los grupos con .banchat y espacia los envíos", async () => {
  const { default: P, AVISO_TODOS, _dep } = await import("../plugins/avisar-todos.js");
  for (const g of ["uno@g.us", "dos@g.us", "baneado@g.us"]) F.initDataDB({ chat: g, sender: "111@lid", senderJid: "" });
  F.updateChat("baneado@g.us", { isBanned: 1 });
  const esperas = [];
  const esperarReal = _dep.esperar;
  const azarReal = _dep.azar;
  const clientReal = globalThis.client;
  _dep.esperar = async (ms) => esperas.push(ms);
  _dep.azar = () => 0.5;
  const enviados = [];
  try {
    const client = { groupFetchAllParticipating: async () => ({ "uno@g.us": {}, "baneado@g.us": {}, "dos@g.us": {} }), sendText: async (chat, t) => enviados.push([chat, t]) };
    globalThis.client = client; // what it sends goes through the socket of the moment
    await P.run({ chat: "59899111222@s.whatsapp.net" }, { client, text: "Hoy arranca el ranking 🏆", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    _dep.azar = azarReal;
    globalThis.client = clientReal;
  }
  assert.match(enviados[0][1], /^📣 Lo mando a 2 grupo\(s\), de a uno y espaciado: tarda unos 30 s\. Salteo 1 con \.banchat\. Para cortarlo: \.avisartodos cancelar\.$/);
  assert.deepEqual(enviados.slice(1, 3), [["uno@g.us", "Hoy arranca el ranking 🏆"], ["dos@g.us", "Hoy arranca el ranking 🏆"]]);
  assert.equal(enviados[3][1], "✅ Mensaje enviado a 2 grupo(s).");
  assert.deepEqual(esperas, [(AVISO_TODOS.ESPERA_MIN_MS + AVISO_TODOS.ESPERA_MAX_MS) / 2], "una espera entre grupo y grupo, de 20 a 40 s");
});

// The notice goes as it was typed, line breaks included (textoCompleto, lib/comandos.js): it went out in a single line.
test(".avisartodos: el aviso sale con sus saltos de línea", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  F.initDataDB({ chat: "renglones@g.us", sender: "111@lid", senderJid: "" });
  const esperarReal = _dep.esperar;
  const clientReal = globalThis.client;
  _dep.esperar = async () => {};
  const enviados = [];
  try {
    const client = { groupFetchAllParticipating: async () => ({ "renglones@g.us": {} }), sendText: async (chat, t) => enviados.push([chat, t]) };
    globalThis.client = client;
    await P.run({ chat: "59899111222@s.whatsapp.net" }, { client, text: "Hoy arranca el ranking 🏆 Todos a votar", textoCompleto: "Hoy arranca el ranking 🏆\nTodos a votar", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    globalThis.client = clientReal;
  }
  assert.deepEqual(enviados.find(([chat]) => chat === "renglones@g.us"), ["renglones@g.us", "Hoy arranca el ranking 🏆\nTodos a votar"]);
});

// Spaced out like that, a notice to fifty groups takes some 25 minutes: one with a typo couldn't be stopped, and a
// second one sent meanwhile went out alongside it.
test(".avisartodos: .avisartodos cancelar lo corta, aun en medio de una espera, y no sale otro mientras tanto", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const clientReal = globalThis.client;
  // Each wait between groups lasts until the notice is cut.
  let esperando = 0;
  _dep.esperar = (ms, valor, { signal } = {}) =>
    new Promise((resolve, reject) => {
      esperando++;
      signal?.addEventListener("abort", () => reject(new Error("cortado")), { once: true });
    });
  const enviados = [];
  const client = { groupFetchAllParticipating: async () => ({ "a@g.us": {}, "b@g.us": {}, "c@g.us": {} }), sendText: async (chat, t) => enviados.push([chat, t]) };
  globalThis.client = client;
  const correr = (text) => P.run({ chat: DUENO }, { client, text, isOwner: true });
  const alDueno = () => enviados.filter(([chat]) => chat === DUENO).map(([, t]) => t);
  const aLosGrupos = () => enviados.filter(([chat]) => chat !== DUENO);
  try {
    const aviso = correr("Mañana no hay ranking");
    for (let i = 0; i < 100 && !esperando; i++) await new Promise((r) => setImmediate(r));
    assert.equal(esperando, 1, "mandó al primer grupo y espera para el segundo");

    const otro = correr("Otro aviso"); // awaited after the check: a second notice that did start would wait forever here
    for (let i = 0; i < 100 && alDueno().length < 2; i++) await new Promise((r) => setImmediate(r));
    assert.equal(alDueno().at(-1), "📣 Ya estoy mandando un aviso: va por 1 de 3 grupo(s). Esperá a que termine o cortalo con .avisartodos cancelar.");
    await otro;
    await correr("");
    assert.match(alDueno().at(-1), /va por 1 de 3 grupo\(s\)/, "sin texto, dice cómo va");

    await correr("cancelar");
    await aviso;
    assert.equal(alDueno().at(-1), "⏹️ Corté el aviso: llegó a 1 de 3 grupo(s).");
    assert.deepEqual(aLosGrupos(), [["a@g.us", "Mañana no hay ranking"]], "ni el resto, ni el otro aviso");

    await correr("cancelar");
    assert.equal(alDueno().at(-1), "No hay ningún aviso saliendo.");
    _dep.esperar = async () => {};
    await correr("Ahora sí");
    assert.equal(alDueno().at(-1), "✅ Mensaje enviado a 3 grupo(s).", "cortado el anterior, sale uno nuevo");
  } finally {
    _dep.esperar = esperarReal;
    globalThis.client = clientReal;
  }
});

const vuelta = () => new Promise((r) => setImmediate(r));
async function hasta(condicion) {
  for (let i = 0; i < 200 && !condicion(); i++) await vuelta();
  assert.ok(condicion(), "no llegó a pasar");
}
// A wait between groups that lasts until the notice is cut; like the real one, cut already, it doesn't even start.
const esperaHastaCortar = (ms, valor, { signal } = {}) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("cortado"));
    signal?.addEventListener("abort", () => reject(new Error("cortado")), { once: true });
  });

// The cancel answers right away, even while a group send is on its way, which can't be called back; and the corrected
// notice can go out right after, without waiting for that send to finish.
test(".avisartodos: cancelar contesta en el momento, aunque un envío esté saliendo, y deja mandar el corregido", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const clientReal = globalThis.client;
  const enviados = [];
  let soltar = null;
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": {}, "b@g.us": {}, "c@g.us": {} }),
    sendText: (chat, t) => {
      enviados.push([chat, t]);
      // The second group's send takes its time: its queue is busy, or it's a big group.
      return chat === "b@g.us" && t === "Con un error" ? new Promise((r) => (soltar = r)) : Promise.resolve();
    },
  };
  globalThis.client = client;
  const correr = (text) => P.run({ chat: DUENO }, { client, text, isOwner: true });
  const alDueno = () => enviados.filter(([chat]) => chat === DUENO).map(([, t]) => t);
  const grupos = (texto) => enviados.filter(([, t]) => t === texto).map(([chat]) => chat);
  try {
    _dep.esperar = async () => {};
    const conError = correr("Con un error");
    await hasta(() => soltar);
    await correr("cancelar");
    assert.equal(alDueno().at(-1), "⏹️ Corté el aviso: llegó a 1 de 3 grupo(s), más el que estaba saliendo.");

    // The corrected one's waits last until it's cut.
    _dep.esperar = esperaHastaCortar;
    const corregido = correr("El corregido");
    await hasta(() => grupos("El corregido").length === 1);
    soltar();
    await conError;
    assert.deepEqual(grupos("Con un error"), ["a@g.us", "b@g.us"], "el cortado no sigue");
    assert.ok(globalThis.avisoATodos, "y al terminar no le saca el lugar al corregido");
    await correr("cancelar");
    await corregido;
    assert.deepEqual(alDueno().filter((t) => t.startsWith("⏹️")), ["⏹️ Corté el aviso: llegó a 1 de 3 grupo(s), más el que estaba saliendo.", "⏹️ Corté el aviso: llegó a 1 de 3 grupo(s)."], "una respuesta por cada corte");
  } finally {
    _dep.esperar = esperarReal;
    globalThis.client = clientReal;
  }
});

// After a reconnection the socket that took the command is closed, and whatever goes through it fails: the rest goes
// through the new one (globalThis.client, which main.js replaces).
test(".avisartodos: si el bot se reconecta a mitad del aviso, sigue por la conexión nueva", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const clientReal = globalThis.client;
  const enviados = [];
  const socket = (nombre) => {
    const s = { abierto: true, groupFetchAllParticipating: async () => ({ "a@g.us": {}, "b@g.us": {}, "c@g.us": {} }) };
    s.sendText = async (chat, t) => {
      if (!s.abierto) throw new Error("Connection Closed");
      enviados.push(`${nombre} → ${chat}: ${t}`);
      // Right after the first group, the connection drops and main.js makes a new socket.
      if (chat === "a@g.us") {
        s.abierto = false;
        globalThis.client = nuevo;
      }
    };
    return s;
  };
  const viejo = socket("viejo");
  const nuevo = socket("nuevo");
  globalThis.client = viejo;
  _dep.esperar = async () => {};
  try {
    await P.run({ chat: DUENO }, { client: viejo, text: "Mañana no hay ranking", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    globalThis.client = clientReal;
  }
  assert.deepEqual(enviados.slice(1), ["viejo → a@g.us: Mañana no hay ranking", "nuevo → b@g.us: Mañana no hay ranking", "nuevo → c@g.us: Mañana no hay ranking", `nuevo → ${DUENO}: ✅ Mensaje enviado a 3 grupo(s).`]);
});

// While main.js reconnects (5 s later, then 10 s...), each group whose turn came failed and was lost, and the end said
// "(2 fallaron)" without saying which. It waits for the connection, gives what fails one more go at the end, and names
// the groups it couldn't reach even so.
test(".avisartodos: sin conexión espera a que vuelva, y dice a qué grupos no llegó", async () => {
  const { default: P, AVISO_TODOS, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const enviados = [];
  const esperas = [];
  let vuelveEn = 0; // waits until the connection is back
  _dep.esperar = async (ms) => {
    esperas.push(ms);
    if (vuelveEn && --vuelveEn === 0) globalThis.botConectado = true;
  };
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" }, "c@g.us": { subject: "Fútbol" }, "d@g.us": { subject: "Laburo" } }),
    sendText: async (chat, t) => {
      if (!globalThis.botConectado) throw cerrada();
      if (chat === "c@g.us") throw rechazada(403, "forbidden"); // a group where it never goes out: the bot isn't in it
      enviados.push([chat, t]);
      // Right after the first group the connection drops, and it's back two waits later.
      if (chat === "a@g.us") [globalThis.botConectado, vuelveEn] = [false, 2];
    },
  };
  globalThis.client = client;
  console.error = () => {};
  try {
    await P.run({ chat: DUENO }, { client, text: "Mañana no hay ranking", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
    globalThis.botConectado = true;
  }
  assert.deepEqual(enviados.slice(1).map(([chat]) => chat), ["a@g.us", "b@g.us", "d@g.us", DUENO], "el de mientras estuvo caída sale al volver");
  assert.ok(esperas.includes(AVISO_TODOS.REVISAR_CONEXION_MS), "esperó a la conexión");
  assert.equal(enviados.at(-1)[1], "✅ Mensaje enviado a 3 grupo(s). No salió en 1, ni probando de nuevo: Fútbol.");
});

// What Baileys throws when the socket is closed: before writing anything (lib/Socket/socket.js, sendRawMessage).
const cerrada = () => Object.assign(new Error("Connection Closed"), { output: { statusCode: 428 } });
// What it throws when WhatsApp answers one of the questions it asks before writing the message with an error (the
// group's devices, its metadata): a Boom whose data is WhatsApp's code (assertNodeErrorFree,
// WABinary/generic-utils.js).
const rechazada = (codigo, texto) => Object.assign(new Error(texto), { isBoom: true, data: codigo, output: { statusCode: 500 } });

// The second go is for what surely didn't go out: Baileys' Connection Closed, the socket's close code (a number) if it
// closed while Baileys asked the group's devices, an error WhatsApp answered with. A Timed Out (408) may come with the
// message already sent, since Baileys races the write against a timer, and trying it again sent it twice. That one is
// told apart, not repeated. The close code used to be taken for it: the group was left without the notice.
test(".avisartodos: vuelve a probar lo que seguro no salió, y lo que no sabe si llegó no lo repite", async () => {
  const { default: P, AVISO_TODOS, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const intentos = {};
  const esperas = [];
  const errores = [];
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" }, "c@g.us": { subject: "Fútbol" }, "d@g.us": { subject: "Laburo" }, "e@g.us": { subject: "Barrio" } }),
    sendText: async (chat, t) => {
      if (chat !== DUENO) intentos[chat] = (intentos[chat] || 0) + 1;
      if (chat === "a@g.us" && intentos[chat] === 1) throw cerrada(); // the first time only
      if (chat === "b@g.us") throw Object.assign(new Error("Timed Out"), { output: { statusCode: 408 } });
      if (chat === "d@g.us" && intentos[chat] === 1) return Promise.reject(1006); // the first time only
      if (chat === "e@g.us") throw rechazada(403, "forbidden");
      return { chat, t };
    },
  };
  const finales = [];
  const enviarFinal = client.sendText;
  client.sendText = async (chat, t, ...resto) => {
    if (chat === DUENO) finales.push(t);
    return enviarFinal(chat, t, ...resto);
  };
  globalThis.client = client;
  _dep.esperar = async (ms) => esperas.push(ms);
  console.error = (...partes) => errores.push(partes.join(" "));
  try {
    await P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }
  assert.deepEqual(intentos, { "a@g.us": 2, "b@g.us": 1, "c@g.us": 1, "d@g.us": 2, "e@g.us": 2 }, "Amigos y Laburo salen al segundo intento, Barrio prueba dos veces; Familia, una sola vez");
  assert.equal(esperas.length, 7, "una espera antes de cada grupo después del primero, y otra antes de cada segundo intento");
  assert.equal(finales.at(-1), "✅ Mensaje enviado a 3 grupo(s). No salió en 1, ni probando de nuevo: Barrio. No sé si llegó a 1 (falló mientras salía), y no lo repetí para no mandarlo dos veces: Familia.");
  assert.ok(errores.includes("[avisar-todos] falló en d@g.us: 1006"), "el log dice el código de cierre");
  assert.ok(AVISO_TODOS.REVISAR_CONEXION_MS > 0);
});

// Cut with a group that didn't take it yet: the owner hears which one, by name.
test(".avisartodos: cortado con un grupo que falló, dice cuál", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const al = [];
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" } }),
    sendText: async (chat, t) => {
      al.push([chat, t]);
      if (chat === "a@g.us") throw cerrada();
    },
  };
  globalThis.client = client;
  _dep.esperar = esperaHastaCortar;
  console.error = () => {};
  try {
    const corre = P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
    await hasta(() => al.some(([chat]) => chat === "a@g.us"));
    await P.run({ chat: DUENO }, { client, text: "cancelar", isOwner: true });
    await corre;
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }
  assert.equal(al.filter(([chat]) => chat === DUENO).at(-1)[1], "⏹️ Corté el aviso: llegó a 0 de 2 grupo(s) (no salió en Amigos).");
});

// How it goes, and how far a cut one got, during the second go: the group on its way isn't one it didn't reach. And the
// summary waits for the connection to tell the owner.
test(".avisartodos: durante el segundo intento dice cómo va, y si lo cortan no cuenta como no salido al que estaba saliendo", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const al = [];
  let soltar = null;
  let intentosB = 0;
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" }, "c@g.us": { subject: "Fútbol" } }),
    sendText: (chat, t) => {
      al.push([chat, t]);
      if (chat === "b@g.us" && ++intentosB === 1) return Promise.reject(cerrada());
      if (chat === "b@g.us") return new Promise((r) => (soltar = r)); // the second go takes its time
      return Promise.resolve();
    },
  };
  const alDueno = () => al.filter(([chat]) => chat === DUENO).map(([, t]) => t);
  globalThis.client = client;
  _dep.esperar = async () => {};
  console.error = () => {};
  try {
    const corre = P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
    await hasta(() => soltar);
    await P.run({ chat: DUENO }, { client, text: "", isOwner: true });
    assert.equal(alDueno().at(-1), "📣 Ya estoy mandando un aviso: va por 3 de 3 grupo(s), y vuelve a probar con el que falló. Esperá a que termine o cortalo con .avisartodos cancelar.");
    await P.run({ chat: DUENO }, { client, text: "cancelar", isOwner: true });
    assert.equal(alDueno().at(-1), "⏹️ Corté el aviso: llegó a 2 de 3 grupo(s), más el que estaba saliendo.");
    soltar();
    await corre;
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }

  // The summary, once the connection is back.
  const finales = [];
  let vuelveEn = 0;
  const conCaida = {
    groupFetchAllParticipating: async () => ({ "a@g.us": {} }),
    sendText: async (chat, t) => {
      if (chat === DUENO && !globalThis.botConectado) throw cerrada();
      if (chat === DUENO) finales.push(t);
      if (chat === "a@g.us") [globalThis.botConectado, vuelveEn] = [false, 2]; // it drops right after the last group
    },
  };
  globalThis.client = conCaida;
  _dep.esperar = async () => {
    if (vuelveEn && --vuelveEn === 0) globalThis.botConectado = true;
  };
  try {
    await P.run({ chat: DUENO }, { client: conCaida, text: "Chau", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    globalThis.client = clientReal;
    globalThis.botConectado = true;
  }
  assert.equal(finales.at(-1), "✅ Mensaje enviado a 1 grupo(s).", "esperó a la conexión para avisar");
});

// What it can't tell whether it got there counts in how it goes and in how far a cut one got; and a group that fails
// like that on the second go is told about too, though it was going to be tried again.
test(".avisartodos: lo que no sabe si llegó cuenta en cómo va, en hasta dónde llegó y en el segundo intento", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const vencido = () => Object.assign(new Error("Timed Out"), { output: { statusCode: 408 } });
  const al = [];
  const client = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" }, "c@g.us": { subject: "Fútbol" } }),
    sendText: async (chat, t) => {
      al.push([chat, t]);
      if (chat === "a@g.us") throw vencido();
    },
  };
  const alDueno = () => al.filter(([chat]) => chat === DUENO).map(([, t]) => t);
  globalThis.client = client;
  _dep.esperar = esperaHastaCortar;
  console.error = () => {};
  try {
    const corre = P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
    await hasta(() => al.some(([chat]) => chat === "a@g.us"));
    await P.run({ chat: DUENO }, { client, text: "", isOwner: true });
    assert.equal(alDueno().at(-1), "📣 Ya estoy mandando un aviso: va por 1 de 3 grupo(s). Esperá a que termine o cortalo con .avisartodos cancelar.");
    await P.run({ chat: DUENO }, { client, text: "cancelar", isOwner: true });
    assert.equal(alDueno().at(-1), "⏹️ Corté el aviso: llegó a 0 de 3 grupo(s) (no sé si llegó a Amigos).");
    await corre;
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }

  // Closed the first time (it surely didn't go out) and failed while going out the second: it may have got there.
  const finales = [];
  let intentosA = 0;
  const otra = {
    groupFetchAllParticipating: async () => ({ "a@g.us": { subject: "Amigos" }, "b@g.us": { subject: "Familia" } }),
    sendText: async (chat, t) => {
      if (chat === DUENO) finales.push(t);
      if (chat === "a@g.us" && ++intentosA === 1) throw cerrada();
      if (chat === "a@g.us") throw vencido();
    },
  };
  globalThis.client = otra;
  _dep.esperar = async () => {};
  console.error = () => {};
  try {
    await P.run({ chat: DUENO }, { client: otra, text: "Hola", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }
  assert.equal(intentosA, 2);
  assert.equal(finales.at(-1), "✅ Mensaje enviado a 1 grupo(s). No sé si llegó a 1 (falló mientras salía), y no lo repetí para no mandarlo dos veces: Amigos.");
});

// If the connection dropped right as "📣 Lo mando a…" went out, the notice ended there: no group got it, and nobody
// told the owner. Whatever it was rejected with: the socket's close code, as Baileys rejects with it, nothing at all
// (reading .message off a null threw inside the catch, and no group got it either), or an error with no message, which
// left the log empty.
test(".avisartodos: si no sale el aviso de que arranca, a los grupos les llega igual", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  for (const [rechazo, log] of [[1006, "1006"], [null, "null"], [new Error(""), "Error"], [new Error("Connection Closed"), "Connection Closed"]]) {
    const enviados = [];
    const errores = [];
    const client = {
      groupFetchAllParticipating: async () => ({ "a@g.us": {}, "b@g.us": {} }),
      sendText: async (chat, t) => {
        if (t.startsWith("📣")) return Promise.reject(rechazo);
        enviados.push([chat, t]);
      },
    };
    globalThis.client = client;
    _dep.esperar = async () => {};
    console.error = (...partes) => errores.push(partes.map(String).join(" ")); // as it prints them: null is "null"
    try {
      await P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
    } finally {
      _dep.esperar = esperarReal;
      [globalThis.client, console.error] = [clientReal, errorReal];
    }
    assert.deepEqual(enviados, [["a@g.us", "Hola"], ["b@g.us", "Hola"], [DUENO, "✅ Mensaje enviado a 2 grupo(s)."]], log);
    assert.deepEqual(errores, [`[avisar-todos] no salió el aviso de que arranca: ${log}`], "el log dice con qué se rechazó");
  }
});

// Each group's log said nothing for an error with no message, as the first notice's did. A group's name is whatever its
// admins typed, and one with an "@" and digits ("Ventas @59899…") tagged that person in the owner's summary, sendText
// turning it into a mention. And the list of groups, already paid for, goes into the cache as of when it was asked,
// noting which are closed: left to groups.update it was taken as asked for long before.
test(".avisartodos: el log de cada grupo, los nombres sin menciones y la lista de grupos en la caché", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const DUENO = "59899111222@s.whatsapp.net";
  const [VENTAS, OTRO] = ["avisar-ventas@g.us", "avisar-otro@g.us"];
  const esperarReal = _dep.esperar;
  const [clientReal, errorReal] = [globalThis.client, console.error];
  const enviados = [];
  const errores = [];
  const client = {
    chats: {},
    groupFetchAllParticipating: async () => ({ [VENTAS]: { id: VENTAS, subject: "Ventas @59899123456", announce: true, participants: [] }, [OTRO]: { id: OTRO, subject: "Otro", announce: false, participants: [] } }),
    sendText: async (chat, t) => {
      if (chat === VENTAS) return Promise.reject(new Error(""));
      enviados.push([chat, t]);
    },
  };
  globalThis.client = client;
  _dep.esperar = async () => {};
  console.error = (...partes) => errores.push(partes.map(String).join(" "));
  const antes = Date.now();
  try {
    await P.run({ chat: DUENO }, { client, text: "Hola", isOwner: true });
  } finally {
    _dep.esperar = esperarReal;
    [globalThis.client, console.error] = [clientReal, errorReal];
  }
  assert.ok(errores.includes(`[avisar-todos] falló en ${VENTAS}: Error`), JSON.stringify(errores));
  assert.equal(enviados.at(-1)[1], "✅ Mensaje enviado a 1 grupo(s). No sé si llegó a 1 (falló mientras salía), y no lo repetí para no mandarlo dos veces: Ventas 59899123456.");
  const [cierre] = F.cierresGrupo(VENTAS);
  assert.ok(cierre?.hasta === null && cierre.desde >= antes, "el cerrado queda anotado desde que se pidió la lista");
  assert.deepEqual(F.cierresGrupo(OTRO), []);
});

// With two owners, the one who cuts it hears it from the cancel, and the one who started it, at the end. And cut while
// the list of groups was coming, it doesn't go to any.
test(".avisartodos: cortado desde otro chat, les avisa a los dos; cortado antes de arrancar, no sale", async () => {
  const { default: P, _dep } = await import("../plugins/avisar-todos.js");
  const [A, B] = ["59899111222@s.whatsapp.net", "59899333444@s.whatsapp.net"];
  const esperarReal = _dep.esperar;
  const clientReal = globalThis.client;
  const enviados = [];
  let lista = async () => ({ "a@g.us": {}, "b@g.us": {} });
  const client = { groupFetchAllParticipating: () => lista(), sendText: async (chat, t) => enviados.push([chat, t]) };
  globalThis.client = client;
  const a = (chat) => enviados.filter(([c]) => c === chat).map(([, t]) => t);
  _dep.esperar = esperaHastaCortar;
  try {
    const deA = P.run({ chat: A }, { client, text: "Hola", isOwner: true });
    await hasta(() => a("a@g.us").length === 1);
    await P.run({ chat: B }, { client, text: "cancelar", isOwner: true });
    assert.deepEqual(a(B), ["⏹️ Corté el aviso: llegó a 1 de 2 grupo(s)."]);
    await deA;
    assert.equal(a(A).at(-1), "⏹️ Cortaron el aviso desde otro chat: llegó a 1 de 2 grupo(s).");

    enviados.length = 0;
    let soltarLista;
    lista = () => new Promise((r) => (soltarLista = () => r({ "a@g.us": {}, "b@g.us": {} })));
    const otro = P.run({ chat: A }, { client, text: "Hola de nuevo", isOwner: true });
    await hasta(() => soltarLista);
    await P.run({ chat: A }, { client, text: "cancelar", isOwner: true });
    soltarLista();
    await otro;
    assert.deepEqual(enviados, [[A, "⏹️ Corté el aviso: no salió a ningún grupo."]], "ni el 📣 de que arranca");
  } finally {
    _dep.esperar = esperarReal;
    globalThis.client = clientReal;
  }
});
