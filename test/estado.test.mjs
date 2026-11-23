import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

let P;
before(async () => {
  await prepararBase("estado");
  P = (await import("../plugins/estado.js")).default;
});

test(".estado muestra lo que guarda client.chats al lado de la memoria", async () => {
  // client.chats has no ceiling but a restart; this line is how to tell, on the tablet, whether it needs one.
  const client = conexion.client;
  client.groupFetchAllParticipating = async () => ({ "g1@g.us": { id: "g1@g.us", subject: "Uno", participants: [] } });
  client.chats = {
    "g1@g.us": { id: "g1@g.us", messages: { A: {}, B: {}, C: {} } },
    "g2@g.us": { id: "g2@g.us" },
    "111@lid": { id: "111@lid", name: "Ana" }, // someone who wrote in a group
    "222@lid": { id: "222@lid", messages: { Q: {} } }, // someone quoted: their quoted messages are kept too
    "59899111222@s.whatsapp.net": { id: "59899111222@s.whatsapp.net", messages: { P: {}, R: {} } }, // a private chat
  };

  await P.run({ chat: "x@g.us", sender: "a@lid" }, { client });
  const texto = ultimoEnviado().msg.text;
  assert.match(texto, /\n🗃️ En memoria: 5 chats y contactos \(2 grupos\) · 6 mensajes\n💾 Memoria: \d/);
  assert.match(texto, /👥 Grupos: 1 · usuarios: \d+/, "el resto del estado sigue saliendo");
});

test(".estado dice qué modelo de Gemini está en pausa por cuota y cuánto le falta", async () => {
  const { MODELOS, geminiEnPausa } = await import("../lib/gemini.js");
  const client = conexion.client;
  client.groupFetchAllParticipating = async () => ({});
  geminiEnPausa.set(MODELOS[0], { hasta: Date.now() + 90 * 1000, seguidos: 2 });
  try {
    await P.run({ chat: "x@g.us", sender: "a@lid" }, { client });
    assert.match(ultimoEnviado().msg.text, new RegExp(`\\n🧠 IA: .+ · en pausa por cuota: ${MODELOS[0].replaceAll(".", "\\.")} \\(vuelve en 1 min\\)\\n`));
  } finally {
    geminiEnPausa.clear();
  }
});

test(".estado dice con qué zona horaria anda el bot", async () => {
  const client = conexion.client;
  client.groupFetchAllParticipating = async () => ({});
  await P.run({ chat: "x@g.us", sender: "a@lid" }, { client });
  const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
  assert.match(ultimoEnviado().msg.text.split("\n")[0], new RegExp(` · Node v[\\d.]+ · ${zona.replaceAll("/", "\\/").replaceAll("+", "\\+")}$`));
});

// The queue is lib/cola-descargas.js's, and .estado reads it from there.
test(".estado dice cuántas descargas hay en curso y en cola", async () => {
  const { colaDescargas } = await import("../lib/cola-descargas.js");
  const client = conexion.client;
  client.groupFetchAllParticipating = async () => ({});
  colaDescargas.procesando = true;
  colaDescargas.tareas.push(async () => {}, async () => {});
  try {
    await P.run({ chat: "x@g.us", sender: "a@lid" }, { client });
    assert.match(ultimoEnviado().msg.text, /1 en curso, 2 en cola/);
  } finally {
    colaDescargas.procesando = false;
    colaDescargas.tareas.length = 0;
  }
});

// How many plugins are loaded, as lib/plugins-cargados.js has them: the ones of the folder, or fewer if some file
// doesn't load.
test(".estado cuenta los plugins cargados", async (t) => {
  const { cargados } = await import("../lib/plugins-cargados.js");
  const antes = cargados.plugins;
  t.after(() => (cargados.plugins = antes));
  cargados.plugins = { uno: { cmd: ["uno"] }, dos: { cmd: ["dos"] }, tres: { cmd: ["tres"] } };
  const client = conexion.client;
  client.groupFetchAllParticipating = async () => ({});
  await P.run({ chat: "x@g.us", sender: "a@lid" }, { client });
  assert.match(ultimoEnviado().msg.text, / · plugins: 3\n/);
});

