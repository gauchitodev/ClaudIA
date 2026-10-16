import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

// The marketplace connects buyers and sellers (lib/compraventa.js): whoever looks for something is reminded of who sells
// something like it, and whoever sells hears who was looking. In a buy-and-sell group (.modo compraventa) it also reads
// loose messages: "vendo…" is posted, "¿alguien vende…?" gets the reminder.

let F, C, Hook;
const V = "ventas@g.us"; // a group in buy-and-sell mode; G stays a group of friends
let k = 0;
const msg = (chat, sender, text) => ({ chat, sender, text, isGroup: true, key: { id: `K${++k}` } });
const escribir = (chat, sender, text) => Hook.before(msg(chat, sender, text), { client: globalThis.client, chat: F.getChat(chat) });

before(async () => {
  ({ F } = await prepararBase("sugerencias"));
  C = await import("../lib/compraventa.js");
  Hook = (await import("../plugins/_compraventa.js")).default;
  for (const n of [111, 222, 333, 444, 555, 666, 777]) {
    for (const chat of [G, V]) F.initDataDB({ chat, sender: `${n}@lid`, senderJid: "", pushName: `Persona ${n}` });
  }
  F.updateChat(V, { games: 0, charla: 0, saludos: 0, monedas: 0, ascensos: 0, recapSemanal: 0 }); // what .modo compraventa does
});

test("palabras clave: sin acentos, números, plurales ni palabras vacías, y con los sinónimos de acá", () => {
  assert.deepEqual(C.palabrasClave("Vendo 2 bicicletas rodado 26, $ 4.000 en Pocitos!"), ["bici", "rodado", "pocitos"]);
  assert.deepEqual(C.palabrasClave("notebook Lenovo casi nueva"), ["compu", "lenovo"]);
  assert.deepEqual(C.detectarSuelta("Hola gente, vendo bici rodado 26 $ 4.000"), { tipo: "vendo", texto: "bici rodado 26 $ 4.000" });
  assert.deepEqual(C.detectarSuelta("Se venden sillas de jardín"), { tipo: "vendo", texto: "sillas de jardín" });
  assert.deepEqual(C.detectarSuelta("¿Alguien vende una heladera chica?"), { tipo: "compro", texto: "una heladera chica", soloSugerir: true });
  assert.deepEqual(C.detectarSuelta("Buenas! busco notebook para estudiar"), { tipo: "compro", texto: "notebook para estudiar", soloSugerir: true });
  for (const t of ["vendo", "che, alguien sabe algo?", "qué día es hoy?", "me encanta como vende el chino"]) assert.equal(C.detectarSuelta(t), null, t);
});

