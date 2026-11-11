import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// What the bot does, in a buy-and-sell group, with a message its rules read as nothing and the classifier reads as
// someone selling or looking for something (lib/intencion.js, plugins/_compraventa.js): nothing is posted, and its
// author is told how to, once. And what a request gets when there's nothing to suggest, whoever read it.
// What the classifier reads is set by each test here, by the message's text: what the shipped weights make of a text
// is test/intencion.test.mjs's.

let F, C, I, Hook;
let k = 0;
const VENTAS = { games: 0, charla: 0, saludos: 0, monedas: 0, ascensos: 0, recapSemanal: 0 };
const COMO = "Editá el mensaje o mandalo de nuevo así: *vendo*, qué es y a cuánto. Ej.: «vendo campera talle M $ 1.500».";
const UNA_VEZ = "Te lo cuento esta vez y no te molesto más con esto.";
const QUIZAS = `📌 Si esto es un aviso de venta, para que entre al catálogo tiene que empezar con «vendo». ${COMO}\nCuando entra, le pongo 🏷️. ${UNA_VEZ}`;
const EXPLICA = (falta) => `📌 Para entrar al catálogo, a tu aviso le falta ${falta}. ${COMO}\nCuando entra, le pongo 🏷️; si le falta algo, ❔. ${UNA_VEZ}`;
const PEDIDO = `📌 Si estás buscando algo, para que quede anotado escribilo así: *#busco* y qué es. Ej.: «#busco bici rodado 26».\nQueda en el catálogo, te recuerdo quién vende algo parecido y te aviso cuando alguien lo publique. ${UNA_VEZ}`;

// What the classifier says of each text, in lib/intencion.js's order (nada, vender, comprar), and what it was asked.
const VENDE = [0.03, 0.95, 0.02];
const BUSCA = [0.03, 0.02, 0.95];
const preguntas = [];
function leyendo(mapa) {
  I._dep.probabilidades = (texto) => {
    preguntas.push(texto);
    return mapa[texto] ?? [0.98, 0.01, 0.01];
  };
}

before(async () => {
  ({ F } = await prepararBase("intencion"));
  C = await import("../lib/compraventa.js");
  I = await import("../lib/intencion.js");
  Hook = (await import("../plugins/_compraventa.js")).default;
});
beforeEach(() => {
  preguntas.length = 0;
  leyendo({});
});

// A group of a test's own, in buy-and-sell mode unless told otherwise, with people the bot knows.
function grupo(chat, { ventas = true, gente = [111, 222, 333, 444] } = {}) {
  for (const n of gente) F.initDataDB({ chat, sender: `${n}@lid`, senderJid: `59899000${n}@s.whatsapp.net`, pushName: `P${n}` });
  if (ventas) F.updateChat(chat, VENTAS);
  return chat;
}
const marcas = [];
// What the bot does with one more message: what it says to the group and the marks on that message.
async function alEscribir(chat, sender, text, { quoted = null, mensaje = {}, ...contexto } = {}) {
  const antes = globalThis.enviados.length;
  const m = { chat, sender, text, isGroup: true, key: { id: `K${++k}`, participant: sender }, quoted, react: async (emoji) => void marcas.push({ id: m.key.id, emoji }), ...mensaje };
  await Hook.before(m, { client: conexion.client, chat: F.getChat(chat), user: {}, isOwner: false, isMod: false, ...contexto });
  const dice = globalThis.enviados.slice(antes).filter((e) => e.chat === chat).map((e) => e.msg.text);
  return { m, dice, marcas: marcas.filter((x) => x.id === m.key.id).map((x) => x.emoji) };
}
const activas = (chat) => F.publicacionesActivas(chat).map((p) => p.numero);

test("lo que se lee como una intención: una venta como lo que puede ser un aviso, un pedido como uno que solo se sugiere", () => {
  leyendo({ "$ 300": VENDE, "alguna   tablet\na la venta?": BUSCA });
  assert.deepEqual(C.detectarIntencion("$ 300"), { tipo: "vendo", texto: "$ 300", quizas: true });
  assert.deepEqual(C.detectarIntencion("alguna   tablet\na la venta?"), { tipo: "compro", texto: "alguna tablet a la venta?", soloSugerir: true });
  assert.equal(C.detectarIntencion("qué lindo día"), null);
  // Under the threshold it reads nothing.
  leyendo({ "$ 300": [0.11, 0.89, 0], "$ 301": [0.1, 0.9, 0] });
  assert.equal(C.detectarIntencion("$ 300"), null);
  assert.equal(C.detectarIntencion("$ 301").tipo, "vendo");
});

