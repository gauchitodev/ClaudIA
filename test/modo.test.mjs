import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado, fijarSaldo } from "./helpers.mjs";

let F, M, U, A, R, Pf, Modo, Config;
before(async () => {
  ({ F } = await prepararBase("modo"));
  M = await import("../lib/modo.js");
  U = await import("../lib/urucoins.js");
  A = await import("../lib/actividad.js");
  R = await import("../lib/rangos.js");
  Pf = await import("../lib/perfil.js");
  Modo = (await import("../plugins/grupo-modo.js")).default;
  Config = (await import("../plugins/config-on-off.js")).default;
});
const persona = (n) => ({ chat: G, sender: `${n}@lid`, senderJid: `${n}@s.whatsapp.net` });
const msg = { chat: G, sender: "111@lid", isGroup: true };
const ultimo = () => ultimoEnviado().msg.text;

test("modo: interruptores nuevos prendidos por defecto, .modo compraventa y .modo amigos", async () => {
  F.initDataDB(persona(111));
  let c = F.getChat(G);
  assert.deepEqual([c.charla, c.saludos, c.monedas, c.ascensos], [1, 1, 1, 1]);
  assert.equal(M.modoActual(c), "amigos");
  await Modo.run(msg, { client: globalThis.client, text: "" });
  assert.match(ultimo(), /Modo actual: \*amigos\*\n✅ juegos · ✅ charla de Claudia/);
  await Modo.run(msg, { client: globalThis.client, text: "compraventa" });
  assert.match(ultimo(), /quedó en modo \*compraventa\*: sin juegos ni casino/);
  c = F.getChat(G);
  assert.deepEqual([c.games, c.charla, c.saludos, c.monedas, c.ascensos, c.recapSemanal, c.preguntaDia, c.triviaRelampago], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(M.modoActual(c), "compraventa");
  await Modo.run(msg, { client: globalThis.client, text: "cualquiera" });
  assert.match(ultimo(), /Modos disponibles/);
  // un interruptor suelto desde .config lo deja "mixto"
  await Config.run(msg, { client: globalThis.client, command: "charla", isOwner: false, isAdmin: true, chat: F.getChat(G), botSettings: {} });
  assert.match(ultimo(), /Opción: `charla`\n• Estado: Activado/);
  assert.equal(F.getChat(G).charla, 1);
  assert.equal(M.modoActual(F.getChat(G)), "mixto");
  await Modo.run(msg, { client: globalThis.client, text: "amigos" });
  c = F.getChat(G);
  assert.deepEqual([c.games, c.charla, c.saludos, c.monedas, c.ascensos, c.recapSemanal], [1, 1, 1, 1, 1, 1]);
});

test("modo: con la economía apagada nada reparte coins, pero lo social sigue", () => {
  F.updateChat(G, { monedas: 0, ascensos: 0 });
  assert.equal(U.monedasActivas(G), false);
  assert.equal(U.monedasActivas("sinfila@g.us"), true, "sin fila se toma como prendida");
  U.otorgarPorReaccion(G, "111@lid", "222@lid", "MSG1");
  assert.equal(F.getSaldoCoins(G, "111@lid") + F.getSaldoCoins(G, "222@lid"), 0, "las reacciones no dan coins");
  let r = null;
  for (let i = 0; i < 3; i++) r = A.registrarActividad(G, "333@lid", "hola qué tal");
  assert.deepEqual(r, { dias: 1, premio: 0 }, "la racha se cuenta pero no paga");
  assert.equal(F.getSaldoCoins(G, "333@lid"), 0);
  U.juegoIniciado(G, "trivia");
  assert.equal(U.juegoTerminado(G, "111@lid"), "", "ganar un juego no paga ni agrega texto");
  assert.equal(F.getSaldoCoins(G, "111@lid"), 0);
  F.initDataDB(persona(444));
  F.updateUser("444@lid", { inGroup: JSON.stringify({ [G]: { messageCount: 100, desde: Date.now() - 8 * 24 * 3600e3, rango: "nuevo" } }) });
  const aviso = R.chequearAscenso(G, "444@lid", F.getUser("444@lid"), Date.now(), { pagar: false });
  assert.equal(aviso.texto, "🧉 @444 subió a *Habitué* (7 días en el grupo y 100 mensajes).", "el ascenso sale sin premio");
  assert.equal(F.getSaldoCoins(G, "444@lid"), 0);
  assert.equal(F.getUser("444@lid").inGroup[G].rango, "habitue");
  // prendida de nuevo, el mismo juego paga
  F.updateChat(G, { monedas: 1 });
  U.juegoIniciado(G, "trivia");
  assert.match(U.juegoTerminado(G, "111@lid"), /\+10 UruCoins por ganar/);
  assert.equal(F.getSaldoCoins(G, "111@lid"), 10);
});

test("modo: el perfil esconde la economía cuando está apagada", () => {
  fijarSaldo(F, G, "111@lid", 50);
  assert.match(Pf.textoPerfil(G, "111@lid", F.getUser("111@lid")).texto, /🪙 50 UruCoins · puesto 1 del grupo · apuesta máxima 100\n💼 Sin laburo/);
  F.updateChat(G, { monedas: 0 });
  const t = Pf.textoPerfil(G, "111@lid", F.getUser("111@lid")).texto;
  assert.doesNotMatch(t, /UruCoins|laburo|racha/i);
  assert.match(t, /🌱 Nuevo/);
});
