// .satinf / .satvis and their stickers (plugins/tools-satelite.js, lib/satelite.js): GOES-19's animation from NOAA,
// as a video or a sticker. No network and no ffmpeg here: both are swapped, and the results go to a temp folder.
import { test, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { animacion, luzVisible, SATELITE, _dep, _pruebas } from "../lib/satelite.js";
import Plugin from "../plugins/tools-satelite.js";

const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(64, 7)]);
// A real WebP of 1x1: addExif has to be able to open what goes out as a sticker.
const WEBP = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
const URL_13 = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/ssa/13/GOES19-SSA-13-900x540.gif";
const URL_02 = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/ssa/02/GOES19-SSA-02-900x540.gif";
const original = { ..._dep };
const base = fs.mkdtempSync(path.join(os.tmpdir(), "satelite-"));

let pedidos; // [url, If-None-Match]
let conversiones; // ffmpeg's arguments, one per run
let numero = 0;

// NOAA, answering with what `responder` gives for each request.
function noaa(responder) {
  _dep.fetch = async (url, opciones = {}) => {
    pedidos.push([String(url), opciones.headers?.["If-None-Match"] ?? null]);
    return responder(String(url), opciones);
  };
}
const conGif = (etag = '"uno"', cuerpo = GIF) => new Response(cuerpo, { status: 200, headers: etag ? { etag } : {} });

// ffmpeg, leaving in the folder what `producir` gives for those arguments, as lib/ffmpeg.js does.
function ffmpegFalso(producir = (args, ext) => (ext === "webp" ? WEBP : Buffer.from("un mp4"))) {
  _dep.ffmpeg = async (entrada, args, ext, ext2) => {
    conversiones.push(args);
    assert.deepEqual([entrada, ext], [GIF, "gif"]);
    const data = producir(args, ext2);
    const filename = path.join(_dep.carpeta, `${++numero}.gif.${ext2}`);
    fs.writeFileSync(filename, data);
    return { data, filename, delete: () => fs.promises.unlink(filename) };
  };
}

beforeEach(() => {
  mock.timers.reset();
  _pruebas.reiniciar();
  pedidos = [];
  conversiones = [];
  _dep.carpeta = fs.mkdtempSync(path.join(base, "tmp-"));
  noaa(() => conGif());
  ffmpegFalso();
});
after(() => {
  mock.timers.reset();
  Object.assign(_dep, original);
  fs.rmSync(base, { recursive: true, force: true });
});

test("el video se arma una vez: después sale el guardado, y pasados 5 minutos se confirma con el ETag", async () => {
  mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 18, 15) });
  assert.equal((await animacion("infrarrojo")).toString(), "un mp4");
  assert.deepEqual(pedidos, [[URL_13, null]]);
  assert.equal(conversiones.length, 1);
  assert.ok(conversiones[0].includes("libx264") && conversiones[0].includes("error"), "a mp4, y sin llenar el stderr que nadie lee");
  assert.deepEqual(fs.readdirSync(_dep.carpeta), ["satelite-infrarrojo.mp4"], "en la carpeta queda solo el resultado");

  mock.timers.tick(SATELITE.VIGENCIA_MS - 1);
  await animacion("infrarrojo");
  assert.equal(pedidos.length, 1, "dentro de los 5 minutos no se le pregunta nada a NOAA");

  // past that, it's asked with the ETag: the same animation isn't downloaded or converted again
  mock.timers.tick(1);
  noaa(() => new Response(null, { status: 304 }));
  assert.equal((await animacion("infrarrojo")).toString(), "un mp4");
  assert.deepEqual(pedidos[1], [URL_13, '"uno"']);
  await animacion("infrarrojo");
  assert.deepEqual([pedidos.length, conversiones.length], [2, 1], "y el 304 vale por otros 5 minutos");

  // a new animation replaces it
  mock.timers.tick(SATELITE.VIGENCIA_MS);
  noaa(() => conGif('"dos"'));
  ffmpegFalso(() => Buffer.from("otro mp4"));
  assert.equal((await animacion("infrarrojo")).toString(), "otro mp4");
  assert.equal(fs.readFileSync(path.join(_dep.carpeta, "satelite-infrarrojo.mp4"), "utf8"), "otro mp4");
  mock.timers.tick(SATELITE.VIGENCIA_MS);
  noaa(() => new Response(null, { status: 304 }));
  await animacion("infrarrojo");
  assert.equal(pedidos.at(-1)[1], '"dos"');
});

