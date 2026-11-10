import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// How a real sales group used the marketplace (lib/compraventa.js): nobody types the dot. To the "¿sigue en pie?"
// people answered "Sigue 20" or "Vendido #17", which were no command, and two days later the post was taken down "for
// lack of an answer"; and the bot asked about each post apart, at any hour, and announced each take-down apart. Here:
// the answers without the prefix, the state commands for several posts at once, and the day's round of questions and
// take-downs.

let F, C, Hook, Cmd;
const DIA = 24 * 3600e3;
const MIN = 60e3;
// The round runs from 11 to 21 local time: today at this hour, whatever the time the tests run at. Today and not a date
// of its own: a pass goes over every group, and seen from a far day every other test's posts would be due. What a test
// counts is what was sent to its own group: another test may have left posts due. "Today" is the day the file started
// on, should midnight come halfway.
const INICIO = Date.now();
const hoyALas = (hora, minutos = 0) => new Date(INICIO).setHours(hora, minutos, 0, 0);
let k = 0;
const reacciones = [];

before(async () => {
  ({ F } = await prepararBase("respuestas"));
  C = await import("../lib/compraventa.js");
  Hook = (await import("../plugins/_compraventa.js")).default;
  Cmd = (await import("../plugins/compraventa.js")).default;
});

// A group of a test's own (the posts are numbered in each group), with people named like their ids.
function grupo(chat) {
  for (const n of [111, 222, 333]) F.initDataDB({ chat, sender: `${n}@lid`, senderJid: `59899000${n}@s.whatsapp.net`, pushName: `P${n}` });
  return chat;
}
// What the bot sent to a group from a point on: [{ text, mentions }].
const enviadosA = (chat, desde = 0) => globalThis.enviados.slice(desde).filter((e) => e.chat === chat).map((e) => e.msg);
const ultimo = () => globalThis.enviados.at(-1).msg.text;
// A message through the hook, as handle-message.js hands it over.
async function escribir(chat, sender, text, { quoted = null, ...contexto } = {}) {
  const m = { chat, sender, text, isGroup: true, key: { id: `K${++k}` }, quoted, react: async (e) => reacciones.push(e) };
  await Hook.before(m, { client: conexion.client, chat: F.getChat(chat), user: {}, isOwner: false, isMod: false, ...contexto });
  return m;
}
const comando = (chat, sender, command, text = "", { quoted = null, ...contexto } = {}) =>
  Cmd.run({ chat, sender, text, isGroup: true, key: { id: `K${++k}` }, quoted }, { client: conexion.client, command, args: text.trim() ? text.trim().split(/\s+/) : [], text, isMod: false, ...contexto });
// A reply to one of the bot's messages, as lib/wa-socket.js builds what's quoted.
const alBot = (id) => ({ id, sender: "bot@lid", fromMe: true, isBaileys: true, text: "…" });
const estados = (chat, ...numeros) => numeros.map((n) => F.getPublicacion(chat, n).estado);
const publicar = (chat, quien, texto, tipo = "vendo") => C.publicar(chat, quien, tipo, texto).numero;
// A post nobody touched for more than a week, or one already asked about.
const vieja = (chat, numero, ahora) => F.actualizarPublicacion(chat, numero, { actualizada: ahora - 8 * DIA });
const preguntada = (chat, numero, cuando) => F.actualizarPublicacion(chat, numero, { actualizada: cuando - 8 * DIA, aviso: cuando });

