import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

let F, Rec, C, B, Av, CC, Mem, E;
before(async () => {
  ({ F } = await prepararBase("utilidades"));
  Rec = await import("../lib/recordatorios.js");
  C = await import("../lib/cumpleanos.js");
  B = await import("../lib/backup.js");
  Av = await import("../lib/avisos.js");
  CC = await import("../lib/contexto-chat.js");
  Mem = await import("../lib/memoria-grupo.js");
  E = await import("../lib/economia.js");
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
