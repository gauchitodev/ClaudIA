import { existsSync, mkdirSync, readdirSync, watch } from "fs";
import { exec } from "child_process";

// YTDLP INSTALL
export async function installYtDlp() {
  const filePath = process.platform === "win32" ? "./node_modules/gs/ygs.exe" : "./node_modules/gs/ygs";
  if (existsSync(filePath)) return;

  if (!existsSync("./node_modules/gs")) {
    mkdirSync("./node_modules/gs");
  }

  const runCommand = (command) =>
    new Promise((resolve, reject) => {
      exec(command, (error, stdout) => {
        if (error) return reject(error);
        resolve(stdout.trim());
      });
    });

  try {
    if (process.platform === "win32") {
      await runCommand("powershell -Command \"Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile './node_modules/gs/ygs.exe'\"");
    } else {
      await runCommand("curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ./node_modules/gs/ygs");
      await runCommand("chmod +x ./node_modules/gs/ygs");
    }
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
