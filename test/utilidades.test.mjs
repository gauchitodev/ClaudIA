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
  // yt-dlp tiene 4 min de timeout por intento y hasta 3 intentos: a los 10 minutos puede seguir bajando.
  const enCurso = crear("bajando.mp4", 10 * 60 * 1000);
  const recien = crear("sticker.webp", 0);

  assert.equal(LT.limpiarTmp(dir, ahora), 1);
  assert.ok(!fs.existsSync(viejo), "lo abandonado se borra");
  assert.ok(fs.existsSync(enCurso), "una descarga de 10 minutos sigue viva");
  assert.ok(fs.existsSync(recien), "lo recién creado sigue vivo");

  // Media hora más tarde ya no hay nada en curso que proteger.
  assert.equal(LT.limpiarTmp(dir, ahora + 30 * 60 * 1000), 2);
  assert.equal(fs.readdirSync(dir).length, 0);
  // Una carpeta que no existe no rompe la limpieza.
  assert.equal(LT.limpiarTmp("tmp-que-no-existe", ahora), 0);
});

test("IA por mención: el comando con el número del bot se resuelve al usarse, no al importar el plugin", async () => {
  const previo = globalThis.client;
  // Los plugins se cargan antes de que exista el socket: leer cmd ahí no puede reventar.
  globalThis.client = undefined;
  const P = (await import("../plugins/tools-ia.js")).default;
  assert.deepEqual(P.cmd, ["gemini", "ia", "bot"]);
  // Ya conectada, el número del bot vuelve a ser comando (y primero, como estaba).
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
    // Un citado que dice ser imagen pero al que el serializador le borró download(): wa-socket.js lo hace cuando el
    // mensaje no tiene mediaMessage, y con el optional chaining del plugin eso devolvía undefined en silencio.
    await P.run({ chat: G, sender: "u@lid", message: {}, quoted: { msg: { mimetype: "image/jpeg" } } }, { client, isOwner: false });
  } finally {
    console.error = original;
  }
  assert.deepEqual(enviados, [], "no se le pasa basura a sendFile");
  assert.match(errores.join("\n"), /la descarga del archivo vino vacía/);
  assert.match(errores.join("\n"), /NO es problema de ffmpeg/, "el log tiene que descartar ffmpeg explícitamente");
});

