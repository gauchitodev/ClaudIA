import { before, test } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, fijarSaldo, clienteFalso, ultimoEnviado } from "./helpers.mjs";

let F, M, Plugin, Admin;
before(async () => {
  ({ F } = await prepararBase("interfaz-apuestas"));
  M = await import("../lib/mercados.js");
  Plugin = (await import("../plugins/coins-mercado.js")).default;
  Admin = (await import("../plugins/coins-mercado-admin.js")).default;
});

const ANA = "ana@lid";
let grupos = 0;
function grupo() {
  const chat = `interfaz-apuestas-${++grupos}@g.us`;
  F.initDataDB({ chat, sender: ANA, senderJid: "", pushName: "Ana" });
  fijarSaldo(F, chat, ANA, 500);
  return chat;
}
const abrir = (chat, titulo = "Nacional vs Peñarol", opciones = ["Nacional", "Empate", "Peñarol"], enlace = {}) =>
  F.getMercado(M.abrirMercado(chat, "admin@lid", titulo, opciones, Date.now() + 3600_000, enlace));
const correr = async (chat, client, command, args = [], quoted = null) => {
  await Plugin.run({ chat, sender: ANA, quoted }, { client, command, args, chat: F.getChat(chat) });
  return ultimoEnviado().msg.text;
};

test("una tarjeta permite apostar con equipo y cantidad; el texto citado no cambia el destino", async () => {
  const chat = grupo();
  const m = abrir(chat, "Nacional vs Peñarol (a los 90')", undefined, { tipo: "90" });
  const otro = abrir(chat, "¿Quién pasa? Nacional vs Peñarol", ["Nacional", "Peñarol"], { tipo: "pasa" });
  const client = clienteFalso();
  const tarjeta = await M.enviarTarjetaMercado(client, m);
  assert.match(ultimoEnviado().msg.text, /Resultado a los 90 minutos/);
  assert.match(ultimoEnviado().msg.text, /Respondé a este mensaje con \*\.apostar Nacional 20\*/);
  const texto = await correr(chat, client, "apostar", ["Nacional", "20"], { chat, id: tarjeta.key.id, text: `Mercado #${otro.id}: ¿Quién pasa?` });
  assert.match(texto, /^✅ Apostaste \*20 UruCoins\* a \*Nacional\*/);
  assert.match(texto, /Resultado a los 90 minutos/);
  assert.match(texto, /Te quedan 480 UruCoins/);
  assert.equal(F.apuestaEnMercado(m.id, ANA).cantidad, 20);
  assert.equal(F.apuestaEnMercado(otro.id, ANA), null);
});

test(".apuestas orienta con varias, y .apuestas N trae una tarjeta a la que se puede responder", async () => {
  const chat = grupo();
  const m = abrir(chat, "Nacional vs Peñarol (a los 90')", undefined, { tipo: "90" });
  const pasa = abrir(chat, "¿Quién pasa? Nacional vs Peñarol", ["Nacional", "Peñarol"], { tipo: "pasa" });
  const client = clienteFalso();
  const lista = await correr(chat, client, "apuestas");
  assert.match(lista, /Resultado a los 90 minutos/);
  assert.match(lista, /Quién clasifica/);
  assert.ok(lista.includes(`.apuestas ${m.id}`) && lista.includes(`.apuestas ${pasa.id}`));
  assert.equal(globalThis.enviados.length, 1, "la lista no inunda el grupo con tarjetas");
  const ayuda = await correr(chat, client, "apostar", ["Nacional", "20"], { chat, id: "MSG1" });
  assert.match(ayuda, /respondé a la tarjeta/);
  assert.equal(F.getSaldoCoins(chat, ANA), 500, "responder la lista no elige entre las dos apuestas");
  await correr(chat, client, "apuestas", [String(pasa.id)]);
  const id = `MSG${globalThis.enviados.length}`;
  await correr(chat, client, "apostar", ["Nacional", "20"], { chat, id });
  assert.equal(F.apuestaEnMercado(pasa.id, ANA).cantidad, 20);
  assert.equal(F.apuestaEnMercado(m.id, ANA), null);
});

test(".apuestas con una sola apuesta trae directamente su tarjeta, y los alias siguen funcionando", async () => {
  const chat = grupo();
  const m = abrir(chat);
  const client = clienteFalso();
  for (const [command, args] of [["apuestas", []], ["mercados", []], ["mercado", [String(m.id)]]]) {
    const texto = await correr(chat, client, command, args);
    assert.ok(texto.includes(`Apuesta #${m.id}`));
    assert.equal(F.mercadoDelMensaje(chat, `MSG${globalThis.enviados.length}`).id, m.id);
  }
  assert.match(await correr(chat, client, "apostar", [String(m.id), "1", "20"]), /a \*Nacional\*/);
  assert.match(await correr(chat, client, "jugar", [String(m.id), "Nacional", "10"]), /llevás 30/);
  assert.equal(F.apuestaEnMercado(m.id, ANA).cantidad, 30);
});

