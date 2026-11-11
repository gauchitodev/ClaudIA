import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// A post a moderator takes down (lib/compraventa.js: cambiarEstado, cambiarPorComando, yaRetirada). A moderator's .baja
// of somebody else's post used to be a take-down like its author's: they undid it with .sigue, the reason written
// after the number was dropped, and nobody told them. And a seller who sends the same ad every few days had it back up
// without even meaning to. Now it's "retirada": final for its author, told to them with the reason, and the same ad
// isn't taken from them again for a while. And a moderator takes down everything a person has up at once.

let F, C, Hook, Cmd;
let k = 0;
const DIA = 24 * 3600e3;

before(async () => {
  ({ F } = await prepararBase("retirar"));
  C = await import("../lib/compraventa.js");
  Hook = (await import("../plugins/_compraventa.js")).default;
  Cmd = (await import("../plugins/compraventa.js")).default;
});

// A group of a test's own (the posts are numbered in each), with people the bot knows: 111 and 333 post, 222 moderates.
// And a neighbour with an id as long as a real one, which is what a mention written in a text looks like.
const VECINA = "5989900044@lid";
function grupo(chat, { ventas = false } = {}) {
  for (const n of [111, 222, 333]) F.initDataDB({ chat, sender: `${n}@lid`, senderJid: `59899000${n}@s.whatsapp.net`, pushName: `P${n}` });
  F.initDataDB({ chat, sender: VECINA, senderJid: "", pushName: "Vecina" });
  if (ventas) F.updateChat(chat, { games: 0, monedas: 0 });
  return chat;
}
const publicar = (chat, texto, { quien = "111@lid", tipo = "vendo", id = null } = {}) => C.publicar(chat, quien, tipo, texto, id).numero;
const estados = (chat, numeros) => numeros.map((n) => F.getPublicacion(chat, n).estado);
const enviadosA = (chat, desde = 0) => globalThis.enviados.slice(desde).filter((e) => e.chat === chat).map((e) => e.msg);
// A command as handle-message.js hands it over: a moderator's when "mod" says so, with the message's mentions and the
// message it replies to. Returns what the bot said to the group.
async function comando(chat, sender, command, text = "", { mod = false, quoted = null, mentionedJid = [] } = {}) {
  const antes = globalThis.enviados.length;
  await Cmd.run({ chat, sender, text, isGroup: true, key: { id: `K${++k}` }, quoted, mentionedJid }, { client: conexion.client, command, args: text.trim() ? text.trim().split(/\s+/) : [], text, isMod: mod });
  return enviadosA(chat, antes);
}
async function escribir(chat, sender, text, { quoted = null } = {}) {
  const antes = globalThis.enviados.length;
  const marcas = [];
  await Hook.before({ chat, sender, text, isGroup: true, key: { id: `K${++k}`, participant: sender }, quoted, react: async (e) => void marcas.push(e) }, { client: conexion.client, chat: F.getChat(chat), user: {}, isOwner: false, isMod: false });
  return { dice: enviadosA(chat, antes).map((e) => e.text), marcas };
}
const cita = (id, sender, extra = {}) => ({ id, sender, fromMe: false, isBaileys: false, text: "…", ...extra });
const MOD = { mod: true };
const SACO = (quien, cuales, motivo = "") => `🚫 @${quien}, un moderador sacó del catálogo ${cuales}${motivo ? `: ${motivo}` : ""}. Para que ${/^tus /.test(cuales) ? "vuelvan" : "vuelva"}, hablá con un moderador.`;

