import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { nodosQue } from "./helpers.mjs";

// The lint's boundary around who is who (eslint.config.js): only lib/identidad.js asks the database who is who, and the
// plugins take only the versions that ask WhatsApp whom a message names; and lib/identidad.js imports nothing of the
// bot's but the database. They lived in test/identidad.test.mjs, which with them went over CI's 30 s for a file on
// Node 22.

let F, I, Parejas;
before(async () => {
  F = await import("../database-functions.js");
  I = await import("../lib/identidad.js");
  Parejas = await import("../lib/parejas.js");
});

// The rule ids of the lint's boundaries (no-restricted-*) a snippet gets as this file, each once: a sum is
// prefer-template's too, in the tests as well. One that doesn't parse fails: filtered out with the rest, a broken
// snippet passed as one the lint let through.
let eslint;
async function reglas(codigo, filePath) {
  eslint ??= new ESLint({ cwd: fileURLToPath(new URL("..", import.meta.url)) });
  const [{ messages }] = await eslint.lintText(codigo, { filePath });
  const fatal = messages.find((m) => m.fatal);
  assert.equal(fatal, undefined, `no parsea como ${filePath}: ${fatal?.message}\n${codigo}`);
  return [...new Set(messages.map((m) => m.ruleId).filter((regla) => regla?.startsWith("no-restricted")))].sort();
}

// The commands go through the versions that ask (lidMencionadoActual, lidsMencionadosActual, deQuienEsActual,
// destinatarioActual, dosPersonasActual): one with a version that only guesses brought back, in a group that lists
// people by number alone, whoever had the number before. The lint keeps the ones that guess out of the plugins
// (ADIVINAN, eslint.config.js), whichever way they're brought in: by name or another, off the whole module, through
// import() or require, or handed on by another module. Read as text, the whole module destructured under other names
// got past, and so did import() and a module handing them on.
test("un plugin que resuelve a quién nombra un mensaje sin preguntarle a WhatsApp no pasa el lint", async () => {
  const formas = [
    ['import { destinatario as aQuien } from "../lib/identidad.js";\naQuien(m);\n', ["no-restricted-imports"]],
    ['import * as Identidad from "../lib/identidad.js";\nconst { deQuienEs: deQuien } = Identidad;\ndeQuien(m);\n', ["no-restricted-imports"]],
    ['import * as I from "../lib/identidad.js";\nI["destinatario"](m);\n', ["no-restricted-imports"]],
    ['export const f = (m) => import("../lib/identidad.js").then(({ deQuienEs: q }) => q(m));\n', ["no-restricted-syntax"]],
    ['const I = await import("../lib/identidad.js");\nconst { lidMencionado: lm } = I;\nlm(m);\n', ["no-restricted-syntax"]],
    ['const { dosPersonas: dos } = await import("../lib/parejas.js");\ndos(m);\n', ["no-restricted-syntax"]],
    ['import { createRequire } from "node:module";\nexport const I = createRequire(import.meta.url)("../lib/identidad.js");\n', ["no-restricted-syntax"]],
    ['import { createRequire } from "node:module";\nexport const I = createRequire(import.meta.url)("../lib/identidad");\n', ["no-restricted-syntax"]],
    ['export { destinatario } from "../lib/identidad.js";\n', ["no-restricted-imports", "no-restricted-syntax"]],
  ];
  for (const [codigo, esperadas] of formas) {
    assert.deepEqual(await reglas(codigo, "plugins/x.js"), esperadas, codigo.split("\n")[0]);
    assert.deepEqual(await reglas(codigo, "test/x.test.mjs"), [], `en un test: ${codigo.split("\n")[0]}`);
  }
  // lib/ builds on them (lib/parejas.js on lidDeDigitos), and doesn't hand them on, under their name or another.
  assert.deepEqual(await reglas('import { destinatario } from "./identidad.js";\nexport const f = (m) => destinatario(m);\n', "lib/x.js"), []);
  for (const codigo of ['export { destinatario as aQuien } from "./identidad.js";\n', 'export { "lidDeDigitos" as digitos } from "./identidad.js";\n', 'export * from "./parejas.js";\n']) assert.deepEqual(await reglas(codigo, "lib/x.js"), ["no-restricted-syntax"], codigo);
  assert.deepEqual(await reglas('export * from "./lib/identidad.js";\n', "x.js"), ["no-restricted-syntax"], "ni desde la raíz");
  assert.deepEqual(await reglas('import { lidMencionadoActual, destinatarioActual } from "../lib/identidad.js";\nlidMencionadoActual(destinatarioActual);\n', "plugins/x.js"), [], "las que preguntan, sí");
});

