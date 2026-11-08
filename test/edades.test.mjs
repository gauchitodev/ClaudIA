import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import { cargados } from "../lib/plugins-cargados.js";

// .agedist (.distedad, .edades): how the group's ages spread, from the birthdays noted with the year
// (lib/cumpleanos.js, plugins/cumple-edades.js). Each test in a group of its own, on a day of its own.
const AHORA = new Date(2026, 10, 2, 12); // 2 de noviembre de 2026

let F, C, Plugin;
before(async () => {
  ({ F } = await prepararBase("edades"));
  C = await import("../lib/cumpleanos.js");
  Plugin = (await import("../plugins/cumple-edades.js")).default;
});

// The birthdays of a group: [id, "dd/mm/aaaa" or "dd/mm"].
function anotar(chat, cumples) {
  for (const [id, fecha] of cumples) {
    const [dia, mes, anio] = fecha.split("/").map(Number);
    F.setCumple(chat, id, dia, mes, anio);
  }
}
const lineas = (texto) => texto.split("\n");

test("edades: tramos de 5 alineados, los vacíos también, promedio, mediana, generaciones y quiénes no cuentan", () => {
  const Z = "edades-5@g.us";
  anotar(Z, [
    ["a@lid", "08/10/1997"], // 29, Gen Z
    ["b@lid", "05/11/1996"], // 29 (the 5th hasn't come), Millennials
    ["c@lid", "01/01/1990"], // 36
    ["d@lid", "15/06/2000"], // 26, Gen Z
    ["e@lid", "20/12/1985"], // 40
    ["f@lid", "10/03/1975"], // 51, Gen X
    ["g@lid", "10/01"], // without the year
    ["h@lid", "01/02/1999"], // gone from the group
  ]);
  const { texto } = C.textoEdades(Z, { ahora: AHORA, enElGrupo: (lid) => lid !== "h@lid" });
  assert.deepEqual(lineas(texto), [
    "📊 *Edades del grupo* (6 con el año · tramos de 5 años)",
    "```25-29 ███ 3",
    "30-34  0",
    "35-39 █ 1",
    "40-44 █ 1",
    "45-49  0",
    "50-54 █ 1```",
    "Promedio 35,2 · mediana 32,5 · de 26 a 51 años",
    "🧬 Generaciones: Gen X 1 · Millennials 3 · Gen Z 2",
    "1 anotó su cumple sin el año y no cuenta.",
    "No cuento a 1 que ya no está en el grupo.",
  ]);
  // with no list of the group, whoever left counts too
  assert.match(C.textoEdades(Z, { ahora: AHORA }).texto, /^📊 \*Edades del grupo\* \(7 con el año · tramos de 5 años\)\n/);
  assert.doesNotMatch(C.textoEdades(Z, { ahora: AHORA }).texto, /ya no está/);

  // bands of 1 and of 2: the age alone, and aligned to the even ages
  const deUno = lineas(C.textoEdades(Z, { ahora: AHORA, enElGrupo: (lid) => lid !== "h@lid", ancho: 1 }).texto);
  assert.equal(deUno[0], "📊 *Edades del grupo* (6 con el año · tramos de 1 año)");
  assert.deepEqual(deUno.slice(1, 5), ["```26 █ 1", "27  0", "28  0", "29 ██ 2"]);
  assert.equal(deUno.slice(1, deUno.findIndex((l) => l.endsWith("```")) + 1).length, 26, "de 26 a 51, todos");
  const deDos = lineas(C.textoEdades(Z, { ahora: AHORA, enElGrupo: (lid) => lid !== "h@lid", ancho: 2 }).texto);
  assert.deepEqual(deDos.slice(1, 3), ["```26-27 █ 1", "28-29 ██ 2"]);
  assert.match(deDos.find((l) => l.endsWith("```")), /^50-51 █ 1```$/);
});

test("edades: los cortes de generación de Pew, y la mediana con cantidad impar", () => {
  const Z = "edades-generaciones@g.us";
  anotar(Z, [1980, 1981, 1996, 1997, 2012, 2013].map((anio, i) => [`g${i}@lid`, `01/01/${anio}`]));
  assert.match(C.textoEdades(Z, { ahora: AHORA }).texto, /\n🧬 Generaciones: Gen X 1 · Millennials 2 · Gen Z 2 · Gen Alpha 1\n?/);
  const Y = "edades-impar@g.us";
  anotar(Y, [["x@lid", "01/01/2006"], ["y@lid", "01/01/2001"], ["z@lid", "01/01/1986"]]); // 20, 25, 40
  assert.match(C.textoEdades(Y, { ahora: AHORA }).texto, /\nPromedio 28,3 · mediana 25 · de 20 a 40 años\n/);
  const W = "edades-viejos@g.us";
  anotar(W, [["v1@lid", "01/01/1920"], ["v2@lid", "01/01/1950"], ["v3@lid", "01/01/1930"]]);
  assert.match(C.textoEdades(W, { ahora: AHORA, ancho: 10 }).texto, /\n🧬 Generaciones: Grandiosa 1 · Silenciosa 1 · Boomers 1$/);
});

test("edades: con menos de 3 con el año lo dice, y con demasiadas barras sugiere tramos más anchos", () => {
  const Z = "edades-pocos@g.us";
  assert.equal(C.textoEdades(Z, { ahora: AHORA }).texto, "📊 Para ver cómo se reparten las edades hacen falta al menos 3 cumples con el año, y hay 0. Anotá el tuyo con .cumple 08/10/1997");
  anotar(Z, [["a@lid", "01/01/1990"], ["b@lid", "01/01/1991"], ["c@lid", "10/01"]]);
  assert.match(C.textoEdades(Z, { ahora: AHORA }).texto, /al menos 3 cumples con el año, y hay 2\./);
  const Y = "edades-anchas@g.us";
  anotar(Y, [["a@lid", "01/01/2015"], ["b@lid", "01/01/1940"], ["c@lid", "01/01/1980"]]); // 11, 86, 46
  assert.equal(C.textoEdades(Y, { ahora: AHORA, ancho: 1 }).texto, "📊 Con tramos de 1 año salen 76 barras: probá con .agedist 2 o más.");
  assert.match(C.textoEdades(Y, { ahora: AHORA, ancho: 2 }).texto, /tramos de 2 años/, "39 barras sí entran");
});

test("edades: el tramo más poblado se escala a 20 bloques, y ninguno con gente queda sin bloque", () => {
  const Z = "edades-muchos@g.us";
  anotar(Z, [...Array.from({ length: 25 }, (_, i) => [`m${i}@lid`, "01/01/1996"]), ["solo@lid", "01/01/1985"]]); // 25 de 30, 1 de 41
  const filas = lineas(C.textoEdades(Z, { ahora: AHORA }).texto);
  assert.equal(filas[1], `\`\`\`30-34 ${"█".repeat(20)} 25`);
  assert.equal(filas[3], "40-44 █ 1```");
});