test("la baja de un moderador sobre una ajena la retira, y a quien la publicó se le avisa con el motivo", async () => {
  const chat = grupo("retirar-baja@g.us");
  const n = publicar(chat, "cuentas de entretenimiento $ 100", { id: "AVISO" });
  F.actualizarPublicacion(chat, n, { actualizada: 5, aviso: 7 }); // old, and asked about
  assert.deepEqual(await comando(chat, "222@lid", "baja", `${n} es una estafa.`, MOD), [{ text: SACO("111", `tu #${n}`, "es una estafa"), mentions: ["111@lid"] }]);
  const p = F.getPublicacion(chat, n);
  assert.deepEqual([p.estado, p.motivo, p.aviso], ["retirada", "es una estafa", 0]);
  assert.ok(Date.now() - p.actualizada < 5000, "queda anotado cuándo la sacó");
  assert.match(C.textoCatalogo(chat).texto, /No hay publicaciones activas/);
  // Its detail is for its author and the moderators, with the reason; for anybody else, that it's gone.
  const detalle = `🏷️ *Vendo #${n}* · 🚫 retirada por un moderador\ncuentas de entretenimiento $ 100\nPrecio: $ 100 · Publicó @111 hace `;
  assert.equal((await comando(chat, "333@lid", "catalogo", String(n)))[0].text, `🏷️ *Vendo #${n}* · 🚫 retirada por un moderador\nYa no está publicada.`);
  for (const [quien, opciones] of [["111@lid", {}], ["222@lid", MOD]]) {
    const { text } = (await comando(chat, quien, "catalogo", String(n), opciones))[0];
    assert.ok(text.startsWith(detalle) && text.endsWith("\nMotivo: es una estafa"), text);
  }

  // Without a reason it says none; and replying to the post, all that's written is the reason.
  const sinMotivo = publicar(chat, "silla gamer $ 3.000");
  assert.deepEqual(await comando(chat, "222@lid", "baja", String(sinMotivo), MOD), [{ text: SACO("111", `tu #${sinMotivo}`), mentions: ["111@lid"] }]);
  assert.equal(F.getPublicacion(chat, sinMotivo).motivo, null);
  assert.doesNotMatch((await comando(chat, "111@lid", "catalogo", String(sinMotivo)))[0].text, /Motivo/);
  const citada = publicar(chat, "mesa ratona $ 900", { id: "MESA" });
  assert.deepEqual(await comando(chat, "222@lid", "baja", "repetida 3 veces", { ...MOD, quoted: cita("MESA", "111@lid") }), [{ text: SACO("111", `tu #${citada}`, "repetida 3 veces"), mentions: ["111@lid"] }]);
  const sinDecirNada = publicar(chat, "lámpara de pie $ 700", { id: "LAMPARA" });
  assert.deepEqual(await comando(chat, "222@lid", "baja", "", { ...MOD, quoted: cita("LAMPARA", "111@lid") }), [{ text: SACO("111", `tu #${sinDecirNada}`), mentions: ["111@lid"] }]);

  // A reason is one line, cut where it gets long, and whoever it names is a name in it: it's shown again later.
  const larga = publicar(chat, "heladera con freezer $ 9.000");
  await comando(chat, "222@lid", "baja", `${larga} le vendió\nuna rota a @5989900044  y no devolvió la plata ${"nunca ".repeat(60)}`, { ...MOD, mentionedJid: [VECINA] });
  const { motivo } = F.getPublicacion(chat, larga);
  assert.ok(motivo.startsWith("le vendió una rota a Vecina y no devolvió la plata nunca nunca") && motivo.length <= 200 && motivo.endsWith("…"), motivo);
});

