import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, fijarSaldo } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// Services between players (lib/servicios.js, plugins/pueblo-servicios.js, plugins/_servicios.js): a company's good
// breaks down and the town's mechanics are offered, with their level and reviews; the one picked names a price, it's
// haggled, accepted, paid from the cash box and rolled at their level; the deadline sends it to the town's own; and
// someone hurt in an errand is offered the nurses, collecting half until they're seen to. Never without a town.
let F, P, L, EM, S, EN, Plugin, Hook, client;
const ANA = "300000000000081@lid"; // the owner
const BETO = "300000000000082@lid"; // a mechanic
const CARLA = "300000000000083@lid"; // another
const DANI = "300000000000084@lid"; // a nurse
const DIA = 24 * 60 * 60 * 1000;

before(async () => {
  ({ F } = await prepararBase("servicios"));
  P = await import("../lib/pueblo.js");
  L = await import("../lib/laburos.js");
  EM = await import("../lib/empresas.js");
  S = await import("../lib/servicios.js");
  EN = await import("../lib/encargos.js");
  Plugin = (await import("../plugins/pueblo-servicios.js")).default;
  Hook = (await import("../plugins/_servicios.js")).default;
});
beforeEach(() => {
  client = clienteFalso();
  conexion.client = client;
  P._dep.azar = (n) => n - 1; // the last of everything: no robberies
  S._dep.azar = () => 0;
});

const oficio = (chat, quien, laburo, cobros = 0) => db.prepare(`INSERT OR REPLACE INTO laburos (chat, usuario, laburo, desde, ultimo_cobro, cobros) VALUES (?, ?, ?, ?, '', ?)`).run(chat, quien, laburo, Date.now() - 30 * DIA, cobros);
const ultimo = () => globalThis.enviados.at(-1)?.msg?.text || "";
async function comando(chat, quien, texto) {
  const [command, ...args] = texto.split(/\s+/);
  await Plugin.run({ chat, sender: quien, senderJid: "", text: `.${texto}`, isGroup: true, message: {} }, { client, command, args });
  return ultimo();
}

function grupo(chat, { conPueblo = true } = {}) {
  for (const [quien, nombre] of [[ANA, "Ana"], [BETO, "Beto"], [CARLA, "Carla"], [DANI, "Dani"]]) F.initDataDB({ chat, sender: quien, senderJid: "", pushName: nombre });
  if (conPueblo) {
    P.nacer(chat);
    F.updateChat(chat, { pueblo: 1 });
  }
}
// Ana's transport company, its truck at 10 % and the dice set for it to break down on her shift.
function empresaConCamionPorRomperse(chat) {
  oficio(chat, ANA, "camionero", L.cobrosParaNivel(10));
  fijarSaldo(F, chat, ANA, 2000);
  assert.equal(EM.fundar(chat, ANA, "Fletes Ana").ok, true);
  const e = EM.empresaDe(chat, ANA);
  db.prepare(`UPDATE empresas SET caja = 500 WHERE id = ?`).run(e.id);
  db.prepare(`UPDATE empresas_bienes SET estado = 10 WHERE empresa = ?`).run(e.id);
  EM._dep.azar = () => 0;
  return e;
}
const bien = (e) => db.prepare(`SELECT * FROM empresas_bienes WHERE empresa = ?`).get(e.id);

test("servicios: sin pueblo, un bien roto es el .service de siempre", () => {
  const chat = "sinpueblo@g.us";
  grupo(chat, { conPueblo: false });
  oficio(chat, BETO, "mecanico", 30);
  empresaConCamionPorRomperse(chat);
  const r = EM.jornadaDelPatron(chat, ANA);
  assert.match(r.mensaje, /no facturó nada\. Se arregla con \.service 1\n/);
  assert.deepEqual(r.mentions, []);
  assert.equal(S.servicioDe(chat, ANA), null);
  assert.equal(S.ofrecerServicio(chat, ANA, "herido", {}), null);
});

