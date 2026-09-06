import { test } from "node:test";
import assert from "node:assert/strict";
import { Jimp, intToRGBA } from "jimp";
import * as C from "../lib/canvas.js";

const png = (width, height, color) => new Jimp({ width, height, color }).getBuffer("image/png");
const pixel = (img, x, y) => intToRGBA(img.getPixelColor(x, y));
const cerca = (a, b, tol = 24) => Math.abs(a - b) <= tol;

test("canvas: capa sobre la foto con opacidad y escala", async () => {
  const rojo = await png(120, 80, 0xff0000ff);
  const azul = await png(30, 30, 0x0000ffff);
  const salida = await Jimp.read(await C.superponer(rojo, azul, { opacidad: 0.5 }));
  assert.deepEqual([salida.width, salida.height], [120, 80]);
  const p = pixel(salida, 60, 40);
  assert.ok(cerca(p.r, 128) && cerca(p.g, 0) && cerca(p.b, 128), `mezcla esperada violeta, salió ${JSON.stringify(p)}`);
  const escalada = await Jimp.read(await C.superponer(rojo, azul, { opacidad: 1, escala: 1.05 }));
  assert.deepEqual([escalada.width, escalada.height], [120, 80], "la foto no cambia de tamaño");
  assert.ok(cerca(pixel(escalada, 60, 40).b, 255), "la capa a escala 1,05 cubre todo");
});

test("canvas: licencia hot y bandera circular", async () => {
  const cara = await png(400, 400, 0xff0000ff);
  const tarjeta = await png(900, 600, 0x00ff00ff);
  const licencia = await Jimp.read(await C.licenciaHot(cara, tarjeta));
  assert.deepEqual([licencia.width, licencia.height], [900, 600]);
  assert.ok(cerca(pixel(licencia, 250, 300).r, 255) && cerca(pixel(licencia, 250, 300).g, 0), "la cara queda a la izquierda del centro");
  assert.ok(cerca(pixel(licencia, 850, 50).g, 255), "la esquina sigue siendo la tarjeta");
  const bandera = await png(200, 200, 0x00000000);
  const circulo = await Jimp.read(await C.banderaCircular(cara, bandera));
  assert.deepEqual([circulo.width, circulo.height], [200, 200]);
  assert.equal(pixel(circulo, 100, 100).a, 255, "el centro es la foto");
  assert.equal(pixel(circulo, 2, 2).a, 0, "la esquina queda transparente");
});

test("canvas: líneas de texto, sticker de texto y cuadros arcoíris", async () => {
  assert.deepEqual(C.partirEnLineas("hola mundo"), ["HOLA", "MUNDO"]);
  assert.deepEqual(C.partirEnLineas("uno"), ["UNO"]);
  const largo = "esta es una frase bastante larga para probar el corte en varias líneas del sticker";
  const lineas = C.partirEnLineas(largo);
  assert.ok(lineas.length >= 3 && lineas.join(" ") === largo.toUpperCase(), lineas.join("|"));
  assert.deepEqual(C.partirEnLineas(""), []);
  const sticker = await Jimp.read(await C.stickerDeTexto("HOLA"));
  assert.deepEqual([sticker.width, sticker.height], [500, 500]);
  assert.equal(pixel(sticker, 2, 2).a, 0, "fondo transparente");
  let opacos = 0;
  sticker.scan((x, y, idx) => { if (sticker.bitmap.data[idx + 3] > 10) opacos++; });
  assert.ok(opacos > 2000, `hay texto dibujado (${opacos} píxeles)`);
  const cuadros = await C.cuadrosArcoiris("A", 4);
  assert.equal(cuadros.length, 4);
  const c0 = await Jimp.read(cuadros[0]);
  const c2 = await Jimp.read(cuadros[2]);
  assert.deepEqual([c0.width, c0.height], [500, 500]);
  let punto = null;
  c0.scan((x, y, idx) => { if (!punto && c0.bitmap.data[idx + 3] > 200) punto = { x, y }; });
  assert.ok(punto, "hay píxeles opacos");
  const p0 = pixel(c0, punto.x, punto.y);
  const p2 = pixel(c2, punto.x, punto.y);
  assert.ok(cerca(p0.r, 255) && cerca(p0.g, 0) && cerca(p0.b, 0), `el primer cuadro es rojo: ${JSON.stringify(p0)}`);
  assert.ok(cerca(p2.r, 0) && cerca(p2.g, 255) && cerca(p2.b, 255), `el tercero (180°) es cian: ${JSON.stringify(p2)}`);
});

test("canvas: redimensionar y foto de perfil", async () => {
  const rojo = await png(1200, 800, 0xff0000ff);
  const chica = await Jimp.read(await C.redimensionar(rojo, 60, 40));
  assert.deepEqual([chica.width, chica.height], [60, 40]);
  const perfil = await Jimp.read(await C.fotoDePerfil(rojo, 720));
  assert.deepEqual([perfil.width, perfil.height], [720, 480]);
  assert.equal(perfil.mime, "image/jpeg");
});