test("cada banda y cada formato va por su lado, y dos pedidos iguales a la vez comparten el trabajo", async () => {
  const [a, b, c, d] = await Promise.all([animacion("visible"), animacion("visible"), animacion("visible", true), animacion("infrarrojo", true)]);
  assert.equal(a, b);
  assert.deepEqual([a.toString(), c, d], ["un mp4", WEBP, WEBP]);
  assert.deepEqual(pedidos.map(([url]) => url).sort(), [URL_02, URL_02, URL_13]);
  assert.equal(conversiones.length, 3);
  assert.deepEqual(fs.readdirSync(_dep.carpeta).sort(), ["satelite-infrarrojo.webp", "satelite-visible.mp4", "satelite-visible.webp"]);
});

test("si la limpieza de tmp se llevó el resultado, se baja entero de nuevo, sin ETag", async () => {
  await animacion("infrarrojo");
  fs.rmSync(path.join(_dep.carpeta, "satelite-infrarrojo.mp4"));
  noaa((url, { headers }) => (headers["If-None-Match"] ? new Response(null, { status: 304 }) : conGif()));
  assert.equal((await animacion("infrarrojo")).toString(), "un mp4");
  assert.deepEqual(pedidos, [[URL_13, null], [URL_13, null]]);
  assert.equal(conversiones.length, 2);
});

test("el sticker baja de calidad hasta entrar en 500 KB, y si no entra falla", async () => {
  const filtroDe = (args) => args[args.indexOf("-vf") + 1];
  const calidadDe = (args) => args[args.indexOf("-quality") + 1];
  // too heavy at 320 px, fits at 256
  ffmpegFalso((args) => (filtroDe(args).includes("scale=320") ? Buffer.alloc(SATELITE.MAX_STICKER_BYTES + 1) : Buffer.alloc(SATELITE.MAX_STICKER_BYTES)));
  assert.equal((await animacion("infrarrojo", true)).length, SATELITE.MAX_STICKER_BYTES);
  assert.deepEqual(conversiones.map((args) => [calidadDe(args), filtroDe(args)]), [
    ["35", "fps=6.25,crop=360:360:270:90,scale=320:320:flags=lanczos"],
    ["20", "fps=6.25,crop=360:360:270:90,scale=320:320:flags=lanczos"],
    ["30", "fps=6.25,crop=360:360:270:90,scale=256:256:flags=lanczos"],
  ]);
  assert.deepEqual(fs.readdirSync(_dep.carpeta), ["satelite-infrarrojo.webp"], "los intentos que no entraron se borran");

  _pruebas.reiniciar();
  conversiones = [];
  ffmpegFalso(() => Buffer.alloc(SATELITE.MAX_STICKER_BYTES + 1));
  await assert.rejects(animacion("visible", true), /no baja de 500 KB/);
  assert.equal(conversiones.length, 4);
  assert.deepEqual(fs.readdirSync(_dep.carpeta), ["satelite-infrarrojo.webp"]);
});

test("lo que NOAA manda mal no se convierte, y el pedido siguiente lo intenta de nuevo", async () => {
  const malas = [
    [() => new Response("no", { status: 503 }), /NOAA respondió 503/],
    [() => new Response("<html>mantenimiento</html>", { status: 200 }), /no devolvió un GIF/],
    [() => new Response(GIF, { status: 200, headers: { "content-length": String(SATELITE.MAX_BYTES + 1) } }), /demasiado grande/],
    [() => Promise.reject(new Error("sin red")), /sin red/],
  ];
  for (const [responder, error] of malas) {
    noaa(responder);
    await assert.rejects(animacion("infrarrojo"), error);
  }
  assert.equal(conversiones.length, 0);
  // ffmpeg failing (lib/ffmpeg.js rejects with its exit code) doesn't leave the queue stuck
  noaa(() => conGif());
  _dep.ffmpeg = async () => Promise.reject(1);
  await assert.rejects(animacion("infrarrojo"), (e) => e === 1);
  ffmpegFalso();
  assert.equal((await animacion("infrarrojo")).toString(), "un mp4");
});