test("una respuesta sin el punto se lee como la escribieron en un grupo de verdad", () => {
  const pedidos = (texto) => C.leerRespuesta(texto)?.pedidos.map((p) => `${p.accion} ${p.todas ? "todas" : p.numeros.join(",")}`).join(" · ");
  // As they were written, to the bot's "¿sigue en pie?", and ignored.
  assert.equal(pedidos("Sigue 20"), "sigue 20");
  assert.equal(pedidos("sigue 31"), "sigue 31");
  assert.equal(pedidos("Vendido #17"), "vendido 17");
  assert.equal(pedidos("vendido 39"), "vendido 39");
  assert.equal(pedidos("Vendido 19 / Baja 19"), "vendido 19 · baja 19");
  assert.equal(pedidos("Baja #30. Sin stock por el momento"), "baja 30");
  assert.equal(pedidos("Di respuesta si \nReitero \nSigue 20"), "sigue 20");
  // The same, said the ways people say it.
  for (const texto of ["Sigue 20, gracias", "Sigue 20 gracias!", "sigue 20 👍", "*sigue 20*", "Hola, sigue 20", "hola sigue 20", "Sí, sigue 20", "Sigue la 20", "Sigue en pie la 20", "sigue nro 20", "Sigue n° 20", "Sigue 20.", "sigue 20 todavía", "@59899123456 sigue 20", "SIGUE 20"]) {
    assert.equal(pedidos(texto), "sigue 20", texto);
  }
  assert.equal(pedidos("Vendida la publicación 17"), "vendido 17");
  assert.equal(pedidos("Reservada #12"), "reservado 12");
  assert.equal(pedidos("sigue 5, 6 y 7"), "sigue 5,6,7");
  assert.equal(pedidos("Siguen 5 6 7"), "sigue 5,6,7");
  assert.equal(pedidos("Sigue todas"), "sigue todas");
  assert.equal(pedidos("siguen todas, gracias"), "sigue todas");
  assert.equal(pedidos("Vendido todo!"), "vendido todas");
  // The word alone says which post only as a reply to one.
  for (const [texto, accion] of [["Vendido", "vendido"], ["Sigue", "sigue"], ["Sigue en pie", "sigue"], ["Vendida, gracias", "vendido"], ["sigue en pie 👍", "sigue"], ["Baja", "baja"]]) {
    assert.deepEqual(C.leerRespuesta(texto), { pedidos: [], sola: accion }, texto);
  }
  // Talk, with the same words: also from that group.
  const charla = [
    "Sigue el canal de la tienda en WhatsApp: https://whatsapp.com/channel/0029Vb9UVm82P59fWdVpR20H",
    "Sigue este enlace para ver nuestro catálogo en WhatsApp: https://wa.me/c/59899000000",
    "Pero sigue vivo",
    'me podrías decir de qué tratan los libros "Pétalos de papel" y "Sigue mi voz"',
    "Hace días, yo la di de baja. Por falta de stock. 🤭",
    "Tenes que responder con .sigue y el número, si no pones el punto no entiende el bot",
  ];
  // And a number that isn't a post's: a quantity, a price, a time, a size.
  const numeros = ["Vendido 2 de los 3 que tenía", "Baja 500 pesos el precio", "Baja 1.500", "Baja $500", "baja 10%", "Vendido 20:30", "Vendidos 2 pares", "Reservado 2 horas", "Sigue 20 lucas", "sigue 1/2", "vendido 2kg", "Vendido 12345678"];
  const otras = ["sigue20", "Seguimos 20", "pero sigue 20", "todavía sigue 20", "#sigue 20", "No sigue", "Sigue todo igual", "", "   "];
  for (const texto of [...charla, ...numeros, ...otras]) assert.equal(C.leerRespuesta(texto), null, texto);
  // An answer is a short message: a long ad that happens to have such a line isn't one.
  assert.equal(C.leerRespuesta(`${"remeras de todos los talles, ".repeat(8)}\nVendido 2`), null);
});