// How many of the bot's messages someone asked for again when Baileys no longer had them (lib/reenvios.js), why they
// were missing, and what asked for them: the lines that are there to tell whether keeping what the bot sends is worth
// it, what to keep, and what handing it over would set off.
test(".estado dice cuántos reenvíos no pudo hacer, hoy y en 7 días, por qué faltaban, qué los pidió, y desde cuándo cuenta mientras no pasó la semana", async () => {
  const R = await import("../lib/reenvios.js");
  const { db } = await import("../database-functions.js");
  const client = conexion.client;
  client.groupFetchAllParticipating = async () => ({});
  const estado = async () => {
    await P.run({ chat: "x@g.us", sender: "a@lid" }, { client });
    return ultimoEnviado().msg.text;
  };
  const pedir = (id, quien) => R.mensajeParaReenviar({ remoteJid: "g1@g.us", id, fromMe: true, participant: quien });
  const hoy = new Date();
  const desdeHoy = ` \\(cuento desde el ${hoy.getDate()}/${hoy.getMonth() + 1}\\)`;
  assert.match(await estado(), new RegExp(`\\n🗂️ Caché de grupos: .+\\n📨 Reenvíos que no pude hacer: hoy 0 · 7 días: 0${desdeHoy}\\n🗃️ En memoria: `), "sin ninguno, sin por qué ni quién");

  // A linked device that couldn't read one message the bot didn't send since it started, asking twice.
  for (let vez = 0; vez < 2; vez++) pedir("3EB0E1", "200000000000001:5@lid");
  const unoSolo = "0 desde teléfonos, 1 desde dispositivos vinculados \\(hasta 1 distinto por día\\), 0 desde mi propio número";
  assert.match(await estado(), new RegExp(`\\n📨 Reenvíos que no pude hacer: hoy 1 · 7 días: 1${desdeHoy} · 1 de antes de arrancar, 0 de más de 5 min, 0 recientes\\n   └ Me los pidieron: ${unoSolo}\\n🗃️ En memoria: `));
  // And two phones: one for that one, and both for one it has just sent. How many of them is per day, said once.
  R.anotarEnviado("3EB0E2");
  for (const [id, quien] of [["3EB0E1", "200000000000002@lid"], ["3EB0E2", "200000000000002@lid"], ["3EB0E2", "200000000000003@lid"]]) pedir(id, quien);
  const tres = "3 desde teléfonos \\(hasta 2 distintos por día\\), 1 desde dispositivos vinculados \\(hasta 1\\), 0 desde mi propio número";
  assert.match(await estado(), new RegExp(`\\n📨 Reenvíos que no pude hacer: hoy 4 · 7 días: 4${desdeHoy} · 2 de antes de arrancar, 0 de más de 5 min, 2 recientes\\n   └ Me los pidieron: ${tres}\\n`));
  // And the bot's own number (the fake socket's is bot@lid and bot@s.whatsapp.net): its phone and another device of
  // its for both, and one more for the first.
  for (const [id, quien] of [["3EB0E1", "bot@lid"], ["3EB0E2", "bot@lid"], ["3EB0E1", "bot:5@lid"], ["3EB0E2", "bot:5@lid"], ["3EB0E1", "bot:7@s.whatsapp.net"]]) pedir(id, quien);
  const conElBot = "3 desde teléfonos \\(hasta 2 distintos por día\\), 1 desde dispositivos vinculados \\(hasta 1\\), 5 desde mi propio número \\(hasta 3\\)";
  assert.match(await estado(), new RegExp(`\\n📨 Reenvíos que no pude hacer: hoy 9 · 7 días: 9${desdeHoy} · 5 de antes de arrancar, 0 de más de 5 min, 4 recientes\\n   └ Me los pidieron: ${conElBot}\\n`));

  // Counted since long before: four some days ago, from before it told why, and two late ones, all six from before it
  // told what asked, and the week is whole.
  const dos = (n) => String(n).padStart(2, "0");
  const dia = (atras) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras, 12);
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
  };
  db.prepare(`INSERT INTO reenvios_perdidos (fecha, mensajes) VALUES (?, 0), (?, 4), (?, 40)`).run(dia(30), dia(3), dia(9));
  db.prepare(`INSERT INTO reenvios_perdidos (fecha, mensajes, tarde) VALUES (?, 2, 2)`).run(dia(2));
  assert.match(await estado(), new RegExp(`\\n📨 Reenvíos que no pude hacer: hoy 9 · 7 días: 15 · 5 de antes de arrancar, 2 de más de 5 min, 4 recientes, 4 sin clasificar\\n   └ Me los pidieron: ${conElBot}, 6 de antes de contar quién\\n`));
});
