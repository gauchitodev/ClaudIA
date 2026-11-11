import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// What gets into the catalogue, and how the bot says so (lib/compraventa.js, plugins/_compraventa.js). An ad for sale
// gets in with what it is and its price: more than half of a real sales group's catalogue had no price, "Vendo, a las
// órdenes 🥰" included. Written loose in a buy-and-sell group it's answered with a mark and not a message (🏷️ it got
// in, ❔ it lacks something), and in words once per person: how to post, and their first post. And a message edited
// counts as written again. The ads here are that group's, word for word.

let F, C, Hook, Cmd;
let k = 0;
const VENTAS = { games: 0, charla: 0, saludos: 0, monedas: 0, ascensos: 0, recapSemanal: 0 };
const COMO = "Editá el mensaje o mandalo de nuevo así: *vendo*, qué es y a cuánto. Ej.: «vendo campera talle M $ 1.500».";
const UNA_VEZ = "Te lo cuento esta vez y no te molesto más con esto.";
const EXPLICA = (falta) => `📌 Para entrar al catálogo, a tu aviso le falta ${falta}. ${COMO}\nCuando entra, le pongo 🏷️; si le falta algo, ❔. ${UNA_VEZ}`;
const QUIZAS = `📌 Si esto es un aviso de venta, para que entre al catálogo tiene que empezar con «vendo». ${COMO}\nCuando entra, le pongo 🏷️. ${UNA_VEZ}`;
const PRIMERA = (n, precio) => `🏷️ Listo, quedó en el catálogo: es la *#${n}*, a ${precio}. Cuando se venda, respondé a tu mensaje con «vendido» (o con «baja» para sacarla).\nDe ahora en más te lo marco solo con 🏷️.`;
const NO_ENTRA = (falta) => `❌ Para entrar al catálogo, a tu aviso le falta ${falta}. Por ejemplo: #vendo bici rodado 26, $ 4.000, Pocitos`;

before(async () => {
  ({ F } = await prepararBase("regla"));
  C = await import("../lib/compraventa.js");
  Hook = (await import("../plugins/_compraventa.js")).default;
  Cmd = (await import("../plugins/compraventa.js")).default;
});

// A group of a test's own (the posts are numbered in each, and what a person was told is kept by group), in
// buy-and-sell mode unless told otherwise, with people the bot knows.
function grupo(chat, { ventas = true, gente = [111, 222, 333] } = {}) {
  for (const n of gente) F.initDataDB({ chat, sender: `${n}@lid`, senderJid: `59899000${n}@s.whatsapp.net`, pushName: `P${n}` });
  if (ventas) F.updateChat(chat, VENTAS);
  return chat;
}
// Every mark the bot put on a message written here, by that message's id.
const marcas = [];
const marcasDe = (m) => marcas.filter((x) => x.id === m.key.id).map((x) => x.emoji);
async function escribir(chat, sender, text, { quoted = null, client = conexion.client, ...contexto } = {}) {
  const m = { chat, sender, text, isGroup: true, key: { id: `K${++k}`, participant: sender }, quoted, react: async (emoji) => void marcas.push({ id: m.key.id, emoji }) };
  await Hook.before(m, { client, chat: F.getChat(chat), user: {}, isOwner: false, isMod: false, ...contexto });
  return m;
}
// An edit as WhatsApp sends it: a note about the message, with its id and what it says now (as a text, or as the
// caption of a photo; and it may come wrapped). It has no text of its own, and a mark on it would go nowhere.
async function editar(chat, sender, id, texto, { client = conexion.client, envuelta = false, pie = false, ...contexto } = {}) {
  const protocolMessage = { type: 14, key: { id }, editedMessage: pie ? { imageMessage: { caption: texto } } : { conversation: texto } };
  const m = {
    chat,
    sender,
    text: "",
    isGroup: true,
    key: { id: `E${++k}`, participant: sender },
    message: envuelta ? { editedMessage: { message: { protocolMessage } } } : { protocolMessage },
    quoted: null,
    react: async () => assert.fail("la marca va al mensaje editado, no a la nota de la edición"),
  };
  await Hook.before(m, { client, chat: F.getChat(chat), user: {}, isOwner: false, isMod: false, ...contexto });
  return m;
}
const comando = (chat, sender, command, text = "", { quoted = null, ...contexto } = {}) =>
  Cmd.run({ chat, sender, text, isGroup: true, key: { id: `K${++k}` }, quoted }, { client: conexion.client, command, args: text.trim() ? text.trim().split(/\s+/) : [], text, isMod: false, ...contexto });
