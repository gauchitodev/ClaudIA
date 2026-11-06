// Writes docs/comandos.md from the menus (lib/guia-comandos.js): npm run comandos. Run it after changing a line of
// lib/menu.js or lib/menu-ventas.js and commit the result; test/guia-comandos.test.mjs fails until then.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { textoGuiaComandos } from "../lib/guia-comandos.js";

const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "comandos.md");
const texto = textoGuiaComandos();
fs.mkdirSync(path.dirname(destino), { recursive: true });
const igual = fs.existsSync(destino) && fs.readFileSync(destino, "utf8") === texto;
if (!igual) fs.writeFileSync(destino, texto);
const temas = (texto.match(/^## /gm) || []).length - 1; // minus the index's own heading
const comandos = (texto.match(/^\| `/gm) || []).length;
console.log(`docs/comandos.md: ${temas} temas, ${comandos} comandos${igual ? " (ya estaba al día)" : ""}`);
