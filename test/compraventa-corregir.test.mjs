import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// Correcting a post (lib/compraventa.js: cambiarPrecio, corregirPublicacion, precioDicho). There was no way to: a price
// changed by posting the ad again, which left the old one up next to it, and all a moderator could do with a post that
// was wrong was take it down. .precio changes the price, .editar (or .corregir) rewrites the ad; for whoever posted
// it, or a moderator; with the post's number, or replying to it.

let F, C, Hook, Cmd;
let k = 0;
const reacciones = [];

before(async () => {
  ({ F } = await prepararBase("corregir"));
  C = await import("../lib/compraventa.js");
  Hook = (await import("../plugins/_compraventa.js")).default;
  Cmd = (await import("../plugins/compraventa.js")).default;
});

// A group of a test's own (the posts are numbered in each), with people the bot knows: 111 posts, 222 moderates.
function grupo(chat) {
  for (const n of [111, 222, 333]) F.initDataDB({ chat, sender: `${n}@lid`, senderJid: `59899000${n}@s.whatsapp.net`, pushName: `P${n}` });
  return chat;
}
const publicar = (chat, texto, { quien = "111@lid", tipo = "vendo", id = null } = {}) => C.publicar(chat, quien, tipo, texto, id).numero;
const ver = (chat, n) => {
  const p = F.getPublicacion(chat, n);
  return [p.texto, p.precio];
};
const enviadosA = (chat, desde = 0) => globalThis.enviados.slice(desde).filter((e) => e.chat === chat).map((e) => e.msg);
// A command as handle-message.js hands it over; returns what the bot said to the group.
async function comando(chat, sender, command, text = "", { quoted = null, isMod = false } = {}) {
  const antes = globalThis.enviados.length;
  await Cmd.run({ chat, sender, text, isGroup: true, key: { id: `K${++k}` }, quoted }, { client: conexion.client, command, args: text.trim() ? text.trim().split(/\s+/) : [], text, isMod });
  return enviadosA(chat, antes);
}
// A message through the hook; returns it, with what the bot said and the marks it put on it.
async function escribir(chat, sender, text, { quoted = null, ...contexto } = {}) {
  const antes = [globalThis.enviados.length, reacciones.length];
  const m = { chat, sender, text, isGroup: true, key: { id: `K${++k}`, participant: sender }, quoted, react: async (e) => void reacciones.push(e) };
  await Hook.before(m, { client: conexion.client, chat: F.getChat(chat), user: {}, isOwner: false, isMod: false, ...contexto });
  return { m, dice: enviadosA(chat, antes[0]).map((e) => e.text), marcas: reacciones.slice(antes[1]) };
}
const cita = (id, sender = "111@lid", extra = {}) => ({ id, sender, fromMe: false, isBaileys: false, text: "…", ...extra });
const LISTO = (n, precio, deQuien = "") => `✏️ Listo, la #${n}${deQuien} ahora está a ${precio}.`;