test("luzVisible: de día sí, de noche con tarde en la animación parcial, y de madrugada en invierno no", () => {
  assert.equal(luzVisible(Date.UTC(2026, 10, 18, 15)), "si"); // noon in Uruguay
  assert.equal(luzVisible(Date.UTC(2026, 10, 19, 2)), "parcial"); // 23:00: the sun set three and a half hours ago
  assert.equal(luzVisible(Date.UTC(2026, 5, 21, 8)), "no"); // 05:00 in June: it set eleven hours ago, and rises in three
  assert.equal(luzVisible(Date.UTC(2026, 5, 21, 10, 30)), "parcial"); // half an hour before sunrise: it's light in Brazil
});

test("los cuatro comandos: video con su leyenda, sticker con EXIF, y de noche el visible avisa", async () => {
  assert.deepEqual([Plugin.cmd, Plugin.botAdmin], [["satinf", "ssatinf", "satvis", "ssatvis"], true]);
  const textos = [];
  const archivos = [];
  const client = { sendText: async (chat, texto) => textos.push(texto), sendFile: async (chat, archivo, nombre, leyenda) => archivos.push({ archivo, nombre, leyenda }) };
  const correr = async (command) => {
    textos.length = archivos.length = 0;
    await Plugin.run({ chat: "g@g.us", react: async () => {} }, { client, command, usedPrefix: "." });
  };

  mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 18, 15) });
  await correr("satinf");
  assert.deepEqual(textos, []);
  assert.deepEqual([archivos[0].archivo.toString(), archivos[0].nombre], ["un mp4", "satelite.mp4"]);
  assert.equal(archivos[0].leyenda, "🛰️ *GOES-19* · infrarrojo (banda 13) · sur de Sudamérica, últimas 8 horas\n_Fuente: NOAA/NESDIS/STAR._");
  await correr("satvis");
  assert.equal(archivos[0].leyenda, "🛰️ *GOES-19* · luz visible (banda 2) · sur de Sudamérica, últimas 8 horas\n_Fuente: NOAA/NESDIS/STAR._");
  await correr("ssatvis");
  assert.ok(archivos[0].archivo.includes("sticker-pack-id"), "el sticker sale con su EXIF");
  assert.deepEqual([archivos[0].nombre, archivos[0].leyenda], [null, null]);
  assert.deepEqual(pedidos.map(([url]) => url), [URL_13, URL_02, URL_02]);

  // at night: the video says its end is dark, and with no daylight in the 8 hours nothing is sent at all
  mock.timers.setTime(Date.UTC(2026, 10, 19, 2));
  await correr("satvis");
  assert.match(archivos[0].leyenda, /últimas 8 horas\n🌙 Ya es de noche: el final sale oscuro\. \.satinf se ve igual\.\n_Fuente/);
  await correr("satinf");
  assert.doesNotMatch(archivos[0].leyenda, /noche/, "el infrarrojo se ve igual de noche");
  mock.timers.setTime(Date.UTC(2026, 5, 21, 8));
  const antes = pedidos.length;
  await correr("satvis");
  assert.match(textos[0], /^🌙 Es de noche hace rato .* Probá con \.satinf, /);
  await correr("ssatvis");
  assert.match(textos[0], /Probá con \.ssatinf, /);
  assert.deepEqual([archivos.length, pedidos.length], [0, antes]);
  await correr("ssatinf");
  assert.equal(archivos.length, 1);

  // NOAA down: said to whoever asked, without the details, which go to the log
  _pruebas.reiniciar();
  noaa(() => new Response("no", { status: 500 }));
  const errores = mock.method(console, "error", () => {});
  await correr("satinf");
  assert.deepEqual([textos, archivos.length], [["❌ No pude traer la imagen del satélite. Probá de nuevo en un rato."], 0]);
  assert.match(errores.mock.calls[0].arguments.join(" "), /\.satinf.*NOAA respondió 500/);
  errores.mock.restore();
});