test("los nombres con espacios y números se leen como opciones al responder, y 1.000 es mil", async () => {
  const chat = grupo();
  fijarSaldo(F, chat, ANA, 10_000);
  const m = abrir(chat, "Goles", ["0 goles", "1 gol", "2 goles o más"]);
  const client = clienteFalso();
  const tarjeta = await M.enviarTarjetaMercado(client, m);
  await correr(chat, client, "apostar", ["2", "goles", "o", "más", "1.000"], { chat, id: tarjeta.key.id });
  assert.deepEqual([F.apuestaEnMercado(m.id, ANA).opcion, F.apuestaEnMercado(m.id, ANA).cantidad, F.getSaldoCoins(chat, ANA)], [2, 1000, 9000]);
});

test("una cita desconocida o de otro grupo y un id mal escrito no cobran nada", async () => {
  const chat = grupo();
  const otroChat = grupo();
  const m = abrir(chat);
  const client = clienteFalso();
  const tarjeta = await M.enviarTarjetaMercado(client, m);
  for (const [donde, args, quoted] of [
    [chat, ["Nacional", "20"], { chat, id: "inventado", text: `Apuesta #${m.id}` }],
    [otroChat, ["Nacional", "20"], { chat, id: tarjeta.key.id }],
    [otroChat, ["Nacional", "20"], { chat: otroChat, id: tarjeta.key.id }],
    [chat, [`${m.id}abc`, "Nacional", "20"], null],
    [otroChat, [String(m.id), "Nacional", "20"], null],
  ]) {
    await correr(donde, client, "apostar", args, quoted);
    assert.equal(F.getSaldoCoins(donde, ANA), 500);
    assert.equal(F.apuestaEnMercado(m.id, ANA), null);
  }
});

test("una opción numérica inválida en una respuesta nunca apuesta a otro mercado", async () => {
  const chat = grupo();
  const otro = abrir(chat, "Otro evento", ["Goles", "Sin goles"]);
  const m = abrir(chat, "Goles del clásico", ["0 goles", "1 gol"]);
  const client = clienteFalso();
  const tarjeta = await M.enviarTarjetaMercado(client, m);
  await correr(chat, client, "apostar", [String(otro.id), "Goles", "20"], { chat, id: tarjeta.key.id });
  assert.equal(F.getSaldoCoins(chat, ANA), 500);
  assert.equal(F.apuestaEnMercado(otro.id, ANA), null);
  assert.equal(F.apuestaEnMercado(m.id, ANA), null);
  assert.match(ultimoEnviado().msg.text, /¿A qué le jugás\?/);
});

test("la respuesta respeta cierre, mínimos, topes y el bando elegido", async () => {
  const chat = grupo();
  const m = abrir(chat);
  const client = clienteFalso();
  const tarjeta = await M.enviarTarjetaMercado(client, m);
  const quoted = { chat, id: tarjeta.key.id };
  assert.match(await correr(chat, client, "apostar", ["Nacional", "4"], quoted), /mínima es 5/);
  assert.match(await correr(chat, client, "apostar", ["Nacional", "101"], quoted), /Máximo 100/);
  assert.equal(F.getSaldoCoins(chat, ANA), 500);
  await correr(chat, client, "apostar", ["Nacional", "20"], quoted);
  assert.match(await correr(chat, client, "apostar", ["Peñarol", "20"], quoted), /No se puede cambiar de bando/);
  F.actualizarMercado(m.id, { cierra_en: Date.now() - 1 });
  assert.match(await correr(chat, client, "apostar", ["Nacional", "20"], quoted), /ya cerraron/);
  assert.equal(F.getSaldoCoins(chat, ANA), 480);
  await correr(chat, client, "apuestas", [String(m.id)]);
  assert.match(ultimoEnviado().msg.text, /Cerrado, esperando resultado/);
  assert.doesNotMatch(ultimoEnviado().msg.text, /Respondé a este mensaje/);
});

test("la apertura de un admin envía una tarjeta que acepta respuestas", async () => {
  const chat = grupo();
  const client = clienteFalso();
  await Admin.run({ chat, sender: "admin@lid" }, { client, command: "evento", args: [], text: "Clásico | Nacional | Peñarol | en 1h" });
  assert.match(ultimoEnviado().msg.text, /Respondé a este mensaje/);
  const m = F.mercadoDelMensaje(chat, "MSG1");
  await correr(chat, client, "apostar", ["Peñarol", "20"], { chat, id: "MSG1" });
  assert.equal(F.apuestaEnMercado(m.id, ANA).opcion, 1);
});

test("las tarjetas siguen aceptando respuestas al reabrir la base", async () => {
  const chat = grupo();
  const m = abrir(chat);
  const client = clienteFalso();
  const tarjeta = await M.enviarTarjetaMercado(client, m);
  const anterior = F.db;
  globalThis.db = F.loadDatabase();
  anterior.close();
  await correr(chat, client, "apostar", ["Nacional", "20"], { chat, id: tarjeta.key.id });
  assert.equal(F.apuestaEnMercado(m.id, ANA).cantidad, 20);
  assert.equal(F.getSaldoCoins(chat, ANA), 480);
});