test("quien la publicó no la reactiva ni la toca; un moderador la devuelve con .sigue", async () => {
  const chat = grupo("retirar-definitiva@g.us");
  const n = publicar(chat, "silla gamer $ 3.000", { id: "AVISO" });
  await comando(chat, "222@lid", "baja", `${n} precio trucho`, MOD);
  const laSaco = `❌ La #${n} la sacó un moderador: precio trucho. Solo un moderador la vuelve a activar.`;
  for (const [command, texto] of [["sigue", String(n)], ["vendido", String(n)], ["reservado", String(n)], ["baja", String(n)], ["precio", `${n} $ 2.000`], ["editar", `${n} silla gamer roja $ 2.000`]]) {
    assert.deepEqual(await comando(chat, "111@lid", command, texto), [{ text: laSaco }], command);
  }
  assert.deepEqual(await comando(chat, "111@lid", "sigue", "", { quoted: cita("AVISO", "111@lid") }), [{ text: laSaco }], "ni respondiendo a su mensaje");
  // Without the dot it's as with any post that's no longer theirs to answer about: nothing.
  for (const texto of [`sigue ${n}`, `Vendido ${n}`, `precio ${n} $ 2.000`]) assert.deepEqual((await escribir(chat, "111@lid", texto)).dice, [], texto);
  assert.deepEqual(estados(chat, [n]), ["retirada"]);
  // Somebody else still hears it isn't theirs.
  assert.match((await comando(chat, "333@lid", "sigue", String(n)))[0].text, /no es tuya/);

  // A moderator can't do anything else with it either, but brings it back; the reason goes with that.
  const retirada = `❌ La #${n} ya está 🚫 retirada por un moderador. Con .sigue ${n} la volvés a activar.`;
  assert.deepEqual(await comando(chat, "222@lid", "vendido", String(n), MOD), [{ text: retirada }]);
  assert.deepEqual(await comando(chat, "222@lid", "precio", `${n} $ 2.000`, MOD), [{ text: retirada }]);
  assert.deepEqual(await comando(chat, "222@lid", "baja", `${n} otra vez`, MOD), [{ text: `❌ La #${n} ya está 🚫 retirada por un moderador.` }]);
  assert.equal(F.getPublicacion(chat, n).motivo, "precio trucho", "y el motivo no se pisa");
  assert.deepEqual(await comando(chat, "222@lid", "sigue", String(n), MOD), [{ text: `👍 La #${n} sigue activa. Te vuelvo a preguntar en 7 días.` }]);
  assert.deepEqual([F.getPublicacion(chat, n).estado, F.getPublicacion(chat, n).motivo], ["activa", null]);
  // And once it's back, it's its author's again.
  assert.equal((await comando(chat, "111@lid", "precio", `${n} $ 2.500`))[0].text, `✏️ Listo, la #${n} ahora está a $ 2.500.`);

  // An author who moderates brings their own back: it's a moderator who's asked for.
  await comando(chat, "222@lid", "baja", String(n), MOD);
  assert.equal((await comando(chat, "111@lid", "sigue", String(n), MOD))[0].text, `👍 La #${n} sigue activa. Te vuelvo a preguntar en 7 días.`);
});

test("una baja propia, o del autor, sigue siendo una baja común: la reactiva quien la publicó", async () => {
  const chat = grupo("retirar-propia@g.us");
  const suya = publicar(chat, "silla gamer $ 3.000");
  const delMod = publicar(chat, "mesa ratona $ 900", { quien: "222@lid" });
  assert.deepEqual(await comando(chat, "111@lid", "baja", `${suya} ya no la vendo`), [{ text: `🗑️ Listo, di de baja la #${suya}.` }]);
  assert.deepEqual(await comando(chat, "222@lid", "baja", `${delMod} ya no la vendo`, MOD), [{ text: `🗑️ Listo, di de baja la #${delMod}.` }]);
  assert.deepEqual([estados(chat, [suya, delMod]), F.getPublicacion(chat, suya).motivo], [["cerrada", "cerrada"], null]);
  assert.equal((await comando(chat, "111@lid", "sigue", String(suya)))[0].text, `👍 La #${suya} sigue activa. Te vuelvo a preguntar en 7 días.`);
  // What a moderator does to somebody else's besides taking it down is what it always was.
  assert.equal((await comando(chat, "222@lid", "vendido", String(suya), MOD))[0].text, `✅ Listo, la #${suya} quedó como concretada. ¡Que la disfrute!`);
  assert.deepEqual(estados(chat, [suya]), ["vendida"]);
});

