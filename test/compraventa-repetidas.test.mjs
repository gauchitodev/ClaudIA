import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// Sellers send the same ad every few days. Each time it became one more post: in a real sales group one post in six
// was a repeat, and each had its own "¿sigue en pie?" a week later. An ad its author already has up renews that post
// instead (lib/compraventa.js, publicar). The ads here are that group's, without the phone numbers.

let F, C, Hook, Cmd;
const DIA = 24 * 3600e3;
let k = 0;
const reacciones = [];
const RENOVADA = (n, tipo = "Vendo") => `🔁 Ya estaba publicada: es la *${tipo} #${n}*. La renové en vez de publicarla de nuevo, y vuelvo a preguntar si sigue en pie en 7 días.`;

before(async () => {
  ({ F } = await prepararBase("repetidas"));
  C = await import("../lib/compraventa.js");
  Hook = (await import("../plugins/_compraventa.js")).default;
  Cmd = (await import("../plugins/compraventa.js")).default;
});

// A group of a test's own (the posts are numbered in each group); "ventas" leaves it in buy-and-sell mode, where a
// loose "vendo…" is read.
function grupo(chat, { ventas = false } = {}) {
  for (const n of [111, 222, 333]) F.initDataDB({ chat, sender: `${n}@lid`, senderJid: `59899000${n}@s.whatsapp.net`, pushName: `P${n}` });
  if (ventas) F.updateChat(chat, { games: 0, monedas: 0 });
  return chat;
}
const enviadosA = (chat, desde = 0) => globalThis.enviados.slice(desde).filter((e) => e.chat === chat).map((e) => e.msg);
const ultimo = () => globalThis.enviados.at(-1).msg;
async function escribir(chat, sender, text) {
  const m = { chat, sender, text, isGroup: true, key: { id: `K${++k}` }, quoted: null, react: async (e) => reacciones.push(e) };
  await Hook.before(m, { client: conexion.client, chat: F.getChat(chat), user: {}, isOwner: false, isMod: false });
  return m;
}
const comando = (chat, sender, command, text = "", { quoted = null, ...contexto } = {}) =>
  Cmd.run({ chat, sender, text, isGroup: true, key: { id: `K${++k}` }, quoted }, { client: conexion.client, command, args: text.trim() ? text.trim().split(/\s+/) : [], text, isMod: false, ...contexto });
const activas = (chat) => F.publicacionesActivas(chat).map((p) => p.numero).sort((a, b) => a - b);

test("el mismo aviso otra vez renueva la publicación que ya era, y contesta el «¿sigue en pie?»", () => {
  const chat = grupo("repetidas-igual@g.us");
  const primera = C.publicar(chat, "111@lid", "vendo", "bici rodado 26, $ 4.000, Pocitos", "M1");
  assert.deepEqual([primera.numero, primera.renovada], [1, undefined]);
  F.actualizarPublicacion(chat, 1, { actualizada: 5, aviso: 7, mensajeBot: "CONFIRMACION" }); // old, and asked about

  const otraVez = C.publicar(chat, "111@lid", "vendo", "bici rodado 26, $ 4.000, Pocitos", "M2");
  assert.deepEqual(otraVez, { ok: true, renovada: true, numero: 1, precio: "$ 4.000", mensaje: RENOVADA(1), sugerencias: null, avisos: null });
  const p = F.getPublicacion(chat, 1);
  assert.deepEqual([p.aviso, p.estado, p.texto, p.mensajeBot], [0, "activa", "bici rodado 26, $ 4.000, Pocitos", "CONFIRMACION"]);
  assert.ok(Date.now() - p.actualizada < 5000, "renovada");
  // It goes on to point at the newest message, the one people will reply to.
  assert.deepEqual([F.getPublicacionPorMensaje(chat, "M2")?.numero, F.getPublicacionPorMensaje(chat, "M1")], [1, null]);

  // The same with other signs, capitals, emoji or the price written together; and reserved, it stays reserved.
  C.cambiarEstado(chat, 1, "111@lid", false, "reservado");
  assert.equal(C.publicar(chat, "111@lid", "vendo", "BICI rodado 26 — $4.000 (Pocitos) 🚲🚲").numero, 1);
  assert.deepEqual([F.getPublicacion(chat, 1).estado, activas(chat)], ["reservada", [1]]);
});

