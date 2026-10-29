import { existsSync, mkdirSync } from "fs";
import Database from "better-sqlite3";
import { ponerAlDia } from "./database-schema.js";

// The connection every function here uses, loadDatabase's. It used to be a global main.js set (globalThis.db), and this
// module only worked once someone had set it; what else needs the connection imports it from here.
export let db = null;

// loadDatabase's connection becomes everyone's only once it opened all right: one that failed halfway leaves the one
// there was. Out here because inside loadDatabase, "db" is its own.
function usarBase(nueva) {
  db = nueva;
  return nueva;
}

// Load the SQLite database
export function loadDatabase() {
  // Create the "databases" folder if it isn't there.
  if (!existsSync("./database")) mkdirSync("./database");

  // Open the db (better-sqlite3 is synchronous)
  const db = new Database("./database/database.db");
  console.log("🟢 Base de datos SQLite (better-sqlite3) conectada");
  // The tables, and the migrations an older file needs (database-schema.js).
  ponerAlDia(db);

  const { deDispositivos, repetidos } = soloUnaFilaPorNumero(db);
  if (deDispositivos || repetidos) console.log(`🟢 Migración: cada número quedó en una sola fila (${repetidos} repetida(s), ${deDispositivos} de dispositivos)`);
  const { juntadas, pasadas } = juntarFilasDeDispositivo(db);
  if (juntadas || pasadas) console.log(`🟢 Migración: las filas de dispositivo pasaron a la de su LID (${juntadas} juntada(s), ${pasadas} que pasaron a serlo)`);

  return usarBase(db);
}

// A number is one person's at a time (syncUserInfo takes it off any other row), but rows from before that may still
// share one, and getUser by number reads the one FILA_DEL_NUMERO puts first anyway. With two, what was kept under the
// number (a blacklist entry, a role) stayed with it only while both had it: once one left, the other was the only one,
// and took it all when its turn came (seguirALaPersona). A row with a device's LID ("…:12@lid", left by the group
// notices of before lib/wa-socket.js took the device out) is nobody's, and kept a number too: once the person's own row
// left it, that one was the number's row. The number stays only on the row reads by number go to. loadDatabase runs
// this on every start, on the database it opens; past the first one there's nothing to change.
export function soloUnaFilaPorNumero(base) {
  const deDispositivos = base.prepare(`UPDATE users SET jid = '' WHERE lid LIKE '%:%@lid' AND jid <> ''`).run().changes;
  const repetidos = base.prepare(`UPDATE users SET jid = '' WHERE lid LIKE '%@lid' AND jid LIKE '%@s.whatsapp.net' AND lid <> ${LID_DE_SU_NUMERO}`).run().changes;
  return { deDispositivos, repetidos };
}

// Two rows of one person into one: into `en` goes what only `de` had, and of a group both have, the higher warning, the
// silence if either, the messages added up and the earliest seniority (desde). The ban if either had it; the name, the
// nickname and the memory of `de` only where `en` has none. Then `de` goes. On the connection it's handed.
function juntarFilas(base, en, de) {
  const [a, b] = [en, de].map((lid) => base.prepare(`SELECT * FROM users WHERE lid = ?`).get(lid));
  if (!a || !b) return false;
  const [gruposA, gruposB] = [a, b].map((f) => conDatosLeidos({ ...f }).inGroup);
  for (const [chat, suyo] of Object.entries(gruposB)) {
    const mio = gruposA[chat];
    if (!mio) {
      gruposA[chat] = suyo;
      continue;
    }
    const junto = { ...suyo, ...mio };
    if ("messageCount" in mio || "messageCount" in suyo) junto.messageCount = (mio.messageCount || 0) + (suyo.messageCount || 0);
    const desdes = [mio.desde, suyo.desde].filter((d) => typeof d === "number");
    if (desdes.length) junto.desde = Math.min(...desdes);
    if ("warn" in mio || "warn" in suyo) junto.warn = Math.max(mio.warn || 0, suyo.warn || 0);
    if (mio.mute || suyo.mute) junto.mute = true;
    gruposA[chat] = junto;
  }
  base.transaction(() => {
    base
      .prepare(`UPDATE users SET inGroup = ?, banned = ?, pushName = ?, apodo = ?, memoria = ?, timestamp = ? WHERE lid = ?`)
      .run(JSON.stringify(gruposA), a.banned || b.banned ? 1 : 0, a.pushName || b.pushName, a.apodo || b.apodo, a.memoria || b.memoria, Math.max(a.timestamp || 0, b.timestamp || 0) || null, en);
    base.prepare(`DELETE FROM users WHERE lid = ?`).run(de);
  })();
  return true;
}

// The rows with a device's LID ("…:12@lid"), from group notices of before lib/wa-socket.js took the device out, are
// their person's: each one goes into the row of its LID without the device, or becomes it when there's none. Counted
// and listed, they were someone else: .estado counted the person twice, and .conteo showed them twice. loadDatabase
// runs this on every start, on the database it opens, after soloUnaFilaPorNumero has taken their numbers off.
export function juntarFilasDeDispositivo(base) {
  let [juntadas, pasadas] = [0, 0];
  for (const { lid } of base.prepare(`SELECT lid FROM users WHERE lid LIKE '%:%@lid' ORDER BY rowid`).all()) {
    if (!/:\d+@lid$/.test(lid)) continue; // a colon but no device after it: whose it is, no telling
    const suya = lid.replace(/:\d+@lid$/, "@lid");
    if (base.prepare(`SELECT 1 FROM users WHERE lid = ?`).get(suya)) {
      if (juntarFilas(base, suya, lid)) juntadas++;
    } else {
      base.prepare(`UPDATE users SET lid = ? WHERE lid = ?`).run(suya, lid);
      pasadas++;
    }
  }
  return { juntadas, pasadas };
}

// Called on every message
export function initDataDB(m) {
  const chatJid = m.chat;
  const botJid = client?.user?.lid;
  const pushName = m?.pushName || "";

  // Make sure the user's default data exists. A message that came with only the number, from someone the database
  // already knows by it, adds no row keyed by the number: getUser and updateUser by number go to the one there is. A
  // group notice may come without anyone (handle-message lets it through): it has the chat's and the bot's, not a row
  // "".
  if (m.sender && (m.sender.endsWith("@lid") || !lidDeNumero(m.sender))) db.prepare(`INSERT OR IGNORE INTO users (lid, jid, pushName) VALUES (?, ?, ?)`).run(m.sender, m.senderJid, pushName);

  // Make sure the chat's default data exists
  db.prepare(`INSERT OR IGNORE INTO chats (remoteJid) VALUES (?)`).run(chatJid);

  // Make sure the bot's default settings exist
  db.prepare(`INSERT OR IGNORE INTO settings (botJid) VALUES (?)`).run(botJid);
}

// Of the rows with a number, the one it stands for: the one with a LID, and of those the one updated last (syncUserInfo
// stamps each message). A number may also have an old row keyed by itself, from before WhatsApp used LIDs or a message
// that came without the LID; a recycled number has two people's LIDs, and the last one to write is the one using it.
const FILA_DEL_NUMERO = `ORDER BY lid LIKE '%@lid' DESC, timestamp DESC`;
// In a query over users, the LID of the row the current row's number stands for.
const LID_DE_SU_NUMERO = `(SELECT v.lid FROM users v WHERE v.jid = users.jid ${FILA_DEL_NUMERO} LIMIT 1)`;
// Where the row of an id is, for a query with the id as its parameter: by LID, that row; by number, the one the number
// stands for.
const dondeLaFilaDe = (id) => (id.endsWith("@lid") ? "lid = ?" : `jid = ? ${FILA_DEL_NUMERO}`);
// What looks like one of these and isn't, left as it is: getAllUsers keeps every row with a LID (two people with one
// number are two people to list), and syncUserInfo takes the number off every other LID row, not off all but the one
// FILA_DEL_NUMERO puts first. Nor are the three ways a device's row is told apart one and the same: lid LIKE '%:%@lid'
// (any colon before the end), lid NOT LIKE '%:%' (no colon anywhere) and /:\d+@lid$/ (a colon and digits at the end).

// A users row as the rest of the bot reads it: inGroup and couplesHistory parsed, or empty if they aren't valid JSON.
function conDatosLeidos(row) {
  try {
    row.inGroup = JSON.parse(row.inGroup || "{}");
  } catch {
    row.inGroup = {};
  }
  try {
    row.couplesHistory = JSON.parse(row.couplesHistory || "[]");
  } catch {
    row.couplesHistory = [];
  }
  return row;
}

// Get a user's data: by LID, that row; by number, the one the number stands for (FILA_DEL_NUMERO), which is also the
// one updateUser writes to. getUser by number used to find the old row keyed by the number, and updateUser wrote to
// every row with it: a message that came with only the number copied the old row over the one with the LID, and the
// person lost their warnings, their silence and their .afk in every group.
export function getUser(userId, chatJid = null) {
  // Nobody is "": rows without a number have that jid, and by number "" was one of them (a message from Meta AI, which
  // writes as …@bot, was counted as theirs).
  if (!userId) return null;
  const fila = db.prepare(`SELECT * FROM users WHERE ${dondeLaFilaDe(userId)}`).get(userId);
  if (!fila) return null;
  const row = conDatosLeidos(fila);

  // Initialize inGroup[m.chat] if needed
  if (chatJid) {
    if (!row.inGroup[chatJid]) {
      row.inGroup[chatJid] = {
        afk: -1,
        afkReason: "",
        mute: false,
        messageCount: 0,
        desde: Date.now(), // first time the bot saw this person in this group (seniority, for the ranks)
      };

      updateRow("users", "lid", row.lid, { inGroup: JSON.stringify(row.inGroup) });
    }
  }

  return row;
}

// The LID of whoever uses a number now, the row the number stands for (FILA_DEL_NUMERO): getUser by number used to
// find the old row keyed by the number first, so a mention by number came out as the number, a role given by LID
// wasn't seen, and in a group listed by number whoever wrote under their LID looked silent to .inactivos. Without a LID
// row, the old one's id (the number itself), or null.
export function lidDeNumero(jid) {
  if (!jid) return null;
  return db.prepare(`SELECT lid FROM users WHERE jid = ? ${FILA_DEL_NUMERO}`).get(jid)?.lid || null;
}

// Just what .inactivos needs of someone in a group, { afk, messageCount }, or null without a row: read by SQLite out of
// inGroup, since getUser parses all of it in JS, every group the person is in, and in a full group that was most of the
// time. A row whose inGroup isn't valid JSON counts as having nothing there, as getUser takes it. By number, the row
// getUser would read.
export function enGrupoDe(id, chat) {
  const sql = `SELECT CASE WHEN json_valid(inGroup) THEN json_extract(inGroup, ?) END AS afk, CASE WHEN json_valid(inGroup) THEN json_extract(inGroup, ?) END AS mensajes FROM users WHERE ${dondeLaFilaDe(id)}`;
  const fila = db.prepare(sql).get(`$."${chat}".afk`, `$."${chat}".messageCount`, id);
  return fila ? { afk: fila.afk ?? -1, messageCount: fila.mensajes || 0 } : null;
}

// The number the database knows for a LID, or null. Just that column, for what runs on every message: getUser parses
// the whole of inGroup, every group the person is in.
export function jidDeLid(lid) {
  if (!lid) return null;
  return db.prepare(`SELECT jid FROM users WHERE lid = ?`).get(lid)?.jid || null;
}