// One its author closed, sold or let expire, they could bring back with .sigue: a moderator's take-down holds for those
// too.
test("un moderador retira también la que ya no estaba en pie, para que no vuelva", async () => {
  const chat = grupo("retirar-cualquiera@g.us");
  const numeros = ["bici rodado 26 $ 4.000", "mesa ratona $ 900", "silla gamer $ 3.000", "lámpara de pie $ 700"].map((t) => publicar(chat, t));
  for (const [i, estado] of ["cerrada", "vendida", "vencida", "reservada"].entries()) F.actualizarPublicacion(chat, numeros[i], { estado });
  for (const n of numeros) assert.deepEqual(await comando(chat, "222@lid", "baja", `${n} robada`, MOD), [{ text: SACO("111", `tu #${n}`, "robada"), mentions: ["111@lid"] }]);
  assert.deepEqual(estados(chat, numeros), ["retirada", "retirada", "retirada", "retirada"]);
  assert.match((await comando(chat, "111@lid", "sigue", String(numeros[0])))[0].text, /la sacó un moderador: robada/);
});

test("el aviso que sacó un moderador no vuelve a entrar si su autor lo manda de nuevo, por 30 días", async () => {
  const chat = grupo("retirar-repetida@g.us", { ventas: true });
  const n = publicar(chat, "cuentas de entretenimiento $ 100");
  await comando(chat, "222@lid", "baja", `${n} no se venden cuentas`, MOD);
  const noEntra = `Ese aviso lo sacó un moderador (era la #${n}: no se venden cuentas). Para volver a publicarlo, hablá con un moderador.`;
  // By any way, and at another price too: what was wrong with it wasn't what it cost.
  assert.equal(C.publicar(chat, "111@lid", "vendo", "cuentas de entretenimiento $ 100").error, noEntra);
  assert.deepEqual(await comando(chat, "111@lid", "vendo", "Cuentas de entretenimiento, $ 80"), [{ text: `❌ ${noEntra}` }]);
  assert.deepEqual((await escribir(chat, "111@lid", "#vendo cuentas de entretenimiento $ 100")).dice, [`❌ ${noEntra}`]);
  for (let i = 0; i < 2; i++) assert.deepEqual(await escribir(chat, "111@lid", "Vendo cuentas de entretenimiento $ 120 🔥"), { dice: [`❌ ${noEntra}`], marcas: [] }, "escrito suelto, cada vez");
  assert.equal(F.publicacionesActivas(chat).length, 0);
  // Another ad of theirs gets in, and so does the same one from somebody else, or theirs in another group.
  assert.ok(C.publicar(chat, "111@lid", "vendo", "cuentas de ahorro para niños, libro, $ 300").ok, "no dice lo mismo");
  assert.ok(C.publicar(chat, "333@lid", "vendo", "cuentas de entretenimiento $ 100").ok, "de otra persona");
  assert.ok(C.publicar(grupo("retirar-repetida-otro@g.us"), "111@lid", "vendo", "cuentas de entretenimiento $ 100").ok, "en otro grupo");
  // One that lacks something is told that first: it wasn't getting in anyway.
  assert.deepEqual(C.publicar(chat, "111@lid", "vendo", "cuentas de entretenimiento").falta, ["el precio"]);

  // Without a reason, the answer has none.
  const sinMotivo = publicar(chat, "silla gamer $ 3.000");
  await comando(chat, "222@lid", "baja", String(sinMotivo), MOD);
  assert.equal(C.publicar(chat, "111@lid", "vendo", "silla gamer $ 3.000").error, `Ese aviso lo sacó un moderador (era la #${sinMotivo}). Para volver a publicarlo, hablá con un moderador.`);
  // A request a moderator took down is the same.
  const pedido = publicar(chat, "cuentas de streaming", { tipo: "compro" });
  await comando(chat, "222@lid", "baja", String(pedido), MOD);
  assert.match(C.publicar(chat, "111@lid", "compro", "cuentas de streaming").error, /^Ese aviso lo sacó un moderador/);
  assert.ok(C.publicar(chat, "111@lid", "vendo", "cuentas de streaming $ 200").ok, "y una venta no es ese pedido");

  // The thirty days run from the take-down, however old the post was.
  const vieja = publicar(chat, "bici rodado 26 $ 4.000");
  F.actualizarPublicacion(chat, vieja, { actualizada: Date.now() - 40 * DIA });
  await comando(chat, "222@lid", "baja", String(vieja), MOD);
  assert.match(C.publicar(chat, "111@lid", "vendo", "bici rodado 26 $ 4.000").error, /^Ese aviso lo sacó un moderador/);

  // Thirty days on, it's an ad like any other; a day before, not yet.
  F.actualizarPublicacion(chat, n, { actualizada: Date.now() - 29 * DIA });
  assert.equal(C.publicar(chat, "111@lid", "vendo", "cuentas de entretenimiento $ 100").error, noEntra);
  F.actualizarPublicacion(chat, n, { actualizada: Date.now() - 31 * DIA });
  const despues = C.publicar(chat, "111@lid", "vendo", "cuentas de entretenimiento $ 100");
  assert.ok(despues.ok && despues.numero !== n);
  // And when a moderator brings the post back, sending the ad again renews it, as always.
  await comando(chat, "222@lid", "sigue", String(sinMotivo), MOD);
  assert.deepEqual([C.publicar(chat, "111@lid", "vendo", "silla gamer $ 3.000").renovada, estados(chat, [sinMotivo])], [true, ["activa"]]);
});