test("sin el punto: quien publicó contesta con el número y pasa lo mismo que con el comando", async () => {
  const chat = grupo("respuestas-sin-punto@g.us");
  const [mesa, silla, lampara, cuadro] = ["mesa de luz $ 800", "silla gamer $ 3.000", "lámpara de pie $ 500", "cuadro grande $ 900"].map((t) => publicar(chat, "111@lid", t));
  const ajena = publicar(chat, "222@lid", "bici rodado 26 $ 4.000");
  preguntada(chat, mesa, Date.now() - DIA);

  let m = await escribir(chat, "111@lid", `Sigue ${mesa}`);
  assert.equal(ultimo(), `👍 La #${mesa} sigue activa. Te vuelvo a preguntar en 7 días.`);
  assert.equal(F.getPublicacion(chat, mesa).aviso, 0, "la pregunta quedó contestada");
  assert.ok(Date.now() - F.getPublicacion(chat, mesa).actualizada < 5000, "y renovada");
  assert.equal(m.respuestaDeVenta, true, "queda marcada: Claudia no la charla");

  await escribir(chat, "111@lid", `Vendido #${silla}`);
  assert.equal(ultimo(), `✅ Listo, la #${silla} quedó como concretada. ¡Que la disfrute!`);
  await escribir(chat, "111@lid", `Baja #${lampara}. Sin stock por el momento`);
  assert.equal(ultimo(), `🗑️ Listo, di de baja la #${lampara}.`);
  // The first thing said of a post stands.
  let antes = globalThis.enviados.length;
  await escribir(chat, "111@lid", `Vendido ${cuadro} / Baja ${cuadro}`);
  assert.deepEqual(enviadosA(chat, antes).map((e) => e.text), [`✅ Listo, la #${cuadro} quedó como concretada. ¡Que la disfrute!`]);
  assert.deepEqual(estados(chat, mesa, silla, lampara, cuadro), ["activa", "vendida", "cerrada", "vendida"]);

  // Someone else's post, one that doesn't exist, or no post at all: that's talk, and nothing is said.
  antes = globalThis.enviados.length;
  m = await escribir(chat, "111@lid", `Vendido ${ajena}`);
  assert.equal(m.respuestaDeVenta, undefined);
  await escribir(chat, "333@lid", `Baja ${ajena}`);
  await escribir(chat, "333@lid", "Sigue 99");
  await escribir(chat, "222@lid", "Sigue el canal de la tienda");
  // One its owner closed stays closed, without a word: with the dot, the command still says why.
  await escribir(chat, "111@lid", `Baja ${silla}`);
  await escribir(chat, "111@lid", `Sigue ${lampara}`);
  assert.equal(enviadosA(chat, antes).length, 0);
  assert.deepEqual(estados(chat, ajena, silla, lampara), ["activa", "vendida", "cerrada"]);
  await comando(chat, "111@lid", "baja", String(silla));
  assert.equal(ultimo(), `❌ La #${silla} ya está ✅ concretada. Con .sigue ${silla} la volvés a activar.`);

  // Whoever posted is known by either identity: the message may bring the number, and the post have the LID.
  await escribir(chat, "59899000222@s.whatsapp.net", `Reservado ${ajena}`);
  assert.equal(F.getPublicacion(chat, ajena).estado, "reservada");
});

test("sin el punto: la que el bot dio de baja por falta de respuesta vuelve con «sigue» y su número", async () => {
  const chat = grupo("respuestas-vencida@g.us");
  const n = publicar(chat, "111@lid", "block de hojas $ 200");
  F.actualizarPublicacion(chat, n, { estado: "vencida" });
  await escribir(chat, "111@lid", `Sigue ${n}`);
  assert.equal(ultimo(), `👍 La #${n} sigue activa. Te vuelvo a preguntar en 7 días.`);
  assert.equal(F.getPublicacion(chat, n).estado, "activa");
});

test("sin el punto: un comando bloqueado con .bladd está bloqueado igual", async () => {
  const chat = grupo("respuestas-bloqueadas@g.us");
  const n = publicar(chat, "111@lid", "mesa de luz $ 800");
  preguntada(chat, n, Date.now() - DIA);
  F.updateChat(chat, { blacklistMode: 1 });
  F.addToChatBlacklist(chat, "sigue");
  const antes = [globalThis.enviados.length, reacciones.length];
  await escribir(chat, "111@lid", `Sigue ${n}`);
  assert.deepEqual([globalThis.enviados.length, reacciones.slice(antes[1])], [antes[0], ["🔒"]], "como cuando se escribe el comando bloqueado");
  assert.ok(F.getPublicacion(chat, n).aviso > 0, "no cambió nada");
  await escribir(chat, "111@lid", `Sigue ${n}`, { isOwner: true });
  assert.equal(F.getPublicacion(chat, n).aviso, 0, "el owner sí");
});

test("sin el punto: con .banchat, .modoadmin o una persona baneada, no contesta", async () => {
  const chat = grupo("respuestas-puertas@g.us");
  const n = publicar(chat, "111@lid", "mesa de luz $ 800");
  const fila = F.getChat(chat);
  const antes = globalThis.enviados.length;
  await escribir(chat, "111@lid", `Vendido ${n}`, { chat: { ...fila, isBanned: 1 } });
  await escribir(chat, "111@lid", `Vendido ${n}`, { chat: { ...fila, adminMode: 1 } });
  await escribir(chat, "111@lid", `Vendido ${n}`, { user: { banned: 1 } });
  assert.deepEqual([globalThis.enviados.length, F.getPublicacion(chat, n).estado], [antes, "activa"]);
});

