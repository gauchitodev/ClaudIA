import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clienteFalso, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";
import { evaluar, normalizar, mostrar, ErrorDeCuenta } from "../lib/calculadora.js";

// .calc used to eval() what people typed, behind a character whitelist. lib/calculadora.js does the arithmetic and
// nothing else: percentages as a phone's calculator takes them, the signs its keyboard gives, results anyone can read,
// and a word for what has no result, where it said Infinity or NaN.

before(() => {
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
});

test("calculadora: lo que no es una cuenta se rechaza, y nada se ejecuta", () => {
  for (const cuenta of ["", "   ", "2+", "(2", "2)", "()", "2 3", "(1)(2)", "1.2.3", "*3", "2***3", "4x2", "abc", "2+[]", "globalThis.tocado=1"]) {
    assert.throws(() => evaluar(cuenta), Error, JSON.stringify(cuenta));
  }
  assert.equal(globalThis.tocado, undefined, "lo que escribió la gente no corrió como código");
});

// As a phone's calculator does: a percentage added or taken away on its own is a share of what comes before it, and
// anywhere else it's a hundredth. "de" follows one: "2 de 3" is no sum.
test("calculadora: los porcentajes, como en la calculadora del celular", () => {
  for (const [cuenta, resultado] of [
    ["10%", "0.1"],
    ["1500+10%", "1650"],
    ["1500-20%", "1200"],
    ["1500*10%", "150"],
    ["1500/10%", "15000"],
    ["20%de1500", "300"],
    ["50%de20%de1000", "100"],
    ["2*50%de100", "100"],
    ["1500+10%+10%", "1815"], // each one, of what's there by then
    ["1500+20%de1000", "1700"], // 20% de 1000 is a number, not a percentage on its own
    ["(1000+500)*10%", "150"],
    ["(10+10)%", "0.2"],
    ["1500+(10)%", "1650"],
    ["1500+-10%", "1350"],
    ["10%+1500", "1500.1"],
    ["3*7%", "0.21"],
  ]) {
    assert.equal(mostrar(evaluar(cuenta)), resultado, cuenta);
  }
  for (const cuenta of ["2de3", "de5", "5%%", "%5", "10%de", "1500+de10%", "10%*de5"]) {
    assert.throws(() => evaluar(cuenta), Error, cuenta);
  }
});

test("calculadora: ^ es potencia, y los signos del teclado del celular se leen como los de siempre", () => {
  assert.deepEqual(
    ["3 × 4", "6 X 2", "10 ÷ 2", "2 − 3", "20 % DE 1 500"].map(normalizar),
    ["3*4", "6*2", "10/2", "2-3", "20%de1500"],
  );
  for (const [cuenta, resultado] of [
    ["2^10", 1024],
    ["2^3^2", 512],
    ["2**3^2", 512],
    ["-2^2", -4],
    ["2^-1", 0.5],
    ["(-2)^3", -8],
    ["-8^(1/3)", -2], // -(8 ^ (1/3)), as -2 ^ 2 is -(2 ^ 2)
  ]) {
    assert.equal(evaluar(cuenta), resultado, cuenta);
  }
  // The dot is the decimal point, as it's typed: 1.500 is one and a half.
  assert.equal(evaluar(normalizar("1.500 x 3")), 4.5);
});

test("calculadora: lo que no tiene resultado lo dice, con su motivo, en vez de Infinity o NaN", () => {
  for (const [motivo, cuentas] of Object.entries({
    cero: ["1/0", "0/0", "5/(2-2)", "0^-1", "1/0%"],
    grande: ["10^400", `1${"0".repeat(400)}`, "10^308*10", "10^308+10^308", "9^9^9"],
    negativa: ["(-8)^(1/3)", "(-2)^0.5", "(0-4)^1.5"],
  })) {
    for (const cuenta of cuentas) {
      assert.throws(() => evaluar(cuenta), (e) => e instanceof ErrorDeCuenta && e.motivo === motivo, cuenta);
    }
  }
  assert.throws(() => evaluar("2+"), (e) => !(e instanceof ErrorDeCuenta), "lo que no es una cuenta no tiene motivo");
});

// Rounded to 15 significant digits: what binary leaves over goes, and every integer under a quadrillion stays whole.
// From there up, and under a millionth, a power of ten, which .calc reads back as it is.
test("calculadora: el resultado, redondeado, con punto decimal y sin separar los miles", () => {
  for (const [numero, texto] of [
    [0.1 + 0.2, "0.3"],
    [-0.30000000000000004, "-0.3"],
    [1 / 3, "0.333333333333333"],
    [2 / 3, "0.666666666666667"],
    [1234567.5, "1234567.5"],
    [999999999999999, "999999999999999"],
    [1e15, "1 × 10^15"],
    [2 ** 50, "1.12589990684262 × 10^15"],
    [1e21, "1 × 10^21"],
    [-1.5e21, "-1.5 × 10^21"],
    [0.000001, "0.000001"],
    [1.5e-7, "1.5 × 10^-7"],
    [0, "0"],
    [-0, "0"],
  ]) {
    assert.equal(mostrar(numero), texto, String(numero));
  }
  for (const texto of ["1 × 10^21", "1.12589990684262 × 10^15", "1.5 × 10^-7", "-1.5 × 10^21"]) {
    assert.equal(mostrar(evaluar(normalizar(texto))), texto, `${texto}, de vuelta en .calc`);
  }
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

  // Percentages, the phone's signs and results anyone can read: it said 0.30000000000000004 and 1e+21.
  for (const [cuenta, resultado] of [
    ["1500 + 10%", "1650"],
    ["1500 - 20%", "1200"],
    ["20% de 1500", "300"],
    ["3 × 4", "12"],
    ["10 ÷ 4", "2.5"],
    ["2^10", "1024"],
    ["2 − 3", "-1"],
    ["0.1 + 0.2", "0.3"],
    ["10 ** 21", "1 × 10^21"],
    ["1.500 * 3", "4.5"],
  ]) {
    assert.equal(await calc(cuenta), strings.calcSuccess(cuenta, resultado), cuenta);
  }
  // What has no result says why, where it said Infinity or NaN.
  assert.equal(await calc("1/0"), "No se puede dividir entre cero.");
  assert.equal(await calc("0/0"), strings.calcCero);
  assert.equal(await calc("10^400"), strings.calcGrande);
  assert.equal(await calc("(-8)^(1/3)"), strings.calcNegativa);
  // A comma isn't the decimal point: the answer says it goes with a dot.
  assert.equal(await calc("2,5 + 1"), strings.calcCaracteresNull);
});

test(".calc: sus textos, de vos y con lo que entiende hoy", () => {
  const textos = [strings.calcNull(".", "calc"), strings.calcCaracteresNull, strings.calcInvalida, strings.calcCero, strings.calcGrande, strings.calcNegativa];
  assert.deepEqual(
    textos.filter((t) => /ingres|por favor|operadores \(\+, -, \*, \/\)/i.test(t)),
    [],
    "decían «Por favor ingresa» y que solo entendía + - * /",
  );
  assert.match(strings.calcNull(".", "calc"), /^Escribí la cuenta, por ejemplo:\n\.calc 4 \+ 3\n\.calc 6 x 2\n\.calc 1500 \+ 10%$/);
  for (const parte of ["los decimales con punto", "+ - x ÷", "^", "1500 + 10%", "20% de 1500", "paréntesis"]) {
    assert.ok(strings.calcCaracteresNull.includes(parte), parte);
  }
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