test("un moderador saca todas las de una persona: con una mención, o «todas» respondiendo a un mensaje suyo", async () => {
  const chat = grupo("retirar-persona@g.us");
  const de111 = ["bici rodado 26 $ 4.000", "mesa ratona $ 900", "silla gamer $ 3.000"].map((t) => publicar(chat, t));
  const de333 = publicar(chat, "lámpara de pie $ 700", { quien: "333@lid" });
  const delMod = publicar(chat, "heladera $ 9.000", { quien: "222@lid" });
  C.cambiarEstado(chat, de111[2], "111@lid", false, "vendido"); // not up: it isn't touched
  // Only a moderator, and only by the mention the command opens with.
  assert.deepEqual(await comando(chat, "333@lid", "baja", "@111 spam", { mentionedJid: ["111@lid"] }), [{ text: "❌ Solo un moderador da de baja las publicaciones de otra persona." }]);
  assert.deepEqual(await comando(chat, "222@lid", "baja", "@111 vende cosas robadas.", { ...MOD, mentionedJid: ["111@lid"] }), [
    { text: SACO("111", `tus #${de111[0]} y #${de111[1]}`, "vende cosas robadas"), mentions: ["111@lid"] },
  ]);
  assert.deepEqual([estados(chat, de111), estados(chat, [de333, delMod])], [["retirada", "retirada", "vendida"], ["activa", "activa"]]);
  assert.deepEqual([F.getPublicacion(chat, de111[0]).motivo, F.getPublicacion(chat, de111[1]).motivo], ["vende cosas robadas", "vende cosas robadas"]);
  assert.deepEqual(await comando(chat, "222@lid", "baja", "@111", { ...MOD, mentionedJid: ["111@lid"] }), [{ text: "❌ P111 no tiene publicaciones activas." }]);

  // A mention further in is part of the reason, and never whose posts go: here it's the #N that goes.
  const deVecina = publicar(chat, "plantas de interior $ 150", { quien: VECINA });
  const otra = publicar(chat, "tostadora $ 500");
  assert.deepEqual(await comando(chat, "222@lid", "baja", `${otra} estafó a @5989900044`, { ...MOD, mentionedJid: [VECINA] }), [{ text: SACO("111", `tu #${otra}`, "estafó a Vecina"), mentions: ["111@lid"] }]);
  assert.deepEqual(estados(chat, [deVecina]), ["activa"]);
  // The one named is the one the command opens with, whatever the order the message lists its mentions in.
  const mas = publicar(chat, "licuadora $ 600");
  await comando(chat, "222@lid", "baja", "@111 le vendió una rota a @5989900044", { ...MOD, mentionedJid: [VECINA, "111@lid"] });
  assert.deepEqual([estados(chat, [mas, deVecina, de333]), F.getPublicacion(chat, mas).motivo], [["retirada", "activa", "activa"], "le vendió una rota a Vecina"]);

  // Replying to a post, what goes is that post and no other of its author's: taking down all of them asks for "todas".
  const [unaDe333, otraDe333] = [publicar(chat, "ventilador de pie $ 800", { quien: "333@lid", id: "VENTILADOR" }), publicar(chat, "estufa a gas $ 1.500", { quien: "333@lid" })];
  assert.deepEqual(await comando(chat, "222@lid", "baja", "no funciona", { ...MOD, quoted: cita("VENTILADOR", "333@lid") }), [{ text: SACO("333", `tu #${unaDe333}`, "no funciona"), mentions: ["333@lid"] }]);
  assert.deepEqual(estados(chat, [unaDe333, otraDe333, de333]), ["retirada", "activa", "activa"]);
  C.cambiarEstado(chat, otraDe333, "333@lid", false, "baja");

  // "todas", replying to a message of theirs (any message, not a post).
  assert.deepEqual(await comando(chat, "222@lid", "baja", "todas spam", { ...MOD, quoted: cita("CUALQUIERA", "333@lid") }), [{ text: SACO("333", `tu #${de333}`, "spam"), mentions: ["333@lid"] }]);
  assert.deepEqual(estados(chat, [de333, delMod]), ["retirada", "activa"]);
  // Replying to one of the bot's messages, or to their own, "todas" is the moderator's own, as for anybody.
  const otraDelMod = publicar(chat, "freezer $ 7.000", { quien: "222@lid" });
  assert.deepEqual(await comando(chat, "222@lid", "baja", "todas", { ...MOD, quoted: cita("DEL-BOT", "bot@lid", { fromMe: true, isBaileys: true }) }), [{ text: `🗑️ Listo, di de baja las #${delMod} y #${otraDelMod}.` }]);
  assert.deepEqual(estados(chat, [delMod, otraDelMod]), ["cerrada", "cerrada"]);
  // And for whoever isn't a moderator, replying to somebody's message changes nothing: "todas" is theirs.
  const de333b = publicar(chat, "aspiradora $ 400", { quien: "333@lid" });
  const nueva = publicar(chat, "plancha $ 300");
  assert.deepEqual(await comando(chat, "111@lid", "baja", "todas", { quoted: cita("CUALQUIERA", "333@lid") }), [{ text: `🗑️ Listo, di de baja la #${nueva}.` }]);
  assert.deepEqual(estados(chat, [de333b, nueva]), ["activa", "cerrada"]);
  // Naming themselves, it's their own too.
  const propia = publicar(chat, "radio $ 200", { quien: "222@lid" });
  await comando(chat, "222@lid", "baja", "@222", { ...MOD, mentionedJid: ["222@lid"] });
  assert.deepEqual(estados(chat, [propia]), ["activa"], "una mención propia no es un número ni «todas»: no dice cuál");
  // Only .baja takes a person.
  assert.match((await comando(chat, "222@lid", "vendido", "@333", { ...MOD, mentionedJid: ["333@lid"] }))[0].text, /^❌ ¿Cuál\?/);
  assert.deepEqual(estados(chat, [de333b]), ["activa"]);
});

