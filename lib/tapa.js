// The front page of the Sunday paper (lib/pueblo-diario.js), drawn by code with jimp: the masthead, the date line,
// the main headline with its picture, the other headlines in two columns, the weather, the town's numbers and a
// quote from one of its characters, on old newspaper paper. The picture is drawn here too (a woodcut of the town under
// the week's weather, with something of the main headline in it), unless Gemini drew one (lib/pueblo-diario.js,
// ilustrar), which goes in the same box, toned to match.
// The fonts are bitmap ones made from Liberation Serif (scripts/fuentes-tapa.mjs, resources/tapa/). jimp can't draw
// what a font doesn't have, so emojis and anything outside Latin-1 are left out of the image (the caption has them).
import { Jimp, JimpMime, loadFont, measureText } from "jimp";
import { leerImagen } from "./canvas.js";

export const TAPA = {
  ANCHO: 1080,
  ALTO: 1350,
  MARGEN: 40,
  PAPEL: [242, 234, 214],
  TINTA: [28, 24, 20],
  SEPIA: [112, 84, 52],
  ILUSTRACION_ALTO: 330,
  RECUADROS_ALTO: 112, // the weather, the numbers and the quote, above the footer
};

const DIR = `${import.meta.dirname}/../resources/tapa`;
const fuentes = {};
async function fuente(nombre) {
  fuentes[nombre] ??= await loadFont(`${DIR}/${nombre}.fnt`);
  return fuentes[nombre];
}

const rgba = ([r, g, b], a = 255) => ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;

