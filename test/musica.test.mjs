import { test } from "node:test";
import assert from "node:assert/strict";
import { G, prepararBase } from "./helpers.mjs";

const { F } = await prepararBase("musica");
const { pagarMusica } = await import("../plugins/dl-youtube.js");
const { COINS } = await import("../lib/urucoins.js");
const YO = "yo@lid";

test("música: paga por tema en el grupo hasta el tope del día", () => {
  for (let i = 1; i <= COINS.MUSICA_POR_DIA; i++) {
    assert.match(pagarMusica(G, YO), new RegExp(`\\+${COINS.MUSICA} UruCoins`));
    assert.equal(F.getSaldoCoins(G, YO), COINS.MUSICA * i);
  }
  assert.equal(pagarMusica(G, YO), "");
  assert.equal(F.getSaldoCoins(G, YO), COINS.MUSICA * COINS.MUSICA_POR_DIA);
});

test("música: no paga en privado", () => {
  assert.equal(pagarMusica("59899111222@s.whatsapp.net", "otro@lid"), "");
  assert.equal(F.getSaldoCoins("59899111222@s.whatsapp.net", "otro@lid"), 0);
});