test("varias de una vez: a cada persona se le avisa una vez, con todas las suyas", async () => {
  const chat = grupo("retirar-varias@g.us");
  const a = publicar(chat, "bici rodado 26 $ 4.000");
  const b = publicar(chat, "mesa ratona $ 900");
  const c = publicar(chat, "lámpara de pie $ 700", { quien: "333@lid" });
  const d = publicar(chat, "heladera $ 9.000", { quien: "222@lid" });
  assert.deepEqual(await comando(chat, "222@lid", "baja", `${a} ${b} ${c} ${d} 99`, MOD), [
    {
      text: [`🗑️ Listo, di de baja la #${d}.`, SACO("111", `tus #${a} y #${b}`), SACO("333", `tu #${c}`), "❌ No hay ninguna publicación #99 en este grupo."].join("\n"),
      mentions: ["111@lid", "333@lid"],
    },
  ]);
  assert.deepEqual(estados(chat, [a, b, c, d]), ["retirada", "retirada", "retirada", "cerrada"]);
  // With something after a number that isn't another number, it's that one alone, and the rest is the reason.
  const e = publicar(chat, "tostadora $ 500");
  const f = publicar(chat, "licuadora $ 600");
  assert.deepEqual(await comando(chat, "222@lid", "baja", `${e} ${f} duplicadas`, MOD), [{ text: SACO("111", `tu #${e}`, `${f} duplicadas`), mentions: ["111@lid"] }]);
  assert.deepEqual(estados(chat, [e, f]), ["retirada", "activa"]);
});