test("la palabra sola, respondiendo a la publicación o a su confirmación", async () => {
  const chat = grupo("respuestas-citando@g.us");
  // Published by hashtag: the post keeps the person's message and the bot's confirmation.
  const suMensaje = await escribir(chat, "111@lid", "#vendo bicicleta playera $ 2.000");
  const bici = F.getPublicacionPorMensaje(chat, suMensaje.key.id);
  const confirmacion = F.getPublicacion(chat, bici.numero).mensajeBot;
  assert.ok(confirmacion);

  // Without replying to anything, or replying to something else, the word alone is talk.
  const antes = globalThis.enviados.length;
  await escribir(chat, "111@lid", "Vendido");
  await escribir(chat, "111@lid", "Vendido", { quoted: { id: "OTRO", sender: "222@lid", fromMe: false, text: "¿sigue disponible?" } });
  // And it's for whoever posted.
  await escribir(chat, "222@lid", "Vendido", { quoted: alBot(confirmacion) });
  assert.deepEqual([enviadosA(chat, antes).length, F.getPublicacion(chat, bici.numero).estado], [0, "activa"]);

  await escribir(chat, "111@lid", "Reservada", { quoted: alBot(confirmacion) });
  assert.equal(F.getPublicacion(chat, bici.numero).estado, "reservada");
  // As the command does replying to the post: "sigue" frees the reserved one.
  await escribir(chat, "111@lid", "Sigue", { quoted: alBot(confirmacion) });
  assert.deepEqual([ultimo(), F.getPublicacion(chat, bici.numero).estado], [`👍 La #${bici.numero} sigue activa. Te vuelvo a preguntar en 7 días.`, "activa"]);
  await escribir(chat, "111@lid", "Vendido, gracias!", { quoted: { id: suMensaje.key.id, sender: "111@lid", fromMe: false, text: suMensaje.text } });
  assert.equal(ultimo(), `✅ Listo, la #${bici.numero} quedó como concretada. ¡Que la disfrute!`);
});

test("varias de una vez: el comando con varios números, o con «todas»", async () => {
  const chat = grupo("respuestas-varias@g.us");
  const [a, b, c, d] = ["mesa de luz $ 800", "silla gamer $ 3.000", "lámpara de pie $ 500", "cuadro grande $ 900"].map((t) => publicar(chat, "111@lid", t));
  const ajena = publicar(chat, "222@lid", "bici rodado 26 $ 4.000");
  C.cambiarEstado(chat, c, "111@lid", false, "reservado");

  await comando(chat, "111@lid", "sigue", `${a}, ${b} y 99`);
  assert.equal(ultimo(), `👍 Las #${a} y #${b} siguen activas. Te vuelvo a preguntar en 7 días.\n❌ No hay ninguna publicación #99 en este grupo.`);
  await comando(chat, "111@lid", "sigue", `#${a} ${ajena}`);
  assert.equal(ultimo(), `👍 La #${a} sigue activa. Te vuelvo a preguntar en 7 días.\n❌ La #${ajena} no es tuya: solo quien la publicó, o un moderador, puede cambiarla.`);
  await comando(chat, "111@lid", "sigue", `99 ${ajena}`);
  assert.equal(ultimo(), `❌ No hay ninguna publicación #99 en este grupo.\n❌ La #${ajena} no es tuya: solo quien la publicó, o un moderador, puede cambiarla.`);
  // What follows a number and isn't one is a comment, as it always was: only the first number counts.
  await comando(chat, "111@lid", "reservado", `${d} 2 semanas`);
  assert.equal(ultimo(), `🔒 La #${d} quedó como reservada. Con .sigue ${d} vuelve a estar libre; con .vendido ${d} la cerrás.`);
  await comando(chat, "111@lid", "sigue", `${d}.`);
  assert.deepEqual(estados(chat, a, b, c, d), ["activa", "activa", "reservada", "activa"]);
  // A long list of numbers is a lookup and a line of the answer for each: there's a limit.
  await comando(chat, "111@lid", "baja", Array.from({ length: C.COMPRAVENTA.MAX_DE_UNA_VEZ + 1 }, (_, i) => i + 1).join(" "));
  assert.deepEqual([ultimo(), estados(chat, a)], ["❌ De a 20 publicaciones como mucho.", ["activa"]]);

  // "todas" is what the bot asked about, and each stays as it was: the reserved one, reserved.
  preguntada(chat, a, Date.now() - DIA);
  preguntada(chat, c, Date.now() - DIA);
  const sinTocar = F.getPublicacion(chat, b).actualizada;
  await comando(chat, "111@lid", "sigue", "todas");
  assert.equal(ultimo(), `👍 La #${a} sigue activa. Te vuelvo a preguntar en 7 días.\n🔒 La #${c} sigue reservada. Te vuelvo a preguntar en 7 días.`);
  assert.deepEqual([F.getPublicacion(chat, a).aviso, F.getPublicacion(chat, c).aviso, F.getPublicacion(chat, b).actualizada], [0, 0, sinTocar]);
  // With nothing asked, the command takes every post the person has up; without the dot, that's talk.
  const antes = globalThis.enviados.length;
  await escribir(chat, "111@lid", "Baja todas");
  assert.equal(enviadosA(chat, antes).length, 0);
  await comando(chat, "111@lid", "baja", "todas");
  assert.equal(ultimo(), `🗑️ Listo, di de baja las #${a}, #${b}, #${c} y #${d}.`);
  assert.deepEqual(estados(chat, a, b, c, d, ajena), ["cerrada", "cerrada", "cerrada", "cerrada", "activa"]);
  await comando(chat, "111@lid", "sigue", "todas");
  assert.equal(ultimo(), "❌ No tenés publicaciones activas.");
  // A moderator's "todas" is the moderator's own posts too.
  await comando(chat, "333@lid", "baja", "todas", { isMod: true });
  assert.deepEqual([ultimo(), F.getPublicacion(chat, ajena).estado], ["❌ No tenés publicaciones activas.", "activa"]);
});

