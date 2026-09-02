import { existsSync, mkdirSync } from "fs";
import Database from "better-sqlite3";

// Cargar base de datos SQLite
export function loadDatabase() {
  // Si la carpeta "databases" no existe, se crea.
  if (!existsSync("./database")) mkdirSync("./database");

  // Cargar db (better-sqlite3 es síncrono)
  const db = new Database("./database/database.db");
  console.log("🟢 Base de datos SQLite (better-sqlite3) conectada");

  // Crear tabla users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      lid TEXT PRIMARY KEY,
      jid TEXT,
      pushName TEXT,
      banned BOOLEAN DEFAULT 0,
      couple TEXT DEFAULT "",
      coupleTime INTEGER DEFAULT -1,
      couplesHistory TEXT DEFAULT "[]",
      commandAttempts INTEGER DEFAULT 0,
      inGroup TEXT DEFAULT "{}",
      lastmining INTEGER DEFAULT 0,
      married TEXT DEFAULT "",
      marriedTime INTEGER DEFAULT -1,
      mute BOOLEAN DEFAULT 0,
      warn INTEGER DEFAULT 0,
      memoria TEXT DEFAULT "",
      timestamp INTEGER
    )
  `);

  // Migración: si la tabla users ya existía de antes sin la columna "memoria", se la agrega.
  const columnasUsers = db.prepare(`PRAGMA table_info(users)`).all();
  if (!columnasUsers.some((c) => c.name === "memoria")) {
    db.exec(`ALTER TABLE users ADD COLUMN memoria TEXT DEFAULT ""`);
    console.log("🟢 Migración: columna 'memoria' agregada a la tabla users");
  }

  // Crear tabla chats
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      remoteJid TEXT PRIMARY KEY,
      adminMode BOOLEAN DEFAULT 0,
      adultMode BOOLEAN DEFAULT 0,
      antiStatus BOOLEAN DEFAULT 0,
      antiGroups BOOLEAN DEFAULT 1,
      antiChannels BOOLEAN DEFAULT 1,
      antiInstagram BOOLEAN DEFAULT 0,
      antiTiktok BOOLEAN DEFAULT 0,
      antiTelegram BOOLEAN DEFAULT 0,
      allAntiLinks BOOLEAN DEFAULT 0,
      audios BOOLEAN DEFAULT 0,
      detect BOOLEAN DEFAULT 1,
      antiDelete BOOLEAN DEFAULT 0,
      games BOOLEAN DEFAULT 1,
      isBanned BOOLEAN DEFAULT 0,
      mentions BOOLEAN DEFAULT 1,
      reactions BOOLEAN DEFAULT 0,
      welcome BOOLEAN DEFAULT 0,
      blacklistMode BOOLEAN DEFAULT 0
    )
  `);

  // Crear tabla de comandos bloqueados por chat (modo blacklist)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_blacklist (
      remoteJid TEXT NOT NULL,
      command TEXT NOT NULL,
      PRIMARY KEY (remoteJid, command)
    )
  `);

  // Crear tabla settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      botJid TEXT PRIMARY KEY,
      autoRead BOOLEAN DEFAULT 1,
      antiPrivate BOOLEAN DEFAULT 0,
      antiCall BOOLEAN DEFAULT 1,
      spamTime INTEGER DEFAULT -1
    )
  `);

  // Crear tabla de usuarios en lista negra
  db.exec(`
    CREATE TABLE IF NOT EXISTS blacklist (
      jid TEXT PRIMARY KEY,
      reason TEXT,
      dateAdded INTEGER,
      addedBy TEXT
    )
  `);

  // Crear tabla de entradas de hashtags (historias random, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS hashtag_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat TEXT NOT NULL,
      hashtag TEXT NOT NULL,
      usuario TEXT NOT NULL,
      contenido TEXT,
      messageId TEXT,
      semana TEXT NOT NULL,
      fecha INTEGER NOT NULL
    )
  `);

  // Crear tabla de interacciones mensuales (puntos por reaccionar / recibir reacciones)
  db.exec(`
    CREATE TABLE IF NOT EXISTS interacciones_mensuales (
      mes TEXT NOT NULL,
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      recibidas INTEGER DEFAULT 0,
      emitidas INTEGER DEFAULT 0,
      PRIMARY KEY (mes, chat, usuario)
    )
  `);

  return db;
}

// Función que se llama en cada mensaje
export function initDataDB(m) {
  const chatJid = m.chat;
  const botJid = client?.user?.lid;
  const pushName = m?.pushName || "";

  // Asegurar datos defaults de usuario
  db.prepare(`INSERT OR IGNORE INTO users (lid, jid, pushName) VALUES (?, ?, ?)`).run(m.sender, m.senderJid, pushName);

  // Asegurar datos defaults del chat
  db.prepare(`INSERT OR IGNORE INTO chats (remoteJid) VALUES (?)`).run(chatJid);

  // Asegurar settings defaults del bot
  db.prepare(`INSERT OR IGNORE INTO settings (botJid) VALUES (?)`).run(botJid);
}

// Obtener datos de usuario
export function getUser(userId, chatJid = null) {
  let lidJid;
  if (userId.endsWith("@lid")) {
    lidJid = "lid";
  } else {
    lidJid = "jid";
  }
  const row = db.prepare(`SELECT * FROM users WHERE ${lidJid} = ?`).get(userId);
  if (!row) return null;

  // Parsear JSON
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

  // Si es necesario inicializar inGroup[m.chat]
  if (chatJid) {
    if (!row.inGroup[chatJid]) {
      row.inGroup[chatJid] = {
        afk: -1,
        afkReason: "",
        mute: false,
        messageCount: 0,
      };

      updateUser(userId, {
        inGroup: JSON.stringify(row.inGroup),
      });
    }
  }

  return row;
}

// Obtener datos de chat
export function getChat(jid) {
  return db.prepare(`SELECT * FROM chats WHERE remoteJid = ?`).get(jid) || null;
}

// Obtener datos de configuración del bot
export function getBotSettings(botJid) {
  return db.prepare(`SELECT * FROM settings WHERE botJid = ?`).get(botJid) || null;
}

// Actualizar pushName, jid, timestamp en la entrada del usuario.
export function syncUserInfo(m) {
  const lid = m.sender;
  const newJid = m.senderJid;
  const newPush = m.pushName || (m.fromMe ? client.user.name : null);
  const timestamp = Date.now();

  if (!lid) return;

  const user = getUser(lid);

  let finalJid = user?.jid;
  const isRegularJid = finalJid?.endsWith?.("@s.whatsapp.net");

  if (!finalJid || !isRegularJid) finalJid = newJid;

  const datos = { jid: finalJid, timestamp };
  // Los avisos de grupo y algunos tipos de mensaje vienen sin pushName: no pisar el nombre guardado con null.
  if (newPush) datos.pushName = newPush;
  updateUser(lid, datos);
}

// actualizar datos en db
function updateRow(table, primaryKey, primaryValue, data) {
  if (!data || Object.keys(data).length === 0) return true;

  const keys = Object.keys(data);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = Object.values(data);

  // normalizar booleanos para better-sqlite3: convertir true/false en 1/0
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === "boolean") {
      values[i] = v ? 1 : 0;
    }
  }

  const sql = `UPDATE ${table} SET ${setClause} WHERE ${primaryKey} = ?`;

  db.prepare(sql).run(...values, primaryValue);

  return true;
}

// actualizar datos de un usuario
export function updateUser(lid, data) {
  return updateRow("users", "lid", lid, data);
}

// actualizar datos de chat
export function updateChat(remoteJid, data) {
  return updateRow("chats", "remoteJid", remoteJid, data);
}

// actualizar configuración del bot
export function updateSettings(botJid, data) {
  return updateRow("settings", "botJid", botJid, data);
}

// añadir usuario a lista negra
export function addToBlacklist(jid, reason, addedBy) {
  const exists = isBlacklisted(jid);
  if (exists) {
    // Solo actualiza la razón (mantiene el addedBy y dateAdded originales)
    db.prepare(`UPDATE blacklist SET reason = ? WHERE jid = ?`).run(reason, jid);
  } else {
    const dateAdded = Date.now();
    db.prepare(
      `INSERT INTO blacklist (jid, reason, dateAdded, addedBy)
      VALUES (?, ?, ?, ?)`,
    ).run(jid, reason, dateAdded, addedBy);
  }
}

// eliminar usuario de lista negra
export function removeFromBlacklist(jid) {
  db.prepare(`DELETE FROM blacklist WHERE jid = ?`).run(jid);
}

export function isBlacklisted(jid) {
  return db.prepare(`SELECT * FROM blacklist WHERE jid = ?`).get(jid) || null;
}

// obtener usuarios en lista negra
export function getBlacklist() {
  return db.prepare(`SELECT * FROM blacklist`).all();
}

// obtener numero total de usuarios en db tabla users
export function getTotalUsers() {
  const row = db.prepare("SELECT COUNT(*) AS total FROM users").get();
  return row?.total || 0;
}

// función para obtener todos los usuarios de tabla users en db
export function getAllUsers() {
  const rows = db.prepare(`SELECT * FROM users`).all();

  // Parsear JSON por cada usuario
  for (const row of rows) {
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
  }

  return rows;
}

// eliminar usuario completo de tabla users
export function deleteUser(lid) {
  return db.prepare(`DELETE FROM users WHERE lid = ?`).run(lid);
}

// añadir comando bloqueado a la blacklist de un chat
export function addToChatBlacklist(remoteJid, command) {
  db.prepare(`INSERT OR IGNORE INTO chat_blacklist (remoteJid, command) VALUES (?, ?)`).run(remoteJid, command);
}

// quitar comando bloqueado de la blacklist de un chat
export function removeFromChatBlacklist(remoteJid, command) {
  db.prepare(`DELETE FROM chat_blacklist WHERE remoteJid = ? AND command = ?`).run(remoteJid, command);
}

// añadir varios comandos de una sola vez a la blacklist de un chat
export function addManyToChatBlacklist(remoteJid, commands) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO chat_blacklist (remoteJid, command) VALUES (?, ?)`);
  const insertMany = db.transaction((cmds) => {
    for (const cmd of cmds) stmt.run(remoteJid, cmd);
  });
  insertMany(commands);
}