test(".precio: quien publicó le cambia el precio, donde el catálogo lo muestra y en el dato", async () => {
  const chat = grupo("corregir-precio@g.us");
  const bici = publicar(chat, "bici rodado 26 $ 4.000 Pocitos");
  F.actualizarPublicacion(chat, bici, { actualizada: 5, aviso: 7 }); // old, and asked about
  assert.deepEqual(await comando(chat, "111@lid", "precio", `${bici} $ 3.500`), [{ text: LISTO(bici, "$ 3.500") }]);
  assert.deepEqual(ver(chat, bici), ["bici rodado 26 $ 3.500 Pocitos", "$ 3.500"]);
  const p = F.getPublicacion(chat, bici);
  assert.ok(p.aviso === 0 && Date.now() - p.actualizada < 5000, "renovada, y contestado el «¿sigue en pie?»");
  assert.match(C.textoCatalogo(chat).texto, new RegExp(`\\*#${bici}\\* bici rodado 26 \\$ 3\\.500 Pocitos — P111`));
  // .mias, where each one sees the numbers of theirs, says how.
  assert.match(C.textoMias(chat, "111@lid").texto, /· \.sigue N para renovarla · \.precio N o \.editar N para corregirla$/);

  // However the price is given: as an ad would say it, or the amount alone, which here can only be a price. What
  // wouldn't read as one in the ad's text is written with the sign.
  const dados = [
    ["3500", "$ 3500"],
    ["3.200", "$ 3.200"],
    ["a 3000", "$ 3000"],
    ["$2.900.", "$2.900"],
    ["2800 pesos", "2800 pesos"],
    ["u$s 70", "u$s 70"],
    ["2 mil", "2 mil"],
    ["2k", "$ 2k"],
    ["$ 1.900 negociable", "$ 1.900"],
    [`#${bici} $ 1.800`, "$ 1.800", `#${bici}`],
  ];
  for (const [dado, queda, numero = bici] of dados) {
    const texto = dado.startsWith("#") ? dado : `${numero} ${dado}`;
    assert.deepEqual(await comando(chat, "111@lid", "precio", texto), [{ text: LISTO(bici, queda) }], dado);
    assert.deepEqual(ver(chat, bici), [`bici rodado 26 ${queda} Pocitos`, queda], dado);
  }

  // A price said with its unit: the new one takes the place of the unit too, and one without leaves it there.
  const entradas = publicar(chat, "2 entradas para la Bresch, $ 900 cada una, sector A");
  await comando(chat, "111@lid", "precio", `${entradas} 800 cada una`);
  assert.deepEqual(ver(chat, entradas), ["2 entradas para la Bresch, 800 cada una, sector A", "800 cada una"]);
  await comando(chat, "111@lid", "precio", `${entradas} $ 700`);
  assert.deepEqual(ver(chat, entradas), ["2 entradas para la Bresch, $ 700, sector A", "$ 700"]);
  const piezas = publicar(chat, "piezas de bijou $ 200 c/u");
  await comando(chat, "111@lid", "precio", `${piezas} $ 150`);
  assert.deepEqual(ver(chat, piezas), ["piezas de bijou $ 150 c/u", "$ 150"]);
});

// Posts from before a price was asked for have none, and one's text may have been replaced since by one that doesn't
// say the price it keeps.
test(".precio: la que no tiene el precio en su texto lo recibe al final", async () => {
  const chat = grupo("corregir-sin-precio@g.us");
  const vieja = F.crearPublicacion({ chat, usuario: "111@lid", tipo: "vendo", texto: "campera zara talle M impecable, Pocitos." });
  assert.deepEqual(await comando(chat, "111@lid", "precio", `${vieja} 500`), [{ text: LISTO(vieja, "$ 500") }]);
  assert.deepEqual(ver(chat, vieja), ["campera zara talle M impecable, Pocitos, $ 500", "$ 500"]);
  const sinDecirlo = F.crearPublicacion({ chat, usuario: "111@lid", tipo: "vendo", texto: "mesa ratona de pino", precio: "$ 900" });
  await comando(chat, "111@lid", "precio", `${sinDecirlo} $ 800`);
  assert.deepEqual(ver(chat, sinDecirlo), ["mesa ratona de pino, $ 800", "$ 800"]);
  // A text at the ceiling makes room for it: the price is what mustn't be cut.
  const larga = F.crearPublicacion({ chat, usuario: "111@lid", tipo: "vendo", texto: `bici ${"impecable ".repeat(120)}`.slice(0, 1000) });
  await comando(chat, "111@lid", "precio", `${larga} $ 4.000`);
  const [texto, precio] = ver(chat, larga);
  assert.ok(texto.length <= 1000 && texto.endsWith(", $ 4.000") && precio === "$ 4.000", `${texto.length} letras, termina en «${texto.slice(-12)}»`);
  // And so does one whose price was the last thing in it, when the new one is longer: cut where the old one ended, it'd
  // be another price.
  const justa = F.crearPublicacion({ chat, usuario: "111@lid", tipo: "vendo", texto: `${"bici impecable ".repeat(70).slice(0, 994)} $ 100`, precio: "$ 100" });
  assert.equal(F.getPublicacion(chat, justa).texto.length, 1000);
  await comando(chat, "111@lid", "precio", `${justa} $ 100.000`);
  const [textoJusto, precioJusto] = ver(chat, justa);
  assert.ok(textoJusto.length <= 1000 && textoJusto.endsWith(", $ 100.000") && precioJusto === "$ 100.000", `${textoJusto.length} letras, termina en «${textoJusto.slice(-14)}»`);
});

