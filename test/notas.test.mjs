import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// What Claudia has noted down in a group, under one name (plugins/memoria-grupo.js, lib/memoria-grupo.js): .nota keeps
// a note of the group's, .notas lists them and takes them out, and .notas yo / .notas olvidame are for what she noted
// of each person while chatting. It all was .memoria's, which is no longer a command.

let F, MP, Notas, txt;
const [ANA, BETO] = ["111@lid", "222@lid"];
const PIE = "\n\nPara borrar: .notas borrar <número> (quien la anotó o un admin) · .notas limpiar (admin)\nLo que sé de vos: .notas yo · para que lo olvide: .notas olvidame";
const lista = (...notas) => `🧠 *Notas del grupo* (${notas.length}/40)\n${notas.map(([id, texto]) => `#${id} · ${texto}`).join("\n")}${PIE}`;
const VACIA = "No tengo ninguna nota de este grupo todavía. Anotame algo con .nota <algo>";
const DE_VOS = (que) => `🧠 Lo que sé de vos en este grupo: ${que}\nPara que me lo olvide: .notas olvidame`;

before(async () => {
  ({ F } = await prepararBase("notas"));
  MP = await import("../lib/memoria-persona.js");
  Notas = (await import("../plugins/memoria-grupo.js")).default;
  txt = (await import("../lib/strings.js")).default;
});

