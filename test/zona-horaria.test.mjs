import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// globals.js sets Uruguay's time zone unless the environment brings one: the daily rounds, the trivia window, the
// birthdays and the closings all go by it, and nothing used to set it. Each case runs in a process of its own, from an
// empty folder (globals.js only complains that there's no config.toml).

const GLOBALS = new URL("../globals.js", import.meta.url).href;
const MEDIODIA_UTC = "2026-01-15T12:00:00Z";

function relojCon(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-tz-"));
  try {
    const codigo = `await import(${JSON.stringify(GLOBALS)}); console.log(JSON.stringify({ tz: process.env.TZ, intl: Intl.DateTimeFormat().resolvedOptions().timeZone, hora: new Date(${JSON.stringify(MEDIODIA_UTC)}).getHours() }));`;
    return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", codigo], { cwd: dir, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const { TZ: _, ...sinTZ } = process.env;

test("sin TZ en el entorno (o vacía), el bot usa la hora de Uruguay", () => {
  const montevideo = { tz: "America/Montevideo", intl: "America/Montevideo", hora: 9 };
  assert.deepEqual(relojCon(sinTZ), montevideo);
  assert.deepEqual(relojCon({ ...sinTZ, TZ: "" }), montevideo);
});

test("con TZ en el entorno, la respeta", () => {
  assert.deepEqual(relojCon({ ...sinTZ, TZ: "Asia/Tokyo" }), { tz: "Asia/Tokyo", intl: "Asia/Tokyo", hora: 21 });
});
