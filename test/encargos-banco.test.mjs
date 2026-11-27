import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";

// The bank of urgent errands (lib/encargos-banco.js): its shape, that no way is a gift or a robbery, and that no two
// errands are the same one.
let L, E, B, Esc;
before(async () => {
  await prepararBase("encargos-banco");
  L = await import("../lib/laburos.js");
  E = await import("../lib/encargos.js");
  B = await import("../lib/encargos-banco.js");
  Esc = await import("../lib/escenas-banco.js");
});

const todos = () => [...Object.entries(B.ENCARGOS).flatMap(([oficio, lista]) => lista.map((e) => [`${oficio}/${e.id}`, e])), ...B.ENCARGOS_GENERALES.map((e) => [`general/${e.id}`, e])];
const sinAcentos = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

test("el banco: de 10 a 15 encargos por cada oficio que existe, y 15 generales", () => {
  assert.deepEqual(Object.keys(B.ENCARGOS).sort(), Object.keys(L.OFICIOS).sort(), "un banco por oficio, y ninguno de un oficio que no existe");
  for (const [oficio, lista] of Object.entries(B.ENCARGOS)) assert.ok(lista.length >= 10 && lista.length <= 15, `${oficio}: ${lista.length}`);
  assert.equal(B.ENCARGOS_GENERALES.length, 15);
  assert.equal(E.todasLasClaves().length, todos().length);
});

test("cada encargo: id propio, título corto, una situación contada y 2 o 3 caminos con su resultado bueno y malo", () => {
  const { BANCO_CHANCE_MIN, BANCO_CHANCE_MAX, BANCO_PREMIO_MIN, BANCO_PREMIO_MAX, BANCO_VALOR_MIN, BANCO_VALOR_MAX } = E.ENCARGO;
  for (const [clave, e] of todos()) {
    assert.match(e.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, clave);
    assert.equal(E.buscarEncargo(clave), e, clave);
    // The title is also the betting market's (lib/mercados.js takes up to 80 letters).
    assert.ok(e.titulo.length >= 4 && e.titulo.length <= 45, `${clave}: título de ${e.titulo.length}`);
    assert.ok(e.texto.length >= 80 && e.texto.length <= 340, `${clave}: texto de ${e.texto.length}`);
    assert.ok(e.caminos.length === 2 || e.caminos.length === 3, clave);
    assert.equal(new Set(e.caminos.map((c) => c.nombre)).size, e.caminos.length, `${clave}: caminos distintos`);
    for (const c of e.caminos) {
      const donde = `${clave} · ${c.nombre}`;
      assert.ok(c.nombre.length >= 10 && c.nombre.length <= 100, donde);
      assert.ok(Number.isInteger(c.chance) && c.chance >= BANCO_CHANCE_MIN && c.chance <= BANCO_CHANCE_MAX, `${donde}: chance ${c.chance}`);
      assert.ok(Number.isInteger(c.premio) && c.premio >= BANCO_PREMIO_MIN && c.premio <= BANCO_PREMIO_MAX, `${donde}: premio ${c.premio}`);
      const valor = (c.chance * c.premio) / 100;
      assert.ok(valor >= BANCO_VALOR_MIN && valor <= BANCO_VALOR_MAX, `${donde}: rinde ${valor} en promedio`);
      assert.ok(c.bien.length >= 40 && c.mal.length >= 40, `${donde}: los dos resultados contados`);
      assert.notEqual(c.bien, c.mal, donde);
      for (const t of [c.nombre, c.bien, c.mal]) assert.doesNotMatch(t, /\{|\}|undefined/, donde);
    }
    // Riskier pays more: no way is better than another at everything.
    const porChance = [...e.caminos].sort((a, b) => a.chance - b.chance);
    for (let i = 1; i < porChance.length; i++) assert.ok(porChance[i].premio < porChance[i - 1].premio, `${clave}: el camino más seguro paga menos`);
    assert.equal(new Set(e.caminos.map((c) => c.chance)).size, e.caminos.length, `${clave}: cada camino con su chance`);
  }
});

test("no hay repetidos: ni ids, ni títulos, ni textos, ni caminos o resultados copiados de otro encargo", () => {
  const lista = todos();
  for (const [oficio, encargos] of Object.entries({ ...B.ENCARGOS, general: B.ENCARGOS_GENERALES })) assert.equal(new Set(encargos.map((e) => e.id)).size, encargos.length, `${oficio}: ids repetidos`);
  const unicos = (que, valores) => {
    const vistos = new Map();
    for (const [clave, valor] of valores) {
      const v = sinAcentos(valor);
      assert.ok(!vistos.has(v), `${que} repetido en ${clave} y ${vistos.get(v)}: ${valor.slice(0, 60)}`);
      vistos.set(v, clave);
    }
  };
  unicos("título", lista.map(([clave, e]) => [clave, e.titulo]));
  unicos("texto", lista.map(([clave, e]) => [clave, e.texto]));
  unicos("camino", lista.flatMap(([clave, e]) => e.caminos.map((c) => [clave, c.nombre])));
  unicos("resultado", lista.flatMap(([clave, e]) => e.caminos.flatMap((c) => [[clave, c.bien], [clave, c.mal]])));
  // Nor the same opening as another one: the first words of each situation are its own.
  unicos("arranque", lista.map(([clave, e]) => [clave, e.texto.split(/\s+/).slice(0, 6).join(" ")]));
  // And none is a payday scene told again (lib/escenas-banco.js).
  const escenas = new Set([...Object.values(Esc.ESCENAS).flat(), ...Esc.ESCENAS_GENERALES].map((s) => sinAcentos(s.texto)));
  for (const [clave, e] of lista) assert.ok(!escenas.has(sinAcentos(e.texto)), clave);
});

test("el peor camino es el de menos chance", () => {
  for (const [clave, e] of todos()) {
    const peor = E.peorCamino(e);
    assert.equal(peor.chance, Math.min(...e.caminos.map((c) => c.chance)), clave);
  }
});
