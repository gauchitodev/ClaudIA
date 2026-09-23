import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, esperar } from "./helpers.mjs";
import strings from "../lib/strings.js";

// Asking Claudia in plain words ("claudia, llamá a @111") runs .llamar or .tagall straight from the _auto-ia hook, past
// the dispatcher's checks. So the hook has to apply the same rule the command has: .tagall for moderators, .llamar
// only for admins. Gemini is swapped for a canned classification.

let AutoIA, Llamar, Tagall, RITMO;
let clasificacion; // what "Gemini" answers
const fetchReal = globalThis.fetch;
const logReal = console.log;
const tipeoReal = {};

before(async () => {
  await prepararBase("auto-ia");
  globalThis.txt = strings;
  globalThis.geminiApiKey = "clave";
  ({ RITMO } = await import("../lib/ritmo.js"));
  for (const k of ["TIPEO_MIN_MS", "TIPEO_MAX_MS", "TIPEO_POR_LETRA_MS"]) tipeoReal[k] = RITMO[k];
  Object.assign(RITMO, { TIPEO_MIN_MS: 0, TIPEO_MAX_MS: 1, TIPEO_POR_LETRA_MS: 0 }); // no "typing..." wait
  console.log = () => {}; // the AI module narrates which model answered
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(clasificacion) }] } }] }) });
  AutoIA = (await import("../plugins/_auto-ia.js")).default;
  Llamar = (await import("../plugins/grupo-llamar.js")).default;
  Tagall = (await import("../plugins/grupo-tagall.js")).default;
  globalThis.plugins = { "grupo-llamar.js": Llamar, "grupo-tagall.js": Tagall };
});
after(() => {
  globalThis.fetch = fetchReal;
  console.log = logReal;
  Object.assign(RITMO, tipeoReal);
});

const C = "ia@g.us";
const participants = [{ id: "111@lid", admin: null }, { id: "555@lid", admin: null }];
async function pedir(texto, rango) {
  globalThis.autoIaCooldown.delete(C); // she answers once every 20 s per group
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  const m = { chat: C, isGroup: true, sender: "555@lid", pushName: "Ana", text: texto, mentionedJid: ["111@lid"], quoted: null };
  await AutoIA.before(m, { client, participants, isBotAdmin: true, isOwner: false, user: {}, chat: { mentions: 1 }, ...rango });
  await esperar(30); // .llamar's first mention goes out on a timer
  return { client, m, textos: globalThis.enviados.map((e) => e.msg?.text || "") };
}
const MODERADOR = { isAdmin: false, isMod: true };
const ADMIN = { isAdmin: true, isMod: true };

test("pedido a Claudia: un moderador no consigue un .llamar", async () => {
  clasificacion = { comando: "llamar", respuesta: "¡Dale, ya lo llamo!" };
  const { textos } = await pedir("claudia llamá a @111", MODERADOR);
  assert.deepEqual(textos, ["Che, eso lo puede pedir solo un admin del grupo."]);
});

test("pedido a Claudia: un admin sí, y un moderador sigue pudiendo pedir un tagall", async () => {
  clasificacion = { comando: "llamar", respuesta: "¡Dale, ya lo llamo!" };
  const { client, m, textos } = await pedir("claudia llamá a @111", ADMIN);
  await Llamar.run(m, { client, text: "", command: "cancelar" }); // the other nine mentions aren't needed
  assert.deepEqual(textos, ["¡Dale, ya lo llamo!", "@111"]);

  clasificacion = { comando: "tagall", respuesta: "Ahí van todos." };
  const tagall = await pedir("claudia arrobá a todos", MODERADOR);
  assert.equal(tagall.textos[0], "Ahí van todos.");
  assert.match(tagall.textos[1], /@111 @555/, "la mención a todos salió");
});