test(".agedist: tramos de 5 o de n, de 1 a 20; otra cosa explica el uso; sin arrobar; .edades y .distedad son lo mismo", async () => {
  assert.deepEqual([Plugin.cmd, Plugin.onlyGroup, Plugin.juego, Plugin.economia], [["agedist", "distedad", "edades"], true, undefined, undefined]);
  const Z = "edades-plugin@g.us";
  anotar(Z, [["a@lid", "08/10/1997"], ["b@lid", "05/11/1990"], ["c@lid", "15/06/2000"], ["d@lid", "01/02/1980"]]);
  const client = clienteFalso();
  const pedir = async (text, participants = [{ id: "a@lid" }, { id: "b@lid" }, { id: "c@lid" }, { id: "bot@lid" }]) => {
    await Plugin.run({ chat: Z, sender: "a@lid", isGroup: true }, { client, text, usedPrefix: ".", participants });
    return globalThis.enviados.at(-1).msg;
  };
  const cinco = await pedir("");
  assert.match(cinco.text, /^📊 \*Edades del grupo\* \(3 con el año · tramos de 5 años\)\n/);
  assert.match(cinco.text, /\nNo cuento a 1 que ya no está en el grupo\.$/, "d no está en la lista del grupo");
  assert.equal(cinco.mentions, undefined, "sin arrobar");
  assert.match((await pedir("2")).text, /tramos de 2 años/);
  assert.match((await pedir("1")).text, /tramos de 1 año\)/);
  assert.match((await pedir("", [])).text, /\(4 con el año/, "sin la lista del grupo, cuentan todos");
  for (const text of ["0", "21", "cinco", "2.5", "-3"]) {
    assert.equal((await pedir(text)).text, "Para tramos de otro tamaño: .agedist 2 (de 1 a 20 años por tramo). Solo, en tramos de 5.", text);
  }
  // with a space after the dot, the parser takes only a command a loaded plugin declares, as in the bot
  const { parsearComando } = await import("../lib/comandos.js");
  const antes = cargados.plugins;
  cargados.plugins = { "cumple-edades.js": Plugin };
  try {
    for (const escrito of [".edades 2", ".distedad", ". agedist", ".AGEDIST 3"]) assert.ok(Plugin.cmd.includes(parsearComando(escrito, ["."])?.comando), escrito);
  } finally {
    cargados.plugins = antes;
  }
});
