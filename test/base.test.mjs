import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

const G = "grupo@g.us";
globalThis.owners = ["59899111222"];
globalThis.client = { user: { lid: "bot@lid" } };

test("migra una base con el esquema viejo (sin apodo, sin interruptores, lista negra global)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-migracion-"));
  process.chdir(dir);
  fs.mkdirSync("database");
  const vieja = new Database("./database/database.db");
  vieja.exec(`CREATE TABLE users (lid TEXT PRIMARY KEY, jid TEXT, pushName TEXT, banned BOOLEAN DEFAULT 0, couple TEXT DEFAULT "", coupleTime INTEGER DEFAULT -1, couplesHistory TEXT DEFAULT "[]", commandAttempts INTEGER DEFAULT 0, inGroup TEXT DEFAULT "{}", lastmining INTEGER DEFAULT 0, married TEXT DEFAULT "", marriedTime INTEGER DEFAULT -1, mute BOOLEAN DEFAULT 0, warn INTEGER DEFAULT 0, timestamp INTEGER)`);
  vieja.exec(`CREATE TABLE chats (remoteJid TEXT PRIMARY KEY, adminMode BOOLEAN DEFAULT 0, adultMode BOOLEAN DEFAULT 0, antiStatus BOOLEAN DEFAULT 0, antiGroups BOOLEAN DEFAULT 1, antiChannels BOOLEAN DEFAULT 1, antiInstagram BOOLEAN DEFAULT 0, antiTiktok BOOLEAN DEFAULT 0, antiTelegram BOOLEAN DEFAULT 0, allAntiLinks BOOLEAN DEFAULT 0, audios BOOLEAN DEFAULT 0, detect BOOLEAN DEFAULT 1, antiDelete BOOLEAN DEFAULT 0, games BOOLEAN DEFAULT 1, isBanned BOOLEAN DEFAULT 0, mentions BOOLEAN DEFAULT 1, reactions BOOLEAN DEFAULT 0, welcome BOOLEAN DEFAULT 0, blacklistMode BOOLEAN DEFAULT 0)`);
  vieja.exec(`CREATE TABLE blacklist (jid TEXT PRIMARY KEY, reason TEXT, dateAdded INTEGER, addedBy TEXT)`);
  vieja.prepare(`INSERT INTO blacklist VALUES (?, ?, ?, ?)`).run("111@s.whatsapp.net", "spam", 1700000000000, "owner@s.whatsapp.net");
  vieja.prepare(`INSERT INTO chats (remoteJid) VALUES (?)`).run(G);
  vieja.close();

  const F = await import("../database-functions.js");
  globalThis.db = F.loadDatabase();
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  assert.ok(cols("users").includes("memoria") && cols("users").includes("apodo"));
  assert.ok(["preguntaDia", "triviaRelampago", "recapSemanal", "horarioJuegos", "charla", "saludos", "monedas", "ascensos", "reglas", "plantilla", "horarioGrupo", "grupoCerradoPorHorario", "iniciativa"].every((c) => cols("chats").includes(c)));
  assert.equal(db.prepare(`SELECT monedas FROM chats WHERE remoteJid = ?`).get(G).monedas, 1, "economía prendida al migrar");
  assert.equal(db.prepare(`SELECT horarioJuegos FROM chats WHERE remoteJid = ?`).get(G).horarioJuegos, "", "sin horario de juegos al migrar");
  assert.equal(db.prepare(`SELECT recapSemanal FROM chats WHERE remoteJid = ?`).get(G).recapSemanal, 1);
  assert.equal(db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'blacklist'`).get(), undefined);
  assert.equal(F.getBlacklist().length, 1);
  assert.equal(F.getBlacklist()[0].chat, "*");
  assert.equal(F.isBlacklisted("111@s.whatsapp.net", G)?.reason, "spam");
  assert.ok(cols("hashtag_entries").includes("reacciones"));
  const tablas = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((t) => t.name);
  for (const t of ["urucoins", "urucoins_log", "inventario", "pendientes", "loteria_boletos", "mercados", "apuestas_mercado", "cumpleanos", "actividad_diaria", "actividad_horaria", "envios_bot", "rachas", "preguntas_dia", "periodos_cerrados", "lista_negra", "memoria_grupo", "roles_grupo", "publicaciones", "alertas_compraventa", "calificaciones", "iniciativa_estado", "intervenciones"]) assert.ok(tablas.includes(t), `falta la tabla ${t}`);
  const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM users WHERE jid = ?`).all("x").map((f) => f.detail).join(" ");
  assert.match(plan, /idx_users_jid/, "buscar a alguien por número no recorre la tabla entera");
  globalThis.db = F.loadDatabase(); // idempotente
  fs.rmSync(dir, { recursive: true, force: true });
});

test("lista negra por grupo y global", async () => {
  const { prepararBase } = await import("./helpers.mjs");
  const { F } = await prepararBase("listanegra");
  const H = "otro@g.us";
  F.addToBlacklist("333@s.whatsapp.net", "pesado", "admin@s.whatsapp.net", G);
  F.addToBlacklist("444@s.whatsapp.net", "global", "owner@s.whatsapp.net");
  assert.equal(F.isBlacklisted("333@s.whatsapp.net", G).reason, "pesado");
  assert.equal(F.isBlacklisted("333@s.whatsapp.net", H), null);
  assert.equal(F.isBlacklisted("444@s.whatsapp.net", H).chat, "*");
  assert.equal(F.getBlacklist(G).length, 2);
  assert.equal(F.getBlacklist(H).length, 1);
  const antes = F.isBlacklisted("333@s.whatsapp.net", G);
  F.addToBlacklist("333@s.whatsapp.net", "más pesado", "otro@s.whatsapp.net", G);
  const despues = F.isBlacklisted("333@s.whatsapp.net", G);
  assert.equal(despues.reason, "más pesado");
  assert.equal(despues.dateAdded, antes.dateAdded);
  assert.equal(despues.addedBy, antes.addedBy);
  assert.equal(F.removeFromBlacklist("333@s.whatsapp.net", G), true);
  assert.equal(F.removeFromBlacklist("333@s.whatsapp.net", G), false);
  assert.equal(F.removeFromBlacklist("444@s.whatsapp.net", G), false, "sacar de un grupo no toca la global");
  assert.ok(F.isBlacklisted("444@s.whatsapp.net", G));
});