const enviadosA = (chat, desde = 0) => globalThis.enviados.slice(desde).filter((e) => e.chat === chat).map((e) => e.msg);
const textosA = (chat, desde = 0) => enviadosA(chat, desde).map((e) => e.text);
const activas = (chat) => F.publicacionesActivas(chat).map((p) => p.numero).sort((a, b) => a - b);
// What the bot does with one more message: what it says to the group and the marks on that message.
async function alEscribir(chat, sender, text, opciones) {
  const antes = globalThis.enviados.length;
  const m = await escribir(chat, sender, text, opciones);
  return { m, dice: textosA(chat, antes), marcas: marcasDe(m) };
}

test("un mensaje suelto: el aviso que abre con «vendo», el que lo dice más adelante y el que no lo dice", () => {
  const lee = (texto) => C.detectarSuelta(texto);
  // It opens with it, maybe after a greeting, which may be a sentence of its own.
  assert.deepEqual(lee("Vendo parlante JBL flip 7 A 3500"), { tipo: "vendo", texto: "parlante JBL flip 7 A 3500" });
  assert.deepEqual(lee("Hola vendo un motorola g06 a 4 mil pesos"), { tipo: "vendo", texto: "un motorola g06 a 4 mil pesos" });
  assert.deepEqual(lee("Hola cómo andan? Vendo estas piezas. 200 cada una o 10 por 1500"), { tipo: "vendo", texto: "estas piezas. 200 cada una o 10 por 1500" });
  assert.deepEqual(lee("Holaa! Estoy vendiendo mi material de ESIC 📚"), { tipo: "vendo", texto: "mi material de ESIC 📚" });
  assert.deepEqual(lee("Holaa gente linda! Vendo torta de chocolate $ 300"), { tipo: "vendo", texto: "torta de chocolate $ 300" });
  assert.deepEqual(lee("Buenas! Ando vendiendo estos libros, la gran mayoría en inglés"), { tipo: "vendo", texto: "estos libros, la gran mayoría en inglés" });
  assert.deepEqual(lee("Permuto o vendo notebook gaming MSI"), { tipo: "vendo", texto: "notebook gaming MSI" });
  assert.deepEqual(lee("Se venden sillas"), { tipo: "vendo", texto: "sillas" });
  assert.deepEqual(lee("Buenas! Vendo , a las ordenes 🥰"), { tipo: "vendo", texto: "a las ordenes 🥰" });
  assert.deepEqual(lee("Vendo"), { tipo: "vendo", texto: "" });
  // Said further in, after the thing itself: all of the message is the ad.
  assert.deepEqual(lee("Chaleco Jordan original reversible, talle L. Vendo por no uso, $ 800"), { tipo: "vendo", texto: "Chaleco Jordan original reversible, talle L. Vendo por no uso, $ 800" });
  assert.deepEqual(lee("Campera Zara\nvendo a $ 650"), { tipo: "vendo", texto: "Campera Zara vendo a $ 650" });
  // A greeting is a few words: a first sentence that goes on to say what it is, is the ad.
  const zapatos = "Hola a todos, son zapatos de trabajo nuevos n° 39, lo único es que no tienen cordones. Vendo a $ 600";
  assert.deepEqual(lee(zapatos), { tipo: "vendo", texto: zapatos });
  // In the middle of a sentence it isn't an opening; and stuck to a dot it's the command being named.
  for (const t of ["me encanta como vende el chino", "casi vendo un riñón por mi pelo jaa", "Aca les paso un poco de lo que vendo", "pueden usar .vendo para listar sus productos"]) assert.equal(lee(t), null, t);
  // A thing and its price, without saying it's for sale.
  for (const t of ["Pinzas para cabello 100 pesos", "Play 4: $13.000 🐥🐥 -service reciente", "Tengo andador de bebe a $200", "500 pesos una silla de madera", "a alguien le interesa un somier de 2 plazas a 5500?"]) {
    assert.deepEqual(lee(t), { tipo: "vendo", texto: t, quizas: true }, t);
  }
  // A price with nothing it's the price of, or a thing with no price, is neither.
  for (const t of ["Holis, $300", "$1400 cada una", "Lo dejo 900", "Lo compré a 2000", "5 lucas", "Son 4 mil", "Tengo un montón de cositas", "A las ordenes! 💗💗", "Buenas, tengo catálogo de avon!"]) assert.equal(lee(t), null, t);
  // And a request is still a request, with its budget and all.
  assert.deepEqual(lee("Busco bici rodado 26 hasta $ 5.000"), { tipo: "compro", texto: "bici rodado 26 hasta $ 5.000", soloSugerir: true });
  assert.deepEqual(lee("¿Alguien vende una heladera por menos de 3 mil?"), { tipo: "compro", texto: "una heladera por menos de 3 mil", soloSugerir: true });
});