test("respondiendo a la publicación o a su confirmación va sin número, y todo lo escrito es lo que se le da", async () => {
  const chat = grupo("corregir-citando@g.us");
  const n = publicar(chat, "silla gamer $ 3.000", { id: "AVISO" });
  F.actualizarPublicacion(chat, n, { mensajeBot: "CONFIRMACION" });
  assert.deepEqual(await comando(chat, "111@lid", "precio", "$ 2.800", { quoted: cita("AVISO") }), [{ text: LISTO(n, "$ 2.800") }]);
  await comando(chat, "111@lid", "precio", "2700", { quoted: cita("CONFIRMACION", "bot@lid", { fromMe: true, isBaileys: true }) });
  assert.deepEqual(ver(chat, n), ["silla gamer $ 2700", "$ 2700"], "un monto solo no es el número de otra publicación");
  // With its own number too, it's the same thing.
  await comando(chat, "111@lid", "precio", `${n} $ 2.600`, { quoted: cita("AVISO") });
  assert.deepEqual(ver(chat, n), ["silla gamer $ 2.600", "$ 2.600"]);
  await comando(chat, "111@lid", "editar", `${n} silla gamer roja $ 2.500`, { quoted: cita("AVISO") });
  assert.deepEqual(ver(chat, n), ["silla gamer roja $ 2.500", "$ 2.500"]);
  // An ad may well open with a number: replying, it's part of the text, whatever post has that number.
  const otra = publicar(chat, "mesa ratona $ 900");
  await comando(chat, "111@lid", "editar", `${otra} sillas gamer rojas, $ 2.400 cada una`, { quoted: cita("AVISO") });
  assert.deepEqual([ver(chat, n), ver(chat, otra)], [[`${otra} sillas gamer rojas, $ 2.400 cada una`, "$ 2.400"], ["mesa ratona $ 900", "$ 900"]]);
  // Replying to something that's no post, the number is what says which.
  await comando(chat, "111@lid", "precio", `${otra} $ 850`, { quoted: cita("OTRO-MENSAJE", "333@lid") });
  assert.deepEqual(ver(chat, otra), ["mesa ratona $ 850", "$ 850"]);
  assert.deepEqual(await comando(chat, "111@lid", "precio", "$ 800", { quoted: cita("OTRO-MENSAJE", "333@lid") }), [
    { text: "❌ ¿Cuál? Respondé a la publicación, o poné su número: .precio 12 $ 3.500 (las tuyas están en .mias)" },
  ]);
});

test(".editar (o .corregir) reescribe el aviso, que tiene que seguir diciendo qué es y su precio", async () => {
  const chat = grupo("corregir-editar@g.us");
  const n = publicar(chat, "bici rodado 26 $ 4.000 Pocitos");
  F.actualizarPublicacion(chat, n, { actualizada: 5, aviso: 7 });
  assert.deepEqual(await comando(chat, "111@lid", "editar", `${n} bici rodado 26 con casco, $ 3.800, Centro`), [{ text: `✏️ Listo, corregí la #${n}: «bici rodado 26 con casco, $ 3.800, Centro»` }]);
  assert.deepEqual(ver(chat, n), ["bici rodado 26 con casco, $ 3.800, Centro", "$ 3.800"]);
  const p = F.getPublicacion(chat, n);
  assert.ok(p.aviso === 0 && Date.now() - p.actualizada < 5000, "renovada");
  await comando(chat, "111@lid", "corregir", `${n}  #vendo   bici rodado 29\ncon casco, a 3500`);
  assert.deepEqual(ver(chat, n), ["bici rodado 29 con casco, a 3500", "3500"], "sin el hashtag, y en una línea");
  const largo = await comando(chat, "111@lid", "editar", `${n} bici rodado 29 $ 3.000 ${"impecable ".repeat(120)}`);
  assert.equal(largo[0].text, `✏️ Listo, corregí la #${n}: «bici rodado 29 $ 3.000 impecable impecable impecable impeca…»`);
  assert.equal(F.getPublicacion(chat, n).texto.length, 1000, "cortado donde se corta una publicación");

  // Short of something, nothing is touched and it says what.
  const estaba = ver(chat, n);
  const errores = [
    [`${n} bici rodado 29 con casco`, `❌ A ese texto le falta el precio: la #${n} queda como estaba.`],
    [`${n} $ 3.000`, `❌ A ese texto le falta decir qué es: la #${n} queda como estaba.`],
    [`${n} todo`, `❌ A ese texto le falta decir qué es y el precio: la #${n} queda como estaba.`],
    [`${n}`, `❌ ¿Qué dice ahora? Por ejemplo: .editar ${n} bici rodado 26, $ 3.500, Pocitos`],
    ["", "❌ ¿Cuál? Respondé a la publicación, o poné su número: .editar 12 bici rodado 26, $ 3.500, Pocitos (las tuyas están en .mias)"],
    ["bici rodado 29 $ 3.000", "❌ ¿Cuál? Respondé a la publicación, o poné su número: .editar 12 bici rodado 26, $ 3.500, Pocitos (las tuyas están en .mias)"],
  ];
  for (const [texto, error] of errores) assert.deepEqual(await comando(chat, "111@lid", "editar", texto), [{ text: error }], texto);
  assert.deepEqual(ver(chat, n), estaba);

  // A request names what's wanted, and that's all its text needs. Its price isn't something to change.
  const pedido = publicar(chat, "heladera chica", { tipo: "compro" });
  await comando(chat, "111@lid", "editar", `${pedido} heladera chica con freezer, zona Centro`);
  assert.deepEqual(ver(chat, pedido), ["heladera chica con freezer, zona Centro", ""]);
  assert.deepEqual(await comando(chat, "111@lid", "precio", `${pedido} $ 5.000`), [{ text: `❌ La #${pedido} es un pedido, y no lleva precio. Se corrige con .editar ${pedido} y el texto nuevo.` }]);
  assert.deepEqual(ver(chat, pedido), ["heladera chica con freezer, zona Centro", ""]);
});

