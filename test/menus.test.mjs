import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// Los menús se escriben a mano y los plugin.cmd cambian por su cuenta: esto evita que se separen. Hasta ahora la
// disciplina era manual (el comentario de plugins/menu-ventas.js), y nada avisaba si un menú quedaba nombrando un
// comando que ya no existe: el único que se enteraba era quien lo escribía y recibía "el comando no existe".
//
// Regla de formato: en los menús, una línea que empieza con "▸" nombra un solo comando principal pegado al ▸ (ese es
// el que recibe el candado 🔒 del modo blacklist, ver plugins/menu.js). Todo comando que aparezca en esa línea, ahí o
// en la descripción, tiene que existir de verdad.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARPETA = path.join(RAIZ, "plugins");
const MENUS = ["menu.js", "menu-ventas.js", "menu-juegos-uru.js"];

// Los comandos se leen del plugin ya cargado y no del texto del archivo, porque plugins/tools-ia.js declara "get cmd()"
// para meter el número del bot y un regex sobre el fuente no lo ve.
const comandos = new Map();

before(async () => {
  globalThis.client = { user: { lid: "999000@lid", id: "59899000000@s.whatsapp.net", jid: "59899000000@s.whatsapp.net" } };
  globalThis.prefix = [".", "/", "@"];
  globalThis.owners = ["59899111222"];
  globalThis.baileys = "@whiskeysockets/baileys"; // lo espera el import dinámico de plugins/_anti-delete-messages.js

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

// "${usedPrefix}comando" en el menú general, ".comando" escrito tal cual en los otros. El punto tiene que venir
// después de un espacio, un · o un paréntesis para no confundir el punto final de una oración, y lo que sigue tiene
// que empezar con letra para no comerse los precios ("$ 4.500").
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

// Dos plugins con el mismo comando corren los dos (handle-message.js no corta en el primero): casi siempre es un
// descuido. Ya pasó una vez, y se arregló en el commit 2c0a874.
test("no hay dos plugins declarando el mismo comando", () => {
  const choques = [...comandos.entries()].filter(([, archivos]) => archivos.length > 1).map(([cmd, archivos]) => `.${cmd} → ${archivos.join(", ")}`);
  assert.deepEqual(choques, [], `comandos duplicados:\n${choques.join("\n")}`);
});
