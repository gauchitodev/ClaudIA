import { test } from "node:test";
import assert from "node:assert/strict";

// Baileys importa jimp de forma dinámica (import("jimp")) para las miniaturas de las imágenes que manda el bot: si
// falta, tira "No image processing library available". Como ningún archivo del repo lo importa, un grep no lo ve;
// este test evita que se vuelva a sacar de package.json por "no usarse".
test("jimp 1.x está instalado para las miniaturas de Baileys", async () => {
  const jimp = await import("jimp");
  assert.equal(typeof jimp.Jimp, "function");
  assert.ok(jimp.ResizeStrategy?.BILINEAR, "Baileys usa ResizeStrategy.BILINEAR");
});

test("el logger silencioso de pino sirve para Baileys", async () => {
  const { default: pino } = await import("pino");
  const { makeCacheableSignalKeyStore } = await import("@whiskeysockets/baileys");
  const logger = pino({ level: "silent" });
  assert.equal(logger.level, "silent");
  assert.doesNotThrow(() => logger.child({ modulo: "test" }).info("nada"));
  const store = makeCacheableSignalKeyStore({ get: async () => ({}), set: async () => {} }, logger);
  assert.equal(typeof store.get, "function");
});