test("corrige quien la publicó o un moderador, y de la corrección de un moderador se entera quien la publicó", async () => {
  const chat = grupo("corregir-permisos@g.us");
  const n = publicar(chat, "silla gamer $ 3.000");
  // Somebody else can't, and nothing changes.
  for (const [command, texto] of [["precio", `${n} $ 1`], ["editar", `${n} silla rota $ 1`], ["corregir", `${n} silla rota $ 1`]]) {
    assert.deepEqual(await comando(chat, "333@lid", command, texto), [{ text: `❌ La #${n} no es tuya: solo quien la publicó, o un moderador, puede corregirla.` }], command);
  }
  assert.deepEqual(ver(chat, n), ["silla gamer $ 3.000", "$ 3.000"]);
  // A moderator can, and the answer names the author.
  assert.deepEqual(await comando(chat, "222@lid", "precio", `${n} $ 2.500`, { isMod: true }), [{ text: LISTO(n, "$ 2.500", " de @111"), mentions: ["111@lid"] }]);
  assert.deepEqual(await comando(chat, "222@lid", "editar", `${n} silla gamer, apenas usada, $ 2.400`, { isMod: true }), [
    { text: `✏️ Listo, corregí la #${n} de @111: «silla gamer, apenas usada, $ 2.400»`, mentions: ["111@lid"] },
  ]);
  assert.deepEqual(ver(chat, n), ["silla gamer, apenas usada, $ 2.400", "$ 2.400"]);
  // The author, who happens to be a moderator too, is named to nobody; nor by their number instead of their LID.
  assert.deepEqual(await comando(chat, "111@lid", "precio", `${n} $ 2.300`, { isMod: true }), [{ text: LISTO(n, "$ 2.300") }]);
  assert.deepEqual(await comando(chat, "59899000111@s.whatsapp.net", "precio", `${n} $ 2.200`), [{ text: LISTO(n, "$ 2.200") }]);
});

