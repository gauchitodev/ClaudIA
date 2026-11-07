// One game switched off at a time, per group (.juego mines off, plugins/juego.js): which games can be, where the
// group's list is kept, and what the dispatcher and the menu ask. .juegos and .casino turn everything off; this turns
// off starting one game, the way .horariojuegos does outside its hours: a game going on is played out, because its
// moves and exits are other commands, and the hooks that take plain-message moves are never gated. The owner's command
// blacklist (.bladd) could block one, but it blocks the exits too, answers a bare 🔒 and is the owner's alone.
import { getChat, updateChat } from "../database-functions.js";

export const JUEGOS_APAGADOS = {
  AVISO_CADA_MS: 10 * 60 * 1000, // the notice goes out at most once every 10 min per group and game; otherwise a ⛔ reaction
};

// The games an admin can switch off one by one. "comandos" are the commands that START the game, the ones refused
// with it off: not its moves or exits, so a mines board can still be uncovered and cashed in. "alias" are the other
// names .juego takes. "inicio" tells a start apart from an answer or an exit given with the same command. "nombre"
// carries its article for the sentences. test/juegos-apagados.test.mjs checks every game plugin is accounted for.
export const JUEGOS = [
  { clave: "trivia", nombre: "la trivia (y la relámpago)", comandos: ["trivia"] },
  { clave: "ahorcado", nombre: "el ahorcado", comandos: ["ahorcado"] },
  { clave: "acertijos", nombre: "los acertijos", comandos: ["acertijo", "acertijos"] },
  { clave: "banderas", nombre: "las banderas", comandos: ["adivinabandera", "bandera", "banderas"] },
  { clave: "ordenar", nombre: "ordenar la palabra", comandos: ["ordenapalabra", "ordenarpalabra", "ordenar"], alias: ["palabra"] },
  { clave: "ttt", nombre: "el ta-te-ti", comandos: ["ttt"], alias: ["tateti", "tatetí"] },
  { clave: "4enlinea", nombre: "el 4 en línea", comandos: ["4enlinea"], alias: ["cuatroenlinea"] },
  // .aura si and .aura no answer a challenge made while the game was on: they go through.
  { clave: "aura", nombre: "las batallas de aura", comandos: ["aura"], alias: ["auras"], inicio: (args) => !/^(si|sí|no)$/i.test(args[0] || "") },
  { clave: "culpade", nombre: "la culpa (.culpade)", comandos: ["culpade"], alias: ["culpa"] },
  { clave: "formarpareja", nombre: "formar pareja (.formarpareja)", comandos: ["formarpareja"], alias: ["formarparejas"] },
  {
    clave: "tops",
    nombre: "los tops",
    comandos: ["topgays", "topsucios", "topotakus", "toppajer@s", "toplindos", "toplind@s", "topput@s", "topchupadores", "topmamadores", "topchupapijas", "topchupavergas", "topparejas", "top5parejas", "topdowns"],
    alias: ["top"],
  },
  { clave: "canvas", nombre: "los canvas con fotos", comandos: ["gay", "trans", "transexual", "bisexual", "bi", "simp", "carcel", "preso", "presa", "hornycard", "licenciahot", "hotlicense", "hotlicencia"], alias: ["fotos"] },
  { clave: "porcentajes", nombre: "los porcentajes (.love, .gay2 y los demás)", comandos: ["love", "gay2", "lesbiana", "zorra", "zorro", "pajero", "pajera", "puto", "puta", "infiel", "cornudo", "cornuda"], alias: ["porcentaje"] },
  { clave: "sorteos", nombre: "los sorteos", comandos: ["sortear", "sortear1", "sortear2", "sortear3", "sortear4", "sortear5", "sortear6", "sortear7", "sortear8", "sortear9", "sortear10"], alias: ["sorteo"] },
  { clave: "ruleta", nombre: "la ruleta", casino: true, comandos: ["ruleta"] },
  { clave: "tragamonedas", nombre: "el tragamonedas", casino: true, comandos: ["tragamonedas", "slot", "slots"] },
  { clave: "blackjack", nombre: "el blackjack", casino: true, comandos: ["blackjack", "bj"] },
  { clave: "mines", nombre: "el mines", casino: true, comandos: ["mines", "minas"] },
  { clave: "carrera", nombre: "la carrera de caballos", casino: true, comandos: ["carrera", "caballos"], alias: ["carreras"] },
  // .acepto answers a challenge whose stake is already in: it goes through, and one nobody answers is refunded.
  { clave: "duelos", nombre: "los duelos y las peleas", casino: true, comandos: ["duelo", "pelea"], alias: ["peleas"] },
  // .poker salir and .poker cancelar leave the table: they go through, as .levantarme and .delpoker do. .poker empezar
  // deals the first hand, so it's starting to play, as .poker 100 is.
  { clave: "poker", nombre: "el póker", casino: true, comandos: ["poker"], alias: ["holdem"], inicio: (args) => !/^(salir|levantarme|cancelar|cerrar)$/i.test(args[0] || "") },
  { clave: "loteria", nombre: "la lotería", casino: true, comandos: ["loteria", "boleto", "boletos"] },
  { clave: "mercados", nombre: "los mercados de apuestas", casino: true, comandos: ["jugar", "evento"], alias: ["mercado", "eventos"] },
];