// Only what the font can draw: the rest (emojis, mostly) goes, and the brackets and spaces it leaves are tidied.
export function paraLaFuente(texto, font) {
  return [...String(texto || "")]
    .filter((c) => /\s/.test(c) || font.chars[c])
    .join("")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.:;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// The words in lines no wider than ancho (in the font's own pixels).
export function partir(font, texto, ancho) {
  const lineas = [];
  let actual = "";
  for (const palabra of texto.split(" ").filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && measureText(font, prueba) > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// A block of text: wrapped to ancho (on the page), printed at the font's size times escala, up to maxLineas (the last
// one with "…" if it didn't fit), aligned left or centred. Returns the image, to be composited.
async function bloque(nombre, texto, { ancho, escala = 1, maxLineas = 99, centrado = false, interlineado = 1, color = TAPA.TINTA }) {
  const font = await fuente(nombre);
  const limpio = paraLaFuente(texto, font);
  let lineas = partir(font, limpio, ancho / escala);
  if (lineas.length > maxLineas) {
    lineas = lineas.slice(0, maxLineas);
    let ultima = lineas.at(-1);
    while (ultima.length > 1 && measureText(font, `${ultima}…`) > ancho / escala) ultima = ultima.slice(0, -1);
    lineas[maxLineas - 1] = `${ultima.trimEnd()}…`;
  }
  const alto = font.common.lineHeight;
  const paso = Math.round(alto * interlineado);
  const w = Math.max(1, Math.ceil(ancho / escala));
  const img = new Jimp({ width: w, height: Math.max(1, paso * (lineas.length - 1) + alto), color: 0x00000000 });
  lineas.forEach((l, i) => img.print({ font, x: centrado ? Math.round((w - measureText(font, l)) / 2) : 0, y: i * paso, text: l }));
  if (color !== TAPA.TINTA) teñir(img, color);
  if (escala !== 1) img.resize({ w: Math.max(1, Math.round(w * escala)), h: Math.max(1, Math.round(img.height * escala)) });
  return img;
}

// Paints every pixel that has ink in it with a colour, keeping its alpha.
function teñir(img, [r, g, b]) {
  img.scan((x, y, i) => {
    if (img.bitmap.data[i + 3] === 0) return;
    img.bitmap.data[i] = r;
    img.bitmap.data[i + 1] = g;
    img.bitmap.data[i + 2] = b;
  });
}

// ---------- shapes ----------
function rect(img, x, y, w, h, color) {
  const c = rgba(color);
  for (let yy = Math.max(0, Math.round(y)); yy < Math.min(img.height, Math.round(y + h)); yy++) for (let xx = Math.max(0, Math.round(x)); xx < Math.min(img.width, Math.round(x + w)); xx++) img.setPixelColor(c, xx, yy);
}
function circulo(img, cx, cy, r, color) {
  const c = rgba(color);
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (x >= 0 && y >= 0 && x < img.width && y < img.height && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) img.setPixelColor(c, x, y);
}
function triangulo(img, [ax, ay], [bx, by], [cx, cy], color) {
  const c = rgba(color);
  const area = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  for (let y = Math.floor(Math.min(ay, by, cy)); y <= Math.max(ay, by, cy); y++) {
    for (let x = Math.floor(Math.min(ax, bx, cx)); x <= Math.max(ax, bx, cx); x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const a = area(ax, ay, bx, by, x, y);
      const b = area(bx, by, cx, cy, x, y);
      const d = area(cx, cy, ax, ay, x, y);
      if ((a >= 0 && b >= 0 && d >= 0) || (a <= 0 && b <= 0 && d <= 0)) img.setPixelColor(c, x, y);
    }
  }
}
function linea(img, x0, y0, x1, y1, color, grosor = 2) {
  const pasos = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= pasos; i++) rect(img, x0 + ((x1 - x0) * i) / pasos - grosor / 2, y0 + ((y1 - y0) * i) / pasos - grosor / 2, grosor, grosor, color);
}

// A pseudo-random number from a seed, so the same paper is drawn the same way.
function sembrar(semilla) {
  let s = 0;
  for (const c of String(semilla)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ---------- the picture ----------
// The woodcut: the town on its hills under the week's weather, with what the main headline is about in front.
// motivo: the headline's kind (lib/pueblo-diario.js), clima: "lluvia", "temporal", "sol", "seca", "nublado".
export function dibujarVineta(ancho, alto, { motivo = "", clima = "sol", semilla = "" } = {}) {
  const azar = sembrar(semilla || motivo);
  const img = new Jimp({ width: ancho, height: alto, color: rgba([236, 226, 204]) });
  const oscuro = clima === "temporal" || clima === "lluvia";
  // The sky: light lines across, closer together lower down (the engraving's shading).
  for (let y = 0; y < alto * 0.7; y += oscuro ? 3 : 5 + Math.floor((y / alto) * 6)) linea(img, 0, y, ancho, y, oscuro ? [150, 135, 112] : [205, 192, 166], 1);
  if (clima === "sol" || clima === "seca") {
    const r = clima === "seca" ? 70 : 50;
    circulo(img, ancho * 0.8, alto * 0.22, r, [60, 48, 36]);
    circulo(img, ancho * 0.8, alto * 0.22, r - 6, [236, 226, 204]);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      linea(img, ancho * 0.8 + Math.cos(a) * (r + 10), alto * 0.22 + Math.sin(a) * (r + 10), ancho * 0.8 + Math.cos(a) * (r + 30), alto * 0.22 + Math.sin(a) * (r + 30), [60, 48, 36], 3);
    }
  } else {
    for (let i = 0; i < 4; i++) {
      const cx = ancho * (0.15 + i * 0.25 + azar() * 0.05);
      const cy = alto * (0.12 + azar() * 0.1);
      for (let j = 0; j < 4; j++) circulo(img, cx + (j - 1.5) * 34, cy + (j % 2) * 12, 34, oscuro ? [70, 60, 50] : [190, 176, 150]);
    }
  }
  if (oscuro) {
    for (let i = 0; i < 160; i++) {
      const x = azar() * ancho;
      const y = alto * 0.2 + azar() * alto * 0.75;
      linea(img, x, y, x - 10, y + 26, [90, 80, 70], 1);
    }
  }
  if (clima === "temporal") {
    const x = ancho * 0.3;
    const rayo = [[x, 70], [x - 30, 150], [x + 5, 150], [x - 35, 250]];
    for (let i = 0; i < rayo.length - 1; i++) linea(img, ...rayo[i], ...rayo[i + 1], [245, 238, 210], 7);
  }
  // The hills, back and front.
  for (const [base, amp, color] of [[0.62, 30, [120, 104, 80]], [0.74, 18, [72, 60, 46]]]) {
    for (let x = 0; x < ancho; x++) {
      const y = Math.round(alto * base + Math.sin(x / 90 + base * 10) * amp + Math.sin(x / 37) * 6);
      rect(img, x, y, 1, alto - y, color);
    }
  }
  // The town: houses with their roofs, the church with its tower and the water tank.
  const tinta = [40, 32, 26];
  const suelo = alto * 0.66;
  for (let i = 0; i < 9; i++) {
    const w = 40 + azar() * 40;
    const h = 30 + azar() * 35;
    const x = ancho * 0.05 + i * (ancho * 0.1) + azar() * 20;
    rect(img, x, suelo - h, w, h, tinta);
    triangulo(img, [x - 6, suelo - h], [x + w + 6, suelo - h], [x + w / 2, suelo - h - 22], tinta);
    rect(img, x + w * 0.35, suelo - h * 0.6, w * 0.25, h * 0.3, [220, 200, 150]);
  }
  // The church (its tower, roof and cross) and the water tank, sized to the picture so the cross always shows.
  const ix = ancho * 0.46;
  const torre = alto * 0.36;
  rect(img, ix, suelo - torre, 46, torre, tinta);
  triangulo(img, [ix - 4, suelo - torre], [ix + 50, suelo - torre], [ix + 23, suelo - torre - alto * 0.13], tinta);
  rect(img, ix + 21, suelo - torre - alto * 0.2, 4, alto * 0.08, tinta);
  rect(img, ix + 12, suelo - torre - alto * 0.175, 22, 4, tinta);
  rect(img, ix - 60, suelo - alto * 0.17, 70, alto * 0.17, tinta);
  rect(img, ancho * 0.9, suelo - alto * 0.28, 50, alto * 0.1, tinta);
  for (const dx of [5, 40]) rect(img, ancho * 0.9 + dx, suelo - alto * 0.18, 5, alto * 0.18, tinta);
  dibujarMotivo(img, motivo, { ancho, alto, tinta, azar });
  // The frame.
  for (const [x, y, w, h] of [[0, 0, ancho, 4], [0, alto - 4, ancho, 4], [0, 0, 4, alto], [ancho - 4, 0, 4, alto]]) rect(img, x, y, w, h, tinta);
  return img;
}

// Something of the headline in the front of the picture.
function dibujarMotivo(img, motivo, { ancho, alto, tinta, azar }) {
  const piso = alto * 0.9;
  const claro = [236, 226, 204];
  if (motivo === "fiesta" || motivo === "campeonato_ganado" || motivo === "intendente") {
    // Garlands of little flags across the sky.
    for (let g = 0; g < 2; g++) {
      const y0 = alto * (0.18 + g * 0.12);
      for (let x = 0; x < ancho; x += 34) {
        const y = y0 + Math.sin((x / ancho) * Math.PI) * 40;
        triangulo(img, [x, y], [x + 26, y], [x + 13, y + 26], g ? [90, 70, 50] : tinta);
      }
    }
  }
  if (motivo.startsWith("campeonato")) {
    // A goal and the ball.
    const gx = ancho * 0.12;
    rect(img, gx, piso - 110, 8, 110, claro);
    rect(img, gx + 180, piso - 110, 8, 110, claro);
    rect(img, gx, piso - 110, 188, 8, claro);
    for (let x = gx + 10; x < gx + 180; x += 14) linea(img, x, piso - 100, x, piso, [200, 190, 170], 1);
    circulo(img, ancho * 0.62, piso - 24, 24, claro);
    circulo(img, ancho * 0.62, piso - 24, 9, tinta);
  }
  if (["paro", "empresa", "robo_encargo", "multinacional", "servicio"].includes(motivo)) {
    // A truck on the road.
    const x = ancho * 0.08;
    rect(img, x, piso - 80, 200, 70, claro);
    rect(img, x + 200, piso - 60, 70, 50, claro);
    rect(img, x + 215, piso - 52, 34, 22, tinta);
    for (const dx of [30, 150, 230]) {
      circulo(img, x + dx, piso - 8, 20, claro);
      circulo(img, x + dx, piso - 8, 9, tinta);
    }
    if (motivo === "paro") {
      // And the picket's fire.
      for (let i = 0; i < 5; i++) triangulo(img, [ancho * 0.7 + i * 14, piso], [ancho * 0.7 + i * 14 + 20, piso], [ancho * 0.7 + i * 14 + 10, piso - 50 - azar() * 30], claro);
    }
  }
  if (motivo.startsWith("robo") && motivo !== "robo_encargo") {
    // The safe, wide open.
    const x = ancho * 0.6;
    rect(img, x, piso - 130, 130, 130, claro);
    rect(img, x + 10, piso - 120, 110, 110, tinta);
    rect(img, x + 130, piso - 128, 60, 120, claro);
    circulo(img, x + 160, piso - 70, 14, tinta);
  }
  if (motivo === "espia") {
    // A hat and a pair of eyes in the dark.
    const x = ancho * 0.7;
    rect(img, x - 70, piso - 120, 140, 14, tinta);
    rect(img, x - 40, piso - 170, 80, 52, tinta);
    circulo(img, x - 18, piso - 90, 8, claro);
    circulo(img, x + 18, piso - 90, 8, claro);
  }
  if (motivo === "seca" || motivo === "fundido") {
    // Cracks in the ground.
    for (let i = 0; i < 14; i++) {
      const x = azar() * ancho;
      const y = alto * 0.8 + azar() * alto * 0.15;
      linea(img, x, y, x + 30 - azar() * 60, y + 18, claro, 2);
    }
  }
}

// A picture from elsewhere (Gemini's), cut to the box and toned like the paper: sepia, a little washed out.
export async function entonarIlustracion(origen, ancho, alto) {
  const img = await leerImagen(origen);
  img.cover({ w: ancho, h: alto });
  img.greyscale();
  img.scan((x, y, i) => {
    const v = img.bitmap.data[i] / 255;
    img.bitmap.data[i] = Math.round(40 + v * 200);
    img.bitmap.data[i + 1] = Math.round(32 + v * 192);
    img.bitmap.data[i + 2] = Math.round(24 + v * 176);
  });
  for (const [x, y, w, h] of [[0, 0, ancho, 4], [0, alto - 4, ancho, 4], [0, 0, 4, alto], [ancho - 4, 0, 4, alto]]) rect(img, x, y, w, h, [40, 32, 26]);
  return img;
}

// ---------- the page ----------
// diario: { nombre ("El Eco de Villa Porfía"), fechaTexto, numero, anio, lema, titulares: [{ titulo, bajada, motivo }]
// (the first is the main one), clima: { texto, tipo }, numeros: { prosperidad, seguridad, humor, impuesto },
// cita: { quien, texto }, pie }. ilustracion: a picture (Buffer) for the main headline, or null to draw one.
// Returns the PNG.
export async function dibujarTapa(diario, { ilustracion = null } = {}) {
  const { ANCHO, ALTO, MARGEN } = TAPA;
  const util = ANCHO - 2 * MARGEN;
  const azar = sembrar(`${diario.nombre}|${diario.numero}`);
  const tapa = new Jimp({ width: ANCHO, height: ALTO, color: rgba(TAPA.PAPEL) });
  // The paper's grain and its yellowed edges.
  tapa.scan((x, y, i) => {
    const borde = Math.min(x, y, ANCHO - x, ALTO - y);
    const amarillo = borde < 60 ? (60 - borde) / 3 : 0;
    const grano = (azar() - 0.5) * 14;
    tapa.bitmap.data[i] = Math.max(0, Math.min(255, tapa.bitmap.data[i] + grano - amarillo * 0.4));
    tapa.bitmap.data[i + 1] = Math.max(0, Math.min(255, tapa.bitmap.data[i + 1] + grano - amarillo * 0.7));
    tapa.bitmap.data[i + 2] = Math.max(0, Math.min(255, tapa.bitmap.data[i + 2] + grano - amarillo * 1.2));
  });
  const poner = (img, x, y) => {
    tapa.composite(img, Math.round(x), Math.round(y));
    return y + img.height;
  };
  const regla = (y, grosor = 2) => rect(tapa, MARGEN, y, util, grosor, TAPA.TINTA);

  // Date line, masthead and the line under it.
  let y = 28;
  const fecha = await bloque("serif-cursiva-28", `Año ${diario.anio} · N.º ${diario.numero} · ${diario.fechaTexto} · Precio: 5 UruCoins`, { ancho: util, centrado: true, color: TAPA.SEPIA });
  y = poner(fecha, MARGEN, y) + 6;
  regla(y, 2);
  y += 10;
  const fontTitulo = await fuente("serif-negrita-96");
  const nombre = paraLaFuente(diario.nombre, fontTitulo);
  const escalaCabezal = Math.min(1.05, util / Math.max(1, measureText(fontTitulo, nombre)));
  const cabezal = await bloque("serif-negrita-96", nombre, { ancho: util, escala: escalaCabezal, maxLineas: 1, centrado: true });
  y = poner(cabezal, MARGEN, y - 4);
  const lema = await bloque("serif-cursiva-28", diario.lema, { ancho: util, centrado: true, maxLineas: 1 });
  y = poner(lema, MARGEN, y + 2) + 8;
  regla(y, 5);
  regla(y + 8, 1);
  y += 22;

  // The main headline, its picture and its lead.
  const [principal, ...otros] = diario.titulares;
  const titular = await bloque("serif-negrita-96", principal.titulo, { ancho: util, escala: 0.62, maxLineas: 2, centrado: true, interlineado: 0.92 });
  y = poner(titular, MARGEN, y) + 10;
  const caja = ilustracion ? await entonarIlustracion(ilustracion, util, TAPA.ILUSTRACION_ALTO).catch(() => null) : null;
  const dibujo = caja || dibujarVineta(util, TAPA.ILUSTRACION_ALTO, { motivo: principal.motivo, clima: diario.clima.tipo, semilla: `${diario.nombre}${diario.numero}` });
  y = poner(dibujo, MARGEN, y) + 6;
  const pieFoto = await bloque("serif-cursiva-28", caja ? "Ilustración: archivo de la redacción." : "Grabado de la redacción.", { ancho: util, color: TAPA.SEPIA });
  y = poner(pieFoto, MARGEN, y) + 4;
  const bajada = await bloque("serif-30", principal.bajada, { ancho: util, maxLineas: 2 });
  y = poner(bajada, MARGEN, y) + 14;
  regla(y, 2);
  y += 16;

  // The other headlines in two columns, each in the shorter one, as many as fit above the boxes.
  const pieY = ALTO - MARGEN - 34;
  const columna = (util - 30) / 2;
  const recuadrosY = pieY - 14 - TAPA.RECUADROS_ALTO;
  const alturas = [y, y];
  const breves = [];
  for (const t of otros) {
    const col = alturas[0] <= alturas[1] ? 0 : 1;
    const x = MARGEN + col * (columna + 30);
    const tit = await bloque("serif-negrita-48", t.titulo, { ancho: columna, escala: 0.78, maxLineas: 2, interlineado: 0.95 });
    // With two lines of lead it may not fit where one does.
    let baj = await bloque("serif-30", t.bajada, { ancho: columna, escala: 0.85, maxLineas: 2 });
    if (alturas[col] + tit.height + 4 + baj.height > recuadrosY - 10) baj = await bloque("serif-30", t.bajada, { ancho: columna, escala: 0.85, maxLineas: 1 });
    if (alturas[col] + tit.height + 4 + baj.height > recuadrosY - 10) {
      breves.push(t.titulo);
      continue;
    }
    poner(baj, x, poner(tit, x, alturas[col]) + 4);
    alturas[col] += tit.height + 4 + baj.height + 16;
  }
  if (Math.max(...alturas) > y) rect(tapa, MARGEN + columna + 14, y, 2, Math.max(...alturas) - y - 12, TAPA.TINTA);
  // What didn't fit goes in a line of briefs across the page, if there's room for it.
  const libre = recuadrosY - 8 - Math.max(...alturas);
  if (breves.length && libre >= 36) {
    const linea = await bloque("serif-30", `BREVES: ${breves.join(" · ")}`, { ancho: util, escala: 0.85, maxLineas: Math.floor(libre / 33) });
    regla(Math.max(...alturas) - 8, 1);
    poner(linea, MARGEN, Math.max(...alturas));
  }
  // The boxes: the weather and the town's numbers on the left, a quote from one of its characters on the right.
  regla(recuadrosY, 1);
  const n = diario.numeros;
  const tiempo = await bloque("serif-30", `EL TIEMPO: ${diario.clima.texto}. EL PUEBLO: prosperidad ${n.prosperidad}, seguridad ${n.seguridad}, humor ${n.humor}; impuesto municipal ${n.impuesto} %.`, { ancho: columna, escala: 0.85, maxLineas: 3 });
  poner(tiempo, MARGEN, recuadrosY + 12);
  if (diario.cita) {
    const cita = await bloque("serif-cursiva-28", `«${diario.cita.texto}» — ${diario.cita.quien}`, { ancho: columna, maxLineas: 3 });
    poner(cita, MARGEN + columna + 30, recuadrosY + 12);
  }
  rect(tapa, MARGEN + columna + 14, recuadrosY + 12, 2, TAPA.RECUADROS_ALTO - 12, TAPA.TINTA);
  regla(pieY - 8, 1);
  const pie = await bloque("serif-cursiva-28", diario.pie, { ancho: util, centrado: true, maxLineas: 1, color: TAPA.SEPIA });
  poner(pie, MARGEN, pieY);
  return tapa.getBuffer(JimpMime.png);
}
