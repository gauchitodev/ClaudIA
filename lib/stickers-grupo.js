// The stickers each group sends, and Claudia sending one back at random: with .stickerazar, when someone answers one
// of her messages with a sticker (plugins/_stickers-grupo.js), and on her own in a glance (lib/vistazos.js). Every
// sticker people send in a group is kept for that group: the file once in database/stickers/<sha>.webp, the row in
// stickers_grupo (database-schema.js). A group keeps at most STICKERS.MAX_POR_GRUPO; past that, the ones sent the
// fewest times and longest ago go. An admin takes one out with .sacarsticker, and it isn't kept again.
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { db } from "../database-functions.js";

// Mutable, like INICIATIVA, so the tests can move them.
export const STICKERS = {
  MAX_POR_GRUPO: 200,
  MAX_BYTES: 1024 * 1024, // WhatsApp's own cap for an animated sticker is 1 MB; anything bigger isn't a sticker
  MIN_PARA_MANDAR: 3, // with fewer than this she doesn't pick one on her own: it would always be the same
  NO_REPETIR: 10, // the latest ones she sent in the group are left out of the draw, while there are others
  RESPUESTA_PROBABILIDAD: 0.6, // answered with a sticker, she answers with one this often
  RESPUESTA_PAUSA_MS: 2 * 60 * 1000, // and not again in the same group for this long
};

// Randomness and the folder, swappable by the tests.
export const _dep = { random: Math.random, carpeta: () => path.join("database", "stickers") };

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
