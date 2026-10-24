import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Waiting on WhatsApp with a cap of CONSULTA_MS (lidSegunWhatsApp in lib/identidad.js, protegidosDe in
// lib/inactivos.js): the cap keeps the process going while it lasts, and once there's an answer it doesn't hold it up.
// Each case runs in a process of its own with nothing else going, so only the wait can keep it alive: in the test
// runner's own process, Node 24 and later keep a pending test going themselves, and a cap that didn't only failed on
// Node 22. A process with nothing left to do and an await still pending ends with code 13.
const HELPERS = new URL("./helpers.mjs", import.meta.url).href;
const IDENTIDAD = new URL("../lib/identidad.js", import.meta.url).href;
const INACTIVOS = new URL("../lib/inactivos.js", import.meta.url).href;
const X = "59899000961@s.whatsapp.net";

// Runs codigo as a module in a new node, cut at 25 s: how it ended, and the lines it printed that start with "→". Its
// temporary files (prepararBase's database) go in a folder of its own, removed here: cut, it can't remove them itself.
function enOtroProceso(codigo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-esperas-"));
  try {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", codigo], { cwd: dir, encoding: "utf8", timeout: 25_000, env: { ...process.env, TMPDIR: dir } });
    return { codigo: r.status, senal: r.signal, lineas: r.stdout.split("\n").filter((l) => l.startsWith("→")) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("esperar la respuesta de WhatsApp mantiene vivo el proceso hasta el tope, y no lo demora después", () => {
  const r = enOtroProceso(`
    const I = await import(${JSON.stringify(IDENTIDAD)});
    I.IDENTIDAD.CONSULTA_MS = 50;
    console.log("→ sin respuesta:", await I.lidSegunWhatsApp({ executeUSyncQuery: () => new Promise(() => {}) }, ${JSON.stringify(X)}));
    I.IDENTIDAD.CONSULTA_MS = 60_000;
    const enSeguida = async () => ({ list: [{ id: ${JSON.stringify(X)}, lid: "300000000000962@lid" }] });
    console.log("→ con respuesta:", await I.lidSegunWhatsApp({ executeUSyncQuery: enSeguida }, ${JSON.stringify(X)}));
  `);
  // Ended by itself right after the answer, not when the cap's minute was up: it would have been cut at 25 s.
  assert.deepEqual(r, { codigo: 0, senal: null, lineas: ["→ sin respuesta: null", "→ con respuesta: 300000000000962@lid"] });
});

test("también la de .inactivos, que le pregunta al mapa de WhatsApp por los owners que la base no conoce", () => {
  const r = enOtroProceso(`
    const { prepararBase } = await import(${JSON.stringify(HELPERS)});
    await prepararBase("esperas");
    const I = await import(${JSON.stringify(INACTIVOS)});
    const cliente = (getLIDsForPNs) => ({ signalRepository: { lidMapping: { getPNsForLIDs: async () => [], getLIDsForPNs } } });
    I.INACTIVOS.CONSULTA_MS = 50;
    console.log("→ sin respuesta:", [...(await I.protegidosDe(cliente(() => new Promise(() => {})), "grupo@g.us"))].join(" "));
    I.INACTIVOS.CONSULTA_MS = 60_000;
    const enSeguida = async () => [{ pn: "59899111222@s.whatsapp.net", lid: "300000000000970@lid" }];
    console.log("→ con respuesta:", [...(await I.protegidosDe(cliente(enSeguida), "grupo@g.us"))].join(" "));
  `);
  // The owner prepararBase sets, whose LID the database doesn't know.
  assert.deepEqual(r, { codigo: 0, senal: null, lineas: ["→ sin respuesta: 59899111222@s.whatsapp.net", "→ con respuesta: 59899111222@s.whatsapp.net 300000000000970@lid"] });
});
