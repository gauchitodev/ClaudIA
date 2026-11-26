// Writes the bitmap fonts of the Sunday paper's front page (lib/tapa.js) into resources/tapa/: node
// scripts/fuentes-tapa.mjs. Run once; the result is committed, and the bot only reads it (jimp prints with BMFont
// files, and draws nothing from a TTF). Made from Liberation Serif, under the SIL Open Font License (its text is in
// resources/tapa/LICENSE-Liberation.txt).
// It takes sharp, which comes with Baileys, and the TTFs at the path given (by default, where Arch keeps them):
//   node scripts/fuentes-tapa.mjs /usr/share/fonts/liberation
// Each glyph is drawn between two full blocks (█) of another colour: the blocks span the whole line, so what's left
// between them is the glyph's cell, as wide as it advances and as tall as the line, already on its baseline.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const ORIGEN = process.argv[2] || "/usr/share/fonts/liberation";
const DESTINO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "resources", "tapa");
const FUENTES = [
  { nombre: "serif-negrita-96", archivo: "LiberationSerif-Bold.ttf", familia: "Liberation Serif Bold", tam: 96 },
  { nombre: "serif-negrita-48", archivo: "LiberationSerif-Bold.ttf", familia: "Liberation Serif Bold", tam: 48 },
  // The small ones get a pixel of air between letters (espacio): drawn without kerning they come out cramped.
  { nombre: "serif-30", archivo: "LiberationSerif-Regular.ttf", familia: "Liberation Serif", tam: 30, espacio: 1 },
  { nombre: "serif-cursiva-28", archivo: "LiberationSerif-Italic.ttf", familia: "Liberation Serif Italic", tam: 28, espacio: 1 },
];
// Printable ASCII, Latin-1 and the typographic marks a newspaper uses.
const CARACTERES = [...Array.from({ length: 95 }, (_, i) => 32 + i), ...Array.from({ length: 95 }, (_, i) => 161 + i), 0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2026, 0x20ac, 0x2022];
const ANCHO_PAGINA = 2048;
const escapar = (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c);
const esBloque = (r, g, b, a) => a > 0 && r - Math.max(g, b) > 60;

async function glifo(fuente, codigo) {
  const c = String.fromCodePoint(codigo);
  const marcado = `<span foreground="#ff0000">█</span><span foreground="#000000">${escapar(c)}</span><span foreground="#ff0000">█</span>`;
  const { data, info } = await sharp({ text: { text: marcado, fontfile: path.join(ORIGEN, fuente.archivo), font: `${fuente.familia} ${fuente.tam}`, dpi: 72, rgba: true } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  // A column of a block: some red in it and no black, or nothing at all (the blocks' antialiased edges).
  const rojaLaColumna = (x) => {
    let roja = false;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] <= 20) continue;
      if (!esBloque(data[i], data[i + 1], data[i + 2], data[i + 3])) return false;
      roja = true;
    }
    return roja || x === 0 || x === w - 1;
  };
  let desde = 0;
  while (desde < w && rojaLaColumna(desde)) desde++;
  let hasta = w - 1;
  while (hasta > desde && rojaLaColumna(hasta)) hasta--;
  const ancho = Math.max(1, hasta - desde + 1);
  const celda = Buffer.alloc(ancho * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * w + x + desde) * 4;
      const o = (y * ancho + x) * 4;
      if (esBloque(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
      data.copy(celda, o, i, i + 4);
    }
  }
  return { codigo, ancho, alto: h, celda };
}

for (const fuente of FUENTES) {
  const glifos = [];
  for (const codigo of CARACTERES) glifos.push(await glifo(fuente, codigo));
  const alto = Math.max(...glifos.map((g) => g.alto));
  // Packed in rows, left to right.
  let x = 0;
  let fila = 0;
  for (const g of glifos) {
    if (x + g.ancho + 2 > ANCHO_PAGINA) {
      x = 0;
      fila++;
    }
    g.x = x;
    g.y = fila * (alto + 2);
    x += g.ancho + 2;
  }
  const altoPagina = (fila + 1) * (alto + 2);
  const pagina = Buffer.alloc(ANCHO_PAGINA * altoPagina * 4);
  for (const g of glifos) {
    for (let y = 0; y < g.alto; y++) g.celda.copy(pagina, ((g.y + y) * ANCHO_PAGINA + g.x) * 4, y * g.ancho * 4, (y + 1) * g.ancho * 4);
  }
  fs.mkdirSync(DESTINO, { recursive: true });
  await sharp(pagina, { raw: { width: ANCHO_PAGINA, height: altoPagina, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(DESTINO, `${fuente.nombre}.png`));
  const lineas = [
    `info face="${fuente.familia}" size=${fuente.tam} bold=${fuente.familia.includes("Bold") ? 1 : 0} italic=${fuente.familia.includes("Italic") ? 1 : 0} charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0`,
    `common lineHeight=${alto} base=${Math.round(alto * 0.78)} scaleW=${ANCHO_PAGINA} scaleH=${altoPagina} pages=1 packed=0`,
    `page id=0 file="${fuente.nombre}.png"`,
    `chars count=${glifos.length}`,
    ...glifos.map((g) => `char id=${g.codigo} x=${g.x} y=${g.y} width=${g.ancho} height=${g.alto} xoffset=0 yoffset=0 xadvance=${g.ancho + (fuente.espacio || 0)} page=0 chnl=15`),
    "kernings count=0",
  ];
  fs.writeFileSync(path.join(DESTINO, `${fuente.nombre}.fnt`), `${lineas.join("\n")}\n`);
  console.log(`${fuente.nombre}: ${glifos.length} letras, línea de ${alto} px, página de ${ANCHO_PAGINA}×${altoPagina}`);
}
