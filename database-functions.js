import { existsSync, mkdirSync } from "fs";
import Database from "better-sqlite3";

// Load the SQLite database
export function loadDatabase() {
  // Create the "databases" folder if it isn't there.
  if (!existsSync("./database")) mkdirSync("./database");

  // Open the db (better-sqlite3 is synchronous)
  const db = new Database("./database/database.db");
  console.log("🟢 Base de datos SQLite (better-sqlite3) conectada");

  // Create the users table
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
      warn INTEGER DEFAULT 0, -- obsoleta: las advertencias son por grupo y viven en inGroup[chat].warn
      memoria TEXT DEFAULT "",
      timestamp INTEGER
    )
  `);

  // Migration: if the users table already existed without the "memoria" column, add it.
  const columnasUsers = db.prepare(`PRAGMA table_info(users)`).all();
  if (!columnasUsers.some((c) => c.name === "memoria")) {
    db.exec(`ALTER TABLE users ADD COLUMN memoria TEXT DEFAULT ""`);
    console.log("🟢 Migración: columna 'memoria' agregada a la tabla users");
  }

  // Create the chats table
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
      casino BOOLEAN DEFAULT 1,
      ascensos BOOLEAN DEFAULT 1,
      reglas TEXT DEFAULT "",
      plantilla TEXT DEFAULT "",
      horarioGrupo TEXT DEFAULT "",
      grupoCerradoPorHorario BOOLEAN DEFAULT 0
    )
  `);

  // Migration: activity switches (daily question, lightning trivia, weekly recap), game hours and the marketplace
  // mode switches (chat, greetings, coins, promotions) on databases that already exist.
  const columnasChats = db.prepare(`PRAGMA table_info(chats)`).all().map((c) => c.name);
  for (const [columna, definicion] of [["preguntaDia", "BOOLEAN DEFAULT 0"], ["triviaRelampago", "BOOLEAN DEFAULT 0"], ["recapSemanal", "BOOLEAN DEFAULT 1"], ["horarioJuegos", 'TEXT DEFAULT ""'], ["charla", "BOOLEAN DEFAULT 1"], ["saludos", "BOOLEAN DEFAULT 1"], ["monedas", "BOOLEAN DEFAULT 1"], ["ascensos", "BOOLEAN DEFAULT 1"], ["reglas", 'TEXT DEFAULT ""'], ["plantilla", 'TEXT DEFAULT ""'], ["horarioGrupo", 'TEXT DEFAULT ""'], ["grupoCerradoPorHorario", "BOOLEAN DEFAULT 0"], ["casino", "BOOLEAN DEFAULT 1"]]) {
    if (!columnasChats.includes(columna)) {
      db.exec(`ALTER TABLE chats ADD COLUMN ${columna} ${definicion}`);
      console.log(`🟢 Migración: columna '${columna}' agregada a la tabla chats`);
    }
  }

  // Create the per-chat blocked commands table (blacklist mode)
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_blacklist (
      remoteJid TEXT NOT NULL,
      command TEXT NOT NULL,
      PRIMARY KEY (remoteJid, command)
    )
  `);

  // Create the settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      botJid TEXT PRIMARY KEY,
      autoRead BOOLEAN DEFAULT 1,
      antiPrivate BOOLEAN DEFAULT 0,
      antiCall BOOLEAN DEFAULT 1,
      spamTime INTEGER DEFAULT -1
    )
  `);

  // Per-group blacklist. chat = "*" is the all-groups list (the owner manages it from a private chat).
  // jid holds the best identifier known for the person (their number; the LID when the number isn't known) and lid
  // holds their LID when it is known: in newer groups WhatsApp identifies people by LID and often doesn't send the
  // number, so without the stored LID there is no way to recognize them among the participants or to remove them.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lista_negra (
      chat TEXT NOT NULL,
      jid TEXT NOT NULL,
      lid TEXT,
      reason TEXT,
      dateAdded INTEGER,
      addedBy TEXT,
      PRIMARY KEY (chat, jid)
    )
  `);
  // Migration: lid column on blacklists that already exist.
  if (!db.prepare(`PRAGMA table_info(lista_negra)`).all().some((c) => c.name === "lid")) {
    db.exec(`ALTER TABLE lista_negra ADD COLUMN lid TEXT`);
    console.log("🟢 Migración: columna 'lid' agregada a la lista negra");
  }
  // Migration: the old blacklist was a single list for every group; its entries move to "*" and the old table is dropped.
  if (db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'blacklist'`).get()) {
    db.transaction(() => {
      db.exec(`INSERT OR IGNORE INTO lista_negra (chat, jid, reason, dateAdded, addedBy) SELECT '*', jid, reason, dateAdded, addedBy FROM blacklist`);
      db.exec(`DROP TABLE blacklist`);
    })();
    console.log("🟢 Migración: lista negra pasada al formato por grupo");
  }

  // Create the hashtag entries table (random stories, etc.)
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

  // Create the monthly interactions table (points for reacting / being reacted to)
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

  // UruCoins: balance per person and per group (each group has its own economy)
  db.exec(`
    CREATE TABLE IF NOT EXISTS urucoins (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      saldo INTEGER DEFAULT 0,
      PRIMARY KEY (chat, usuario)
    )
  `);

  // UruCoins: a log of every movement (for auditing, and for the daily caps)
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

  // Indexes: the movement log grows without bound and is queried on every reaction and every bet (daily caps)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_urucoins_log_persona ON urucoins_log (chat, usuario, fecha)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_urucoins_log_chat_fecha ON urucoins_log (chat, fecha)`);

  // Periods already closed (monthly winners / story of the week announcements), so they aren't repeated
  db.exec(`
    CREATE TABLE IF NOT EXISTS periodos_cerrados (
      chat TEXT NOT NULL,
      tipo TEXT NOT NULL,
      periodo TEXT NOT NULL,
      PRIMARY KEY (chat, tipo, periodo)
    )
  `);

  // Migration: reaction counter on hashtag entries (for the story of the week)
  const columnasHashtag = db.prepare(`PRAGMA table_info(hashtag_entries)`).all();
  if (!columnasHashtag.some((c) => c.name === "reacciones")) {
    db.exec(`ALTER TABLE hashtag_entries ADD COLUMN reacciones INTEGER DEFAULT 0`);
    console.log("🟢 Migración: columna 'reacciones' agregada a hashtag_entries");
  }

  // UruCoins shop inventory (items per person and per group)
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

  // Pending work: things the bot has to do later (for now, retrying failed downloads)
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

  // Weekly lottery: tickets bought per person and week
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

  // Betting markets on real events (opened by an admin) and each person's bets
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

  // Birthdays: day and month per person and group (Claudia says happy birthday in the group they signed up in)
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

  // Activity: messages per person and day (daily streak and recap), streaks, and each group's daily question
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

  // Group memory: facts and inside jokes the group tells Claudia to remember with .recordá que
  db.exec(`
    CREATE TABLE IF NOT EXISTS memoria_grupo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat TEXT NOT NULL,
      texto TEXT NOT NULL,
      autor TEXT NOT NULL,
      fecha INTEGER NOT NULL
    )
  `);

  // Per-group bot roles (.adminbot / .moderador): a person holds at most one role per group
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

  // Marketplace: posts (#vendo / #compro) numbered per group, keyword alerts and ratings between people
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
      mensajeBot TEXT,
      estado TEXT DEFAULT "activa",
      creada INTEGER NOT NULL,
      actualizada INTEGER NOT NULL,
      aviso INTEGER DEFAULT 0,
      UNIQUE (chat, numero)
    )
  `);
  // messageId is the person's message (the photo, or the one carrying #vendo) and mensajeBot the confirmation:
  // quoting either one identifies the post, with no need to remember its number.
  if (!db.prepare(`PRAGMA table_info(publicaciones)`).all().some((c) => c.name === "mensajeBot")) {
    db.exec(`ALTER TABLE publicaciones ADD COLUMN mensajeBot TEXT`);
    console.log("🟢 Migración: columna 'mensajeBot' agregada a publicaciones");
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_publicaciones_chat_estado ON publicaciones (chat, estado)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_publicaciones_mensajes ON publicaciones (chat, messageId, mensajeBot)`);
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

  // Couples: one row per couple, with who proposed and since when they've been married. Unanswered requests go in
  // solicitudes_pareja and ended relationships in exparejas. This all used to live in each user's couple/married
  // columns, where "being in a couple" depended on both records pointing at each other: an unanswered request looked
  // just like a couple. The old columns remain, but are no longer used.
  const habiaParejas = !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'parejas'`).get();
  db.exec(`
    CREATE TABLE IF NOT EXISTS parejas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      a TEXT NOT NULL UNIQUE,
      b TEXT NOT NULL UNIQUE,
      desde INTEGER NOT NULL,
      casados_desde INTEGER DEFAULT 0,
      propuso_casamiento TEXT DEFAULT "",
      ultimo_beso INTEGER DEFAULT 0,
      enojo_hasta INTEGER DEFAULT 0,
      enojo_por TEXT DEFAULT "",
      enojada TEXT DEFAULT ""
    )
  `);
  // Migration: a couple's spats and last kiss (databases that already had the parejas table without those columns)
  const columnasParejas = db.prepare(`PRAGMA table_info(parejas)`).all().map((c) => c.name);
  for (const [columna, definicion] of [["ultimo_beso", "INTEGER DEFAULT 0"], ["enojo_hasta", "INTEGER DEFAULT 0"], ["enojo_por", "TEXT DEFAULT \"\""], ["enojada", "TEXT DEFAULT \"\""]]) {
    if (!columnasParejas.includes(columna)) db.exec(`ALTER TABLE parejas ADD COLUMN ${columna} ${definicion}`);
  }
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

  // Families: each adoption is a row with the child and their two parents (the married couple who adopted them); the
  // rest of the tree is derived. Unanswered adoption requests live apart and expire on their own. Surnames are per person.
  db.exec(`
    CREATE TABLE IF NOT EXISTS familia_hijos (
      hijo TEXT PRIMARY KEY,
      padre_a TEXT NOT NULL,
      padre_b TEXT NOT NULL,
      desde INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_familia_padre_a ON familia_hijos (padre_a)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_familia_padre_b ON familia_hijos (padre_b)`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS solicitudes_adopcion (
      hijo TEXT PRIMARY KEY,
      padre_a TEXT NOT NULL,
      padre_b TEXT NOT NULL,
      chat TEXT DEFAULT "",
      costo INTEGER DEFAULT 0,
      fecha INTEGER NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS apellidos (
      lid TEXT PRIMARY KEY,
      apellido TEXT NOT NULL,
      desde INTEGER NOT NULL
    )
  `);

  // Migration: the nickname Claudia uses for each person (bought in the shop)
  if (!columnasUsers.some((c) => c.name === "apodo")) {
    db.exec(`ALTER TABLE users ADD COLUMN apodo TEXT DEFAULT ""`);
    console.log("🟢 Migración: columna 'apodo' agregada a la tabla users");
  }

  // Migration: warnings used to be a single count across every group (users.warn), so two warnings in one group and
  // one in another ended up kicking the person from the second. They move to inGroup[chat].warn, copied to every group
  // the person is in: that's where the old counter already applied, so nobody ends up closer to a kick than before.
  const conAdvertencias = db.prepare(`SELECT lid, warn, inGroup FROM users WHERE warn > 0`).all();
  if (conAdvertencias.length) {
    db.transaction(() => {
      for (const u of conAdvertencias) {
        let grupos;
        try {
          grupos = JSON.parse(u.inGroup || "{}");
        } catch {
          grupos = {};
        }
        for (const chat of Object.keys(grupos)) grupos[chat] = { ...grupos[chat], warn: u.warn };
        db.prepare(`UPDATE users SET inGroup = ?, warn = 0 WHERE lid = ?`).run(JSON.stringify(grupos), u.lid);
      }
    })();
    console.log(`🟢 Migración: advertencias de ${conAdvertencias.length} usuario(s) pasadas al formato por grupo`);
  }

  return db;
}