test("lo que las reglas no leen y el clasificador lee como venta se explica una vez por persona, y no se publica", async () => {
  const chat = grupo("intencion-venta@g.us");
  leyendo({ "$ 300": VENDE, "Tengo un monitor": VENDE });
  const precio = await alEscribir(chat, "111@lid", "$ 300");
  assert.deepEqual([precio.dice, precio.marcas, activas(chat)], [[QUIZAS], [], []]);
  const otro = await alEscribir(chat, "111@lid", "Tengo un monitor");
  assert.deepEqual([otro.dice, otro.marcas], [[], []], "una vez por persona");
  assert.deepEqual((await alEscribir(chat, "222@lid", "Tengo un monitor")).dice, [QUIZAS], "a cada una");
  assert.ok(F.getUser("111@lid").inGroup[chat].ventaExplicada > 0);
  // It's the same explanation the rules give: whoever got theirs isn't told again by the classifier.
  assert.deepEqual((await alEscribir(chat, "333@lid", "Vendo campera de cuero")).dice, [EXPLICA("el precio")]);
  assert.deepEqual((await alEscribir(chat, "333@lid", "$ 300")).dice, []);
  // And with nothing read, nothing is said.
  const charla = await alEscribir(chat, "444@lid", "qué lindo día");
  assert.deepEqual([charla.dice, charla.marcas, preguntas.at(-1)], [[], [], "qué lindo día"]);
  assert.deepEqual(activas(chat), []);
});

test("lo que lee como un pedido: cómo dejarlo anotado, una vez por persona, o quién vende algo así", async () => {
  const chat = grupo("intencion-pedido@g.us");
  leyendo({ "alguna tablet a la venta?": BUSCA, "de casualidad alguno tiene una cuna": BUSCA, "tablet alguna a la venta?": BUSCA });
  const pedido = await alEscribir(chat, "111@lid", "alguna tablet a la venta?");
  assert.deepEqual([pedido.dice, pedido.marcas], [[PEDIDO], []]);
  assert.deepEqual((await alEscribir(chat, "111@lid", "de casualidad alguno tiene una cuna")).dice, [], "una vez por persona");
  assert.ok(F.getUser("111@lid").inGroup[chat].pedidoExplicado > 0);
  assert.equal(F.getPublicacion(chat, 1), null, "y no queda anotado: para eso es #busco");
  // With something like it up for sale, by the word the message opens with: who sells it, as with any request.
  assert.ok(C.publicar(chat, "222@lid", "vendo", "tablet samsung $ 3.000").ok);
  const conAlgo = await alEscribir(chat, "333@lid", "tablet alguna a la venta?");
  assert.deepEqual(conAlgo.dice, ["💡 @333, recuerdo que @222 está vendiendo «tablet samsung $ 3.000» (#1).\nPara hablarle, respondé a su publicación.\nPara que quede anotado lo que buscás: #busco y qué es."]);
  assert.deepEqual(activas(chat), [1]);
});

test("las reglas van primero: lo que ellas leen no se le pregunta al clasificador, ni un comando, ni una respuesta sobre una publicación", async () => {
  const chat = grupo("intencion-reglas@g.us");
  const todo = new Proxy({}, { get: () => VENDE });
  leyendo(todo);
  await alEscribir(chat, "111@lid", "Vendo silla gamer $ 3.000");
  await alEscribir(chat, "111@lid", "Vendo");
  await alEscribir(chat, "222@lid", "Pulseras 200 pesos");
  await alEscribir(chat, "333@lid", "busco una silla");
  await alEscribir(chat, "333@lid", "#busco una mesa ratona");
  await alEscribir(chat, "444@lid", ".vendo mesa $ 900");
  await alEscribir(chat, "111@lid", "precio 1 $ 2.500");
  await alEscribir(chat, "111@lid", "Vendido 1");
  assert.deepEqual(preguntas, []);
  assert.deepEqual([F.getPublicacion(chat, 1).precio, F.getPublicacion(chat, 1).estado], ["$ 2.500", "vendida"]);
});

