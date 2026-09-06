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
      blacklistMode BOOLEAN DEFAULT 0,
      preguntaDia BOOLEAN DEFAULT 0,
      triviaRelampago BOOLEAN DEFAULT 0,
      recapSemanal BOOLEAN DEFAULT 1,
      horarioJuegos TEXT DEFAULT "",
      charla BOOLEAN DEFAULT 1,
      saludos BOOLEAN DEFAULT 1,
      monedas BOOLEAN DEFAULT 1,
      ascensos BOOLEAN DEFAULT 1,
      reglas TEXT DEFAULT "",
      plantilla TEXT DEFAULT "",
      horarioGrupo TEXT DEFAULT "",
      grupoCerradoPorHorario BOOLEAN DEFAULT 0
    )
  `);

  // Migración: interruptores de actividad (pregunta del día, trivia relámpago, recap semanal), horario de juegos e
  // interruptores del modo compraventa (charla, saludos, monedas, ascensos) en bases ya creadas.
  const columnasChats = db.prepare(`PRAGMA table_info(chats)`).all().map((c) => c.name);
  for (const [columna, definicion] of [["preguntaDia", "BOOLEAN DEFAULT 0"], ["triviaRelampago", "BOOLEAN DEFAULT 0"], ["recapSemanal", "BOOLEAN DEFAULT 1"], ["horarioJuegos", 'TEXT DEFAULT ""'], ["charla", "BOOLEAN DEFAULT 1"], ["saludos", "BOOLEAN DEFAULT 1"], ["monedas", "BOOLEAN DEFAULT 1"], ["ascensos", "BOOLEAN DEFAULT 1"], ["reglas", 'TEXT DEFAULT ""'], ["plantilla", 'TEXT DEFAULT ""'], ["horarioGrupo", 'TEXT DEFAULT ""'], ["grupoCerradoPorHorario", "BOOLEAN DEFAULT 0"]]) {
    if (!columnasChats.includes(columna)) {
      db.exec(`ALTER TABLE chats ADD COLUMN ${columna} ${definicion}`);
      console.log(`🟢 Migración: columna '${columna}' agregada a la tabla chats`);
    }
  }

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

  // Lista negra de personas, por grupo. chat = "*" es la lista de todos los grupos (la maneja el owner desde el privado).
  db.exec(`
    CREATE TABLE IF NOT EXISTS lista_negra (
      chat TEXT NOT NULL,
      jid TEXT NOT NULL,
      reason TEXT,
      dateAdded INTEGER,
      addedBy TEXT,
      PRIMARY KEY (chat, jid)
    )
  `);
  // Migración: la lista negra vieja era una sola para todos los grupos; sus entradas pasan a "*" y la tabla vieja se borra.
  if (db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'blacklist'`).get()) {
    db.transaction(() => {
      db.exec(`INSERT OR IGNORE INTO lista_negra (chat, jid, reason, dateAdded, addedBy) SELECT '*', jid, reason, dateAdded, addedBy FROM blacklist`);
      db.exec(`DROP TABLE blacklist`);
    })();
    console.log("🟢 Migración: lista negra pasada al formato por grupo");
  }

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

  // Índices: el registro de movimientos crece sin límite y se consulta en cada reacción y en cada apuesta (topes diarios)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_urucoins_log_persona ON urucoins_log (chat, usuario, fecha)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_urucoins_log_chat_fecha ON urucoins_log (chat, fecha)`);

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

  db.exec(`CREATE INDEX IF NOT EXISTS idx_pendientes_estado ON pendientes (estado, ejecutar_en)`);

  // Lotería semanal: boletos comprados por persona y semana
  db.exec(`
    CREATE TABLE IF NOT EXISTS loteria_boletos (
      chat TEXT NOT NULL,
      semana TEXT NOT NULL,
      usuario TEXT NOT NULL,
      cantidad INTEGER DEFAULT 0,
      fecha INTEGER NOT NULL,
      PRIMARY KEY (chat, semana, usuario)
    )
  `);

  // Mercados de apuestas sobre eventos reales (los abre un admin) y las apuestas de cada persona
  db.exec(`
    CREATE TABLE IF NOT EXISTS mercados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat TEXT NOT NULL,
      titulo TEXT NOT NULL,
      opciones TEXT NOT NULL,
      cierra_en INTEGER NOT NULL,
      estado TEXT DEFAULT "abierto",
      ganadora INTEGER,
      creado_por TEXT NOT NULL,
      creado INTEGER NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS apuestas_mercado (
      mercado_id INTEGER NOT NULL,
      usuario TEXT NOT NULL,
      opcion INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      fecha INTEGER NOT NULL,
      PRIMARY KEY (mercado_id, usuario)
    )
  `);

  // Cumpleaños: día y mes por persona y grupo (Claudia saluda en el grupo donde se anotó)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cumpleanos (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      dia INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      fecha INTEGER NOT NULL,
      PRIMARY KEY (chat, usuario)
    )
  `);

  // Actividad: mensajes por persona y día (racha diaria y recap), rachas, y la pregunta del día de cada grupo
  db.exec(`
    CREATE TABLE IF NOT EXISTS actividad_diaria (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      fecha TEXT NOT NULL,
      mensajes INTEGER DEFAULT 0,
      PRIMARY KEY (chat, usuario, fecha)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS rachas (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      dias INTEGER DEFAULT 0,
      ultimoDia TEXT,
      mejor INTEGER DEFAULT 0,
      PRIMARY KEY (chat, usuario)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS preguntas_dia (
      chat TEXT NOT NULL,
      fecha TEXT NOT NULL,
      pregunta TEXT NOT NULL,
      messageId TEXT,
      PRIMARY KEY (chat, fecha)
    )
  `);

  // Memoria del grupo: datos y chistes internos que el grupo le anota a Claudia con .recordá que
  db.exec(`
    CREATE TABLE IF NOT EXISTS memoria_grupo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat TEXT NOT NULL,
      texto TEXT NOT NULL,
      autor TEXT NOT NULL,
      fecha INTEGER NOT NULL
    )
  `);

  // Roles del bot por grupo (.adminbot / .moderador): una persona tiene a lo sumo un rol por grupo
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles_grupo (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      rol TEXT NOT NULL,
      dadoPor TEXT DEFAULT "",
      fecha INTEGER NOT NULL,
      PRIMARY KEY (chat, usuario)
    )
  `);

  // Compraventa: publicaciones (#vendo / #compro) numeradas por grupo, alertas por palabra y calificaciones entre personas
  db.exec(`
    CREATE TABLE IF NOT EXISTS publicaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat TEXT NOT NULL,
      numero INTEGER NOT NULL,
      usuario TEXT NOT NULL,
      tipo TEXT NOT NULL,
      texto TEXT NOT NULL,
      precio TEXT DEFAULT "",
      messageId TEXT,
      estado TEXT DEFAULT "activa",
      creada INTEGER NOT NULL,
      actualizada INTEGER NOT NULL,
      aviso INTEGER DEFAULT 0,
      UNIQUE (chat, numero)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_publicaciones_chat_estado ON publicaciones (chat, estado)`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS alertas_compraventa (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      palabra TEXT NOT NULL,
      creada INTEGER NOT NULL,
      PRIMARY KEY (chat, usuario, palabra)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS calificaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat TEXT NOT NULL,
      de TEXT NOT NULL,
      para TEXT NOT NULL,
      estrellas INTEGER NOT NULL,
      comentario TEXT DEFAULT "",
      fecha INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_calificaciones_para ON calificaciones (para, fecha)`);

  // Parejas: una fila por pareja, con quién propuso casamiento y desde cuándo están casados. Los pedidos sin responder
  // van en solicitudes_pareja y las relaciones terminadas en exparejas. Antes todo vivía en las columnas couple/married
  // de cada usuario, y "tener pareja" dependía de que las dos fichas se apuntaran mutuamente: un pedido sin contestar se
  // confundía con una pareja. Las columnas viejas quedan, pero ya no se usan.
  const habiaParejas = !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'parejas'`).get();
  db.exec(`
    CREATE TABLE IF NOT EXISTS parejas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      a TEXT NOT NULL UNIQUE,
      b TEXT NOT NULL UNIQUE,
      desde INTEGER NOT NULL,
      casados_desde INTEGER DEFAULT 0,
      propuso_casamiento TEXT DEFAULT ""
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS solicitudes_pareja (
      de TEXT PRIMARY KEY,
      para TEXT NOT NULL,
      chat TEXT DEFAULT "",
      fecha INTEGER NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS exparejas (
      a TEXT NOT NULL,
      b TEXT NOT NULL,
      desde INTEGER DEFAULT 0,
      hasta INTEGER DEFAULT 0,
      PRIMARY KEY (a, b, hasta)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_exparejas_b ON exparejas (b)`);
  if (!habiaParejas) migrarParejasViejas(db);

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
        desde: Date.now(), // primera vez que el bot vio a la persona en este grupo (antigüedad para los rangos)
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

// añadir persona a la lista negra de un grupo ("*" = todos los grupos). Si ya estaba, solo se actualiza el motivo.
export function addToBlacklist(jid, reason, addedBy, chat = "*") {
  db.prepare(
    `INSERT INTO lista_negra (chat, jid, reason, dateAdded, addedBy) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(chat, jid) DO UPDATE SET reason = excluded.reason`,
  ).run(chat, jid, reason, Date.now(), addedBy);
}

// sacar de la lista negra de un grupo; true si estaba
export function removeFromBlacklist(jid, chat = "*") {
  return db.prepare(`DELETE FROM lista_negra WHERE chat = ? AND jid = ?`).run(chat, jid).changes > 0;
}

// ¿está en la lista negra de ese grupo, o en la de todos los grupos? Devuelve la entrada (la del grupo antes que la global) o null.
export function isBlacklisted(jid, chat = "*") {
  return db.prepare(`SELECT * FROM lista_negra WHERE jid = ? AND chat IN (?, '*') ORDER BY CASE WHEN chat = '*' THEN 1 ELSE 0 END LIMIT 1`).get(jid, chat) || null;
}

// entradas de un grupo más las globales; sin chat, todas las de todos los grupos
export function getBlacklist(chat = null) {
  if (!chat) return db.prepare(`SELECT * FROM lista_negra ORDER BY dateAdded ASC`).all();
  return db.prepare(`SELECT * FROM lista_negra WHERE chat IN (?, '*') ORDER BY dateAdded ASC`).all(chat);
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
// puesto de una persona en el ranking del mes por reacciones recibidas (1 = la más votada); null si no tiene nada
export function puestoRankingMensual(mes, chat, usuario) {
  const fila = db.prepare(`SELECT recibidas, emitidas FROM interacciones_mensuales WHERE mes = ? AND chat = ? AND usuario = ?`).get(mes, chat, usuario);
  if (!fila || (fila.recibidas <= 0 && fila.emitidas <= 0)) return null;
  const puesto = db.prepare(`SELECT COUNT(*) + 1 AS puesto FROM interacciones_mensuales WHERE mes = ? AND chat = ? AND recibidas > ?`).get(mes, chat, fila.recibidas).puesto;
  return { ...fila, puesto };
}

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
    const jid = `${limpio}@s.whatsapp.net`;
    if (id === jid) return true;
    const fila = db.prepare(`SELECT lid FROM users WHERE jid = ?`).get(jid);
    if (fila?.lid && id === fila.lid) return true;
  }
  return false;
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
    .get(chat, usuario, `${prefijoMotivo}%`, inicioHoy.getTime());
  return row?.total || 0;
}