test("migra una lista negra sin la columna lid y guarda el LID cuando se lo descubre", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-lid-"));
  process.chdir(dir);
  fs.mkdirSync("database");
  const vieja = new Database("./database/database.db");
  vieja.exec(`CREATE TABLE lista_negra (chat TEXT NOT NULL, jid TEXT NOT NULL, reason TEXT, dateAdded INTEGER, addedBy TEXT, PRIMARY KEY (chat, jid))`);
  vieja.prepare(`INSERT INTO lista_negra VALUES (?, ?, ?, ?, ?)`).run(G, "111@s.whatsapp.net", "spam", 1700000000000, "admin@s.whatsapp.net");
  vieja.close();

  const F = await import("../database-functions.js");
  globalThis.db = F.loadDatabase();
  assert.ok(db.prepare(`PRAGMA table_info(lista_negra)`).all().some((c) => c.name === "lid"), "se agregó la columna lid");
  assert.equal(F.isBlacklisted("111@s.whatsapp.net", G).reason, "spam", "la entrada vieja sigue valiendo");
  assert.equal(F.isBlacklisted("111@s.whatsapp.net", G).lid, null);

  // Once recognized in a group their LID is stored, and from then on either one finds them.
  assert.equal(F.recordarLidEnListaNegra(G, "111@s.whatsapp.net", "111@lid"), true);
  assert.equal(F.isBlacklisted("111@lid", G).reason, "spam");
  assert.equal(F.recordarLidEnListaNegra(G, "111@s.whatsapp.net", "otro@lid"), false, "no pisa un LID ya guardado");
  assert.equal(F.isBlacklisted("111@s.whatsapp.net", G).lid, "111@lid");

  // Updating the reason doesn't wipe the LID.
  F.addToBlacklist("111@s.whatsapp.net", "sigue", "admin@s.whatsapp.net", G);
  assert.equal(F.isBlacklisted("111@s.whatsapp.net", G).lid, "111@lid");
  assert.equal(F.removeFromBlacklist("111@lid", G), true, "se puede sacar por LID");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("migra publicaciones sin la columna mensajeBot y encuentra la publicación por cualquiera de sus mensajes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-mensajebot-"));
  process.chdir(dir);
  fs.mkdirSync("database");
  const vieja = new Database("./database/database.db");
  vieja.exec(`CREATE TABLE publicaciones (id INTEGER PRIMARY KEY AUTOINCREMENT, chat TEXT NOT NULL, numero INTEGER NOT NULL, usuario TEXT NOT NULL, tipo TEXT NOT NULL, texto TEXT NOT NULL, precio TEXT DEFAULT "", messageId TEXT, estado TEXT DEFAULT "activa", creada INTEGER NOT NULL, actualizada INTEGER NOT NULL, aviso INTEGER DEFAULT 0, UNIQUE (chat, numero))`);
  vieja.prepare(`INSERT INTO publicaciones (chat, numero, usuario, tipo, texto, messageId, creada, actualizada) VALUES (?, 1, ?, 'vendo', 'bici', 'MSGVIEJO', ?, ?)`).run(G, "111@lid", 1700000000000, 1700000000000);
  vieja.close();

  const F = await import("../database-functions.js");
  globalThis.db = F.loadDatabase();
  assert.ok(db.prepare(`PRAGMA table_info(publicaciones)`).all().some((c) => c.name === "mensajeBot"), "se agregó la columna mensajeBot");
  assert.equal(F.getPublicacion(G, 1).texto, "bici", "la publicación vieja sigue estando");

  // It's found by the person's message, and afterwards by the bot's confirmation too.
  assert.equal(F.getPublicacionPorMensaje(G, "MSGVIEJO").numero, 1);
  assert.equal(F.getPublicacionPorMensaje(G, "NOEXISTE"), null);
  assert.equal(F.getPublicacionPorMensaje(G, null), null);
  F.actualizarPublicacion(G, 1, { mensajeBot: "MSGBOT" });
  assert.equal(F.getPublicacionPorMensaje(G, "MSGBOT").numero, 1);
  assert.equal(F.getPublicacionPorMensaje("otro@g.us", "MSGBOT"), null, "no se cruza entre grupos");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("migra las advertencias globales al formato por grupo", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-warn-"));
  process.chdir(dir);
  fs.mkdirSync("database");
  const H = "otro@g.us";
  const vieja = new Database("./database/database.db");
  vieja.exec(`CREATE TABLE users (lid TEXT PRIMARY KEY, jid TEXT, pushName TEXT, banned BOOLEAN DEFAULT 0, couple TEXT DEFAULT "", coupleTime INTEGER DEFAULT -1, couplesHistory TEXT DEFAULT "[]", commandAttempts INTEGER DEFAULT 0, inGroup TEXT DEFAULT "{}", lastmining INTEGER DEFAULT 0, married TEXT DEFAULT "", marriedTime INTEGER DEFAULT -1, mute BOOLEAN DEFAULT 0, warn INTEGER DEFAULT 0, timestamp INTEGER)`);
  // They were in two groups with 2 warnings that applied in both, and someone with no groups had a loose one.
  vieja.prepare(`INSERT INTO users (lid, jid, inGroup, warn) VALUES (?, ?, ?, 2)`).run("111@lid", "111@s.whatsapp.net", JSON.stringify({ [G]: { mute: false, messageCount: 7 }, [H]: {} }));
  vieja.prepare(`INSERT INTO users (lid, jid, inGroup, warn) VALUES (?, ?, '{}', 1)`).run("222@lid", "222@s.whatsapp.net");
  vieja.close();

  const F = await import("../database-functions.js");
  globalThis.db = F.loadDatabase();

  assert.equal(F.advertenciasDe("111@lid", G), 2, "la cuenta vieja vale en cada grupo donde estaba");
  assert.equal(F.advertenciasDe("111@lid", H), 2);
  assert.equal(F.getUser("111@lid").inGroup[G].messageCount, 7, "no se pisó el resto de inGroup");
  assert.equal(db.prepare(`SELECT warn FROM users WHERE lid = ?`).get("111@lid").warn, 0, "la columna vieja queda vacía");

  // Idempotente: volver a cargar no vuelve a sumar nada.
  globalThis.db = F.loadDatabase();
  assert.equal(F.advertenciasDe("111@lid", G), 2);

  // And from here on each group keeps its own.
  F.setAdvertencias("111@lid", G, 3);
  assert.equal(F.advertenciasDe("111@lid", G), 3);
  assert.equal(F.advertenciasDe("111@lid", H), 2);
  assert.deepEqual(F.advertidos(H), [{ lid: "111@lid", chat: H, warn: 2 }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

// What Claudia learned of each person before 3.4 was one memory for the whole bot, with what people told her in private.
// It's kept per group now, and the old column is erased once: from the file too, where SQLite leaves erased text (an
// older version, rewritten since, here in pages it freed) and the backups carry it.
test("borra la memoria vieja de todo el bot, una vez, sin dejar rastro en el archivo, y deja la de cada grupo", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-memoria-vieja-"));
  process.chdir(dir);
  fs.mkdirSync("database");
  const vieja = new Database("./database/database.db");
  vieja.exec(`CREATE TABLE users (lid TEXT PRIMARY KEY, jid TEXT, pushName TEXT, banned BOOLEAN DEFAULT 0, couple TEXT DEFAULT "", coupleTime INTEGER DEFAULT -1, couplesHistory TEXT DEFAULT "[]", commandAttempts INTEGER DEFAULT 0, inGroup TEXT DEFAULT "{}", lastmining INTEGER DEFAULT 0, married TEXT DEFAULT "", marriedTime INTEGER DEFAULT -1, mute BOOLEAN DEFAULT 0, warn INTEGER DEFAULT 0, memoria TEXT DEFAULT "", timestamp INTEGER)`);
  vieja.prepare(`INSERT INTO users (lid, jid, inGroup) VALUES (?, ?, ?)`).run("111@lid", "111@s.whatsapp.net", JSON.stringify({ [G]: { memoria: "le gusta el mate", messageCount: 7 } }));
  vieja.prepare(`INSERT INTO users (lid, jid) VALUES (?, ?)`).run("222@lid", "222@s.whatsapp.net");
  vieja.prepare(`UPDATE users SET memoria = ? WHERE lid = ?`).run(`sale con Pedro a escondidas ${"y lo cuenta todo ".repeat(400)}`, "111@lid");
  vieja.prepare(`UPDATE users SET memoria = ? WHERE lid = ?`).run("le debe plata al banco", "111@lid");
  vieja.close();
  const rastros = () => ["sale con Pedro", "le debe plata"].filter((t) => fs.readFileSync("./database/database.db").includes(t));
  assert.deepEqual(rastros(), ["sale con Pedro", "le debe plata"], "las dos versiones están en el archivo antes");

  const F = await import("../database-functions.js");
  const logReal = console.log;
  const logs = [];
  console.log = (...partes) => logs.push(partes.join(" "));
  try {
    globalThis.db = F.loadDatabase();
    assert.deepEqual(db.prepare(`SELECT lid, memoria FROM users ORDER BY lid`).all(), [{ lid: "111@lid", memoria: "" }, { lid: "222@lid", memoria: "" }]);
    assert.equal(F.getUser("111@lid").inGroup[G].memoria, "le gusta el mate", "lo de cada grupo queda");
    assert.deepEqual(rastros(), [], "ni en el archivo");
    assert.equal(db.prepare(`PRAGMA secure_delete`).get().secure_delete, 1, "y lo que se borre de acá en más se pisa con ceros");
    assert.equal(logs.filter((l) => l.includes("memoria vieja")).length, 1);
    globalThis.db = F.loadDatabase(); // idempotente: no hay nada más que borrar
    assert.equal(logs.filter((l) => l.includes("memoria vieja")).length, 1, "una sola vez");
  } finally {
    console.log = logReal;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

// VACUUM needs room for a copy of the file, and Android can kill the bot halfway through it. The column is already
// empty by then, so the next start had nothing telling it the VACUUM was owed: the old memory stayed in the file.
test("si no pudo compactar la base al borrar la memoria vieja, lo vuelve a intentar al arrancar", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-vacuum-"));
  process.chdir(dir);
  fs.mkdirSync("database");
  const vieja = new Database("./database/database.db");
  vieja.exec(`CREATE TABLE users (lid TEXT PRIMARY KEY, jid TEXT, pushName TEXT, banned BOOLEAN DEFAULT 0, couple TEXT DEFAULT "", coupleTime INTEGER DEFAULT -1, couplesHistory TEXT DEFAULT "[]", commandAttempts INTEGER DEFAULT 0, inGroup TEXT DEFAULT "{}", lastmining INTEGER DEFAULT 0, married TEXT DEFAULT "", marriedTime INTEGER DEFAULT -1, mute BOOLEAN DEFAULT 0, warn INTEGER DEFAULT 0, memoria TEXT DEFAULT "", timestamp INTEGER)`);
  vieja.prepare(`INSERT INTO users (lid, jid) VALUES (?, ?)`).run("111@lid", "111@s.whatsapp.net");
  vieja.prepare(`UPDATE users SET memoria = ? WHERE lid = ?`).run(`sale con Pedro a escondidas ${"y lo cuenta todo ".repeat(400)}`, "111@lid");
  vieja.prepare(`UPDATE users SET memoria = ? WHERE lid = ?`).run("le debe plata al banco", "111@lid");
  vieja.close();
  const rastros = () => ["sale con Pedro", "le debe plata"].filter((t) => fs.readFileSync("./database/database.db").includes(t));

  const F = await import("../database-functions.js");
  const execReal = Database.prototype.exec;
  const [logReal, errorReal] = [console.log, console.error];
  const logs = [];
  console.log = console.error = (...partes) => logs.push(partes.join(" "));
  let vacuums = 0;
  let falla = true;
  Database.prototype.exec = function (sql) {
    if (/^\s*VACUUM\s*$/i.test(sql)) {
      vacuums++;
      if (falla) throw new Error("database or disk is full");
    }
    return execReal.call(this, sql);
  };
  try {
    globalThis.db = F.loadDatabase();
    assert.equal(db.prepare(`SELECT memoria FROM users`).get().memoria, "", "la columna queda vacía");
    db.close();
    falla = false;
    globalThis.db = F.loadDatabase();
    assert.equal(vacuums, 2, "al arrancar de nuevo, compacta");
    assert.deepEqual(rastros(), [], "y lo viejo ya no está en el archivo");
    assert.match(logs.join("\n"), /no pude compactar la base \(database or disk is full\)[^\n]*lo vuelvo a intentar en el próximo arranque/, "y la primera vez avisó que lo iba a reintentar");
    db.close();
    globalThis.db = F.loadDatabase();
    assert.equal(vacuums, 2, "una vez que pudo, no lo repite");
  } finally {
    Database.prototype.exec = execReal;
    console.log = logReal;
    console.error = errorReal;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

// Erasing the old memory and writing down the VACUUM it owes were two writes: a bot that Android killed in between was
// left with the column empty and nothing owed, and the next start never compacted. Here the start dies right after the
// erase, the way it would there.
test("si el bot muere entre el borrado de la memoria vieja y la anotación del VACUUM, compacta al arrancar de nuevo", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-vacuum-muerto-"));
  process.chdir(dir);
  fs.mkdirSync("database");
  const vieja = new Database("./database/database.db");
  vieja.exec(`CREATE TABLE users (lid TEXT PRIMARY KEY, jid TEXT, pushName TEXT, banned BOOLEAN DEFAULT 0, couple TEXT DEFAULT "", coupleTime INTEGER DEFAULT -1, couplesHistory TEXT DEFAULT "[]", commandAttempts INTEGER DEFAULT 0, inGroup TEXT DEFAULT "{}", lastmining INTEGER DEFAULT 0, married TEXT DEFAULT "", marriedTime INTEGER DEFAULT -1, mute BOOLEAN DEFAULT 0, warn INTEGER DEFAULT 0, memoria TEXT DEFAULT "", timestamp INTEGER)`);
  vieja.prepare(`INSERT INTO users (lid, jid) VALUES (?, ?)`).run("111@lid", "111@s.whatsapp.net");
  vieja.prepare(`UPDATE users SET memoria = ? WHERE lid = ?`).run(`sale con Pedro a escondidas ${"y lo cuenta todo ".repeat(400)}`, "111@lid");
  vieja.prepare(`UPDATE users SET memoria = ? WHERE lid = ?`).run("le debe plata al banco", "111@lid");
  vieja.close();
  const rastros = () => ["sale con Pedro", "le debe plata"].filter((t) => fs.readFileSync("./database/database.db").includes(t));

  const F = await import("../database-functions.js");
  const prepareReal = Database.prototype.prepare;
  const [logReal, errorReal] = [console.log, console.error];
  console.log = console.error = () => {};
  let muere = true;
  Database.prototype.prepare = function (sql) {
    const st = prepareReal.call(this, sql);
    if (muere && /UPDATE users SET memoria = ''/.test(sql)) {
      const runReal = st.run.bind(st);
      st.run = (...args) => {
        runReal(...args);
        throw new Error("muerto después del borrado");
      };
    }
    return st;
  };
  try {
    assert.throws(() => F.loadDatabase(), /muerto después del borrado/);
    muere = false;
    globalThis.db = F.loadDatabase();
    assert.equal(db.prepare(`SELECT memoria FROM users`).get().memoria, "");
    assert.deepEqual(rastros(), [], "lo viejo ya no está en el archivo");
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM mantenimiento_pendiente`).get().n, 0, "y no queda nada pendiente");
    db.close();
  } finally {
    Database.prototype.prepare = prepareReal;
    console.log = logReal;
    console.error = errorReal;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

// The warnings .inactivos gave before the bot kept track of since when it watches each group came from data it couldn't
// trust: whoever sent only stickers or audios counted as silent since the first time the bot saw them write. They're
// dropped once, when that table is created.
test("los avisos de .inactivos de antes de que el bot anote desde cuándo mira cada grupo se borran, una vez", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-test-avisos-viejos-"));
  process.chdir(dir);
  fs.mkdirSync("database");
  const vieja = new Database("./database/database.db");
  vieja.exec(`CREATE TABLE presencia_grupo (chat TEXT NOT NULL, usuario TEXT NOT NULL, ingreso INTEGER, ultimo_mensaje INTEGER, avisado INTEGER, PRIMARY KEY (chat, usuario))`);
  vieja.prepare(`INSERT INTO presencia_grupo (chat, usuario, ultimo_mensaje, avisado) VALUES (?, ?, ?, ?)`).run("g@g.us", "101@lid", 1000, 5000);
  vieja.close();

  const F = await import("../database-functions.js");
  const logReal = console.log;
  console.log = () => {};
  try {
    globalThis.db = F.loadDatabase();
    assert.deepEqual(db.prepare(`SELECT usuario, ultimo_mensaje, avisado FROM presencia_grupo`).all(), [{ usuario: "101@lid", ultimo_mensaje: 1000, avisado: null }], "lo que escribió queda; el aviso, no");
    F.marcarAvisoInactivo("g@g.us", ["101@lid"], 9000);
    db.close();
    globalThis.db = F.loadDatabase();
    assert.equal(db.prepare(`SELECT avisado FROM presencia_grupo`).get().avisado, 9000, "una sola vez");
    db.close();
  } finally {
    console.log = logReal;
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test("funciones de la base: monedas, pendientes, mercados, actividad, memoria", async () => {
  const { prepararBase } = await import("./helpers.mjs");
  const { F } = await prepararBase("db");
  F.initDataDB({ sender: "u1@lid", senderJid: "59891@s.whatsapp.net", pushName: "Uno", chat: G });
  assert.ok(F.esOwner("59899111222@s.whatsapp.net") && !F.esOwner("u1@lid"));
  assert.equal(F.ganarCoins(G, "u1@lid", 50, "test"), 50);
  assert.ok(F.gastarCoins(G, "u1@lid", 20, "casino_ruleta") && !F.gastarCoins(G, "u1@lid", 100, "x"));
  assert.equal(F.coinsGastadasHoy(G, "u1@lid", "casino_"), 20);
  assert.ok(F.transferirCoins(G, "u1@lid", "u2@lid", 10));
  assert.equal(F.getSaldoCoins(G, "u2@lid"), 10);
  assert.deepEqual(F.totalEnCirculacion(G), { total: 30, personas: 2 });
  assert.equal(F.movimientosPorMotivo(G, 0).find((m) => m.motivo === "casino_ruleta").salidas, 20);
  const pid = F.crearPendiente(G, "u1@lid", "recordatorio", { texto: "x" }, Date.now() - 1000);
  assert.equal(F.pendientesDeUsuario("u1@lid", "recordatorio").length, 1);
  assert.equal(F.tomarPendientesVencidos().length, 1);
  assert.equal(F.tomarPendientesVencidos().length, 0);
  F.cerrarPendiente(pid, "hecho");
  assert.equal(F.contarPendientesPorTipo().length, 0);
  const mid = F.crearMercado(G, "Clásico", ["Peñarol", "Nacional"], Date.now() + 1e6, "u1@lid");
  F.apostarEnMercado(mid, "u1@lid", 0, 20);
  F.apostarEnMercado(mid, "u1@lid", 0, 10);
  assert.equal(F.apuestaEnMercado(mid, "u1@lid").cantidad, 30);
  F.actualizarMercado(mid, { estado: "resuelto", ganadora: 0 });
  assert.equal(F.mercadosResueltosDesde(G, 0).length, 1);
  assert.equal(F.sumarMensajeDiario(G, "u1@lid", "2026-09-03"), 1);
  assert.equal(F.sumarMensajeDiario(G, "u1@lid", "2026-09-03"), 2);
  assert.equal(F.totalMensajesEntre(G, ["2026-09-03"]), 2);
  F.setRacha(G, "u1@lid", 3, "2026-09-03");
  F.setRacha(G, "u1@lid", 1, "2026-09-05");
  assert.equal(F.getRacha(G, "u1@lid").mejor, 3);
  const idm = F.agregarMemoriaGrupo(G, "Fulano llega tarde", "u1@lid");
  assert.equal(F.memoriaGrupo(G).length, 1);
  assert.ok(F.borrarMemoriaGrupo(G, idm) && !F.borrarMemoriaGrupo(G, idm));
  F.setCumple(G, "u1@lid", 14, 3);
  assert.equal(F.cumplesDeHoy(14, 3).length, 1);
  assert.deepEqual(F.chatsConOpcion("nombre_falso"), []);
});

// A number may have more than one row: an old one keyed by the number itself (from before WhatsApp used LIDs, or a
// message that came without the LID) besides the one with the LID, or the LIDs of two people if the number was
// recycled. getUser by number read the oldest one and updateUser by number wrote to all of them: whatever came by number
// copied the old row over the one with the LID. Both go to the same row now, and a message with only the number from
// someone already known adds no row keyed by it.
test("por número se lee y se escribe una sola fila: la de la LID, y si el número cambió de dueño, la del que lo usa", async () => {
  const { prepararBase } = await import("./helpers.mjs");
  const { F } = await prepararBase("filas-por-numero");
  const PN = "59899000555@s.whatsapp.net";
  const fila = db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)");
  fila.run(PN, PN, "Fila vieja", 1);
  fila.run("300000000000551@lid", PN, "Quien tenía el número", 2);
  fila.run("300000000000552@lid", PN, "Quien lo tiene ahora", 3);
  assert.equal(F.getUser(PN).lid, "300000000000552@lid");
  assert.ok(F.updateUser(PN, { apodo: "Tito" }));
  assert.ok(F.updateUserInGroup(PN, G, { warn: 1, messageCount: 7 }));
  F.getUser(PN, "otro@g.us"); // what a message in a new group sets up
  const filas = db.prepare("SELECT lid, apodo, inGroup FROM users WHERE jid = ? ORDER BY rowid").all(PN);
  assert.deepEqual(
    filas.map((f) => [f.lid, f.apodo, Object.keys(JSON.parse(f.inGroup))]),
    [
      [PN, "", []],
      ["300000000000551@lid", "", []],
      ["300000000000552@lid", "Tito", [G, "otro@g.us"]],
    ],
  );
  assert.equal(F.advertenciasDe(PN, G), 1);
  assert.equal(F.enGrupoDe(PN, G).messageCount, 7, "y .inactivos lee la misma");

  const solo = "59899000556@s.whatsapp.net";
  F.initDataDB({ chat: G, sender: "300000000000556@lid", senderJid: solo, pushName: "Uno" });
  F.initDataDB({ chat: G, sender: solo, senderJid: solo, pushName: "Uno" }); // a message with only the number
  assert.deepEqual(db.prepare("SELECT lid FROM users WHERE jid = ?").all(solo), [{ lid: "300000000000556@lid" }]);
});

// The owner is set by number. Whoever had that number before, and wrote where the bot is, kept it on their row and was
// taken for the owner; and the owner who changed numbers, with the new one in config, wasn't, by their LID.
test("esOwner: el número del owner es de quien lo usa ahora", async () => {
  const { prepararBase } = await import("./helpers.mjs");
  const { F } = await prepararBase("owner-numero");
  const OWNER = `${globalThis.owners[0]}@s.whatsapp.net`;
  const [ANTES, DUENO] = ["300000000000771@lid", "300000000000772@lid"];
  const escribe = (sender, senderJid) => {
    const m = { chat: G, sender, senderJid, pushName: "x", isGroup: true };
    F.initDataDB(m);
    F.syncUserInfo(m);
  };
  escribe(ANTES, OWNER); // the number was someone else's
  escribe(DUENO, OWNER); // the owner's now
  assert.deepEqual([F.esOwner(ANTES), F.esOwner(DUENO)], [false, true]);
  const owners = globalThis.owners;
  globalThis.owners = ["59899333444"];
  try {
    escribe(DUENO, "59899333444@s.whatsapp.net");
    assert.equal(F.esOwner(DUENO), true, "con el número nuevo en config");
  } finally {
    globalThis.owners = owners;
  }
});

// What was kept under a number with no LID known follows the person when the number leaves their row: they changed
// numbers, or theirs went to someone else. The blacklist and the bot roles stayed with the number: whoever changed
// numbers was no longer kept out nor protected, and whoever got the number next was removed, or protected, instead.
test("la lista negra y los roles anotados por número siguen a la persona cuando el número cambia", async () => {
  const { prepararBase } = await import("./helpers.mjs");
  const { F } = await prepararBase("sigue-a-la-persona");
  const H = "otro@g.us";
  const [A, B, C, D] = ["300000000000781@lid", "300000000000782@lid", "300000000000783@lid", "300000000000784@lid"];
  const [N, N2, N3] = ["59899000781@s.whatsapp.net", "59899000782@s.whatsapp.net", "59899000783@s.whatsapp.net"];
  const escribe = (sender, senderJid) => {
    const m = { chat: G, sender, senderJid, pushName: "x", isGroup: true };
    F.initDataDB(m);
    F.syncUserInfo(m);
  };
  F.addToBlacklist(N, "estafa", "admin", G); // .ln +598… while the bot didn't know who had it
  F.setRolGrupo(H, N, "mod", "admin"); // .moderador +598…, the same
  escribe(A, N);
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[N, null]], "mientras el número es de A, nada se mueve");
  escribe(A, N2); // A changed numbers
  assert.equal(F.isBlacklisted([A, N2], G)?.reason, "estafa", "a A se la sigue reconociendo");
  assert.equal(F.rolGrupo(H, A), "mod", "y conserva su rol");
  escribe(B, N); // N is B's now
  assert.equal(F.isBlacklisted([B, N], G), null, "B no es A");
  assert.equal(F.rolGrupo(H, B), null);
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[A, A]], "bajo la LID: el número ya no es de A");
  // Listing B by that number leaves A's entry as it was: under the number, it took it over.
  F.addToBlacklist(N, "otra cosa", "admin", G, B);
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid, e.reason]), [[A, A, "estafa"], [N, B, "otra cosa"]]);

  // The number goes to someone else before its owner writes from a new one: what was kept under it is the owner's.
  F.addToBlacklist(N3, "spam", "admin", H);
  F.setRolGrupo(G, N3, "admin", "admin");
  escribe(C, N3);
  escribe(D, N3);
  assert.equal(F.isBlacklisted([D, N3], H), null);
  assert.equal(F.isBlacklisted(C, H)?.reason, "spam");
  assert.deepEqual([F.rolGrupo(G, C), F.rolGrupo(G, D)], ["admin", null]);

  // Listed twice in one group, by LID and by number: when the number leaves, the one by number goes, and whoever gets
  // the number next isn't on the list.
  const [E, Z, N4, N5] = ["300000000000785@lid", "300000000000786@lid", "59899000784@s.whatsapp.net", "59899000785@s.whatsapp.net"];
  F.addToBlacklist(E, "por LID", "admin", G, E);
  F.addToBlacklist(N4, "por número", "admin", G);
  escribe(E, N4);
  escribe(E, N5);
  escribe(Z, N4);
  assert.deepEqual(F.getBlacklist(G).filter((e) => [E, N4].includes(e.jid)).map((e) => [e.jid, e.reason]), [[E, "por LID"]]);
  assert.equal(F.isBlacklisted([Z, N4], G), null);
});

// With two LID rows for one number, from before a number left the other rows, there's no telling whose it was: what was
// kept under it stays with the number. Of two roles in one group, one by LID and one by number, the higher one stays.
test("lo anotado por un número que tenían dos filas queda con el número, y de dos roles queda el más alto", async () => {
  const { prepararBase } = await import("./helpers.mjs");
  const { F } = await prepararBase("sigue-a-la-persona-dudas");
  const [P, Q, R, P2, Q2] = ["300000000000791@lid", "300000000000792@lid", "300000000000793@lid", "300000000000789@lid", "300000000000790@lid"];
  const [N, N2, N3, M] = ["59899000791@s.whatsapp.net", "59899000792@s.whatsapp.net", "59899000793@s.whatsapp.net", "59899000795@s.whatsapp.net"];
  const fila = db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)");
  fila.run(P, N, "P", 1);
  fila.run(Q, N, "Q", 2);
  F.addToBlacklist(N, "estafa", "admin", G);
  F.syncUserInfo({ sender: R, senderJid: N }); // N came with someone else, and two rows had it
  fila.run(P2, N3, "P2", 1);
  fila.run(Q2, N3, "Q2", 2);
  F.addToBlacklist(N3, "spam", "admin", G);
  F.syncUserInfo({ sender: P2, senderJid: N2 }); // P2 changed numbers, and Q2's row had the old one too
  const [U, V, N5] = ["300000000000787@lid", "300000000000788@lid", "59899000787@s.whatsapp.net"];
  fila.run(U, N5, "U", 5);
  fila.run(V, N5, "V", 6);
  F.addToBlacklist(N5, "otra", "admin", G);
  F.syncUserInfo({ sender: U, senderJid: N5 }); // U writes with the number it had, and V's row had it too
  assert.deepEqual(F.getBlacklist(G).map((e) => [e.jid, e.lid]), [[N, null], [N3, null], [N5, null]]);

  const roles = db.prepare("INSERT INTO roles_grupo (chat, usuario, rol, dadoPor, fecha) VALUES (?, ?, ?, ?, ?)");
  const [S, T] = ["300000000000794@lid", "300000000000796@lid"];
  fila.run(S, M, "S", 3);
  roles.run(G, S, "mod", "a", 1);
  roles.run(G, M, "admin", "b", 2);
  roles.run("otro@g.us", S, "admin", "c", 3);
  roles.run("otro@g.us", M, "mod", "d", 4);
  F.syncUserInfo({ sender: T, senderJid: M }); // M is T's now
  assert.deepEqual(db.prepare("SELECT chat, usuario, rol, dadoPor FROM roles_grupo WHERE usuario IN (?, ?, ?) ORDER BY chat").all(S, M, T), [
    { chat: G, usuario: S, rol: "admin", dadoPor: "b" },
    { chat: "otro@g.us", usuario: S, rol: "admin", dadoPor: "c" },
  ]);
});

// An entry with a LID of its own is that person's: by number it only finds someone who brings no LID to tell them
// apart. Someone else with that number, a recycled one, was removed.
test("la lista negra no reconoce por el número a quien trae otra LID", async () => {
  const { prepararBase } = await import("./helpers.mjs");
  const { F } = await prepararBase("lista-negra-otra-lid");
  const [N, X, Y] = ["59899000797@s.whatsapp.net", "300000000000797@lid", "300000000000798@lid"];
  F.addToBlacklist(N, "estafa", "admin", G, X);
  assert.equal(F.isBlacklisted([N, Y], G), null);
  assert.equal(F.isBlacklisted([Y, N], G), null);
  assert.equal(F.isBlacklisted(N, G)?.reason, "estafa", "solo con el número no hay cómo distinguirlos");
  assert.equal(F.isBlacklisted([X, N], G)?.reason, "estafa");
  F.addToBlacklist("59899000799@s.whatsapp.net", "spam", "admin", G);
  assert.equal(F.isBlacklisted([Y, "59899000799@s.whatsapp.net"], G)?.reason, "spam", "una entrada sin LID, por el número");
});

// A LID with a device ("…:12@lid") isn't anybody's row: a notice that came with one took the number off the real row.
test("una LID con el dispositivo no le saca el número a la fila de la persona", async () => {
  const { prepararBase } = await import("./helpers.mjs");
  const { F } = await prepararBase("lid-con-dispositivo");
  const [L, N] = ["300000000000801@lid", "59899000801@s.whatsapp.net"];
  F.initDataDB({ chat: G, sender: L, senderJid: N, pushName: "Ana" });
  F.syncUserInfo({ sender: L, senderJid: N, pushName: "Ana" });
  F.syncUserInfo({ sender: "300000000000801:12@lid", senderJid: N });
  assert.deepEqual(db.prepare("SELECT lid, jid FROM users").all(), [{ lid: L, jid: N }]);

  // A row like that from before, with the number it took: what was kept under the number went to it when the person
  // wrote again, and they were no longer on the list.
  const [L2, N2, CON] = ["300000000000802@lid", "59899000802@s.whatsapp.net", "300000000000802:12@lid"];
  const fila = db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)");
  fila.run(CON, N2, "Beto", 1);
  fila.run(L2, "", "Beto", 2);
  F.addToBlacklist(N2, "estafa", "admin", G);
  F.syncUserInfo({ sender: L2, senderJid: N2, pushName: "Beto" });
  assert.equal(F.isBlacklisted([L2, N2], G)?.reason, "estafa");
  assert.deepEqual(db.prepare("SELECT lid, jid FROM users WHERE lid LIKE '300000000000802%' ORDER BY rowid").all(), [{ lid: CON, jid: "" }, { lid: L2, jid: N2 }]);
});

// An old row keyed by a number, from before LIDs, while a LID row has that number: nobody reads it. When the person
// moved to another number it was "the number's row" again: whatever came with only that number got its ban and its
// silence of back then, and the listings showed it again. It goes once no LID row has the number.
test("la fila vieja de un número se borra cuando ninguna fila con LID tiene ese número", async () => {
  const { prepararBase } = await import("./helpers.mjs");
  const { F } = await prepararBase("fila-vieja-se-va");
  const [L, X, Y] = ["300000000000981@lid", "59899000981@s.whatsapp.net", "59899000989@s.whatsapp.net"];
  const escribe = (sender, senderJid) => {
    const m = { chat: G, sender, senderJid, pushName: "Carla", isGroup: true };
    F.initDataDB(m);
    F.syncUserInfo(m);
  };
  const hayFila = (lid) => Boolean(db.prepare("SELECT 1 FROM users WHERE lid = ?").get(lid));
  escribe(X, X); // the old row, from before LIDs
  db.prepare("UPDATE users SET inGroup = ?, banned = 1 WHERE lid = ?").run(JSON.stringify({ [G]: { warn: 2, messageCount: 40 } }), X);
  escribe(L, X);
  assert.ok(hayFila(X), "mientras la fila con LID tiene el número, la vieja queda");
  escribe(L, Y); // Carla changed to Y
  assert.equal(hayFila(X), false);
  assert.equal(F.getUser(X), null, "por ese número ya no hay nadie");
  assert.deepEqual(F.getAllUsers().map((u) => u.lid), [L]);

  // With two LID rows for the number, from before a number left the other rows, it stays until the last one leaves.
  const [P, Q, Z] = ["300000000000982@lid", "300000000000983@lid", "59899000982@s.whatsapp.net"];
  escribe(Z, Z);
  const fila = db.prepare("INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)");
  fila.run(P, Z, "P", 1);
  fila.run(Q, Z, "Q", 2);
  F.syncUserInfo({ sender: P, senderJid: "59899000983@s.whatsapp.net" }); // P leaves Z, and Q's row still has it
  assert.ok(hayFila(Z));
  F.syncUserInfo({ sender: Q, senderJid: "59899000984@s.whatsapp.net" }); // and then Q
  assert.equal(hayFila(Z), false);
});

// An old row keyed by the number next to the one with the LID, which is the one read and written by number: listed,
// .listaadv showed warnings no one could take off, .listabaneados a ban that no longer applied, and .conteo the same
// person twice. A number with no LID row keeps its own.
test("los listados de todas las filas dejan afuera la fila vieja de un número que ya tiene la de la LID", async () => {
  const { prepararBase } = await import("./helpers.mjs");
  const { F } = await prepararBase("listados-fila-vieja");
  const [N, L, SOLO] = ["59899000444@s.whatsapp.net", "300000000000444@lid", "59899000445@s.whatsapp.net"];
  F.initDataDB({ chat: G, sender: N, senderJid: N, pushName: "Carla" }); // the old row
  db.prepare("UPDATE users SET inGroup = ?, banned = 1 WHERE lid = ?").run(JSON.stringify({ [G]: { warn: 2, messageCount: 40 } }), N);
  F.initDataDB({ chat: G, sender: L, senderJid: N, pushName: "Carla" });
  F.getUser(L, G);
  F.updateUserInGroup(L, G, { warn: 1, messageCount: 7 });
  F.initDataDB({ chat: G, sender: SOLO, senderJid: SOLO, pushName: "Dani" });
  db.prepare("UPDATE users SET inGroup = ? WHERE lid = ?").run(JSON.stringify({ [G]: { messageCount: 3 } }), SOLO);
  // A row keyed by a number with no number on it, next to LID rows without one: no LID row has its number.
  const SIN = "59899000446@s.whatsapp.net";
  F.initDataDB({ chat: G, sender: "300000000000447@lid", senderJid: "", pushName: "Eli" });
  db.prepare("INSERT INTO users (lid, jid, pushName) VALUES (?, '', ?)").run(SIN, "Fede");
  assert.deepEqual(F.getAllUsers().map((u) => u.lid).sort(), [L, SOLO, SIN, "300000000000447@lid"].sort());
  assert.deepEqual(F.advertidos(G).map((a) => [a.lid, a.warn]), [[L, 1]]);
  const enviados = [];
  const client = { user: { lid: "bot@lid", jid: "bot@s.whatsapp.net" }, chats: {}, sendText: async (chat, text) => enviados.push(text) };
  await (await import("../plugins/grupo-message-count.js")).default.run({ chat: G, isGroup: true }, { client });
  assert.match(enviados.at(-1), /\n\n1\. @300000000000444 - \*7\* mensajes\n2\. @59899000445 - \*3\* mensajes\n$/);
  await (await import("../plugins/lista-banuser.js")).default.run({ chat: G }, { client, isOwner: true });
  assert.match(enviados.at(-1), /Total : 0 Usuarios/);
});