test("la ronda del día: una pregunta por persona con todas las suyas, y las bajas juntas", async () => {
  const chat = grupo("ronda@g.us");
  const ahora = hoyALas(13, 3);
  const [mesa, silla, lampara] = ["mesa de luz $ 800", "silla gamer $ 3.000", "lámpara de pie $ 500"].map((t) => publicar(chat, "111@lid", t));
  const nueva = publicar(chat, "111@lid", "cuadro grande $ 900");
  const bici = publicar(chat, "222@lid", "bici rodado 26 $ 4.000");
  const tele = publicar(chat, "333@lid", "tele 32 pulgadas $ 6.000");
  C.cambiarEstado(chat, lampara, "111@lid", false, "reservado");
  for (const n of [mesa, silla, lampara, bici, tele]) vieja(chat, n, ahora);
  // It turns 7 days old at noon, with the day's round already open: it waits for tomorrow's.
  const deLaTarde = publicar(chat, "222@lid", "monopatín $ 9.000");
  F.actualizarPublicacion(chat, deLaTarde, { actualizada: hoyALas(12) - 7 * DIA });

  // Outside the round's hours nothing goes out: it used to ask at midnight.
  let antes = globalThis.enviados.length;
  await C.chequearPublicaciones(hoyALas(10, 55));
  await C.chequearPublicaciones(hoyALas(21));
  await C.chequearPublicaciones(hoyALas(23, 30));
  assert.equal(enviadosA(chat, antes).length, 0);

  await C.chequearPublicaciones(ahora);
  await C.chequearPublicaciones(ahora + 5 * MIN); // the next pass finds nothing new
  const preguntas = enviadosA(chat, antes);
  assert.deepEqual(preguntas, [
    {
      text: `❓ @111, ¿siguen en pie tus publicaciones?\n🏷️ *#${mesa}* mesa de luz $ 800\n🏷️ *#${silla}* silla gamer $ 3.000\n🏷️ 🔒 *#${lampara}* lámpara de pie $ 500\nRespondé *sigue todas* para mantenerlas como están, o de a una: *sigue ${mesa}*, *vendido ${mesa}* o *baja ${mesa}*. Las que queden sin respuesta las doy de baja en 2 días.`,
      mentions: ["111@lid"],
    },
    { text: `❓ @222, ¿sigue en pie tu vendo #${bici} (bici rodado 26 $ 4.000)? Respondé *sigue ${bici}* para mantenerla, o *vendido ${bici}* / *baja ${bici}*. Si no, en 2 días la doy de baja.`, mentions: ["222@lid"] },
    { text: `❓ @333, ¿sigue en pie tu vendo #${tele} (tele 32 pulgadas $ 6.000)? Respondé *sigue ${tele}* para mantenerla, o *vendido ${tele}* / *baja ${tele}*. Si no, en 2 días la doy de baja.`, mentions: ["333@lid"] },
  ]);
  assert.deepEqual([F.getPublicacion(chat, nueva).aviso, F.getPublicacion(chat, deLaTarde).aviso], [0, 0], "ni la nueva ni la del mediodía");

  // "Sigue", replying to the question, is about the posts it names: each stays as it was.
  const pregunta = F.getPublicacion(chat, mesa).mensajeAviso;
  assert.ok(pregunta && pregunta === F.getPublicacion(chat, lampara).mensajeAviso);
  antes = globalThis.enviados.length;
  await escribir(chat, "222@lid", "Sigue", { quoted: alBot(pregunta) }); // someone else's question
  assert.equal(enviadosA(chat, antes).length, 0);
  // With the command too, a reply to a question is about one's own posts: a moderator closes someone else's by number.
  await comando(chat, "222@lid", "baja", "", { quoted: alBot(pregunta), isMod: true });
  assert.match(ultimo(), /^❌ ¿Cuál\? Respondé a la publicación y escribí \.baja/);
  assert.deepEqual(estados(chat, mesa, silla, lampara), ["activa", "activa", "reservada"]);
  await escribir(chat, "111@lid", "Sigue", { quoted: alBot(pregunta) });
  assert.equal(ultimo(), `👍 Las #${mesa} y #${silla} siguen activas. Te vuelvo a preguntar en 7 días.\n🔒 La #${lampara} sigue reservada. Te vuelvo a preguntar en 7 días.`);
  assert.deepEqual([mesa, silla, lampara].map((n) => F.getPublicacion(chat, n).aviso), [0, 0, 0]);
  assert.deepEqual(estados(chat, mesa, silla, lampara), ["activa", "activa", "reservada"]);

  // Two days with no answer: one message for everything taken down, after the question about the post from noon.
  antes = globalThis.enviados.length;
  await C.chequearPublicaciones(ahora + 2 * DIA);
  assert.deepEqual(estados(chat, bici, tele), ["activa", "activa"], "a los dos días justos todavía no");
  await C.chequearPublicaciones(ahora + 2 * DIA + 5 * MIN);
  const delDia = enviadosA(chat, antes);
  assert.deepEqual(delDia.at(-1), {
    text: `⌛ Di de baja por falta de respuesta:\n*#${bici}* bici rodado 26 $ 4.000 — @222\n*#${tele}* tele 32 pulgadas $ 6.000 — @333\nSi alguna sigue en pie, quien la publicó la vuelve a activar con *sigue* y su número (*sigue ${bici}*), o con *sigue todas*.`,
    mentions: ["222@lid", "333@lid"],
  });
  assert.match(delDia[0].text, new RegExp(`^❓ @222, ¿sigue en pie tu vendo #${deLaTarde} \\(monopatín`));
  assert.equal(delDia.length, 2);
  assert.deepEqual(estados(chat, bici, tele, mesa), ["vencida", "vencida", "activa"]);

  // Each one brings their own back: replying to the notice with the word alone, or with "sigue todas".
  const baja = F.getPublicacion(chat, tele).mensajeAviso;
  await escribir(chat, "333@lid", "Sigue", { quoted: alBot(baja) });
  assert.equal(ultimo(), `👍 La #${tele} sigue activa. Te vuelvo a preguntar en 7 días.`);
  assert.deepEqual(estados(chat, bici, tele), ["vencida", "activa"], "solo la suya");
  await escribir(chat, "222@lid", "Sigue todas");
  assert.equal(ultimo(), `👍 Las #${bici} y #${deLaTarde} siguen activas. Te vuelvo a preguntar en 7 días.`);
  assert.deepEqual(estados(chat, bici, deLaTarde), ["activa", "activa"]);
});

