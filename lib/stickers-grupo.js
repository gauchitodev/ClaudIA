// The stickers each group sends, and Claudia sending them back: .stickerazar (at random, or one that fits a word),
// when someone answers one of her messages with a sticker (plugins/_stickers-grupo.js), and on her own in a glance
// (lib/vistazos.js). Every sticker people send in a group is kept for that group: the file once in
// database/stickers/<sha>.webp, the row in stickers_grupo (database-schema.js). A group keeps at most
// STICKERS.MAX_POR_GRUPO; past that, the ones sent the fewest times and longest ago go. An admin takes one out with
// .sacarsticker, and it isn't kept again.
//
// To pick with some sense, the AI looks at each sticker once and writes down what it shows and what it's for
// (stickers_descripcion), a few a day, in the background. Answering a sticker and glancing, she chooses from those
// descriptions; .respuestastickers off stops both in a group.
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { db } from "../database-functions.js";
import { preguntarGemini } from "./gemini.js";
import { normalizar } from "./iniciativa.js";

const MIN = 60 * 1000;

// Mutable, like INICIATIVA, so the tests can move them.
export const STICKERS = {
  MAX_POR_GRUPO: 200,
  MAX_BYTES: 1024 * 1024, // WhatsApp's own cap for an animated sticker is 1 MB; anything bigger isn't a sticker
  MIN_PARA_MANDAR: 3, // with fewer than this she doesn't pick one on her own: it would always be the same
  NO_REPETIR: 10, // the latest ones she sent in the group are left out of the draw, while there are others
  RESPUESTA_PROBABILIDAD: 0.6, // answered with a sticker, she answers with one this often
  RESPUESTA_PAUSA_MS: 2 * 60 * 1000, // and not again in the same group for this long
  DESCRIPCIONES_DIA: 40, // stickers the AI looks at a day, all groups together: Gemini's quota is shared with the chat
  REINTENTO_MS: 6 * 60 * MIN, // a sticker it couldn't look at is tried again after this
  MAX_INTENTOS: 3, // and after this many, left without a description (it still goes out at random)
  MENU_MAX: 25, // described stickers offered to the AI to choose from
  MAX_LARGO_DESCRIPCION: 160,
};

// Randomness, the folder, the AI and the pause between descriptions, swappable by the tests.
export const _dep = { random: Math.random, carpeta: () => path.join("database", "stickers"), preguntar: (...a) => preguntarGemini(...a), esperar: (ms) => new Promise((r) => setTimeout(r, ms)) };

export const shaDe = (buffer) => createHash("sha256").update(buffer).digest("hex");
const archivoDe = (sha) => path.join(_dep.carpeta(), `${sha}.webp`);

// A webp starts with "RIFF", four bytes of size, "WEBP". Anything else (a download that came back as an error page, an
// empty buffer) isn't kept.
export function esWebp(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 12 && buffer.length <= STICKERS.MAX_BYTES && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
}

// Keeps a sticker someone sent in a group. Returns "nuevo", "repetido" (it was there: one more time it came), "sacado"
// (an admin took it out) or "invalido".
export function guardarSticker(chat, autor, buffer, ahora = Date.now()) {
  if (!chat || !esWebp(buffer)) return "invalido";
  const sha = shaDe(buffer);
  const fila = db.prepare(`SELECT sacado FROM stickers_grupo WHERE chat = ? AND sha = ?`).get(chat, sha);
  if (fila?.sacado) return "sacado";
  const archivo = archivoDe(sha);
  if (!fs.existsSync(archivo)) {
    fs.mkdirSync(_dep.carpeta(), { recursive: true });
    fs.writeFileSync(archivo, buffer);
  }
  if (fila) {
    db.prepare(`UPDATE stickers_grupo SET veces = veces + 1, ultimo = ? WHERE chat = ? AND sha = ?`).run(ahora, chat, sha);
    return "repetido";
  }
  db.prepare(`INSERT INTO stickers_grupo (chat, sha, autor, veces, primero, ultimo) VALUES (?, ?, ?, 1, ?, ?)`).run(chat, sha, autor || null, ahora, ahora);
  podar(chat);
  return "nuevo";
}

