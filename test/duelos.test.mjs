import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, esperar, fijarSaldo } from "./helpers.mjs";

let F, D;
before(async () => {
  ({ F } = await prepararBase("duelos"));
  D = await import("../lib/duelos.js");
});
const saldo = (u) => F.getSaldoCoins(G, u);

test("desafío a dados: aceptar, jugar y pagar al ganador", () => {
  fijarSaldo(F, G, "a", 100);
  fijarSaldo(F, G, "b", 100);
  const r = D.desafiar(G, "a", "b", 20, "dado", null);
  assert.ok(r.ok && /desafía a @b a un duelo de dados/.test(r.texto));
  assert.equal(saldo("a"), 80, "el retador pone la plata al desafiar");
  assert.match(D.textoDuelos(G).texto, /@a vs @b — 20 UruCoins a dados/);
  const tiradas = [5, 3];
  let i = 0;
  D._rng.randomInt = () => tiradas[i++ % tiradas.length];
  const j = D.aceptar(G, "b");
  assert.ok(j.ok && /@a tiró \*5\* · @b tiró \*3\*/.test(j.texto) && j.ganador === "a");
  assert.equal(saldo("a"), 120);
  assert.equal(saldo("b"), 80);
  assert.equal(D.textoDuelos(G), null);
});

test("dados empatados se repiten; cartas con desempate por palo", () => {
  fijarSaldo(F, G, "a", 100);
  fijarSaldo(F, G, "b", 100);
  const tiradas = [4, 4, 2, 6];
  let i = 0;
  D._rng.randomInt = () => tiradas[i++];
  D.desafiar(G, "a", "b", 10, "dados", null);
  const j = D.aceptar(G, "b");
  assert.ok(j.ganador === "b" && /tiró \*2\* · @b tiró \*6\*/.test(j.texto));
  // cards: index 0 = 2♣ ... 12 = A♣, 13 = 2♦ ... ; c2 shifts up if it lands on c1
  fijarSaldo(F, G, "a", 100);
  fijarSaldo(F, G, "b", 100);
  const cartas = [12, 12]; // a draws A♣ (12); b asks for 12 -> shifts to 13 = 2♦
  i = 0;
  D._rng.randomInt = () => cartas[i++];
  D.desafiar(G, "a", "b", 10, "carta", null);
  const c = D.aceptar(G, "b");
  assert.ok(/@a sacó \*A♣\* · @b sacó \*2♦\*/.test(c.texto) && c.ganador === "a");
  const mismoValor = [0, 12]; // a: 2♣ ; b asks for 12 -> 13 = 2♦: same value, the suit wins ♦ > ♣
  i = 0;
  D._rng.randomInt = () => mismoValor[i++];
  fijarSaldo(F, G, "a", 100);
  fijarSaldo(F, G, "b", 100);
  D.desafiar(G, "a", "b", 10, "carta", null);
  assert.equal(D.aceptar(G, "b").ganador, "b");
});

test("rechazo, vencimiento y validaciones", async () => {
  fijarSaldo(F, G, "a", 100);
  fijarSaldo(F, G, "b", 3);
  D.desafiar(G, "a", "b", 20, "dado", null);
  assert.match(D.aceptar(G, "b").error, /No te alcanza/);
  assert.ok(globalThis.duelos.size === 1, "el desafío sigue en pie");
  assert.match(D.rechazar(G, "b").texto, /no aceptó el duelo/);
  assert.equal(saldo("a"), 100);
  assert.match(D.aceptar(G, "b").error, /ningún desafío/);
  assert.match(D.desafiar(G, "a", "a", 20, "dado", null).error, /vos mismo/);
  assert.match(D.desafiar(G, "a", "bot@lid", 20, "dado", null).error, /Conmigo no/);
  assert.match(D.desafiar(G, "a", "b", 20, "ppt", null).error, /dado, a carta o a pelea/);
  assert.match(D.desafiar(G, "a", "b", 4, "dado", null).error, /mínima/);
  assert.match(D.desafiar(G, "a", "b", 101, "dado", null).error, /máxima/);
  assert.match(D.desafiar(G, "a", null, 20, "dado", null).error, /¿A quién/);
  D.DUELO.MINUTOS = 0.001;
  let vencido = null;
  D.desafiar(G, "a", "b", 20, "dado", (v) => (vencido = v));
  assert.match(D.desafiar(G, "a", "c", 20, "dado", null).error, /Ya tenés un desafío pendiente/);
  assert.match(D.desafiar(G, "c", "b", 20, "dado", null).error, /ya tiene un desafío pendiente/);
  await esperar(150);
  assert.ok(vencido && /venció sin respuesta/.test(vencido.texto) && saldo("a") === 100 && globalThis.duelos.size === 0);
});

