// Direct link downloads with yt-dlp: TikTok and Instagram. The music search behind .play has its own flow in
// dl-youtube.js. TikTok often serves the page without the video's data (anti-bot block), so it's requested through
// the mobile API yt-dlp documents, with retries: measured on 2026-09-06, the mobile API worked 6 times out of 8 and
// the web page 2 out of 8. Instagram demands cookies from a logged-in session: if cookies.txt is in the root, it's used.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";
import { RUTA_YT_DLP } from "../load-functions.js";

export const YTDLP = {
  MAX_MB: 60, // WhatsApp won't take heavier videos
  TIMEOUT_MS: 4 * 60 * 1000,
  INTENTOS: 3,
  PAUSA_MS: 1500,
  // H.264 first: WhatsApp doesn't play the H.265 (bytevc1) TikTok offers as its best quality properly
  // (TikTok's "download" format is h264 but carries a watermark)
  FORMATO: "best[vcodec^=h264][height<=720][format_id!=download]/best[vcodec^=h264][format_id!=download]/best[ext=mp4][height<=720]/best[ext=mp4]/best",
  TIKTOK_API: "api22-normal-c-useast2a.tiktokv.com",
  LARGO_TITULO: 120,
  HORA_ACTUALIZACION: 5, // local hour at which yt-dlp -U is run
};

// Injectable for the tests, as in tts.js.
export const _dep = { ejecutar: promisify(execFile), esperar, existe: existsSync };

export const esTikTok = (url) => /^https?:\/\/(www\.|vm\.|vt\.|m\.)?tiktok\.com\/\S+$/i.test(url);
export const esInstagram = (url) => /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/\S+$/i.test(url);

const cookies = () => {
  const ruta = path.resolve("cookies.txt");
  return existsSync(ruta) ? ["--cookies", ruta] : [];
};

// Downloads a link's file into tmp/ and returns { archivo, titulo, autor, duracion }. Throws if yt-dlp fails on
// every attempt, or right away if the file is over the maximum.
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
      // --print implies quiet mode and would swallow the max-filesize notice; with --no-quiet the informational
      // lines come through too, so the metadata one is found by its tabs.
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

// Downloads the link and sends it to the chat as a video or an image. Returns true on success; otherwise it reports
// with textoError and returns false. The temp file is always deleted.
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

// yt-dlp updates itself once a day: the sites change often and an old version stops downloading.
let ytDlpActualizadoEl = null;
export async function actualizarYtDlp() {
  if (!_dep.existe(RUTA_YT_DLP)) return null;
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