// Over the cap, the ones sent the fewest times go first, and among those the ones not seen for longest.
function podar(chat) {
  const sobran = cuantosStickers(chat) - STICKERS.MAX_POR_GRUPO;
  if (sobran <= 0) return;
  const fuera = db.prepare(`SELECT sha FROM stickers_grupo WHERE chat = ? AND sacado = 0 ORDER BY veces ASC, ultimo ASC LIMIT ?`).all(chat, sobran);
  for (const { sha } of fuera) {
    db.prepare(`DELETE FROM stickers_grupo WHERE chat = ? AND sha = ?`).run(chat, sha);
    borrarSiNadieLoTiene(sha);
  }
}

// The file goes once no group keeps the sticker (a taken-out row keeps only its sha, to recognize it).
function borrarSiNadieLoTiene(sha) {
  if (db.prepare(`SELECT 1 FROM stickers_grupo WHERE sha = ? AND sacado = 0`).get(sha)) return;
  try {
    fs.unlinkSync(archivoDe(sha));
  } catch {}
}

export function cuantosStickers(chat) {
  return db.prepare(`SELECT COUNT(*) AS n FROM stickers_grupo WHERE chat = ? AND sacado = 0`).get(chat).n;
}

// .sacarsticker: out of the group's stickers for good. Returns whether she had it.
export function sacarSticker(chat, buffer, ahora = Date.now()) {
  if (!chat || !Buffer.isBuffer(buffer) || !buffer.length) return false;
  const sha = shaDe(buffer);
  const tenia = Boolean(db.prepare(`SELECT 1 FROM stickers_grupo WHERE chat = ? AND sha = ? AND sacado = 0`).get(chat, sha));
  db.prepare(`INSERT INTO stickers_grupo (chat, sha, veces, primero, ultimo, sacado) VALUES (?, ?, 0, ?, ?, 1) ON CONFLICT(chat, sha) DO UPDATE SET sacado = 1`).run(chat, sha, ahora, ahora);
  borrarSiNadieLoTiene(sha);
  return tenia;
}

// One of the group's stickers at random, the ones sent more often a little likelier, leaving out the latest she sent.
// excluir: shas that never come out (the sticker she's answering: with few kept, she sent back the very one she got).
// { sha, buffer }, or null when the group has none.
export function stickerAlAzar(chat, { excluir = [] } = {}) {
  const fuera = new Set(excluir);
  for (let intento = 0; intento < 3; intento++) {
    const filas = db.prepare(`SELECT sha, veces, usado FROM stickers_grupo WHERE chat = ? AND sacado = 0`).all(chat).filter((f) => !fuera.has(f.sha));
    if (!filas.length) return null;
    const recientes = new Set(
      filas
        .filter((f) => f.usado)
        .sort((a, b) => b.usado - a.usado)
        .slice(0, STICKERS.NO_REPETIR)
        .map((f) => f.sha),
    );
    const candidatas = filas.length > recientes.size ? filas.filter((f) => !recientes.has(f.sha)) : filas;
    const peso = (f) => 1 + Math.min(f.veces, 5);
    let tiro = _dep.random() * candidatas.reduce((s, f) => s + peso(f), 0);
    const elegida = candidatas.find((f) => (tiro -= peso(f)) < 0) || candidatas.at(-1);
    try {
      return { sha: elegida.sha, buffer: fs.readFileSync(archivoDe(elegida.sha)) };
    } catch {
      // The file is gone (the folder was cleaned by hand): the row goes too, and another one is drawn.
      db.prepare(`DELETE FROM stickers_grupo WHERE chat = ? AND sha = ?`).run(chat, elegida.sha);
    }
  }
  return null;
}

// Sends one at random, quoting a message if given. Returns what sendMessage returned, or null if there was nothing to
// send or it didn't go out.
export async function mandarStickerAlAzar(client, chat, quoted = null, { excluir = [], ahora = Date.now() } = {}) {
  const elegido = stickerAlAzar(chat, { excluir });
  if (!elegido) return null;
  const enviado = await client.sendMessage(chat, { sticker: elegido.buffer }, quoted ? { quoted } : {});
  if (!enviado) return null;
  db.prepare(`UPDATE stickers_grupo SET usado = ? WHERE chat = ? AND sha = ?`).run(ahora, chat, elegido.sha);
  return enviado;
}

