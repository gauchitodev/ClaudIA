// What a command is, read from a message's text, the same way everywhere: handle-message.js runs it, the hooks that
// take plain text leave it alone (the games' answers, the hashtags, the sales), and Claudia and her memory tell it
// apart from chat (lib/contexto-chat.js, esComando). There used to be four ways: "...pero bueno" was the command
// "..pero" for the dispatcher, which answered that it doesn't exist, and "@Ana c" a command for the trivia.
//
// No imports and nothing done on load: lib/contexto-chat.js imports it, and start-process.js loads that one too. The
// prefixes and the plugins are read on each call (globalThis.prefix, globalThis.plugins): hot reloading swaps the
// plugins.

// Characters a keyboard or WhatsApp slips in without showing them, and the punctuation that stays glued to a command
// (".menu?", ".ttt!"): neither is part of its name.
const INVISIBLES = /[​-‍⁠﻿]/g;
const PUNTUACION_FINAL = /[?!.,;:¿¡…]+$/u;

// A command's name as the plugins declare it: no invisibles, no punctuation at the end, NFC, lowercase.
const limpiarNombre = (nombre) => String(nombre).replace(INVISIBLES, "").replace(PUNTUACION_FINAL, "").normalize("NFC").toLowerCase();

// A message's text as a command: { prefijo, comando, args, texto, textoCompleto }, or null when it isn't one. The
// prefix goes first (" .menu" isn't one), and the name right against it: after a space, a line break or another prefix
// it's someone talking (". hola", ".\nhola", "...pero bueno"). "args" and "texto" are what the plugins always got: the
// words, and them joined by single spaces. "textoCompleto" is what follows the name as it was typed, line breaks
// included, trimmed at the ends: for the commands that send or keep free text (.reglas set, .avisartodos, .say).
export function parsearComando(texto, prefijos = globalThis.prefix || []) {
  const crudo = String(texto ?? "");
  const prefijo = prefijos.find((p) => p && crudo.startsWith(p));
  if (!prefijo) return null;
  const partes = crudo.slice(prefijo.length).match(/^(\S+)([\s\S]*)$/);
  if (!partes || prefijos.some((p) => p && partes[1].startsWith(p))) return null;
  const comando = limpiarNombre(partes[1]);
  if (!comando) return null;
  const textoCompleto = partes[2].trim();
  const args = textoCompleto ? textoCompleto.split(/\s+/) : [];
  return { prefijo, comando, args, texto: args.join(" "), textoCompleto };
}

// Whether a name looks like a command: letters, digits or "@" only, and some letter. ".5 kilos", ".foo_bar" or
// ".jaja😂" don't, so nobody is told those commands don't exist. Declared names that don't (.18) still run.
export const pareceComando = (nombre) => /^[\p{L}\p{N}@]+$/u.test(nombre) && /\p{L}/u.test(nombre);

// Whether some plugin answers to the command.
export const comandoDeclarado = (nombre, plugins = globalThis.plugins) => Object.values(plugins || {}).some((plugin) => Array.isArray(plugin?.cmd) && plugin.cmd.includes(nombre));

// Whether a text is a command: one a plugin declares, or, after "." or "/", a name that looks like one (it gets the "no
// such command" answer). "@" is also a prefix, but a message that starts by mentioning someone ("@59899… vení") is
// chat: with "@" it only counts when a plugin declares the word after it.
export function esComando(texto) {
  const pedido = parsearComando(texto);
  if (!pedido) return false;
  return comandoDeclarado(pedido.comando) || (pedido.prefijo !== "@" && pareceComando(pedido.comando));
}

// A whole number as people write it here: "1000", or with dots for the thousands ("1.000", "10.000.000"). A decimal,
// a comma, letters glued to it or a dot out of place give null: "1,000", "2.5", "100coins", "1k", "1.0000". It used to
// be parseInt, which read "1.000" as 1. A minus sign only where it means something (negativos: .ajustar).
export function leerEntero(texto, { negativos = false } = {}) {
  const t = String(texto ?? "").trim();
  const m = t.match(/^(-?)(\d+|\d{1,3}(?:\.\d{3})+)$/);
  if (!m || (m[1] && !negativos)) return null;
  const n = Number(`${m[1]}${m[2].replaceAll(".", "")}`);
  return Number.isSafeInteger(n) ? n : null;
}

// A command written down to keep it (.bladd, .bldel): with or without its prefix, cleaned like a typed one, so the one
// kept is the one the dispatcher compares.
export function normalizarComando(texto, prefijos = globalThis.prefix || []) {
  let nombre = String(texto ?? "").trim();
  const prefijo = prefijos.find((p) => p && nombre.startsWith(p));
  if (prefijo) nombre = nombre.slice(prefijo.length);
  return limpiarNombre(nombre);
}
