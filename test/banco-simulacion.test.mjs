import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";

// Weeks of a town with its Banco Central (scripts/simular-banco.mjs), in three economies: that it holds. Nobody under
// zero, the rate in its bounds, the deposits' interest a small share of what the town earns, no debt running away; and
// that the rate does what it's there for: higher in a boom than in a normal town, lower in a recession.
let simular;
before(async () => {
  await prepararBase("banco-simulacion");
  ({ simular } = await import("../scripts/simular-banco.mjs"));
});

const media = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const corridas = {};
async function corrida(escenario) {
  corridas[escenario] ??= await simular({ semanas: 10, escenario });
  return corridas[escenario];
}

for (const escenario of ["normal", "boom", "recesion"]) {
  test(`simulación ${escenario}: la economía aguanta diez semanas`, async () => {
    const r = await corrida(escenario);
    assert.deepEqual(r.problemas, []);
    assert.equal(r.semanas.length, 10);
    assert.ok(r.final.minimo >= 0);
    assert.ok(r.final.interesesSobreIngresos < 2, `intereses: ${r.final.interesesSobreIngresos} % de lo ganado`);
    for (const s of r.semanas) {
      assert.ok(s.precios >= 0.9 && s.precios <= 1.25, `precios x${s.precios}`);
      assert.ok(s.deuda <= 6000, `deuda con el banco ${s.deuda}`);
    }
    // The boss borrowed for his company and paid; the deadbeat was caught.
    assert.ok(r.final.prestamos >= 2);
    assert.ok(r.final.cobrado > 0);
  });
}

test("simulación: la tasa sube en el boom y baja en la recesión, comparadas con un pueblo normal", async () => {
  const normal = await corrida("normal");
  const boom = await corrida("boom");
  const recesion = await corrida("recesion");
  const primeras = (r) => r.semanas.slice(0, 4).map((s) => s.tasa);
  assert.ok(Math.max(...primeras(boom)) > Math.max(...primeras(normal)), `boom ${primeras(boom)} vs normal ${primeras(normal)}`);
  assert.ok(media(recesion.semanas.map((s) => s.tasa)) < media(normal.semanas.map((s) => s.tasa)));
  assert.ok(media(recesion.semanas.map((s) => s.precios)) < media(boom.semanas.map((s) => s.precios)));
  // Whoever didn't pay went through the clearing, and in a normal town a good of his was auctioned.
  assert.ok(normal.final.embargos + recesion.final.embargos >= 1);
  assert.ok(normal.final.remates >= 1);
});