test("con una línea más, el texto nuevo reemplaza al viejo; un recordatorio corto no", () => {
  const chat = grupo("repetidas-contenida@g.us");
  const calzas = "Calzas sin costura, Romance. De Lycra Excelente calidad . Tonos verde musgo y negro. Talle MM. Están para $ 1590 cada una . Zona Oeste";
  const n = C.publicar(chat, "222@lid", "vendo", calzas).numero;
  const conMas = `${calzas} Todas las tarjetas. Mercado Pago`;
  assert.deepEqual([C.publicar(chat, "222@lid", "vendo", conMas).numero, F.getPublicacion(chat, n).texto], [n, conMas]);

  const iphone = "ihpone 17. Muy poco uso. Esta como nuevo desde junio. $40.000 uy Con caja funda cargador y garantía hasta junio 2027.";
  const m = C.publicar(chat, "333@lid", "vendo", iphone).numero;
  const recordatorio = C.publicar(chat, "333@lid", "vendo", "Ihpone 17");
  assert.deepEqual([recordatorio.renovada, recordatorio.numero, recordatorio.precio], [true, m, "$40.000"]);
  assert.deepEqual([F.getPublicacion(chat, m).texto, F.getPublicacion(chat, m).precio], [iphone, "$40.000"], "el aviso completo queda");

  // The short one first and the whole ad after: the whole ad is what stays, with its price.
  const corta = C.publicar(chat, "111@lid", "vendo", "Vendo entrada para la Bresch").numero;
  const larga = C.publicar(chat, "111@lid", "vendo", "2 entradas para la Bresch, $ 900 cada una");
  assert.deepEqual([larga.numero, larga.precio, F.getPublicacion(chat, corta).texto], [corta, "$ 900", "2 entradas para la Bresch, $ 900 cada una"]);
  // And the price it had stays when the new text, though longer, doesn't say it again.
  const conPrecio = C.publicar(chat, "111@lid", "vendo", "mesa ratona, $ 900").numero;
  const sinPrecio = C.publicar(chat, "111@lid", "vendo", "mesa ratona de pino, Malvín");
  const mesa = F.getPublicacion(chat, conPrecio);
  assert.deepEqual([sinPrecio.numero, sinPrecio.precio, mesa.texto, mesa.precio], [conPrecio, "$ 900", "mesa ratona de pino, Malvín", "$ 900"]);
  assert.deepEqual(activas(chat), [n, m, corta, conPrecio]);
});