test("servicios: se rompe el camión, se elige al mecánico, pone precio, se cierra trato y lo arregla", async () => {
  const chat = "taller@g.us";
  grupo(chat);
  oficio(chat, BETO, "mecanico", 30); // nivel 6
  oficio(chat, CARLA, "mecanico", 0);
  const e = empresaConCamionPorRomperse(chat);
  const r = EM.jornadaDelPatron(chat, ANA);
  assert.match(r.mensaje, /¿A quién se lo llevás\?\n1️⃣ @300000000000082 \(mecánico nv\. 6\)\n2️⃣ @300000000000083 \(mecánico nv\. 1\)\n3️⃣ El taller del pueblo — \d+ UruCoins, y no regatea/);
  assert.deepEqual(new Set(r.mentions), new Set([ANA, BETO, CARLA]));
  // Only the one served picks, with the bare number too.
  const m = { chat, sender: ANA, senderJid: "", text: "1", isGroup: true, message: {} };
  await Hook.before(m, { client, chat: { monedas: 1 } });
  assert.equal(m.respuestaDeJuego, true);
  assert.match(ultimo(), /@300000000000082, @300000000000081 te trae camión chico de Fletes Ana\. ¿Cuánto le cobrás\?/);
  assert.match(await comando(chat, CARLA, "cobro 10"), /Nadie te pidió nada/);
  assert.match(await comando(chat, BETO, "cobro 90"), /te cobra \*90 UruCoins\*/);
  assert.match(await comando(chat, ANA, "regateo 95"), /menos de 90/);
  assert.match(await comando(chat, ANA, "regateo 60"), /te ofrece 60, @300000000000082\. \.cobro 60/);
  await comando(chat, BETO, "cobro 60");
  const saldo = F.getSaldoCoins(chat, BETO);
  const cobros = L.laburoDe(chat, BETO).cobros;
  assert.match(await comando(chat, ANA, "trato"), /quedó joya\. Cobró \*60 UruCoins\*/);
  assert.equal(F.getSaldoCoins(chat, BETO), saldo + 60);
  assert.equal(EM.empresaDe(chat, ANA).caja, 440, "de la caja de la empresa");
  assert.equal(L.laburoDe(chat, BETO).cobros, cobros + 1, "suma experiencia de oficio");
  assert.deepEqual([bien(e).estado, bien(e).roto], [100, 0]);
  assert.ok(P.hechosDesde(chat, 0, Infinity).some((h) => h.tipo === "servicio" && h.usuario === BETO));
  // The review, once, and it shows in the options to come.
  assert.match(await comando(chat, ANA, "resena 9"), /de 1 a 5/);
  assert.match(await comando(chat, ANA, "resena 4"), /⭐⭐⭐⭐ para @300000000000082/);
  assert.match(await comando(chat, ANA, "resena 5"), /ya lo reseñaste/);
  assert.deepEqual(S.resenasDe(chat, BETO), { promedio: 4, n: 1 });
  const otra = S.ofrecerServicio(chat, ANA, "bien", { empresa: e.id, bien: bien(e).id, tipo: "camionero", bienNombre: "Camión chico", empresaNombre: "Fletes Ana", costo: 50 });
  assert.match(otra.texto, /mecánico nv\. 6, ⭐4 de 1/);
});