// ---------- what each sticker is ----------

export const descripcionDe = (sha) => db.prepare(`SELECT descripcion FROM stickers_descripcion WHERE sha = ?`).get(sha)?.descripcion || null;

const inicioDelDia = (ahora) => new Date(ahora).setHours(0, 0, 0, 0);

// The ones still to look at, the ones sent most often first: what the groups use the most is what's worth knowing.
function pendientes(ahora, limite) {
  return db
    .prepare(
      `SELECT g.sha, SUM(g.veces) AS veces FROM stickers_grupo g LEFT JOIN stickers_descripcion d ON d.sha = g.sha
       WHERE g.sacado = 0 AND d.descripcion IS NULL AND COALESCE(d.intentos, 0) < ? AND COALESCE(d.ultimo_intento, 0) <= ?
       GROUP BY g.sha ORDER BY veces DESC LIMIT ?`,
    )
    .all(STICKERS.MAX_INTENTOS, ahora - STICKERS.REINTENTO_MS, limite)
    .map((f) => f.sha);
}

const ESQUEMA_DESCRIPCION = { type: "object", properties: { descripcion: { type: "string" } }, required: ["descripcion"] };
const PROMPT_DESCRIPCION =
  "Es un sticker de WhatsApp. En una sola línea de hasta 20 palabras, en español: qué muestra, el texto que tenga escrito (si tiene) y para qué se usa en una charla (risa, burla, sorpresa, aprobación, tristeza, enojo, ternura, saludo, no entendí, etc.). Sin introducción.";

export function limpiarDescripcion(texto) {
  const t = String(texto || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“”']+|["“”']+$/g, "");
  return t.length > STICKERS.MAX_LARGO_DESCRIPCION ? `${t.slice(0, STICKERS.MAX_LARGO_DESCRIPCION - 1).trim()}…` : t;
}

// The AI looks at one sticker. Returns the description, or null (no quota, refused, the file is gone).
export async function describirSticker(sha, ahora = Date.now()) {
  let buffer;
  try {
    buffer = fs.readFileSync(archivoDe(sha));
  } catch {
    return null;
  }
  db.prepare(`INSERT INTO stickers_descripcion (sha, intentos, ultimo_intento) VALUES (?, 1, ?) ON CONFLICT(sha) DO UPDATE SET intentos = intentos + 1, ultimo_intento = excluded.ultimo_intento`).run(sha, ahora);
  const r = await _dep.preguntar(PROMPT_DESCRIPCION, { schema: ESQUEMA_DESCRIPCION, adjuntos: [{ mimeType: "image/webp", datos: buffer.toString("base64") }] });
  if (!r?.ok) return null;
  let descripcion = "";
  try {
    descripcion = limpiarDescripcion(JSON.parse(r.texto).descripcion);
  } catch {}
  if (!descripcion) return null;
  db.prepare(`UPDATE stickers_descripcion SET descripcion = ? WHERE sha = ?`).run(descripcion, sha);
  return descripcion;
}

// Looks at the ones still pending, one after the other and never two runs at once, within the day's cap. Fired when a
// new sticker arrives; it returns at once and works in the background. Stops at the first failure: with no quota, the
// rest would fail too.
let describiendo = null;
export function describirPendientes(ahora = Date.now()) {
  if (describiendo || !globalThis.geminiApiKey) return describiendo;
  describiendo = (async () => {
    try {
      const hechasHoy = db.prepare(`SELECT COUNT(*) AS n FROM stickers_descripcion WHERE ultimo_intento >= ?`).get(inicioDelDia(ahora)).n;
      for (const sha of pendientes(ahora, Math.max(0, STICKERS.DESCRIPCIONES_DIA - hechasHoy))) {
        if (!(await describirSticker(sha, Date.now()))) break;
        await _dep.esperar(5000);
      }
    } catch (e) {
      console.error("[stickers] no se pudo describir:", e?.message || e);
    } finally {
      describiendo = null;
    }
  })();
  return describiendo;
}

