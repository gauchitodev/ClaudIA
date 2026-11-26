import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prepararBase, clienteFalso, fijarSaldo } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// The urgent errands (lib/encargos.js, plugins/coins-encargos.js, coins-encargos-apuesta.js and _encargos.js): who
// gets one and which, choosing the way, the group's help, sabotage and bets, the deadline, and that nobody gets the
// same one twice until they've had all of their trade's. And what it must never do: go out where nobody asked for it.
let F, E, B, A, M, Cache, Plugin, Apuesta, Hook, client;
const ANA = "300000000000041@lid";
const BETO = "300000000000042@lid";
const CARLA = "300000000000043@lid";
const DANI = "300000000000044@lid";
const num = (lid) => `598${lid.slice(-8, -4)}@s.whatsapp.net`;
const GENTE = [ANA, BETO, CARLA, DANI];
const MIN = 60 * 1000;

before(async () => {
  ({ F } = await prepararBase("encargos"));
  E = await import("../lib/encargos.js");
  B = await import("../lib/encargos-banco.js");
  A = await import("../lib/actividad.js");
  M = await import("../lib/mercados.js");
  Cache = await import("../lib/cache-grupos.js");
  Plugin = (await import("../plugins/coins-encargos.js")).default;
  Apuesta = (await import("../plugins/coins-encargos-apuesta.js")).default;
  Hook = (await import("../plugins/_encargos.js")).default;
});
beforeEach(() => {
  client = clienteFalso();
  conexion.client = client;
  // The hours wide open: the bets go by the real clock (lib/mercados.js), so most of these run at whatever time it
  // is. The test of the hours sets its own.
  E.ENCARGO.DESDE_HORA = 0;
  E.ENCARGO.HASTA_HORA = 24;
  // Each test from scratch: what somebody has had counts across groups, and it would change what Ana gets next.
  db.prepare(`DELETE FROM encargos`).run();
});

// The dice, loaded: each call takes the next number (within what was asked for, as real dice are), and 0 once they
// run out.
const dados = (...tiros) => {
  E._dep.azar = (n) => (tiros.shift() ?? 0) % n;
};
const aLas = (hora, minutos = 0) => {
  const d = new Date();
  d.setHours(hora, minutos, 0, 0);
  return d;
};
const saldo = (chat, quien) => F.getSaldoCoins(chat, quien);
const enviados = () => globalThis.enviados;
const ultimo = () => enviados().at(-1);
const oficio = (chat, quien, laburo) => db.prepare(`INSERT OR REPLACE INTO laburos (chat, usuario, laburo, desde) VALUES (?, ?, ?, ?)`).run(chat, quien, laburo, Date.now() - 30 * 24 * 60 * MIN);

// A group with the errands on, its people (listed by LID, with their number), the economy on, and everybody
// talking right at "ahora".
function grupo(chat, { gente = GENTE, ahora = new Date(), prendido = 1 } = {}) {
  F.initDataDB({ chat, sender: ANA, senderJid: "", pushName: "Ana" });
  F.updateChat(chat, { encargos: prendido });
  Cache.guardar(client, chat, { subject: "Los del encargo", participants: [...gente.map((id) => ({ id, phoneNumber: num(id) })), { id: "bot@lid" }] });
  for (let i = 0; i < 10; i++) F.sumarMensajeHora(chat, A.claveDia(ahora), ahora.getHours());
  for (const quien of gente) {
    F.initDataDB({ chat, sender: quien, senderJid: num(quien), pushName: quien.slice(-6, -4) });
    F.registrarMensajeGrupo(chat, [quien], ahora.getTime());
  }
}
// An errand out right now, with the dice at 0: Ana's (the first of the people talking), the first of her bank.
async function abierto(chat, { laburo = "camionero" } = {}) {
  grupo(chat);
  if (laburo) oficio(chat, ANA, laburo);
  dados();
  const id = await E.lanzarEncargo(client, chat, new Date());
  assert.ok(id, "tendría que haber salido");
  return E.encargoAbierto(chat);
}
const msg = (sender, text, chat, extra = {}) => ({ chat, sender, senderJid: "", text, message: {}, isGroup: true, ...extra });
async function comando(chat, quien, texto, { isAdmin = false } = {}) {
  const [command, ...args] = texto.split(/\s+/);
  const plugin = Apuesta.cmd.includes(command) ? Apuesta : Plugin;
  await plugin.run(msg(quien, `.${texto}`, chat), { client, command, args, text: args.join(" "), isAdmin, chat: F.getChat(chat) });
  return ultimo();
}
const SOBRE = () => B.ENCARGOS.camionero[0];

