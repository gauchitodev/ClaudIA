import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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

// What a plugin keeps in a lib/ module (a challenge in lib/duelos.js, say) outlives the plugin being reloaded: a
// reloaded plugin is a new module, and the lib/ module it imports is the one there was, with what it had. Kept in the
// plugin's own module instead, saving the plugin drops it: every game of it in play, say.
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

// Or on globalThis, as .antiubicacion's notice keeps who was told when, one notice every so often for each person: in a
// variable of the plugin, saving its file started it over, and the next share brought the notice again. The real
// plugin, loaded as watchPlugins loads it.
test("recarga: el aviso de la ubicación en tiempo real no se repite por recargar el plugin", async () => {
  const plugins = `${path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plugins")}/`;
  const avisos = [];
  const client = { sendText: async (chat, texto) => (avisos.push(texto), {}) };
  const opciones = { client, isOwner: false, isMod: false, isBotAdmin: true, user: {}, chat: { antiLiveLocation: true, antiDelete: false } };
  const compartir = () => globalThis.plugins["_chatbot-events"].before({ isGroup: true, mtype: "liveLocationMessage", chat: "recarga@g.us", sender: "300000000000005@lid", delete: async () => {} }, opciones);
  const logReal = console.log;
  console.log = () => {};
  try {
    await L.recargarPlugin("_chatbot-events.js", "rename", plugins);
    const antes = globalThis.plugins["_chatbot-events"];
    await compartir();
    await L.recargarPlugin("_chatbot-events.js", "change", plugins); // the file was saved
    assert.notEqual(globalThis.plugins["_chatbot-events"], antes, "es el plugin vuelto a cargar");
    await compartir();
    assert.equal(avisos.length, 1);
  } finally {
    console.log = logReal;
    delete globalThis.plugins["_chatbot-events"];
    globalThis.avisoUbicacionCooldown?.clear();
  }
});

test("consistencia: watchPlugins recarga cada archivo con recargarPlugin", () => {
  const fuente = fs.readFileSync(new URL("../load-functions.js", import.meta.url), "utf8");
  assert.match(fuente, /watch\("\.\/plugins\/"[^]*?recargarPlugin\(filename, eventType\)/);
});
