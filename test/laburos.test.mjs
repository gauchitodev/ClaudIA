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

test("laburos: el sueldo sube en los oficios con poca gente y nunca baja en los llenos", () => {
  assert.equal(L.factorSueldo("tambero", conteo()), 1, "sin nadie laburando, sueldo base");

  // Con gente amontonada en un oficio, ese oficio se queda en el sueldo base (no hay castigo) y los vacíos suben.
  const c = conteo({ tambero: 3 });
  assert.equal(L.factorSueldo("tambero", c), 1, "el oficio lleno no cobra menos que el base");
  assert.ok(L.factorSueldo("camionero", c) > 1, "el oficio vacío cobra más");
  assert.equal(L.sueldoActual("tambero", c), L.OFICIOS.tambero.sueldo);

  // Topes: el bonus no pasa de DINAMICO_BONUS_MAX y el saturado nunca baja del base.
  assert.equal(L.factorSueldo("tambero", conteo({ tambero: 120 })), 1);
  assert.equal(L.factorSueldo("dj", conteo({ tambero: 120 })), 1 + L.LABURO.DINAMICO_BONUS_MAX);

  assert.equal(L.textoAjuste("tambero", c), "sueldo base, 3 personas");
  assert.match(L.textoAjuste("camionero", c), /^\+\d+ %, 0 personas$/);
});

test("laburos: la gente se cuenta en todos los grupos y una persona cuenta una vez por oficio", () => {
  assert.ok(L.tomarLaburo(G, "a@lid", "tambero").ok);
  assert.ok(L.tomarLaburo(OTRO, "a@lid", "tambero").ok, "el laburo sigue siendo por grupo");
  assert.equal(L.afiliadosPorOficio().tambero, 1, "la misma persona en dos grupos cuenta una vez");
  assert.ok(L.tomarLaburo(OTRO, "b@lid", "tambero").ok);
  const r = L.tomarLaburo(G, "c@lid", "dj");
  assert.ok(r.ok && /hoy paga \d+ \(/.test(r.mensaje), "al agarrar un laburo dice cuánto paga hoy");
  assert.deepEqual([L.afiliadosPorOficio().tambero, L.afiliadosPorOficio().dj], [2, 1]);
  assert.match(L.textoLaburos(G, "a@lid"), /Tambero\* — 25\/día \(sueldo base, 2 personas\)/);
  assert.match(L.textoLaburos(G, "a@lid"), /todos los grupos del bot/);
  assert.match(L.textoLaburos(G, "a@lid"), /nunca te baja el sueldo/);
});

test("laburos: .cobrar paga el sueldo del oficio por el evento del día", () => {
  // tambero está lleno, así que cobra el sueldo base (25) multiplicado por el evento: 0,5 / 1 / 1,5 / 2
  const antes = F.getSaldoCoins(G, "a@lid");
  const r = L.cobrar(G, "a@lid");
  assert.ok(r.ok, r.error);
  const cobrado = Number(r.mensaje.match(/Cobraste \*(\d+) UruCoins\*/)[1]);
  assert.ok([13, 25, 38, 50].includes(cobrado), `cobró ${cobrado}`);
  assert.equal(F.getSaldoCoins(G, "a@lid") - antes, cobrado);
  assert.doesNotMatch(r.mensaje, /📉/, "ya no existe el castigo por oficio lleno");
  assert.match(L.cobrar(G, "a@lid").error, /Ya cobraste hoy/);
});

test("laburos: niveles por cobros, con bonus por nivel y aviso al subir", () => {
  assert.deepEqual([2, 3, 4, 10].map(L.cobrosParaNivel), [3, 7, 12, 63]);
  assert.deepEqual([0, 2, 3, 6, 7, 62, 63, 500].map(L.nivelDe), [1, 1, 2, 2, 3, 9, 10, 10]);
  assert.ok(Math.abs(L.factorNivel(10) - 1.45) < 1e-9);
  assert.equal(L.textoNivel(0), "nivel 1; faltan 3 cobros para el nivel 2");
  assert.equal(L.textoNivel(7), "nivel 3 (+10 %); faltan 5 cobros para el nivel 4");
  assert.equal(L.textoNivel(11), "nivel 3 (+10 %); falta 1 cobro para el nivel 4");
  assert.equal(L.textoNivel(63), "nivel 10 (+45 %), el máximo");
  // "a@lid" es tambero en G con 6 cobros (nivel 2): cobra con +5 % y con este cobro llega a 7, nivel 3
  globalThis.db.prepare(`UPDATE laburos SET cobros = 6, ultimo_cobro = '' WHERE chat = ? AND usuario = ?`).run(G, "a@lid");
  assert.equal(L.etiquetaLaburo(G, "a@lid"), "🐄 Tambero nv.2");
  const r = L.cobrar(G, "a@lid");
  assert.ok(r.ok, r.error);
  const cobrado = Number(r.mensaje.match(/Cobraste \*(\d+) UruCoins\*/)[1]);
  assert.ok([13, 26, 39, 53].includes(cobrado), `cobró ${cobrado}`); // 25 × 1,05 × evento (0,5 / 1 / 1,5 / 2)
  assert.match(r.mensaje, /\(nivel 2, \+5 %\)\. Tenés/);
  assert.match(r.mensaje, /⬆️ Subiste a nivel 3 de tambero: \+10 % de sueldo de ahora en más\./);
  assert.equal(L.etiquetaLaburo(G, "a@lid"), "🐄 Tambero nv.3");
  assert.match(L.textoLaburos(G, "a@lid"), /Ahora sos tambero, nivel 3 \(\+10 %\); faltan 5 cobros para el nivel 4\. Cambiar cuesta 20, hay 3 días de espera y arrancás de nivel 1\./);
  assert.match(L.textoLaburos(G, "b@lid"), /cada nivel da \+5 % de sueldo, hasta el nivel 10/);
  // cambiar de laburo vuelve a nivel 1
  globalThis.db.prepare(`UPDATE laburos SET desde = 0 WHERE chat = ? AND usuario = ?`).run(G, "a@lid");
  F.moverCoins(G, "a@lid", 100, "test_carga");
  assert.match(L.tomarLaburo(G, "a@lid", "dj").mensaje, /Pagaste 20 de trámites y arrancás de nivel 1\./);
  assert.equal(L.etiquetaLaburo(G, "a@lid"), "🎧 DJ");
});

test("laburos: los oficios nuevos existen y se pueden nombrar de varias formas", () => {
  assert.equal(Object.keys(L.OFICIOS).length, 18);
  for (const clave of ["mecanico", "mozo", "feriante", "taxista", "enfermero", "maestra", "futbolista", "naranjita", "streamer", "panadero"]) {
    assert.ok(L.OFICIOS[clave], `falta el oficio ${clave}`);
    assert.equal(L.OFICIOS[clave].eventos.length, 3, `${clave} tiene que tener sus tres eventos`);
  }
  assert.equal(L.buscarOficio("Cuidacoches"), "naranjita");
  assert.equal(L.buscarOficio("trapito"), "naranjita");
  assert.equal(L.buscarOficio("enfermera"), "enfermero");
  assert.equal(L.buscarOficio("Mecánico"), "mecanico");
  assert.equal(L.buscarOficio("uber"), "taxista");
  assert.equal(L.buscarOficio("banana"), null);
});