test("solo se corrige una publicación que existe y sigue en pie, y a un precio que se pueda leer", async () => {
  const chat = grupo("corregir-errores@g.us");
  const n = publicar(chat, "silla gamer $ 3.000");
  const dice = async (command, texto, opciones) => (await comando(chat, "111@lid", command, texto, opciones))[0].text;
  assert.equal(await dice("precio", "99 $ 100"), "❌ No hay ninguna publicación #99 en este grupo.");
  assert.equal(await dice("editar", "99 silla $ 100"), "❌ No hay ninguna publicación #99 en este grupo.");
  assert.equal(await dice("precio", ""), "❌ ¿Cuál? Respondé a la publicación, o poné su número: .precio 12 $ 3.500 (las tuyas están en .mias)");
  assert.equal(await dice("precio", "$ 2.500"), "❌ ¿Cuál? Respondé a la publicación, o poné su número: .precio 12 $ 3.500 (las tuyas están en .mias)");
  for (const dado of ["", "gratis", "barato barato", "2500 negociable", "iphone 17"]) {
    assert.equal(await dice("precio", `${n} ${dado}`), `❌ ¿A cuánto? Por ejemplo: .precio ${n} $ 3.500`, dado);
  }
  assert.deepEqual(ver(chat, n), ["silla gamer $ 3.000", "$ 3.000"]);
  // Sold, taken down or expired, it's brought back first.
  const estados = { vendida: "✅ concretada", cerrada: "dada de baja", vencida: "⌛ vencida por falta de respuesta" };
  for (const [estado, comoSeDice] of Object.entries(estados)) {
    F.actualizarPublicacion(chat, n, { estado });
    assert.equal(await dice("precio", `${n} $ 2.500`), `❌ La #${n} ya está ${comoSeDice}. Con .sigue ${n} la volvés a activar.`, estado);
    assert.equal(await dice("editar", `${n} silla gamer roja $ 2.500`, { isMod: true }), `❌ La #${n} ya está ${comoSeDice}. Con .sigue ${n} la volvés a activar.`, estado);
    assert.deepEqual(ver(chat, n), ["silla gamer $ 3.000", "$ 3.000"], estado);
  }
  // Reserved is still up.
  F.actualizarPublicacion(chat, n, { estado: "reservada" });
  assert.equal(await dice("precio", `${n} $ 2.500`), LISTO(n, "$ 2.500"));
  assert.equal(F.getPublicacion(chat, n).estado, "reservada");
});

test("sin el punto: «precio 12 $ 3.500», o «precio $ 3.500» respondiendo a la publicación, si es de quien lo escribe", async () => {
  const chat = grupo("corregir-sin-punto@g.us");
  const n = publicar(chat, "silla gamer $ 3.000", { id: "AVISO" });
  const dicho = await escribir(chat, "111@lid", `Precio ${n} $ 2.800`);
  assert.deepEqual([dicho.dice, dicho.m.respuestaDeVenta, ver(chat, n)], [[LISTO(n, "$ 2.800")], true, ["silla gamer $ 2.800", "$ 2.800"]]);
  for (const [texto, opciones, queda] of [
    [`precio #${n} 2700`, {}, "$ 2700"],
    [`precio ${n} 2750!`, {}, "$ 2750"],
    [`precio ${n}: $ 2.650!`, {}, null], // a sign in the middle makes it something else
    ["precio $ 2.600", { quoted: cita("AVISO") }, "$ 2.600"],
    ["Precio: 2500", { quoted: cita("AVISO") }, "$ 2500"],
    ["precio 2 mil", { quoted: cita("AVISO") }, "2 mil"],
  ]) {
    const r = await escribir(chat, "111@lid", texto, opciones);
    if (queda) assert.deepEqual([r.dice, ver(chat, n)[1]], [[LISTO(n, queda)], queda], texto);
    else assert.deepEqual(r.dice, [], texto);
  }

  // Anything more than that is talk, and so is what isn't about a post of theirs that's up: nothing is said.
  const estaba = ver(chat, n);
  const ajena = publicar(chat, "mesa ratona $ 900", { quien: "333@lid", id: "AJENA" });
  const charla = [
    [`precio ${n} $ 2.000 negociable`],
    [`precio ${n} a 2000`],
    [`precio ${n} mil pesos, escucho ofertas`],
    [`precio ${n}`],
    ["Precio 4500"],
    ["precio: $ 100"],
    [`precios ${n} $ 100`],
    [`el precio ${n} $ 100`],
    [`precio ${ajena} $ 1`],
    ["precio $ 1", { quoted: cita("AJENA", "333@lid") }],
    ["precio 99 $ 100"],
    [`precio ${n} $ 100\n${"y de paso les cuento que ".repeat(10)}`],
  ];
  for (const [texto, opciones = {}] of charla) {
    const r = await escribir(chat, "111@lid", texto, opciones);
    assert.deepEqual([r.dice, r.marcas, r.m.respuestaDeVenta], [[], [], undefined], texto);
  }
  assert.deepEqual([ver(chat, n), ver(chat, ajena)], [estaba, ["mesa ratona $ 900", "$ 900"]]);
  // A moderator's word without the dot is a member's: for somebody else's post there's the command.
  assert.deepEqual((await escribir(chat, "222@lid", `precio ${n} $ 1`, { isMod: true })).dice, []);
  // Not one that's no longer up, nor a request.
  const pedido = publicar(chat, "heladera chica", { tipo: "compro" });
  assert.deepEqual((await escribir(chat, "111@lid", `precio ${pedido} $ 5.000`)).dice, []);
  C.cambiarEstado(chat, n, "111@lid", false, "vendido");
  assert.deepEqual((await escribir(chat, "111@lid", `precio ${n} $ 100`)).dice, []);
  assert.deepEqual(ver(chat, n), estaba);

  // In a buy-and-sell group, where loose messages are read as ads, it's still the price of their post and no ad.
  const ventas = grupo("corregir-sin-punto-ventas@g.us");
  F.updateChat(ventas, { games: 0, monedas: 0 });
  const enVentas = publicar(ventas, "silla gamer $ 3.000");
  const r = await escribir(ventas, "111@lid", `precio ${enVentas} $ 2.000`);
  assert.deepEqual([r.dice, r.marcas, ver(ventas, enVentas), F.publicacionesActivas(ventas).length], [[LISTO(enVentas, "$ 2.000")], [], ["silla gamer $ 2.000", "$ 2.000"], 1]);
  const suelto = await escribir(ventas, "111@lid", "Precio 4500");
  assert.deepEqual([suelto.dice, suelto.marcas], [[], []]);
});

