import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

// .genero (plugins/genero.js, lib/genero.js): hombre or mujer, set by oneself or by an admin for someone else. .perfil
// says it and the rank agrees (Nueva, Veterana); the AI is told how to address them (tested with its prompts, in
// auto-ia.test.mjs and privacidad.test.mjs). With nothing set, nothing changes.
let F, Ge, Pf, R, P;
const DIA = 24 * 60 * 60 * 1000;
const persona = (n, pushName) => ({ chat: G, sender: `${n}@lid`, senderJid: `5989900${n}@s.whatsapp.net`, pushName });
const participants = [
  { id: "701@lid", admin: null },
  { id: "702@lid", admin: "admin" },
  { id: "703@lid", admin: null },
];
before(async () => {
  ({ F } = await prepararBase("genero"));
  Ge = await import("../lib/genero.js");
  Pf = await import("../lib/perfil.js");
  R = await import("../lib/rangos.js");
  P = (await import("../plugins/genero.js")).default;
  F.initDataDB(persona(701, "Ana"));
  F.initDataDB(persona(702, "Beto"));
  F.initDataDB(persona(703, "Caro"));
});
// The command as the dispatcher runs it: by sender, with the text, and what it answered.
async function correr(sender, text, { mentionedJid = [], isAdmin = false, isOwner = false } = {}) {
  globalThis.enviados = [];
  await P.run({ chat: G, sender, senderJid: "", text, mentionedJid, isGroup: true }, { client: globalThis.client, text, participants, isAdmin, isOwner });
  return ultimoEnviado()?.msg ?? {};
}
const en = (lid) => ({ mentionedJid: [lid] });

test("leerGenero: hombre o mujer, con sinónimos y sin acentos; borrar lo saca; otra cosa no es nada", () => {
  const casos = [["mujer", "mujer"], ["Mujer", "mujer"], ["femenino", "mujer"], ["hombre", "hombre"], ["varón", "hombre"], ["masculino", "hombre"], ["borrar", ""], ["quitar", ""], ["ninguno", ""], [" mujer ", "mujer"]];
  for (const [palabra, genero] of casos) assert.equal(Ge.leerGenero(palabra), genero, palabra);
  for (const palabra of ["", "otro", "no binario", "mujer hombre", "m"]) assert.equal(Ge.leerGenero(palabra), undefined, palabra);
});

test(".genero: el propio se muestra, se pone, se cambia y se saca; lo que no es hombre ni mujer, no", async () => {
  assert.equal((await correr("701@lid", "")).text, "🚻 No tenés el género anotado: me guío por tu nombre. Ponelo con .genero mujer o .genero hombre.");
  assert.equal((await correr("701@lid", "mujer")).text, "✅ Listo: te trato en femenino, y tu perfil lo dice.");
  assert.equal(Ge.generoDe("701@lid"), "mujer");
  assert.equal((await correr("701@lid", "")).text, "🚻 Tenés anotado: mujer. Con .genero hombre lo cambiás y con .genero borrar lo sacás.");
  assert.equal((await correr("701@lid", "otra cosa")).text, "❌ Decime hombre o mujer: .genero mujer o .genero hombre (.genero borrar lo saca).");
  assert.equal(Ge.generoDe("701@lid"), "mujer", "no cambió");
  assert.equal((await correr("701@lid", "Hombre")).text, "✅ Listo: te trato en masculino, y tu perfil lo dice.");
  assert.equal(Ge.generoDe("701@lid"), "hombre");
  assert.equal((await correr("701@lid", "borrar")).text, "✅ Listo: te saqué el género; me guío por tu nombre, como siempre.");
  assert.equal(Ge.generoDe("701@lid"), "");
  assert.equal(Ge.tratoPara("701@lid", "Ana"), "", "sin nada anotado, nada que decirle a la IA");
});

