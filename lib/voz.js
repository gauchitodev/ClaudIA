// Claudia's voice: Microsoft Edge's neural voices, through the edge-tts command (Python: pip install edge-tts), which
// then goes out as a voice note (sendFile with ptt turns the mp3 into ogg/opus, lib/wa-socket.js). es-AR-ElenaNeural
// unless config.toml's [voz] says otherwise. Per group, .voz says when she speaks (chats.voz): "" never, "audios" when
// they talk to her by voice note, "aveces" to a voice note and now and then a short answer, "siempre" always; and .tts uses the same voice when the command is there. Without
// edge-tts installed, or when it fails, everything goes by text, as always: the voice never costs an answer.
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { getChat, updateChat } from "../database-functions.js";

export const VOZ = {
  VOZ_DEFAULT: "es-AR-ElenaNeural",
  MAX_LETRAS: 700, // longer answers go by text: nobody listens to a four-minute voice note
  TIMEOUT_MS: 20000,
  REINTENTO_MS: 10 * 60 * 1000, // without the command, it's looked for again after this: installing it needs no restart
  A_VECES_PROBABILIDAD: 0.25, // .voz aveces: about one answer in four goes by voice
  A_VECES_MAX_LETRAS: 250, // and only a short one: a long voice note nobody asked for is a chore to listen to
};

// So the tests hand over a fake edge-tts and their own clock.
export const _dep = { ejecutar: promisify(execFile), ahora: () => Date.now(), random: Math.random };

const ajustes = () => ({ voz: globalThis.vozConfig?.voz || VOZ.VOZ_DEFAULT, velocidad: globalThis.vozConfig?.velocidad || "+0%", tono: globalThis.vozConfig?.tono || "+0Hz" });
// "Elena", out of "es-AR-ElenaNeural"; the whole name when it doesn't read like one.
export const nombreDeLaVoz = () => ajustes().voz.match(/-([A-Za-z]+?)(Multilingual)?Neural$/)?.[1] || ajustes().voz;

// Whether the edge-tts command is there, asked with --version (no network) and remembered for a while.
let comando = { hay: null, cuando: 0 };
export async function hayVoz() {
  if (comando.hay !== null && _dep.ahora() - comando.cuando < VOZ.REINTENTO_MS) return comando.hay;
  try {
    await _dep.ejecutar("edge-tts", ["--version"], { timeout: 10000 });
    comando = { hay: true, cuando: _dep.ahora() };
  } catch {
    comando = { hay: false, cuando: _dep.ahora() };
  }
  return comando.hay;
}
export const olvidarVoz = () => (comando = { hay: null, cuando: 0 }); // for the tests

// What's read aloud: no markdown marks, no emoji, a link said as "link", one space between words.
export function limpiarParaVoz(texto) {
  return String(texto || "")
    .replace(/https?:\/\/\S+/gi, "link")
    .replace(/[*_~`]/g, "")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The mp3 of the text, or null when there's nothing to say, it's too long, the voice isn't there or it fails (logged):
// whoever asked goes by text then. The arguments go as --name=value: edge-tts takes "-10%" as a flag otherwise.
export async function hablar(texto, { maxLetras = VOZ.MAX_LETRAS } = {}) {
  const limpio = limpiarParaVoz(texto);
  if (!limpio || limpio.length > Math.min(maxLetras, VOZ.MAX_LETRAS)) return null;
  if (!(await hayVoz())) return null;
  const { voz, velocidad, tono } = ajustes();
  const salida = path.join("tmp", `voz_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
  try {
    if (!fs.existsSync("tmp")) fs.mkdirSync("tmp");
    await _dep.ejecutar("edge-tts", [`--voice=${voz}`, `--rate=${velocidad}`, `--pitch=${tono}`, `--text=${limpio}`, `--write-media=${salida}`, "--no-progress"], { timeout: VOZ.TIMEOUT_MS });
    const audio = fs.readFileSync(salida);
    return audio.length ? audio : null;
  } catch (e) {
    if (e?.code === "ENOENT") comando = { hay: false, cuando: _dep.ahora() };
    console.error("[voz] no salió el audio:", e?.message || e);
    return null;
  } finally {
    fs.rmSync(salida, { force: true });
  }
}

// ---------- .voz: when she speaks in a group ----------
export const MODOS_VOZ = { "": "apagada", audios: "audios", aveces: "a veces", siempre: "siempre" };
export function modoDeVoz(chat) {
  const v = getChat(chat)?.voz || "";
  return v in MODOS_VOZ ? v : "";
}
// Whether this answer goes by voice: always, to a voice note, or (aveces) to a voice note and one answer in four.
export function hablaCon(chat, { notaDeVoz = false } = {}) {
  const modo = modoDeVoz(chat);
  if (modo === "siempre") return true;
  if (notaDeVoz) return modo === "audios" || modo === "aveces";
  return modo === "aveces" && _dep.random() < VOZ.A_VECES_PROBABILIDAD;
}
// The longest answer that goes by voice: in aveces, only the short ones she wasn't spoken to by voice for.
export const maxLetrasDeVoz = (chat, { notaDeVoz = false } = {}) => (modoDeVoz(chat) === "aveces" && !notaDeVoz ? VOZ.A_VECES_MAX_LETRAS : VOZ.MAX_LETRAS);
export const fijarVoz = (chat, modo) => updateChat(chat, { voz: modo });

export function textoVoz(chat) {
  const modo = modoDeVoz(chat);
  const como = `con la voz de ${nombreDeLaVoz()}`;
  if (modo === "siempre") return `🎙️ Voz en este grupo: siempre, ${como}. Con .voz on hablo solo cuando me hablan por nota de voz, y con .voz off vuelvo al texto.`;
  if (modo === "aveces") return `🎙️ Voz en este grupo: a veces, ${como}: cuando me hablan por nota de voz y, de vez en cuando, alguna respuesta corta. Con .voz siempre hablo todo, y con .voz off vuelvo al texto.`;
  if (modo === "audios") return `🎙️ Voz en este grupo: cuando me hablan por nota de voz, ${como}. Con .voz siempre hablo todo, y con .voz off vuelvo al texto.`;
  return "🎙️ Voz en este grupo: apagada, contesto por texto. Un admin la prende con .voz on (contesto con nota de voz cuando me hablan por nota de voz) .voz aveces (eso y, de vez en cuando, alguna respuesta corta) o .voz siempre (todo por voz).";
}