// What refers to a post by a message of its own (the bot's question, the ad's message edited) finds a retired one
// like one its author closed: nothing comes of it.
test("ni la ronda ni las respuestas al aviso ni editar el mensaje traen de vuelta una retirada", async () => {
  const chat = grupo("retirar-nada@g.us", { ventas: true });
  const n = publicar(chat, "silla gamer $ 3.000", { id: "AVISO" });
  const otra = publicar(chat, "mesa ratona $ 900");
  for (const numero of [n, otra]) F.actualizarPublicacion(chat, numero, { aviso: 5, mensajeAviso: "PREGUNTA" });
  await comando(chat, "222@lid", "baja", `${n} spam`, MOD);
  // Replying to the question that named both: "sigue" is about the one still up.
  const pregunta = cita("PREGUNTA", "bot@lid", { fromMe: true, isBaileys: true });
  assert.deepEqual((await escribir(chat, "111@lid", "sigue", { quoted: pregunta })).dice, [`👍 La #${otra} sigue activa. Te vuelvo a preguntar en 7 días.`]);
  assert.deepEqual(await comando(chat, "111@lid", "sigue", "todas", { quoted: pregunta }), [{ text: `👍 La #${otra} sigue activa. Te vuelvo a preguntar en 7 días.` }]);
  assert.deepEqual(estados(chat, [n, otra]), ["retirada", "activa"]);
  // The day's round has nothing to ask about it, nor to take down.
  const ahora = new Date().setHours(13, 0, 0, 0) + 9 * DIA;
  const antes = globalThis.enviados.length;
  await C.chequearPublicaciones(ahora);
  assert.ok(!enviadosA(chat, antes).some((e) => new RegExp(`#${n}\\b`).test(e.text || "")), "la ronda no la nombra");
  assert.deepEqual(estados(chat, [n]), ["retirada"]);
  // Its message edited rewrites nothing, and makes no other post.
  const cuantas = F.publicacionesActivas(chat).length;
  const edicion = { type: 14, key: { id: "AVISO" }, editedMessage: { conversation: "Vendo silla gamer $ 2.500" } };
  await Hook.before({ chat, sender: "111@lid", text: "", isGroup: true, key: { id: `E${++k}`, participant: "111@lid" }, message: { protocolMessage: edicion }, quoted: null }, { client: conexion.client, chat: F.getChat(chat), user: {}, isOwner: false, isMod: false });
  assert.deepEqual([F.getPublicacion(chat, n).texto, estados(chat, [n]), F.publicacionesActivas(chat).length], ["silla gamer $ 3.000", ["retirada"], cuantas]);
});