test(".genero @persona: solo un admin (o el owner), a alguien que conozco y que no sea Claudia; arrobándola", async () => {
  const r = await correr("701@lid", "@703 mujer", en("703@lid"));
  assert.equal(r.text, "❌ El género de otra persona se lo anota un admin. El tuyo lo ponés vos: .genero mujer o .genero hombre.");
  assert.equal(Ge.generoDe("703@lid"), "");
  const a = await correr("702@lid", "@703 mujer", { ...en("703@lid"), isAdmin: true });
  assert.equal(a.text, "✅ Listo: a @703 la trato en femenino, y su perfil lo dice.");
  assert.deepEqual(a.mentions, ["703@lid"]);
  assert.equal(Ge.generoDe("703@lid"), "mujer");
  assert.equal(Ge.tratoPara("703@lid", "Caro"), "Caro es mujer: tratala en femenino.");
  assert.equal((await correr("702@lid", "@703", { ...en("703@lid"), isAdmin: true })).text, "🚻 @703 tiene anotado: mujer. Con .genero @703 hombre se lo cambiás y con .genero @703 borrar se lo sacás.");
  assert.equal((await correr("702@lid", "@703 x", { ...en("703@lid"), isAdmin: true })).text, "❌ Decime hombre o mujer: .genero @703 mujer (o borrar, para sacárselo).");
  // the word before the mention too
  assert.equal((await correr("702@lid", "borrar @703", { ...en("703@lid"), isAdmin: true })).text, "✅ Listo: le saqué el género a @703; me guío por su nombre, como siempre.");
  assert.equal(Ge.generoDe("703@lid"), "");
  assert.equal((await correr("702@lid", "@703", { ...en("703@lid"), isAdmin: true })).text, "🚻 @703 no tiene el género anotado: me guío por su nombre. Se lo anotás con .genero @703 mujer o .genero @703 hombre.");
  assert.match((await correr("701@lid", "@703 hombre", { ...en("703@lid"), isOwner: true })).text, /^✅ Listo: a @703 lo trato en masculino/);
  assert.equal(Ge.tratoPara("703@lid", "Caro"), "Caro es hombre: tratalo en masculino.");
  F.updateUser("703@lid", { genero: "" });
  assert.equal((await correr("702@lid", "@bot mujer", { mentionedJid: [globalThis.client.user.lid], isAdmin: true })).text, "❌ Esa soy yo: mencioná a la persona, o respondé un mensaje suyo.");
  assert.match((await correr("702@lid", "@999 mujer", { mentionedJid: ["999@lid"], isAdmin: true })).text, /^❌ No tengo datos de esa persona todavía/);
  // naming oneself is one's own
  assert.equal((await correr("701@lid", "@701 mujer", en("701@lid"))).text, "✅ Listo: te trato en femenino, y tu perfil lo dice.");
  F.updateUser("701@lid", { genero: "" });
});

test("perfil y rango: Nueva y Veterana y la línea del género; sin nada anotado, como siempre", () => {
  F.updateUser("701@lid", { genero: "mujer", inGroup: JSON.stringify({ [G]: { messageCount: 50, desde: Date.now() - 3 * DIA } }) });
  const propio = Pf.textoPerfil(G, "701@lid", F.getUser("701@lid"), true).texto;
  assert.match(propio, /^👤 \*Tu perfil\*\n\n🌱 Nueva · 3 días en el grupo\n/);
  assert.match(propio, /\n♀️ Mujer(\n|$)/);
  assert.match(R.textoRango(G, "701@lid", F.getUser("701@lid"), true).texto, /^🎖️ \*Tu rango:\* 🌱 \*Nueva\*\n/);
  // climbing to veterana, announced in her gender, and the next one in hers too
  F.updateUser("701@lid", { inGroup: JSON.stringify({ [G]: { messageCount: 2000, desde: Date.now() - 91 * DIA, rango: "delacasa" } }) });
  assert.match(R.chequearAscenso(G, "701@lid", F.getUser("701@lid")).texto, /^🎖️ @701 subió a \*Veterana\* \(90 días en el grupo y 2000 mensajes\)\./);
  assert.match(R.textoRango(G, "701@lid", F.getUser("701@lid")).texto, /\*Veterana\*[\s\S]*Siguiente: 👑 Leyenda,/);
  assert.equal(R.etiquetaRango(G, "701@lid", F.getUser("701@lid")), "🎖️ Veterana");
  F.updateUser("701@lid", { inGroup: JSON.stringify({ [G]: { messageCount: 50, desde: Date.now() - 3 * DIA, rango: "nuevo" } }) });
  assert.match(R.textoRango(G, "701@lid", F.getUser("701@lid")).texto, /\*Nueva\*[\s\S]*Siguiente: 🧉 Habitué,/, "los que no cambian, igual");
  // a man, and nothing set: the names as always, and no line
  F.updateUser("702@lid", { genero: "hombre", inGroup: JSON.stringify({ [G]: { messageCount: 1, desde: Date.now() } }) });
  const deBeto = Pf.textoPerfil(G, "702@lid", F.getUser("702@lid"), false).texto;
  assert.match(deBeto, /\n🌱 Nuevo · en el grupo desde hoy\n/);
  assert.match(deBeto, /\n♂️ Hombre(\n|$)/);
  const deCaro = Pf.textoPerfil(G, "703@lid", F.getUser("703@lid"), false).texto;
  assert.match(deCaro, /\n🌱 Nuevo · /);
  assert.doesNotMatch(deCaro, /♀️|♂️/);
  F.updateUser("701@lid", { genero: "" });
  F.updateUser("702@lid", { genero: "" });
});
