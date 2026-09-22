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
  assert.ok(["preguntaDia", "triviaRelampago", "recapSemanal", "horarioJuegos", "charla", "saludos", "monedas", "ascensos", "reglas", "plantilla", "horarioGrupo", "grupoCerradoPorHorario"].every((c) => cols("chats").includes(c)));
  assert.equal(db.prepare(`SELECT monedas FROM chats WHERE remoteJid = ?`).get(G).monedas, 1, "economía prendida al migrar");
  assert.equal(db.prepare(`SELECT horarioJuegos FROM chats WHERE remoteJid = ?`).get(G).horarioJuegos, "", "sin horario de juegos al migrar");
  assert.equal(db.prepare(`SELECT recapSemanal FROM chats WHERE remoteJid = ?`).get(G).recapSemanal, 1);
  assert.equal(db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'blacklist'`).get(), undefined);
  assert.equal(F.getBlacklist().length, 1);
  assert.equal(F.getBlacklist()[0].chat, "*");
  assert.equal(F.isBlacklisted("111@s.whatsapp.net", G)?.reason, "spam");
  assert.ok(cols("hashtag_entries").includes("reacciones"));
  const tablas = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((t) => t.name);
  for (const t of ["urucoins", "urucoins_log", "inventario", "pendientes", "loteria_boletos", "mercados", "apuestas_mercado", "cumpleanos", "actividad_diaria", "actividad_horaria", "rachas", "preguntas_dia", "periodos_cerrados", "lista_negra", "memoria_grupo", "roles_grupo", "publicaciones", "alertas_compraventa", "calificaciones"]) assert.ok(tablas.includes(t), `falta la tabla ${t}`);
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
