import { existsSync, mkdirSync, readdirSync, watch } from "fs";
import { writeFile } from "fs/promises";

// yt-dlp: se baja el binario a ./bin (ignorado por git) si no está. Antes vivía en node_modules/gs, y cada npm ci lo borraba.
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

// Cargar plugins
export async function loadPlugins() {
  globalThis.plugins = {};
  const pluginFiles = readdirSync("./plugins/").filter((file) => file.endsWith(".js"));

  for (const file of pluginFiles) {
    try {
      const module = await import(`./plugins/${file}`);
      const plugin = module.default || module;
      const pluginName = file.replace(".js", "");
      globalThis.plugins[pluginName] = plugin;
    } catch (error) {
      console.error(`❌ Error al cargar el plugin ${file}:`, error);
    }
  }
}

// Controlar cambios en plugins
export function watchPlugins() {
  watch("./plugins/", { recursive: true }, async (eventType, filename) => {
    if (!filename || !filename.endsWith(".js")) return;

    const pluginName = filename.replace(".js", "");
    const pluginPath = `./plugins/${filename}`;

    if (!existsSync(pluginPath)) {
      delete globalThis.plugins[pluginName];
      console.log(`🗑️ Plugin eliminado: ${filename}`);
      return;
    }

    try {
      const isNewPlugin = !(pluginName in globalThis.plugins);

      delete globalThis.plugins[pluginName];

      const module = await import(`${pluginPath}?update=${Date.now()}`);
      const plugin = module.default || module;

      globalThis.plugins[pluginName] = plugin;

      if (eventType === "rename" && isNewPlugin) {
        console.log(`✅ Plugin añadido: ${filename}`);
      } else if (!isNewPlugin) {
        console.log(`♻️ Plugin actualizado: ${filename}`);
      }
    } catch (error) {
      console.error(`❌ Error al recargar el plugin ${filename}:`, error);
    }
  });
}
