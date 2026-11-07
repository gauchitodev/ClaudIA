import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import strings from "../lib/strings.js";

// The flags game (plugins/fun-banderas.js): every flag with its country's capital, told when the round ends, guessed
// or not. People learn the flags playing, and the capital comes with them.
let P, BANDERAS;
before(async () => {
  await prepararBase("banderas");
  ({ default: P, BANDERAS } = await import("../plugins/fun-banderas.js"));
});

// A client that keeps what goes out; the question comes back with an id, as the real one's does.
function cliente() {
  const salidas = [];
  return { salidas, sendText: async (chat, texto) => (salidas.push(texto), { key: { id: `B${salidas.length}` } }) };
}
// The round shows that country's flag: elegirAlAzar (lib/azar.js) goes by Math.random.
function tocara(t, pais) {
  const i = BANDERAS.findIndex((b) => b.pais === pais);
  assert.ok(i >= 0, pais);
  t.mock.method(Math, "random", () => (i + 0.5) / BANDERAS.length);
}
const de = (pais) => BANDERAS.find((b) => b.pais === pais);

test("cada bandera tiene su país escrito como se escribe, una sola vez, y su capital", () => {
  assert.equal(BANDERAS.length, 191);
  assert.equal(new Set(BANDERAS.map((b) => b.pais)).size, BANDERAS.length, "sin países repetidos");
  for (const b of BANDERAS) {
    assert.match(b.pais, /^[A-ZÁÉÍÓÚÑ]/, `${b.pais}: con mayúscula`);
    assert.ok(typeof b.capital === "string" && b.capital.length > 1 && b.capital.trim() === b.capital, `${b.pais}: capital`);
  }
  assert.deepEqual(["Uruguay", "Argentina", "Australia", "Turquía"].map((p) => de(p).capital), ["Montevideo", "Buenos Aires", "Canberra", "Ankara"]);
  // the ones where one capital isn't the whole story say so
  assert.match(de("Bolivia").nota, /La Paz/);
  assert.match(de("Sudáfrica").nota, /Ciudad del Cabo.*Bloemfontein/);
  assert.deepEqual([de("Guinea Ecuatorial").capital, de("Guinea Ecuatorial").nota], ["Ciudad de la Paz", "desde 2026; antes era Malabo"]);
  assert.equal(de("Uruguay").nota, undefined);
});

test("al acertar, la respuesta va con la bandera y la capital; vale sin tildes ni mayúsculas", async (t) => {
  tocara(t, "Japón");
  const client = cliente();
  const chat = "banderas-acierto@g.us";
  await P.run({ chat, sender: "a@lid", text: ".bandera", isGroup: true }, { client });
  assert.match(client.salidas[0], /🇯🇵/);
  const reacciones = [];
  const responde = (text) => P.before({ chat, sender: "a@lid", text, isGroup: true, quoted: { id: "B1" }, react: async (e) => reacciones.push(e) }, { client });
  await responde("China");
  assert.deepEqual([reacciones, client.salidas.length], [["❌"], 1], "la equivocada, una reacción");
  await responde("japon");
  // the prize, after the capital (lib/urucoins.js, juegoTerminado)
  assert.ok(client.salidas[1].startsWith(`${strings.gameSuccess}\n\n🇯🇵 *Japón*\n🏛️ Capital: *Tokio*\n\n🪙 `), client.salidas[1]);
  await responde("Japón");
  assert.equal(client.salidas.length, 2, "la ronda ya terminó");
});

test("al vencer el tiempo se dicen el país y su capital, con la nota cuando la tiene", async (t) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    tocara(t, "Bolivia");
    const client = cliente();
    await P.run({ chat: "banderas-tiempo@g.us", sender: "a@lid", text: ".bandera", isGroup: true }, { client });
    mock.timers.tick(30_000);
    assert.equal(client.salidas[1], "*[⏳] ¡Tiempo agotado!*\n\nLa respuesta era: *Bolivia*\n🏛️ Capital: *Sucre* (el gobierno está en La Paz)");
  } finally {
    mock.timers.reset();
  }
});