// Just the names someone has, { apodo, pushName }, or null without a row: what naming them takes (lib/menciones.js),
// once for each "@" of a text, which getUser made a read of all of their data, every group they're in. By number, the
// row getUser would read.
export function nombresGuardados(id) {
  if (!id) return null;
  return db.prepare(`SELECT apodo, pushName FROM users WHERE ${dondeLaFilaDe(id)}`).get(id) || null;
}

// Get a chat's data
export function getChat(jid) {
  return db.prepare(`SELECT * FROM chats WHERE remoteJid = ?`).get(jid) || null;
}

// Get the bot's settings
export function getBotSettings(botJid) {
  return db.prepare(`SELECT * FROM settings WHERE botJid = ?`).get(botJid) || null;
}

// Update pushName, jid and timestamp on the user's row. The number a message brings along with the LID is the one that
// person uses now: it goes on their row, and off any other LID's, since a number is one person's at a time. It used to
// be filled in once and kept: whoever changed numbers stayed under the old one, and whoever had a recycled number
// before kept it, so "the row of the number" (FILA_DEL_NUMERO) could be theirs. Whoever had the owner's number was the
// owner.
export function syncUserInfo(m) {
  const lid = m.sender;
  const newJid = m.senderJid;
  const newPush = m.pushName || (m.fromMe ? client.user.name : null);
  const timestamp = Date.now();

  // A LID with a device ("…:12@lid") is nobody's row: with the number on it, it took it away from the real one.
  // lib/wa-socket.js takes the device out of m.sender; this is for whatever else brings one.
  if (!lid || /:\d+@lid$/.test(lid)) return;

  const user = getUser(lid);
  const numero = newJid?.endsWith?.("@s.whatsapp.net") ? newJid : null;

  let finalJid = user?.jid;
  const isRegularJid = finalJid?.endsWith?.("@s.whatsapp.net");

  if (!finalJid || !isRegularJid) finalJid = newJid;
  if (numero && lid.endsWith("@lid")) {
    finalJid = numero;
    // New for the row, or for a row initDataDB has just made: it puts the number on it, and only this stamps it.
    const nuevo = user?.jid !== numero || user?.timestamp == null;
    db.transaction(() => {
      if (nuevo) seguirALaPersona(lid, user?.jid, numero);
      db.prepare(`UPDATE users SET jid = '' WHERE jid = ? AND lid <> ? AND lid LIKE '%@lid'`).run(numero, lid);
    })();
  }

  const datos = { jid: finalJid, timestamp };
  // Group notices and some message types come without a pushName: don't overwrite the stored name with null.
  if (newPush) datos.pushName = newPush;
  updateUser(lid, datos);
}

// A LID comes with a number its row didn't have: the person changed numbers, or the number was someone else's. What was
// kept under a number with no LID known, a blacklist entry or a bot role given by number, goes to the LID the number
// was on: it used to stay with the number, and whoever changed numbers was no longer kept out by the blacklist nor
// protected by their role, while whoever got the number next got both. So does what .inactivos noted under it, as a
// join and a warning go under every id the person comes with: left there, it was the next owner's, and in that group
// their first message was a "Volvió", with the prize, for someone else's warning; silent, they were warned already,
// nobody tagged them, and .k inactivos could remove them. Only when a single LID row had the number: with two, there's
// no telling whose it was, and it stays as it was. A row with a device's LID, from before syncUserInfo left them out,
// isn't anybody's.
// The old row keyed by the number this row leaves, from before LIDs, goes when no other LID row has that number: while
// one had it, the number stood for that one, and the old row was read by nobody. With the number left to it, getUser
// read it again for whatever came with only that number, its ban and its silence of back then included, and the
// listings showed it again (.listaadv, .listabaneados, .conteo).
function seguirALaPersona(lid, antes, numero) {
  const filasCon = (n) => db.prepare(`SELECT lid FROM users WHERE jid = ? AND lid LIKE '%@lid' AND lid NOT LIKE '%:%'`).all(n).map((f) => f.lid);
  if (antes !== numero && antes?.endsWith?.("@s.whatsapp.net") && filasCon(antes).length === 1) {
    atarAlLid(antes, lid); // the only row with it is this one
    db.prepare(`DELETE FROM users WHERE lid = ?`).run(antes);
  }
  const otros = filasCon(numero).filter((l) => l !== lid);
  if (otros.length === 1) atarAlLid(numero, otros[0]);
}

// Under the LID, in the entry's key too: the number is someone else's now, or nobody's, and with the entry still under
// it, listing whoever has it now overwrote the entry (one per group and key). So does an entry of the person's own LID
// kept under the number, as ".ln @persona" keeps it: only the ones with no LID moved, and listing the number's next
// owner took the person off the list without a word. One the person already had under the LID in that group stays,
// and the one by number goes. Of two roles in one group, the higher one stays. Of what .inactivos noted in a group
// under both, the latest of each, as it takes a person's latest under any of their ids (lib/inactivos.js): what it
// reads of whoever had the number doesn't change.
function atarAlLid(numero, lid) {
  db.prepare(`UPDATE OR IGNORE lista_negra SET jid = ?, lid = ? WHERE jid = ? AND (lid IS NULL OR lid IN ('', ?))`).run(lid, lid, numero, lid);
  db.prepare(`DELETE FROM lista_negra WHERE jid = ? AND (lid IS NULL OR lid IN ('', ?))`).run(numero, lid);
  db.prepare(
    `INSERT INTO roles_grupo (chat, usuario, rol, dadoPor, fecha) SELECT chat, ?, rol, dadoPor, fecha FROM roles_grupo WHERE usuario = ?
     ON CONFLICT(chat, usuario) DO UPDATE SET rol = excluded.rol, dadoPor = excluded.dadoPor, fecha = excluded.fecha WHERE excluded.rol = 'admin'`,
  ).run(lid, numero);
  db.prepare(`DELETE FROM roles_grupo WHERE usuario = ?`).run(numero);
  const elUltimo = (c) => `MAX(COALESCE(${c}, excluded.${c}), COALESCE(excluded.${c}, ${c}))`; // MAX of a NULL is NULL
  db.prepare(
    `INSERT INTO presencia_grupo (chat, usuario, ingreso, ultimo_mensaje, avisado) SELECT chat, ?, ingreso, ultimo_mensaje, avisado FROM presencia_grupo WHERE usuario = ?
     ON CONFLICT(chat, usuario) DO UPDATE SET ingreso = ${elUltimo("ingreso")}, ultimo_mensaje = ${elUltimo("ultimo_mensaje")}, avisado = ${elUltimo("avisado")}`,
  ).run(lid, numero);
  db.prepare(`DELETE FROM presencia_grupo WHERE usuario = ?`).run(numero);
}

// update data in the db
function updateRow(table, primaryKey, primaryValue, data) {
  if (!data || Object.keys(data).length === 0) return true;

  const keys = Object.keys(data);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = Object.values(data);

  // normalize booleans for better-sqlite3: turn true/false into 1/0
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === "boolean") {
      values[i] = v ? 1 : 0;
    }
  }

  const sql = `UPDATE ${table} SET ${setClause} WHERE ${primaryKey} = ?`;

  // Reports whether it actually touched a row: it used to return true always, so an UPDATE that matched nobody
  // passed as good (that's how warnings got "saved" without ever being saved).
  return db.prepare(sql).run(...values, primaryValue).changes > 0;
}

// update a user's data
// Takes a LID or a number, like getUser, and writes to the row getUser reads: by number, the one the number stands for
// (FILA_DEL_NUMERO), and only that one. It used to write to every row with the number, the old one keyed by it too.
export function updateUser(userId, data) {
  const id = String(userId);
  const lid = id.endsWith("@lid") ? id : lidDeNumero(id);
  return lid ? updateRow("users", "lid", lid, data) : false;
}

// A person's data inside one particular group (users.inGroup), merged with whatever they already had.
// It's the way to write inGroup: it reads the row as it is now and touches only the given fields, in that same row.
// Writing back the whole "user" handle-message read when the message arrived undid whatever changed meanwhile (a
// .silenciar or an .adv given while that message was still being handled).
export function updateUserInGroup(userId, chat, data) {
  const row = getUser(userId);
  if (!row) return false;
  const inGroup = { ...row.inGroup, [chat]: { ...(row.inGroup[chat] || {}), ...data } };
  return updateRow("users", "lid", row.lid, { inGroup: JSON.stringify(inGroup) });
}

// The rows that hold `clave` in the data of some group (inGroup), oldest first, as stored: a flag few people set, read
// in one query instead of one getUser per member of a big group (lib/menciones-generales.js, for .notagall).
// delNumero says whether the row is the one its number stands for (FILA_DEL_NUMERO), the one getUser and updateUser go
// to by number; for a row with no number, nothing is looked up: every LID that came without one has jid '', and sorting
// all of them for each row made a .tagall take seconds.
export function filasConDatoDeGrupo(clave) {
  return db.prepare(`SELECT lid, jid, inGroup, CASE WHEN jid <> '' THEN lid = ${LID_DE_SU_NUMERO} END AS delNumero FROM users WHERE inGroup LIKE ? ORDER BY rowid`).all(`%"${clave}"%`);
}

// One more message from a person in a group (inGroup[chat].messageCount), counted over the row as it is now: two
// messages from the same person handled at once each used to add one to the same old count. Returns the new total, or
// null if the person has no row.
export function sumarMensajeEnGrupo(userId, chat) {
  const row = getUser(userId);
  if (!row) return null;
  const previo = row.inGroup[chat]?.messageCount;
  const total = (typeof previo === "number" ? previo : 0) + 1;
  updateUserInGroup(userId, chat, { messageCount: total });
  return total;
}

// ===================== Warnings (.adv / .warn), per group =====================
// They live in inGroup[chat].warn. They used to be a single count across every group, in the users.warn column.
export const MAX_ADVERTENCIAS = 3; // on the third one they're kicked from the group
export function advertenciasDe(userId, chat) {
  return getUser(userId)?.inGroup?.[chat]?.warn || 0;
}

export function setAdvertencias(userId, chat, cantidad) {
  return updateUserInGroup(userId, chat, { warn: Math.max(0, cantidad) });
}

// Who has warnings: those of one group, or of every group when none is given.
export function advertidos(chat = null) {
  const lista = [];
  for (const u of getAllUsers()) {
    for (const [grupo, datos] of Object.entries(u.inGroup || {})) {
      if (chat && grupo !== chat) continue;
      if (datos?.warn > 0) lista.push({ lid: u.lid, chat: grupo, warn: datos.warn });
    }
  }
  return lista.sort((a, b) => b.warn - a.warn);
}

// update a chat's data
export function updateChat(remoteJid, data) {
  return updateRow("chats", "remoteJid", remoteJid, data);
}

// update the bot's settings
export function updateSettings(botJid, data) {
  return updateRow("settings", "botJid", botJid, data);
}

// add a person to a group's blacklist ("*" = every group). If they were already on it, the reason is updated, and the
// LID only if it is known now: a null lid does not overwrite the stored one. An entry under the same key with another
// LID than the person's (quien) is someone else's, whose number this was: it goes under their LID first, since written
// over, they came off the list without anybody saying so. quien is the LID that tells whose an entry is, which may be
// one the database knows for the number and the entry doesn't keep (plugins/grupo-lista-negra.js).
export function addToBlacklist(jid, reason, addedBy, chat = "*", lid = null, quien = lid) {
  db.transaction(() => {
    if (quien) {
      db.prepare(`UPDATE OR IGNORE lista_negra SET jid = lid WHERE chat = ? AND jid = ? AND lid NOT IN ('', ?)`).run(chat, jid, quien);
      db.prepare(`DELETE FROM lista_negra WHERE chat = ? AND jid = ? AND lid NOT IN ('', ?)`).run(chat, jid, quien); // already under it
    }
    db.prepare(
      `INSERT INTO lista_negra (chat, jid, lid, reason, dateAdded, addedBy) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat, jid) DO UPDATE SET reason = excluded.reason, lid = COALESCE(excluded.lid, lista_negra.lid)`,
    ).run(chat, jid, lid || null, reason, Date.now(), addedBy);
  })();
}

