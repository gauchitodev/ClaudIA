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

  // UruCoins: saldo por persona y por grupo (cada grupo tiene su propia economía)
  db.exec(`
    CREATE TABLE IF NOT EXISTS urucoins (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      saldo INTEGER DEFAULT 0,
      PRIMARY KEY (chat, usuario)
    )
  `);

  // UruCoins: registro de cada movimiento (para auditar, y para los topes diarios)
  db.exec(`
    CREATE TABLE IF NOT EXISTS urucoins_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      cantidad INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      fecha INTEGER NOT NULL
    )
  `);

  // Períodos ya cerrados (anuncio de ganadores del mes / historia de la semana), para no repetirlos
  db.exec(`
    CREATE TABLE IF NOT EXISTS periodos_cerrados (
      chat TEXT NOT NULL,
      tipo TEXT NOT NULL,
      periodo TEXT NOT NULL,
      PRIMARY KEY (chat, tipo, periodo)
    )
  `);

  // Migración: contador de reacciones en las entradas de hashtags (para la historia de la semana)
  const columnasHashtag = db.prepare(`PRAGMA table_info(hashtag_entries)`).all();
  if (!columnasHashtag.some((c) => c.name === "reacciones")) {
    db.exec(`ALTER TABLE hashtag_entries ADD COLUMN reacciones INTEGER DEFAULT 0`);
    console.log("🟢 Migración: columna 'reacciones' agregada a hashtag_entries");
  }

  // Inventario de la tienda de UruCoins (ítems por persona y por grupo)
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventario (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      item TEXT NOT NULL,
      cantidad INTEGER DEFAULT 0,
      extra TEXT DEFAULT "",
      fecha INTEGER NOT NULL,
      PRIMARY KEY (chat, usuario, item)
    )
  `);

  // Pendientes: cosas que el bot tiene que hacer más tarde (por ahora, reintentar descargas fallidas)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pendientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      tipo TEXT NOT NULL,
      datos TEXT NOT NULL,
      ejecutar_en INTEGER NOT NULL,
      estado TEXT DEFAULT "pendiente",
      creado INTEGER NOT NULL
    )
  `);

  // Migración: apodo con el que Claudia le habla a cada persona (se compra en la tienda)
  if (!columnasUsers.some((c) => c.name === "apodo")) {
    db.exec(`ALTER TABLE users ADD COLUMN apodo TEXT DEFAULT ""`);
    console.log("🟢 Migración: columna 'apodo' agregada a la tabla users");
  }

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

  updateUser(lid, {
    pushName: newPush,
    jid: finalJid,
    timestamp: timestamp,
  });
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


// ===================== UruCoins =====================

// saldo actual de una persona en un grupo
export function getSaldoCoins(chat, usuario) {
  const row = db.prepare(`SELECT saldo FROM urucoins WHERE chat = ? AND usuario = ?`).get(chat, usuario);
  return row?.saldo || 0;
}

// mueve coins (positivo = gana, negativo = gasta) y deja registro. Devuelve el saldo nuevo.
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

// intenta gastar; devuelve true si alcanzaba el saldo, false si no (y no toca nada)
export function gastarCoins(chat, usuario, cantidad, motivo) {
  if (!(cantidad > 0)) return false;
  const tx = db.transaction(() => {
    if (getSaldoCoins(chat, usuario) < cantidad) return false;
    moverCoins(chat, usuario, -cantidad, motivo);
    return true;
  });
  return tx();
}

// transferencia entre dos personas del mismo grupo
export function transferirCoins(chat, de, para, cantidad) {
  const tx = db.transaction(() => {
    if (!gastarCoins(chat, de, cantidad, "regalo_enviado")) return false;
    ganarCoins(chat, para, cantidad, "regalo_recibido");
    return true;
  });
  return tx();
}

// suma de lo ganado HOY por motivos que empiecen con un prefijo (ej. "reaccion_") — para el tope diario
export function coinsGanadasHoy(chat, usuario, prefijoMotivo) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const row = db
    .prepare(`SELECT COALESCE(SUM(cantidad), 0) AS total FROM urucoins_log WHERE chat = ? AND usuario = ? AND cantidad > 0 AND motivo LIKE ? AND fecha >= ?`)
    .get(chat, usuario, prefijoMotivo + "%", inicioHoy.getTime());
  return row?.total || 0;
}