test("la ronda del día: una sola baja se avisa como antes, y con el comando respondiendo al aviso vuelve", async () => {
  const chat = grupo("ronda-una@g.us");
  const ahora = hoyALas(20, 59); // the round's last minute
  const paraPreguntar = publicar(chat, "222@lid", "bici rodado 26 $ 4.000");
  vieja(chat, paraPreguntar, ahora);
  const n = publicar(chat, "111@lid", "silla de oficina $ 2.500");
  preguntada(chat, n, ahora - 3 * DIA);
  const antes = globalThis.enviados.length;
  await C.chequearPublicaciones(ahora);
  // What was taken down goes before the day's questions.
  assert.deepEqual(enviadosA(chat, antes), [
    { text: `⌛ Di de baja la #${n} de @111 por falta de respuesta. Si sigue en pie, *sigue ${n}* la vuelve a activar.`, mentions: ["111@lid"] },
    { text: `❓ @222, ¿sigue en pie tu vendo #${paraPreguntar} (bici rodado 26 $ 4.000)? Respondé *sigue ${paraPreguntar}* para mantenerla, o *vendido ${paraPreguntar}* / *baja ${paraPreguntar}*. Si no, en 2 días la doy de baja.`, mentions: ["222@lid"] },
  ]);
  await comando(chat, "111@lid", "sigue", "", { quoted: alBot(F.getPublicacion(chat, n).mensajeAviso) });
  assert.equal(ultimo(), `👍 La #${n} sigue activa. Te vuelvo a preguntar en 7 días.`);
  // Replying to any other message of the bot's, the command still asks which one.
  await comando(chat, "111@lid", "sigue", "", { quoted: alBot("OTRO") });
  assert.match(ultimo(), /^❌ ¿Cuál\? Respondé a la publicación y escribí \.sigue/);
});