test("sin el punto: con el comando bloqueado lleva 🔒, y las puertas del bot valen igual; una edición no se lee así", async () => {
  const chat = grupo("corregir-puertas@g.us");
  const n = publicar(chat, "silla gamer $ 3.000");
  const fila = () => F.getChat(chat);
  for (const contexto of [{ chat: { ...fila(), isBanned: 1 } }, { user: { banned: 1 } }, { chat: { ...fila(), adminMode: 1 } }]) {
    const r = await escribir(chat, "111@lid", `precio ${n} $ 100`, contexto);
    assert.deepEqual([r.dice, r.marcas], [[], []]);
  }
  F.updateChat(chat, { blacklistMode: 1 });
  F.addToChatBlacklist(chat, "precio");
  const bloqueado = await escribir(chat, "111@lid", `precio ${n} $ 100`);
  assert.deepEqual([bloqueado.dice, bloqueado.marcas, bloqueado.m.respuestaDeVenta], [[], ["🔒"], true]);
  // The owner isn't blocked, as with any command.
  assert.deepEqual((await escribir(chat, "111@lid", `precio ${n} $ 2.900`, { isOwner: true })).dice, [LISTO(n, "$ 2.900")]);
  F.updateChat(chat, { blacklistMode: 0 });
  // An edit says what a message says now: it isn't an order given again.
  const antes = globalThis.enviados.length;
  const edicion = { type: 14, key: { id: "CUALQUIERA" }, editedMessage: { conversation: `precio ${n} $ 100` } };
  await Hook.before({ chat, sender: "111@lid", text: "", isGroup: true, key: { id: `E${++k}`, participant: "111@lid" }, message: { protocolMessage: edicion }, quoted: null }, { client: conexion.client, chat: fila(), user: {}, isOwner: false, isMod: false });
  assert.deepEqual([enviadosA(chat, antes), ver(chat, n)], [[], ["silla gamer $ 2.900", "$ 2.900"]]);
});

// The price the post keeps is the one its text shows, as the bot reads it: sending the ad again at that price is the
// same ad, and renews the post instead of leaving two.
test("con el precio corregido, el mismo aviso a ese precio renueva la publicación en vez de hacer otra", async () => {
  const chat = grupo("corregir-repetida@g.us");
  const n = publicar(chat, "bici rodado 26 $ 4.000 Pocitos");
  await comando(chat, "111@lid", "precio", `${n} 3500`);
  const otraVez = C.publicar(chat, "111@lid", "vendo", "Bici rodado 26, $ 3500, Pocitos");
  assert.deepEqual([otraVez.renovada, otraVez.numero], [true, n]);
  await comando(chat, "111@lid", "precio", `${n} a 3000`);
  assert.deepEqual([C.publicar(chat, "111@lid", "vendo", "bici rodado 26 $ 3000 Pocitos").numero, F.publicacionesActivas(chat).length], [n, 1]);
  // At the price it had before, it's another ad again.
  const alViejo = C.publicar(chat, "111@lid", "vendo", "bici rodado 26 $ 4.000 Pocitos");
  assert.ok(!alViejo.renovada && alViejo.numero !== n);
});
