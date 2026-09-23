import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { partirTexto, sintetizar, _dep, TTS } from "../lib/tts.js";

test("tts: parte el texto como node-gtts y concatena los pedazos de audio", async () => {
  assert.deepEqual(partirTexto("Hola, ¿cómo andás? Todo bien."), ["Hola cómo andás Todo bien"]);
  const largo = Array.from({ length: 40 }, (_, i) => `palabra${i}`).join(" ");
  const pedazos = partirTexto(largo);
  assert.ok(pedazos.length > 1 && pedazos.every((p) => p.length < TTS.MAX_CHARS), `pedazos: ${pedazos.map((p) => p.length)}`);
  assert.equal(pedazos.join(" "), largo, "no se pierde ninguna palabra");
  assert.deepEqual(partirTexto(""), []);
  const urls = [];
  _dep.pedir = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([urls.length]).buffer };
  };
  const audio = await sintetizar(largo, "es");
  assert.equal(urls.length, pedazos.length);
  assert.match(urls[0], /tl=es&q=palabra0%20palabra1.*&total=\d+&idx=0&client=tw-ob&textlen=\d+$/);
  assert.deepEqual([...audio], urls.map((_, i) => i + 1), "un byte por pedazo, en orden");
  await assert.rejects(sintetizar("", "es"), /No hay texto/);
  _dep.pedir = async () => ({ ok: false, status: 429 });
  await assert.rejects(sintetizar("hola", "es"), /Google respondió 429/);
});

test("consistencia: ningún audio sale con una duración inventada", () => {
  // SawBot sent voice notes with seconds: "9999999999999". WhatsApp keeps 32 bits of it and shows what's left over the
  // whole days: a single word came out as a 1:01:51 voice note. Without the option, Baileys measures the audio. A
  // merge that brings back an old copy of these plugins would bring the number back without anything failing.
  const carpetas = ["../plugins/", "../lib/"].map((c) => new URL(c, import.meta.url));
  const archivos = carpetas.flatMap((c) => fs.readdirSync(c).filter((f) => f.endsWith(".js")).map((f) => new URL(f, c)));
  assert.ok(archivos.length > 100, `se encontraron muy pocos archivos (${archivos.length}): el escaneo no está andando`);
  const inventadas = [];
  for (const archivo of archivos) {
    fs.readFileSync(archivo, "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (/\bseconds\s*:\s*["'`]?\d/.test(linea)) inventadas.push(`${archivo.pathname.split("/").slice(-2).join("/")}:${i + 1}`);
      });
  }
  assert.deepEqual(inventadas, [], `la duración del audio la mide Baileys; no hay que pasarle seconds:\n${inventadas.join("\n")}`);
});