// The posts a notice named are the ones a reply to it is about, except what its owner closed since: sold after the
// question, a post isn't brought back by a "sigue" said to that question.
test("responder a la pregunta no revive la que su dueño cerró después", async () => {
  const chat = grupo("ronda-cerrada@g.us");
  const ahora = hoyALas(13);
  const [mesa, silla, lampara] = ["mesa de luz $ 800", "silla gamer $ 3.000", "lámpara de pie $ 500"].map((t) => publicar(chat, "111@lid", t));
  for (const n of [mesa, silla, lampara]) vieja(chat, n, ahora);
  await C.chequearPublicaciones(ahora);
  const pregunta = alBot(F.getPublicacion(chat, mesa).mensajeAviso);
  await escribir(chat, "111@lid", `Vendido ${mesa}`);
  await comando(chat, "111@lid", "baja", String(silla));
  await comando(chat, "111@lid", "sigue", "", { quoted: pregunta });
  assert.equal(ultimo(), `👍 La #${lampara} sigue activa. Te vuelvo a preguntar en 7 días.`);
  await comando(chat, "111@lid", "sigue", "todas", { quoted: pregunta });
  assert.equal(ultimo(), `👍 La #${lampara} sigue activa. Te vuelvo a preguntar en 7 días.`);
  assert.deepEqual(estados(chat, mesa, silla, lampara), ["vendida", "cerrada", "activa"]);
});

