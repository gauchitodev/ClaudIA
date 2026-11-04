import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { nodosQue } from "./helpers.mjs";

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

// Baileys builds a preview of every link in a message the bot sends whenever it can import link-preview-js: the tablet
// would fetch the page and download its picture, outside lib/descarga-segura.js, and with
// generateHighQualityLinkPreview it would upload that picture to WhatsApp too. It's an optional peer of Baileys that
// nothing installs, and so it has to stay: like jimp, a grep doesn't show it, since Baileys asks for it on its own.
test("link-preview-js no está instalado, y main.js no pide vistas previas de links", async () => {
  await assert.rejects(import("link-preview-js"), { code: "ERR_MODULE_NOT_FOUND" }, "con link-preview-js, la tablet baja cada link que manda el bot");
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const pedidas = await nodosQue('Property[key.name="generateHighQualityLinkPreview"], Property[key.value="generateHighQualityLinkPreview"]', main);
  assert.deepEqual(pedidas.map((n) => `main.js:${n.loc.start.line}`), [], "main.js pide vistas previas de links");
});
