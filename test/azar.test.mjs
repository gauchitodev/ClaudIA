import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirAlAzar } from "../lib/azar.js";
import { duracion } from "../lib/tiempo.js";
import txt from "../lib/strings.js";

test("azar: elegirAlAzar devuelve siempre un elemento de la lista y con el tiempo llega a todos", () => {
  const lista = ["a", "b", "c"];
  const vistos = new Set();
  for (let i = 0; i < 300; i++) {
    const x = elegirAlAzar(lista);
    assert.ok(lista.includes(x));
    vistos.add(x);
  }
  assert.equal(vistos.size, 3);
  assert.equal(elegirAlAzar(["solo"]), "solo");
});

test("afk: el tiempo inactivo se escribe con el formato corto de duracion", () => {
  const hace = Date.now() - (2 * 60 * 60 * 1000 + 5 * 60 * 1000);
  assert.match(txt.afkOn("durmiendo", hace), /2 h 5 min/);
  assert.match(txt.afkOff("123@lid", "durmiendo", hace), /@123[\s\S]*2 h 5 min/);
  assert.equal(duracion(65 * 1000), "1 min");
});

test("wa-socket: ya no parcha los prototipos nativos", async () => {
  await import("../lib/wa-socket.js");
  const parches = [
    [Array, "getRandom"],
    [String, "getRandom"],
    [String, "decodeJid"],
    [String, "isNumber"],
    [Number, "isNumber"],
    [Number, "toTimeString"],
    [Buffer, "toArrayBuffer"],
    [Buffer, "toArrayBufferV2"],
    [Buffer, "getFileType"],
    [ArrayBuffer, "toBuffer"],
  ];
  for (const [tipo, nombre] of parches) assert.equal(tipo.prototype[nombre], undefined, `${tipo.name}.prototype.${nombre}`);
});