// store the LID of someone already on the list, once it turns up later (when they join, when they write).
// That way they're recognized right away next time.
export function recordarLidEnListaNegra(chat, jid, lid) {
  if (!chat || !jid || !lid) return false;
  return db.prepare(`UPDATE lista_negra SET lid = ? WHERE chat = ? AND jid = ? AND (lid IS NULL OR lid = '')`).run(lid, chat, jid).changes > 0;
}

// remove from a group's blacklist; true if they were on it. Takes a number or a LID.
export function removeFromBlacklist(id, chat = "*") {
  if (!id) return false;
  return db.prepare(`DELETE FROM lista_negra WHERE chat = ? AND (jid = ? OR lid = ?)`).run(chat, id, id).changes > 0;
}

// are they on that group's blacklist, or on the all-groups one? Returns the entry (the group's before the global
// one) or null. Takes one identifier or several (a person's number and LID), and checks both columns.
// By number only for an entry with no LID of its own, or for someone who brings none: with the two LIDs at hand and
// different, it's someone else with that number, a recycled one or one the listed person left, who used to be removed.
export function isBlacklisted(id, chat = "*") {
  const ids = (Array.isArray(id) ? id : [id]).filter(Boolean);
  if (ids.length === 0) return null;
  const marcadores = ids.map(() => "?").join(", ");
  const porNumero = ids.some((v) => v.endsWith("@lid")) ? `(jid IN (${marcadores}) AND (lid IS NULL OR lid = ''))` : `jid IN (${marcadores})`;
  return (
    db
      .prepare(`SELECT * FROM lista_negra WHERE (${porNumero} OR lid IN (${marcadores})) AND chat IN (?, '*') ORDER BY CASE WHEN chat = '*' THEN 1 ELSE 0 END LIMIT 1`)
      .get(...ids, ...ids, chat) || null
  );
}

// a group's entries plus the global ones; with no chat, every entry of every group
export function getBlacklist(chat = null) {
  if (!chat) return db.prepare(`SELECT * FROM lista_negra ORDER BY dateAdded ASC`).all();
  return db.prepare(`SELECT * FROM lista_negra WHERE chat IN (?, '*') ORDER BY dateAdded ASC`).all(chat);
}

// The rows the listings show: every one with a LID, and an old one keyed by the number only while no row with a LID has
// its number, since nothing reads it or writes it any more (FILA_DEL_NUMERO).
const LISTADOS = `lid LIKE '%@lid' OR jid = '' OR NOT EXISTS (SELECT 1 FROM users v WHERE v.jid = users.jid AND v.lid LIKE '%@lid')`;

// How many people the bot knows (.estado, .menu): as many as the listings show. It counted every row in the table, the
// old ones keyed by a number nobody reads any more too.
export function getTotalUsers() {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM users WHERE ${LISTADOS}`).get();
  return row?.total || 0;
}

// every user in the users table, once: an old row keyed by the number (from before WhatsApp used LIDs, or from a
// message that came without the LID) is left out when its number has a row with a LID, since nothing reads it or writes
// it any more (FILA_DEL_NUMERO). Listed, it showed warnings no one could take off, a ban that no longer applied, and
// the same person twice in .conteo.
export function getAllUsers() {
  const rows = db.prepare(`SELECT * FROM users WHERE ${LISTADOS}`).all();

  return rows.map(conDatosLeidos);
}

// Delete someone's row (.rd), and with it the old one keyed by their number, from before LIDs, when no other LID row
// has that number: left behind, it was the number's row again, and whatever came with only the number read its
// warnings, its silence and its ban of back then, and the listings showed it. With another LID on the number, the old
// row may be theirs, and it stays.
export function deleteUser(lid) {
  const numero = jidDeLid(lid);
  return db.transaction(() => {
    const borrada = db.prepare(`DELETE FROM users WHERE lid = ?`).run(lid);
    if (numero?.endsWith("@s.whatsapp.net") && !db.prepare(`SELECT 1 FROM users WHERE jid = ? AND lid LIKE '%@lid'`).get(numero)) db.prepare(`DELETE FROM users WHERE lid = ?`).run(numero);
    return borrada;
  })();
}

// add a blocked command to a chat's blacklist
export function addToChatBlacklist(remoteJid, command) {
  db.prepare(`INSERT OR IGNORE INTO chat_blacklist (remoteJid, command) VALUES (?, ?)`).run(remoteJid, command);
}

// remove a blocked command from a chat's blacklist
export function removeFromChatBlacklist(remoteJid, command) {
  db.prepare(`DELETE FROM chat_blacklist WHERE remoteJid = ? AND command = ?`).run(remoteJid, command);
}

// add several commands at once to a chat's blacklist
export function addManyToChatBlacklist(remoteJid, commands) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO chat_blacklist (remoteJid, command) VALUES (?, ?)`);
  const insertMany = db.transaction((cmds) => {
    for (const cmd of cmds) stmt.run(remoteJid, cmd);
  });
  insertMany(commands);
}

// remove several commands at once from a chat's blacklist
export function removeManyFromChatBlacklist(remoteJid, commands) {
  const stmt = db.prepare(`DELETE FROM chat_blacklist WHERE remoteJid = ? AND command = ?`);
  const deleteMany = db.transaction((cmds) => {
    for (const cmd of cmds) stmt.run(remoteJid, cmd);
  });
  deleteMany(commands);
}

// every blocked command of a chat
export function getChatBlacklist(remoteJid) {
  return db
    .prepare(`SELECT command FROM chat_blacklist WHERE remoteJid = ?`)
    .all(remoteJid)
    .map((row) => row.command);
}

// is a command blocked in this chat? (blacklist mode)
export function isCommandBlacklisted(remoteJid, command) {
  return !!db.prepare(`SELECT 1 FROM chat_blacklist WHERE remoteJid = ? AND command = ?`).get(remoteJid, command);
}

// record a hashtag entry (a random story, say). Returns the number it got within that week
// (so we can say "Story #4 recorded").
export function agregarEntradaHashtag({ chat, hashtag, usuario, contenido, messageId, semana }) {
  const fecha = Date.now();
  db.prepare(
    `INSERT INTO hashtag_entries (chat, hashtag, usuario, contenido, messageId, semana, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(chat, hashtag, usuario, contenido || "", messageId || null, semana, fecha);

  const row = db.prepare(`SELECT COUNT(*) AS total FROM hashtag_entries WHERE chat = ? AND hashtag = ? AND semana = ?`).get(chat, hashtag, semana);
  return row?.total || 1;
}

// every entry of a hashtag in a chat, for one particular week, in arrival order.
export function obtenerEntradasHashtag(chat, hashtag, semana) {
  return db
    .prepare(`SELECT * FROM hashtag_entries WHERE chat = ? AND hashtag = ? AND semana = ? ORDER BY id ASC`)
    .all(chat, hashtag, semana);
}

// add a monthly interaction (a reaction), either "received" (the author of the message reacted to)
// or "given" (whoever reacted). Creates the user's row for that month/chat if it isn't there yet.
export function sumarInteraccion(mes, chat, usuario, tipo) {
  if (tipo !== "recibidas" && tipo !== "emitidas") return;
  db.prepare(`INSERT OR IGNORE INTO interacciones_mensuales (mes, chat, usuario) VALUES (?, ?, ?)`).run(mes, chat, usuario);
  db.prepare(`UPDATE interacciones_mensuales SET ${tipo} = ${tipo} + 1 WHERE mes = ? AND chat = ? AND usuario = ?`).run(mes, chat, usuario);
}

// Claudia's own ids, to leave her out of the rankings, the tops and the totals. Reactions to her messages paid her
// UruCoins and "received" points until lib/reacciones.js stopped it, and what she gathered is still in the tables.
function sinClaudia() {
  const ids = [globalThis.client?.user?.lid, globalThis.client?.user?.jid].filter(Boolean);
  return { sql: ids.length ? ` AND usuario NOT IN (${ids.map(() => "?").join(", ")})` : "", ids };
}

// a person's place in the month's ranking by reactions received (1 = most voted); null if they have none
export function puestoRankingMensual(mes, chat, usuario) {
  const fila = db.prepare(`SELECT recibidas, emitidas FROM interacciones_mensuales WHERE mes = ? AND chat = ? AND usuario = ?`).get(mes, chat, usuario);
  if (!fila || (fila.recibidas <= 0 && fila.emitidas <= 0)) return null;
  const sin = sinClaudia();
  const puesto = db.prepare(`SELECT COUNT(*) + 1 AS puesto FROM interacciones_mensuales WHERE mes = ? AND chat = ? AND recibidas > ?${sin.sql}`).get(mes, chat, fila.recibidas, ...sin.ids).puesto;
  return { ...fila, puesto };
}

// the top 5 "most voted" (received) and "most active" (given) of a chat, for a given month.
export function obtenerRankingMensual(chat, mes) {
  const sin = sinClaudia();
  const masVotado = db.prepare(`SELECT usuario, recibidas FROM interacciones_mensuales WHERE chat = ? AND mes = ? AND recibidas > 0${sin.sql} ORDER BY recibidas DESC LIMIT 5`).all(chat, mes, ...sin.ids);
  const masActivo = db.prepare(`SELECT usuario, emitidas FROM interacciones_mensuales WHERE chat = ? AND mes = ? AND emitidas > 0${sin.sql} ORDER BY emitidas DESC LIMIT 5`).all(chat, mes, ...sin.ids);
  return { masVotado, masActivo };
}

// The owners' numbers as ids, from config.toml as it writes them: with "+" and spaces, they're just the digits.
export const numerosDeOwners = () => (globalThis.owners || []).map((n) => String(n).replace(/[^0-9]/g, "")).filter(Boolean).map((d) => `${d}@s.whatsapp.net`);

// Does this identifier (lid or jid) belong to a bot owner? Owners are configured by phone number, but in groups
// participants arrive as @lid, so the owner's lid is resolved through the users table. For leaving an owner alone,
// where one too many is no harm: who has an owner's powers goes by the LID WhatsApp confirms (lib/identidad.js).
export function esOwner(id) {
  if (!id || typeof id !== "string") return false;
  for (const jid of numerosDeOwners()) {
    if (id === jid) return true;
    // Any row with the owner's number and this id: the owner may have several (an old one keyed by the number, from
    // before WhatsApp used LIDs, and the one with the LID), and taking just the first one stopped recognizing the LID.
    if (db.prepare(`SELECT 1 FROM users WHERE jid = ? AND lid = ?`).get(jid, id)) return true;
  }
  return false;
}

// Every id the owners may come under, at once, for checking many people (lib/inactivos.js): their numbers and the ids
// of every row with them, as esOwner looks one up.
export function idsDeOwners() {
  const ids = new Set();
  for (const jid of numerosDeOwners()) {
    ids.add(jid);
    for (const fila of db.prepare(`SELECT lid FROM users WHERE jid = ?`).all(jid)) ids.add(fila.lid);
  }
  return ids;
}

// ===================== UruCoins =====================

// a person's current balance in a group
export function getSaldoCoins(chat, usuario) {
  const row = db.prepare(`SELECT saldo FROM urucoins WHERE chat = ? AND usuario = ?`).get(chat, usuario);
  return row?.saldo || 0;
}

// moves coins (positive = earned, negative = spent) and logs it. Returns the new balance.
export function moverCoins(chat, usuario, cantidad, motivo) {
  const tx = db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO urucoins (chat, usuario, saldo) VALUES (?, ?, 0)`).run(chat, usuario);
    db.prepare(`UPDATE urucoins SET saldo = saldo + ? WHERE chat = ? AND usuario = ?`).run(cantidad, chat, usuario);
    db.prepare(`INSERT INTO urucoins_log (chat, usuario, cantidad, motivo, fecha) VALUES (?, ?, ?, ?, ?)`).run(chat, usuario, cantidad, motivo, Date.now());
    return db.prepare(`SELECT saldo FROM urucoins WHERE chat = ? AND usuario = ?`).get(chat, usuario).saldo;
  });
  return tx();
}