// The group's described stickers the AI can choose from: [{ sha, descripcion }], the most sent first, without the
// latest she sent nor the ones in excluir.
export function menuDeStickers(chat, { excluir = [], max = STICKERS.MENU_MAX } = {}) {
  const fuera = new Set(excluir);
  const filas = db
    .prepare(`SELECT g.sha, g.usado, d.descripcion FROM stickers_grupo g JOIN stickers_descripcion d ON d.sha = g.sha WHERE g.chat = ? AND g.sacado = 0 AND d.descripcion IS NOT NULL ORDER BY g.veces DESC, g.ultimo DESC`)
    .all(chat)
    .filter((f) => !fuera.has(f.sha));
  const recientes = new Set(
    filas
      .filter((f) => f.usado)
      .sort((a, b) => b.usado - a.usado)
      .slice(0, STICKERS.NO_REPETIR)
      .map((f) => f.sha),
  );
  const frescas = filas.filter((f) => !recientes.has(f.sha));
  return (frescas.length >= 2 ? frescas : filas).slice(0, max).map(({ sha, descripcion }) => ({ sha, descripcion }));
}

export const lineasDelMenu = (menu) => menu.map((f, i) => `${i + 1}. ${f.descripcion}`).join("\n");

// Answered with a sticker: the AI sees her message, the sticker she got and the menu, and picks one or none.
// { sha } (null: none fits), or undefined when it couldn't choose (no menu, no AI): then it's up to chance.
export async function elegirRespuesta(chat, { suTexto = "", recibido = null, excluir = [] } = {}) {
  const menu = menuDeStickers(chat, { excluir });
  if (menu.length < 2) return undefined;
  const partes = [
    "Sos Claudia, una más del grupo de WhatsApp. Alguien te contestó con el sticker de la imagen.",
    suTexto ? `Lo que vos habías dicho: "${String(suTexto).slice(0, 300)}"` : "Te contestó a un mensaje tuyo.",
    `Elegí de esta lista el sticker con el que contestarías, el que mejor le responda (por el tono y lo que dice), o 0 si ninguno pega:\n${lineasDelMenu(menu)}`,
  ];
  const adjuntos = recibido ? [{ mimeType: "image/webp", datos: recibido.toString("base64") }] : [];
  const r = await _dep.preguntar(partes.join("\n\n"), { schema: { type: "object", properties: { numero: { type: "integer" } }, required: ["numero"] }, adjuntos });
  if (!r?.ok) return undefined;
  let n;
  try {
    n = Number(JSON.parse(r.texto).numero);
  } catch {
    return undefined;
  }
  if (n === 0) return { sha: null };
  return menu[n - 1] ? { sha: menu[n - 1].sha } : undefined;
}

// .stickerazar <words>: one whose description has any of them (accents and case aside), at random among those.
export function buscarSticker(chat, texto) {
  const palabras = normalizar(texto)
    .split(/\s+/)
    .filter((p) => p.length >= 3);
  if (!palabras.length) return null;
  const filas = db.prepare(`SELECT g.sha, d.descripcion FROM stickers_grupo g JOIN stickers_descripcion d ON d.sha = g.sha WHERE g.chat = ? AND g.sacado = 0 AND d.descripcion IS NOT NULL`).all(chat);
  const coinciden = filas.filter((f) => {
    const d = normalizar(f.descripcion);
    return palabras.some((p) => d.includes(p));
  });
  if (!coinciden.length) return null;
  return coinciden[Math.floor(_dep.random() * coinciden.length)].sha;
}

// Sends that one, quoting a message if given. Same return as mandarStickerAlAzar.
export async function mandarSticker(client, chat, sha, quoted = null, ahora = Date.now()) {
  let buffer;
  try {
    buffer = fs.readFileSync(archivoDe(sha));
  } catch {
    return null;
  }
  const enviado = await client.sendMessage(chat, { sticker: buffer }, quoted ? { quoted } : {});
  if (!enviado) return null;
  db.prepare(`UPDATE stickers_grupo SET usado = ? WHERE chat = ? AND sha = ?`).run(ahora, chat, sha);
  return enviado;
}