// One way only: lib/menciones.js and the rest import lib/identidad.js, which imports nothing of the bot's but the
// database and the connection, lib/conexion.js, which imports nothing at all (the socket and who the bot is used to be
// read off globalThis). When it imported lib/menciones.js, whatever both needed had to live there, where it didn't
// belong. Every file named in its code, as a string or a template, whichever way it's brought in: import, export …
// from, import(), require or createRequire's, or new URL. Read as text, only paths with ./ or ../ in front counted,
// and new URL("menciones.js", import.meta.url) got past.
test("lib/identidad.js no importa nada del bot más que la base y la conexión, que no importa nada", async () => {
  const archivos = async (codigo) => (await nodosQue("Literal[value=/\\.[cm]?js$/], TemplateElement[value.raw=/\\.[cm]?js$/]", codigo)).map((n) => (n.type === "Literal" ? n.value : n.value.raw));
  const formas = ['import "./a.js";', "import { b } from './b.js';", 'export * from "./c.js";', "await import(`./d.js`);", "require('./e.js');", 'createRequire(import.meta.url)("./f.js");', 'await import(new URL("g.js", import.meta.url));', '// import "./comentado.js";', "import.meta.url;"];
  assert.deepEqual(await archivos(formas.join("\n")), ["./a.js", "./b.js", "./c.js", "./d.js", "./e.js", "./f.js", "g.js"]);
  const fuente = fs.readFileSync(new URL("../lib/identidad.js", import.meta.url), "utf8");
  assert.deepEqual([...new Set(await archivos(fuente))].sort(), ["../database-functions.js", "./conexion.js"]);
  assert.deepEqual(await archivos(fs.readFileSync(new URL("../lib/conexion.js", import.meta.url), "utf8")), []);
});