// How a name is matched: lowercase, no accents, nothing but letters, digits and the @ of the tops, so "4 en línea",
// "ta-te-ti" and "Póker" find their game.
const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9@]/g, "");
const nombresDe = (j) => [j.clave, ...j.comandos, ...(j.alias || [])].map(normalizar);

// The game a name points at (its key, one of its commands or an alias), or null.
export function juegoDe(texto) {
  const n = normalizar(texto);
  return (n && JUEGOS.find((j) => nombresDe(j).includes(n))) || null;
}

// The game a typed command starts, as the dispatcher has it: exact, since the parser already took its accents out
// (lib/comandos.js: ".4enlínea" arrives as 4enlinea).
export const juegoDelComando = (command) => JUEGOS.find((j) => j.comandos.includes(command)) || null;

// The keys switched off in a group, from its row: the column holds a JSON list; anything else, or a key of a game that
// no longer exists, reads as nothing (the tests' rows don't carry the column at all).
export function apagadosDe(fila) {
  let lista;
  try {
    lista = JSON.parse(fila?.juegosApagados || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(lista)) return [];
  const conocidas = new Set(JUEGOS.map((j) => j.clave));
  return [...new Set(lista.filter((c) => conocidas.has(c)))];
}
export const estaApagado = (fila, clave) => apagadosDe(fila).includes(clave);

// The game this command would start while switched off here, or null: a move, an exit, an answer (inicio) or a game
// that's on all pass.
export function juegoApagadoPara(fila, command, args = []) {
  const juego = juegoDelComando(command);
  if (!juego || !estaApagado(fila, juego.clave)) return null;
  return !juego.inicio || juego.inicio(args) ? juego : null;
}

// Every starting command of the games switched off here, for the menu's marks.
export const comandosApagados = (fila) => new Set(JUEGOS.filter((j) => estaApagado(fila, j.clave)).flatMap((j) => j.comandos));

// Writes the list back only when it changes, in the catalogue's order, so .juego and .config list it the same way.
function guardar(chat, clave, apagado) {
  const juego = JUEGOS.find((j) => j.clave === clave);
  if (!juego) return { ok: false, error: `No conozco el juego ${clave}.` };
  const lista = apagadosDe(getChat(chat));
  if (lista.includes(clave) === apagado) return { ok: true, cambio: false, juego };
  const nueva = JUEGOS.map((j) => j.clave).filter((c) => (c === clave ? apagado : lista.includes(c)));
  if (!updateChat(chat, { juegosApagados: JSON.stringify(nueva) })) return { ok: false, error: "No pude guardarlo: el grupo no está en la base." };
  return { ok: true, cambio: true, juego };
}
export const apagar = (chat, clave) => guardar(chat, clave, true);
export const prender = (chat, clave) => guardar(chat, clave, false);

// The words .juegos and the other switches take (plugins/config-on-off.js): on, off, or null for anything else.
const PRENDER = new Set(["on", "prender", "activar", "si", "sí"]);
const APAGAR = new Set(["off", "apagar", "desactivar", "no"]);
export function leerInterruptor(palabra) {
  const p = String(palabra || "").toLowerCase();
  return PRENDER.has(p) ? true : APAGAR.has(p) ? false : null;
}

// .juego alone: how each game is here, with the group-wide switches on top when they're off.
const listaDe = (fila, casino) =>
  JUEGOS.filter((j) => Boolean(j.casino) === casino)
    .map((j) => `${estaApagado(fila, j.clave) ? "⛔" : "✅"} ${j.clave}`)
    .join(" · ");
export function avisoGenerales(fila, juego = null, usedPrefix = ".") {
  if (fila?.games === 0) return `Ojo: acá los juegos están apagados del todo (${usedPrefix}juegos off); esto aplica cuando los prendan.`;
  if (fila?.casino === 0 && (!juego || juego.casino)) return `Ojo: acá el casino está apagado del todo (${usedPrefix}casino off); esto aplica cuando lo prendan.`;
  return "";
}
export function textoEstado(fila, usedPrefix = ".") {
  const aviso = avisoGenerales(fila, null, usedPrefix);
  return `🎮 *Juegos de este grupo*\nJuegos: ${listaDe(fila, false)}\nCasino: ${listaDe(fila, true)}\n\n${usedPrefix}juego mines off apaga uno y ${usedPrefix}juego mines on lo prende. Para todos de una: ${usedPrefix}juegos y ${usedPrefix}casino.${aviso ? `\n${aviso}` : ""}`;
}

// What the dispatcher answers to a start refused: once every AVISO_CADA_MS per group and game, then a ⛔ reaction
// (correspondeAvisarApagado, called inside the deferred rejection as lib/horario-juegos.js's is).
export const textoJuegoApagado = (juego, usedPrefix = ".") => `⛔ Acá un admin apagó ${juego.nombre}. Se prende con ${usedPrefix}juego ${juego.clave} on.`;
const avisos = new Map();
export function correspondeAvisarApagado(chat, clave, ahora = Date.now()) {
  const k = `${chat}|${clave}`;
  const ultimo = avisos.get(k) || 0;
  if (ahora - ultimo < JUEGOS_APAGADOS.AVISO_CADA_MS) return false;
  avisos.set(k, ahora);
  return true;
}