test("vienen apagados, y no sale ninguno donde no corresponde: sin el interruptor, sin economía, fuera de hora, con el grupo callado o sin nadie charlando", async () => {
  const G = "apagado@g.us";
  grupo(G, { prendido: 0 });
  assert.equal(F.getChat(G).encargos, 0, "apagado si nadie lo pide");
  dados();
  assert.equal(await E.lanzarEncargo(client, G, new Date()), null);
  assert.equal(enviados().length, 0);

  F.updateChat(G, { encargos: 1, monedas: 0 });
  assert.equal(await E.lanzarEncargo(client, G, new Date()), null, "con la economía apagada");
  F.updateChat(G, { monedas: 1, grupoCerradoPorHorario: 1 });
  assert.equal(await E.lanzarEncargo(client, G, new Date()), null, "con el grupo cerrado por horario");
  F.updateChat(G, { grupoCerradoPorHorario: 0 });

  // The hours: from 10 to 20:59.
  E.ENCARGO.DESDE_HORA = 10;
  E.ENCARGO.HASTA_HORA = 21;
  const H = "horas@g.us";
  for (const hora of [9, 21, 23]) {
    grupo(H, { ahora: aLas(hora, 30) });
    assert.equal(await E.lanzarEncargo(client, H, aLas(hora, 30)), null, `a las ${hora}:30`);
  }

  const Q = "callado@g.us";
  F.initDataDB({ chat: Q, sender: ANA, senderJid: "", pushName: "Ana" });
  F.updateChat(Q, { encargos: 1 });
  Cache.guardar(client, Q, { subject: "Callados", participants: GENTE.map((id) => ({ id, phoneNumber: num(id) })) });
  F.registrarMensajeGrupo(Q, [ANA], aLas(15).getTime());
  assert.equal(await E.lanzarEncargo(client, Q, aLas(15)), null, "el grupo no está charlando");

  // Talking, but whoever wrote did it over ACTIVO_MIN minutes ago: nobody to hand it to.
  const V = "viejos@g.us";
  grupo(V, { ahora: aLas(15) });
  assert.equal(await E.lanzarEncargo(client, V, aLas(15, E.ENCARGO.ACTIVO_MIN + 1)), null, "nadie escribió hace poco");
  assert.equal(enviados().length, 0, "y no se mandó nada a ningún grupo");
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM encargos`).get().n, 0);
});

test("el encargo sale para alguien que está charlando, de SU oficio, etiquetado, con plazo, caminos y su mercado de apuestas", async () => {
  const G = "sale@g.us";
  const antes = Date.now();
  const e = await abierto(G);
  const encargo = SOBRE();
  assert.deepEqual([e.usuario, e.usuario_jid, e.clave, e.camino, e.estado], [ANA, num(ANA), `camionero/${encargo.id}`, 0, "abierto"]);
  assert.ok(e.vence >= antes + E.ENCARGO.PLAZO_MIN * MIN && e.vence <= Date.now() + E.ENCARGO.PLAZO_MIN * MIN);
  const anuncio = enviados()[0];
  assert.equal(anuncio.chat, G);
  assert.deepEqual(anuncio.msg.mentions, [ANA]);
  const texto = anuncio.msg.text;
  assert.ok(texto.startsWith(`🚨 *ENCARGO URGENTE* para @300000000000041 (camionero) — 🚛 ${encargo.titulo}\n\n${encargo.texto}\n\n1️⃣ ${encargo.caminos[0].nombre} — _${encargo.caminos[0].chance} % · paga ${encargo.caminos[0].premio}_\n2️⃣ `), texto);
  assert.match(texto, /Elegí camino con el número \(o \.ruta 2\); si no elegís, vas por el peor y con el premio más chico/);
  assert.match(texto, /\.apuesto si 50 o \.apuesto no 50 a que llega o no · \.ayudo 30 .* · \.saboteo 30/);
  assert.match(e.mensaje_id, /^MSG\d+$/);

  // Its bets are a market of two options that closes at the deadline, with no closing notice of its own.
  const mercado = F.getMercado(e.mercado);
  assert.deepEqual([mercado.chat, mercado.titulo, mercado.opciones, mercado.cierra_en, mercado.tipo, mercado.creado_por, mercado.estado], [G, `Encargo urgente: ${encargo.titulo}`, ["Sí llega", "No llega"], e.vence, "encargo", ANA, "abierto"]);
  const pendientes = db.prepare(`SELECT tipo, ejecutar_en, datos FROM pendientes WHERE chat = ? AND estado = 'pendiente'`).all(G);
  assert.deepEqual(pendientes.map((p) => [p.tipo, p.ejecutar_en, JSON.parse(p.datos)]), [["encargo_vence", e.vence, { id: e.id }]]);
  assert.deepEqual(db.prepare(`SELECT clave, veces FROM encargos_usos WHERE clave = ?`).all(e.clave), [{ clave: e.clave, veces: 1 }], "se anota que salió");

  // One at a time, and the day's cap.
  dados();
  assert.equal(await E.lanzarEncargo(client, G, new Date()), null, "con uno abierto no sale otro");
  assert.equal(enviados().length, 1);
});

test("sin oficio le toca uno general; con un oficio en femenino se lo dice así; y no le toca dos veces seguidas a la misma persona", async () => {
  const G = "general@g.us";
  const e = await abierto(G, { laburo: null });
  assert.equal(e.clave, `general/${B.ENCARGOS_GENERALES[0].id}`);
  assert.ok(enviados()[0].msg.text.startsWith(`🚨 *ENCARGO URGENTE* para @300000000000041 — 📦 ${B.ENCARGOS_GENERALES[0].titulo}\n\n`));

  // Over, and the next one: with the dice at 0 again it would be Ana's, but she just had one.
  E.vencerEncargo(e.id, e.vence + 1);
  oficio(G, BETO, "tambero");
  F.updateUser(BETO, { genero: "mujer" });
  dados();
  assert.ok(await E.lanzarEncargo(client, G, new Date()));
  const otro = E.encargoAbierto(G);
  assert.equal(otro.usuario, BETO);
  assert.equal(otro.clave, `tambero/${B.ENCARGOS.tambero[0].id}`);
  assert.match(ultimo().msg.text, /^🚨 \*ENCARGO URGENTE\* para @300000000000042 \(tambera\) — 🐄 /);

  // The day's cap: two went out today.
  E.vencerEncargo(otro.id, otro.vence + 1);
  dados();
  assert.equal(await E.lanzarEncargo(client, G, new Date()), null, `van ${E.ENCARGO.MAX_DIA} hoy`);
});

test("nadie recibe el mismo encargo dos veces hasta agotar los de su oficio, y recién ahí vuelven a salir", () => {
  const G = "agotar@g.us";
  grupo(G);
  oficio(G, ANA, "dj");
  const persona = { usuario: ANA, usuario_jid: num(ANA) };
  const claves = E.clavesDe("dj");
  const anotar = (clave) => db.prepare(`INSERT INTO encargos (chat, usuario, usuario_jid, clave, creada, vence, estado) VALUES (?, ?, ?, ?, 0, 0, 'cumplido')`).run(G, ANA, num(ANA), clave);
  const salieron = [];
  for (let i = 0; i < claves.length; i++) {
    // Always the last of the ones left: never one she's had.
    E._dep.azar = (n) => n - 1;
    const clave = E.sortearEncargo(G, persona);
    assert.ok(claves.includes(clave) && !salieron.includes(clave), `la ${i + 1}ª: ${clave}`);
    salieron.push(clave);
    anotar(clave);
  }
  assert.deepEqual([...salieron].sort(), [...claves].sort(), "le tocaron todos los de su oficio, una vez cada uno");
  // All had: they go around again, but not the one the group got last.
  dados();
  const otraVez = E.sortearEncargo(G, persona);
  assert.ok(claves.includes(otraVez) && otraVez !== salieron.at(-1));
  // Somebody else of the same trade starts from scratch, and whoever is known by their number counts as the same.
  oficio(G, BETO, "dj");
  dados();
  assert.equal(E.sortearEncargo(G, { usuario: BETO, usuario_jid: num(BETO) }), claves.find((c) => c !== salieron.at(-1)));
  E._dep.azar = (n) => n - 1;
  assert.ok(E.sortearEncargo(G, { usuario: num(ANA), usuario_jid: "" }).startsWith("general/"), "sin oficio bajo ese id, uno general");
});

test("el camino lo elige quien tiene el encargo, con .ruta o con el número suelto, una sola vez", async () => {
  const G = "ruta@g.us";
  const e = await abierto(G);
  const encargo = SOBRE();

  let r = await comando(G, BETO, "ruta 1");
  assert.match(r.msg.text, /^❌ El encargo es de @300000000000041: el camino lo elige quien lo tiene/);
  assert.match((await comando(G, ANA, "ruta 7")).msg.text, /^❌ Los caminos van del 1 al 3\./);
  assert.equal(E.encargoAbierto(G).camino, 0);

  // The bare number, from somebody else: not theirs, nothing happens.
  const antes = enviados().length;
  await Hook.before(msg(BETO, "2", G), { client, chat: F.getChat(G) });
  assert.equal(enviados().length, antes);
  // From Ana, quoting some other message: not an answer to the errand.
  await Hook.before(msg(ANA, "2", G, { quoted: { id: "OTRO" } }), { client, chat: F.getChat(G) });
  assert.equal(enviados().length, antes);
  // From Ana, plain: her way.
  const m = msg(ANA, "2", G);
  await Hook.before(m, { client, chat: F.getChat(G) });
  assert.equal(m.respuestaDeJuego, true);
  assert.equal(E.encargoAbierto(G).camino, 2);
  const c = encargo.caminos[1];
  assert.equal(ultimo().msg.text, `🚛 @300000000000041 va por el camino 2: *${c.nombre}* (${c.chance} % · paga ${c.premio}).\nSe sabe cómo le fue a las ${new Date(e.vence).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false })}. Hasta entonces: .apuesto si|no <cuánto>, .ayudo <cuánto> o .saboteo <cuánto>.`);

  r = await comando(G, ANA, "ruta 1");
  assert.match(r.msg.text, /^❌ Ya elegiste: vas por «.*»\. No hay marcha atrás/);
  assert.equal(E.encargoAbierto(G).camino, 2);
  // Chosen already: her next bare number is no longer the errand's.
  const otro = msg(ANA, "1", G);
  await Hook.before(otro, { client, chat: F.getChat(G) });
  assert.equal(otro.respuestaDeJuego, undefined);

  assert.equal((await comando("nada@g.us", ANA, "ruta 1")).msg.text, "No hay ningún encargo corriendo ahora. .encargos cuenta cómo van.");
});

test("el número suelto es de la escena de cobro si tiene una abierta, salvo que cite el encargo", async () => {
  const G = "escena@g.us";
  const e = await abierto(G);
  db.prepare(`INSERT INTO laburos_escenas (chat, usuario, escena, jornal, mensaje_id, vence) VALUES (?, ?, 'camionero/caminera', 30, 'ESC1', ?)`).run(G, ANA, Date.now() + 10 * MIN);
  await Hook.before(msg(ANA, "1", G), { client, chat: F.getChat(G) });
  assert.equal(E.encargoAbierto(G).camino, 0, "es de la escena");
  await Hook.before(msg(ANA, "1", G, { quoted: { id: e.mensaje_id } }), { client, chat: F.getChat(G) });
  assert.equal(E.encargoAbierto(G).camino, 1, "citando el encargo, es del encargo");
});

test("ayudar y sabotear: se paga al poner, cada 10 mueven un punto, un bando por persona, con tope por persona y por bando", async () => {
  const G = "aportes@g.us";
  await abierto(G);
  const { APORTE_MAX, APORTE_TOPE, APORTE_PASO } = E.ENCARGO;
  for (const quien of GENTE) fijarSaldo(F, G, quien, 500);

  assert.match((await comando(G, ANA, "ayudo 30")).msg.text, /^❌ El encargo es tuyo: la mano te la tienen que dar los demás/);
  assert.match((await comando(G, ANA, "saboteo 30")).msg.text, /^❌ ¿Sabotearte a vos\?/);
  assert.match((await comando(G, BETO, "ayudo 5")).msg.text, /^❌ Se pone de a 10 UruCoins o más/);
  assert.match((await comando(G, BETO, "ayudo")).msg.text, /^Decime cuánto ponés: \.ayudo 30/);

  let r = await comando(G, BETO, "ayudo 35");
  assert.equal(saldo(G, BETO), 465, "se descuenta al poner");
  assert.equal(r.msg.text, "🤝 @300000000000042 puso *35 UruCoins* para darle una mano a @300000000000041. Entre todos le suben 3 puntos la chance.\n_Si llega, recupera lo suyo y un 25 % más; si no, lo pierde._");
  assert.deepEqual(r.msg.mentions, [BETO, ANA]);
  assert.match((await comando(G, BETO, "saboteo 20")).msg.text, /^❌ Ya le diste una mano en este encargo/);

  // With a way chosen, it says where the chance stands.
  await comando(G, ANA, "ruta 2");
  const base = SOBRE().caminos[1].chance;
  r = await comando(G, CARLA, "saboteo 20");
  assert.equal(r.msg.text, `🐀 @300000000000043 puso *20 UruCoins* para complicarle el encargo a @300000000000041. Entre todos le bajan 2 puntos la chance. Va en ${base + 3 - 2} %.\n_A la hora se sortea si se descubre: 40 % de que sí, y entonces paga 20 de multa, que van para @300000000000041._`);
  assert.match((await comando(G, CARLA, "ayudo 20")).msg.text, /^❌ Ya lo estás saboteando/);

  // The cap per person: of 200 more, only what's left up to 100 goes in.
  r = await comando(G, BETO, "ayudo 200");
  assert.equal(saldo(G, BETO), 500 - APORTE_MAX);
  assert.match(r.msg.text, /puso \*65 UruCoins\* .*, y ya lleva 100 \(de los 200, entraron 65: hasta ahí llega el tope\)\. Entre todos le suben 10 puntos/);
  assert.match((await comando(G, BETO, "ayudo 10")).msg.text, /^❌ Ya pusiste 100 UruCoins en este encargo/);

  // The cap per side: 25 points, that is 250 coins among everybody.
  await comando(G, DANI, "ayudo 100");
  const EVA = "300000000000045@lid";
  F.initDataDB({ chat: G, sender: EVA, senderJid: num(EVA), pushName: "Eva" });
  fijarSaldo(F, G, EVA, 500);
  r = await comando(G, EVA, "ayudo 100");
  assert.equal(saldo(G, EVA), 500 - (APORTE_TOPE * APORTE_PASO - 200), "entran los 50 que faltan para el tope");
  assert.match(r.msg.text, new RegExp(`Entre todos le suben ${APORTE_TOPE} puntos la chance\\. Va en ${Math.min(E.ENCARGO.CHANCE_MAX, base + APORTE_TOPE - 2)} %`));
  const FITO = "300000000000046@lid";
  F.initDataDB({ chat: G, sender: FITO, senderJid: num(FITO), pushName: "Fito" });
  fijarSaldo(F, G, FITO, 500);
  assert.match((await comando(G, FITO, "ayudo 50")).msg.text, /^❌ Ya no entra más ayuda/);
  assert.equal(saldo(G, FITO), 500);

  // Without the coins, nothing is taken.
  fijarSaldo(F, G, FITO, 5);
  assert.equal((await comando(G, FITO, "saboteo 30")).msg.text, "❌ No te alcanza: tenés 5 UruCoins.");
  assert.equal((await comando("nada2@g.us", BETO, "ayudo 30")).msg.text, "❌ No hay ningún encargo corriendo ahora.");
});

test("las apuestas: .apuesto si|no en el mercado del encargo; quien lo tiene no apuesta, ni con .apostar; y un admin no carga el resultado a mano", async () => {
  const G = "apuestas@g.us";
  const e = await abierto(G);
  for (const quien of GENTE) fijarSaldo(F, G, quien, 300);

  assert.match((await comando(G, BETO, "apuesto")).msg.text, /^Se apuesta así: \.apuesto si 50/);
  assert.match((await comando(G, BETO, "apuesto capaz 50")).msg.text, /^Se apuesta así/);
  let r = await comando(G, BETO, "apuesto si 50");
  assert.match(r.msg.text, /^✅ Apostaste \*50 UruCoins\* a \*Sí llega\*\.\nEncargo urgente: /);
  assert.equal(saldo(G, BETO), 250);
  r = await comando(G, CARLA, "apuesto NO 30");
  assert.match(r.msg.text, /^✅ Apostaste \*30 UruCoins\* a \*No llega\*/);
  assert.match((await comando(G, BETO, "apuesto no 10")).msg.text, /^❌ Ya le jugaste a "Sí llega"/);
  assert.deepEqual(F.apuestasDeMercado(e.mercado).map((a) => [a.usuario, a.opcion, a.cantidad]), [[BETO, 0, 50], [CARLA, 1, 30]]);

  assert.equal((await comando(G, ANA, "apuesto si 50")).msg.text, "❌ El encargo es tuyo: a tu propia suerte no se le apuesta.");
  assert.equal(M.jugar(G, ANA, e.mercado, "No llega", 50).error, "El encargo es tuyo: a tu propia suerte no se le apuesta.", "tampoco por .apostar");
  assert.equal(saldo(G, ANA), 300);
  // .apostar works for the rest, as with any market.
  assert.equal(M.jugar(G, DANI, e.mercado, "no", 20).ok, true);

  // The outcome is the bot's to roll: an admin can void the market, not resolve it.
  db.prepare(`UPDATE mercados SET cierra_en = ? WHERE id = ?`).run(Date.now() - 1000, e.mercado);
  assert.match(M.resolver(G, "admin@lid", e.mercado, "Sí llega").error, /es de un encargo urgente: lo resuelvo yo cuando se cumpla el plazo/);
  assert.equal(F.getMercado(e.mercado).estado, "abierto");
  assert.equal((await comando("nada3@g.us", BETO, "apuesto si 50")).msg.text, "❌ No hay ningún encargo corriendo ahora: no hay a qué apostarle.");
});

test("con el casino apagado el encargo sale igual, sin apuestas", async () => {
  const G = "sincasino@g.us";
  grupo(G);
  F.updateChat(G, { casino: 0 });
  oficio(G, ANA, "camionero");
  dados();
  assert.ok(await E.lanzarEncargo(client, G, new Date()));
  const e = E.encargoAbierto(G);
  assert.equal(e.mercado, 0);
  assert.doesNotMatch(enviados()[0].msg.text, /apuesto/);
  fijarSaldo(F, G, BETO, 100);
  assert.equal(E.apostarAlEncargo(G, [BETO], true, 50).error, "En este encargo no hay apuestas: salió con el casino apagado.");
  dados(0);
  const r = E.vencerEncargo(e.id, e.vence + 1);
  assert.doesNotMatch(r.texto, /Mercado/);
});

test("al vencer, si sale bien: cobra el premio, los que ayudaron recuperan con propina, al saboteador descubierto le toca multa y las apuestas se reparten", async () => {
  const G = "bien@g.us";
  const e = await abierto(G);
  const encargo = SOBRE();
  for (const quien of GENTE) fijarSaldo(F, G, quien, 300);
  await comando(G, ANA, "ruta 2");
  const camino = encargo.caminos[1];
  await comando(G, BETO, "ayudo 40");
  await comando(G, CARLA, "saboteo 20");
  await comando(G, DANI, "saboteo 10");
  await comando(G, BETO, "apuesto si 60");
  await comando(G, CARLA, "apuesto no 30");
  assert.deepEqual([saldo(G, ANA), saldo(G, BETO), saldo(G, CARLA), saldo(G, DANI)], [300, 200, 250, 290]);

  assert.equal(E.vencerEncargo(e.id, e.vence - 1), null, "antes de hora, nada");
  const chance = camino.chance + 4 - 3;
  // The dice: the outcome right under the chance (it goes well), Carla caught (under 40), Dani not.
  dados(chance - 1, 39, 40);
  const r = E.vencerEncargo(e.id, e.vence + 1);
  assert.deepEqual([r.salioBien, r.chance, r.premio, r.pescados], [true, chance, camino.premio, [CARLA]]);
  const fin = E.encargoAbierto(G);
  assert.equal(fin, null);
  assert.deepEqual(db.prepare(`SELECT estado, chance, premio FROM encargos WHERE id = ?`).get(e.id), { estado: "cumplido", chance, premio: camino.premio });

  // Ana: the prize and Carla's fine. Beto: his 40 back and 25 % more, and the whole pot of the bets (90). Carla: her
  // sabotage, the fine (20 again) and her bet. Dani: only what he put in.
  assert.deepEqual([saldo(G, ANA), saldo(G, BETO), saldo(G, CARLA), saldo(G, DANI)], [300 + camino.premio + 20, 200 + 50 + 90, 250 - 20, 290]);
  assert.equal(
    r.texto,
    [
      `⏰ *Se cumplió el plazo del encargo de @300000000000041* — 🚛 ${encargo.titulo}`,
      `Fue por el camino 2: *${camino.nombre}*.`,
      `🎲 Chance de que saliera bien: *${chance} %* (${camino.chance} del camino, +4 de ayuda, −3 de sabotaje).`,
      "",
      `✅ ${camino.bien}`,
      "",
      `🪙 @300000000000041 cobra *${camino.premio} UruCoins*.`,
      "🤝 Ayudó @300000000000042 (40): recupera lo suyo y un 25 % más.",
      "🐀 Sabotearon @300000000000043 (20) y @300000000000044 (10). Se descubrió a @300000000000043: @300000000000043 paga 20 de multa, y va para @300000000000041.",
      "",
      `📊 *Mercado #${e.mercado} resuelto: Encargo urgente: ${encargo.titulo}*\nGanó: *Sí llega* · Pozo: 90 UruCoins\n🏆 @300000000000042 apostó 60 y cobra *90*\n💸 1 apuesta perdida (30 UruCoins)`,
    ].join("\n"),
  );
  assert.deepEqual([...r.mentions].sort(), [ANA, BETO, CARLA, DANI].sort());
  assert.equal(F.getMercado(e.mercado).estado, "resuelto");
  assert.equal(E.vencerEncargo(e.id, e.vence + 1), null, "una sola vez");
});

