import { test, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { prepararBase, G, clienteFalso, ultimoEnviado } from "./helpers.mjs";

// The calls to everyone (.tagall, .tagall2, .ht, .ht2, a poll's call to vote and Claudia's .tagall) leave out whoever
// opted out in the group with .notagall; .sitagall brings them back, and an admin's .tagall -f reaches everyone
// (lib/menciones-generales.js). A mention notifies even in a muted group, and there was no way out of these.

let F, MG, I, NoTag, Tagall, Tagall2, Ht, Ht2, Encuesta;
const BOT = "bot@lid"; // clienteFalso's Claudia
const numero = (n) => `5989900000${n}@s.whatsapp.net`;
const persona = (n, chat = G) => ({ chat, sender: `${n}@lid`, senderJid: numero(n), pushName: `Persona ${n}` });
const miembros = (...ns) => [...ns.map((n) => ({ id: `${n}@lid`, admin: null })), { id: BOT, admin: "admin" }];
const MOD = { isMod: true, isAdmin: false, isOwner: false };
const ADMIN = { isMod: true, isAdmin: true, isOwner: false };

before(async () => {
  ({ F } = await prepararBase("notagall"));
  globalThis.txt = (await import("../lib/strings.js")).default;
  MG = await import("../lib/menciones-generales.js");
  I = await import("../lib/identidad.js");
  NoTag = (await import("../plugins/grupo-notagall.js")).default;
  Tagall = (await import("../plugins/grupo-tagall.js")).default;
  Tagall2 = (await import("../plugins/grupo-tagall2.js")).default;
  Ht = (await import("../plugins/grupo-hidetag.js")).default;
  Ht2 = (await import("../plugins/grupo-hidetag2.js")).default;
  Encuesta = (await import("../plugins/tools-encuesta.js")).default;
  for (const n of [1, 2, 3, 4]) F.initDataDB(persona(n));
});
beforeEach(() => {
  for (const n of [1, 2, 3, 4]) F.updateUserInGroup(`${n}@lid`, G, { sinTagall: false });
});

const pedir = (n, command) => NoTag.run({ chat: G, sender: `${n}@lid`, senderJid: numero(n), isGroup: true }, { client: clienteFalso(), command });
const tagall = (text, rango = MOD, { participants = miembros(1, 2, 3, 4), chat = { mentions: 1 } } = {}) => Tagall.run({ chat: G, isGroup: true }, { client: clienteFalso(), text, participants, chat, ...rango });
const visible = (texto) => texto.split("‎")[0];
const arrobados = (texto) => texto.split("‎").pop();

test(".notagall y .sitagall: los cuatro estados, sin pisar lo demás del grupo", async () => {
  F.updateUserInGroup("3@lid", G, { mute: true, messageCount: 5 });
  await pedir(3, "notagall");
  assert.match(ultimoEnviado().msg.text, /^🔕 Listo: en este grupo los llamados a todos \(\.tagall, \.ht y el aviso de las encuestas\) ya no te arroban\. Solo te llega un aviso que un admin fuerce con \.tagall -f\./);
  await pedir(3, "notagall");
  assert.equal(ultimoEnviado().msg.text, "🔕 Ya estabas fuera de los llamados a todos de este grupo. Con .sitagall volvés.");
  const fila = F.getUser("3@lid").inGroup[G];
  assert.deepEqual([fila.sinTagall, fila.mute, fila.messageCount], [true, true, 5]);
  await pedir(3, "sitagall");
  assert.equal(ultimoEnviado().msg.text, "🔔 Listo: vuelvo a arrobarte en los llamados a todos de este grupo.");
  await pedir(3, "sitagall");
  assert.equal(ultimoEnviado().msg.text, "🔔 Ya recibís los llamados a todos de este grupo. Con .notagall te salís.");
  assert.equal(F.getUser("3@lid").inGroup[G].sinTagall, false);
  assert.ok(!NoTag.botAdmin && !NoTag.onlyMod && !NoTag.onlyAdmin, "cualquiera puede salirse");
  F.updateUserInGroup("3@lid", G, { mute: false });
});

test(".tagall: no arroba a quien se salió ni a Claudia, y el pie lo cuenta antes del «leer más»", async () => {
  await pedir(3, "notagall");
  await tagall("asado el sábado");
  const { text, mentions } = ultimoEnviado().msg;
  assert.deepEqual(mentions, ["1@lid", "2@lid", "4@lid"]);
  assert.match(visible(text), /\*MENSAJE:\* asado el sábado\n\n🔕 1 persona no recibe menciones generales \(\.notagall\)/);
  assert.equal(arrobados(text), "@1 @2 @4");

  await pedir(4, "notagall");
  await tagall("");
  assert.match(visible(ultimoEnviado().msg.text), /\*MENSAJE:\* _no_establecido_\n\n🔕 2 personas no reciben menciones generales/);
});

test(".tagall -f: de un admin les llega a todos y dice que es forzado; de un moderador, solo el rechazo", async () => {
  await pedir(3, "notagall");
  for (const forma of ["-f", "--force", "—force", "-F"]) {
    await tagall(`${forma} mañana no hay reunión`, ADMIN);
    const { text, mentions } = ultimoEnviado().msg;
    assert.deepEqual(mentions, ["1@lid", "2@lid", "3@lid", "4@lid"], forma);
    assert.match(visible(text), /\*MENSAJE:\* mañana no hay reunión\n\n📢 Aviso forzado: les llega también a quienes pidieron no recibir los llamados a todos\./, forma);
    assert.doesNotMatch(visible(text), /🔕/);
  }
  await tagall("-f mañana no hay reunión", MOD);
  assert.deepEqual(ultimoEnviado().msg, { text: "❌ El -f (forzar el aviso) es solo para los admins del grupo." });
  await tagall("-f aviso", ADMIN, { chat: { mentions: 0 } });
  assert.equal(ultimoEnviado().msg.text, globalThis.txt.mentionsDisabled, "con las menciones apagadas, tampoco");
  await tagall("-f aviso", { ...ADMIN, isOwner: true }, { chat: { mentions: 0 } });
  assert.equal(ultimoEnviado().msg.mentions.length, 4, "el owner pasa, como siempre");
  await tagall("hola -f", ADMIN);
  assert.deepEqual(ultimoEnviado().msg.mentions, ["1@lid", "2@lid", "4@lid"], "solo cuenta como primera palabra");
});

test("si se salieron todos no manda nada, y sin la lista de miembros tampoco", async () => {
  for (const n of [1, 2, 3, 4]) await pedir(n, "notagall");
  await tagall("hola");
  assert.equal(ultimoEnviado().msg.text, "🔕 No hay a quién mencionar: todos pidieron no recibir los llamados a todos (.notagall). Un admin puede forzarlo con .tagall -f.");
  await tagall("hola", MOD, { participants: [] });
  assert.equal(ultimoEnviado().msg.text, "No pude ver la lista de miembros del grupo; probá de nuevo en un rato.");
});

// In the groups that list people by number, the opt-out is on the LID row: the database ties them together.
test("en un grupo por número reconoce a quien se salió, y arroba con el id del grupo", async () => {
  await pedir(3, "notagall");
  const porNumero = [{ id: numero(1) }, { id: numero(3) }, { id: numero(4), lid: "4@lid" }, { id: "bot@s.whatsapp.net" }];
  assert.deepEqual(MG.mencionesParaTodos(G, porNumero, { client: clienteFalso() }), { ids: [numero(1), numero(4)], fuera: 1 });
});

// An older database may hold a second row for the same person, keyed by number: the LID row decides.
test("con dos filas para la misma persona, decide la del LID", () => {
  const D = "duplicada@g.us";
  F.initDataDB({ chat: D, sender: "7viejo@lid", senderJid: numero(7), pushName: "Siete viejo" });
  F.initDataDB({ chat: D, sender: "7@lid", senderJid: "", pushName: "Siete" });
  F.updateUserInGroup("7viejo@lid", D, { sinTagall: true });
  F.updateUserInGroup("7@lid", D, { sinTagall: false });
  assert.equal(MG.noRecibeLlamados(D, [numero(7)]), true);
  assert.equal(MG.noRecibeLlamados(D, [numero(7), "7@lid"]), false);
  assert.equal(MG.noRecibeLlamados(D, ["nadie@lid"]), false);
});

// The whole group in one query, whatever its size. Each member used to be looked up on their own, up to three lookups
// each and two of them by number, and a .tagall in a group of a thousand held the whole bot for half a second.
test("una sola consulta para todo el grupo, no una por persona", () => {
  const grupo = Array.from({ length: 300 }, (_, i) => ({ id: `${600000 + i}@lid`, phoneNumber: `598970${String(i).padStart(5, "0")}@s.whatsapp.net`, admin: null }));
  const db = globalThis.db;
  const prepare = db.prepare;
  let consultas = 0;
  db.prepare = function (...args) {
    consultas++;
    return prepare.apply(this, args);
  };
  try {
    assert.equal(MG.mencionesParaTodos(G, grupo, { client: clienteFalso() }).ids.length, 300);
  } finally {
    delete db.prepare;
  }
  assert.ok(consultas <= 1, `${consultas} consultas a la base`);
});

// And it says the same as asking about each one: by LID or by number, with the other id alongside or not, and with an
// old second row keyed by number.
test("la consulta del grupo dice lo mismo que preguntar por cada uno", () => {
  const D = "consistencia@g.us";
  const pn = (n) => `5989800000${n}@s.whatsapp.net`;
  for (const n of [1, 2, 3, 4]) F.initDataDB({ chat: D, sender: `c${n}@lid`, senderJid: pn(n), pushName: `C${n}` });
  F.initDataDB({ chat: D, sender: "c6viejo@lid", senderJid: pn(6), pushName: "Seis viejo" });
  F.initDataDB({ chat: D, sender: "c6@lid", senderJid: "", pushName: "Seis" });
  for (const [id, valor] of [["c1@lid", true], ["c2@lid", false], ["c3@lid", true], ["c6viejo@lid", true], ["c6@lid", false]]) F.updateUserInGroup(id, D, { sinTagall: valor });
  const formas = [
    ...[1, 2, 3, 4].flatMap((n) => [{ id: `c${n}@lid`, phoneNumber: pn(n) }, { id: `c${n}@lid` }, { id: pn(n), lid: `c${n}@lid` }, { id: pn(n) }]),
    { id: "c6@lid", phoneNumber: pn(6) },
    { id: "c6@lid" },
    { id: pn(6) },
    { id: "nadie@lid" },
    { id: pn(9) },
  ];
  for (const p of formas) {
    const unoPorUno = MG.noRecibeLlamados(D, I.idsDeParticipante(p));
    assert.equal(MG.mencionesParaTodos(D, [p], { client: clienteFalso() }).fuera, unoPorUno ? 1 : 0, JSON.stringify(p));
  }
  assert.equal(MG.mencionesParaTodos(D, formas, { client: clienteFalso() }).fuera, 9, "1 y 3 en sus cuatro formas, y 6 por su número");
});

test(".tagall2 y .ht2: las diez van sin quien se salió, y el -f no va con la ráfaga", async () => {
  await pedir(2, "notagall");
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  try {
    for (const P of [Tagall2, Ht2]) {
      const client = clienteFalso();
      await P.run({ chat: G, isGroup: true }, { client, text: "despierten", participants: miembros(1, 2, 3), chat: { mentions: 1 }, ...ADMIN });
      mock.timers.tick(6000);
      await new Promise((r) => setImmediate(r));
      const envios = globalThis.enviados.filter((e) => e.msg?.mentions);
      assert.equal(envios.length, 10);
      for (const e of envios) assert.deepEqual(e.msg.mentions, ["1@lid", "3@lid"]);
    }
  } finally {
    mock.timers.reset();
  }
  await Tagall2.run({ chat: G, isGroup: true }, { client: clienteFalso(), text: "-f despierten", participants: miembros(1, 2), chat: { mentions: 1 }, ...ADMIN });
  assert.equal(ultimoEnviado().msg.text, "❌ El -f va con .tagall: la ráfaga de .tagall2 no se fuerza.");
});

test(".ht: reenviando o con texto, sin quien se salió", async () => {
  await pedir(4, "notagall");
  const correr = (m) => Ht.run({ chat: G, isGroup: true, ...m }, { client: clienteFalso(), text: m.text ?? "", participants: miembros(1, 2, 3, 4), chat: { mentions: 1 }, ...MOD });
  await correr({ quoted: { fakeObj: { key: { id: "Q" } } } });
  assert.deepEqual(ultimoEnviado().msg.mentions, ["1@lid", "2@lid", "3@lid"]);
  assert.ok(ultimoEnviado().msg.forward);
  await correr({ text: "miren esto" });
  assert.deepEqual(ultimoEnviado().msg, { text: "miren esto", mentions: ["1@lid", "2@lid", "3@lid"] });
});

test(".encuesta: el aviso para votar sin quien se salió; si se salieron todos, sale solo la encuesta", async () => {
  const correr = async () => {
    const client = clienteFalso();
    await Encuesta.run({ chat: G, sender: "1@lid", isGroup: true }, { client, text: "¿pizza? - sí - no", usedPrefix: ".", participants: miembros(1, 2, 3, 4), chat: { mentions: 1 }, ...MOD });
    return globalThis.enviados.map((e) => (e.msg.poll ? "encuesta" : e.msg.mentions));
  };
  await pedir(1, "notagall");
  assert.deepEqual(await correr(), ["encuesta", ["2@lid", "3@lid", "4@lid"]]);
  for (const n of [2, 3, 4]) await pedir(n, "notagall");
  assert.deepEqual(await correr(), ["encuesta"]);
});

test("consistencia: los llamados a todos pasan por mencionesParaTodos, y .notagall no se puede bloquear por sección", () => {
  const leer = (archivo) => fs.readFileSync(new URL(`../${archivo}`, import.meta.url), "utf8");
  for (const archivo of ["grupo-tagall.js", "grupo-tagall2.js", "grupo-hidetag.js", "grupo-hidetag2.js", "tools-encuesta.js"]) {
    assert.match(leer(`plugins/${archivo}`), /mencionesParaTodos\(m\.chat, participants/, archivo);
  }
  const conRelleno = fs.readdirSync(new URL("../plugins/", import.meta.url)).filter((f) => f.endsWith(".js") && leer(`plugins/${f}`).includes("excludeJids"));
  assert.deepEqual(conRelleno, [], "la lista de relleno que no excluía a nadie");
  assert.doesNotMatch(leer("lib/secciones.js"), /notagall|sitagall/, "un .bladd +extras no le saca a la gente la forma de salirse");
  assert.match(leer("plugins/_auto-ia.js"), /desdeClaudia: true/, "Claudia nunca fuerza");
});
