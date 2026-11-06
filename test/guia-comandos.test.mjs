import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// docs/comandos.md (lib/guia-comandos.js, scripts/generar-comandos.mjs): the command guide written from the menus. It
// is committed, so the one on disk has to be what the menus say today, and every line of the menus has to be in it.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let Gc, M, MV;
before(async () => {
  Gc = await import("../lib/guia-comandos.js");
  M = await import("../lib/menu.js");
  MV = await import("../lib/menu-ventas.js");
});

test("docs/comandos.md es lo que dicen los menús hoy: si cambió el menú, npm run comandos", () => {
  const enDisco = fs.readFileSync(path.join(RAIZ, "docs", "comandos.md"), "utf8");
  assert.equal(enDisco, Gc.textoGuiaComandos(), "docs/comandos.md quedó viejo: corré npm run comandos y commiteá el resultado");
});

test("la guía: un tema por tema del menú, una fila por línea ▸, dos celdas por fila, y la sección de compraventa", () => {
  const texto = Gc.textoGuiaComandos();
  const secciones = M.seccionesDelMenu(".");
  for (const s of secciones) {
    assert.ok(texto.includes(`\n## ${s.emoji} ${s.titulo}\n`), s.clave);
    assert.ok(texto.includes(`\`.menu ${s.clave}\``), `cómo se abre ${s.clave}`);
  }
  const filas = texto.split("\n").filter((l) => /^\| `/.test(l));
  const lineas = secciones.flatMap((s) => s.lineas.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("▸")));
  assert.equal(filas.length, lineas.length, "una fila por línea del menú");
  assert.ok(filas.length > 100);
  for (const l of texto.split("\n").filter((l) => l.startsWith("|"))) assert.equal(l.split(/(?<!\\)\|/).length, 4, `dos celdas: ${l}`);
  assert.doesNotMatch(texto, /\$\{usedPrefix\}/, "sin restos de la plantilla");
  assert.doesNotMatch(texto, /(^|[^*])\*[^*\n]+\*([^*]|$)/m, "sin negritas de WhatsApp sueltas");
  assert.match(texto, /\n## 🗳️ Temáticas y ranking\n\n_Para todos\. Se abre con `\.menu temáticas`, `\.menu ranking`, `\.menu grupo`\._\n/);
  assert.match(texto, /\n## ⚙️ Configuración\n\n_Para moderadores y admins\./);
  assert.match(texto, /\(#tematicas\)/, "las anclas no llevan acentos");
  // the marketplace menu, line by line
  assert.ok(texto.includes("\n## 🏷️ Modo compraventa\n"));
  assert.ok(texto.includes("\n📢 **Publicar**\n- .vendo &lt;qué, precio, zona&gt; — lo ponés a la venta. Ej: .vendo bici rodado 26, 4500, Mercedes\n"));
  assert.ok(texto.includes("\n- .catalogo — todo lo activo · .catalogo N — el detalle de la #N\n"));
  assert.equal((texto.match(/^- /gm) || []).length, MV.SECCIONES_VENTAS.split("\n").filter((l) => l.startsWith("▸")).length);
});

test("leerLinea: el comando con sus argumentos, el emoji y la descripción", () => {
  assert.deepEqual(Gc.leerLinea("▸ .bal [@mención] 🪙 – `Tu saldo.`"), { comando: ".bal [@mención]", emoji: "🪙", descripcion: "Tu saldo." });
  assert.deepEqual(Gc.leerLinea("▸ #quejadelunes 😤 – `Registra tu queja.`"), { comando: "#quejadelunes", emoji: "😤", descripcion: "Registra tu queja." });
  assert.deepEqual(Gc.leerLinea("▸ .juego mines off ⛔ – `Apaga un solo juego.`"), { comando: ".juego mines off", emoji: "⛔", descripcion: "Apaga un solo juego." });
  assert.deepEqual(Gc.leerLinea("▸ .x – `Sin emoji.`"), { comando: ".x", emoji: "", descripcion: "Sin emoji." });
  assert.deepEqual(Gc.leerLinea("▸ .x 10 🎰 – `Con *negrita* y <tope>.`").descripcion, "Con *negrita* y <tope>.", "leer no convierte: convierte la guía");
  const texto = Gc.textoGuiaComandos();
  assert.match(texto, /\n\| `\.bal \[@mención\]` 🪙 \| Tu saldo de UruCoins, o el de otra persona; \.baltop, /);
  assert.match(texto, /\n\| `\.juego mines off` ⛔ \| Apaga un solo juego en el grupo/);
});

test("el menú de compraventa: las secciones de la lib más su pie, como lo manda .menuventas", () => {
  assert.ok(MV.textoMenuVentas(true).startsWith(`🏷️ *MENÚ DE COMPRAVENTA*\n\n${MV.SECCIONES_VENTAS}\n\n`));
  assert.ok(MV.textoMenuVentas(true).endsWith("\n\nEste grupo está en modo compraventa.\nMenú general: .menu"));
  assert.ok(MV.textoMenuVentas(false).includes("\n\nEste grupo NO está en modo compraventa: los juegos y la economía siguen prendidos. Un admin lo cambia con .modo compraventa\nMenú general: .menu"));
  assert.doesNotMatch(MV.SECCIONES_VENTAS, /^\s|\s$/, "sin espacios de más en las puntas");
});