test("al vencer sin camino elegido va por el peor y con el premio más chico; si sale mal no cobra y la ayuda se pierde", async () => {
  const G = "mal@g.us";
  const e = await abierto(G);
  const encargo = SOBRE();
  const peor = E.peorCamino(encargo);
  const premioChico = Math.min(...encargo.caminos.map((c) => c.premio));
  assert.ok(peor.premio > premioChico, "el peor camino paga más, pero sin elegir se cobra el más chico");
  for (const quien of GENTE) fijarSaldo(F, G, quien, 300);
  await comando(G, BETO, "ayudo 30");
  await comando(G, CARLA, "apuesto no 50");

  // It goes well, by the worst way: the smallest prize.
  dados(0);
  const r = E.vencerEncargo(e.id, e.vence + 1);
  assert.deepEqual([r.salioBien, r.chance, r.premio], [true, peor.chance + 3, premioChico]);
  assert.match(r.texto, new RegExp(`\\nNo eligió camino a tiempo, así que fue por el peor: \\*${peor.nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\*, y con el premio más chico\\.\\n`));
  assert.equal(saldo(G, ANA), 300 + premioChico);
  // Nobody bet on the winning side: the market refunds.
  assert.match(r.texto, /Nadie le había jugado a esa opción: se devuelve lo apostado a todos\./);
  assert.equal(saldo(G, CARLA), 300);

  // Another one, that goes wrong: the dice right at the chance.
  const G2 = "mal2@g.us";
  const e2 = await abierto(G2);
  for (const quien of GENTE) fijarSaldo(F, G2, quien, 300);
  await comando(G2, ANA, "ruta 1");
  await comando(G2, BETO, "ayudo 30");
  await comando(G2, CARLA, "saboteo 30");
  await comando(G2, DANI, "apuesto no 40");
  // Ana had the first one of her trade already: this is the next.
  assert.notEqual(e2.clave, e.clave);
  const c = E.buscarEncargo(e2.clave).caminos[0];
  dados(c.chance, 99);
  const r2 = E.vencerEncargo(e2.id, e2.vence + 1);
  assert.deepEqual([r2.salioBien, r2.chance, r2.premio, r2.pescados], [false, c.chance, 0, []]);
  assert.deepEqual([saldo(G2, ANA), saldo(G2, BETO), saldo(G2, CARLA), saldo(G2, DANI)], [300, 270, 270, 300], "nadie cobra; el que apostó solo recupera lo suyo");
  assert.ok(r2.texto.includes(`\n❌ ${c.mal}\n\n🪙 @300000000000041 no cobra nada.\n🤝 Ayudó @300000000000042 (30): lo que puso se fue con el encargo.\n🐀 Saboteó @300000000000043 (30). No hubo cómo probarle nada a nadie.`), r2.texto);
  assert.match(r2.texto, /🎲 Chance de que saliera bien: \*\d+ %\* \(\d+ del camino, \+3 de ayuda, −3 de sabotaje\)\./);
  assert.equal(db.prepare(`SELECT estado FROM encargos WHERE id = ?`).get(e2.id).estado, "fallido");
});