// A group of a test's own, with people the bot knows.
function grupo(chat) {
  for (const sender of [ANA, BETO]) F.initDataDB({ chat, sender, senderJid: "", pushName: sender === ANA ? "Ana" : "Beto" });
  return chat;
}
// What the bot answers to a command, typed as the dispatcher hands it over: the name without accents, and its words.
async function pedir(chat, sender, command, text = "", contexto = {}) {
  const antes = globalThis.enviados.length;
  await Notas.run({ chat, sender, isGroup: true, mentionedJid: [] }, { client: conexion.client, text, args: text.trim() ? text.trim().split(/\s+/) : [], command, isAdmin: false, isOwner: false, ...contexto });
  const dichos = globalThis.enviados.slice(antes).map((e) => e.msg.text);
  assert.equal(dichos.length, 1, `${command} ${text}`);
  return dichos[0];
}
// The notes are numbered across every group: a test reads the number off the answer.
async function anotar(chat, sender, command, text) {
  const dicho = await pedir(chat, sender, command, text);
  const id = Number(dicho.match(/^🧠 Anotado \(#(\d+)\): /)?.[1]);
  assert.ok(id > 0, dicho);
  return { id, dicho };
}

test("los comandos: .nota y .notas, con .recordá como estaba; .memoria ya no es uno", () => {
  assert.deepEqual(Notas.cmd, ["nota", "notas", "recorda"]);
  assert.equal(Notas.onlyGroup, true);
});

test(".nota anota, como .recordá que; y .notas las lista, como .nota sola", async () => {
  const chat = grupo("notas-lista@g.us");
  for (const comando of ["notas", "nota"]) assert.equal(await pedir(chat, ANA, comando), VACIA, comando);
  const a = await anotar(chat, ANA, "nota", "Fulano siempre llega tarde");
  assert.equal(a.dicho, `🧠 Anotado (#${a.id}): Fulano siempre llega tarde`);
  const b = await anotar(chat, BETO, "recorda", "que el asado es el sábado");
  const c = await anotar(chat, BETO, "nota", "que los viernes hay fútbol");
  assert.equal(c.dicho, `🧠 Anotado (#${c.id}): los viernes hay fútbol`, "con el «que» adelante también");
  const todas = lista([a.id, "Fulano siempre llega tarde"], [b.id, "el asado es el sábado"], [c.id, "los viernes hay fútbol"]);
  for (const comando of ["notas", "nota"]) assert.equal(await pedir(chat, ANA, comando), todas, comando);
  // What .notas doesn't know how to do is the list, too.
  assert.equal(await pedir(chat, ANA, "notas", "todas"), todas);
  // With nothing to keep, it says how.
  assert.equal(await pedir(chat, ANA, "recorda"), "❌ ¿Qué anoto? Ej: .nota Fulano siempre llega tarde");
  assert.equal(await pedir(chat, ANA, "nota", "que ya"), "❌ ¿Qué anoto? Ej: .nota Fulano siempre llega tarde");
});

test(".notas borrar saca una: quien la anotó o un admin, y con su número", async () => {
  const chat = grupo("notas-borrar@g.us");
  const a = await anotar(chat, ANA, "nota", "Fulano siempre llega tarde");
  const b = await anotar(chat, ANA, "nota", "el asado es el sábado");
  assert.equal(await pedir(chat, BETO, "notas", `borrar ${a.id}`), "❌ Esa la anotó otra persona: la puede borrar quien la anotó o un admin.");
  assert.equal(await pedir(chat, ANA, "notas", "borrar"), "❌ ¿Cuál? Poné su número: .notas borrar <número>. Están en .notas");
  assert.equal(await pedir(chat, ANA, "notas", "borrar esa"), "❌ ¿Cuál? Poné su número: .notas borrar <número>. Están en .notas");
  assert.equal(await pedir(chat, ANA, "notas", "borrar 99999"), "❌ No hay ninguna nota #99999 en este grupo. Mirá la lista con .notas");
  assert.equal(await pedir(chat, ANA, "notas", `borrar ${a.id}`), "🗑️ Nota borrada: Fulano siempre llega tarde");
  assert.equal(await pedir(chat, BETO, "notas", `olvidar ${b.id}`, { isAdmin: true }), "🗑️ Nota borrada: el asado es el sábado");
  assert.equal(await pedir(chat, ANA, "notas"), VACIA);
  // A note of another group isn't this one's to take out.
  const otro = grupo("notas-borrar-2@g.us");
  const ajena = await anotar(otro, ANA, "nota", "la clave del portón es tocar timbre");
  assert.equal(await pedir(chat, ANA, "notas", `borrar ${ajena.id}`), `❌ No hay ninguna nota #${ajena.id} en este grupo. Mirá la lista con .notas`);
  assert.equal(F.memoriaGrupo(otro).length, 1);
});

test(".notas limpiar las saca todas, y es de un admin", async () => {
  const chat = grupo("notas-limpiar@g.us");
  await anotar(chat, ANA, "nota", "Fulano siempre llega tarde");
  await anotar(chat, BETO, "nota", "el asado es el sábado");
  assert.equal(await pedir(chat, ANA, "notas", "limpiar"), txt.onlyAdmin);
  assert.equal(F.memoriaGrupo(chat).length, 2);
  assert.equal(await pedir(chat, ANA, "notas", "limpiar", { isAdmin: true }), "🗑️ Borré las 2 notas del grupo.");
  assert.equal(await pedir(chat, ANA, "notas", "limpiar", { isOwner: true }), "No había ninguna nota.");
  await anotar(chat, ANA, "nota", "los viernes hay fútbol");
  assert.equal(await pedir(chat, ANA, "notas", "limpiar", { isAdmin: true }), "🗑️ Borré la nota que había.");
});

// .nota for .notas is the slip to expect: with nothing, with one of its words alone, or with "borrar" and a number,
// it's .notas'.
test(".nota en singular hace lo de .notas cuando no hay nota que anotar, y si la hay la anota", async () => {
  const chat = grupo("notas-singular@g.us");
  const a = await anotar(chat, ANA, "nota", "Fulano siempre llega tarde");
  assert.equal(await pedir(chat, ANA, "nota", `borrar ${a.id}`), "🗑️ Nota borrada: Fulano siempre llega tarde");
  // But a note that starts with one of those words is a note.
  const b = await anotar(chat, ANA, "nota", "borrar la carpeta vieja del drive");
  const c = await anotar(chat, ANA, "nota", "limpiar la parrilla después del asado");
  const d = await anotar(chat, ANA, "nota", "borrar 3 fotos repetidas");
  const e = await anotar(chat, ANA, "nota", "borrar todo");
  const f = await anotar(chat, ANA, "nota", "yo llevo la carne");
  const g = await anotar(chat, ANA, "nota", "olvidame de la lista del asado");
  const todas = [b, c, d, e, f, g].map((n, i) => [n.id, ["borrar la carpeta vieja del drive", "limpiar la parrilla después del asado", "borrar 3 fotos repetidas", "borrar todo", "yo llevo la carne", "olvidame de la lista del asado"][i]]);
  assert.equal(await pedir(chat, ANA, "notas"), lista(...todas));
  assert.equal(await pedir(chat, BETO, "nota", "limpiar"), txt.onlyAdmin);
  assert.equal(await pedir(chat, BETO, "nota", "limpiar", { isAdmin: true }), "🗑️ Borré las 6 notas del grupo.");
});

test("lo que Claudia anotó de cada uno: .notas yo lo muestra y .notas olvidame lo borra, sin tocar las notas del grupo", async () => {
  const chat = grupo("notas-persona@g.us");
  assert.equal(await pedir(chat, ANA, "notas", "yo"), "🧠 No tengo nada anotado de vos en este grupo.");
  assert.equal(await pedir(chat, ANA, "notas", "olvidame"), "🧠 No tenía nada anotado de vos en este grupo.");
  assert.ok(MP.anotarDe(ANA, chat, "tiene un perro que se llama Toto"));
  assert.ok(MP.anotarDe(BETO, chat, "es hincha de Peñarol"));
  await anotar(chat, ANA, "nota", "Fulano siempre llega tarde");
  for (const accion of ["yo", "mia", "mía", "YO"]) assert.equal(await pedir(chat, ANA, "notas", accion), DE_VOS("tiene un perro que se llama Toto"), accion);
  assert.equal(await pedir(chat, BETO, "notas", "yo"), DE_VOS("es hincha de Peñarol"), "a cada uno lo suyo");
  assert.equal(await pedir(chat, ANA, "notas", "olvidame"), "🧠 Listo, me olvidé de lo que sabía de vos en este grupo.");
  assert.equal(MP.memoriaDe(ANA, chat), "");
  assert.equal(MP.memoriaDe(BETO, chat), "es hincha de Peñarol", "y solo lo de quien lo pide");
  assert.equal(F.memoriaGrupo(chat).length, 1, "las notas del grupo quedan");
});

// In the singular too: ".nota olvidame" kept "olvidame" as a note of the group's, and whoever asked stayed remembered.
test(".nota yo y .nota olvidame son lo de cada uno, no una nota del grupo", async () => {
  const chat = grupo("notas-persona-singular@g.us");
  assert.ok(MP.anotarDe(ANA, chat, "tiene un perro que se llama Toto"));
  assert.equal(await pedir(chat, ANA, "nota", "yo"), DE_VOS("tiene un perro que se llama Toto"));
  assert.equal(await pedir(chat, ANA, "nota", "mía"), DE_VOS("tiene un perro que se llama Toto"));
  assert.equal(await pedir(chat, ANA, "nota", "olvidame"), "🧠 Listo, me olvidé de lo que sabía de vos en este grupo.");
  assert.equal(MP.memoriaDe(ANA, chat), "");
  assert.equal(F.memoriaGrupo(chat).length, 0);
});

test("con el tope de notas, dice con qué comando hacer lugar", async () => {
  const chat = grupo("notas-tope@g.us");
  const Mem = await import("../lib/memoria-grupo.js");
  for (let i = 0; i < Mem.MEMORIA.MAX_POR_GRUPO; i++) F.agregarMemoriaGrupo(chat, `nota número ${i}`, ANA);
  assert.equal(await pedir(chat, ANA, "nota", "una más de la cuenta"), "❌ Ya tengo 40 notas de este grupo. Borrá alguna con .notas borrar <número>.");
  assert.equal(F.memoriaGrupo(chat).length, 40);
});

test("el menú las nombra así: .nota para anotar y .notas para verlas y para lo de cada uno; .memoria no figura", async () => {
  const M = await import("../lib/menu.js");
  const entradas = M.entradasDelMenu(".");
  const lineas = entradas.filter((e) => ["nota", "notas", "recorda", "memoria"].includes(e.cmd));
  assert.deepEqual(lineas.map((e) => e.cmd), ["nota", "notas"]);
  assert.deepEqual(lineas[0].nombrados, ["nota", "recorda", "notas", "notas"]);
  assert.deepEqual(lineas[1].nombrados, ["notas", "notas"]);
  assert.deepEqual(entradas.filter((e) => e.nombrados.includes("memoria")).map((e) => e.linea), []);
  const { secciones } = await import("../lib/secciones.js");
  for (const cmd of Notas.cmd) assert.ok(secciones.extras.includes(cmd), `${cmd} está en la sección de extras`);
  assert.ok(!Object.values(secciones).flat().includes("memoria"));
});