test("pelea por turnos: golpe, patada, cubrirse, curar, contraataque y final", () => {
  fijarSaldo(F, G, "a", 100);
  fijarSaldo(F, G, "b", 100);
  D.PELEA.SEGUNDOS_TURNO = 600;
  const cola = [];
  D._rng.randomInt = () => { if (!cola.length) throw new Error("la prueba se quedó sin valores de azar"); return cola.shift(); };
  cola.push(0); // the challenger starts (a)
  D.desafiar(G, "a", "b", 20, "pelea", null);
  let r = D.aceptar(G, "b", null);
  assert.ok(/¡Empieza la pelea!/.test(r.texto) && /Turno de @a/.test(r.texto) && !r.terminada);
  assert.equal(saldo("a") + saldo("b"), 160, "los dos pusieron 20");
  assert.match(D.accionPelea(G, "b", "golpe").error, /No es tu turno/);
  cola.push(0, 20, 99); // a: a punch that lands, 20 damage, no crit
  r = D.accionPelea(G, "a", "golpe");
  assert.match(r.texto, /@a lanza un golpe y conecta: −20/);
  assert.equal(globalThis.peleas.get(`${G}|b`).jugadores.b.hp, 80);
  r = D.accionPelea(G, "b", "cubrirse");
  assert.match(r.texto, /@b se cubre/);
  cola.push(0, 34, 99); // a: a kick landing for 34, but b was guarding -> 17
  r = D.accionPelea(G, "a", "patada");
  assert.match(r.texto, /conecta: −17 \(a medias, @b estaba cubierto\)/);
  assert.equal(globalThis.peleas.get(`${G}|b`).jugadores.b.hp, 63);
  cola.push(25); // b heals +25
  r = D.accionPelea(G, "b", "curar");
  assert.match(r.texto, /@b se cura \+25/);
  assert.equal(globalThis.peleas.get(`${G}|b`).jugadores.b.hp, 88);
  assert.match(r.texto, /\.curar \(2\)/.test(r.texto) ? /\.curar \(2\)/ : /Turno de @a/);
  D.accionPelea(G, "a", "cubrirse");
  cola.push(99, 10, 10); // b: a punch that misses (99 >= 85), the counter lands (10 < 40) for 10
  r = D.accionPelea(G, "b", "golpe");
  assert.ok(/@b lanza un golpe\.\.\. y falla/.test(r.texto) && /@a contraataca desde la guardia: −10/.test(r.texto));
  assert.equal(globalThis.peleas.get(`${G}|a`).jugadores.b.hp, 78);
  cola.push(0, 20, 0); // a: a critical punch 20 -> 30
  r = D.accionPelea(G, "a", "golpe");
  assert.match(r.texto, /−30 ✨ crítico/);
  assert.equal(globalThis.peleas.get(`${G}|a`).jugadores.b.hp, 48);
  // b runs out of heals on the second use, and a finishes it
  cola.push(20);
  D.accionPelea(G, "b", "curar");
  assert.match(D.accionPelea(G, "a", "cubrirse").texto, /se cubre/);
  assert.match(D.accionPelea(G, "b", "curar").error, /Ya usaste tus curas/);
  cola.push(0, 34, 0); // b: a critical kick 51 against a guarding a -> 26
  D.accionPelea(G, "b", "patada");
  assert.equal(globalThis.peleas.get(`${G}|a`).jugadores.a.hp, 74);
  for (const _ of [1, 2, 3]) {
    cola.push(0, 34, 0); // a: a critical kick 51 on b (68 -> 17 -> 0)
    r = D.accionPelea(G, "a", "patada");
    if (r.terminada) break;
    cola.push(0, 12, 99);
    D.accionPelea(G, "b", "golpe");
  }
  assert.ok(r.terminada && /@b cae/.test(r.texto) && /@a gana la pelea y se lleva \*40 UruCoins\*/.test(r.texto));
  assert.equal(saldo("a"), 120);
  assert.equal(saldo("b"), 80);
  assert.equal(globalThis.peleas.size, 0);
  assert.match(D.accionPelea(G, "a", "golpe").error, /No estás en ninguna pelea/);
});

test("pelea: turno vencido tira un golpe solo, y a los turnos máximos gana el que tenga más vida", async () => {
  fijarSaldo(F, G, "a", 100);
  fijarSaldo(F, G, "b", 100);
  D.PELEA.SEGUNDOS_TURNO = 0.05;
  D.PELEA.MAX_TURNOS = 2;
  const cola = [0, 0, 12, 99]; // a starts; their automatic punch lands for 12 with no crit
  D._rng.randomInt = () => { if (!cola.length) throw new Error("la prueba se quedó sin valores de azar"); return cola.shift(); };
  let aviso = null;
  D.desafiar(G, "a", "b", 10, "pelea", null);
  D.aceptar(G, "b", (msg) => (aviso = msg));
  D.PELEA.SEGUNDOS_TURNO = 600; // b's turn no longer expires on its own
  await esperar(120);
  assert.ok(aviso && /se quedó pensando y tira un golpe solo/.test(aviso.texto) && /conecta: −12/.test(aviso.texto), aviso?.texto);
  const r = D.accionPelea(G, "b", "cubrirse");
  assert.ok(r.terminada && /Se acabaron los turnos/.test(r.texto) && /@a gana la pelea/.test(r.texto));
  assert.equal(saldo("a"), 110);
  D.PELEA.MAX_TURNOS = 20;
});