export function topCoins(chat, n = 5) {
  return db.prepare(`SELECT usuario, saldo FROM urucoins WHERE chat = ? AND saldo > 0 ORDER BY saldo DESC LIMIT ?`).all(chat, n);
}

// cuántas entradas mandó una persona de un hashtag en una semana (para el tope de premios)
export function contarEntradasUsuarioSemana(chat, hashtag, usuario, semana) {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM hashtag_entries WHERE chat = ? AND hashtag = ? AND usuario = ? AND semana = ?`).get(chat, hashtag, usuario, semana);
  return row?.total || 0;
}

// sumar una reacción a la entrada de hashtag que corresponda a ese mensaje (si existe)
export function sumarReaccionEntradaHashtag(chat, messageId, cantidad = 1) {
  if (!messageId) return false;
  const res = db.prepare(`UPDATE hashtag_entries SET reacciones = reacciones + ? WHERE chat = ? AND messageId = ?`).run(cantidad, chat, messageId);
  return res.changes > 0; // true si el mensaje reaccionado era una entrada de hashtag
}

// la entrada más reaccionada de un hashtag en una semana (con desempate por orden de llegada)
export function entradaMasVotada(chat, hashtag, semana) {
  return db
    .prepare(`SELECT * FROM hashtag_entries WHERE chat = ? AND hashtag = ? AND semana = ? AND reacciones > 0 ORDER BY reacciones DESC, id ASC LIMIT 1`)
    .get(chat, hashtag, semana);
}

// períodos cerrados (para anunciar ganadores una sola vez)
export function periodoCerrado(chat, tipo, periodo) {
  return !!db.prepare(`SELECT 1 FROM periodos_cerrados WHERE chat = ? AND tipo = ? AND periodo = ?`).get(chat, tipo, periodo);
}

export function marcarPeriodoCerrado(chat, tipo, periodo) {
  db.prepare(`INSERT OR IGNORE INTO periodos_cerrados (chat, tipo, periodo) VALUES (?, ?, ?)`).run(chat, tipo, periodo);
}

// ===================== Inventario (tienda de UruCoins) =====================

export function getItem(chat, usuario, item) {
  return db.prepare(`SELECT * FROM inventario WHERE chat = ? AND usuario = ? AND item = ?`).get(chat, usuario, item) || null;
}

export function getInventario(chat, usuario) {
  return db.prepare(`SELECT * FROM inventario WHERE chat = ? AND usuario = ? AND cantidad > 0 ORDER BY fecha ASC`).all(chat, usuario);
}

// suma unidades de un ítem (y opcionalmente guarda un dato extra, ej. vencimiento de la racha)
export function agregarItem(chat, usuario, item, cantidad = 1, extra = null) {
  db.prepare(
    `INSERT INTO inventario (chat, usuario, item, cantidad, extra, fecha) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat, usuario, item) DO UPDATE SET cantidad = cantidad + excluded.cantidad, extra = COALESCE(excluded.extra, inventario.extra), fecha = excluded.fecha`,
  ).run(chat, usuario, item, cantidad, extra, Date.now());
}

// resta una unidad; devuelve true si había para consumir. Si llega a 0, borra la fila.
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

// ¿ya hay un pendiente de este tipo esperando para esta persona en este chat?
export function hayPendiente(chat, usuario, tipo) {
  return !!db.prepare(`SELECT 1 FROM pendientes WHERE chat = ? AND usuario = ? AND tipo = ? AND estado = 'pendiente'`).get(chat, usuario, tipo);
}

export function contarPendientesHoy(chat, tipo) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const row = db.prepare(`SELECT COUNT(*) AS total FROM pendientes WHERE chat = ? AND tipo = ? AND creado >= ?`).get(chat, tipo, inicioHoy.getTime());
  return row?.total || 0;
}

// los que ya tocan ejecutar; los marca como "ejecutando" en la misma operación para no repetirlos
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

// si el bot se apagó a mitad de una ejecución, esos quedan "ejecutando" para siempre: los volvemos a pendientes al arrancar
export function recuperarPendientesColgados() {
  return db.prepare(`UPDATE pendientes SET estado = 'pendiente' WHERE estado = 'ejecutando'`).run().changes;
}
