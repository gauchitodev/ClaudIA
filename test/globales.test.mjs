import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ESLint } from "eslint";
import { prepararBase, G } from "./helpers.mjs";

// What goes through globalThis: the database's connection no longer does (database-functions.js keeps it, and lib/
// imports it from there), and what the bot keeps there is a list, EN_GLOBALTHIS in eslint.config.js, that a new name
// doesn't get past.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let F, L, B;
before(async () => {
  ({ F } = await prepararBase("globales"));
  L = await import("../lib/laburos.js");
  B = await import("../lib/backup.js");
});

test("la base no hace falta en globalThis: database-functions.js tiene la suya, y lib/ la toma de ahí", async () => {
  const publicada = globalThis.db;
  delete globalThis.db; // as in the bot, where main.js no longer publishes it
  try {
    F.initDataDB({ chat: G, sender: "300000000000031@lid", senderJid: "59899000031@s.whatsapp.net", pushName: "Hornero" });
    assert.equal(F.getUser("300000000000031@lid").pushName, "Hornero");
    L.tomarLaburo(G, "300000000000031@lid", "tambero");
    assert.equal(L.laburoDe(G, "300000000000031@lid").oficio.nombre, "Tambero", "lib/laburos.js");
    assert.ok(fs.existsSync(await B.hacerBackup()), "lib/backup.js");
    assert.equal(F.db, publicada, "la de loadDatabase");
  } finally {
    globalThis.db = publicada;
  }
});

test("un loadDatabase que falla a mitad de camino deja la conexión que había", () => {
  F.initDataDB({ chat: G, sender: "300000000000032@lid", senderJid: "59899000032@s.whatsapp.net", pushName: "Benteveo" });
  const antes = F.db;
  const aca = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-no-es-sqlite-"));
  const [logReal, errorReal] = [console.log, console.error];
  try {
    process.chdir(dir);
    fs.mkdirSync("database");
    // better-sqlite3 opens it without complaint, and fails on the first query.
    fs.writeFileSync("database/database.db", "esto no es una base de SQLite ".repeat(200));
    console.log = console.error = () => {};
    assert.throws(() => F.loadDatabase(), { code: "SQLITE_NOTADB" });
  } finally {
    [console.log, console.error] = [logReal, errorReal];
    process.chdir(aca);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(F.db, antes);
  assert.equal(F.getUser("300000000000032@lid")?.pushName, "Benteveo", "y se sigue usando");
});

test("un global nuevo en globalThis no pasa el lint si no está en la lista; los tests, en cambio, usan los que quieren", async () => {
  const eslint = new ESLint({ cwd: RAIZ });
  const reglas = async (codigo, filePath) => (await eslint.lintText(codigo, { filePath }))[0].messages.map((m) => m.ruleId);
  assert.deepEqual(await reglas("globalThis.client.user;\n", "lib/x.js"), [], "uno de la lista");
  for (const [codigo, archivo] of [
    ["globalThis.estadoNuevo = new Map();\n", "lib/x.js"],
    ["globalThis.estadoNuevo = 1;\n", "plugins/x.js"],
    ["global.estadoNuevo = 1;\n", "main.js"],
  ]) {
    assert.deepEqual(await reglas(codigo, archivo), ["no-restricted-syntax"], `${archivo}: ${codigo.trim()}`);
  }
  assert.deepEqual(await reglas("globalThis.enviados = [];\n", "test/x.test.mjs"), []);
  // The database isn't one of the bare globals for the code anymore: it imports it from database-functions.js.
  assert.deepEqual(await reglas('db.prepare("SELECT 1");\n', "lib/x.js"), ["no-undef"]);
  assert.deepEqual(await reglas('db.prepare("SELECT 1");\n', "test/x.test.mjs"), []);
});

// The lint stops a global that isn't on the list; this, one that's on it and nothing uses anymore (one moved into its
// module, say), which would let it come back unnoticed.
test("la lista de globales no tiene ninguno que el código ya no use", async () => {
  const { EN_GLOBALTHIS } = await import("../eslint.config.js");
  assert.ok(EN_GLOBALTHIS, "la lista está en eslint.config.js");
  // The code at the root (database-schema.js and the rest), lib/ and plugins/.
  const archivos = fs.readdirSync(RAIZ).filter((f) => f.endsWith(".js") && f !== "eslint.config.js").map((f) => path.join(RAIZ, f));
  for (const carpeta of ["lib", "plugins"]) archivos.push(...fs.readdirSync(path.join(RAIZ, carpeta)).filter((f) => f.endsWith(".js")).map((f) => path.join(RAIZ, carpeta, f)));
  const codigo = archivos.map((a) => fs.readFileSync(a, "utf8").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n")).join("\n");
  const usados = new Set([...codigo.matchAll(/\bglobalThis\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const listados = Object.values(EN_GLOBALTHIS).flat();
  assert.deepEqual(listados.filter((n) => !usados.has(n)), []);
  assert.equal(new Set(listados).size, listados.length, "sin repetidos");
});

// Each lib/ module keeps its own state, and loading all of them leaves on globalThis only autoIaCooldown, which
// plugins/_auto-ia.js shares, and modeloActivo, the process's (lib/ia.js). The lint sees globalThis.name written out,
// not a name in brackets or built at run time. In a process of its own: here, half of lib/ is loaded already.
test("cargar lib/ no deja su estado en globalThis", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-globales-lib-"));
  try {
    const codigo = `
      const antes = new Set(Object.keys(globalThis));
      for (const f of ${JSON.stringify(fs.readdirSync(path.join(RAIZ, "lib")).filter((f) => f.endsWith(".js")).map((f) => new URL(`../lib/${f}`, import.meta.url).href))}) await import(f);
      console.log(JSON.stringify(Object.keys(globalThis).filter((k) => !antes.has(k)).sort()));
      process.exit(0);
    `;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", codigo], { cwd: dir, encoding: "utf8", timeout: 60_000, env: { ...process.env, TMPDIR: dir } });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout.trim().split("\n").at(-1)), ["autoIaCooldown", "modeloActivo"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