// quitar varios comandos de una sola vez de la blacklist de un chat
export function removeManyFromChatBlacklist(remoteJid, commands) {
  const stmt = db.prepare(`DELETE FROM chat_blacklist WHERE remoteJid = ? AND command = ?`);
  const deleteMany = db.transaction((cmds) => {
    for (const cmd of cmds) stmt.run(remoteJid, cmd);
  });
  deleteMany(commands);
}

// obtener todos los comandos bloqueados de un chat
export function getChatBlacklist(remoteJid) {
  return db
    .prepare(`SELECT command FROM chat_blacklist WHERE remoteJid = ?`)
    .all(remoteJid)
    .map((row) => row.command);
}

// verificar si un comando está bloqueado en un chat (modo blacklist)
export function isCommandBlacklisted(remoteJid, command) {
  return !!db.prepare(`SELECT 1 FROM chat_blacklist WHERE remoteJid = ? AND command = ?`).get(remoteJid, command);
}

// registrar una entrada de hashtag (ej. una historia random). Devuelve el número que le tocó
// dentro de esa semana (para poder avisar "Historia #4 registrada").
export function agregarEntradaHashtag({ chat, hashtag, usuario, contenido, messageId, semana }) {
  const fecha = Date.now();
  db.prepare(
    `INSERT INTO hashtag_entries (chat, hashtag, usuario, contenido, messageId, semana, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(chat, hashtag, usuario, contenido || "", messageId || null, semana, fecha);

  const row = db.prepare(`SELECT COUNT(*) AS total FROM hashtag_entries WHERE chat = ? AND hashtag = ? AND semana = ?`).get(chat, hashtag, semana);
  return row?.total || 1;
}

// obtener todas las entradas de un hashtag en un chat, para una semana puntual, en orden de llegada.
export function obtenerEntradasHashtag(chat, hashtag, semana) {
  return db
    .prepare(`SELECT * FROM hashtag_entries WHERE chat = ? AND hashtag = ? AND semana = ? ORDER BY id ASC`)
    .all(chat, hashtag, semana);
}

// sumar una interacción (reacción) del mes, ya sea "recibidas" (el autor del mensaje reaccionado)
// o "emitidas" (quien reacciona). Crea la fila del usuario en ese mes/chat si todavía no existe.
export function sumarInteraccion(mes, chat, usuario, tipo) {
  if (tipo !== "recibidas" && tipo !== "emitidas") return;
  db.prepare(`INSERT OR IGNORE INTO interacciones_mensuales (mes, chat, usuario) VALUES (?, ?, ?)`).run(mes, chat, usuario);
  db.prepare(`UPDATE interacciones_mensuales SET ${tipo} = ${tipo} + 1 WHERE mes = ? AND chat = ? AND usuario = ?`).run(mes, chat, usuario);
}

// obtener el top 5 de "más votado" (recibidas) y "más activo" (emitidas) de un chat, en un mes dado.
export function obtenerRankingMensual(chat, mes) {
  const masVotado = db.prepare(`SELECT usuario, recibidas FROM interacciones_mensuales WHERE chat = ? AND mes = ? AND recibidas > 0 ORDER BY recibidas DESC LIMIT 5`).all(chat, mes);
  const masActivo = db.prepare(`SELECT usuario, emitidas FROM interacciones_mensuales WHERE chat = ? AND mes = ? AND emitidas > 0 ORDER BY emitidas DESC LIMIT 5`).all(chat, mes);
  return { masVotado, masActivo };
}

// ¿El identificador (lid o jid) pertenece a un owner del bot? Los owners se configuran por número de teléfono,
// pero en los grupos los participantes llegan como @lid, así que se resuelve el lid del owner por la tabla users.
export function esOwner(id) {
  if (!id || typeof id !== "string") return false;
  for (const numero of globalThis.owners || []) {
    const limpio = String(numero).replace(/[^0-9]/g, "");
    if (!limpio) continue;
    const jid = limpio + "@s.whatsapp.net";
    if (id === jid) return true;
    const fila = db.prepare(`SELECT lid FROM users WHERE jid = ?`).get(jid);
    if (fila?.lid && id === fila.lid) return true;
  }
  return false;
}