test("por el trabajo pendiente: a la hora agendada sale, y al cumplirse el plazo se resuelve y se le cuenta al grupo", async () => {
  const P = await import("../lib/pendientes.js");
  const G = "pendiente@g.us";
  grupo(G);
  oficio(G, ANA, "camionero");
  F.crearPendiente(G, "bot", "encargo_urgente", {}, Date.now() - 1000);
  dados();
  await P.procesarPendientes(client);
  const e = E.encargoAbierto(G);
  assert.ok(e, "salió");
  assert.match(ultimo().msg.text, /^🚨 \*ENCARGO URGENTE\* para @300000000000041 \(camionero\)/);

  db.prepare(`UPDATE encargos SET vence = ? WHERE id = ?`).run(Date.now() - 1000, e.id);
  db.prepare(`UPDATE pendientes SET ejecutar_en = ? WHERE chat = ? AND tipo = 'encargo_vence'`).run(Date.now() - 1000, G);
  dados(0);
  await P.procesarPendientes(client);
  assert.equal(ultimo().chat, G);
  assert.match(ultimo().msg.text, /^⏰ \*Se cumplió el plazo del encargo de @300000000000041\* — 🚛 /);
  assert.deepEqual(ultimo().msg.mentions, [ANA]);
  assert.equal(E.encargoAbierto(G), null);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE chat = ? AND estado = 'pendiente'`).get(G).n, 0);
});

test("la multa es lo que tenga, si es menos; y la chance no pasa de 95 ni baja de 5", async () => {
  const G = "topes@g.us";
  const e = await abierto(G);
  fijarSaldo(F, G, BETO, 35);
  await comando(G, ANA, "ruta 2");
  await comando(G, BETO, "saboteo 30");
  dados(99, 0);
  const r = E.vencerEncargo(e.id, e.vence + 1);
  assert.match(r.texto, /Se descubrió a @300000000000042: @300000000000042 paga 5 de multa, y va para @300000000000041\./);
  assert.deepEqual([saldo(G, BETO), saldo(G, ANA)], [0, 5]);

  const G2 = "topes2@g.us";
  const e2 = await abierto(G2);
  const segura = SOBRE().caminos.reduce((a, b) => (b.chance > a.chance ? b : a));
  await comando(G2, ANA, `ruta ${SOBRE().caminos.indexOf(segura) + 1}`);
  for (const quien of [BETO, CARLA, DANI]) {
    fijarSaldo(F, G2, quien, 100);
    await comando(G2, quien, "ayudo 100");
  }
  dados(E.ENCARGO.CHANCE_MAX);
  const r2 = E.vencerEncargo(e2.id, e2.vence + 1);
  assert.deepEqual([r2.chance, r2.salioBien], [E.ENCARGO.CHANCE_MAX, false], "ni con toda la ayuda es seguro");
});

test(".encargos: el estado y las reglas; on y off son de admins, y al apagar se anula el que corre y vuelve todo", async () => {
  const G = "switch@g.us";
  grupo(G, { prendido: 0 });
  let r = await comando(G, BETO, "encargos");
  assert.match(r.msg.text, /^🚨 Ahora no hay ningún encargo corriendo\.\n\nLos encargos urgentes están \*apagados\*\. Un admin los prende con \.encargos on \(hasta 2 por día, de 0 a 24 y solo si el grupo está charlando\)\.\n\nCómo va: /);
  await comando(G, BETO, "encargos on");
  assert.equal(F.getChat(G).encargos, 0, "no es admin");
  r = await comando(G, BETO, "encargos on", { isAdmin: true });
  assert.equal(F.getChat(G).encargos, 1);
  assert.match(r.msg.text, /^🚨 Encargos urgentes \*prendidos\*/);

  oficio(G, ANA, "camionero");
  dados();
  assert.ok(await E.lanzarEncargo(client, G, new Date()));
  const e = E.encargoAbierto(G);
  for (const quien of GENTE) fijarSaldo(F, G, quien, 200);
  await comando(G, BETO, "ayudo 30");
  await comando(G, CARLA, "saboteo 20");
  await comando(G, DANI, "apuesto si 40");
  r = await comando(G, DANI, "encargo");
  assert.match(r.msg.text, /^🚨 \*Encargo corriendo\*, el de @300000000000041: 🚛 .*\nTodavía no eligió camino:\n1️⃣ .*\n2️⃣ .*\n3️⃣ .*\n🤝 Ayudan @300000000000042 \(30\): \+3\.\n🐀 Sabotean @300000000000043 \(20\): −2\.\n📊 Apostado: 40 a que llega y 0 a que no\.\n\nLos encargos urgentes están \*prendidos\*/);

  await comando(G, BETO, "encargos off", { isAdmin: true });
  assert.equal(F.getChat(G).encargos, 0);
  assert.equal(E.encargoAbierto(G), null);
  assert.deepEqual([saldo(G, BETO), saldo(G, CARLA), saldo(G, DANI)], [200, 200, 200], "vuelve lo puesto y lo apostado");
  assert.equal(F.getMercado(e.mercado).estado, "anulado");
  assert.match(ultimo().msg.text, /^🚫 El encargo urgente de @300000000000041 quedó sin efecto\. Se apagaron los encargos en el grupo\.\nA @300000000000042 y @300000000000043 les vuelve lo que pusieron\.\n📊 \*Mercado #\d+ anulado/);
  assert.equal(E.vencerEncargo(e.id, e.vence + 1), null, "a la hora ya no hay nada que resolver");
});

test("se agendan una vez por día, a lo sumo MAX_DIA, dentro del horario y solo donde se charló ayer", () => {
  E.ENCARGO.DESDE_HORA = 10;
  E.ENCARGO.HASTA_HORA = 21;
  const G = "agenda@g.us";
  const SIN = "agenda-callado@g.us";
  const OFF = "agenda-off@g.us";
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  for (const chat of [G, SIN, OFF]) {
    F.initDataDB({ chat, sender: ANA, senderJid: "", pushName: "Ana" });
    F.updateChat(chat, { encargos: chat === OFF ? 0 : 1 });
    if (chat !== SIN) db.prepare(`INSERT INTO actividad_diaria (chat, usuario, fecha, mensajes) VALUES (?, ?, ?, ?)`).run(chat, ANA, A.claveDia(ayer), E.ENCARGO.MENSAJES_AYER);
  }
  const pendientes = (chat) => db.prepare(`SELECT ejecutar_en FROM pendientes WHERE chat = ? AND tipo = 'encargo_urgente'`).all(chat).map((p) => p.ejecutar_en);
  const azar = Math.random;
  Math.random = () => 0.5;
  try {
    assert.equal(E.programarEncargosDelDia(aLas(9)), 0, "antes de hora no se agenda");
    assert.equal(pendientes(G).length, 0);
    // Other tests' groups have the switch on too: only these three are looked at.
    E.programarEncargosDelDia(aLas(10, 5));
    const horas = pendientes(G);
    assert.equal(horas.length, E.ENCARGO.MAX_DIA);
    for (const h of horas) assert.ok(h >= aLas(10, 5).getTime() && h < aLas(21).getTime());
    assert.ok(horas[0] < aLas(15, 30).getTime() && horas[1] >= aLas(15, 30).getTime(), "uno en cada tramo del día");
    assert.equal(pendientes(SIN).length, 0, "ayer no se charló");
    assert.equal(pendientes(OFF).length, 0, "apagado");
    E.programarEncargosDelDia(aLas(12));
    assert.equal(pendientes(G).length, E.ENCARGO.MAX_DIA, "una sola vez por día");
  } finally {
    Math.random = azar;
  }
});

test("el recordatorio mensual al owner: cuántos van usados y los más repetidos, una vez por mes y colgado del backup", async () => {
  const Bk = await import("../lib/backup.js");
  db.prepare(`DELETE FROM encargos_usos`).run();
  assert.equal(E.recordatorioDeEncargos(new Date(2027, 0, 10)).texto, "", "si nunca salió ninguno, no hay nada que recordar");
  const usar = (clave, veces, ultima) => db.prepare(`INSERT INTO encargos_usos (clave, veces, ultima) VALUES (?, ?, ?)`).run(clave, veces, ultima);
  usar("camionero/sobre-a-rivera", 5, 10);
  usar("general/mate-para-la-suegra", 3, 20);
  usar("dj/equipo-quemado", 3, 30);
  usar("tambero/tanque-sin-luz", 1, 40);
  usar("camionero/uno-que-ya-no-esta", 9, 50);
  const total = E.todasLasClaves().length;
  assert.deepEqual(E.usoDelBanco(), { usados: 4, total, repetidos: [{ clave: "camionero/sobre-a-rivera", veces: 5 }, { clave: "dj/equipo-quemado", veces: 3 }, { clave: "general/mate-para-la-suegra", veces: 3 }] });

  const enero = E.recordatorioDeEncargos(new Date(2027, 0, 10));
  assert.equal(enero.texto, `📝 Acordate de renovar los encargos: van 4 usados de ${total}, los más repetidos son «El sobre a Rivera» (camionero, 5 veces), «El casamiento sin sonido» (dj, 3 veces) y «El mate de la suegra» (general, 3 veces). Están en lib/encargos-banco.js.`);
  // Not marked until the backup went out: asked again, it's still due.
  assert.equal(E.recordatorioDeEncargos(new Date(2027, 0, 11)).texto, enero.texto);
  enero.enviado();
  assert.equal(E.recordatorioDeEncargos(new Date(2027, 0, 25)).texto, "", "una vez por mes");
  assert.notEqual(E.recordatorioDeEncargos(new Date(2027, 1, 1)).texto, "", "al mes siguiente, de nuevo");

  // It goes under the backup's own caption, in the same message.
  const archivo = "backup-de-prueba.db";
  fs.writeFileSync(archivo, "x");
  const mandados = [];
  conexion.client.sendFile = async (...args) => mandados.push(args);
  assert.equal(await Bk.enviarBackupAlOwner(archivo, enero.texto), true);
  assert.equal(mandados.length, 1, "un solo mensaje");
  assert.match(mandados[0][3], /^🗄️ Backup de la base de Claudia \(.*\)\. Guardalo en algún lado por las dudas\.\n\n📝 Acordate de renovar los encargos: van 4 usados de /);
  await Bk.enviarBackupAlOwner(archivo);
  assert.match(mandados[1][3], /por las dudas\.$/, "sin recordatorio, el aviso de siempre");
  assert.match(fs.readFileSync(new URL("../lib/backup.js", import.meta.url), "utf8"), /const recordatorio = recordatorioDeEncargos\(\);\n\s+if \(await enviarBackupAlOwner\(destino, recordatorio\.texto\)\) \{\n\s+marcarPeriodoCerrado\("backup", "semanal", semana\);\n\s+recordatorio\.enviado\(\);/);
});

test("lo que mueve plata está clasificado: ni timba ni 'Otros'", async () => {
  const T = await import("../lib/timba.js");
  for (const motivo of ["encargo_premio", "encargo_ayuda", "encargo_ayuda_vuelta", "encargo_sabotaje", "encargo_multa", "encargo_multa_cobrada", "encargo_devolucion"]) assert.ok(T.FUERA_DE_TIMBA.exactos.includes(motivo), motivo);
  const fuente = fs.readFileSync(new URL("../lib/encargos.js", import.meta.url), "utf8");
  for (const [, motivo] of fuente.matchAll(/"(encargo_[a-z_]+)"/g)) if (!["encargo_urgente", "encargo_vence"].includes(motivo)) assert.ok(T.FUERA_DE_TIMBA.exactos.includes(motivo), motivo);
});
