import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clienteFalso, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";
import { evaluar } from "../lib/calculadora.js";

// .calc used to eval() what people typed, behind a character whitelist. lib/calculadora.js does the arithmetic and
// nothing else.

before(() => {
  globalThis.txt = strings;
});

test("calculadora: las cuentas de siempre, con la precedencia de siempre", () => {
  for (const [cuenta, resultado] of [
    ["4+3", 7],
    ["2+3*4", 14],
    ["(2+3)*4", 20],
    ["10-4-3", 3], // left to right
    ["100/10/2", 5],
    ["2**3**2", 512], // right to left, as in JavaScript
    ["-2**2", -4], // what anyone typing it means (JavaScript rejects it)
    ["(-2)**2", 4],
    ["2**-1", 0.5],
    ["6*-2", -12],
    ["--3", 3],
    ["+5", 5],
    ["3.5*2", 7],
    [".5+.5", 1],
    ["7.", 7],
    ["((((1))))+1", 2],
    ["2 + 3", 5],
  ]) {
    assert.equal(evaluar(cuenta), resultado, cuenta);
  }
  assert.equal(evaluar("1/0"), Infinity);
  assert.ok(Number.isNaN(evaluar("0/0")));
});

test("calculadora: lo que no es una cuenta se rechaza, y nada se ejecuta", () => {
  for (const cuenta of ["", "   ", "2+", "(2", "2)", "()", "2 3", "(1)(2)", "1.2.3", "*3", "2***3", "4x2", "abc", "2+[]", "globalThis.tocado=1"]) {
    assert.throws(() => evaluar(cuenta), Error, JSON.stringify(cuenta));
  }
  assert.equal(globalThis.tocado, undefined, "lo que escribió la gente no corrió como código");
});

test(".calc: resuelve con x como por, y contesta también cuando no entiende", async () => {
  const P = (await import("../plugins/tools-calcular.js")).default;
  const client = clienteFalso();
  const calc = async (text) => {
    await P.run({ chat: "calc@g.us", sender: "a@lid", isGroup: true }, { client, text, usedPrefix: ".", command: "calc" });
    return ultimoEnviado().msg.text;
  };

  assert.equal(await calc("2 + 3 x 4"), strings.calcSuccess("2 + 3 x 4", 14));
  assert.equal(await calc("(10 - 4) / 3"), strings.calcSuccess("(10 - 4) / 3", 2));
  assert.equal(await calc("2 +"), strings.calcInvalida, "eval tiraba un error que solo iba al log, y la persona no recibía nada");
  assert.equal(await calc("2 + a"), strings.calcCaracteresNull);
  assert.equal(await calc(""), strings.calcNull(".", "calc"));

  // A cap on the length: 149 nested brackets are fine, a longer expression is turned down before the evaluator sees it.
  assert.equal(await calc(`${"(".repeat(149)}1${")".repeat(149)}`), strings.calcSuccess(`${"(".repeat(149)}1${")".repeat(149)}`, 1));
  assert.equal(await calc(`${"(".repeat(151)}1${")".repeat(151)}`), strings.calcInvalida);
});

// ---------- consistency: scanning the source ----------
// A merge that brings back an old copy of a file (it has happened) would bring eval back without anything failing.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const archivosDe = (carpeta) =>
  fs
    .readdirSync(path.join(RAIZ, carpeta))
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(RAIZ, carpeta, f));

test("consistencia: nadie en el bot vuelve a usar eval", () => {
  const fuentes = [...archivosDe("."), ...archivosDe("lib"), ...archivosDe("plugins")];
  assert.ok(fuentes.length > 100, `se encontraron muy pocos archivos (${fuentes.length}): el escaneo no está andando`);
  const usan = [];
  for (const archivo of fuentes) {
    fs.readFileSync(archivo, "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (/^\s*(\/\/|\*)/.test(linea)) return; // comments mention it
        if (/\beval\s*\(|new Function\s*\(/.test(linea)) usan.push(`${path.relative(RAIZ, archivo)}:${i + 1}`);
      });
  }
  assert.deepEqual(usan, [], `eval corre como código lo que le pasen; para cuentas está lib/calculadora.js:\n${usan.join("\n")}`);
});