// Called on every message
export function initDataDB(m) {
  const chatJid = m.chat;
  const botJid = client?.user?.lid;
  const pushName = m?.pushName || "";

  // Make sure the user's default data exists
  db.prepare(`INSERT OR IGNORE INTO users (lid, jid, pushName) VALUES (?, ?, ?)`).run(m.sender, m.senderJid, pushName);

  // Make sure the chat's default data exists
  db.prepare(`INSERT OR IGNORE INTO chats (remoteJid) VALUES (?)`).run(chatJid);

  // Make sure the bot's default settings exist
  db.prepare(`INSERT OR IGNORE INTO settings (botJid) VALUES (?)`).run(botJid);
}

// Get a user's data
export function getUser(userId, chatJid = null) {
  let lidJid;
  if (userId.endsWith("@lid")) {
    lidJid = "lid";
  } else {
    lidJid = "jid";
  }
  const row = db.prepare(`SELECT * FROM users WHERE ${lidJid} = ?`).get(userId);
  if (!row) return null;

  // Parse the JSON
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

      updateUser(userId, {
        inGroup: JSON.stringify(row.inGroup),
      });
    }
  }

  return row;
}

// Get a chat's data
export function getChat(jid) {
  return db.prepare(`SELECT * FROM chats WHERE remoteJid = ?`).get(jid) || null;
}