// Whichever way the import is written: by name, the whole module, handed on, or through import() or a call that isn't
// a method's (require, or createRequire's, kept in a variable or not, straight or through call, apply or
// Reflect.apply), with the file's name in the path as a string, a template or a sum, with or without the extension, or
// with %-escapes; and a row's LID or number read off getUser, with a fallback or a ternary, destructured from it, or
// with getUser renamed: lidDeNumero or jidDeLid by another name. A method's call, as fs.readFileSync, reads the file
// and passes, and so do fs's, path's and url's functions imported by name, as this code imports them: taken for a way
// in, they didn't pass. A path put together elsewhere, or a row kept in a variable, is out of the lint's sight.
// lib/identidad.js asks, and keeps the rules on import() and globals; the tests look into the database freely; and
// the rest of the database is open to everyone.
test("pedirle a la base quién es quién fuera de lib/identidad.js no pasa el lint", async () => {
  const conGetUser = (cuerpo) => `import { getUser } from "../database-functions.js";\n${cuerpo}`;
  const conCargar = (cuerpo) => `import { createRequire } from "node:module";\nconst cargar = createRequire(import.meta.url);\n${cuerpo}`;
  const pedidos = [
    ['import { lidDeNumero } from "../database-functions.js";\nlidDeNumero("x");\n', "no-restricted-imports"],
    ['import { getUser, esOwner as owner } from "../database-functions.js";\nowner(getUser("x"));\n', "no-restricted-imports"],
    ['import * as F from "../database-functions.js";\nF.getUser("x");\n', "no-restricted-imports"],
    ['export { jidDeLid } from "../database-functions.js";\n', "no-restricted-imports"],
    ['export * from "./database-functions.js";\n', "no-restricted-imports"],
    ['export const base = () => import("../database-functions.js");\n', "no-restricted-syntax"],
    ["export const base = () => import(`../database-functions.js`);\n", "no-restricted-syntax"],
    ["export const base = (dir) => import(`${dir}/database-functions.js`);\n", "no-restricted-syntax"],
    ['export const base = (dir) => import(dir + "/database-functions.js");\n', "no-restricted-syntax"],
    ['export const base = () => import(new URL("../database-functions.js", import.meta.url));\n', "no-restricted-syntax"],
    ['import { lidDeNumero } from "../database%2Dfunctions.js";\nlidDeNumero("x");\n', "no-restricted-syntax"],
    ['import { createRequire } from "node:module";\nexport const F = createRequire(import.meta.url)("../database-functions.js");\n', "no-restricted-syntax"],
    ['import { createRequire } from "node:module";\nexport const F = createRequire(import.meta.url)("../database-functions");\n', "no-restricted-syntax"],
    ['import { createRequire } from "node:module";\nexport const F = createRequire(import.meta.url)(`../database-functions.js`);\n', "no-restricted-syntax"],
    ['import { createRequire } from "node:module";\nexport const F = (dir) => createRequire(import.meta.url)(dir + "/database-functions.js");\n', "no-restricted-syntax"],
    [conCargar('export const F = cargar("../database-functions.js");\n'), "no-restricted-syntax"],
    [conCargar('export const F = cargar.call(null, "../database-functions.js");\n'), "no-restricted-syntax"],
    [conCargar('export const F = cargar.apply(null, ["../database-functions.js"]);\n'), "no-restricted-syntax"],
    [conCargar('export const F = Reflect.apply(cargar, null, ["../database-functions.js"]);\n'), "no-restricted-syntax"],
    [conGetUser("export const numero = (lid) => getUser(lid)?.jid;\n"), "no-restricted-syntax"],
    [conGetUser('export const numero = (lid) => getUser(lid)["jid"];\n'), "no-restricted-syntax"],
    [conGetUser("export const numero = (lid) => (getUser(lid) || {}).jid;\n"), "no-restricted-syntax"],
    [conGetUser("export const lid = (x) => (getUser(x) ?? {}).lid;\n"), "no-restricted-syntax"],
    [conGetUser("export const numero = (lid) => (lid ? getUser(lid) : null)?.jid;\n"), "no-restricted-syntax"],
    [conGetUser("export const numero = (lid) => {\n  const { jid } = getUser(lid);\n  return jid;\n};\n"), "no-restricted-syntax"],
    [conGetUser("export const numero = (lid) => {\n  const { jid } = getUser(lid) || {};\n  return jid;\n};\n"), "no-restricted-syntax"],
    [conGetUser("export const numero = (lid) => {\n  const { jid } = lid ? getUser(lid) : {};\n  return jid;\n};\n"), "no-restricted-syntax"],
    [conGetUser("export const numero = (lid) => (!lid ? {} : getUser(lid)).jid;\n"), "no-restricted-syntax"],
    [conGetUser('export const numero = (lid) => {\n  const { "jid": n } = getUser(lid) || {};\n  return n;\n};\n'), "no-restricted-syntax"],
    [conGetUser("let jid;\nexport const numero = (lid) => ({ jid } = getUser(lid));\n"), "no-restricted-syntax"],
    [conGetUser("let jid;\nexport const numero = (lid) => ({ jid } = getUser(lid) || {});\n"), "no-restricted-syntax"],
    ['import { getUser as fila } from "../database-functions.js";\nexport const numero = (lid) => fila(lid)?.jid;\n', "no-restricted-syntax"],
    ['import { "getUser" as fila } from "../database-functions.js";\nexport const numero = (lid) => fila(lid)?.jid;\n', "no-restricted-syntax"],
    ['export { getUser as fila } from "../database-functions.js";\n', "no-restricted-syntax"],
    [conGetUser("export { getUser as fila };\n"), "no-restricted-syntax"],
    [conGetUser("const fila = getUser;\nexport const numero = (lid) => fila(lid)?.jid;\n"), "no-restricted-syntax"],
    [conGetUser("let fila;\nfila = getUser;\nexport const numero = (lid) => fila(lid)?.jid;\n"), "no-restricted-syntax"],
    ['export { "getUser" as fila } from "../database-functions.js";\n', "no-restricted-syntax"],
  ];
  for (const [codigo, regla] of pedidos) {
    for (const archivo of ["plugins/x.js", "lib/x.js", "x.js"]) assert.deepEqual(await reglas(codigo, archivo), [regla], `${archivo}: ${codigo.split("\n").at(-2)}`);
    assert.deepEqual(await reglas(codigo, "test/x.test.mjs"), [], `en un test: ${codigo.split("\n").at(-2)}`);
  }
  assert.deepEqual(await reglas('import { lidDeNumero, jidDeLid } from "../database-functions.js";\nlidDeNumero(jidDeLid("x"));\n', "lib/identidad.js"), []);
  assert.deepEqual(await reglas(conGetUser("export const numero = (lid) => getUser(lid)?.jid;\n"), "lib/identidad.js"), []);
  assert.deepEqual(await reglas('export const base = () => import("../database-functions.js");\n', "lib/identidad.js"), ["no-restricted-syntax"], "lib/identidad.js tampoco por import()");
  assert.deepEqual(await reglas(conGetUser('getUser("x");\n'), "plugins/x.js"), [], "lo demás de la base, sí");
  // What isn't a way into it: reading the file, its address, a file with a name like it, another field of a row, or a
  // row kept as it is; getUser handed on by its name, or another module's function named so under another name.
  const noPiden = [
    'import fs from "node:fs";\nexport const texto = () => fs.readFileSync("database-functions.js", "utf8");\n',
    'import fs from "node:fs";\nexport const texto = () => fs.readFileSync.call(fs, "database-functions.js");\n',
    'import { readFileSync } from "node:fs";\nexport const texto = () => readFileSync("database-functions.js", "utf8");\n',
    'import { existsSync } from "fs";\nexport const esta = () => existsSync("./database-functions.js");\n',
    'import { join } from "path";\nexport const donde = (dir) => join(dir + "/database-functions.js");\n',
    'export const donde = new URL("../database-functions.js", import.meta.url);\n',
    'export const otra = () => import("./copia-de-database-functions.js");\n',
    conGetUser("export const nombre = (lid) => {\n  const { pushName } = getUser(lid) || {};\n  return pushName;\n};\n"),
    conGetUser("export const fila = (lid) => (lid ? getUser(lid) : null);\n"),
    conGetUser("export { getUser };\n"),
    'import { getUser as fila } from "./otro.js";\nexport const numero = (x) => fila(x).jid;\n',
  ];
  for (const codigo of noPiden) assert.deepEqual(await reglas(codigo, "plugins/x.js"), [], codigo.split("\n").at(-2));
});

// A name on the list that database-functions.js no longer exports stops nothing: renamed, the function would be open to
// every file again. And so for the versions that guess, out of lib/identidad.js and lib/parejas.js; and each one that
// has a version that asks (…Actual) guesses, and is on the list: one left off it was open to the plugins again.
test("cada nombre de las listas del lint sigue exportado donde las busca", async () => {
  const { SOLO_IDENTIDAD, ADIVINAN } = await import("../eslint.config.js");
  assert.ok(SOLO_IDENTIDAD.length > 0 && ADIVINAN.length > 0);
  for (const nombre of SOLO_IDENTIDAD) assert.equal(typeof F[nombre], "function", nombre);
  for (const nombre of ADIVINAN) assert.equal(typeof (I[nombre] ?? Parejas[nombre]), "function", nombre);
  const conLaQuePregunta = [I, Parejas].flatMap((modulo) => Object.keys(modulo).filter((nombre) => typeof modulo[`${nombre}Actual`] === "function"));
  assert.deepEqual(conLaQuePregunta.filter((nombre) => !ADIVINAN.includes(nombre)), []);
  assert.ok(conLaQuePregunta.length >= 5, conLaQuePregunta.join(", "));
});
