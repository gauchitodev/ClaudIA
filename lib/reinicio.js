// How long start-process.js waits before relaunching main.js after it exits with an error.
//
// It used to relaunch right away, every time. A bot that dies as it starts (better-sqlite3 built for another Node
// after a `pkg upgrade`, a broken config.toml) then went round in a tight loop: two dozen restarts in three seconds on
// a laptop, each one writing its stack trace to claudia.log, until the tablet ran out of space or someone noticed.
// Now a crash soon after starting waits before the next attempt, twice as long each time, up to a cap. Once a run lasts
// long enough, the count starts over: killing main.js to update (see the README) still restarts it at once.
// No imports on purpose: start-process.js loads this, and the supervisor must not fall over with the bot.

export const REINICIO = {
  ESTABLE_MS: 60 * 1000, // a run this long was a good start: the next crash restarts straight away
  ESPERA_INICIAL_MS: 1000,
  ESPERA_MAX_MS: 5 * 60 * 1000,
};

// Given the quick crashes in a row so far and how long the run that just ended lasted: { fallos, espera } for the
// next launch.
export function proximoReinicio(fallosSeguidos, duroMs) {
  if (duroMs >= REINICIO.ESTABLE_MS) return { fallos: 0, espera: 0 };
  const fallos = fallosSeguidos + 1;
  return { fallos, espera: Math.min(REINICIO.ESPERA_INICIAL_MS * 2 ** (fallos - 1), REINICIO.ESPERA_MAX_MS) };
}