test("no se le pregunta por una edición, una respuesta a alguien ni lo de un moderador; ni fuera de un grupo de ventas", async () => {
  const chat = grupo("intencion-no@g.us");
  const amigos = grupo("intencion-amigos@g.us", { ventas: false });
  leyendo({ "$ 300": VENDE, "alguna tablet a la venta?": BUSCA });
  const cita = { id: "PREGUNTA", sender: "333@lid", fromMe: false, isBaileys: false, text: "a cuánto?" };
  const casos = [
    ["una respuesta a alguien", chat, { quoted: cita }],
    ["un moderador", chat, { isMod: true }],
    ["un grupo de amigos", amigos, {}],
    ["el propio bot", chat, { mensaje: { fromMe: true } }],
    ["lo que borró la moderación", chat, { mensaje: { moderado: true } }],
    ["un chat con .banchat", chat, { chat: { ...F.getChat(chat), isBanned: 1 } }],
    ["en .modoadmin", chat, { chat: { ...F.getChat(chat), adminMode: 1 } }],
    ["alguien baneado del bot", chat, { user: { banned: 1 } }],
  ];
  for (const [que, donde, opciones] of casos) {
    for (const texto of ["$ 300", "alguna tablet a la venta?"]) {
      const r = await alEscribir(donde, "111@lid", texto, opciones);
      assert.deepEqual([r.dice, r.marcas], [[], []], `${que}: ${texto}`);
    }
  }
  // An edit is a note about a message: what it says now is read by the rules, and no more.
  const edicion = { text: "", message: { protocolMessage: { type: 14, key: { id: "K-EDITADO" }, editedMessage: { conversation: "$ 300" } } } };
  assert.deepEqual((await alEscribir(chat, "111@lid", "", { mensaje: edicion })).dice, []);
  assert.deepEqual(preguntas, []);
  assert.ok(!F.getUser("111@lid").inGroup[chat]?.ventaExplicada && !F.getUser("111@lid").inGroup[chat]?.pedidoExplicado, "ni queda como explicado");
  // The same two, written plainly by that person, are read.
  assert.deepEqual((await alEscribir(chat, "111@lid", "$ 300")).dice, [QUIZAS]);
  assert.deepEqual((await alEscribir(chat, "111@lid", "alguna tablet a la venta?")).dice, [PEDIDO]);
});

test("con .vendo o .compro bloqueado, lo que se lee como eso no dice nada, ni queda como explicado", async () => {
  const chat = grupo("intencion-bloqueado@g.us");
  leyendo({ "$ 300": VENDE, "alguna tablet a la venta?": BUSCA });
  F.updateChat(chat, { blacklistMode: 1 });
  F.addToChatBlacklist(chat, "vendo");
  assert.deepEqual((await alEscribir(chat, "111@lid", "$ 300")).dice, []);
  assert.deepEqual((await alEscribir(chat, "111@lid", "alguna tablet a la venta?")).dice, [PEDIDO], "lo bloqueado es .vendo");
  F.addToChatBlacklist(chat, "compro");
  assert.deepEqual((await alEscribir(chat, "222@lid", "alguna tablet a la venta?")).dice, []);
  assert.deepEqual((await alEscribir(chat, "222@lid", "busco una silla")).dice, [], "y el pedido que leen las reglas, tampoco");
  assert.ok(!F.getUser("111@lid").inGroup[chat].ventaExplicada && !F.getUser("222@lid").inGroup[chat]?.pedidoExplicado);
});

test("sin los pesos, o si el clasificador falla, el bot sigue como antes", async () => {
  const chat = grupo("intencion-sin-modelo@g.us");
  I._dep.probabilidades = () => null;
  assert.deepEqual((await alEscribir(chat, "111@lid", "$ 300")).dice, []);
  assert.deepEqual((await alEscribir(chat, "111@lid", "Vendo silla gamer $ 3.000")).marcas, ["🏷️"]);
});

// A loose request isn't kept. With nothing like it up for sale the bot said nothing, and whoever asked never learnt
// of #busco.
test("un pedido que leen las reglas, sin nada que sugerirle: cómo dejarlo anotado, una vez", async () => {
  const chat = grupo("intencion-pedido-reglas@g.us");
  const pedido = await alEscribir(chat, "111@lid", "Busco una silla de escritorio");
  assert.deepEqual([pedido.dice, pedido.marcas], [[PEDIDO], []]);
  assert.deepEqual((await alEscribir(chat, "111@lid", "¿Alguien vende un unicornio?")).dice, [], "una sola vez");
  assert.deepEqual(preguntas, [], "y al clasificador no se le preguntó nada");
  // By either of their ids.
  assert.deepEqual((await alEscribir(chat, "59899000222@s.whatsapp.net", "busco una mesa ratona")).dice, [PEDIDO]);
  assert.deepEqual((await alEscribir(chat, "222@lid", "busco un espejo")).dice, []);
  // A request that answers somebody gets its suggestions, and not this: "necesito que me la reserves" reads as one.
  const cita = { id: "AVISO", sender: "111@lid", fromMe: false, isBaileys: false, text: "vendo campera" };
  assert.deepEqual((await alEscribir(chat, "333@lid", "Necesito que me la reserves hasta el viernes", { quoted: cita })).dice, []);
  assert.ok(!F.getUser("333@lid").inGroup[chat]?.pedidoExplicado, "ni queda como dicho");
  assert.deepEqual((await alEscribir(chat, "333@lid", "busco un espejo")).dice, [PEDIDO]);
  // Somebody the bot has no row for can't be noted down as told: nothing is said, rather than every time.
  assert.deepEqual((await alEscribir(chat, "999888@lid", "busco un espejo")).dice, []);
});