test("#busco: recuerda quién vende algo parecido, en la misma confirmación y arrobando a los dos", async () => {
  await escribir(G, "111@lid", "#vendo bicicleta rodado 26 $ 4.000");
  await escribir(G, "333@lid", "#vendo heladera bajo mesada $ 6.500");
  const antes = globalThis.enviados.length;
  await escribir(G, "222@lid", "#busco bici para mi hijo");
  assert.equal(globalThis.enviados.length - antes, 1, "va en la misma confirmación, no en otro mensaje");
  assert.match(ultimoEnviado().msg.text, /^🔎 \*Compro #3\* registrada\.[\s\S]*\n\n💡 @222, recuerdo que @111 está vendiendo «bicicleta rodado 26 \$ 4\.000» \(#1\)\.\nPara hablarle, respondé a su publicación\.$/);
  assert.deepEqual(ultimoEnviado().msg.mentions, ["222@lid", "111@lid"]);

  // never your own, and never one that's no longer for sale
  await escribir(G, "111@lid", "#busco bici más chica");
  assert.doesNotMatch(ultimoEnviado().msg.text, /💡/);
  assert.ok(C.cambiarEstado(G, 1, "111@lid", false, "vendido").ok);
  await escribir(G, "444@lid", "#busco bicicleta");
  assert.doesNotMatch(ultimoEnviado().msg.text, /💡/);
});

test("#busco: «mesa chica» no se confunde con «heladera chica»", () => {
  const r = C.publicar(G, "555@lid", "compro", "mesa chica");
  assert.equal(r.sugerencias, null);
});

test("#vendo: le cuenta a quien buscaba algo así, sin repetirle el aviso de .avisame", async () => {
  F.agregarAlerta(G, "666@lid", "heladera");
  await escribir(G, "666@lid", "#busco heladera chica");
  const antes = globalThis.enviados.length;
  await escribir(G, "777@lid", "#vendo heladera grande $ 5.000");
  const nuevos = globalThis.enviados.slice(antes);
  assert.equal(nuevos.length, 1, "666 ya está en la confirmación: el 🔔 de .avisame sobraba");
  assert.match(nuevos[0].msg.text, /^🏷️ \*Vendo #\d+\* registrada\.[\s\S]*\n\n💡 Esto puede ser lo que buscaba @666: «heladera chica» \(#\d+\)\.$/);
  assert.deepEqual(nuevos[0].msg.mentions, ["666@lid"]);
});

test("#vendo: nombra hasta dos interesados, y al resto se lo recuerda cuando vuelve a buscar", () => {
  const H = "heladeras@g.us";
  const compradores = ["111@lid", "222@lid", "333@lid"];
  for (const u of [...compradores, "444@lid"]) F.initDataDB({ chat: H, sender: u, senderJid: "", pushName: u });
  for (const u of compradores) C.publicar(H, u, "compro", "heladera");
  const r = C.publicar(H, "444@lid", "vendo", "heladera con freezer");
  assert.equal(r.sugerencias.mentions.length, 2);
  const nombrado = r.sugerencias.mentions[0];
  const sinNombrar = compradores.find((u) => !r.sugerencias.mentions.includes(u));
  assert.equal(C.respuestaAPedido(H, nombrado, "heladera"), null, "ya se lo dijo al publicarla");
  assert.match(C.respuestaAPedido(H, sinNombrar, "heladera").texto, /, recuerdo que @444 está vendiendo «heladera con freezer» \(#4\)\./);
});

test("modo compraventa: lo que se escribe suelto se lee", async () => {
  await escribir(V, "111@lid", "Hola gente, vendo silla gamer $ 3.000");
  assert.match(ultimoEnviado().msg.text, /^🏷️ \*Vendo #1\* registrada\. Precio: \$ 3\.000\./);
  assert.equal(F.getPublicacion(V, 1).texto, "silla gamer $ 3.000");

  await escribir(V, "222@lid", "¿Alguien vende una silla?");
  assert.equal(
    ultimoEnviado().msg.text,
    "💡 @222, recuerdo que @111 está vendiendo «silla gamer $ 3.000» (#1).\nPara hablarle, respondé a su publicación.\nPara que quede anotado lo que buscás: #busco y qué es.",
  );
  assert.equal(F.getPublicacion(V, 2), null, "una pregunta no queda anotada como búsqueda");

  const antes = globalThis.enviados.length;
  await escribir(V, "222@lid", "busco una silla");
  await escribir(V, "222@lid", "busco un unicornio");
  await escribir(V, "222@lid", "che, alguien sabe algo?");
  assert.equal(globalThis.enviados.length, antes, "lo ya sugerido no se repite, y si no hay nada parecido no dice nada");
});

// The hook runs before handle-message's doors (banchat, admin mode, banned person), so it has to close them itself.
test("con .banchat, .modoadmin o una persona baneada, ni publica ni sugiere", async () => {
  const fila = F.getChat(V);
  const pasar = (sender, text, { chat = {}, user = {}, isMod = false } = {}) =>
    Hook.before(msg(V, sender, text), { client: globalThis.client, chat: { ...fila, ...chat }, user, isOwner: false, isMod });
  const antes = globalThis.enviados.length;
  await pasar("444@lid", "¿alguien vende una silla?", { chat: { isBanned: 1 } });
  await pasar("555@lid", "#vendo silla de playa", { chat: { adminMode: 1 } });
  await pasar("666@lid", "vendo silla de playa", { user: { banned: 1 } });
  assert.equal(globalThis.enviados.length, antes);
  await pasar("777@lid", "#vendo lámpara de pie", { chat: { adminMode: 1 }, isMod: true });
  assert.match(ultimoEnviado().msg.text, /^🏷️ \*Vendo #\d+\* registrada\./, "en modo admin, un moderador sí");
});

test("en un grupo de amigos, lo suelto no se lee", async () => {
  const antes = globalThis.enviados.length;
  await escribir(G, "333@lid", "vendo a mi hermano, barato");
  await escribir(G, "444@lid", "¿alguien vende una heladera?");
  assert.equal(globalThis.enviados.length, antes);
});

test("modo compraventa: las respuestas a pedidos sueltos tienen tope por hora", async () => {
  const V2 = "otras-ventas@g.us"; // its own hourly count: V already answered one this hour
  for (const n of [333, 444, 555]) F.initDataDB({ chat: V2, sender: `${n}@lid`, senderJid: "", pushName: `Persona ${n}` });
  F.updateChat(V2, { games: 0, charla: 0, saludos: 0, monedas: 0, ascensos: 0, recapSemanal: 0 });
  const tope = C.COMPRAVENTA.SUGERENCIAS_POR_HORA;
  C.COMPRAVENTA.SUGERENCIAS_POR_HORA = 1;
  try {
    await escribir(V2, "333@lid", "#vendo mesa de jardín");
    const antes = globalThis.enviados.length;
    await escribir(V2, "444@lid", "¿alguien vende una mesa?");
    await escribir(V2, "555@lid", "¿alguien tiene una mesa?");
    assert.equal(globalThis.enviados.length, antes + 1, "cada respuesta es un mensaje: el segundo pedido de la hora queda sin respuesta");
    assert.match(ultimoEnviado().msg.text, /^💡 @444, recuerdo que @333 está vendiendo «mesa de jardín» \(#1\)\./);
  } finally {
    C.COMPRAVENTA.SUGERENCIAS_POR_HORA = tope;
  }
});

// Turning one thing back on after .modo compraventa (the greetings, say) stopped the loose sales without a word, while
// .menuventas still said buy-and-sell mode: they asked different things. Now both ask for the games and the economy off.
test("modo compraventa: prender los saludos no apaga las ventas sueltas, y .menuventas dice lo mismo que el hook", async () => {
  const M = "modo-mixto@g.us";
  for (const n of [111, 222]) F.initDataDB({ chat: M, sender: `${n}@lid`, senderJid: "", pushName: `Persona ${n}` });
  const Modo = await import("../lib/modo.js");
  const Menu = (await import("../plugins/menu-ventas.js")).default;
  const menu = async () => {
    await Menu.run({ chat: M }, { client: globalThis.client, chat: F.getChat(M) });
    return ultimoEnviado().msg.text;
  };
  Modo.aplicarModo(M, "compraventa");
  F.updateChat(M, { saludos: 1 });
  await escribir(M, "111@lid", "Vendo bici rodado 26 $ 4.000");
  assert.equal(F.publicacionesActivas(M).length, 1, "lo suelto se sigue leyendo");
  assert.match(await menu(), /Este grupo está en modo compraventa\./);
  assert.match(Modo.textoModo(M), /🏷️ Leo las ventas sueltas/);

  F.updateChat(M, { games: 1 });
  await escribir(M, "222@lid", "Vendo silla $ 500");
  assert.equal(F.publicacionesActivas(M).length, 1, "con los juegos prendidos, ya no");
  assert.match(await menu(), /Este grupo NO está en modo compraventa/);
  assert.match(Modo.textoModo(M), /no las leo/);
});

// "me", "lo" or "ya" counted as what was being asked for: any post that had them matched.
test("modo compraventa: una frase cualquiera no saca sugerencias por palabras sueltas", async () => {
  const S = "frases@g.us";
  for (const n of [111, 222, 333]) F.initDataDB({ chat: S, sender: `${n}@lid`, senderJid: "", pushName: `Persona ${n}` });
  F.updateChat(S, { games: 0, charla: 0, saludos: 0, monedas: 0, ascensos: 0, recapSemanal: 0 });
  C.publicar(S, "111@lid", "vendo", "sillón 3 cuerpos, me mudo, $ 5.000");
  C.publicar(S, "111@lid", "vendo", "celular, ya no lo uso, $ 3.000");
  const antes = globalThis.enviados.length;
  for (const frase of ["Necesito que me lo reserves hasta el viernes", "Compro, me interesa!", "Tienen ya el horario de mañana?", "busco que me expliquen cómo publicar"]) {
    await escribir(S, "222@lid", frase);
  }
  assert.equal(globalThis.enviados.length, antes);
  await escribir(S, "333@lid", "¿alguien vende un sillón?");
  assert.match(ultimoEnviado().msg.text, /@111 está vendiendo «sillón 3 cuerpos/, "lo que sí se busca, se encuentra");
});

// The "not again for a day" went by post number: publishing and taking down "#vendo bici" over and over mentioned
// whoever was looking for one every single time.
test("#vendo: el mismo vendedor no vuelve a arrobar a quien busca, aunque publique de nuevo", () => {
  const A = "acoso@g.us";
  for (const n of [111, 222, 333]) F.initDataDB({ chat: A, sender: `${n}@lid`, senderJid: "", pushName: `Persona ${n}` });
  C.publicar(A, "222@lid", "compro", "bici");
  let veces = 0;
  for (let i = 0; i < 5; i++) {
    const r = C.publicar(A, "111@lid", "vendo", `bici ${i}`);
    if (r.sugerencias?.mentions.includes("222@lid")) veces++;
    assert.ok(C.cambiarEstado(A, r.numero, "111@lid", false, "baja").ok);
  }
  assert.equal(veces, 1);
  assert.deepEqual(C.publicar(A, "333@lid", "vendo", "bici playera").sugerencias?.mentions, ["222@lid"], "otro vendedor sí se lo cuenta");
});