export function ganarCoins(chat, usuario, cantidad, motivo) {
  if (!(cantidad > 0)) return getSaldoCoins(chat, usuario);
  return moverCoins(chat, usuario, cantidad, motivo);
}

// tries to spend; returns true if the balance covered it, false otherwise (and touches nothing)
export function gastarCoins(chat, usuario, cantidad, motivo) {
  if (!(cantidad > 0)) return false;
  const tx = db.transaction(() => {
    if (getSaldoCoins(chat, usuario) < cantidad) return false;
    moverCoins(chat, usuario, -cantidad, motivo);
    return true;
  });
  return tx();
}

// transfer between two people in the same group
export function transferirCoins(chat, de, para, cantidad) {
  const tx = db.transaction(() => {
    if (!gastarCoins(chat, de, cantidad, "regalo_enviado")) return false;
    ganarCoins(chat, para, cantidad, "regalo_recibido");
    return true;
  });
  return tx();
}

// When someone was last paid for a reason (ms), 0 if never: for a prize that goes once every so often.
export function ultimoCobro(chat, usuario, motivo) {
  return db.prepare(`SELECT MAX(fecha) AS fecha FROM urucoins_log WHERE chat = ? AND usuario = ? AND motivo = ? AND cantidad > 0`).get(chat, usuario, motivo)?.fecha || 0;
}

// total earned TODAY from reasons starting with a prefix (say "reaccion_") — for the daily cap
export function coinsGanadasHoy(chat, usuario, prefijoMotivo) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const row = db
    .prepare(`SELECT COALESCE(SUM(cantidad), 0) AS total FROM urucoins_log WHERE chat = ? AND usuario = ? AND cantidad > 0 AND motivo LIKE ? AND fecha >= ?`)
    .get(chat, usuario, `${prefijoMotivo}%`, inicioHoy.getTime());
  return row?.total || 0;
}

// how many movements with exactly that reason a person had TODAY (the hangman's prizes, for its daily cap)
export function movimientosHoy(chat, usuario, motivo) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  return db.prepare(`SELECT COUNT(*) AS total FROM urucoins_log WHERE chat = ? AND usuario = ? AND motivo = ? AND fecha >= ?`).get(chat, usuario, motivo, inicioHoy.getTime())?.total || 0;
}

export function topCoins(chat, n = 5) {
  const sin = sinClaudia();
  return db.prepare(`SELECT usuario, saldo FROM urucoins WHERE chat = ? AND saldo > 0${sin.sql} ORDER BY saldo DESC LIMIT ?`).all(chat, ...sin.ids, n);
}

// a person's place in the group's balance ranking (1 = richest; ties share a place); null if they have no coins
export function puestoCoins(chat, usuario) {
  const saldo = getSaldoCoins(chat, usuario);
  if (saldo <= 0) return null;
  const sin = sinClaudia();
  return db.prepare(`SELECT COUNT(*) + 1 AS puesto FROM urucoins WHERE chat = ? AND saldo > ?${sin.sql}`).get(chat, saldo, ...sin.ids).puesto;
}

// how many movements with that reason a person has in the group (duels won = "duelo_premio", for instance)
export function contarMovimientos(chat, usuario, motivo) {
  return db.prepare(`SELECT COUNT(*) AS total FROM urucoins_log WHERE chat = ? AND usuario = ? AND motivo = ?`).get(chat, usuario, motivo)?.total || 0;
}

