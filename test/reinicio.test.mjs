import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { REINICIO, proximoReinicio } from "../lib/reinicio.js";

// start-process.js relaunches main.js when it exits with an error. It used to do it at once, every time, so a bot that
// died as it started (better-sqlite3 built for another Node after a `pkg upgrade`) restarted in a tight loop and
// filled claudia.log on the tablet.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("reinicio: un arranque que se cae enseguida espera cada vez más, hasta un tope; una corrida larga vuelve a cero", () => {
  const rapido = REINICIO.ESTABLE_MS - 1;
  const esperas = [];
  let fallos = 0;
  for (let i = 0; i < 12; i++) {
    const r = proximoReinicio(fallos, rapido);
    fallos = r.fallos;
    esperas.push(r.espera / 1000);
  }
  assert.deepEqual(esperas, [1, 2, 4, 8, 16, 32, 64, 128, 256, 300, 300, 300]);
  // It had been up long enough: the crash comes from running, not from starting, and it restarts right away. That's
  // also how killing main.js to update (README) keeps restarting it at once.
  assert.deepEqual(proximoReinicio(fallos, REINICIO.ESTABLE_MS), { fallos: 0, espera: 0 });
  assert.deepEqual(proximoReinicio(0, rapido), { fallos: 1, espera: 1000 });
});

test("reinicio: start-process.js espera entre arranques cuando main.js se cae al arrancar", () => {
  // A copy of the supervisor in a temp folder, with a main.js that dies on the spot and leaves a line per launch.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-reinicio-"));
  try {
    fs.mkdirSync(path.join(dir, "lib"));
    fs.copyFileSync(path.join(RAIZ, "start-process.js"), path.join(dir, "start-process.js"));
    fs.copyFileSync(path.join(RAIZ, "lib/reinicio.js"), path.join(dir, "lib/reinicio.js"));
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
    fs.writeFileSync(path.join(dir, "main.js"), `import fs from "fs";\nfs.appendFileSync(new URL("./arranques.txt", import.meta.url), "x\\n");\nprocess.exit(1);\n`);

    spawnSync(process.execPath, ["start-process.js"], { cwd: dir, timeout: 2500 });

    // Launches at 0 s, ~1 s and ~3 s: at most two in 2.5 s. Relaunched straight away, it was a couple of dozen.
    const arranques = fs.readFileSync(path.join(dir, "arranques.txt"), "utf8").trim().split("\n").length;
    assert.ok(arranques >= 1 && arranques <= 2, `arrancó ${arranques} veces en 2,5 s`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
