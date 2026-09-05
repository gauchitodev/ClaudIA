import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G } from "./helpers.mjs";

let F, L;
before(async () => {
  ({ F } = await prepararBase("laburos"));
  L = await import("../lib/laburos.js");
});
const OTRO = "otro@g.us";
const conteo = (parcial = {}) => ({ ...Object.fromEntries(Object.keys(L.OFICIOS).map((k) => [k, 0])), ...parcial });

test("laburos: el factor de sueldo sube con poca gente, baja con mucha y tiene topes", () => {
  assert.equal(L.factorSueldo("tambero", conteo()), 1, "sin nadie laburando, sueldo base");
  // 3 personas en 8 oficios: promedio 0,375. Un oficio con 3 está muy por encima; uno vacío, apenas por debajo.
  const c = conteo({ tambero: 3 });
  assert.ok(Math.abs(L.factorSueldo("tambero", c) - 0.7375) < 1e-9);
  assert.ok(Math.abs(L.factorSueldo("camionero", c) - 1.0375) < 1e-9);
  assert.equal(L.sueldoActual("tambero", c), 7, "10 × 0,7375 redondeado");
  assert.equal(L.sueldoActual("camionero", c), 12);
  // topes: un oficio saturado no baja de −40 %, uno vacío con mucha gente en los otros no pasa de +50 %
  assert.equal(L.factorSueldo("tambero", conteo({ tambero: 40 })), 1 - L.LABURO.DINAMICO_PENALIZACION_MAX);
  assert.equal(L.factorSueldo("dj", conteo({ tambero: 40 })), 1 + L.LABURO.DINAMICO_BONUS_MAX);
  assert.equal(L.sueldoActual("dj", conteo({ tambero: 40 })), 17, "11 × 1,5 = 16,5 → 17");
  assert.equal(L.textoAjuste("tambero", c), "−26 %, 3 personas");
  assert.equal(L.textoAjuste("camionero", c), "+4 %, 0 personas");
  assert.equal(L.textoAjuste("tambero", conteo({ tambero: 1, dj: 1, chofer: 1, peon: 1, oficinista: 1, politico: 1, camionero: 1, guardavidas: 1 })), "sueldo base, 1 persona");
});

test("laburos: la gente se cuenta en todos los grupos y una persona cuenta una vez por oficio", () => {
  assert.ok(L.tomarLaburo(G, "a@lid", "tambero").ok);
  assert.ok(L.tomarLaburo(OTRO, "a@lid", "tambero").ok, "el laburo sigue siendo por grupo");
  assert.equal(L.afiliadosPorOficio().tambero, 1, "la misma persona en dos grupos cuenta una vez");
  assert.ok(L.tomarLaburo(OTRO, "b@lid", "tambero").ok);
  const r = L.tomarLaburo(G, "c@lid", "dj");
  assert.ok(r.ok && /hoy paga \d+ \(/.test(r.mensaje), "al agarrar un laburo dice cuánto paga hoy");
  assert.deepEqual([L.afiliadosPorOficio().tambero, L.afiliadosPorOficio().dj], [2, 1]);
  assert.match(L.textoLaburos(G, "a@lid"), /Tambero\* — 8\/día \(−16 %, 2 personas\)/);
  assert.match(L.textoLaburos(G, "a@lid"), /todos los grupos del bot/);
});

test("laburos: .cobrar paga el sueldo ajustado y explica el ajuste", () => {
  // tambero con 2 de 3 laburantes: factor 1 + (0,375 − 2) × 0,1 = 0,8375 → base 8; el evento lo multiplica por 0,5 / 1 / 1,5 / 2
  const antes = F.getSaldoCoins(G, "a@lid");
  const r = L.cobrar(G, "a@lid");
  assert.ok(r.ok, r.error);
  const cobrado = Number(r.mensaje.match(/Cobraste \*(\d+) UruCoins\*/)[1]);
  assert.ok([4, 8, 12, 16].includes(cobrado), `cobró ${cobrado}`);
  assert.equal(F.getSaldoCoins(G, "a@lid") - antes, cobrado);
  assert.match(r.mensaje, /📉 Hoy tambero paga −16 %: hay mucha gente en el oficio \(2 en todos los grupos\)/);
  assert.match(L.cobrar(G, "a@lid").error, /Ya cobraste hoy/);
  // sin gente de más ni de menos no hay línea de ajuste
  const parejo = conteo({ tambero: 1, dj: 1, chofer: 1, peon: 1, oficinista: 1, politico: 1, camionero: 1, guardavidas: 1 });
  assert.equal(L.factorSueldo("dj", parejo), 1);
});