// how many entries a person sent for a hashtag in one week (for the prize cap)
export function contarEntradasUsuarioSemana(chat, hashtag, usuario, semana) {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM hashtag_entries WHERE chat = ? AND hashtag = ? AND usuario = ? AND semana = ?`).get(chat, hashtag, usuario, semana);
  return row?.total || 0;
}

// add a reaction to the hashtag entry matching that message (if there is one)
export function sumarReaccionEntradaHashtag(chat, messageId, cantidad = 1) {
  if (!messageId) return false;
  const res = db.prepare(`UPDATE hashtag_entries SET reacciones = reacciones + ? WHERE chat = ? AND messageId = ?`).run(cantidad, chat, messageId);
  return res.changes > 0; // true if the message reacted to was a hashtag entry
}

// the most-reacted entry of a hashtag in one week (ties broken by arrival order)
export function entradaMasVotada(chat, hashtag, semana) {
  return db
    .prepare(`SELECT * FROM hashtag_entries WHERE chat = ? AND hashtag = ? AND semana = ? AND reacciones > 0 ORDER BY reacciones DESC, id ASC LIMIT 1`)
    .get(chat, hashtag, semana);
}

// closed periods (so winners are announced only once)
export function periodoCerrado(chat, tipo, periodo) {
  return !!db.prepare(`SELECT 1 FROM periodos_cerrados WHERE chat = ? AND tipo = ? AND periodo = ?`).get(chat, tipo, periodo);
}

export function marcarPeriodoCerrado(chat, tipo, periodo) {
  db.prepare(`INSERT OR IGNORE INTO periodos_cerrados (chat, tipo, periodo) VALUES (?, ?, ?)`).run(chat, tipo, periodo);
}

// Undoes marcarPeriodoCerrado, for an announcement marked before it went out whose send failed (lib/avisos-programados.js).
export function desmarcarPeriodoCerrado(chat, tipo, periodo) {
  db.prepare(`DELETE FROM periodos_cerrados WHERE chat = ? AND tipo = ? AND periodo = ?`).run(chat, tipo, periodo);
}

// The latest period of that type closed in a chat, or null. Weeks ("YYYY-MM-DD") and months ("YYYY-MM") sort as text.
export function ultimoPeriodoCerrado(chat, tipo) {
  return db.prepare(`SELECT MAX(periodo) AS periodo FROM periodos_cerrados WHERE chat = ? AND tipo = ?`).get(chat, tipo)?.periodo || null;
}

// ===================== Inventory (UruCoins shop) =====================

export function getItem(chat, usuario, item) {
  return db.prepare(`SELECT * FROM inventario WHERE chat = ? AND usuario = ? AND item = ?`).get(chat, usuario, item) || null;
}

export function getInventario(chat, usuario) {
  return db.prepare(`SELECT * FROM inventario WHERE chat = ? AND usuario = ? AND cantidad > 0 ORDER BY fecha ASC`).all(chat, usuario);
}

// adds units of an item (and optionally stores an extra value, like a streak's expiry)
export function agregarItem(chat, usuario, item, cantidad = 1, extra = null) {
  db.prepare(
    `INSERT INTO inventario (chat, usuario, item, cantidad, extra, fecha) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat, usuario, item) DO UPDATE SET cantidad = cantidad + excluded.cantidad, extra = COALESCE(excluded.extra, inventario.extra), fecha = excluded.fecha`,
  ).run(chat, usuario, item, cantidad, extra, Date.now());
}

// subtracts one unit; returns true if there was something to consume. At 0, the row is deleted.
export function consumirItem(chat, usuario, item) {
  const tx = db.transaction(() => {
    const row = getItem(chat, usuario, item);
    if (!row || row.cantidad <= 0) return false;
    if (row.cantidad === 1) db.prepare(`DELETE FROM inventario WHERE chat = ? AND usuario = ? AND item = ?`).run(chat, usuario, item);
    else db.prepare(`UPDATE inventario SET cantidad = cantidad - 1 WHERE chat = ? AND usuario = ? AND item = ?`).run(chat, usuario, item);
    return true;
  });
  return tx();
}

export function borrarItem(chat, usuario, item) {
  db.prepare(`DELETE FROM inventario WHERE chat = ? AND usuario = ? AND item = ?`).run(chat, usuario, item);
}

// ===================== Pendientes =====================

export function crearPendiente(chat, usuario, tipo, datos, ejecutarEn) {
  const res = db
    .prepare(`INSERT INTO pendientes (chat, usuario, tipo, datos, ejecutar_en, estado, creado) VALUES (?, ?, ?, ?, ?, 'pendiente', ?)`)
    .run(chat, usuario, tipo, JSON.stringify(datos), ejecutarEn, Date.now());
  return res.lastInsertRowid;
}

// is there already a pending item of this kind waiting for this person in this chat?
export function hayPendiente(chat, usuario, tipo) {
  return !!db.prepare(`SELECT 1 FROM pendientes WHERE chat = ? AND usuario = ? AND tipo = ? AND estado = 'pendiente'`).get(chat, usuario, tipo);
}

export function contarPendientesHoy(chat, tipo) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const row = db.prepare(`SELECT COUNT(*) AS total FROM pendientes WHERE chat = ? AND tipo = ? AND creado >= ?`).get(chat, tipo, inicioHoy.getTime());
  return row?.total || 0;
}

// the ones due to run; marks them as "running" in the same operation so they aren't repeated
export function tomarPendientesVencidos() {
  const tx = db.transaction(() => {
    const filas = db.prepare(`SELECT * FROM pendientes WHERE estado = 'pendiente' AND ejecutar_en <= ? ORDER BY ejecutar_en ASC`).all(Date.now());
    for (const f of filas) db.prepare(`UPDATE pendientes SET estado = 'ejecutando' WHERE id = ?`).run(f.id);
    return filas.map((f) => ({ ...f, datos: JSON.parse(f.datos || "{}") }));
  });
  return tx();
}

export function cerrarPendiente(id, estado = "hecho") {
  db.prepare(`UPDATE pendientes SET estado = ? WHERE id = ?`).run(estado, id);
}

// Back to waiting, to run at "ejecutarEn". "contarIntento" adds one to its failed attempts: a pass cut short by a
// disconnection doesn't count as one.
export function reprogramarPendiente(id, ejecutarEn, { contarIntento = true } = {}) {
  db.prepare(`UPDATE pendientes SET estado = 'pendiente', ejecutar_en = ?, intentos = COALESCE(intentos, 0) + ? WHERE id = ?`).run(ejecutarEn, contarIntento ? 1 : 0, id);
}

// if the bot went down mid-run, those stay "running" forever: they go back to pending on startup
export function recuperarPendientesColgados() {
  return db.prepare(`UPDATE pendientes SET estado = 'pendiente' WHERE estado = 'ejecutando'`).run().changes;
}

// ===================== Casino and lottery =====================

// total SPENT today on reasons starting with a prefix (say "casino_") — for the daily betting cap
export function coinsGastadasHoy(chat, usuario, prefijoMotivo) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const row = db
    .prepare(`SELECT COALESCE(SUM(-cantidad), 0) AS total FROM urucoins_log WHERE chat = ? AND usuario = ? AND cantidad < 0 AND motivo LIKE ? AND fecha >= ?`)
    .get(chat, usuario, `${prefijoMotivo}%`, inicioHoy.getTime());
  return row?.total || 0;
}

export function agregarBoletosLoteria(chat, semana, usuario, cantidad) {
  db.prepare(
    `INSERT INTO loteria_boletos (chat, semana, usuario, cantidad, fecha) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chat, semana, usuario) DO UPDATE SET cantidad = cantidad + excluded.cantidad, fecha = excluded.fecha`,
  ).run(chat, semana, usuario, cantidad, Date.now());
}

// a week's tickets in a chat, in purchase order
export function boletosLoteria(chat, semana) {
  return db.prepare(`SELECT usuario, cantidad FROM loteria_boletos WHERE chat = ? AND semana = ? ORDER BY fecha ASC`).all(chat, semana);
}

export function boletosLoteriaDe(chat, semana, usuario) {
  return db.prepare(`SELECT cantidad FROM loteria_boletos WHERE chat = ? AND semana = ? AND usuario = ?`).get(chat, semana, usuario)?.cantidad || 0;
}

// ===================== Betting markets =====================

function parsearMercado(row) {
  if (!row) return null;
  try {
    row.opciones = JSON.parse(row.opciones || "[]");
  } catch {
    row.opciones = [];
  }
  return row;
}

export function crearMercado(chat, titulo, opciones, cierraEn, creadoPor) {
  const res = db
    .prepare(`INSERT INTO mercados (chat, titulo, opciones, cierra_en, estado, creado_por, creado) VALUES (?, ?, ?, ?, 'abierto', ?, ?)`)
    .run(chat, titulo, JSON.stringify(opciones), cierraEn, creadoPor, Date.now());
  return Number(res.lastInsertRowid);
}

export function getMercado(id) {
  return parsearMercado(db.prepare(`SELECT * FROM mercados WHERE id = ?`).get(id));
}

export function mercadosDeChat(chat, estados = ["abierto", "cerrado"]) {
  const marcas = estados.map(() => "?").join(", ");
  return db.prepare(`SELECT * FROM mercados WHERE chat = ? AND estado IN (${marcas}) ORDER BY cierra_en ASC`).all(chat, ...estados).map(parsearMercado);
}

export function actualizarMercado(id, data) {
  return updateRow("mercados", "id", id, data);
}

export function apuestaEnMercado(mercadoId, usuario) {
  return db.prepare(`SELECT * FROM apuestas_mercado WHERE mercado_id = ? AND usuario = ?`).get(mercadoId, usuario) || null;
}

// one bet per person and market; betting the same option again adds to it
export function apostarEnMercado(mercadoId, usuario, opcion, cantidad) {
  db.prepare(
    `INSERT INTO apuestas_mercado (mercado_id, usuario, opcion, cantidad, fecha) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(mercado_id, usuario) DO UPDATE SET cantidad = cantidad + excluded.cantidad, fecha = excluded.fecha`,
  ).run(mercadoId, usuario, opcion, cantidad, Date.now());
}

export function apuestasDeMercado(mercadoId) {
  return db.prepare(`SELECT * FROM apuestas_mercado WHERE mercado_id = ? ORDER BY fecha ASC`).all(mercadoId);
}

// ===================== Pending work: queries for reminders and .estado =====================

export function pendientesDeUsuario(usuario, tipo) {
  return db
    .prepare(`SELECT * FROM pendientes WHERE usuario = ? AND tipo = ? AND estado = 'pendiente' ORDER BY ejecutar_en ASC`)
    .all(usuario, tipo)
    .map((f) => ({ ...f, datos: JSON.parse(f.datos || "{}") }));
}

// cancels one of your own pending items; true if it existed and was pending
export function cancelarPendiente(id, usuario, tipo) {
  return db.prepare(`UPDATE pendientes SET estado = 'cancelado' WHERE id = ? AND usuario = ? AND tipo = ? AND estado = 'pendiente'`).run(id, usuario, tipo).changes > 0;
}

export function contarPendientesPorTipo() {
  return db.prepare(`SELECT tipo, COUNT(*) AS total FROM pendientes WHERE estado = 'pendiente' GROUP BY tipo ORDER BY total DESC`).all();
}

// ===================== Birthdays =====================

export function setCumple(chat, usuario, dia, mes) {
  db.prepare(
    `INSERT INTO cumpleanos (chat, usuario, dia, mes, fecha) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chat, usuario) DO UPDATE SET dia = excluded.dia, mes = excluded.mes, fecha = excluded.fecha`,
  ).run(chat, usuario, dia, mes, Date.now());
}

export function getCumple(chat, usuario) {
  return db.prepare(`SELECT dia, mes FROM cumpleanos WHERE chat = ? AND usuario = ?`).get(chat, usuario) || null;
}

export function borrarCumple(chat, usuario) {
  return db.prepare(`DELETE FROM cumpleanos WHERE chat = ? AND usuario = ?`).run(chat, usuario).changes > 0;
}

export function cumplesDeChat(chat) {
  return db.prepare(`SELECT usuario, dia, mes FROM cumpleanos WHERE chat = ? ORDER BY mes ASC, dia ASC`).all(chat);
}

export function cumplesDeHoy(dia, mes) {
  return db.prepare(`SELECT chat, usuario FROM cumpleanos WHERE dia = ? AND mes = ?`).all(dia, mes);
}

// ===================== Activity: daily streak, daily question, recap =====================

// adds a message to the day's counter and returns the running total
export function sumarMensajeDiario(chat, usuario, fecha) {
  db.prepare(`INSERT INTO actividad_diaria (chat, usuario, fecha, mensajes) VALUES (?, ?, ?, 1) ON CONFLICT(chat, usuario, fecha) DO UPDATE SET mensajes = mensajes + 1`).run(chat, usuario, fecha);
  return db.prepare(`SELECT mensajes FROM actividad_diaria WHERE chat = ? AND usuario = ? AND fecha = ?`).get(chat, usuario, fecha)?.mensajes || 0;
}

// a person's first day with recorded activity in a group ("YYYY-MM-DD"), or null
export function primeraActividad(chat, usuario) {
  return db.prepare(`SELECT MIN(fecha) AS fecha FROM actividad_diaria WHERE chat = ? AND usuario = ?`).get(chat, usuario)?.fecha || null;
}

export function topMensajesEntre(chat, fechas, n = 3) {
  if (!fechas.length) return [];
  const marcas = fechas.map(() => "?").join(", ");
  return db.prepare(`SELECT usuario, SUM(mensajes) AS total FROM actividad_diaria WHERE chat = ? AND fecha IN (${marcas}) GROUP BY usuario ORDER BY total DESC LIMIT ?`).all(chat, ...fechas, n);
}

export function totalMensajesEntre(chat, fechas) {
  if (!fechas.length) return 0;
  const marcas = fechas.map(() => "?").join(", ");
  return db.prepare(`SELECT COALESCE(SUM(mensajes), 0) AS total FROM actividad_diaria WHERE chat = ? AND fecha IN (${marcas})`).get(chat, ...fechas)?.total || 0;
}

// ---------- group activity by hour ----------
export function sumarMensajeHora(chat, fecha, hora) {
  db.prepare(`INSERT INTO actividad_horaria (chat, fecha, hora, mensajes) VALUES (?, ?, ?, 1) ON CONFLICT(chat, fecha, hora) DO UPDATE SET mensajes = mensajes + 1`).run(chat, fecha, hora);
}

// Totals per hour (0-23) across the given days.
export function mensajesPorHora(chat, fechas) {
  if (!fechas.length) return [];
  const marcas = fechas.map(() => "?").join(", ");
  return db.prepare(`SELECT hora, SUM(mensajes) AS total FROM actividad_horaria WHERE chat = ? AND fecha IN (${marcas}) GROUP BY hora ORDER BY hora`).all(chat, ...fechas);
}

// Totals per day, for the same set of days.
export function mensajesPorDia(chat, fechas) {
  if (!fechas.length) return [];
  const marcas = fechas.map(() => "?").join(", ");
  return db.prepare(`SELECT fecha, SUM(mensajes) AS total FROM actividad_horaria WHERE chat = ? AND fecha IN (${marcas}) GROUP BY fecha ORDER BY fecha`).all(chat, ...fechas);
}

// The first day the bot counted a message in this group, or null if it never did.
export function primerDiaActividadHoraria(chat) {
  return db.prepare(`SELECT MIN(fecha) AS fecha FROM actividad_horaria WHERE chat = ?`).get(chat)?.fecha || null;
}

// Drops the hourly detail older than a date, in every group. Returns how many rows went.
export function podarActividadHoraria(antesDe) {
  return db.prepare(`DELETE FROM actividad_horaria WHERE fecha < ?`).run(antesDe).changes;
}

// ---------- presence, for .inactivos (presencia_grupo) ----------
const marcasDe = (ids) => ids.map(() => "?").join(", ");

// Since when the bot keeps track of a group (presencia_inicio): the first message or join noted there, kept.
const marcarInicioPresencia = (chat, cuando) => db.prepare(`INSERT OR IGNORE INTO presencia_inicio (chat, desde) VALUES (?, ?)`).run(chat, cuando);

// In ms, 0 if it hasn't noted anything there yet.
export function inicioPresencia(chat) {
  return db.prepare(`SELECT desde FROM presencia_inicio WHERE chat = ?`).get(chat)?.desde || 0;
}

// The bot itself came into the group or left it: what it noted before doesn't cover the time it wasn't there, and the
// next message starts the count again. The warnings it gave before don't stand either (whoever it warned may have
// written meanwhile: they weren't tagged again, and coming back weeks later paid the prize), nor the closings it noted.
export function reiniciarPresencia(chat) {
  db.transaction(() => {
    db.prepare(`DELETE FROM presencia_inicio WHERE chat = ?`).run(chat);
    db.prepare(`UPDATE presencia_grupo SET avisado = NULL WHERE chat = ? AND avisado IS NOT NULL`).run(chat);
    db.prepare(`DELETE FROM cierres_grupo WHERE chat = ?`).run(chat);
  })();
}

// A group closed (only the admins write) or opened at `cuando`: it starts a stretch in cierres_grupo, or ends the one
// going on. Seen twice (the group's notice and the bot's own .g, say), the second changes nothing, and so does a notice
// from before the last change on record, repeated or out of order: an old opening during a later closing ended that
// closing as it began, and an old closing after the group opened started one that ran until someone looked. One that
// came late but fits moves the change back to when it happened: the copy of the group the bot asked for
// (lib/cache-grupos.js) may have told it first.
export function anotarCierreGrupo(chat, cerrado, cuando = Date.now()) {
  const enCurso = db.prepare(`SELECT rowid, desde FROM cierres_grupo WHERE chat = ? AND hasta IS NULL`).get(chat);
  const ultimo = db.prepare(`SELECT rowid, desde, hasta FROM cierres_grupo WHERE chat = ? AND hasta IS NOT NULL ORDER BY hasta DESC LIMIT 1`).get(chat);
  const abrio = ultimo?.hasta ?? -Infinity;
  if (cerrado && !enCurso && cuando >= abrio) db.prepare(`INSERT INTO cierres_grupo (chat, desde) VALUES (?, ?)`).run(chat, cuando);
  if (cerrado && enCurso && cuando < enCurso.desde && cuando >= abrio) db.prepare(`UPDATE cierres_grupo SET desde = ? WHERE rowid = ?`).run(cuando, enCurso.rowid);
  if (!cerrado && enCurso && cuando >= enCurso.desde) db.prepare(`UPDATE cierres_grupo SET hasta = ? WHERE rowid = ?`).run(cuando, enCurso.rowid);
  if (!cerrado && !enCurso && ultimo && cuando >= ultimo.desde && cuando < ultimo.hasta) db.prepare(`UPDATE cierres_grupo SET hasta = ? WHERE rowid = ?`).run(cuando, ultimo.rowid);
}

// When a group was closed, oldest first: { desde, hasta } in ms, hasta null while it still is.
export function cierresGrupo(chat) {
  return db.prepare(`SELECT desde, hasta FROM cierres_grupo WHERE chat = ? ORDER BY desde`).all(chat);
}

// Someone came into a group, under each of their ids. Coming back is a fresh start: a warning from before they left
// doesn't carry over.
export function registrarIngresoGrupo(chat, ids, cuando = Date.now()) {
  const st = db.prepare(`INSERT INTO presencia_grupo (chat, usuario, ingreso) VALUES (?, ?, ?) ON CONFLICT(chat, usuario) DO UPDATE SET ingreso = excluded.ingreso, avisado = NULL`);
  for (const id of ids) st.run(chat, id, cuando);
  marcarInicioPresencia(chat, cuando);
}

// A message from someone: it's stamped on the ids it came with (sellar; the first one, failing that) and lifts the
// warning from all of them. Returns when they had been warned, or null: who comes back after .inactivos is spared, and
// paid once (better-sqlite3 runs this whole, so two messages at once can't both find the warning). A warning from
// before their last message doesn't count, and goes all the same: it went out while they were writing, and they had
// answered it already. The stamp only moves forward: a message that arrives late, with the time it was sent, doesn't
// take back a newer one.
export function registrarMensajeGrupo(chat, ids, cuando = Date.now(), sellar = ids.slice(0, 1)) {
  if (!ids.length) return null;
  const previo = db.prepare(`SELECT MAX(avisado) AS avisado, MAX(ultimo_mensaje) AS ultimo FROM presencia_grupo WHERE chat = ? AND usuario IN (${marcasDe(ids)})`).get(chat, ...ids);
  if (previo?.avisado) quitarAvisoInactivo(chat, ids);
  const st = db.prepare(`INSERT INTO presencia_grupo (chat, usuario, ultimo_mensaje) VALUES (?, ?, ?) ON CONFLICT(chat, usuario) DO UPDATE SET ultimo_mensaje = MAX(COALESCE(ultimo_mensaje, 0), excluded.ultimo_mensaje)`);
  for (const id of sellar) st.run(chat, id, cuando);
  marcarInicioPresencia(chat, cuando);
  return previo?.avisado > (previo?.ultimo || 0) ? previo.avisado : null;
}

// The warning of .inactivos. Whoever has one standing isn't warned again (lib/inactivos.js), so what's here is a first
// one, or one that no longer stands (from before the person last wrote, or before the bot came back into the group),
// and it's written over. It used to keep the first date always: whoever was tagged again could be removed that minute.
export function marcarAvisoInactivo(chat, ids, cuando = Date.now()) {
  const st = db.prepare(`INSERT INTO presencia_grupo (chat, usuario, avisado) VALUES (?, ?, ?) ON CONFLICT(chat, usuario) DO UPDATE SET avisado = excluded.avisado`);
  for (const id of ids) st.run(chat, id, cuando);
}

export function quitarAvisoInactivo(chat, ids) {
  if (!ids.length) return;
  db.prepare(`UPDATE presencia_grupo SET avisado = NULL WHERE chat = ? AND usuario IN (${marcasDe(ids)})`).run(chat, ...ids);
}

export function presenciaDelGrupo(chat) {
  return db.prepare(`SELECT usuario, ingreso, ultimo_mensaje, avisado FROM presencia_grupo WHERE chat = ?`).all(chat);
}

// Each person's last day with conversation in a group ("YYYY-MM-DD"): what's known of before presencia_grupo.
export function ultimoDiaConversacion(chat) {
  return db.prepare(`SELECT usuario, MAX(fecha) AS fecha FROM actividad_diaria WHERE chat = ? AND mensajes > 0 GROUP BY usuario`).all(chat);
}

// ---------- what the bot itself sends ----------
export function sumarEnvioBot(chat, fecha, hora, tipo) {
  db.prepare(`INSERT INTO envios_bot (chat, fecha, hora, tipo, mensajes) VALUES (?, ?, ?, ?, 1) ON CONFLICT(chat, fecha, hora, tipo) DO UPDATE SET mensajes = mensajes + 1`).run(chat, fecha, hora, tipo);
}

// Totals over the given days, grouped by one column. With a chat, only that one; with null, every chat together.
const AGRUPABLES_ENVIOS = new Set(["hora", "fecha", "chat", "tipo"]);
function enviosBotPor(columna, chat, fechas) {
  if (!AGRUPABLES_ENVIOS.has(columna) || !fechas.length) return [];
  const marcas = fechas.map(() => "?").join(", ");
  const filtro = chat ? "chat = ? AND " : "";
  return db.prepare(`SELECT ${columna}, SUM(mensajes) AS total FROM envios_bot WHERE ${filtro}fecha IN (${marcas}) GROUP BY ${columna} ORDER BY total DESC`).all(...(chat ? [chat] : []), ...fechas);
}
export const enviosBotPorHora = (chat, fechas) => enviosBotPor("hora", chat, fechas);
export const enviosBotPorDia = (chat, fechas) => enviosBotPor("fecha", chat, fechas);
export const enviosBotPorTipo = (chat, fechas) => enviosBotPor("tipo", chat, fechas);
export const enviosBotPorChat = (fechas) => enviosBotPor("chat", null, fechas);

// The first day anything was counted (in a chat, or anywhere with null), or null.
export function primerDiaEnviosBot(chat = null) {
  const fila = chat ? db.prepare(`SELECT MIN(fecha) AS fecha FROM envios_bot WHERE chat = ?`).get(chat) : db.prepare(`SELECT MIN(fecha) AS fecha FROM envios_bot`).get();
  return fila?.fecha || null;
}

export function podarEnviosBot(antesDe) {
  return db.prepare(`DELETE FROM envios_bot WHERE fecha < ?`).run(antesDe).changes;
}

// ---------- the commands people use (lib/usos.js) ----------
export function sumarUsoComando(chat, fecha, comando) {
  db.prepare(`INSERT INTO usos_comandos (chat, fecha, comando, usos) VALUES (?, ?, ?, 1) ON CONFLICT(chat, fecha, comando) DO UPDATE SET usos = usos + 1`).run(chat, fecha, comando);
}

// Uses per command over the given days, most used first. With a chat, only that one; with null, every group together,
// and private chats too only if asked for (the menu falls back on what groups use; .usos in private shows everything).
export function usosPorComando(chat, fechas, { conPrivados = false } = {}) {
  if (!fechas.length) return [];
  const marcas = fechas.map(() => "?").join(", ");
  const filtro = chat ? "chat = ? AND " : conPrivados ? "" : "chat != 'privado' AND ";
  return db.prepare(`SELECT comando, SUM(usos) AS total FROM usos_comandos WHERE ${filtro}fecha IN (${marcas}) GROUP BY comando ORDER BY total DESC, comando ASC`).all(...(chat ? [chat] : []), ...fechas);
}

// Uses per chat over the given days ("privado" included), most first.
export function usosPorChat(fechas) {
  if (!fechas.length) return [];
  const marcas = fechas.map(() => "?").join(", ");
  return db.prepare(`SELECT chat, SUM(usos) AS total FROM usos_comandos WHERE fecha IN (${marcas}) GROUP BY chat ORDER BY total DESC`).all(...fechas);
}

// The first day anything was counted (in a chat, or anywhere with null), or null.
export function primerDiaUsos(chat = null) {
  const fila = chat ? db.prepare(`SELECT MIN(fecha) AS fecha FROM usos_comandos WHERE chat = ?`).get(chat) : db.prepare(`SELECT MIN(fecha) AS fecha FROM usos_comandos`).get();
  return fila?.fecha || null;
}

export function podarUsosComandos(antesDe) {
  return db.prepare(`DELETE FROM usos_comandos WHERE fecha < ?`).run(antesDe).changes;
}

export function getRacha(chat, usuario) {
  return db.prepare(`SELECT dias, ultimoDia, mejor FROM rachas WHERE chat = ? AND usuario = ?`).get(chat, usuario) || null;
}

export function setRacha(chat, usuario, dias, ultimoDia) {
  db.prepare(
    `INSERT INTO rachas (chat, usuario, dias, ultimoDia, mejor) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chat, usuario) DO UPDATE SET dias = excluded.dias, ultimoDia = excluded.ultimoDia, mejor = MAX(rachas.mejor, excluded.dias)`,
  ).run(chat, usuario, dias, ultimoDia, dias);
}

export function guardarPreguntaDia(chat, fecha, pregunta, messageId) {
  db.prepare(
    `INSERT INTO preguntas_dia (chat, fecha, pregunta, messageId) VALUES (?, ?, ?, ?)
     ON CONFLICT(chat, fecha) DO UPDATE SET pregunta = excluded.pregunta, messageId = excluded.messageId`,
  ).run(chat, fecha, pregunta, messageId);
}

// Drops the day's mark when the question never went out (it's saved empty before it's generated), so it's tried again.
export function borrarPreguntaDiaSinEnviar(chat, fecha) {
  db.prepare(`DELETE FROM preguntas_dia WHERE chat = ? AND fecha = ? AND pregunta = ''`).run(chat, fecha);
}

export function preguntaDiaDe(chat, fecha) {
  return db.prepare(`SELECT * FROM preguntas_dia WHERE chat = ? AND fecha = ?`).get(chat, fecha) || null;
}

export function ultimasPreguntasDia(chat, n = 10) {
  return db.prepare(`SELECT pregunta FROM preguntas_dia WHERE chat = ? AND pregunta != '' ORDER BY fecha DESC LIMIT ?`).all(chat, n).map((r) => r.pregunta);
}

// groups with an activity switch on (known columns only, so no SQL is built from free text)
const OPCIONES_ACTIVIDAD = new Set(["preguntaDia", "triviaRelampago", "recapSemanal", "iniciativa"]);
export function chatsConOpcion(columna) {
  if (!OPCIONES_ACTIVIDAD.has(columna)) return [];
  return db.prepare(`SELECT remoteJid FROM chats WHERE ${columna} = 1`).all().map((r) => r.remoteJid);
}

export function contarLogDesde(chat, motivo, desdeMs) {
  return db.prepare(`SELECT COUNT(*) AS total FROM urucoins_log WHERE chat = ? AND motivo = ? AND cantidad > 0 AND fecha >= ?`).get(chat, motivo, desdeMs)?.total || 0;
}

export function ganadoresLogDesde(chat, motivo, desdeMs) {
  return db.prepare(`SELECT usuario, COUNT(*) AS total FROM urucoins_log WHERE chat = ? AND motivo = ? AND cantidad > 0 AND fecha >= ? GROUP BY usuario ORDER BY total DESC`).all(chat, motivo, desdeMs);
}

export function mercadosResueltosDesde(chat, desdeMs) {
  return db.prepare(`SELECT * FROM mercados WHERE chat = ? AND estado = 'resuelto' AND cierra_en >= ? ORDER BY cierra_en ASC`).all(chat, desdeMs).map(parsearMercado);
}

// ===================== Economy (.economia) =====================

export function totalEnCirculacion(chat) {
  const sin = sinClaudia();
  return db.prepare(`SELECT COALESCE(SUM(saldo), 0) AS total, COUNT(*) AS personas FROM urucoins WHERE chat = ? AND saldo > 0${sin.sql}`).get(chat, ...sin.ids);
}

// money in and out by reason since a given date
// Same as movimientosPorMotivo but broken down by person, which is what .timba and .mitimba need: with "usuario" it
// returns one person's rows, without it everyone's. The classification into games happens in JS (lib/timba.js) instead
// of in SQL, so no LIKE patterns are needed — in SQL "_" is a single-character wildcard, and reasons are full of them.
export function movimientosPorUsuarioYMotivo(chat, { usuario = null, desde = 0 } = {}) {
  const filtro = usuario ? "AND usuario = ?" : "";
  return db
    .prepare(
      `SELECT usuario, motivo, SUM(CASE WHEN cantidad > 0 THEN cantidad ELSE 0 END) AS entradas, SUM(CASE WHEN cantidad < 0 THEN -cantidad ELSE 0 END) AS salidas, COUNT(*) AS n
       FROM urucoins_log WHERE chat = ? AND fecha >= ? ${filtro} GROUP BY usuario, motivo`,
    )
    .all(...(usuario ? [chat, desde, usuario] : [chat, desde]));
}

export function movimientosPorMotivo(chat, desdeMs) {
  return db
    .prepare(
      `SELECT motivo, SUM(CASE WHEN cantidad > 0 THEN cantidad ELSE 0 END) AS entradas, SUM(CASE WHEN cantidad < 0 THEN -cantidad ELSE 0 END) AS salidas, COUNT(*) AS n
       FROM urucoins_log WHERE chat = ? AND fecha >= ? GROUP BY motivo`,
    )
    .all(chat, desdeMs);
}

// ===================== Group memory =====================

export function agregarMemoriaGrupo(chat, texto, autor) {
  return Number(db.prepare(`INSERT INTO memoria_grupo (chat, texto, autor, fecha) VALUES (?, ?, ?, ?)`).run(chat, texto, autor, Date.now()).lastInsertRowid);
}

export function memoriaGrupo(chat) {
  return db.prepare(`SELECT * FROM memoria_grupo WHERE chat = ? ORDER BY id ASC`).all(chat);
}

export function getMemoriaGrupo(chat, id) {
  return db.prepare(`SELECT * FROM memoria_grupo WHERE chat = ? AND id = ?`).get(chat, id) || null;
}

export function borrarMemoriaGrupo(chat, id) {
  return db.prepare(`DELETE FROM memoria_grupo WHERE chat = ? AND id = ?`).run(chat, id).changes > 0;
}

export function limpiarMemoriaGrupo(chat) {
  return db.prepare(`DELETE FROM memoria_grupo WHERE chat = ?`).run(chat).changes;
}

// ===================== Claudia's initiative =====================

const asegurarEstadoIniciativa = (chat) => db.prepare(`INSERT OR IGNORE INTO iniciativa_estado (chat) VALUES (?)`).run(chat);

// The group's initiative state, creating the row the first time.
export function estadoIniciativa(chat) {
  asegurarEstadoIniciativa(chat);
  return db.prepare(`SELECT * FROM iniciativa_estado WHERE chat = ?`).get(chat);
}

export function guardarEstadoIniciativa(chat, datos) {
  asegurarEstadoIniciativa(chat);
  return updateRow("iniciativa_estado", "chat", chat, datos);
}

// Brings the next glance forward to "momento", only if the scheduled one is later (or there's none). Returns whether it moved.
export function adelantarVistazo(chat, momento, motivo) {
  asegurarEstadoIniciativa(chat);
  return db.prepare(`UPDATE iniciativa_estado SET proximoVistazo = ?, motivoProximo = ? WHERE chat = ? AND (proximoVistazo = 0 OR proximoVistazo > ?)`).run(momento, motivo, chat, momento).changes > 0;
}

// Counts a glance, and with "conLlamada" an AI call, in the group's day. The counters start over when the day changes
// (SQLite evaluates every SET expression against the row as it was, so "dia = ?" is compared before it's overwritten).
export function contarVistazo(chat, dia, conLlamada) {
  asegurarEstadoIniciativa(chat);
  const llamada = conLlamada ? 1 : 0;
  db.prepare(
    `UPDATE iniciativa_estado SET vistazos = CASE WHEN dia = ? THEN vistazos + 1 ELSE 1 END, llamadas = CASE WHEN dia = ? THEN llamadas + ? ELSE ? END, dia = ? WHERE chat = ?`,
  ).run(dia, dia, llamada, llamada, dia, chat);
}

// AI calls spent on glances on a day, across every group.
export function llamadasDelDia(dia) {
  return db.prepare(`SELECT COALESCE(SUM(llamadas), 0) AS total FROM iniciativa_estado WHERE dia = ?`).get(dia)?.total || 0;
}

// Returns the new row's id.
export function registrarIntervencion({ chat, fecha = Date.now(), tipo, mensajeId = null, objetivoId = null, objetivoUsuario = null, texto = "", motivo = "" }) {
  return Number(
    db.prepare(`INSERT INTO intervenciones (chat, fecha, tipo, mensajeId, objetivoId, objetivoUsuario, texto, motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(chat, fecha, tipo, mensajeId, objetivoId, objetivoUsuario, texto, motivo).lastInsertRowid,
  );
}

