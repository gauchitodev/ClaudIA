import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

let F, Rec, C, B, Av, CC, Mem, E, LT;
before(async () => {
  ({ F } = await prepararBase("utilidades"));
  Rec = await import("../lib/recordatorios.js");
  C = await import("../lib/cumpleanos.js");
  B = await import("../lib/backup.js");
  Av = await import("../lib/avisos.js");
  CC = await import("../lib/contexto-chat.js");
  Mem = await import("../lib/memoria-grupo.js");
  E = await import("../lib/economia.js");
  LT = await import("../lib/limpieza-tmp.js");
});

test("recordatorios", async () => {
  const H = 3600e3;
  const r1 = Rec.crearRecordatorio(G, "u", ["en", "2h", "sacar", "la", "pizza"]);
  assert.match(r1.mensaje, /sacar la pizza/);
  assert.ok(Rec.crearRecordatorio(G, "u", ["mañana", "9:00", "pagar", "la", "luz"]).ok);
  assert.ok(Rec.crearRecordatorio(G, "u", ["en", "2", "h", "y", "esto"]).ok);
  assert.match(Rec.crearRecordatorio(G, "u", ["en", "2h"]).error, /¿Qué te recuerdo/);
  assert.match(Rec.crearRecordatorio(G, "u", ["sacar", "la", "pizza"]).error, /¿Cuándo/);
  assert.match(Rec.crearRecordatorio(G, "u", ["en", "90d", "x"]).error, /60 días/);
  for (let i = 0; i < 7; i++) Rec.crearRecordatorio(G, "u", ["en", "1h", `x${i}`]);
  assert.match(Rec.crearRecordatorio(G, "u", ["en", "1h", "otro"]).error, /Ya tenés 10/);
  assert.match(Rec.textoRecordatorios("u"), /#1 · /);
  assert.ok(Rec.olvidarRecordatorio("u", 1).ok && !Rec.olvidarRecordatorio("u", 1).ok && !Rec.olvidarRecordatorio("otro", 2).ok);
  await Rec.ejecutarRecordatorio(globalThis.client, { chat: G, usuario: "598@lid", datos: { texto: "sacar la pizza" } });
  assert.match(ultimoEnviado().msg.text, /@598, me pediste que te recuerde: \*sacar la pizza\*/);
  void H;
});

test("cumpleaños", async () => {
  assert.match(C.registrarCumple(G, "a", "").error, /Anotá tu cumple/);
  assert.ok(C.registrarCumple(G, "a", "14/03").ok);
  assert.match(C.registrarCumple(G, "a", "").mensaje, /14 de marzo/);
  assert.ok(C.registrarCumple(G, "b", "29-02").ok);
  assert.ok(!C.registrarCumple(G, "d", "31/04").ok && !C.registrarCumple(G, "d", "hola").ok);
  assert.equal(C.diasHasta(2, 9, new Date(2026, 8, 2)), 0);
  assert.equal(C.diasHasta(1, 9, new Date(2026, 8, 2)), 364);
  assert.equal(C.textoCumples(G).mentions.length, 2);
  assert.ok(C.registrarCumple(G, "b", "borrar").ok);
  const hoy = new Date();
  C.registrarCumple(G, "598@lid", `${hoy.getDate()}/${hoy.getMonth() + 1}`);
  C.CUMPLE.HORA_SALUDO = 0;
  const antes = globalThis.enviados.length;
  await C.chequearCumpleanos();
  await C.chequearCumpleanos();
  assert.equal(globalThis.enviados.length, antes + 1);
  assert.match(ultimoEnviado().msg.text, /@598/);
});

test("backup con la copia real de SQLite, rotación y envío semanal", async () => {
  const archivo = await B.hacerBackup();
  assert.ok(fs.existsSync(archivo) && !fs.existsSync(`${archivo}.tmp`));
  for (let i = 1; i <= 9; i++) fs.writeFileSync(path.join(B.BACKUP.CARPETA, `database-2020-01-0${i % 10}.db`), "viejo");
  await B.hacerBackup();
  assert.equal(fs.readdirSync(B.BACKUP.CARPETA).filter((f) => f.endsWith(".db")).length, 7);
  assert.equal(B.ultimoBackup().archivo, archivo);
  assert.equal(B.tamano(2.5 * 1024 * 1024), "2.5 MB");
  B.BACKUP.HORA = 0;
  const antes = globalThis.enviados.length;
  await B.chequearBackupProgramado();
  await B.chequearBackupProgramado();
  assert.equal(globalThis.enviados.length, antes + 1, "una copia semanal al owner");
  assert.equal(Av.jidOwner(), "59899111222@s.whatsapp.net");
  assert.equal(await Av.avisarOwner("hola", "k", 60e3), true);
  assert.equal(await Av.avisarOwner("hola", "k", 60e3), false);
});

test("memoria corta y memoria del grupo", () => {
  for (let i = 0; i < 250; i++) CC.recordarMensaje("c", `u${i}`, `mensaje ${i}`);
  assert.equal(globalThis.contextoChat.get("c").length, 200);
  assert.equal(CC.textoContexto("c", false).split("\n").length, 14);
  assert.match(Mem.recordar(G, "u", "que Fulano siempre llega tarde").mensaje, /Anotado \(#1\): Fulano siempre llega tarde/);
  assert.match(Mem.recordar(G, "u", "x").error, /¿Qué tengo que recordar/);
  assert.match(Mem.recordar(G, "u", "que la contraseña del wifi es 1234").error, /no lo guardo/);
  assert.match(Mem.textoMemoria(G), /#1 · Fulano siempre llega tarde/);
  assert.match(Mem.textoParaPrompt(G), /"Fulano siempre llega tarde"/);
  assert.match(Mem.borrar(G, "otro", 1, false).error, /otra persona/);
  assert.ok(Mem.borrar(G, "otro", 1, true).ok, "un admin borra lo de otro");
  assert.equal(Mem.textoParaPrompt(G), "");
});

test("economía", () => {
  F.ganarCoins(G, "a", 100, "reaccion_recibida");
  F.gastarCoins(G, "a", 30, "casino_ruleta");
  F.ganarCoins(G, "b", 40, "racha_dia");
  const e = E.resumenEconomia(G, 7);
  assert.equal(e.total, 110);
  assert.equal(e.personas, 2);
  assert.equal(e.entradas, 140);
  assert.equal(e.salidas, 30);
  assert.ok(e.rubros.some((r) => r.nombre === "Reacciones" && r.entradas === 100));
  assert.ok(e.rubros.some((r) => r.nombre === "Ruleta" && r.salidas === 30));
  const t = E.textoEconomia(G, 7);
  assert.match(t.texto, /En circulación: \*110 UruCoins\* entre 2 personas/);
  assert.match(t.texto, /📈/);
  assert.deepEqual(t.mentions, [], "el panel nombra sin etiquetar");
  assert.match(t.texto, /Saldos más altos:\*\n1\. (a|b) — /);
});

test("economía: los movimientos de los laburos tienen rubro propio", () => {
  F.moverCoins(G, "laburante@lid", 9, "sueldo_laburo");
  F.moverCoins(G, "laburante@lid", -20, "cambio_laburo");
  const rubros = E.resumenEconomia(G, 7).rubros;
  const nombres = rubros.map((r) => r.nombre);
  assert.ok(nombres.includes("Sueldos de laburos") && nombres.includes("Cambios de laburo"), nombres.join(", "));
  assert.ok(!nombres.includes("Otros"), "antes caían en Otros");
  assert.equal(rubros.find((r) => r.nombre === "Sueldos de laburos").entradas, 9);
  assert.equal(rubros.find((r) => r.nombre === "Cambios de laburo").salidas, 20);
  assert.match(E.textoEconomia(G).texto, /• Sueldos de laburos: \+9 \/ −0 \(1 mov\.\)/);
});

test("limpieza de tmp: borra lo abandonado y no le saca el archivo a una descarga en curso", () => {
  const dir = "tmp-prueba";
  fs.mkdirSync(dir, { recursive: true });
  const ahora = Date.now();
  const crear = (nombre, edadMs) => {
    const ruta = path.join(dir, nombre);
    fs.writeFileSync(ruta, "x");
    const seg = (ahora - edadMs) / 1000;
    fs.utimesSync(ruta, seg, seg);
    return ruta;
  };
  const viejo = crear("quedo-colgado.mp4", 60 * 60 * 1000);
  // yt-dlp has a 4 min timeout per attempt and up to 3 attempts: ten minutes in, it may still be downloading.
  const enCurso = crear("bajando.mp4", 10 * 60 * 1000);
  const recien = crear("sticker.webp", 0);

  assert.equal(LT.limpiarTmp(dir, ahora), 1);
  assert.ok(!fs.existsSync(viejo), "lo abandonado se borra");
  assert.ok(fs.existsSync(enCurso), "una descarga de 10 minutos sigue viva");
  assert.ok(fs.existsSync(recien), "lo recién creado sigue vivo");

  // Half an hour later there is nothing in progress left to protect.
  assert.equal(LT.limpiarTmp(dir, ahora + 30 * 60 * 1000), 2);
  assert.equal(fs.readdirSync(dir).length, 0);
  // A folder that doesn't exist doesn't break the cleanup.
  assert.equal(LT.limpiarTmp("tmp-que-no-existe", ahora), 0);
});

test("IA por mención: el comando con el número del bot se resuelve al usarse, no al importar el plugin", async () => {
  const previo = globalThis.client;
  // Plugins load before the socket exists: reading cmd there must not blow up.
  globalThis.client = undefined;
  const P = (await import("../plugins/tools-ia.js")).default;
  assert.deepEqual(P.cmd, ["gemini", "ia", "bot"]);
  // Once connected, the bot's number is a command again (and first, as it was).
  globalThis.client = { user: { lid: "59899111222@lid" } };
  assert.deepEqual(P.cmd, ["59899111222", "gemini", "ia", "bot"]);
  globalThis.client = previo;
});

test("el .s no manda nada cuando la descarga del archivo viene vacía, y el log dice por qué", async () => {
  const P = (await import("../plugins/sticker.js")).default;
  const enviados = [];
  const client = { sendText: async (c, t) => enviados.push(t), sendFile: async () => enviados.push("archivo") };
  const errores = [];
  const original = console.error;
  console.error = (...a) => errores.push(a.join(" "));
  try {
    // A quoted message claiming to be an image but whose download() the serializer deleted: wa-socket.js does that
    // when the message has no mediaMessage, and with the plugin's optional chaining it silently returned undefined.
    await P.run({ chat: G, sender: "u@lid", message: {}, quoted: { msg: { mimetype: "image/jpeg" } } }, { client, isOwner: false });
  } finally {
    console.error = original;
  }
  assert.deepEqual(enviados, [], "no se le pasa basura a sendFile");
  assert.match(errores.join("\n"), /la descarga del archivo vino vacía/);
  assert.match(errores.join("\n"), /NO es problema de ffmpeg/, "el log tiene que descartar ffmpeg explícitamente");
});


// ---------- how late a message arrived (the 60-second filter in handle-message) ----------
// The age used to be measured when the message got processed. A batch goes one message at a time and every reply
// waits its turn in the queue, so the last command of a busy batch could pass the 60 s mark while waiting and be dropped
// without a word.

test("atraso: se mide contra la llegada, no contra cuándo se procesa", async () => {
  const { atrasoDeLlegada } = await import("../lib/tiempo.js");
  const enviado = 1_800_000_000; // seconds, like messageTimestamp
  const llegada = enviado * 1000 + 2000; // it reached the bot 2 s after it was sent
  const m = { messageTimestamp: enviado, _llegada: llegada };
  // Processed 90 s later, after the rest of its batch: its age is still the 2 s it took to arrive.
  assert.equal(atrasoDeLlegada(m, llegada + 90_000), 2);
  assert.equal(atrasoDeLlegada({ messageTimestamp: enviado }, llegada + 90_000), 92, "sin marca de llegada mide contra ahora, como antes");

  // What the filter is for: a message delivered late, because the bot was offline, is still stale.
  assert.ok(atrasoDeLlegada({ messageTimestamp: enviado, _llegada: (enviado + 300) * 1000 }) > 60);
  // The timestamp may come as a protobuf Long, and a message with none isn't dropped.
  assert.equal(atrasoDeLlegada({ messageTimestamp: { toNumber: () => enviado }, _llegada: llegada }), 2);
  assert.equal(atrasoDeLlegada({ _llegada: llegada }), 0);
});

test("atraso: main.js marca la llegada de cada tanda y handle-message filtra con ella", async () => {
  const { fileURLToPath } = await import("url");
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const main = fs.readFileSync(path.join(raiz, "main.js"), "utf8");
  const bloque = main.slice(main.indexOf('client.ev.on("messages.upsert"'), main.indexOf('client.ev.on("group-participants.update"'));
  assert.ok(bloque.length > 100, "no se encontró el handler de messages.upsert: el escaneo no está andando");
  assert.match(bloque, /const llegada = Date\.now\(\);[\s\S]*m\._llegada = llegada;/, "main.js dejó de marcar cuándo llegó la tanda");
  const handle = fs.readFileSync(path.join(raiz, "handle-message.js"), "utf8");
  assert.match(handle, /if \(atrasoDeLlegada\(m\) > 60\) return;/, "handle-message dejó de filtrar por el atraso de llegada");
});

test("consistencia: ningún plugin deja archivos multimedia en la raíz del repo", async () => {
  // .toimg wrote its temporary .webp and .jpg next to the code: a conversion cut short left someone's sticker there,
  // one "git add ." away from a commit, since .gitignore only covers tmp/ and database/. A merge that brings back an
  // old copy of a plugin would bring that back without anything failing.
  const { fileURLToPath } = await import("url");
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const archivos = ["plugins", "lib"].flatMap((c) => fs.readdirSync(path.join(raiz, c)).filter((f) => f.endsWith(".js")).map((f) => path.join(c, f)));
  assert.ok(archivos.length > 100, `se encontraron muy pocos archivos (${archivos.length}): el escaneo no está andando`);
  const enLaRaiz = [];
  for (const archivo of archivos) {
    fs.readFileSync(path.join(raiz, archivo), "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (/["'`]\.\/[^"'`/\s]+\.(jpe?g|png|webp|gif|mp3|mp4|ogg|opus|wav|m4a|webm)["'`]/i.test(linea)) enLaRaiz.push(`${archivo}:${i + 1}`);
      });
  }
  assert.deepEqual(enLaRaiz, [], `los temporales van en ./tmp/, que el .gitignore tapa:\n${enLaRaiz.join("\n")}`);
});