test("servicios: un nivel bajo lo puede dejar peor, y el que dice que no queda afuera", async () => {
  const chat = "peor@g.us";
  grupo(chat);
  oficio(chat, BETO, "mecanico", 0);
  oficio(chat, CARLA, "mecanico", 0);
  const e = empresaConCamionPorRomperse(chat);
  EM.jornadaDelPatron(chat, ANA);
  await comando(chat, ANA, "servicio 1");
  assert.match(await comando(chat, BETO, "cobro no"), /no lo agarra/);
  assert.match(await comando(chat, ANA, "servicio 1"), /ya te dijo que no/);
  await comando(chat, ANA, "servicio 2");
  await comando(chat, CARLA, "cobro 30");
  S._dep.azar = () => 99;
  assert.match(await comando(chat, ANA, "trato"), /lo dejó peor que antes\. Cobró \*30 UruCoins\* igual \(nivel 1: 55 %/);
  assert.equal(bien(e).roto, 1, "sigue roto");
});

test("servicios: sin nadie del oficio queda el del pueblo, que cobra de la caja y no falla", async () => {
  const chat = "nadie@g.us";
  grupo(chat);
  const e = empresaConCamionPorRomperse(chat);
  const r = EM.jornadaDelPatron(chat, ANA);
  assert.match(r.mensaje, /1️⃣ El taller del pueblo/);
  assert.match(r.mensaje, /no hay un mecánico ni para remedio/);
  const costo = S.servicioDe(chat, ANA).opciones[0].precio;
  assert.match(await comando(chat, ANA, "servicio 1"), /El taller del pueblo se encargó/);
  assert.equal(EM.empresaDe(chat, ANA).caja, 500 - costo);
  assert.equal(bien(e).roto, 0);
});

test("servicios: si nadie cierra a tiempo va al del pueblo, salvo que ya lo hayan arreglado", async () => {
  const chat = "vence@g.us";
  grupo(chat);
  oficio(chat, BETO, "mecanico", 30);
  const e = empresaConCamionPorRomperse(chat);
  EM.jornadaDelPatron(chat, ANA);
  const s = S.servicioDe(chat, ANA);
  assert.equal(S.vencerServicio(s.id, Date.now()), null, "todavía no venció");
  const r = S.vencerServicio(s.id, Date.now() + DIA);
  assert.match(r.texto, /No se arregló nada a tiempo[\s\S]*El taller del pueblo se encargó/);
  assert.equal(bien(e).roto, 0);
  // Broken again and fixed with .service meanwhile: nobody charges for it.
  db.prepare(`UPDATE empresas_bienes SET estado = 10, roto = 0, usado = '' WHERE empresa = ?`).run(e.id);
  db.prepare(`UPDATE empresas SET ultima_jornada = '' WHERE id = ?`).run(e.id);
  EM.jornadaDelPatron(chat, ANA);
  const otro = S.servicioDe(chat, ANA);
  assert.equal(EM.service(chat, ANA, "1").ok, true);
  const caja = EM.empresaDe(chat, ANA).caja;
  assert.equal(S.vencerServicio(otro.id, Date.now() + DIA), null);
  assert.equal(EM.empresaDe(chat, ANA).caja, caja);
});

test("servicios: herido en un encargo, cobra la mitad hasta que lo curan", async () => {
  const chat = "herido@g.us";
  grupo(chat);
  oficio(chat, ANA, "camionero", 0);
  oficio(chat, DANI, "enfermero", 12);
  // The errand goes wrong (the dice at 99), and the town's dice say hurt.
  const clave = EN.todasLasClaves()[0];
  const id = Number(db.prepare(`INSERT INTO encargos (chat, usuario, clave, camino, creada, vence) VALUES (?, ?, ?, 1, ?, ?)`).run(chat, ANA, clave, Date.now() - 3600000, Date.now() - 1).lastInsertRowid);
  EN._dep.azar = () => 99;
  S._dep.azar = () => 0;
  const r = EN.vencerEncargo(id);
  assert.equal(r.salioBien, false);
  assert.match(r.texto, /🤕 Y encima volvió con un tobillo a la miseria/);
  assert.match(r.texto, /1️⃣ @300000000000084 \(enfermero nv\. 4\)/);
  assert.ok(r.mentions.includes(DANI));
  assert.equal(P.estaHerido(chat, ANA), true);
  const sano = L.jornalDe(chat, DANI, L.laburoDe(chat, DANI)).jornal;
  const jornal = L.jornalDe(chat, ANA, L.laburoDe(chat, ANA));
  assert.equal(jornal.herido, true);
  // The nurse cures, paid from the pocket.
  fijarSaldo(F, chat, ANA, 100);
  await comando(chat, ANA, "servicio 1");
  await comando(chat, DANI, "cobro 20");
  assert.match(await comando(chat, ANA, "trato"), /hizo una curación y quedó joya/);
  assert.equal(F.getSaldoCoins(chat, ANA), 80);
  assert.equal(P.estaHerido(chat, ANA), false);
  assert.ok(sano > 0);
});

test("servicios: el sueldo de un herido es la mitad, y cobrarlo lo deja pago", () => {
  const chat = "mitad@g.us";
  grupo(chat);
  oficio(chat, ANA, "mozo", 0);
  const entero = L.jornalDe(chat, ANA, L.laburoDe(chat, ANA)).jornal;
  db.prepare(`INSERT INTO pueblo_heridos (chat, usuario, desde) VALUES (?, ?, ?)`).run(chat, ANA, Date.now());
  assert.equal(L.jornalDe(chat, ANA, L.laburoDe(chat, ANA)).jornal, entero * 0.5);
  const r = L.cobrar(chat, ANA);
  assert.match(r.mensaje, /🤕 Cobrás la mitad/);
  assert.equal(P.estaHerido(chat, ANA), false);
});

test("servicios: el número suelto no se lo roba a un juego ni a un mensaje citado", async () => {
  const chat = "numero@g.us";
  grupo(chat);
  oficio(chat, BETO, "mecanico", 30);
  empresaConCamionPorRomperse(chat);
  EM.jornadaDelPatron(chat, ANA);
  const antes = globalThis.enviados.length;
  for (const extra of [{ respuestaDeJuego: true }, { quoted: { id: "OTRO" } }, { sender: CARLA }]) {
    const m = { chat, sender: ANA, senderJid: "", text: "1", isGroup: true, message: {}, ...extra };
    await Hook.before(m, { client, chat: { monedas: 1 } });
  }
  const m = { chat, sender: ANA, senderJid: "", text: "7", isGroup: true, message: {} };
  await Hook.before(m, { client, chat: { monedas: 1 } });
  assert.equal(globalThis.enviados.length, antes);
  assert.equal(S.servicioDe(chat, ANA).estado, "opciones");
});
