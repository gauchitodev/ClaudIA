// Descargas de links directos con yt-dlp: TikTok e Instagram. La búsqueda de música de .play tiene su propio flujo
// en dl-youtube.js. TikTok muchas veces sirve la página sin los datos del video (bloqueo antibot), así que se pide
// por la API móvil que documenta yt-dlp y se reintenta: medido el 6/9/2026, la API móvil anduvo 6 de 8 veces y la
// página web 2 de 8. Instagram exige cookies de una sesión iniciada: si hay cookies.txt en la raíz, se usa.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";
import { RUTA_YT_DLP } from "../load-functions.js";

export const YTDLP = {
  MAX_MB: 60, // WhatsApp no acepta videos más pesados
  TIMEOUT_MS: 4 * 60 * 1000,
  INTENTOS: 3,
  PAUSA_MS: 1500,
  // H.264 primero: WhatsApp no reproduce bien el H.265 (bytevc1) que TikTok ofrece como mejor calidad
  // (el formato "download" de TikTok es h264 pero lleva marca de agua)
  FORMATO: "best[vcodec^=h264][height<=720][format_id!=download]/best[vcodec^=h264][format_id!=download]/best[ext=mp4][height<=720]/best[ext=mp4]/best",
  TIKTOK_API: "api22-normal-c-useast2a.tiktokv.com",
  LARGO_TITULO: 120,
  HORA_ACTUALIZACION: 5, // hora local en que se corre yt-dlp -U
};

// Inyectable para los tests, como en tts.js.
export const _dep = { ejecutar: promisify(execFile), esperar };

export const esTikTok = (url) => /^https?:\/\/(www\.|vm\.|vt\.|m\.)?tiktok\.com\/\S+$/i.test(url);
export const esInstagram = (url) => /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/\S+$/i.test(url);

const cookies = () => {
  const ruta = path.resolve("cookies.txt");
  return existsSync(ruta) ? ["--cookies", ruta] : [];
};

// Baja el archivo de un link a tmp/ y devuelve { archivo, titulo, autor, duracion }. Lanza si yt-dlp falla en todos
// los intentos, o enseguida si el archivo supera el máximo.
export async function descargar(url) {
  await fs.mkdir("tmp", { recursive: true });
  const base = path.join("tmp", `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const extra = esTikTok(url) ? ["--extractor-args", `tiktok:api_hostname=${YTDLP.TIKTOK_API}`] : [];
  const args = [...cookies(), ...extra, "--no-warnings", "--no-playlist", "-f", YTDLP.FORMATO, "--max-filesize", `${YTDLP.MAX_MB}M`, "--print", "after_move:%(uploader)s\t%(title)s\t%(duration)s\t%(filepath)s", "--no-quiet", "--no-progress", "-o", `${base}.%(ext)s`, url];
  let ultimoError = null;
  for (let intento = 1; intento <= YTDLP.INTENTOS; intento++) {
    try {
      const { stdout = "", stderr = "" } = await _dep.ejecutar(path.resolve(RUTA_YT_DLP), args, { timeout: YTDLP.TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
      if (/max-filesize/i.test(`${stdout}\n${stderr}`)) throw Object.assign(new Error(`el archivo pesa más de ${YTDLP.MAX_MB} MB`), { definitivo: true });
      // --print implica modo silencioso y taparía el aviso de max-filesize; con --no-quiet salen también las líneas
      // informativas, así que la de la metadata se busca por sus tabuladores.
      const linea = stdout.split("\n").filter((l) => l.split("\t").length >= 4).at(-1) || "";
      const [autor, titulo, duracion, archivo] = linea.split("\t");
      if (archivo && existsSync(archivo)) return { archivo, autor: autor || "", titulo: titulo || "", duracion: Number(duracion) || 0 };
      throw new Error("yt-dlp terminó sin dejar archivo");
    } catch (e) {
      ultimoError = e;
      const detalle = `${e.stderr || ""}\n${e.message || ""}`.split("\n").find((l) => l.includes("ERROR")) || e.message;
      console.error(`[ytdlp] intento ${intento}/${YTDLP.INTENTOS} con ${url}: ${String(detalle).slice(0, 200)}`);
      if (e.definitivo) break;
      if (intento < YTDLP.INTENTOS) await _dep.esperar(YTDLP.PAUSA_MS);
    }
  }
  throw ultimoError;
}

const recortar = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
export const textoDescarga = (exito, { titulo = "", autor = "" } = {}) => [exito, titulo && `*${recortar(titulo, YTDLP.LARGO_TITULO)}*`, autor && `👤 ${autor}`].filter(Boolean).join("\n");

// Baja el link y lo manda al chat como video o imagen. Devuelve true si salió; si no, avisa con textoError y devuelve
// false. El archivo temporal se borra siempre.
export async function bajarYEnviar({ client, m, url, textoExito, textoError }) {
  let archivo = null;
  try {
    const r = await descargar(url);
    archivo = r.archivo;
    const buffer = await fs.readFile(archivo);
    const caption = textoDescarga(textoExito, r);
    const contenido = /\.(jpe?g|png|webp)$/i.test(archivo) ? { image: buffer, caption } : { video: buffer, caption };
    await client.sendMessage(m.chat, contenido, { quoted: m });
    m.react?.("✅");
    return true;
  } catch (e) {
    console.error(`[ytdlp] ${url}: ${String(e.message || e).split("\n")[0].slice(0, 200)}`);
    m.react?.("❌");
    await client.sendText(m.chat, e.definitivo ? `❌ ${e.message}.` : textoError, m);
    return false;
  } finally {
    if (archivo) await fs.unlink(archivo).catch(() => {});
  }
}

// yt-dlp se actualiza solo una vez por día: los sitios cambian seguido y una versión vieja deja de bajar.
let ytDlpActualizadoEl = null;
export async function actualizarYtDlp() {
  if (!existsSync(RUTA_YT_DLP)) return null;
  try {
    const { stdout = "" } = await _dep.ejecutar(path.resolve(RUTA_YT_DLP), ["-U"], { timeout: 3 * 60 * 1000 });
    const linea = stdout.trim().split("\n").filter(Boolean).at(-1) || "";
    if (!/up to date/i.test(linea)) console.log(`[yt-dlp] ${linea}`);
    return linea;
  } catch (e) {
    console.error("[yt-dlp] no se pudo actualizar:", String(e.message || e).split("\n")[0].slice(0, 200));
    return null;
  }
}
export async function chequearActualizacionYtDlp(ahora = new Date()) {
  const hoy = ahora.toDateString();
  if (ahora.getHours() !== YTDLP.HORA_ACTUALIZACION || ytDlpActualizadoEl === hoy) return false;
  ytDlpActualizadoEl = hoy;
  await actualizarYtDlp();
  return true;
}