test("un pedido con algo que sugerirle lleva las sugerencias, que ya lo dicen; y quien tiene un pedido publicado ya sabe", async () => {
  const chat = grupo("intencion-sugerencias@g.us");
  assert.ok(C.publicar(chat, "111@lid", "vendo", "silla gamer $ 3.000").ok);
  const conAlgo = await alEscribir(chat, "222@lid", "¿Alguien vende una silla?");
  assert.match(conAlgo.dice[0], /^💡 @222, recuerdo que @111 está vendiendo «silla gamer \$ 3\.000» \(#1\)\.[\s\S]*#busco y qué es\.$/);
  assert.ok(F.getUser("222@lid").inGroup[chat].pedidoExplicado > 0, "quedó dicho");
  assert.deepEqual((await alEscribir(chat, "222@lid", "busco un unicornio")).dice, [], "y sola no se le repite");
  // Whoever has a request up did it: they know how. Under either of their ids.
  await alEscribir(chat, "333@lid", "#busco heladera chica");
  assert.deepEqual((await alEscribir(chat, "333@lid", "busco un unicornio")).dice, []);
  assert.deepEqual((await alEscribir(chat, "59899000333@s.whatsapp.net", "busco un unicornio")).dice, []);
  assert.ok(!F.getUser("333@lid").inGroup[chat]?.pedidoExplicado);
  // Once it's closed, they're told like anybody.
  assert.ok(C.cambiarEstado(chat, 2, "333@lid", false, "baja").ok);
  assert.deepEqual((await alEscribir(chat, "333@lid", "busco un unicornio")).dice, [PEDIDO]);
  // And having something up for sale isn't knowing how to ask for something.
  assert.deepEqual((await alEscribir(chat, "111@lid", "busco un unicornio")).dice, [PEDIDO]);
});

test("las explicaciones de venta y las de pedido comparten el tope por hora, y la de pedido cuenta como respuesta a un pedido", async () => {
  const chat = grupo("intencion-tope@g.us");
  leyendo({ "$ 300": VENDE, "alguna tablet a la venta?": BUSCA });
  const [explicaciones, sugerencias] = [C.COMPRAVENTA.EXPLICACIONES_POR_HORA, C.COMPRAVENTA.SUGERENCIAS_POR_HORA];
  try {
    C.COMPRAVENTA.EXPLICACIONES_POR_HORA = 2;
    assert.deepEqual((await alEscribir(chat, "111@lid", "$ 300")).dice, [QUIZAS]);
    assert.deepEqual((await alEscribir(chat, "222@lid", "alguna tablet a la venta?")).dice, [PEDIDO]);
    assert.deepEqual((await alEscribir(chat, "333@lid", "busco una silla")).dice, [], "la tercera de la hora no sale");
    assert.deepEqual((await alEscribir(chat, "444@lid", "$ 300")).dice, []);
    // An hour later whoever was left out is told: nothing had been noted down for them.
    const despues = Date.now() + 3600e3;
    assert.equal(C.explicacionDePedido(chat, "333@lid", { ahora: despues }), PEDIDO);
    assert.equal(C.explicacionPara(chat, "444@lid", [], { quizas: true, ahora: despues }), QUIZAS);
    assert.equal(C.explicacionDePedido(chat, "111@lid", { ahora: despues }), null, "y el tope vuelve a contar desde ahí");

    // It's an answer to a loose request like the suggestions are: past the group's for the hour, it doesn't go out.
    const otro = grupo("intencion-tope-2@g.us");
    C.COMPRAVENTA.EXPLICACIONES_POR_HORA = explicaciones;
    C.COMPRAVENTA.SUGERENCIAS_POR_HORA = 1;
    assert.deepEqual((await alEscribir(otro, "111@lid", "busco una silla")).dice, [PEDIDO]);
    assert.deepEqual((await alEscribir(otro, "222@lid", "busco una mesa")).dice, []);
    assert.ok(!F.getUser("222@lid").inGroup[otro]?.pedidoExplicado, "ni queda como dicho");
  } finally {
    [C.COMPRAVENTA.EXPLICACIONES_POR_HORA, C.COMPRAVENTA.SUGERENCIAS_POR_HORA] = [explicaciones, sugerencias];
  }
});
