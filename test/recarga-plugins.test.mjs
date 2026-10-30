import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { prepararBase } from "./helpers.mjs";

// watchPlugins (load-functions.js) loads a plugin again when its file changes, without restarting the bot. It used to
// drop the version that worked before loading the new one: a file saved halfway, or with a typo, took the command away
// until the next restart. Here with a plugin of its own, in a temp folder.

let L, carpeta;
before(async () => {
  await prepararBase("recarga-plugins");
  L = await import("../load-functions.js");
  carpeta = `${path.resolve("plugins-de-prueba")}/`;
  fs.mkdirSync(carpeta);
  // ES modules, like everything under the bot's package.json: without it, an empty file would load as CommonJS.
  fs.writeFileSync(path.join(carpeta, "package.json"), JSON.stringify({ type: "module" }));
  globalThis.plugins = {};
});

test("recarga: un plugin que no carga deja andando la versión que andaba", async () => {
  const archivo = path.join(carpeta, "eco.js");
  const errorReal = console.error;
  const logReal = console.log;
  const errores = [];
  console.error = (...partes) => errores.push(partes.join(" "));
  console.log = () => {};
  const guardar = async (contenido, evento = "change") => {
    fs.writeFileSync(archivo, contenido);
    await L.recargarPlugin("eco.js", evento, carpeta);
    return globalThis.plugins.eco?.version;
  };
  try {
    assert.equal(await guardar(`export default { cmd: ["eco"], version: 1 };`, "rename"), 1);
    assert.equal(await guardar(`export default { cmd: ["eco"], version: 2 ;`), 1, "guardado a medias, sigue la que andaba");
    assert.match(errores.at(-1), /eco\.js \(sigue andando la versión anterior\)/);
    assert.equal(await guardar(""), 1, "ni vacío, como queda un instante mientras se escribe");
    assert.equal(await guardar(`export default { cmd: ["eco"], version: 3 };`), 3, "y cuando carga bien, la nueva");
    assert.equal(await guardar(`export default { cmd: ["eco"], version: 4 };`), 4, "otra vez enseguida, también");

    fs.rmSync(archivo);
    await L.recargarPlugin("eco.js", "rename", carpeta);
    assert.equal("eco" in globalThis.plugins, false, "un archivo borrado se va");
  } finally {
    console.error = errorReal;
    console.log = logReal;
  }
});

// A game in play is in its lib/ module (a challenge in lib/duelos.js, say), not on globalThis: a reloaded plugin is a
// new module, and the lib/ module it imports is the one there was, with what it had. Otherwise, saving a game's plugin
// would drop every game of it in play.
test("recarga: el plugin recargado ve el estado de lib/ que había, con lo que tenía adentro", async () => {
  const D = await import("../lib/duelos.js");
  const archivo = path.join(carpeta, "pendientes.js");
  const logReal = console.log;
  console.log = () => {};
  D.duelos.set("recarga@g.us|b@lid", { chat: "recarga@g.us" });
  try {
    for (const version of [1, 2]) {
      fs.writeFileSync(archivo, `import { duelos } from ${JSON.stringify(new URL("../lib/duelos.js", import.meta.url).href)};\nexport default { cmd: ["pendientes"], version: ${version}, duelos };\n`);
      await L.recargarPlugin("pendientes.js", version === 1 ? "rename" : "change", carpeta);
      assert.equal(globalThis.plugins.pendientes?.version, version);
      assert.equal(globalThis.plugins.pendientes.duelos, D.duelos, `la versión ${version} ve el mismo registro`);
      assert.ok(globalThis.plugins.pendientes.duelos.has("recarga@g.us|b@lid"), "con el desafío que estaba pendiente");
    }
  } finally {
    console.log = logReal;
    D.duelos.delete("recarga@g.us|b@lid");
    fs.rmSync(archivo, { force: true });
    await L.recargarPlugin("pendientes.js", "rename", carpeta);
  }
});

test("consistencia: watchPlugins recarga cada archivo con recargarPlugin", () => {
  const fuente = fs.readFileSync(new URL("../load-functions.js", import.meta.url), "utf8");
  assert.match(fuente, /watch\("\.\/plugins\/"[^]*?recargarPlugin\(filename, eventType\)/);
});
