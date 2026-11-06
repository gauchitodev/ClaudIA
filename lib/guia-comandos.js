// The command guide, docs/comandos.md, written from the menus so it can't drift from them: the general menu's topics
// and lines (lib/menu.js, what .menu shows) and the marketplace menu (lib/menu-ventas.js). scripts/generar-comandos.mjs
// writes it (npm run comandos) and test/guia-comandos.test.mjs fails when the file on disk isn't what the menus say.
// The README used to retell every feature in long paragraphs that aged on their own; now it points here.
import { seccionesDelMenu } from "./menu.js";
import { SECCIONES_VENTAS } from "./menu-ventas.js";

const PARA = { todos: "Para todos", mods: "Para moderadores y admins", owner: "Solo para el owner del bot" };

// WhatsApp's *bold* is Markdown's italic: it becomes **bold**. Angle brackets would read as HTML tags on the page.
const md = (t) => String(t).replace(/\*([^*\n]+)\*/g, "**$1**").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const celda = (t) => md(t).replace(/\|/g, "\\|");
// Plain anchors, so the index links work whatever the heading's emoji and accents.
const anclaDe = (clave) => clave.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// "▸ .bal [@mención] 🪙 – `Tu saldo…`" → { comando: ".bal [@mención]", emoji: "🪙", descripcion: "Tu saldo…" }. The emoji
// is the last word before the dash when it carries no letter or digit; a line without one leaves it empty.
export function leerLinea(linea) {
  const sinPunta = String(linea).replace(/^▸\s*/, "");
  const corte = sinPunta.indexOf(" – ");
  const izquierda = (corte < 0 ? sinPunta : sinPunta.slice(0, corte)).trim();
  const descripcion = (corte < 0 ? "" : sinPunta.slice(corte + 3)).trim().replace(/^`|`$/g, "");
  const partes = izquierda.split(/\s+/);
  const emoji = partes.length > 1 && !/[\p{L}\p{N}]/u.test(partes.at(-1)) ? partes.pop() : "";
  return { comando: partes.join(" "), emoji, descripcion };
}

const lineasDe = (seccion) =>
  seccion.lineas
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

// One topic: who it's for and how it opens, its note, and a table with a row per line.
function textoTema(s) {
  const filas = lineasDe(s).map((l) => {
    if (!l.startsWith("▸")) return `| | _${celda(l)}_ |`;
    const { comando, emoji, descripcion } = leerLinea(l);
    // A pipe inside the command (".pin [24h|7d|30d]") would split the cell, backticks or not.
    return `| \`${comando.replace(/\|/g, "\\|")}\`${emoji ? ` ${emoji}` : ""} | ${celda(descripcion)} |`;
  });
  const nota = s.nota
    ? `${String(s.nota)
        .split("\n")
        .map((n) => `> ${md(n)}`)
        .join("\n")}\n\n`
    : "";
  const abre = [s.clave, ...(s.alias || [])].map((a) => `\`.menu ${a}\``).join(", ");
  return `<a id="${anclaDe(s.clave)}"></a>\n## ${s.emoji} ${s.titulo}\n\n_${PARA[s.para]}. Se abre con ${abre}._\n\n${nota}| Comando | Qué hace |\n|---|---|\n${filas.join("\n")}\n`;
}

// The marketplace menu: its headings in bold and a bullet per line, as .menuventas shows them.
function textoVentas() {
  const lineas = SECCIONES_VENTAS.split("\n").map((l) => (l.startsWith("▸") ? `- ${md(l.slice(1).trim())}` : md(l)));
  return `<a id="compraventa"></a>\n## 🏷️ Modo compraventa\n\n_Para todos. Es el menú de \`.menuventas\`, para los grupos de compra y venta (\`.modo compraventa\`)._\n\n${lineas.join("\n")}\n`;
}

export function textoGuiaComandos() {
  const secciones = seccionesDelMenu(".");
  const indice = [...secciones.map((s) => `| [${s.emoji} ${s.titulo}](#${anclaDe(s.clave)}) | ${PARA[s.para].toLowerCase()} |`), "| [🏷️ Modo compraventa](#compraventa) | para todos, con `.menuventas` |"];
  const cabecera = [
    "# Comandos de Claudia",
    "",
    "_Generado desde `lib/menu.js` y `lib/menu-ventas.js` con `npm run comandos`: no se edita a mano, y un test (`test/guia-comandos.test.mjs`) avisa si quedó viejo._",
    "",
    "Los comandos van con un punto adelante (`.menu`); también andan `/` y `@`. En un grupo, `.menu` muestra lo más usado ahí y los temas; `.menu <tema>` abre uno y `.menu todo` los trae todos. No se ofrece lo que el grupo tiene apagado (`.juegos`, `.casino`, `.monedas`, o un juego solo con `.juego`), lo que necesita que Claudia sea admin cuando no lo es, ni lo que el rol de quien pregunta no puede usar. En la charla, Claudia también explica sus comandos si se le pregunta.",
    "",
    "## Temas",
    "",
    "| Tema | Para quién |",
    "|---|---|",
    ...indice,
    "",
  ];
  return `${cabecera.join("\n")}\n${secciones.map(textoTema).join("\n")}\n${textoVentas()}`;
}
