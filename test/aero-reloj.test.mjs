import { test } from "node:test";
import assert from "node:assert/strict";
import { ZONAS, OTRAS, offsetDeZona, letraDe, textoOffset, dtg, textoReloj, textoDtg } from "../lib/aero-reloj.js";

const AHORA = Date.UTC(2026, 8, 6, 15, 32, 10); // domingo 6 de setiembre de 2026, 15:32:10 Z

test("reloj aero: las 25 zonas del sistema de letras, sin la J y de oeste a este", () => {
  assert.equal(ZONAS.length, 25);
  assert.deepEqual(ZONAS.map((z) => z.letra).join(""), "YXWVUTSRQPONZABCDEFGHIKLM");
  assert.deepEqual(ZONAS.map((z) => z.offset), [-12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(ZONAS.find((z) => z.letra === "P").nombre, "Papa");
  assert.equal(letraDe(-180), "P");
  assert.equal(letraDe(0), "Z");
  assert.equal(letraDe(60), "A");
  assert.equal(letraDe(600), "K", "la J se saltea");
  assert.equal(letraDe(720), "M");
  assert.equal(letraDe(330), null, "media hora no tiene letra");
  assert.equal(letraDe(780), null);
  assert.equal(textoOffset(0), "UTC±0");
  assert.equal(textoOffset(-180), "UTC−3");
  assert.equal(textoOffset(330), "UTC+5:30");
  assert.equal(offsetDeZona("America/Montevideo", AHORA), -180);
  assert.equal(offsetDeZona("Asia/Kolkata", AHORA), 330);
  assert.equal(offsetDeZona("Asia/Kathmandu", AHORA), 345);
  assert.equal(OTRAS.length, 10);
});

test("reloj aero: DTG con la letra del huso y el cambio de día", () => {
  assert.equal(dtg(AHORA, 0, "Z"), "061532Z SEP 26");
  assert.equal(dtg(AHORA, -180, "P"), "061232P SEP 26");
  assert.equal(dtg(AHORA, 720, "M"), "070332M SEP 26", "a +12 ya es el día siguiente");
  assert.equal(dtg(Date.UTC(2026, 0, 1, 0, 5), -720, "Y"), "311205Y DEC 25", "a −12 todavía es el año anterior");
});

test("reloj aero: el texto normal y el DTG", () => {
  const normal = textoReloj(AHORA);
  assert.match(normal, /^🕒 \*Hora Zulu:\* 15:32:10 Z · domingo, 6 de setiembre de 2026\n📍 \*Uruguay:\* 12:32:10 \(UTC−3, P\)\n/);
  assert.ok(normal.includes("\nP (UTC−3) 12:32 ← acá\n"));
  assert.ok(normal.includes("\nZ (UTC±0) 15:32\n"));
  assert.ok(normal.includes("\nM (UTC+12) 03:32 +1d\n"));
  assert.ok(normal.includes("\nY (UTC−12) 03:32\n"));
  assert.ok(normal.includes("India UTC+5:30 21:02"));
  assert.ok(normal.includes("Nepal UTC+5:45 21:17"));
  assert.equal((normal.match(/← acá/g) || []).length, 1);

  const d = textoDtg(AHORA);
  assert.match(d, /^🕒 \*DTG Zulu:\* 061532Z SEP 26\n📍 \*Uruguay:\* 061232P SEP 26\n/);
  assert.ok(d.includes("\nPapa: 061232P SEP 26 ← acá\n"));
  assert.ok(d.includes("\nZulu: 061532Z SEP 26\n"));
  assert.ok(d.includes("\nMike: 070332M SEP 26\n"));
  assert.ok(d.includes("\nYankee: 060332Y SEP 26\n"));
});