test("un aviso de venta entra con qué es y su precio; si no, dice qué le falta", async () => {
  const chat = grupo("regla-publicar@g.us", { ventas: false });
  const falta = (texto, tipo = "vendo") => C.publicar(chat, "111@lid", tipo, texto).falta;
  assert.deepEqual(falta("mesa de luz"), ["el precio"]);
  assert.deepEqual(falta("$ 800"), ["decir qué es"]);
  assert.deepEqual(falta("todo a $ 100"), ["decir qué es"], "«todo» no nombra nada");
  // The words of the price aren't what it is.
  assert.deepEqual([falta("4 mil"), falta("5 lucas")], [["decir qué es"], ["decir qué es"]]);
  assert.deepEqual(falta("a las órdenes"), ["el precio"]);
  assert.deepEqual(falta("todo, cualquier cosa consulten"), ["el precio"]);
  assert.deepEqual(falta("todo"), ["decir qué es", "el precio"]);
  assert.deepEqual(falta(""), ["decir qué es", "el precio"]);
  assert.deepEqual(activas(chat), [], "nada de eso queda publicado");
  // What it is may be two letters that stand for a thing, or letters and a number.
  for (const texto of ["tv $ 5.000", "PS5 $ 20.000", "mesa de luz $ 800"]) assert.ok(C.publicar(chat, "111@lid", "vendo", texto).ok, texto);
  // A request names what's wanted, and nothing more is asked of it.
  assert.deepEqual([C.publicar(chat, "222@lid", "compro", "heladera chica").ok, falta("", "compro")], [true, []]);

  // Asked for with the command or the hashtag, it's answered in words, every time.
  for (let i = 0; i < 2; i++) {
    await comando(chat, "222@lid", "vendo", "campera de cuero");
    assert.equal(globalThis.enviados.at(-1).msg.text, NO_ENTRA("el precio"));
    await escribir(chat, "222@lid", "#vendo campera de cuero");
    assert.equal(globalThis.enviados.at(-1).msg.text, NO_ENTRA("el precio"));
  }
  await comando(chat, "222@lid", "vendo", "", { quoted: { id: "FOTO", sender: "222@lid", fromMe: false, isBaileys: false, text: "Campera de cuero, talle M" } });
  assert.equal(globalThis.enviados.at(-1).msg.text, NO_ENTRA("el precio"), "la foto citada también tiene que decirlo");
  await comando(chat, "222@lid", "vendo", "campera de cuero $ 2.500");
  assert.match(globalThis.enviados.at(-1).msg.text, /^🏷️ \*Vendo #\d+\* registrada\. Precio: \$ 2\.500\. Se ve con \.vendo\. Cuando se concrete, respondé este mensaje con \.vendido \(o \.baja para sacarla\)\.$/);
});

test("escrito suelto, el primer aviso que entra se cuenta con palabras y los demás con 🏷️", async () => {
  const chat = grupo("regla-marcas@g.us");
  const primero = await alEscribir(chat, "111@lid", "Vendo parlante JBL flip 7 A 3500");
  assert.deepEqual([primero.dice, primero.marcas], [[PRIMERA(1, "3500")], ["🏷️"]]);
  // That confirmation is the post's: replying to it with the word closes the post.
  const confirmacion = F.getPublicacion(chat, 1).mensajeBot;
  assert.ok(confirmacion);
  const segundo = await alEscribir(chat, "111@lid", "Hola cómo andan? Vendo estas piezas. 200 cada una o 10 por 1500");
  assert.deepEqual([segundo.dice, segundo.marcas, activas(chat)], [[], ["🏷️"], [1, 2]]);
  assert.deepEqual([F.getPublicacion(chat, 2).texto, F.getPublicacion(chat, 2).precio, F.getPublicacion(chat, 2).mensajeBot], ["estas piezas. 200 cada una o 10 por 1500", "200 cada una", null]);
  // Somebody else's first is told to them; and so is the same person's first in another group.
  const deOtro = await alEscribir(chat, "222@lid", "Se vende ihpone 17. Muy poco uso. $40.000");
  assert.deepEqual([deOtro.dice, deOtro.marcas], [[PRIMERA(3, "$40.000")], ["🏷️"]]);
  const otro = grupo("regla-marcas-2@g.us");
  assert.deepEqual((await alEscribir(otro, "111@lid", "Vendo parlante JBL flip 7 A 3500")).dice, [PRIMERA(1, "3500")]);

  await escribir(chat, "111@lid", "Vendido", { quoted: { id: confirmacion, sender: "bot@lid", fromMe: true, isBaileys: true, text: "…" } });
  assert.deepEqual([F.getPublicacion(chat, 1).estado, activas(chat)], ["vendida", [2, 3]]);
  // A text cut for being too long says so in that first confirmation.
  const largo = await alEscribir(chat, "333@lid", `Vendo bici rodado 26 $ 4.000 ${"impecable ".repeat(120)}`);
  assert.equal(largo.dice[0], PRIMERA(4, "$ 4.000").replace("\nDe ahora", "\nEra muy larga: guardé las primeras 1000 letras.\nDe ahora"));
});

test("al aviso que le falta algo se le explica cómo publicar una vez, y después lleva ❔", async () => {
  const chat = grupo("regla-explica@g.us");
  const sinPrecio = await alEscribir(chat, "111@lid", "Vendo parlante JBL flip 7 con garantía");
  assert.deepEqual([sinPrecio.dice, sinPrecio.marcas, activas(chat)], [[EXPLICA("el precio")], [], []]);
  for (const texto of ["Vendo inodoro y bidet en color beige , envío fotos :", "Vendo", "Buenas! Vendo , a las ordenes 🥰"]) {
    const otraVez = await alEscribir(chat, "111@lid", texto);
    assert.deepEqual([otraVez.dice, otraVez.marcas], [[], ["❔"]], texto);
  }
  assert.deepEqual(activas(chat), []);
  // With its price it gets in: their first, told in words.
  const completo = await alEscribir(chat, "111@lid", "Vendo parlante JBL flip 7 con garantía, $ 3.500");
  assert.deepEqual([completo.dice, completo.marcas, activas(chat)], [[PRIMERA(1, "$ 3.500")], ["🏷️"], [1]]);

  // What it lacks is said as it is: the price, what it is, or both.
  assert.deepEqual((await alEscribir(chat, "222@lid", "Buenas! Vendo , a las ordenes 🥰")).dice, [EXPLICA("el precio")]);
  assert.deepEqual((await alEscribir(chat, "333@lid", "Vendo")).dice, [EXPLICA("decir qué es y el precio")]);
  const soloPrecio = grupo("regla-explica-2@g.us");
  assert.deepEqual((await alEscribir(soloPrecio, "111@lid", "Vendo todo a $ 100")).dice, [EXPLICA("decir qué es")], "en otro grupo se le explica de nuevo");
});

test("lo que puede ser un aviso sin decirlo se explica una vez, y nunca se publica", async () => {
  const chat = grupo("regla-quizas@g.us", { gente: [111, 222, 333, 444] });
  const feria = await alEscribir(chat, "111@lid", "Pinzas para cabello 100 pesos");
  assert.deepEqual([feria.dice, feria.marcas, activas(chat)], [[QUIZAS], [], []]);
  for (const texto of ["Pulseras 200 pesos", "Caravanas coloridas 100 pesos", "Libros 150 pesos cada uno"]) {
    const otraVez = await alEscribir(chat, "111@lid", texto);
    assert.deepEqual([otraVez.dice, otraVez.marcas], [[], []], texto);
  }
  // Whoever was told that way has been told: an ad of theirs that lacks something gets the mark.
  assert.deepEqual((await alEscribir(chat, "111@lid", "Vendo pulseras")).marcas, ["❔"]);
  assert.deepEqual(activas(chat), []);

  // An answer to somebody isn't an ad: a price given to whoever asked.
  const cita = { id: "PREGUNTA", sender: "333@lid", fromMe: false, isBaileys: false, text: "a cuánto la campera?" };
  const respuesta = await alEscribir(chat, "222@lid", "La campera sale $ 650", { quoted: cita });
  assert.deepEqual([respuesta.dice, respuesta.marcas], [[], []]);
  assert.deepEqual((await alEscribir(chat, "222@lid", "Campera Zara talle S grande, perfecto estado. $ 650")).dice, [QUIZAS], "y no quedó como explicado: se le explica cuando sí publica");
  // A request with its budget is a request, and a price with nothing it's the price of says nothing for sale.
  for (const texto of ["Busco bici rodado 26 hasta $ 5.000", "Holis, $300", "$1400 cada una", "Lo dejo 900", "che, alguien sabe algo?"]) {
    const nada = await alEscribir(chat, "333@lid", texto);
    assert.deepEqual([nada.dice, nada.marcas], [[], []], texto);
  }
  assert.deepEqual((await alEscribir(chat, "333@lid", "500 pesos una silla de madera")).dice, [QUIZAS], "a 333 no se le había explicado nada");
  // With "vendo" in front, as it was told, it gets in.
  const bien = await alEscribir(chat, "444@lid", "Vendo pinzas para cabello 100 pesos");
  assert.deepEqual([bien.dice, bien.marcas, activas(chat)], [[PRIMERA(1, "100 pesos")], ["🏷️"], [1]]);
});

test("a quien buscaba algo así se le cuenta aunque el aviso lleve solo la marca, y las alertas salen", async () => {
  const chat = grupo("regla-interesados@g.us");
  await alEscribir(chat, "111@lid", "Vendo silla gamer $ 3.000"); // their first, told in words
  await escribir(chat, "222@lid", "#busco heladera chica");
  await comando(chat, "333@lid", "avisame", "freezer");
  const aviso = await alEscribir(chat, "111@lid", "Vendo heladera con freezer $ 9.000");
  assert.deepEqual(aviso.marcas, ["🏷️"]);
  assert.deepEqual(enviadosA(chat).slice(-2), [
    { text: "💡 Esto puede ser lo que buscaba @222: «heladera chica» (#2).", mentions: ["222@lid"] },
    { text: "🔔 @333: apareció algo que buscabas. Vendo #3: heladera con freezer $ 9.000", mentions: ["333@lid"] },
  ]);
  // That message isn't the post's confirmation: replying to it closes nothing.
  assert.equal(F.getPublicacion(chat, 3).mensajeBot, null);
  // With nobody looking for it, the alert goes out all the same, and it's all that's said.
  const antes = globalThis.enviados.length;
  await alEscribir(chat, "111@lid", "Vendo freezer horizontal $ 7.000");
  assert.deepEqual(enviadosA(chat, antes), [{ text: "🔔 @333: apareció algo que buscabas. Vendo #4: freezer horizontal $ 7.000", mentions: ["333@lid"] }]);
});

test("las explicaciones tienen tope por hora en cada grupo, y quien quedó afuera la recibe después", async () => {
  const chat = grupo("regla-tope@g.us");
  const tope = C.COMPRAVENTA.EXPLICACIONES_POR_HORA;
  C.COMPRAVENTA.EXPLICACIONES_POR_HORA = 1;
  try {
    assert.deepEqual((await alEscribir(chat, "111@lid", "Vendo campera de cuero")).dice, [EXPLICA("el precio")]);
    const segundo = await alEscribir(chat, "222@lid", "Vendo zapatillas talle 40");
    assert.deepEqual([segundo.dice, segundo.marcas], [[], ["❔"]], "la segunda de la hora no sale");
    assert.deepEqual((await alEscribir(chat, "333@lid", "Pulseras 200 pesos")).dice, []);
    // Another group has its own count.
    const otro = grupo("regla-tope-2@g.us");
    assert.deepEqual((await alEscribir(otro, "222@lid", "Vendo zapatillas talle 40")).dice, [EXPLICA("el precio")]);
    // An hour later, whoever was left out is told: nothing had been noted down for them.
    const despues = Date.now() + 3600e3;
    assert.equal(C.explicacionPara(chat, "222@lid", ["el precio"], { ahora: despues }), EXPLICA("el precio"));
    assert.equal(C.explicacionPara(chat, "333@lid", [], { quizas: true, ahora: despues }), null, "y el tope vuelve a contar desde ahí");
    assert.equal(C.explicacionPara(chat, "222@lid", ["el precio"], { ahora: despues + 2 * 3600e3 }), null, "una sola vez");
  } finally {
    C.COMPRAVENTA.EXPLICACIONES_POR_HORA = tope;
  }
});

// What a person was told is kept with their data in the group. By either of their ids; and for somebody the bot has no
// row for, it can't be kept: nothing in words then, rather than the same words every time.
test("lo que se le dijo a cada uno vale por cualquiera de sus dos ids, y sin su fila no se le dice nada", async () => {
  const chat = grupo("regla-identidad@g.us");
  const [LID, NUMERO] = ["111@lid", "59899000111@s.whatsapp.net"];
  assert.deepEqual((await alEscribir(chat, NUMERO, "Vendo campera de cuero")).dice, [EXPLICA("el precio")]);
  assert.deepEqual((await alEscribir(chat, LID, "Vendo campera de cuero")).marcas, ["❔"]);
  assert.deepEqual((await alEscribir(chat, LID, "Vendo campera de cuero $ 2.500")).dice, [PRIMERA(1, "$ 2.500")]);
  assert.deepEqual((await alEscribir(chat, NUMERO, "Vendo zapatillas talle 40 $ 1.200")).dice, []);
  assert.ok(F.getUser(LID).inGroup[chat].ventaExplicada > 0 && F.getUser(LID).inGroup[chat].ventaConfirmada > 0);

  const nadie = "999888@lid";
  assert.equal(F.getUser(nadie), null);
  const incompleto = await alEscribir(chat, nadie, "Vendo campera de cuero");
  assert.deepEqual([incompleto.dice, incompleto.marcas], [[], ["❔"]]);
  assert.deepEqual((await alEscribir(chat, nadie, "Pulseras 200 pesos")).dice, []);
  const completo = await alEscribir(chat, nadie, "Vendo campera de jean $ 900");
  assert.deepEqual([completo.dice, completo.marcas, F.publicacionesActivas(chat).length], [[], ["🏷️"], 3]);
});

test("con .vendo bloqueado, el aviso suelto lleva 🔒 y lo que solo puede ser uno no lleva nada", async () => {
  const chat = grupo("regla-bloqueado@g.us");
  F.updateChat(chat, { blacklistMode: 1 });
  F.addToChatBlacklist(chat, "vendo");
  for (const [texto, marca] of [["Vendo campera de cuero $ 2.500", ["🔒"]], ["Vendo campera de cuero", ["🔒"]], ["Pulseras 200 pesos", []]]) {
    const r = await alEscribir(chat, "111@lid", texto);
    assert.deepEqual([r.dice, r.marcas], [[], marca], texto);
  }
  assert.deepEqual(activas(chat), []);
  assert.ok(!F.getUser("111@lid").inGroup[chat]?.ventaExplicada, "ni queda como explicado");
});

// A client that keeps what each text quoted, which the suite's doesn't.
function clienteQueCita() {
  const hechos = [];
  return {
    hechos,
    sendMessage: async (chat, msg) => {
      hechos.push({ chat, msg });
      return { key: { id: `R${hechos.length}` } };
    },
    sendText: async (chat, text, quoted, opciones = {}) => {
      hechos.push({ chat, text, cita: quoted && { key: quoted.key, message: quoted.message }, mentions: opciones.mentions });
      return { key: { id: `R${hechos.length}` } };
    },
  };
}

test("editar el mensaje para completarlo lo publica, con la marca y la cita en el mensaje editado", async () => {
  const chat = grupo("regla-editar@g.us");
  const client = clienteQueCita();
  const original = await escribir(chat, "111@lid", "Vendo campera de cuero", { client });
  assert.deepEqual(client.hechos.map((h) => h.text), [EXPLICA("el precio")]);
  await editar(chat, "111@lid", original.key.id, "Vendo campera de cuero $ 2.500", { client });
  const p = F.getPublicacion(chat, 1);
  assert.deepEqual([p.texto, p.precio, p.messageId, p.usuario], ["campera de cuero $ 2.500", "$ 2.500", original.key.id, "111@lid"]);
  const clave = { remoteJid: chat, fromMe: false, id: original.key.id, participant: "111@lid" };
  assert.deepEqual(client.hechos.slice(1), [
    { chat, msg: { react: { text: "🏷️", key: clave } } },
    { chat, text: PRIMERA(1, "$ 2.500"), cita: { key: clave, message: { conversation: "Vendo campera de cuero $ 2.500" } }, mentions: [] },
  ]);
  assert.equal(p.mensajeBot, "R3", "y esa confirmación es la de la publicación");

  // Wrapped in editedMessage, or as the caption of a photo: the same.
  const foto = await escribir(chat, "222@lid", "Vendo estos libros, en excelentes condiciones", { client });
  await editar(chat, "222@lid", foto.key.id, "Vendo estos libros, en excelentes condiciones. $ 150 cada uno", { client, envuelta: true, pie: true });
  assert.deepEqual([F.getPublicacion(chat, 2)?.precio, F.getPublicacion(chat, 2)?.messageId], ["$ 150", foto.key.id]);
  // What didn't say it was for sale gets in too, once it does.
  const sinDecirlo = await escribir(chat, "333@lid", "Pulseras 200 pesos", { client });
  await editar(chat, "333@lid", sinDecirlo.key.id, "Vendo pulseras 200 pesos", { client });
  assert.deepEqual([F.getPublicacion(chat, 3)?.texto, activas(chat)], ["pulseras 200 pesos", [1, 2, 3]]);
});

test("editar el mensaje de una publicación la reescribe y la renueva; el de otro, o una edición que la deja sin precio, no", async () => {
  const chat = grupo("regla-reescribe@g.us");
  const m = await escribir(chat, "111@lid", "Vendo zapatos de trabajo nuevos n°39, $ 600");
  F.actualizarPublicacion(chat, 1, { actualizada: 5, aviso: 7 }); // old, and asked about
  const antes = globalThis.enviados.length;
  await editar(chat, "111@lid", m.key.id, "Vendo zapatos de trabajo nuevos n°39, sin cordones, $ 500");
  let p = F.getPublicacion(chat, 1);
  assert.deepEqual([p.texto, p.precio, p.aviso, activas(chat)], ["zapatos de trabajo nuevos n°39, sin cordones, $ 500", "$ 500", 0, [1]]);
  assert.ok(Date.now() - p.actualizada < 5000, "renovada");
  assert.deepEqual(enviadosA(chat, antes), [{ react: { text: "🏷️", key: { remoteJid: chat, fromMe: false, id: m.key.id, participant: "111@lid" } } }], "sin palabras: la marca de nuevo");

  // Not somebody else's edit (a note about a message can be forged), nor one that leaves it short of something, nor
  // one that's no ad any more: the post stays as it was, and there's never a second one from the same message.
  const queda = () => {
    p = F.getPublicacion(chat, 1);
    return [p.texto, p.precio, activas(chat)];
  };
  const estaba = queda();
  await editar(chat, "222@lid", m.key.id, "Vendo zapatos de trabajo nuevos n°39, $ 1");
  await editar(chat, "111@lid", m.key.id, "Vendo zapatos de trabajo nuevos n°39");
  await editar(chat, "111@lid", m.key.id, "Vendo $ 500");
  await editar(chat, "111@lid", m.key.id, "gracias a todos los que preguntaron");
  assert.deepEqual(queda(), estaba);
  // Rewritten without the word, it's still that post, and it's theirs.
  await editar(chat, "111@lid", m.key.id, "Zapatos de trabajo n°39 a $ 450");
  assert.deepEqual(queda(), ["Zapatos de trabajo n°39 a $ 450", "$ 450", [1]]);
  // Not the one the bot took down or its author closed.
  C.cambiarEstado(chat, 1, "111@lid", false, "baja");
  await editar(chat, "111@lid", m.key.id, "Vendo zapatos de trabajo n°39 a $ 400");
  assert.deepEqual([F.getPublicacion(chat, 1).estado, F.getPublicacion(chat, 1).precio, activas(chat)], ["cerrada", "$ 450", []]);

  // In a group of friends the hashtag is what posts, and its edit rewrites the post the same way.
  const amigos = grupo("regla-reescribe-amigos@g.us", { ventas: false });
  const conHashtag = await escribir(amigos, "111@lid", "#vendo bici rodado 26 $ 4.000");
  await editar(amigos, "111@lid", conHashtag.key.id, "#vendo bici rodado 26 $ 3.500 Pocitos");
  assert.deepEqual([F.getPublicacion(amigos, 1).texto, F.getPublicacion(amigos, 1).precio, activas(amigos)], ["bici rodado 26 $ 3.500 Pocitos", "$ 3.500", [1]]);
});

test("una edición no trae explicaciones, ni pedidos, ni respuestas; y con un enlace no se lee", async () => {
  const chat = grupo("regla-edicion-nada@g.us");
  await escribir(chat, "111@lid", "Vendo silla gamer $ 3.000");
  const charla = await escribir(chat, "222@lid", "hola, cómo andan?");
  const antes = globalThis.enviados.length;
  // Into an ad that lacks something, or that doesn't say it's one: nothing, and nothing noted down.
  await editar(chat, "222@lid", charla.key.id, "Vendo campera de cuero");
  await editar(chat, "222@lid", charla.key.id, "Pulseras 200 pesos");
  // Into a request, or an answer about a post.
  await editar(chat, "222@lid", charla.key.id, "¿Alguien vende una silla?");
  await editar(chat, "111@lid", charla.key.id, "Vendido 1");
  // Into a command, which isn't run either; and what's under it isn't read as an ad, as in a message.
  await editar(chat, "222@lid", charla.key.id, ".vendo campera de cuero $ 2.500");
  await editar(chat, "222@lid", charla.key.id, ".menu\nVendo campera de cuero $ 2.500");
  assert.deepEqual([enviadosA(chat, antes), activas(chat), F.getPublicacion(chat, 1).estado], [[], [1], "activa"]);
  assert.ok(!F.getUser("222@lid").inGroup[chat]?.ventaExplicada);

  // What the moderation would have deleted as a message isn't read as an edit: a link, or somebody muted.
  await editar(chat, "222@lid", charla.key.id, "Vendo campera de cuero $ 2.500, fotos en instagram.com/campera");
  F.updateUserInGroup("333@lid", chat, { mute: true });
  const silenciado = await escribir(chat, "333@lid", "hola");
  await editar(chat, "333@lid", silenciado.key.id, "Vendo campera de jean $ 900");
  assert.deepEqual([enviadosA(chat, antes), activas(chat)], [[], [1]]);
  // The doors the hook closes for a message, it closes for its edit.
  await editar(chat, "222@lid", charla.key.id, "Vendo campera de cuero $ 2.500", { chat: { ...F.getChat(chat), isBanned: 1 } });
  await editar(chat, "222@lid", charla.key.id, "Vendo campera de cuero $ 2.500", { user: { banned: 1 } });
  assert.deepEqual(activas(chat), [1]);
  // And with none of that in the way, the same edit posts it.
  await editar(chat, "222@lid", charla.key.id, "Vendo campera de cuero $ 2.500");
  assert.deepEqual(activas(chat), [1, 2]);
});

// lib/ediciones.js: what an edit is, as WhatsApp sends it. A deletion is the same kind of note with another type.
test("una edición se reconoce por su tipo, envuelta o no, y trae el id del mensaje y lo que dice ahora", async () => {
  const { edicionDe } = await import("../lib/ediciones.js");
  const nota = (protocolMessage) => ({ message: { protocolMessage } });
  assert.deepEqual(edicionDe(nota({ type: 14, key: { id: "A1" }, editedMessage: { conversation: "hola" } })), { id: "A1", contenido: { conversation: "hola" }, texto: "hola" });
  assert.equal(edicionDe(nota({ type: 14, key: { id: "A1" }, editedMessage: { extendedTextMessage: { text: "con formato" } } })).texto, "con formato");
  assert.equal(edicionDe(nota({ type: 14, key: { id: "A1" }, editedMessage: { imageMessage: { caption: "el pie" } } })).texto, "el pie");
  assert.equal(edicionDe({ message: { editedMessage: { message: { protocolMessage: { type: 14, key: { id: "A2" }, editedMessage: { conversation: "envuelta" } } } } } }).id, "A2");
  assert.equal(edicionDe(nota({ type: 14, key: { id: "A1" }, editedMessage: { imageMessage: {} } })).texto, "", "una foto sin pie no dice nada");
  for (const m of [nota({ type: 0, key: { id: "A1" } }), nota({ type: 14, key: {}, editedMessage: { conversation: "sin id" } }), { message: { conversation: "un mensaje" } }, { message: null }, {}, null]) {
    assert.equal(edicionDe(m), null);
  }
});

test("en un grupo de amigos lo suelto sigue sin leerse: ni marcas ni explicaciones", async () => {
  const chat = grupo("regla-amigos@g.us", { ventas: false });
  for (const texto of ["Vendo campera de cuero $ 2.500", "Vendo a mi hermano, barato", "Pulseras 200 pesos"]) {
    const r = await alEscribir(chat, "111@lid", texto);
    assert.deepEqual([r.dice, r.marcas], [[], []], texto);
  }
  assert.deepEqual(activas(chat), []);
});
