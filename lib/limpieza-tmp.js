// Cleanup of the tmp folder (downloads, stickers, converted audio, canvas images). main.js fires it every half hour.
// It deletes by age and not blindly: a yt-dlp download can take up to 12 minutes (4 of timeout per attempt, up to 3
// attempts), and wiping everything at once meant the cleanup pulled the file out from under a running download.
import { readdirSync, rmSync, statSync } from "fs";

// Nothing touched more recently than this gets deleted. With the cleanup running every 30 minutes, an abandoned file
// sobrevive como mucho 45.
export const TMP_EDAD_MINIMA_MS = 15 * 60 * 1000;

// Returns how many entries it deleted.
export function limpiarTmp(dir = "./tmp", ahora = Date.now()) {
  let entradas;
  try {
    entradas = readdirSync(dir);
  } catch (e) {
    console.error("[tmp] no se pudo leer la carpeta:", e.message);
    return 0;
  }

  let borrados = 0;
  for (const nombre of entradas) {
    const ruta = `${dir}/${nombre}`;
    try {
      // mtime and not birthtime: the creation date isn't available on every Android filesystem.
      // On a folder the mtime is also updated when files are added or removed, so one with fresh contents is left
      // alone too.
      if (ahora - statSync(ruta).mtimeMs < TMP_EDAD_MINIMA_MS) continue;
      rmSync(ruta, { recursive: true, force: true });
      borrados++;
    } catch (e) {
      // ENOENT is normal: it vanished between the listing and the delete because the plugin that created it removed it.
      if (e.code !== "ENOENT") console.error(`[tmp] no se pudo borrar ${nombre}:`, e.message);
    }
  }
  return borrados;
}
