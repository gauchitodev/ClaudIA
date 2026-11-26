import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// The welcome to the world when a group becomes a town, once per group (lib/novedades.js, plugins/pueblo.js), and the
// news of a big update, once to each town that was already born.
let F, N, P, A, M, Plugin, client;
const ANA = "300000000000091@lid";
const QUINCE = new Date(2026, 10, 25, 15, 0, 0);

before(async () => {
  ({ F } = await prepararBase("novedades"));
  N = await import("../lib/novedades.js");
  P = await import("../lib/pueblo.js");
  A = await import("../lib/actividad.js");
  M = await import("../lib/mundo.js");
  Plugin = (await import("../plugins/pueblo.js")).default;
});
beforeEach(() => {
  client = clienteFalso();
  conexion.client = client;
});

const textos = () => globalThis.enviados.map((e) => e.msg?.text || "");
function grupo(chat, { mensajes = 10, ahora = QUINCE } = {}) {
  F.initDataDB({ chat, sender: ANA, senderJid: "", pushName: "Ana" });
  for (let i = 0; i < mensajes; i++) F.sumarMensajeHora(chat, A.claveDia(ahora), ahora.getHours());
}
async function comando(chat, texto) {
  const [command, ...args] = texto.split(/\s+/);
  await Plugin.run({ chat, sender: ANA, senderJid: "", text: `.${texto}`, isGroup: true, message: {} }, { client, command, args, isAdmin: true, isOwner: false });
}

test("bienvenida: al nacer el pueblo, tres mensajes cortos; una sola vez por grupo", async () => {
  const chat = "bienvenida@g.us";
  grupo(chat);
  await comando(chat, "pueblo on");
  const [uno, dos, tres, ...mas] = textos();
  const p = P.estadoDe(chat);
  assert.equal(mas.length, 0);
  assert.match(uno, new RegExp(`^🌎 \\*¡Bienvenidos a ${M.MUNDO.NOMBRE}!\\* Acaba de nacer \\*${p.nombre}\\*, fundado allá por ${p.anio}`));
  assert.match(uno, new RegExp(p.lugar.plaza));
  assert.match(dos, /^🧭 \*Cómo se juega\*/);
  for (const cosa of [/oficio/, /nivel/, /empresa/, new RegExp(M.MUNDO.BANCO), /tasa/, /presta/, /Encargos urgentes, 🕵️ misiones secretas y 🧰 changas \(un admin las prende: \.encargos on · \.espias on · \.changas on\)/, /misiones secretas/, new RegExp(`El Eco de ${p.nombre}`)]) assert.match(dos, cosa);
  for (const cmd of [".laburo", ".pueblo", ".banco", ".menu juegos"]) assert.ok(tres.includes(cmd), cmd);
  assert.match(tres, new RegExp(`¡Bienvenidos a ${p.nombre}!`));
  for (const t of [uno, dos, tres]) assert.ok(t.length < 600, `corto: ${t.length}`);
  // The news there is counts as told: it doesn't come again.
  assert.deepEqual(N.novedadesPendientes(chat), []);
  assert.equal(await N.chequearNovedades(client, QUINCE), 0);
  // Off and on again: no second welcome.
  await comando(chat, "pueblo off");
  globalThis.enviados = [];
  await comando(chat, "pueblo on");
  assert.equal(textos().length, 1);
  assert.match(textos()[0], /se despertó/);
});

test("bienvenida: lo prendido se dice prendido, y el nombre del mundo sale de la constante", async () => {
  const chat = "prendido@g.us";
  grupo(chat);
  F.updateChat(chat, { encargos: 1 });
  const antes = M.MUNDO.NOMBRE;
  M.MUNDO.NOMBRE = "Mundo Tranquera";
  try {
    await comando(chat, "pueblo on");
  } finally {
    M.MUNDO.NOMBRE = antes;
  }
  assert.match(textos()[0], /Bienvenidos a Mundo Tranquera!/);
  assert.match(textos()[1], /\(un admin las prende: \.espias on · \.changas on\)/);
});

test("novedades: un pueblo que ya existía las recibe una vez, de día y con el grupo charlando", async () => {
  const chat = "viejo@g.us";
  grupo(chat, { mensajes: 0 });
  // Born before the welcome existed.
  P.nacer(chat);
  F.updateChat(chat, { pueblo: 1 });
  assert.equal(N.novedadesPendientes(chat).length, N.ACTUALIZACIONES.length);
  // A quiet group, or at night: nothing.
  assert.equal(await N.chequearNovedades(client, QUINCE), 0);
  for (let i = 0; i < 10; i++) F.sumarMensajeHora(chat, A.claveDia(QUINCE), QUINCE.getHours());
  assert.equal(await N.chequearNovedades(client, new Date(2026, 10, 25, 23, 0, 0)), 0);
  assert.equal(textos().length, 0);
  // Talking, in the daytime: the news, once.
  assert.equal(await N.chequearNovedades(client, QUINCE), 1);
  const [aviso] = textos();
  assert.match(aviso, new RegExp(`^🆕 \\*Novedades en ${P.estadoDe(chat).nombre}\\*: abrió sucursal el \\*${M.MUNDO.BANCO}\\*`));
  for (const cmd of [".plazofijo 500 90", ".prestamo", ".prestar @persona 200 10 14", ".banco"]) assert.ok(aviso.includes(cmd), cmd);
  assert.equal(await N.chequearNovedades(client, QUINCE), 0);
  assert.equal(textos().length, 1);
  // Told the news, it isn't welcomed either when it's switched off and on.
  await comando(chat, "pueblo off");
  globalThis.enviados = [];
  await comando(chat, "pueblo on");
  assert.match(textos()[0], /se despertó/);
  // A town that's off doesn't get them.
  const otro = "dormido@g.us";
  grupo(otro);
  P.nacer(otro);
  assert.equal(await N.chequearNovedades(client, QUINCE), 0);
});

test("la bienvenida va al ritmo de quien tipea: espera antes de cada mensaje", async () => {
  const chat = "ritmo@g.us";
  grupo(chat);
  P.nacer(chat);
  F.updateChat(chat, { pueblo: 1 });
  const pausas = (await import("../lib/pausas.js"))._dep;
  const antes = pausas.esperar;
  const esperas = [];
  pausas.esperar = async (ms) => esperas.push(ms);
  try {
    assert.equal(await N.darBienvenida(client, chat), true);
  } finally {
    pausas.esperar = antes;
  }
  assert.equal(esperas.length, 3);
  assert.ok(esperas.every((ms) => ms >= 1800));
  assert.equal(await N.darBienvenida(client, chat), false, "una sola vez");
});
