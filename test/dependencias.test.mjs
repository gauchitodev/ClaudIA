import { test } from "node:test";
import assert from "node:assert/strict";

// Baileys imports jimp dynamically (import("jimp")) for the thumbnails of the images the bot sends: without it, it
// throws "No image processing library available". Since no file in the repo imports it, a grep won't find it; this
// test keeps it from being dropped from package.json again for "not being used".
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
