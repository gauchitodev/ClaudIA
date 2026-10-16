import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";

// The commands people use (lib/usos.js): counted by chat, day and command each time one runs (handle-message.js),
// shown by .usos and trimmed by .podar. The menu's "lo más usado" is built from it (lib/menu.js).

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let F, U, A, Usos;
const DIA = 24 * 3600e3;
const AHORA = new Date(2031, 0, 15, 15, 30); // a fixed afternoon, so neither the clock nor the time zone gets in the way
const dia = (n) => new Date(AHORA.getTime() - n * DIA);
const G1 = "uno@g.us";

before(async () => {
  ({ F } = await prepararBase("usos"));
  U = await import("../lib/usos.js");
  A = await import("../lib/actividad.js");
  Usos = (await import("../plugins/grupo-usos.js")).default;
});

test("usos: se cuentan por grupo y día, los privados juntos, y el comando en minúsculas", () => {
  U.registrarUso(G1, "Audio", AHORA);
  U.registrarUso(G1, "audio", AHORA);
  U.registrarUso(G1, "s", dia(1));
  U.registrarUso("59899111222@s.whatsapp.net", "clima", AHORA);
  U.registrarUso("123@lid", "clima", AHORA);
  const dias = A.ultimosDias(AHORA, 30);
  assert.deepEqual(F.usosPorComando(G1, dias), [{ comando: "audio", total: 2 }, { comando: "s", total: 1 }]);
  assert.deepEqual(F.usosPorComando("privado", dias), [{ comando: "clima", total: 2 }], "los privados van todos a una fila");
  assert.deepEqual(F.usosPorComando(null, dias), [{ comando: "audio", total: 2 }, { comando: "s", total: 1 }], "todos los grupos, sin los privados");
  assert.deepEqual(F.usosPorComando(null, dias, { conPrivados: true }).map((f) => f.comando), ["audio", "clima", "s"]);
});

test("usos: contar nunca rompe un comando, aunque la base falle", () => {
  const baseReal = globalThis.db;
  const errorReal = console.error;
  const errores = [];
  globalThis.db = {
    prepare: () => {
      throw new Error("base caída");
    },
  };
  console.error = (...args) => errores.push(args.join(" "));
  try {
    assert.doesNotThrow(() => U.registrarUso(G1, "audio", AHORA));
  } finally {
    globalThis.db = baseReal;
    console.error = errorReal;
  }
  assert.ok(errores.some((e) => /\[usos\].*base caída/.test(e)), "el conteo falló de verdad, y quedó anotado");
});

test(".usos: en un grupo, lo de ese grupo; en general, todo junto y dónde", async () => {
  const client = globalThis.client;
  client.chats = { [G1]: { id: G1, subject: "Los Uno" } };
  client.user.lid = "59899000001@lid";
  U.registrarUso(G1, "59899000001", AHORA); // the AI by mention: the command is the bot's own number

  const grupo = (await U.textoUsos(client, { chat: G1, ahora: AHORA })).texto;
  assert.match(grupo, /^📈 \*LO MÁS USADO EN ESTE GRUPO\*\n\nDesde el 14\/1: \*4\* comandos\n\n1\. \.audio — 2 · 50%\n/, "contados desde hace menos de 30 días: dice desde cuándo");
  assert.match(grupo, /\. @mención — 1 · 25%/, "el número del bot se muestra como la mención");

  const general = (await U.textoUsos(client, { ahora: AHORA })).texto;
  assert.match(general, /^📈 \*LO MÁS USADO\*\n\nDesde el 14\/1: \*6\* comandos/, "en general entran también los privados");
  assert.match(general, /\*Dónde\*\nLos Uno: 4 · 67%\nprivados: 2 · 33%$/);

  const vacio = (await U.textoUsos(client, { chat: "nada@g.us", ahora: AHORA })).texto;
  assert.match(vacio, /No tengo usos de comandos contados de los últimos 30 días en este grupo\./);
});

test(".usos: los últimos 30 días, ni uno más", async () => {
  const G2 = "ventana@g.us";
  U.registrarUso(G2, "trivia", dia(29));
  U.registrarUso(G2, "clima", dia(30));
  U.registrarUso(G2, "clima", dia(45)); // so counting started before the window
  const texto = (await U.textoUsos(globalThis.client, { chat: G2, ahora: AHORA })).texto;
  assert.match(texto, /Últimos 30 días: \*1\* comando\n\n1\. \.trivia — 1 · 100%$/);
});

test(".usos: es para mods y el owner, y en privado muestra el general", async () => {
  assert.equal(Usos.onlyMod, true);
  assert.equal(Usos.onlyGroup, undefined, "el owner lo usa por privado");
  U.registrarUso(G1, "sorteo", new Date()); // .usos looks at the real last 30 days
  await Usos.run({ chat: G1, isGroup: true }, { client: globalThis.client });
  assert.match(ultimoEnviado().msg.text, /^📈 \*LO MÁS USADO EN ESTE GRUPO\*[\s\S]*\.sorteo — 1/);
  await Usos.run({ chat: "59899111222@s.whatsapp.net", isGroup: false }, { client: globalThis.client });
  assert.match(ultimoEnviado().msg.text, /^📈 \*LO MÁS USADO\*\n[\s\S]*\*Dónde\*/);
});

test(".podar: se lleva los usos de más de 90 días", () => {
  const G3 = "poda-usos@g.us";
  const dias = [100, 91, 90, 5].map((n) => A.claveDia(dia(n)));
  for (const n of [100, 91, 90, 5]) U.registrarUso(G3, "audio", dia(n));
  assert.ok(U.podarUsos(AHORA.getTime()) >= 2, "también se lleva lo viejo de los otros tests");
  assert.deepEqual(F.usosPorComando(G3, dias), [{ comando: "audio", total: 2 }], "quedan el de hace 90 días y el de hace 5");
  assert.equal(F.primerDiaUsos(G3), A.claveDia(dia(90)));
});

test("consistencia: handle-message cuenta el uso una vez, antes de correr el plugin", () => {
  // Before running: a command that then fails was still used. Once: two plugins sharing a command are one use.
  const fuente = fs.readFileSync(path.join(RAIZ, "handle-message.js"), "utf8");
  assert.match(fuente, /if \(!corrioAlguno\) registrarUso\(m\.chat, command\);\s*corrioAlguno = true;\s*await plugin\.run\(/);
});