export function topCoins(chat, n = 5) {
  return db.prepare(`SELECT usuario, saldo FROM urucoins WHERE chat = ? AND saldo > 0 ORDER BY saldo DESC LIMIT ?`).all(chat, n);
}

// puesto de una persona en el ranking de saldos del grupo (1 = la más rica; empatados comparten puesto); null si no tiene coins
export function puestoCoins(chat, usuario) {
  const saldo = getSaldoCoins(chat, usuario);
  if (saldo <= 0) return null;
  return db.prepare(`SELECT COUNT(*) + 1 AS puesto FROM urucoins WHERE chat = ? AND saldo > ?`).get(chat, saldo).puesto;
}

// cuántos movimientos con ese motivo tiene una persona en el grupo (por ejemplo, duelos ganados = "duelo_premio")
export function contarMovimientos(chat, usuario, motivo) {
  return db.prepare(`SELECT COUNT(*) AS total FROM urucoins_log WHERE chat = ? AND usuario = ? AND motivo = ?`).get(chat, usuario, motivo)?.total || 0;
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

// ===================== Casino y lotería =====================

// suma de lo GASTADO hoy por motivos que empiecen con un prefijo (ej. "casino_") — para el tope diario de apuestas
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

// boletos de una semana en un chat, en orden de compra
export function boletosLoteria(chat, semana) {
  return db.prepare(`SELECT usuario, cantidad FROM loteria_boletos WHERE chat = ? AND semana = ? ORDER BY fecha ASC`).all(chat, semana);
}

export function boletosLoteriaDe(chat, semana, usuario) {
  return db.prepare(`SELECT cantidad FROM loteria_boletos WHERE chat = ? AND semana = ? AND usuario = ?`).get(chat, semana, usuario)?.cantidad || 0;
}

// ===================== Mercados de apuestas =====================

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

// una apuesta por persona y mercado; si repite la misma opción, se suma
export function apostarEnMercado(mercadoId, usuario, opcion, cantidad) {
  db.prepare(
    `INSERT INTO apuestas_mercado (mercado_id, usuario, opcion, cantidad, fecha) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(mercado_id, usuario) DO UPDATE SET cantidad = cantidad + excluded.cantidad, fecha = excluded.fecha`,
  ).run(mercadoId, usuario, opcion, cantidad, Date.now());
}

export function apuestasDeMercado(mercadoId) {
  return db.prepare(`SELECT * FROM apuestas_mercado WHERE mercado_id = ? ORDER BY fecha ASC`).all(mercadoId);
}

// ===================== Pendientes: consultas para recordatorios y .estado =====================

export function pendientesDeUsuario(usuario, tipo) {
  return db
    .prepare(`SELECT * FROM pendientes WHERE usuario = ? AND tipo = ? AND estado = 'pendiente' ORDER BY ejecutar_en ASC`)
    .all(usuario, tipo)
    .map((f) => ({ ...f, datos: JSON.parse(f.datos || "{}") }));
}

// cancela un pendiente propio; true si existía y estaba pendiente
export function cancelarPendiente(id, usuario, tipo) {
  return db.prepare(`UPDATE pendientes SET estado = 'cancelado' WHERE id = ? AND usuario = ? AND tipo = ? AND estado = 'pendiente'`).run(id, usuario, tipo).changes > 0;
}

export function contarPendientesPorTipo() {
  return db.prepare(`SELECT tipo, COUNT(*) AS total FROM pendientes WHERE estado = 'pendiente' GROUP BY tipo ORDER BY total DESC`).all();
}

// ===================== Cumpleaños =====================

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

// ===================== Actividad: racha diaria, pregunta del día, recap =====================

// suma un mensaje al contador del día y devuelve cuántos lleva
export function sumarMensajeDiario(chat, usuario, fecha) {
  db.prepare(`INSERT INTO actividad_diaria (chat, usuario, fecha, mensajes) VALUES (?, ?, ?, 1) ON CONFLICT(chat, usuario, fecha) DO UPDATE SET mensajes = mensajes + 1`).run(chat, usuario, fecha);
  return db.prepare(`SELECT mensajes FROM actividad_diaria WHERE chat = ? AND usuario = ? AND fecha = ?`).get(chat, usuario, fecha)?.mensajes || 0;
}

// primer día con actividad registrada de una persona en un grupo ("YYYY-MM-DD"), o null
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

export function preguntaDiaDe(chat, fecha) {
  return db.prepare(`SELECT * FROM preguntas_dia WHERE chat = ? AND fecha = ?`).get(chat, fecha) || null;
}

export function ultimasPreguntasDia(chat, n = 10) {
  return db.prepare(`SELECT pregunta FROM preguntas_dia WHERE chat = ? AND pregunta != '' ORDER BY fecha DESC LIMIT ?`).all(chat, n).map((r) => r.pregunta);
}

// grupos con un interruptor de actividad prendido (solo columnas conocidas, para no armar SQL con texto libre)
const OPCIONES_ACTIVIDAD = new Set(["preguntaDia", "triviaRelampago", "recapSemanal"]);
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

// ===================== Economía (.economia) =====================

export function totalEnCirculacion(chat) {
  return db.prepare(`SELECT COALESCE(SUM(saldo), 0) AS total, COUNT(*) AS personas FROM urucoins WHERE chat = ? AND saldo > 0`).get(chat);
}

// entradas y salidas por motivo desde una fecha
export function movimientosPorMotivo(chat, desdeMs) {
  return db
    .prepare(
      `SELECT motivo, SUM(CASE WHEN cantidad > 0 THEN cantidad ELSE 0 END) AS entradas, SUM(CASE WHEN cantidad < 0 THEN -cantidad ELSE 0 END) AS salidas, COUNT(*) AS n
       FROM urucoins_log WHERE chat = ? AND fecha >= ? GROUP BY motivo`,
    )
    .all(chat, desdeMs);
}

// ===================== Memoria del grupo =====================

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

// ===================== Roles del bot por grupo =====================
export function setRolGrupo(chat, usuario, rol, dadoPor = "") {
  db.prepare(`INSERT INTO roles_grupo (chat, usuario, rol, dadoPor, fecha) VALUES (?, ?, ?, ?, ?) ON CONFLICT(chat, usuario) DO UPDATE SET rol = excluded.rol, dadoPor = excluded.dadoPor, fecha = excluded.fecha`).run(chat, usuario, rol, dadoPor, Date.now());
}

export function quitarRolGrupo(chat, usuario) {
  return db.prepare(`DELETE FROM roles_grupo WHERE chat = ? AND usuario = ?`).run(chat, usuario).changes > 0;
}

// "admin", "mod" o null
export function rolGrupo(chat, usuario) {
  return db.prepare(`SELECT rol FROM roles_grupo WHERE chat = ? AND usuario = ?`).get(chat, usuario)?.rol || null;
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

// vigentes (activas o reservadas), de un tipo o de todos, de la más nueva a la más vieja
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

// vigentes que hay que revisar: sin aviso y viejas, o con aviso ya vencido
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

// ===================== Compraventa: calificaciones =====================
// Una por persona calificada y mes: si ya había una de este mes, se reemplaza. Devuelve { actualizada }.
export function guardarCalificacion(chat, de, para, estrellas, comentario, desdeMs, ahora = Date.now()) {
  const previa = db.prepare(`SELECT id FROM calificaciones WHERE de = ? AND para = ? AND fecha >= ? ORDER BY fecha DESC LIMIT 1`).get(de, para, desdeMs);
  if (previa) {
    db.prepare(`UPDATE calificaciones SET chat = ?, estrellas = ?, comentario = ?, fecha = ? WHERE id = ?`).run(chat, estrellas, comentario, ahora, previa.id);
    return { actualizada: true };
  }
  db.prepare(`INSERT INTO calificaciones (chat, de, para, estrellas, comentario, fecha) VALUES (?, ?, ?, ?, ?, ?)`).run(chat, de, para, estrellas, comentario, ahora);
  return { actualizada: false };
}

// promedio y cantidad de calificaciones de una persona, contando todos los grupos
export function reputacionDe(para) {
  const r = db.prepare(`SELECT AVG(estrellas) AS promedio, COUNT(*) AS cantidad FROM calificaciones WHERE para = ?`).get(para);
  return { promedio: r.promedio || 0, cantidad: r.cantidad || 0 };
}

export function ultimasCalificaciones(para, n = 3) {
  return db.prepare(`SELECT de, estrellas, comentario, fecha FROM calificaciones WHERE para = ? ORDER BY fecha DESC LIMIT ?`).all(para, n);
}

// ===================== Horario del grupo =====================
export function chatsConHorarioGrupo() {
  return db.prepare(`SELECT remoteJid, horarioGrupo, grupoCerradoPorHorario FROM chats WHERE horarioGrupo != ''`).all();
}

// Una calificación por id, todas las que recibió una persona (con el grupo donde se hicieron), y edición o borrado
// para que un admin pueda corregir una maliciosa.
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
// Pasa las columnas couple/coupleTime/married/marriedTime/couplesHistory de users a las tablas nuevas. Corre una sola
// vez, cuando la tabla parejas recién se crea. Los punteros mutuos son parejas; los de un solo lado, pedidos pendientes.
function migrarParejasViejas(db) {
  const usuarios = db.prepare(`SELECT lid, jid, couple, coupleTime, couplesHistory, married, marriedTime FROM users WHERE couple != '' OR (couplesHistory != '' AND couplesHistory != '[]')`).all();
  if (!usuarios.length) return;
  const lidPorJid = new Map(db.prepare(`SELECT lid, jid FROM users WHERE jid != ''`).all().map((u) => [u.jid, u.lid]));
  const porLid = new Map(usuarios.map((u) => [u.lid, u]));
  const primeraFecha = (...ts) => {
    const validas = ts.filter((t) => t > 0);
    return validas.length ? Math.min(...validas) : 0;
  };
  let parejas = 0;
  let pedidos = 0;
  let ex = 0;
  db.transaction(() => {
    for (const u of usuarios) {
      if (u.couple) {
        const otroLid = lidPorJid.get(u.couple);
        const otro = otroLid ? porLid.get(otroLid) : null;
        if (otro && otro.couple === u.jid) {
          if (u.lid < otro.lid) {
            const desde = primeraFecha(u.coupleTime, otro.coupleTime) || Date.now();
            const casados = !!u.married && u.married === otro.jid && otro.married === u.jid;
            const casadosDesde = casados ? primeraFecha(u.marriedTime, otro.marriedTime) || desde : 0;
            const propuso = casados ? "" : u.married === otro.jid ? u.lid : otro.married === u.jid ? otro.lid : "";
            if (db.prepare(`INSERT OR IGNORE INTO parejas (a, b, desde, casados_desde, propuso_casamiento) VALUES (?, ?, ?, ?, ?)`).run(u.lid, otro.lid, desde, casadosDesde, propuso).changes) parejas++;
          }
        } else if (otroLid && otroLid !== u.lid) {
          db.prepare(`INSERT OR IGNORE INTO solicitudes_pareja (de, para, chat, fecha) VALUES (?, ?, '', ?)`).run(u.lid, otroLid, Date.now());
          pedidos++;
        }
      }
      let historial = [];
      try {
        historial = JSON.parse(u.couplesHistory || "[]");
      } catch {}
      for (const jid of Array.isArray(historial) ? historial : []) {
        const exLid = lidPorJid.get(jid);
        if (!exLid || exLid === u.lid) continue;
        const [a, b] = [u.lid, exLid].sort();
        if (db.prepare(`INSERT OR IGNORE INTO exparejas (a, b, desde, hasta) VALUES (?, ?, 0, 0)`).run(a, b).changes) ex++;
      }
    }
  })();
  console.log(`🟢 Migración: parejas pasadas a tablas propias (${parejas} parejas, ${pedidos} pedidos pendientes, ${ex} ex)`);
}

const filaPareja = (p, lid) => ({ id: p.id, pareja: p.a === lid ? p.b : p.a, desde: p.desde, casadosDesde: p.casados_desde || 0, propusoCasamiento: p.propuso_casamiento || "" });

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

// borra los pedidos hechos por y para esta persona (al formarse una pareja no queda nada pendiente)
export function borrarSolicitudesCon(lid) {
  return db.prepare(`DELETE FROM solicitudes_pareja WHERE de = ? OR para = ?`).run(lid, lid).changes;
}

export function guardarExPareja(x, y, desde, hasta) {
  const [a, b] = [x, y].sort();
  return db.prepare(`INSERT OR IGNORE INTO exparejas (a, b, desde, hasta) VALUES (?, ?, ?, ?)`).run(a, b, desde || 0, hasta || 0).changes > 0;
}

// ex de una persona, sin repetir, de la más reciente a la más vieja
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
