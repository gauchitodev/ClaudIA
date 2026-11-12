// The pauses the plugins make for show: the ban roulette's suspense before the kick, .kick's between deleting and
// removing, .setmarry's reactions one by one; and the wait before .resumen asks the AI again (lib/resumen.js). They go
// through here so the tests can skip them (test/helpers.mjs): waited out, they were most of what the slowest test files
// took, 17 of test/moderacion.test.mjs's 19 s.
import { setTimeout as esperar } from "node:timers/promises";

// Injectable for the tests.
export const _dep = { esperar };

export const pausa = (ms) => _dep.esperar(ms);
