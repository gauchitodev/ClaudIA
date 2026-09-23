// What's at stake when the bot shuts down. The casino's games live in memory (roulette tables, races, blackjack hands,
// Mines boards, duels, fights, bets on games): each one charges up front and pays when it settles, so a restart in
// between used to swallow those coins. On the way out, every open one is refunded.
//
// It covers exits that run code: process.exit, an uncaught error, Ctrl+C, kill and closing Termux's session. Not a
// "kill -9" or the phone dropping the process: nothing runs then.
import { devolverMesasRuleta } from "./casino.js";
import { devolverCarreras } from "./carrera.js";
import { devolverManosBlackjack } from "./blackjack.js";
import { devolverPartidasMines } from "./mines.js";
import { devolverDuelosYPeleas } from "./duelos.js";
import { devolverApuestasDeJuegos } from "./urucoins.js";

// Refunds everything in play, and forgets it (a second call finds nothing). Returns { apuestas, monedas }.
export function devolverLoQueEstaEnJuego() {
  let apuestas = 0;
  let monedas = 0;
  for (const devolver of [devolverMesasRuleta, devolverCarreras, devolverManosBlackjack, devolverPartidasMines, devolverDuelosYPeleas, devolverApuestasDeJuegos]) {
    try {
      const r = devolver();
      apuestas += r.apuestas;
      monedas += r.monedas;
    } catch (e) {
      // one game failing to refund mustn't keep the others from doing it
      console.error(`[cierre] ${devolver.name} falló:`, e?.message || e);
    }
  }
  return { apuestas, monedas };
}

// The signals that stop the bot without running "exit" on their own, and the code each one exits with (128 + its
// number, as if it had killed the process: start-process.js restarts on any code but 0, same as before).
const SENALES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

// Hooks the refund to the process's way out. "proceso" is only swapped in the tests.
export function instalarDevolucionAlCerrar(proceso = process) {
  // Synchronous on purpose: "exit" doesn't wait for promises, and the database (better-sqlite3) doesn't need any.
  proceso.on("exit", () => {
    const { apuestas, monedas } = devolverLoQueEstaEnJuego();
    if (apuestas > 0) console.log(`[cierre] devolví ${apuestas} ${apuestas === 1 ? "apuesta" : "apuestas"} en juego (${monedas} UruCoins) antes de apagarme`);
  });
  for (const [senal, codigo] of Object.entries(SENALES)) proceso.once(senal, () => proceso.exit(codigo));
}
