import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import toml from "@iarna/toml";
import { configuracion, cargarConfiguracion } from "../lib/configuracion.js";

// The settings are in lib/configuracion.js, and not on globalThis: config.toml's and the version, loaded by
// arranque.js before anything else (cargarConfiguracion), and nothing read on import, so the tests never see a
// config.toml's keys.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AQUI = process.cwd();
const ANTES = structuredClone(configuracion);
afterEach(() => {
  process.chdir(AQUI);
  for (const clave of Object.keys(configuracion)) delete configuracion[clave];
  Object.assign(configuracion, structuredClone(ANTES));
});

// What the bot runs with when config.toml sets nothing: no AI, no card, no channel, no owner.
const SIN_NADA = {
  numberBot: "",
  geminiApiKey: "",
  groqApiKey: "",
  tenorApiKey: "",
  cerebrasApiKey: "",
  openrouterApiKey: "",
  nvidiaApiKey: "",
  gemini: { modelos: [] },
  textoFaggi: "",
  vozConfig: {},
  owners: [""],
  canalConfig: { enlace: "", nombre: "" },
  tarjetaGrupo: { titulo: "ClaudIA :)", cuerpo: "Unite al grupo", enlace: "" },
  botVersion: "",
};

// A folder of its own with these files, gone when the process ends.
function carpeta(archivos) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-configuracion-"));
  process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [nombre, texto] of Object.entries(archivos)) fs.writeFileSync(path.join(dir, nombre), texto);
  return dir;
}

// Each setting of a TOML table with a value of its own, so that one read off another key shows.
const conValores = (tabla, camino = "") =>
  Object.fromEntries(
    Object.entries(tabla).map(([clave, valor]) => [
      clave,
      Array.isArray(valor) ? ["59899000001", "+598 99 000 002"] : typeof valor === "object" ? conValores(valor, `${camino}${clave}.`) : `${camino}${clave} puesto`,
    ]),
  );

test("cargarConfiguracion lee cada clave de config.example.toml, y la versión de package.json", () => {
  const puesto = conValores(toml.parse(fs.readFileSync(path.join(RAIZ, "config.example.toml"), "utf8")));
  process.chdir(carpeta({ "config.toml": toml.stringify(puesto), "package.json": JSON.stringify({ version: "9.8.7" }) }));
  assert.equal(cargarConfiguracion(), configuracion);
  // The keys of config.toml that the bot calls otherwise; the rest go by their own name. Every one of the example is
  // read, and the bot has no setting the example doesn't show.
  const NOMBRE = { textofaggi: "textoFaggi", canal: "canalConfig", voz: "vozConfig" };
  const esperado = Object.fromEntries(Object.entries(puesto).map(([clave, valor]) => [NOMBRE[clave] ?? clave, valor]));
  assert.deepEqual(configuracion, { ...esperado, botVersion: "v9.8.7" });
});

test("sin config.toml, o con uno que no se lee, lo dice y el bot queda sin nada puesto", (t) => {
  const errores = [];
  t.mock.method(console, "error", (...args) => errores.push(args[0]));
  for (const archivos of [{}, { "config.toml": "owners = [\"59899000001\"\nesto no es TOML" }]) {
    errores.length = 0;
    process.chdir(carpeta(archivos));
    cargarConfiguracion();
    // Without package.json, the version it falls back on.
    assert.deepEqual(configuracion, { ...SIN_NADA, botVersion: "v3.0.0" }, JSON.stringify(archivos));
    assert.deepEqual(errores, ["Error al cargar config.toml:", "No se pudo leer la versión de package.json:"]);
  }
});

test("una clave que falta queda sin poner, y las otras se leen igual", () => {
  process.chdir(carpeta({ "config.toml": 'owners = ["59899000001"]\n\n[voz]\nvoz = "es-AR-TomasNeural"\n', "package.json": '{"version":"1.2.3"}' }));
  cargarConfiguracion();
  assert.deepEqual(configuracion, { ...SIN_NADA, owners: ["59899000001"], vozConfig: { voz: "es-AR-TomasNeural" }, botVersion: "v1.2.3" });
});

// As the bot starts: main.js imports arranque.js first. In a process of its own, from a folder with a config.toml.
test("arranque.js la carga antes que nada: el bot arranca con la de su config.toml", () => {
  const dir = carpeta({ "config.toml": 'geminiApiKey = "la del bot"\nowners = ["59899000001"]\n', "package.json": '{"version":"9.8.7"}' });
  const codigo = `
    await import(${JSON.stringify(new URL("../arranque.js", import.meta.url).href)});
    const { configuracion } = await import(${JSON.stringify(new URL("../lib/configuracion.js", import.meta.url).href)});
    console.log(JSON.stringify([configuracion.geminiApiKey, configuracion.owners, configuracion.botVersion]));
  `;
  const salida = execFileSync(process.execPath, ["--input-type=module", "-e", codigo], { cwd: dir, encoding: "utf8", timeout: 60_000 });
  assert.deepEqual(JSON.parse(salida.trim().split("\n").at(-1)), ["la del bot", ["59899000001"], "v9.8.7"]);
});

test("importarla no lee nada: la carga el bot al arrancar, y un test no ve las claves de un config.toml", async () => {
  process.chdir(carpeta({ "config.toml": 'geminiApiKey = "de verdad"\nowners = ["59899000001"]\n', "package.json": '{"version":"9.8.7"}' }));
  const { configuracion: recienImportada } = await import(`../lib/configuracion.js?sin-cargar-${Date.now()}`);
  assert.deepEqual(recienImportada, SIN_NADA);
  // The one the tests import, too: this file loaded it from the repository's folder.
  assert.deepEqual(ANTES, SIN_NADA);
});
