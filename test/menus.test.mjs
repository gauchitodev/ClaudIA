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
// the one that gets blacklist mode's 🔒, see lib/menu.js). Every command appearing on that line, there or in the
// description, has to really exist. The general menu's contents live in lib/menu.js; the paths are from the repo root.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARPETA = path.join(RAIZ, "plugins");
const MENUS = ["lib/menu.js", "plugins/menu-ventas.js", "plugins/menu-juegos-uru.js"];

// The commands are read from the loaded plugin and not from the file's text, because plugins/tools-ia.js declares
// "get cmd()" to slot in the bot's number and a regex over the source can't see it.
const comandos = new Map();
const comandosDe = new Map(); // plugin file -> its commands

before(async () => {
  globalThis.client = { user: { lid: "999000@lid", id: "59899000000@s.whatsapp.net", jid: "59899000000@s.whatsapp.net" } };
  globalThis.prefix = [".", "/", "@"];
  globalThis.owners = ["59899111222"];
  globalThis.baileys = "@whiskeysockets/baileys"; // the dynamic import in plugins/_anti-delete-messages.js expects it

  for (const archivo of fs.readdirSync(CARPETA).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(path.join(CARPETA, archivo)).href);
    comandosDe.set(archivo, ((mod.default || mod).cmd || []).map((c) => String(c).toLowerCase()));
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
    fs.readFileSync(path.join(RAIZ, archivo), "utf8")
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

test("la versión que cuenta Claudia es la del menú y .estado, y el historial arranca por ella", async () => {
  // Claudia said 3.1 while the menu and .estado, which read package.json (globals.js), still said v3.0.0.
  const { VERSION, CAMBIOS } = await import("../lib/manual-claudia.js");
  const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  assert.equal(paquete.version.split(".").slice(0, 2).join("."), VERSION, "package.json y lib/manual-claudia.js tienen que ir juntos");
  assert.equal(CAMBIOS[0].version, VERSION, "la primera entrada del historial es la versión actual");
});

// ---------- the general menu (lib/menu.js) ----------
// Its lines are template strings inside topic objects: these checks make sure the test above really sees them, and
// keep the topics, the 🔒 and "lo más usado" working off the same lines.

test("lib/menu.js: las líneas ▸ están donde el chequeo las ve, con el comando principal pegado", () => {
  const lineas = fs
    .readFileSync(path.join(RAIZ, "lib/menu.js"), "utf8")
    .split("\n")
    .filter((l) => l.trimStart().startsWith("▸"));
  assert.ok(lineas.length > 100, `se encontraron muy pocas líneas ▸ (${lineas.length}): si pasaron a ser elementos de un array, el chequeo de arriba dejó de verlas`);
  const malas = lineas.filter((l) => !/^▸ (\$\{usedPrefix\}[\wáéíóúñ]+|#\w+)/.test(l));
  assert.deepEqual(malas, [], "cada ▸ empieza con ${usedPrefix}comando o con un #hashtag");
});

test("lib/menu.js: títulos sin letras matemáticas de Unicode", () => {
  // 𝚂𝙾𝙻𝙾 𝙰𝙳𝙼𝙸𝙽𝚂 and the like: can't be found with the chat's search and screen readers spell them out.
  assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, "lib/menu.js"), "utf8"), /[\u{1D400}-\u{1D7FF}]/u);
});

test("lib/menu.js: cada sección de .bladd es un tema de .menu, y los alias de ALIAS_DE_LINEA existen", async () => {
  const { secciones } = await import("../lib/secciones.js");
  const M = await import("../lib/menu.js");
  for (const clave of Object.keys(secciones)) assert.ok(M.buscarTema(clave), `.menu ${clave} no lleva a ningún tema`);
  const publicas = M.entradasDelMenu(".").filter((e) => e.seccion.para === "todos");
  for (const [alias, destino] of Object.entries(M.ALIAS_DE_LINEA)) {
    assert.ok(comandos.has(alias), `.${alias} no es un comando`);
    assert.ok(publicas.some((e) => e.cmd === destino), `.${destino} no tiene una línea para todos`);
  }
});

test("lib/menu.js: si un plugin tiene varias líneas para todos, cada alias sabe en cuál cuenta", async () => {
  // "lo más usado" adds an alias to its plugin's first line. With dl-youtube's .audio and .video both in the menu,
  // ".vídeo" would land on .audio: such aliases need their own line, a mention, or ALIAS_DE_LINEA.
  const M = await import("../lib/menu.js");
  const entradas = M.entradasDelMenu(".");
  const publicas = entradas.filter((e) => e.seccion.para === "todos");
  const sueltos = [];
  for (const [archivo, cmds] of comandosDe) {
    if (publicas.filter((e) => cmds.includes(e.cmd)).length < 2) continue;
    for (const alias of cmds) {
      const ubicado = entradas.some((e) => e.cmd === alias || e.nombrados.includes(alias)) || alias in M.ALIAS_DE_LINEA;
      if (!ubicado) sueltos.push(`${archivo}: .${alias}`);
    }
  }
  assert.deepEqual(sueltos, []);
});
