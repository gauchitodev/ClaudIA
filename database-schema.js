// The database's tables, and the migrations that bring an older file up to them: what loadDatabase
// (database-functions.js) does to the file each start, right after opening it. It was a third of that file, and apart
// from the rest of it: this runs once a start, and the rest there on every message.
export function ponerAlDia(db) {
  // What's erased or written over (a .memoria olvidame, a post taken down, each rewrite of someone's data in a group)
  // is overwritten with zeros right away. SQLite only marks that space as free (its docs: secure_delete), and the text
  // stayed in the file, and in the backups that copy it whole, until something happened to write over it. It costs
  // nothing noticeable: each write's time goes into saving it to disk.
  db.exec(`PRAGMA secure_delete = ON`);

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
      timestamp INTEGER,
      apodo TEXT DEFAULT ""
    )
  `);

  // Migration: if the users table already existed without the "memoria" column, add it.
  const columnasUsers = db.prepare(`PRAGMA table_info(users)`).all();
  if (!columnasUsers.some((c) => c.name === "memoria")) {
    db.exec(`ALTER TABLE users ADD COLUMN memoria TEXT DEFAULT ""`);
    console.log("🟢 Migración: columna 'memoria' agregada a la tabla users");
  }
  // Looking someone up by number (users.jid) used to scan the whole table, and a few things do it for each member of a
  // group (lib/identidad.js, .inactivos).
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_jid ON users (jid)`);
  // users.memoria held what Claudia learned of each person before 3.4: one memory for the whole bot, with what people
  // told her in private. Since then it's kept per group (lib/memoria-persona.js) and nothing reads or writes this
  // column, so what's left in it is erased, once. secure_delete (on since the database was opened, above) zeroes the
  // values as they're erased; VACUUM rebuilds the file without the older versions left behind each time a memory was
  // rewritten, back when erasing only marked the space as free, and the daily copies and the one sent to the owner
  // carry the file whole. If VACUUM can't run (it needs room for a copy of the file, and Android may kill the bot
  // halfway), the bot starts anyway, and it's owed until it works: mantenimiento_pendiente keeps it from one start to
  // the next, since the column is already empty by then.
  db.exec(`CREATE TABLE IF NOT EXISTS mantenimiento_pendiente (tarea TEXT PRIMARY KEY)`);
  const conMemoriaVieja = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE memoria != ''`).get().n;
  if (conMemoriaVieja > 0) {
    // Erased and owed together, or neither: as two writes, a bot killed in between was left with the column empty and
    // nothing owed, and never compacted.
    db.transaction(() => {
      db.prepare(`UPDATE users SET memoria = '' WHERE memoria != ''`).run();
      db.prepare(`INSERT OR IGNORE INTO mantenimiento_pendiente (tarea) VALUES ('vacuum-memoria-vieja')`).run();
    })();
  }
  if (db.prepare(`SELECT 1 FROM mantenimiento_pendiente WHERE tarea = 'vacuum-memoria-vieja'`).get()) {
    const inicio = Date.now();
    const que = conMemoriaVieja > 0 ? `borrada la memoria vieja de ${conMemoriaVieja} persona(s) (users.memoria)` : "borrada la memoria vieja (users.memoria) en un arranque anterior";
    try {
      db.exec(`VACUUM`);
      // After VACUUM, and not before: if the bot dies in between, the next start compacts once more.
      db.prepare(`DELETE FROM mantenimiento_pendiente WHERE tarea = 'vacuum-memoria-vieja'`).run();
      console.log(`🟢 Migración: ${que}, y compactada la base, en ${Date.now() - inicio} ms`);
    } catch (e) {
      console.error(`🟠 Migración: ${que}, pero no pude compactar la base (${e.message}): versiones viejas siguen en el archivo, lo vuelvo a intentar en el próximo arranque`);
    }
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
      grupoCerradoPorHorario BOOLEAN DEFAULT 0,
      iniciativa BOOLEAN DEFAULT 0,
      horarioGrupoFalla INTEGER DEFAULT 0,
      antiLiveLocation BOOLEAN DEFAULT 0
    )
  `);

  // Migration: activity switches (daily question, lightning trivia, weekly recap), game hours, the marketplace mode
  // switches (chat, greetings, coins, promotions), Claudia's initiative, since when the group hours can't be kept
  // (lib/horario-grupo.js) and whether a live location is deleted (.antiubicacion), on databases that already exist.
  const columnasChats = db.prepare(`PRAGMA table_info(chats)`).all().map((c) => c.name);
  for (const [columna, definicion] of [["preguntaDia", "BOOLEAN DEFAULT 0"], ["triviaRelampago", "BOOLEAN DEFAULT 0"], ["recapSemanal", "BOOLEAN DEFAULT 1"], ["horarioJuegos", 'TEXT DEFAULT ""'], ["charla", "BOOLEAN DEFAULT 1"], ["saludos", "BOOLEAN DEFAULT 1"], ["monedas", "BOOLEAN DEFAULT 1"], ["ascensos", "BOOLEAN DEFAULT 1"], ["reglas", 'TEXT DEFAULT ""'], ["plantilla", 'TEXT DEFAULT ""'], ["horarioGrupo", 'TEXT DEFAULT ""'], ["grupoCerradoPorHorario", "BOOLEAN DEFAULT 0"], ["casino", "BOOLEAN DEFAULT 1"], ["iniciativa", "BOOLEAN DEFAULT 0"], ["horarioGrupoFalla", "INTEGER DEFAULT 0"], ["antiLiveLocation", "BOOLEAN DEFAULT 0"]]) {
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
  // Migration: the old blacklist was a single list for every group;
  // its entries move to "*" and the old table is dropped.
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
      fecha INTEGER NOT NULL,
      reacciones INTEGER DEFAULT 0
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

  // Each one's trade in each group (.laburos, lib/laburos.js): it used to be created there, the first time it was used.
  db.exec(`
    CREATE TABLE IF NOT EXISTS laburos (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      laburo TEXT NOT NULL,
      desde INTEGER NOT NULL,
      ultimo_cobro TEXT DEFAULT '',
      cobros INTEGER DEFAULT 0,
      PRIMARY KEY (chat, usuario)
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
      creado INTEGER NOT NULL,
      intentos INTEGER DEFAULT 0
    )
  `);
  // Migration: failed attempts, for pending tables that already exist (lib/pendientes.js retries a few times).
  if (!db.prepare(`PRAGMA table_info(pendientes)`).all().some((c) => c.name === "intentos")) {
    db.exec(`ALTER TABLE pendientes ADD COLUMN intentos INTEGER DEFAULT 0`);
    console.log("🟢 Migración: columna 'intentos' agregada a pendientes");
  }

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
  // Group activity by hour: how much the group talks and when. Unlike actividad_diaria, which only counts
  // conversation per person for the streak, this counts every message people send —commands, stickers, one-word
  // replies— because "how many messages were there yesterday" means all of them. 24 rows per day and group.
  db.exec(`
    CREATE TABLE IF NOT EXISTS actividad_horaria (
      chat TEXT NOT NULL,
      fecha TEXT NOT NULL,
      hora INTEGER NOT NULL,
      mensajes INTEGER DEFAULT 0,
      PRIMARY KEY (chat, fecha, hora)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_actividad_horaria_fecha ON actividad_horaria (fecha)`); // so .podar doesn't scan the whole table
  // What the bot itself sends (lib/envios.js), by chat, day, hour and kind. Private chats share a single "privado" row.
  db.exec(`
    CREATE TABLE IF NOT EXISTS envios_bot (
      chat TEXT NOT NULL,
      fecha TEXT NOT NULL,
      hora INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      mensajes INTEGER DEFAULT 0,
      PRIMARY KEY (chat, fecha, hora, tipo)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_envios_bot_fecha ON envios_bot (fecha)`);
  // The commands people use (lib/usos.js), by chat, day and command as typed: what the menu's "lo más usado" and .usos
  // are built from. Private chats share a single "privado" row, like envios_bot.
  db.exec(`
    CREATE TABLE IF NOT EXISTS usos_comandos (
      chat TEXT NOT NULL,
      fecha TEXT NOT NULL,
      comando TEXT NOT NULL,
      usos INTEGER DEFAULT 0,
      PRIMARY KEY (chat, fecha, comando)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usos_comandos_fecha ON usos_comandos (fecha)`);
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

  // Claudia's initiative (lib/iniciativa.js): per group, how far she has read, when she glances next, whether she was
  // told to be quiet, and the day's counters. intervenciones is what she said or did in a group: her replies when
  // named ("charla") and what she did on her own (reactions, quoted replies, comments), with whether anyone answered.
  db.exec(`
    CREATE TABLE IF NOT EXISTS iniciativa_estado (
      chat TEXT PRIMARY KEY,
      ultimoVistazo INTEGER DEFAULT 0,
      proximoVistazo INTEGER DEFAULT 0,
      motivoProximo TEXT DEFAULT "",
      silencioHasta INTEGER DEFAULT 0,
      silencioMotivo TEXT DEFAULT "",
      dia TEXT DEFAULT "",
      vistazos INTEGER DEFAULT 0,
      llamadas INTEGER DEFAULT 0
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS intervenciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat TEXT NOT NULL,
      fecha INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      mensajeId TEXT,
      objetivoId TEXT,
      objetivoUsuario TEXT,
      texto TEXT DEFAULT "",
      motivo TEXT DEFAULT "",
      respondida INTEGER DEFAULT 0,
      reaccionada INTEGER DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_intervenciones_chat_fecha ON intervenciones (chat, fecha)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_intervenciones_mensaje ON intervenciones (chat, mensajeId)`);

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
  // rest of the tree is derived. Unanswered adoption requests live apart and expire on their own. Surnames are per
  // person.
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
  // Presence in each group, for .inactivos (lib/inactivos.js): when someone came in, their last message of any kind
  // and when .inactivos warned them (null once they write again). By any id the person may come under, like the
  // roles: a join may bring only the number and a message only the LID. actividad_diaria can't tell when someone last
  // wrote: it only counts conversation (two words or more), and only since 2/9. Under a number, whose the warning is
  // (aviso_de): the LID it went along with, or "" when it went there alone (avisoSuyo, database-functions.js).
  db.exec(`
    CREATE TABLE IF NOT EXISTS presencia_grupo (
      chat TEXT NOT NULL,
      usuario TEXT NOT NULL,
      ingreso INTEGER,
      ultimo_mensaje INTEGER,
      avisado INTEGER,
      aviso_de TEXT,
      PRIMARY KEY (chat, usuario)
    )
  `);
  // Migration: aviso_de on presence tables that already exist. Their warnings are left without it (null), and under a
  // number those count only for whoever the bot knows by nothing else.
  if (!db.prepare(`PRAGMA table_info(presencia_grupo)`).all().some((c) => c.name === "aviso_de")) {
    db.exec(`ALTER TABLE presencia_grupo ADD COLUMN aviso_de TEXT`);
    console.log("🟢 Migración: columna 'aviso_de' agregada a presencia_grupo");
  }
  // Since when the bot keeps track of who writes in each group: the first message or join it noted there. Before that,
  // nobody can be told apart from someone silent, so lib/inactivos.js counts everyone as seen that day at the latest.
  // .inactivos used to go by the first time the bot had seen someone write: whoever sent only stickers, audios or
  // one-word messages came out silent for months right after the update. The warnings it gave then are dropped, once.
  const habiaInicio = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'presencia_inicio'`).get();
  db.exec(`CREATE TABLE IF NOT EXISTS presencia_inicio (chat TEXT PRIMARY KEY, desde INTEGER NOT NULL)`);
  if (!habiaInicio) db.prepare(`UPDATE presencia_grupo SET avisado = NULL WHERE avisado IS NOT NULL`).run();
  // When each group was closed (only the admins write), from when to when, in ms; hasta is null while it still is. That
  // time doesn't count for .inactivos, since nobody else could write then (lib/inactivos.js).
  db.exec(`CREATE TABLE IF NOT EXISTS cierres_grupo (chat TEXT NOT NULL, desde INTEGER NOT NULL, hasta INTEGER)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cierres_grupo_chat ON cierres_grupo (chat)`);

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
}

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