test("otra cosa, otro talle, otro precio, otra persona u otro tipo: es otra publicación", () => {
  const chat = grupo("repetidas-distintas@g.us");
  const nuevas = (lista) => lista.map(([quien, texto, tipo = "vendo"]) => C.publicar(chat, quien, tipo, texto)).map((r) => (r.renovada ? `=${r.numero}` : r.numero));
  // Each of these says something the others don't.
  assert.deepEqual(
    nuevas([
      ["111@lid", "remera negra talle M $ 500"],
      ["111@lid", "remera negra talle L $ 500"], // the size is one letter
      ["111@lid", "remera blanca talle M $ 500"],
      ["111@lid", "remera negra talle M $ 400"], // the same words at another price may be another one
      ["111@lid", "bici rodado 26"],
      ["111@lid", "bici rodado 29"],
      ["222@lid", "remera negra talle M $ 500"], // someone else's
      ["222@lid", "bici rodado 26", "compro"], // looking for one isn't selling it
      ["222@lid", "bici rodado 26"],
    ]),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  // A closing formula isn't the thing for sale: three ads of the same seller, and the third is the first again.
  assert.deepEqual(nuevas([["333@lid", "a las ordenes! 🥰"], ["333@lid", "productos avon/ nuvo , a las ordenes 🥰"], ["333@lid", "a las ordenes🥰"]]), [10, 11, "=10"]);
  // With nothing but empty words, only the very same text is the same ad.
  assert.deepEqual(nuevas([["333@lid", "una más $ 100"], ["333@lid", "otra cosa $ 100"], ["333@lid", "Una más $ 100"]]), [12, 13, "=12"]);
  // One that's no longer up isn't renewed: the ad is posted again, with a number of its own.
  assert.ok(C.cambiarEstado(chat, 5, "111@lid", false, "baja").ok);
  assert.deepEqual(nuevas([["111@lid", "bici rodado 26"]]), [14]);
  // Singular and plural are the same word, but a size's letter isn't the plural of anything: "M" and "1 mes de uso".
  assert.deepEqual(nuevas([["222@lid", "calza talle M"], ["222@lid", "calzas talle L, 1 mes de uso"], ["222@lid", "calzas talle M"]]), [15, 16, "=15"]);
});

test("repetir un aviso no cuenta para el tope de activas, ni vuelve a avisarle a nadie", () => {
  const chat = grupo("repetidas-tope@g.us");
  const primera = C.publicar(chat, "111@lid", "vendo", "heladera con freezer $ 9.000");
  // After the ad went up, someone starts looking for one (and hears of it then), and someone else asks to be told.
  assert.deepEqual(C.publicar(chat, "222@lid", "compro", "heladera chica").sugerencias?.mentions, ["222@lid", "111@lid"]);
  assert.ok(C.gestionarAlerta(chat, "333@lid", ["heladera"]).ok);
  for (let i = 1; i < C.COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA; i++) C.publicar(chat, "111@lid", "vendo", `cosa ${i} $ 100`);
  assert.match(C.publicar(chat, "111@lid", "vendo", "una más $ 100").error, /^Ya tenés 10 publicaciones activas/);
  const otraVez = C.publicar(chat, "111@lid", "vendo", "heladera con freezer $ 9.000");
  assert.deepEqual([otraVez.ok, otraVez.numero, otraVez.sugerencias, otraVez.avisos], [true, primera.numero, null, null]);
  assert.equal(F.contarPublicacionesActivas(chat, "111@lid"), C.COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA);
  // Posted by someone else, the same ad is news for both of them.
  const deOtro = C.publicar(chat, "333@lid", "vendo", "heladera con freezer $ 9.000");
  assert.deepEqual([deOtro.renovada, deOtro.sugerencias?.mentions], [undefined, ["222@lid"]]);
});

test("en un grupo de ventas, el aviso repetido se lleva una reacción y no otro mensaje", async () => {
  const chat = grupo("repetidas-sueltas@g.us", { ventas: true });
  await escribir(chat, "111@lid", "Hola gente, vendo silla gamer $ 3.000");
  assert.match(ultimo().text, /^🏷️ \*Vendo #1\* registrada\. Precio: \$ 3\.000\./);
  const confirmacion = F.getPublicacion(chat, 1).mensajeBot;
  // Asked about four days ago: sending the ad again is the answer, and it isn't taken down.
  const ahora = new Date().setHours(13, 0, 0, 0);
  F.actualizarPublicacion(chat, 1, { actualizada: ahora - 11 * DIA, aviso: ahora - 4 * DIA });

  const antes = [globalThis.enviados.length, reacciones.length];
  const repetido = await escribir(chat, "111@lid", "Buenas! Vendo silla gamer $ 3.000 🪑");
  assert.deepEqual([enviadosA(chat, antes[0]).length, reacciones.slice(antes[1])], [0, ["🔁"]]);
  const p = F.getPublicacion(chat, 1);
  assert.deepEqual([activas(chat), p.aviso, p.messageId, p.mensajeBot], [[1], 0, repetido.key.id, confirmacion]);
  await C.chequearPublicaciones(ahora);
  assert.deepEqual([enviadosA(chat, antes[0]).length, F.getPublicacion(chat, 1).estado], [0, "activa"]);

  // With the hashtag or the command it was asked for: the answer goes in words, and replying to it closes the post.
  await escribir(chat, "111@lid", "#vendo silla gamer $ 3.000");
  assert.deepEqual(ultimo(), { text: RENOVADA(1), mentions: [] });
  await comando(chat, "111@lid", "vendo", "silla gamer $ 3.000");
  assert.equal(ultimo().text, RENOVADA(1));
  assert.deepEqual([activas(chat), reacciones.length], [[1], antes[1] + 1]);
  const respuesta = F.getPublicacion(chat, 1).mensajeBot;
  assert.notEqual(respuesta, confirmacion);
  await comando(chat, "111@lid", "vendido", "", { quoted: { id: respuesta, sender: "bot@lid", fromMe: true, isBaileys: true, text: "…" } });
  assert.equal(F.getPublicacion(chat, 1).estado, "vendida");

  // Sold, the same ad is a new post again.
  await escribir(chat, "111@lid", "Vendo silla gamer $ 3.000");
  assert.match(ultimo().text, /^🏷️ \*Vendo #2\* registrada\./);
});

test("un moderador que publica la foto repetida de otro renueva la de esa persona", async () => {
  const chat = grupo("repetidas-citando@g.us");
  const foto = (id) => ({ id, sender: "222@lid", fromMe: false, isBaileys: false, text: "ropero de pino, $ 3.000, Malvín" });
  await comando(chat, "222@lid", "vendo", "", { quoted: foto("FOTO1") });
  assert.match(ultimo().text, /^🏷️ \*Vendo #1\* registrada\./);
  await comando(chat, "111@lid", "vendo", "", { quoted: foto("FOTO2"), isMod: true });
  assert.deepEqual(ultimo(), { text: `${RENOVADA(1)} Queda a nombre de @222.`, mentions: ["222@lid"] });
  assert.deepEqual([activas(chat), F.getPublicacion(chat, 1).usuario, F.getPublicacion(chat, 1).messageId], [[1], "222@lid", "FOTO2"]);
});
