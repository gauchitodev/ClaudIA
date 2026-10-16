import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { prepararBase, G } from "./helpers.mjs";

// Reactions (lib/reacciones.js): "received" and UruCoins for whoever wrote the message, "given" and UruCoins for whoever
// reacted. A reaction to one of Claudia's messages paid her too, with no daily cap: she could top .baltop and be the
// month's most voted. Now only whoever reacted collects, and for the initiative it's still an answer to her.

let F, R, COINS, mesDe;
const BOT = "bot@lid"; // clienteFalso's
const BOT_JID = "bot@s.whatsapp.net";
let k = 0;
const reaccion = (autor, reactor, { fromMe = false, id = `M${++k}`, chat = G } = {}) => ({
  key: { remoteJid: chat, id, participant: autor, fromMe },
  reaction: { text: "😂", key: { participant: reactor, fromMe: reactor === BOT } },
});
const contar = (r) => R.contarReaccion(globalThis.client, r);

before(async () => {
  ({ F } = await prepararBase("reacciones"));
  R = await import("../lib/reacciones.js");
  ({ COINS } = await import("../lib/urucoins.js"));
  ({ mesDe } = await import("../lib/hashtags.js"));
});

test("entre personas: recibidas y UruCoins para quien escribió, dadas y UruCoins para quien reaccionó", () => {
  contar(reaccion("111@lid", "222@lid"));
  assert.deepEqual([F.getSaldoCoins(G, "111@lid"), F.getSaldoCoins(G, "222@lid")], [COINS.REACCION_RECIBIDA, COINS.REACCION_EMITIDA]);
  const { masVotado, masActivo } = F.obtenerRankingMensual(G, mesDe());
  assert.deepEqual([masVotado, masActivo], [[{ usuario: "111@lid", recibidas: 1 }], [{ usuario: "222@lid", emitidas: 1 }]]);
});

test("a un mensaje de Claudia: para la iniciativa es una respuesta, quien reaccionó cobra y ella no", () => {
  F.registrarIntervencion({ chat: G, tipo: "comentario", mensajeId: "CL1", texto: "qué calor" });
  contar(reaccion(BOT, "333@lid", { fromMe: true, id: "CL1" }));
  contar(reaccion(BOT_JID, "333@lid", { fromMe: true })); // a group that lists her by number
  assert.equal(F.getSaldoCoins(G, BOT) + F.getSaldoCoins(G, BOT_JID), 0, "Claudia no cobra");
  assert.equal(F.getSaldoCoins(G, "333@lid"), 2 * COINS.REACCION_EMITIDA, "quien reaccionó, sí");
  const { masVotado, masActivo } = F.obtenerRankingMensual(G, mesDe());
  assert.equal(masVotado.length, 1, "ella no suma recibidas");
  assert.deepEqual(masActivo.find((r) => r.usuario === "333@lid"), { usuario: "333@lid", emitidas: 2 });
  assert.equal(F.intervencionesDesde(G, 0).find((i) => i.mensajeId === "CL1").reaccionada, 1);
});

test("la misma reacción cuenta una vez; las de Claudia, las propias y las de un privado, ninguna", () => {
  const antes = F.getSaldoCoins(G, "111@lid");
  const r = reaccion("111@lid", "444@lid");
  contar(r);
  contar(r); // removed and put back
  contar(reaccion("111@lid", BOT)); // her 🔥 for a streak
  contar(reaccion("111@lid", "111@lid"));
  contar(reaccion("111@lid", "444@lid", { chat: "59899111222@s.whatsapp.net" }));
  assert.equal(F.getSaldoCoins(G, "111@lid") - antes, COINS.REACCION_RECIBIDA);
});

test("lo que Claudia juntó antes no la pone en .baltop, en el ranking ni en los totales", () => {
  const C = "viejo@g.us";
  const mes = mesDe();
  F.moverCoins(C, BOT, 500, "reaccion_recibida");
  F.moverCoins(C, BOT_JID, 300, "reaccion_recibida");
  F.moverCoins(C, "111@lid", 100, "test_carga");
  for (let i = 0; i < 9; i++) F.sumarInteraccion(mes, C, BOT, "recibidas");
  F.sumarInteraccion(mes, C, "111@lid", "recibidas");
  assert.deepEqual(F.topCoins(C, 5), [{ usuario: "111@lid", saldo: 100 }]);
  assert.equal(F.puestoCoins(C, "111@lid"), 1);
  assert.deepEqual(F.totalEnCirculacion(C), { total: 100, personas: 1 });
  assert.deepEqual(F.obtenerRankingMensual(C, mes).masVotado, [{ usuario: "111@lid", recibidas: 1 }]);
  assert.equal(F.puestoRankingMensual(mes, C, "111@lid").puesto, 1);
});

test("main.js cuenta las reacciones con lib/reacciones.js", () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  assert.match(main, /"messages\.reaction"[\s\S]{0,200}contarReaccion\(client, r\)/);
});
