import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JUEGOS, COBROS_SIN_JUEGO, FUERA_DE_TIMBA, clasificar, esMotivoConocido } from "../lib/timba.js";

// Every coin movement is written with a free-text "motivo", and lib/timba.js is what turns those strings into games.
// Nothing links the two: add a game, forget the catalogue, and the game disappears from .timba and .mitimba without a
// single error — the numbers just come out quietly wrong. This test walks the actual calls and demands that every
// reason the code can emit is classified, either as part of a game or explicitly as something that isn't gambling.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FUENTES = [...archivosDe("lib"), ...archivosDe("plugins"), path.join(RAIZ, "database-functions.js")];

function archivosDe(carpeta) {
  return fs
    .readdirSync(path.join(RAIZ, carpeta))
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(RAIZ, carpeta, f));
}

// The functions that end up writing to urucoins_log, directly or through a wrapper.
const LLAMADAS = /\b(?:ganarCoins|gastarCoins|moverCoins|cobrarApuesta|protegerApuesta)\s*\(/g;

// Reasons are snake_case, either a plain string or a template with the variable part at the end
// (`mercado_apuesta_${id}`), in which case the prefix is what matters.
// Strings on the right of a comparison are skipped: a reason picked with `accion === "doblar" ? ... : ...` would
// otherwise report "doblar" itself as an unclassified reason.
const LITERAL = /(?<![=!]==\s{0,4})"([a-z][a-z0-9_]*)"/g;
const PLANTILLA = /`([a-z][a-z0-9_]*_)\$\{/g;

function motivosEmitidos() {
  const encontrados = new Map(); // motivo -> "file:line"
  for (const archivo of FUENTES) {
    const texto = fs.readFileSync(archivo, "utf8");
    for (const llamada of texto.matchAll(LLAMADAS)) {
      const fin = texto.indexOf(";", llamada.index);
      const sentencia = texto.slice(llamada.index, fin < 0 ? llamada.index + 400 : fin);
      const linea = texto.slice(0, llamada.index).split("\n").length;
      const donde = `${path.relative(RAIZ, archivo)}:${linea}`;
      for (const re of [LITERAL, PLANTILLA]) {
        for (const [, motivo] of sentencia.matchAll(re)) if (!encontrados.has(motivo)) encontrados.set(motivo, donde);
      }
    }
  }
  return encontrados;
}

test("todo motivo que el código emite está clasificado en lib/timba.js", () => {
  const emitidos = motivosEmitidos();
  assert.ok(emitidos.size > 30, `se encontraron muy pocos motivos (${emitidos.size}): el escaneo no está andando`);

  const sinClasificar = [...emitidos].filter(([motivo]) => !esMotivoConocido(motivo)).map(([motivo, donde]) => `${motivo} (${donde})`);
  assert.deepEqual(sinClasificar, [], `motivos sin clasificar:\n${sinClasificar.join("\n")}\n\nAgregalos al juego que corresponda en lib/timba.js, o a FUERA_DE_TIMBA si no son apuestas.`);
});

test("el catálogo no repite un motivo en dos juegos", () => {
  const visto = new Map();
  const choques = [];
  for (const juego of JUEGOS) {
    for (const motivo of [...(juego.apuesta || []), ...(juego.apuestaExtra || []), ...(juego.cobro || [])]) {
      if (visto.has(motivo)) choques.push(`${motivo}: ${visto.get(motivo)} y ${juego.clave}`);
      visto.set(motivo, juego.clave);
    }
  }
  assert.deepEqual(choques, []);

  // And what is outside the gambling can't be inside it too.
  const dentroYFuera = FUERA_DE_TIMBA.exactos.filter((m) => clasificar(m) || COBROS_SIN_JUEGO.includes(m));
  assert.deepEqual(dentroYFuera, []);
});
