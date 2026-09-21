import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// The menus are written by hand and the plugin.cmd lists change on their own: this keeps them from drifting apart.
// Until now the discipline was manual (the comment in plugins/menu-ventas.js), and nothing warned when a menu ended
// up naming a command that no longer exists: the only one who found out was whoever typed it and got "no such command".
//
// Formatting rule: in the menus, a line starting with "▸" names a single main command right against the ▸ (that is
// the one that gets blacklist mode's 🔒, see plugins/menu.js). Every command appearing on that line, there or in the
// description, has to really exist.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARPETA = path.join(RAIZ, "plugins");
const MENUS = ["menu.js", "menu-ventas.js", "menu-juegos-uru.js"];

// The commands are read from the loaded plugin and not from the file's text, because plugins/tools-ia.js declares
// "get cmd()" to slot in the bot's number and a regex over the source can't see it.
const comandos = new Map();

before(async () => {
  globalThis.client = { user: { lid: "999000@lid", id: "59899000000@s.whatsapp.net", jid: "59899000000@s.whatsapp.net" } };
  globalThis.prefix = [".", "/", "@"];
  globalThis.owners = ["59899111222"];
  globalThis.baileys = "@whiskeysockets/baileys"; // the dynamic import in plugins/_anti-delete-messages.js expects it

  for (const archivo of fs.readdirSync(CARPETA).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(path.join(CARPETA, archivo)).href);
    for (const cmd of (mod.default || mod).cmd || []) {
      const nombre = String(cmd).toLowerCase();
      if (!comandos.has(nombre)) comandos.set(nombre, []);
      comandos.get(nombre).push(archivo);
    }
  }
  assert.ok(comandos.size > 100, `se cargaron muy pocos comandos (${comandos.size}): algo falló al importar los plugins`);
});

// "${usedPrefix}command" in the general menu, ".command" written literally in the others. The dot has to come after
// a space, a · or a parenthesis so a sentence's full stop isn't mistaken for one, and what follows has to start with
// a letter so prices aren't swallowed ("$ 4.500").
const FORMAS = [/\$\{usedPrefix\}([\wáéíóúñ]+)/g, /(?:^|[\s·(/])\.([a-záéíóúñ][\wáéíóúñ]*)/g];

test("todo comando nombrado en un menú existe en algún plugin", () => {
  const faltan = [];
  for (const archivo of MENUS) {
    fs.readFileSync(path.join(CARPETA, archivo), "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (!linea.trimStart().startsWith("▸")) return;
        for (const forma of FORMAS) {
          for (const [, cmd] of linea.matchAll(forma)) {
            if (!comandos.has(cmd.toLowerCase())) faltan.push(`${archivo}:${i + 1} → .${cmd}`);
          }
        }
      });
  }
  assert.deepEqual(faltan, [], `el menú nombra comandos que no existen:\n${faltan.join("\n")}`);
});

// Two plugins sharing a command both run (handle-message.js doesn't stop at the first): almost always an oversight.
// It happened once already, and was fixed in commit 2c0a874.
test("no hay dos plugins declarando el mismo comando", () => {
  const choques = [...comandos.entries()].filter(([, archivos]) => archivos.length > 1).map(([cmd, archivos]) => `.${cmd} → ${archivos.join(", ")}`);
  assert.deepEqual(choques, [], `comandos duplicados:\n${choques.join("\n")}`);
});