test("la ronda del día: quien tiene publicaciones bajo la LID y bajo el número recibe una sola pregunta", async () => {
  const chat = grupo("ronda-identidad@g.us");
  const ahora = hoyALas(11); // the round opens
  vieja(chat, publicar(chat, "111@lid", "mesa de luz $ 800"), ahora);
  vieja(chat, publicar(chat, "59899000111@s.whatsapp.net", "silla gamer $ 3.000"), ahora);
  const antes = globalThis.enviados.length;
  await C.chequearPublicaciones(ahora);
  const preguntas = enviadosA(chat, antes);
  assert.equal(preguntas.length, 1);
  assert.match(preguntas[0].text, /^❓ @111, ¿siguen en pie tus publicaciones\?\n🏷️ \*#1\* mesa de luz \$ 800\n🏷️ \*#2\* silla gamer \$ 3\.000\n/);
});

test("la ronda del día: cada grupo recibe lo suyo, aunque la persona sea la misma", async () => {
  const [uno, otro] = [grupo("ronda-grupo-1@g.us"), grupo("ronda-grupo-2@g.us")];
  const ahora = hoyALas(13);
  for (const chat of [uno, otro]) {
    vieja(chat, publicar(chat, "111@lid", `mesa de ${chat.split("@")[0]} $ 800`), ahora);
    preguntada(chat, publicar(chat, "222@lid", `silla de ${chat.split("@")[0]} $ 500`), ahora - 3 * DIA);
  }
  const antes = globalThis.enviados.length;
  await C.chequearPublicaciones(ahora);
  for (const chat of [uno, otro]) {
    const nombre = chat.split("@")[0];
    assert.deepEqual(
      enviadosA(chat, antes).map((e) => e.text),
      [
        "⌛ Di de baja la #2 de @222 por falta de respuesta. Si sigue en pie, *sigue 2* la vuelve a activar.",
        `❓ @111, ¿sigue en pie tu vendo #1 (mesa de ${nombre} $ 800)? Respondé *sigue 1* para mantenerla, o *vendido 1* / *baja 1*. Si no, en 2 días la doy de baja.`,
      ],
      chat,
    );
  }
});

// Two questions waiting, from two days: "todas" in reply to one of them is about the posts that one named. Said to
// nothing in particular, it's about everything the bot is waiting on.
test("«sigue todas» respondiendo a una pregunta es por las de esa pregunta", async () => {
  const chat = grupo("ronda-dos-preguntas@g.us");
  const ahora = hoyALas(13);
  const [mesa, silla, lampara] = ["mesa de luz $ 800", "silla gamer $ 3.000", "lámpara de pie $ 500"].map((t) => publicar(chat, "111@lid", t));
  vieja(chat, mesa, ahora - DIA);
  await C.chequearPublicaciones(ahora - DIA);
  for (const n of [silla, lampara]) vieja(chat, n, ahora);
  await C.chequearPublicaciones(ahora);
  const [ayer, hoy] = [mesa, silla].map((n) => F.getPublicacion(chat, n).mensajeAviso);
  assert.ok(ayer && hoy && ayer !== hoy && hoy === F.getPublicacion(chat, lampara).mensajeAviso);

  await escribir(chat, "111@lid", "Sigue todas", { quoted: alBot(hoy) });
  assert.equal(ultimo(), `👍 Las #${silla} y #${lampara} siguen activas. Te vuelvo a preguntar en 7 días.`);
  assert.ok(F.getPublicacion(chat, mesa).aviso > 0, "la de ayer sigue esperando");
  // The command, the same: with another question waiting, about the lamp, the reply to yesterday's is about the table.
  F.actualizarPublicacion(chat, lampara, { aviso: ahora, mensajeAviso: "OTRA" });
  await comando(chat, "111@lid", "vendido", "todas", { quoted: alBot(ayer) });
  assert.equal(ultimo(), `✅ Listo, la #${mesa} quedó como concretada. ¡Que la disfrute!`);
  assert.deepEqual(estados(chat, mesa, silla, lampara), ["vendida", "activa", "activa"]);
  await comando(chat, "111@lid", "baja", "todas");
  assert.equal(ultimo(), `🗑️ Listo, di de baja la #${lampara}.`, "sin responder a ninguna, por la que queda esperando");
});

// The send may fail (no connection): what the pass had marked goes back, so the next one tries again. Not what its
// owner answered in the meantime: put back as well, the answer was lost and the post was due again.
test("la ronda del día: si el aviso no sale, vuelve todo a como estaba, menos lo que se contestó mientras tanto", async () => {
  const chat = grupo("ronda-falla@g.us");
  const ahora = hoyALas(13);
  const [a, b] = ["mesa de luz $ 800", "silla gamer $ 3.000"].map((t) => publicar(chat, "111@lid", t));
  for (const n of [a, b]) preguntada(chat, n, ahora - 3 * DIA);
  const sinConexion = {
    sendMessage: async (aQuien) => {
      if (aQuien === chat) C.cambiarEstado(chat, a, "111@lid", false, "sigue", ahora);
      throw new Error("sin conexión");
    },
  };
  const errorReal = console.error;
  console.error = () => {};
  try {
    await C.chequearPublicaciones(ahora, sinConexion);
  } finally {
    console.error = errorReal;
  }
  assert.deepEqual([F.getPublicacion(chat, a).estado, F.getPublicacion(chat, a).actualizada, F.getPublicacion(chat, a).aviso], ["activa", ahora, 0], "la contestada queda contestada");
  assert.deepEqual([F.getPublicacion(chat, b).estado, F.getPublicacion(chat, b).actualizada, F.getPublicacion(chat, b).aviso], ["activa", ahora - 11 * DIA, ahora - 3 * DIA], "la otra vuelve");
  const antes = globalThis.enviados.length;
  await C.chequearPublicaciones(ahora + 5 * MIN);
  assert.deepEqual(enviadosA(chat, antes).map((e) => e.text), [`⌛ Di de baja la #${b} de @111 por falta de respuesta. Si sigue en pie, *sigue ${b}* la vuelve a activar.`]);
});

// Bringing a post back counts against the cap, as publishing does. Closing one that expired doesn't bring it back: with
// ten posts up, an expired one couldn't be marked as sold.
test("con el tope de activas, una vencida se puede dar por vendida, y no reactivar", async () => {
  const chat = grupo("respuestas-tope@g.us");
  const vencida = publicar(chat, "111@lid", "cosa 0 $ 100");
  F.actualizarPublicacion(chat, vencida, { estado: "vencida" });
  for (let i = 1; i <= C.COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA; i++) publicar(chat, "111@lid", `cosa ${i} $ 100`);
  await escribir(chat, "111@lid", `Sigue ${vencida}`);
  assert.equal(ultimo(), `❌ La #${vencida} no se puede reactivar: ya tenés 10 publicaciones activas. Cerrá alguna con .vendido N o .baja N.`);
  await escribir(chat, "111@lid", `Vendido ${vencida}`);
  assert.equal(ultimo(), `✅ Listo, la #${vencida} quedó como concretada. ¡Que la disfrute!`);
});