export function intervencionesDesde(chat, desde) {
  return db.prepare(`SELECT * FROM intervenciones WHERE chat = ? AND fecha >= ? ORDER BY fecha ASC, id ASC`).all(chat, desde);
}

// Someone quoted one of her spontaneous texts. Returns whether the id was one of them.
export function marcarIntervencionRespondida(chat, mensajeId) {
  if (!mensajeId) return false;
  return db.prepare(`UPDATE intervenciones SET respondida = respondida + 1 WHERE chat = ? AND mensajeId = ? AND tipo IN ('respuesta', 'comentario')`).run(chat, mensajeId).changes > 0;
}

// Someone named her shortly after her latest spontaneous text (sent after "desde"): that one counts as answered.
export function marcarUltimaPropiaRespondida(chat, desde) {
  return (
    db.prepare(`UPDATE intervenciones SET respondida = respondida + 1 WHERE id = (SELECT id FROM intervenciones WHERE chat = ? AND tipo IN ('respuesta', 'comentario') AND fecha >= ? ORDER BY fecha DESC, id DESC LIMIT 1)`).run(chat, desde)
      .changes > 0
  );
}

export function sumarReaccionAIntervencion(chat, mensajeId) {
  if (!mensajeId) return false;
  return db.prepare(`UPDATE intervenciones SET reaccionada = reaccionada + 1 WHERE chat = ? AND mensajeId = ? AND tipo IN ('respuesta', 'comentario')`).run(chat, mensajeId).changes > 0;
}

