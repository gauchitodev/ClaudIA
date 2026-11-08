import { existsSync, mkdirSync, readdirSync, watch } from "fs";
import { writeFile } from "fs/promises";
import { cargados } from "./lib/plugins-cargados.js";

// yt-dlp: the binary is downloaded to ./bin (git-ignored) if missing.
// It used to live in node_modules/gs, and every npm ci wiped it.
const BIN = "./bin";
export const RUTA_YT_DLP = `${BIN}/${process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"}`;

export async function installYtDlp() {
  if (existsSync(RUTA_YT_DLP)) return;
  mkdirSync(BIN, { recursive: true });
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} al bajar yt-dlp`);
    await writeFile(RUTA_YT_DLP, Buffer.from(await res.arrayBuffer()), { mode: 0o755 });
    console.log(`⬇️ yt-dlp descargado en ${RUTA_YT_DLP}`);
  } catch (e) {
    console.error("Error con instalacion de Youtube", e);
  }
}

// Every plugin of the folder, into lib/plugins-cargados.js, from scratch. The folder as recargarPlugin takes it: the
// bot's own, or a whole path (the tests).
export async function loadPlugins(carpeta = "./plugins/") {
  cargados.plugins = {};
  const pluginFiles = readdirSync(carpeta).filter((file) => file.endsWith(".js"));

  for (const file of pluginFiles) {
    try {
      const module = await import(`${carpeta}${file}`);
      const plugin = module.default || module;
      const pluginName = file.replace(".js", "");
      cargados.plugins[pluginName] = plugin;
    } catch (error) {
      console.error(`❌ Error al cargar el plugin ${file}:`, error);
    }
  }
}

// The order handle-message.js runs the hooks (plugin.before) in. The moderation ones (plugin.moderacion: the
// anti-links, the blacklist, the mass mentions) go first, so what they delete reaches no other hook (handle-message.js
// skips the rest for it, all but the short-term memory); right after them,
// what has to see each message as soon as it's known to stay (plugin.trasModeracion: Claudia's short-term memory, so a
// message gets there in the order it came and not after the sends of the hooks before it); then the games played with
// plain messages (plugin.jugadas: the tic-tac-toe, the 4 en línea, the hangman), which take their moves and mark them
// (m.respuestaDeJuego) before any other game sees them: one message, one game. Claudia's chat (plugin.alFinal) goes
// last, so she knows what was deleted and what a game took as an answer. The rest keep the order they were loaded
// in, which hot reloading changes. It used to be the folder's alphabetical order alone: a trivia answer that named
// Claudia waited for her to think and type while a later one took the prize, a blacklisted person got her answer
// before being removed, #vendo published a post the anti-link had just deleted, and a "7" was a column of the 4 en
// línea and an answer to the trivia at once.
export function hooksEnOrden(plugins) {
  const hooks = Object.values(plugins || {}).filter((plugin) => typeof plugin?.before === "function");
  const moderacion = hooks.filter((plugin) => plugin.moderacion);
  const trasModeracion = hooks.filter((plugin) => plugin.trasModeracion && !moderacion.includes(plugin));
  const tomados = new Set([...moderacion, ...trasModeracion]);
  const jugadas = hooks.filter((plugin) => plugin.jugadas && !tomados.has(plugin));
  for (const plugin of jugadas) tomados.add(plugin);
  const alFinal = hooks.filter((plugin) => plugin.alFinal && !tomados.has(plugin));
  for (const plugin of alFinal) tomados.add(plugin);
  const resto = hooks.filter((plugin) => !tomados.has(plugin));
  return [...moderacion, ...trasModeracion, ...jugadas, ...resto, ...alFinal];
}

// Watch plugins for changes
export function watchPlugins() {
  watch("./plugins/", { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith(".js")) return;
    recargarPlugin(filename, eventType);
  });
}

// One plugin again, after its file changed. The version that works stays until the new one loads, so a file saved
// halfway, or with a typo, doesn't leave the command missing. Each reload imports a URL of its own: one already loaded
// comes back from the cache as it was then, and a save can bring two events in the same millisecond.
let recargas = 0;
export async function recargarPlugin(filename, eventType, carpeta = "./plugins/") {
  const pluginName = filename.replace(".js", "");
  const pluginPath = `${carpeta}${filename}`;

  if (!existsSync(pluginPath)) {
    delete cargados.plugins[pluginName];
    console.log(`🗑️ Plugin eliminado: ${filename}`);
    return;
  }

  const isNewPlugin = !(pluginName in cargados.plugins);
  try {
    const module = await import(`${pluginPath}?update=${Date.now()}-${++recargas}`);
    // A file caught empty while it's being written loads without errors, and without a plugin.
    if (!module.default) throw new Error("el archivo no exporta ningún plugin (¿se estaba guardando?)");
    cargados.plugins[pluginName] = module.default;

    if (eventType === "rename" && isNewPlugin) {
      console.log(`✅ Plugin añadido: ${filename}`);
    } else if (!isNewPlugin) {
      console.log(`♻️ Plugin actualizado: ${filename}`);
    }
  } catch (error) {
    console.error(`❌ Error al recargar el plugin ${filename}${isNewPlugin ? "" : " (sigue andando la versión anterior)"}:`, error);
  }
}
