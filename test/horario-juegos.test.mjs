import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

let F, H;
before(async () => {
  ({ F } = await prepararBase("horario-juegos"));
  H = await import("../lib/horario-juegos.js");
});
// hora local fija (los chequeos usan getHours/getMinutes, como el resto del bot)
const en = (hora, minutos = 0) => new Date(2026, 8, 5, hora, minutos, 0);

test("horario de juegos: parseo de franjas", () => {
  assert.deepEqual(H.parsearHorario("20:00-23:00"), { desde: "20:00", hasta: "23:00" });
  assert.deepEqual(H.parsearHorario("20-23"), { desde: "20:00", hasta: "23:00" });
  assert.deepEqual(H.parsearHorario("de 20 a 23"), { desde: "20:00", hasta: "23:00" });
  assert.deepEqual(H.parsearHorario("20:30 a 01:00"), { desde: "20:30", hasta: "01:00" });
  assert.deepEqual(H.parsearHorario("9:15 22:45"), { desde: "09:15", hasta: "22:45" });
  assert.deepEqual(H.parsearHorario("20hs a 23hs"), { desde: "20:00", hasta: "23:00" });
  for (const malo of ["", "20", "25-26", "20:60-23:00", "20-20", "a la noche", "20:00-"]) assert.equal(H.parsearHorario(malo), null, `"${malo}" tendría que ser inválido`);
});

test("horario de juegos: abiertos y cerrados según la hora, incluso cruzando medianoche", () => {
  const tarde = { horarioJuegos: "20:00-23:00" };
  assert.equal(H.juegosAbiertos({ horarioJuegos: "" }, en(3)), true, "sin horario, siempre abiertos");
  assert.equal(H.juegosAbiertos({}, en(3)), true);
  assert.equal(H.juegosAbiertos(tarde, en(19, 59)), false);
  assert.equal(H.juegosAbiertos(tarde, en(20, 0)), true);
  assert.equal(H.juegosAbiertos(tarde, en(22, 59)), true);
  assert.equal(H.juegosAbiertos(tarde, en(23, 0)), false);
  const noche = { horarioJuegos: "22:00-01:00" };
  assert.equal(H.juegosAbiertos(noche, en(23, 30)), true);
  assert.equal(H.juegosAbiertos(noche, en(0, 30)), true);
  assert.equal(H.juegosAbiertos(noche, en(1, 0)), false);
  assert.equal(H.juegosAbiertos(noche, en(12)), false);
  assert.equal(H.msHastaApertura(tarde, en(21)), 0);
  assert.match(H.mensajeJuegosCerrados(tarde, en(17, 45)), /van de 20:00 a 23:00\. Abren en 2 h 15 min\./);
  assert.match(H.mensajeJuegosCerrados(tarde, en(23, 30)), /Abren en 20 h 30 min/);
  assert.match(H.mensajeJuegosCerrados(noche, en(12)), /Abren en 10 h 0 min/);
});

test("horario de juegos: se guarda por grupo y el aviso se limita", () => {
  const OTRO = "otro@g.us";
  const msg = { sender: "a@lid", senderJid: "a@s.whatsapp.net" };
  F.initDataDB({ ...msg, chat: G });
  F.initDataDB({ ...msg, chat: OTRO });
  const r = H.fijarHorario(G, "de 20 a 23");
  assert.ok(r.ok && /va de 20:00 a 23:00/.test(r.mensaje));
  assert.equal(F.getChat(G).horarioJuegos, "20:00-23:00");
  assert.equal(F.getChat(OTRO).horarioJuegos, "", "el horario es por grupo");
  assert.equal(H.juegosAbiertos(F.getChat(G), en(21)), true);
  assert.equal(H.juegosAbiertos(F.getChat(OTRO), en(3)), true);
  assert.match(H.fijarHorario(G, "cualquier cosa").error, /No entendí/);
  assert.equal(F.getChat(G).horarioJuegos, "20:00-23:00", "un pedido inválido no toca el horario guardado");
  assert.ok(H.quitarHorario(G).ok);
  assert.equal(F.getChat(G).horarioJuegos, "");
  const t0 = 1_800_000_000_000; // una fecha real: el "último aviso" arranca en 0 y se compara con la ventana de 10 min
  assert.equal(H.correspondeAvisar(G, t0), true);
  assert.equal(H.correspondeAvisar(G, t0 + 1000), false, "dentro de los 10 min solo se reacciona");
  assert.equal(H.correspondeAvisar(OTRO, t0 + 1000), true, "el límite es por grupo");
  assert.equal(H.correspondeAvisar(G, t0 + H.HORARIO_JUEGOS.AVISO_CADA_MS), true);
});

test("horario de juegos: el comando de admin fija, muestra y saca el horario", async () => {
  const P = (await import("../plugins/grupo-horario-juegos.js")).default;
  assert.ok(P.onlyGroup && P.onlyAdmin && P.cmd.includes("horariojuegos"));
  F.initDataDB({ chat: G, sender: "a@lid", senderJid: "a@s.whatsapp.net" });
  const m = { chat: G, sender: "a@lid", isGroup: true };
  const correr = (text) => P.run(m, { client: globalThis.client, text, chat: F.getChat(G) });
  await correr("");
  assert.match(ultimoEnviado().msg.text, /no tiene horario de juegos/);
  await correr("20:00-23:00");
  assert.match(ultimoEnviado().msg.text, /va de 20:00 a 23:00/);
  assert.equal(F.getChat(G).horarioJuegos, "20:00-23:00");
  await correr("");
  assert.match(ultimoEnviado().msg.text, /van de 20:00 a 23:00; ahora están (abiertos|cerrados)/);
  await correr("a la noche");
  assert.match(ultimoEnviado().msg.text, /No entendí el horario/);
  assert.equal(F.getChat(G).horarioJuegos, "20:00-23:00");
  F.updateChat(G, { games: false });
  await correr("22-01");
  assert.match(ultimoEnviado().msg.text, /va de 22:00 a 01:00[\s\S]*apagados con \.juegos/);
  F.updateChat(G, { games: true });
  await correr("off");
  assert.match(ultimoEnviado().msg.text, /saqué el horario/);
  assert.equal(F.getChat(G).horarioJuegos, "");
});