// Get the bot's settings
export function getBotSettings(botJid) {
  return db.prepare(`SELECT * FROM settings WHERE botJid = ?`).get(botJid) || null;
}

// Update pushName, jid and timestamp on the user's row.
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
  // Group notices and some message types come without a pushName: don't overwrite the stored name with null.
  if (newPush) datos.pushName = newPush;
  updateUser(lid, datos);
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
// Takes a LID or a number, like getUser: it used to filter by lid always, so with a number the UPDATE matched no
// row and nobody noticed.
export function updateUser(userId, data) {
  return updateRow("users", String(userId).endsWith("@lid") ? "lid" : "jid", userId, data);
}

// A person's data inside one particular group (users.inGroup), merged with whatever they already had.
export function updateUserInGroup(userId, chat, data) {
  const row = getUser(userId);
  if (!row) return false;
  const inGroup = { ...row.inGroup, [chat]: { ...(row.inGroup[chat] || {}), ...data } };
  return updateUser(userId, { inGroup: JSON.stringify(inGroup) });
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
// LID only if it is known now: a null lid does not overwrite the stored one.
export function addToBlacklist(jid, reason, addedBy, chat = "*", lid = null) {
  db.prepare(
    `INSERT INTO lista_negra (chat, jid, lid, reason, dateAdded, addedBy) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat, jid) DO UPDATE SET reason = excluded.reason, lid = COALESCE(excluded.lid, lista_negra.lid)`,
  ).run(chat, jid, lid || null, reason, Date.now(), addedBy);
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
export function isBlacklisted(id, chat = "*") {
  const ids = (Array.isArray(id) ? id : [id]).filter(Boolean);
  if (ids.length === 0) return null;
  const marcadores = ids.map(() => "?").join(", ");
  return (
    db
      .prepare(
        `SELECT * FROM lista_negra WHERE (jid IN (${marcadores}) OR lid IN (${marcadores})) AND chat IN (?, '*') ORDER BY CASE WHEN chat = '*' THEN 1 ELSE 0 END LIMIT 1`,
      )
      .get(...ids, ...ids, chat) || null
  );
}

// a group's entries plus the global ones; with no chat, every entry of every group
export function getBlacklist(chat = null) {
  if (!chat) return db.prepare(`SELECT * FROM lista_negra ORDER BY dateAdded ASC`).all();
  return db.prepare(`SELECT * FROM lista_negra WHERE chat IN (?, '*') ORDER BY dateAdded ASC`).all(chat);
}

// total number of users in the users table
export function getTotalUsers() {
  const row = db.prepare("SELECT COUNT(*) AS total FROM users").get();
  return row?.total || 0;
}

// every user in the users table
export function getAllUsers() {
  const rows = db.prepare(`SELECT * FROM users`).all();

  // Parse the JSON for each user
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

// delete a user entirely from the users table
export function deleteUser(lid) {
  return db.prepare(`DELETE FROM users WHERE lid = ?`).run(lid);
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

// the top 5 "most voted" (received) and "most active" (given) of a chat, for a given month.
// a person's place in the month's ranking by reactions received (1 = most voted); null if they have none
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

// Does this identifier (lid or jid) belong to a bot owner? Owners are configured by phone number, but in groups
// participants arrive as @lid, so the owner's lid is resolved through the users table.
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

// total earned TODAY from reasons starting with a prefix (say "reaccion_") — for the daily cap
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

// a person's place in the group's balance ranking (1 = richest; ties share a place); null if they have no coins
export function puestoCoins(chat, usuario) {
  const saldo = getSaldoCoins(chat, usuario);
  if (saldo <= 0) return null;
  return db.prepare(`SELECT COUNT(*) + 1 AS puesto FROM urucoins WHERE chat = ? AND saldo > ?`).get(chat, saldo).puesto;
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

// groups with an activity switch on (known columns only, so no SQL is built from free text)
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

// ===================== Economy (.economia) =====================

export function totalEnCirculacion(chat) {
  return db.prepare(`SELECT COALESCE(SUM(saldo), 0) AS total, COUNT(*) AS personas FROM urucoins WHERE chat = ? AND saldo > 0`).get(chat);
}

// money in and out by reason since a given date
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

// ===================== Per-group bot roles =====================
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
  return db.prepare(`SELECT remoteJid, horarioGrupo, grupoCerradoPorHorario FROM chats WHERE horarioGrupo != ''`).all();
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
// Moves the couple/coupleTime/married/marriedTime/couplesHistory columns from users into the new tables. Runs once,
// when the parejas table is first created. Mutual pointers are couples; one-sided ones are pending requests.
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
