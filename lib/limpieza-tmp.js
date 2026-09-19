// Limpieza de la carpeta tmp (descargas, stickers, audios convertidos, imágenes de canvas). La dispara main.js cada
// media hora. Borra por antigüedad y no a ciegas: una descarga de yt-dlp puede tardar hasta 12 minutos (4 de timeout
// por intento, hasta 3 intentos), y borrando todo de una la limpieza le sacaba el archivo a una descarga en curso.
import { readdirSync, rmSync, statSync } from "fs";

// Nada que se haya tocado hace menos de esto se borra. Con la limpieza cada 30 minutos, un archivo abandonado
// sobrevive como mucho 45.
export const TMP_EDAD_MINIMA_MS = 15 * 60 * 1000;

// Devuelve cuántas entradas borró.
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
      // mtime y no birthtime: la fecha de creación no está disponible en todos los sistemas de archivos de Android.
      // En una carpeta el mtime también se actualiza al agregarle o sacarle archivos, así que una con contenido
      // fresco tampoco se toca.
      if (ahora - statSync(ruta).mtimeMs < TMP_EDAD_MINIMA_MS) continue;
      rmSync(ruta, { recursive: true, force: true });
      borrados++;
    } catch (e) {
      // ENOENT es normal: desapareció entre el listado y el borrado porque lo borró el plugin que lo creó.
      if (e.code !== "ENOENT") console.error(`[tmp] no se pudo borrar ${nombre}:`, e.message);
    }
  }
  return borrados;
}