// Her spontaneous texts since a moment, and how many of them got an answer or a reaction.
export function ecoDeIntervenciones(chat, desde) {
  return db
    .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN respondida > 0 OR reaccionada > 0 THEN 1 ELSE 0 END), 0) AS conEco FROM intervenciones WHERE chat = ? AND fecha >= ? AND tipo IN ('respuesta', 'comentario')`)
    .get(chat, desde);
}

// How many people talked in a group on a day and how many messages between them (conversation only, see actividad_diaria).
export function promedioPorPersona(chat, fecha) {
  return db.prepare(`SELECT COUNT(*) AS personas, COALESCE(SUM(mensajes), 0) AS total FROM actividad_diaria WHERE chat = ? AND fecha = ? AND mensajes > 0`).get(chat, fecha);
}

export function podarIntervenciones(antesDe) {
  return db.prepare(`DELETE FROM intervenciones WHERE fecha < ?`).run(antesDe).changes;
}

// ===================== Per-group bot roles =====================
// A role is given to the id a mention resolves to, the LID nowadays (the number, for someone the bot didn't know then),
// and a message from a group that lists people by number may bring only the number. So reading, giving and taking one
// all go by the person's two identities: taking it by one alone would leave the row under the other, with the bot saying
// it was gone, and giving it again would add a second one.
function idsDeRol(usuario) {
  const otro = usuario.endsWith("@lid") ? jidDeLid(usuario) : lidDeNumero(usuario);
  return [...new Set([usuario, otro].filter(Boolean))];
}
const enIds = (ids) => `usuario IN (${ids.map(() => "?").join(", ")})`;

// Under the id given, and only there: whatever the person had under their other identity goes.
export function setRolGrupo(chat, usuario, rol, dadoPor = "") {
  const otros = idsDeRol(usuario).filter((id) => id !== usuario);
  db.transaction(() => {
    if (otros.length) db.prepare(`DELETE FROM roles_grupo WHERE chat = ? AND ${enIds(otros)}`).run(chat, ...otros);
    db.prepare(`INSERT INTO roles_grupo (chat, usuario, rol, dadoPor, fecha) VALUES (?, ?, ?, ?, ?) ON CONFLICT(chat, usuario) DO UPDATE SET rol = excluded.rol, dadoPor = excluded.dadoPor, fecha = excluded.fecha`).run(chat, usuario, rol, dadoPor, Date.now());
  })();
}

export function quitarRolGrupo(chat, usuario) {
  if (!usuario) return false;
  const ids = idsDeRol(usuario);
  return db.prepare(`DELETE FROM roles_grupo WHERE chat = ? AND ${enIds(ids)}`).run(chat, ...ids).changes > 0;
}

// "admin", "mod" o null
export function rolGrupo(chat, usuario) {
  if (!usuario) return null;
  const ids = idsDeRol(usuario);
  return db.prepare(`SELECT rol FROM roles_grupo WHERE chat = ? AND ${enIds(ids)} ORDER BY rol = 'admin' DESC`).get(chat, ...ids)?.rol || null;
}

export function rolesGrupo(chat) {
  return db.prepare(`SELECT usuario, rol, dadoPor, fecha FROM roles_grupo WHERE chat = ? ORDER BY rol, fecha`).all(chat);
}

// ===================== Compraventa: publicaciones =====================
const ESTADOS_VIGENTES = "('activa', 'reservada')";

export function crearPublicacion({ chat, usuario, tipo, texto, precio = "", messageId = null }) {
  const numero = db.prepare(`SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM publicaciones WHERE chat = ?`).get(chat).n;
  const ahora = Date.now();
  db.prepare(`INSERT INTO publicaciones (chat, numero, usuario, tipo, texto, precio, messageId, estado, creada, actualizada, aviso) VALUES (?, ?, ?, ?, ?, ?, ?, 'activa', ?, ?, 0)`).run(chat, numero, usuario, tipo, texto, precio, messageId, ahora, ahora);
  return numero;
}

export function getPublicacion(chat, numero) {
  return db.prepare(`SELECT * FROM publicaciones WHERE chat = ? AND numero = ?`).get(chat, numero) || null;
}

// The post a message belongs to: either the person's message or the bot's confirmation works, since quoting either
// one is how you act on a post without its number.
export function getPublicacionPorMensaje(chat, messageId) {
  if (!messageId) return null;
  return db.prepare(`SELECT * FROM publicaciones WHERE chat = ? AND (messageId = ? OR mensajeBot = ?)`).get(chat, messageId, messageId) || null;
}

// live ones (active or reserved), of one type or all, newest first
export function publicacionesActivas(chat, tipo = null, limite = 30) {
  if (tipo) return db.prepare(`SELECT * FROM publicaciones WHERE chat = ? AND tipo = ? AND estado IN ${ESTADOS_VIGENTES} ORDER BY numero DESC LIMIT ?`).all(chat, tipo, limite);
  return db.prepare(`SELECT * FROM publicaciones WHERE chat = ? AND estado IN ${ESTADOS_VIGENTES} ORDER BY numero DESC LIMIT ?`).all(chat, limite);
}

export function publicacionesDe(chat, usuario) {
  return db.prepare(`SELECT * FROM publicaciones WHERE chat = ? AND usuario = ? AND estado IN ${ESTADOS_VIGENTES} ORDER BY numero DESC`).all(chat, usuario);
}

export function contarPublicacionesActivas(chat, usuario) {
  return db.prepare(`SELECT COUNT(*) AS n FROM publicaciones WHERE chat = ? AND usuario = ? AND estado IN ${ESTADOS_VIGENTES}`).get(chat, usuario).n;
}

export function actualizarPublicacion(chat, numero, data) {
  const keys = Object.keys(data);
  if (!keys.length) return;
  db.prepare(`UPDATE publicaciones SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE chat = ? AND numero = ?`).run(...keys.map((k) => data[k]), chat, numero);
}

// Whoever left the group: their live posts are taken down (lib/compraventa.js). Returns how many.
export function cerrarPublicacionesDe(chat, usuario, ahora = Date.now()) {
  return db.prepare(`UPDATE publicaciones SET estado = 'cerrada', actualizada = ? WHERE chat = ? AND usuario = ? AND estado IN ${ESTADOS_VIGENTES}`).run(ahora, chat, usuario).changes;
}

// live ones due for a check: old with no notice sent, or with the notice already expired
export function publicacionesParaRevisar(limiteActualizada, limiteAviso) {
  return db.prepare(`SELECT * FROM publicaciones WHERE estado IN ${ESTADOS_VIGENTES} AND ((aviso = 0 AND actualizada < ?) OR (aviso > 0 AND aviso < ?)) ORDER BY chat, numero`).all(limiteActualizada, limiteAviso);
}

// ===================== Compraventa: alertas =====================
export function agregarAlerta(chat, usuario, palabra) {
  return db.prepare(`INSERT OR IGNORE INTO alertas_compraventa (chat, usuario, palabra, creada) VALUES (?, ?, ?, ?)`).run(chat, usuario, palabra, Date.now()).changes > 0;
}

export function quitarAlerta(chat, usuario, palabra) {
  return db.prepare(`DELETE FROM alertas_compraventa WHERE chat = ? AND usuario = ? AND palabra = ?`).run(chat, usuario, palabra).changes > 0;
}

export function alertasDe(chat, usuario) {
  return db.prepare(`SELECT palabra FROM alertas_compraventa WHERE chat = ? AND usuario = ? ORDER BY creada`).all(chat, usuario).map((r) => r.palabra);
}

export function alertasDelChat(chat) {
  return db.prepare(`SELECT usuario, palabra FROM alertas_compraventa WHERE chat = ?`).all(chat);
}

// Every alert of someone who left the group. Returns how many.
export function quitarAlertasDe(chat, usuario) {
  return db.prepare(`DELETE FROM alertas_compraventa WHERE chat = ? AND usuario = ?`).run(chat, usuario).changes;
}

// ===================== Compraventa: calificaciones =====================
// One per rated person and month: an existing one for this month is replaced. Returns { actualizada }.
export function guardarCalificacion(chat, de, para, estrellas, comentario, desdeMs, ahora = Date.now()) {
  const previa = db.prepare(`SELECT id FROM calificaciones WHERE de = ? AND para = ? AND fecha >= ? ORDER BY fecha DESC LIMIT 1`).get(de, para, desdeMs);
  if (previa) {
    db.prepare(`UPDATE calificaciones SET chat = ?, estrellas = ?, comentario = ?, fecha = ? WHERE id = ?`).run(chat, estrellas, comentario, ahora, previa.id);
    return { actualizada: true };
  }
  db.prepare(`INSERT INTO calificaciones (chat, de, para, estrellas, comentario, fecha) VALUES (?, ?, ?, ?, ?, ?)`).run(chat, de, para, estrellas, comentario, ahora);
  return { actualizada: false };
}

// a person's rating average and count, across every group
export function reputacionDe(para) {
  const r = db.prepare(`SELECT AVG(estrellas) AS promedio, COUNT(*) AS cantidad FROM calificaciones WHERE para = ?`).get(para);
  return { promedio: r.promedio || 0, cantidad: r.cantidad || 0 };
}

export function ultimasCalificaciones(para, n = 3) {
  return db.prepare(`SELECT de, estrellas, comentario, fecha FROM calificaciones WHERE para = ? ORDER BY fecha DESC LIMIT ?`).all(para, n);
}

// ===================== Group hours =====================
export function chatsConHorarioGrupo() {
  return db.prepare(`SELECT remoteJid, horarioGrupo, grupoCerradoPorHorario, horarioGrupoFalla FROM chats WHERE horarioGrupo != ''`).all();
}

// One rating by id, all the ones a person received (with the group they were made in), plus editing and deleting
// so an admin can fix a malicious one.
export function getCalificacion(id) {
  return db.prepare(`SELECT * FROM calificaciones WHERE id = ?`).get(id) || null;
}

export function calificacionesRecibidas(para, n = 20) {
  return db.prepare(`SELECT * FROM calificaciones WHERE para = ? ORDER BY fecha DESC LIMIT ?`).all(para, n);
}

export function actualizarCalificacion(id, estrellas, comentario) {
  return db.prepare(`UPDATE calificaciones SET estrellas = ?, comentario = ? WHERE id = ?`).run(estrellas, comentario, id).changes > 0;
}

export function borrarCalificacion(id) {
  return db.prepare(`DELETE FROM calificaciones WHERE id = ?`).run(id).changes > 0;
}

// ---------- Parejas ----------
const filaPareja = (p, lid) => ({ id: p.id, pareja: p.a === lid ? p.b : p.a, desde: p.desde, casadosDesde: p.casados_desde || 0, propusoCasamiento: p.propuso_casamiento || "", ultimoBeso: p.ultimo_beso || 0, enojoHasta: p.enojo_hasta || 0, enojoPor: p.enojo_por || "", enojada: p.enojada || "" });

export function parejaDe(lid) {
  const p = db.prepare(`SELECT * FROM parejas WHERE a = ? OR b = ?`).get(lid, lid);
  return p ? filaPareja(p, lid) : null;
}

export function crearPareja(a, b, desde) {
  return db.prepare(`INSERT INTO parejas (a, b, desde) VALUES (?, ?, ?)`).run(a, b, desde).lastInsertRowid;
}

export function actualizarPareja(id, data) {
  return updateRow("parejas", "id", id, data);
}

export function borrarPareja(id) {
  return db.prepare(`DELETE FROM parejas WHERE id = ?`).run(id).changes > 0;
}

export function listaParejas() {
  return db.prepare(`SELECT * FROM parejas ORDER BY desde ASC`).all().map((p) => ({ id: p.id, a: p.a, b: p.b, desde: p.desde, casadosDesde: p.casados_desde || 0 }));
}

export function guardarSolicitudPareja(de, para, chat, fecha) {
  db.prepare(`INSERT OR REPLACE INTO solicitudes_pareja (de, para, chat, fecha) VALUES (?, ?, ?, ?)`).run(de, para, chat || "", fecha);
}

export function getSolicitudPareja(de) {
  return db.prepare(`SELECT * FROM solicitudes_pareja WHERE de = ?`).get(de) || null;
}

export function borrarSolicitudPareja(de) {
  return db.prepare(`DELETE FROM solicitudes_pareja WHERE de = ?`).run(de).changes > 0;
}

// deletes the requests made by and for this person (once a couple forms, nothing stays pending)
export function borrarSolicitudesCon(lid) {
  return db.prepare(`DELETE FROM solicitudes_pareja WHERE de = ? OR para = ?`).run(lid, lid).changes;
}

export function guardarExPareja(x, y, desde, hasta) {
  const [a, b] = [x, y].sort();
  return db.prepare(`INSERT OR IGNORE INTO exparejas (a, b, desde, hasta) VALUES (?, ?, ?, ?)`).run(a, b, desde || 0, hasta || 0).changes > 0;
}

// ---------- Familias ----------
export function padresDe(hijo) {
  return db.prepare(`SELECT * FROM familia_hijos WHERE hijo = ?`).get(hijo) || null;
}

export function hijosDe(padre) {
  return db.prepare(`SELECT hijo, desde FROM familia_hijos WHERE padre_a = ? OR padre_b = ? ORDER BY desde ASC`).all(padre, padre);
}

// every adoption, oldest first: .familias finds each family's founding couple among them
export function listaAdopciones() {
  return db.prepare(`SELECT hijo, padre_a, padre_b, desde FROM familia_hijos ORDER BY desde ASC`).all();
}

export function crearAdopcion(hijo, padreA, padreB, desde) {
  return db.prepare(`INSERT OR REPLACE INTO familia_hijos (hijo, padre_a, padre_b, desde) VALUES (?, ?, ?, ?)`).run(hijo, padreA, padreB, desde).changes > 0;
}

export function borrarAdopcion(hijo) {
  return db.prepare(`DELETE FROM familia_hijos WHERE hijo = ?`).run(hijo).changes > 0;
}

// how many adoptions this person made since a given moment (for the daily cap)
export function adopcionesDesde(padre, desde) {
  return db.prepare(`SELECT COUNT(*) AS n FROM familia_hijos WHERE (padre_a = ? OR padre_b = ?) AND desde >= ?`).get(padre, padre, desde).n;
}

export function guardarSolicitudAdopcion(hijo, padreA, padreB, chat, costo, fecha) {
  db.prepare(`INSERT OR REPLACE INTO solicitudes_adopcion (hijo, padre_a, padre_b, chat, costo, fecha) VALUES (?, ?, ?, ?, ?, ?)`).run(hijo, padreA, padreB, chat || "", costo || 0, fecha);
}

export function getSolicitudAdopcion(hijo) {
  return db.prepare(`SELECT * FROM solicitudes_adopcion WHERE hijo = ?`).get(hijo) || null;
}

// the request a person has open as an adopting parent
export function getSolicitudAdopcionDe(padre) {
  return db.prepare(`SELECT * FROM solicitudes_adopcion WHERE padre_a = ? OR padre_b = ?`).get(padre, padre) || null;
}

export function borrarSolicitudAdopcion(hijo) {
  return db.prepare(`DELETE FROM solicitudes_adopcion WHERE hijo = ?`).run(hijo).changes > 0;
}

export function getApellido(lid) {
  return db.prepare(`SELECT apellido FROM apellidos WHERE lid = ?`).get(lid)?.apellido || "";
}

export function setApellido(lid, apellido, desde = Date.now()) {
  if (!apellido) return db.prepare(`DELETE FROM apellidos WHERE lid = ?`).run(lid).changes > 0;
  db.prepare(`INSERT OR REPLACE INTO apellidos (lid, apellido, desde) VALUES (?, ?, ?)`).run(lid, apellido, desde);
  return true;
}

export function listaApellidos() {
  return db.prepare(`SELECT lid, apellido FROM apellidos ORDER BY apellido ASC, desde ASC`).all();
}

// a person's exes, deduplicated, most recent first
export function exParejasDe(lid) {
  const vistos = new Set();
  const lista = [];
  for (const f of db.prepare(`SELECT a, b, hasta FROM exparejas WHERE a = ? OR b = ? ORDER BY hasta DESC`).all(lid, lid)) {
    const otro = f.a === lid ? f.b : f.a;
    if (vistos.has(otro)) continue;
    vistos.add(otro);
    lista.push(otro);
  }
  return lista;
}
