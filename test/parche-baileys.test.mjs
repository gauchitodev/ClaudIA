import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync, execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { nodosQue } from "./helpers.mjs";
import { PARCHE, estadoDelParche, ponerParche, ponerParcheAlArrancar, versionDeBaileys, lineaDeBaileys } from "../lib/parche-baileys.js";

// The installed file the fix goes on, and what it was as Baileys publishes it: the one line back as it came.
const INSTALADO = fileURLToPath(new URL(`../${PARCHE.ARCHIVO}`, import.meta.resolve("@whiskeysockets/baileys")));
const publicado = () => fs.readFileSync(INSTALADO, "utf8").replace(PARCHE.DESPUES, PARCHE.ANTES);

// A package folder of its own with that one file in it.
function paquete(t, texto) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "claudia-parche-"));
  t.after(() => {
    fs.chmodSync(path.dirname(path.join(carpeta, PARCHE.ARCHIVO)), 0o755);
    fs.rmSync(carpeta, { recursive: true, force: true });
  });
  const ruta = path.join(carpeta, PARCHE.ARCHIVO);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  if (texto !== undefined) fs.writeFileSync(ruta, texto);
  return { carpeta, ruta, leer: () => fs.readFileSync(ruta, "utf8"), vecinos: () => fs.readdirSync(path.dirname(ruta)) };
}

// What the whole thing is for. With the line as Baileys publishes it, every one of these would be one more: 1, 2, 3
// sessions by number, and in the group a forced request for each phone on every message.
test("el Baileys instalado no le abre otra sesión al teléfono de alguien cada vez que vuelve a pedir sus dispositivos", async (t) => {
  // The script ends on its own, in a minute and a half at the most. Where the runner cuts a test that ran out of time
  // (Node 24 and 26), it's cut with it; on Node 22 the file is, and the script is left to end by itself.
  const guion = fileURLToPath(new URL("./sesiones-de-baileys.mjs", import.meta.url));
  const { stdout } = await promisify(execFile)(process.execPath, [guion], { encoding: "utf8", signal: t.signal });
  const { porNumero, grupo } = JSON.parse(stdout.trim().split("\n").at(-1));

  // By number, as in a private chat: asked three times, and the session made the first time is the one it keeps.
  assert.equal(porNumero.consultas, 3, "pidió los dispositivos las tres veces");
  assert.deepEqual(porNumero.sesiones, [1, 1, 1]);
  assert.deepEqual([porNumero.claves, porNumero.forzadas], [1, 0], "pidió las claves una sola vez, y sin forzar");

  // In a group, by LID: one session with each phone and with each linked device, and no keys asked for again. The
  // first person's phone already had its session, from above.
  assert.equal(grupo.consultas, 3);
  assert.equal(grupo.mensajes, 3, "los tres mensajes salieron");
  assert.deepEqual(grupo.telefonos, [1, 1, 1]);
  assert.deepEqual(grupo.vinculados, [1, 1, 1]);
  assert.deepEqual([grupo.claves, grupo.forzadas], [5, 0], "las de los dos teléfonos y los tres vinculados que le faltaban");
});

test("el Baileys instalado tiene puesto el arreglo de las sesiones", () => {
  assert.equal(estadoDelParche(), "puesto", "falta correr `node scripts/parchar-baileys.mjs` (npm lo corre al instalar), o Baileys cambió y lib/parche-baileys.js ya no le calza");
  assert.match(versionDeBaileys(), /^\d+\.\d+\.\d+/);
});

// The line as Baileys 7.0.0-rc14 publishes it, and as building its source with the fix leaves it (the two builds were
// compared, and differ in this line alone): the file ends up the very one a fixed Baileys would bring.
test("la línea que cambia es la que Baileys publica, y queda como la compila la fuente arreglada", () => {
  assert.equal(PARCHE.ARCHIVO, "lib/Socket/messages-send.js");
  assert.equal(PARCHE.ANTES, "await assertSessions(lids, true);");
  assert.equal(PARCHE.DESPUES, "await assertSessions(lids);");
  assert.ok(fs.readFileSync(INSTALADO, "utf8").includes("\n                        await assertSessions(lids);\n"), "la línea entera, con su sangría y nada más");
});

test("la versión es la del package.json del paquete, y sin él o sin versión no hay ninguna", (t) => {
  const p = paquete(t);
  assert.equal(versionDeBaileys(p.carpeta), null, "sin package.json");
  fs.writeFileSync(path.join(p.carpeta, "package.json"), "{}");
  assert.equal(versionDeBaileys(p.carpeta), null, "sin versión");
  fs.writeFileSync(path.join(p.carpeta, "package.json"), '{ "version": "7.1.0" }');
  assert.equal(versionDeBaileys(p.carpeta), "7.1.0");
});

test("el arreglo se pone donde falta, entero y una sola vez", (t) => {
  const p = paquete(t, publicado());
  assert.equal(estadoDelParche(p.carpeta), "falta", "así lo publica Baileys: la línea, una vez");
  const publicadoEn = fs.statSync(p.ruta).ino;

  assert.deepEqual(ponerParche(p.carpeta), { estado: "puesto", cambio: true });
  assert.notEqual(fs.statSync(p.ruta).ino, publicadoEn, "el archivo se cambia por otro ya escrito, no se reescribe en el lugar");
  const antes = publicado().split("\n");
  const ahora = p.leer().split("\n");
  assert.equal(ahora.length, antes.length);
  assert.deepEqual(ahora.flatMap((linea, i) => (linea === antes[i] ? [] : [[antes[i].trim(), linea.trim()]])), [[PARCHE.ANTES, PARCHE.DESPUES]], "cambia esa línea y nada más");
  assert.equal(estadoDelParche(p.carpeta), "puesto");
  assert.deepEqual(p.vecinos(), [path.basename(PARCHE.ARCHIVO)], "no deja el archivo a medio escribir al lado");

  // Again: it's there, and the file isn't written a second time.
  const escrito = fs.statSync(p.ruta).ino;
  assert.deepEqual(ponerParche(p.carpeta), { estado: "puesto", cambio: false });
  assert.equal(fs.statSync(p.ruta).ino, escrito);
});

test("el arreglo no toca un Baileys que no es el que conoce", (t) => {
  const dos = `${PARCHE.ANTES}\n${PARCHE.ANTES}\n`;
  const casos = { "ni una línea ni la otra": "const nada = 1;\n", "la línea dos veces": dos, "las dos líneas": `${PARCHE.ANTES}\n${PARCHE.DESPUES}\n`, "el arreglo dos veces": `${PARCHE.DESPUES}\n${PARCHE.DESPUES}\n` };
  for (const [caso, texto] of Object.entries(casos)) {
    const p = paquete(t, texto);
    assert.equal(estadoDelParche(p.carpeta), "otro", caso);
    assert.deepEqual(ponerParche(p.carpeta), { estado: "otro", cambio: false }, caso);
    assert.equal(p.leer(), texto, caso);
  }

  // No file at all: a Baileys laid out differently, or none.
  const vacio = paquete(t);
  assert.equal(estadoDelParche(vacio.carpeta), "otro");
  const r = ponerParche(vacio.carpeta);
  assert.deepEqual([r.estado, r.cambio, r.error?.code], ["otro", false, "ENOENT"]);
  assert.equal(versionDeBaileys(vacio.carpeta), null);
});

test("si el arreglo no se puede escribir, el archivo queda como estaba y lo dice", (t) => {
  if (process.getuid?.() === 0) return t.skip("a root no hay carpeta que no lo deje escribir");
  const p = paquete(t, publicado());
  fs.chmodSync(path.dirname(p.ruta), 0o555);
  const r = ponerParche(p.carpeta);
  assert.deepEqual([r.estado, r.cambio, r.error?.code], ["falta", false, "EACCES"]);
  assert.equal(p.leer(), publicado());
  assert.deepEqual(p.vecinos(), [path.basename(PARCHE.ARCHIVO)]);
});

test("si el arreglo se escribe pero no se puede cambiar por el archivo, no queda nada a medias", (t) => {
  const p = paquete(t, publicado());
  t.mock.method(fs, "renameSync", () => {
    throw Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" });
  });
  const r = ponerParche(p.carpeta);
  assert.deepEqual([r.estado, r.cambio, r.error?.code], ["falta", false, "EXDEV"]);
  assert.equal(p.leer(), publicado());
  assert.deepEqual(p.vecinos(), [path.basename(PARCHE.ARCHIVO)], "el que había escrito al lado se borra");
});

// The script npm runs after an install, here on a package folder of its own. Whatever it finds, the install goes on.
test("scripts/parchar-baileys.mjs pone el arreglo, dice qué hizo y nunca corta la instalación", (t) => {
  const script = fileURLToPath(new URL("../scripts/parchar-baileys.mjs", import.meta.url));
  const correr = (carpeta) => {
    const r = spawnSync(process.execPath, carpeta ? [script, carpeta] : [script], { encoding: "utf8", timeout: 30_000 });
    return [r.status, r.stdout.trim(), r.stderr.trim()];
  };

  const p = paquete(t, publicado());
  assert.deepEqual(correr(p.carpeta), [0, "🩹 Baileys: puse el arreglo de las sesiones (lib/parche-baileys.js).", ""]);
  assert.equal(estadoDelParche(p.carpeta), "puesto");
  assert.deepEqual(correr(p.carpeta), [0, "🩹 Baileys: el arreglo de las sesiones ya estaba puesto.", ""]);

  const otro = paquete(t, "const nada = 1;\n");
  assert.deepEqual(correr(otro.carpeta), [0, "", "⚠️ Baileys: el arreglo de las sesiones no le calza a la versión instalada. Puede que ya venga arreglada: ver lib/parche-baileys.js."]);
  assert.equal(otro.leer(), "const nada = 1;\n");

  // Without a folder it's the installed one, which has it on.
  assert.deepEqual(correr(), [0, "🩹 Baileys: el arreglo de las sesiones ya estaba puesto.", ""]);

  if (process.getuid?.() === 0) return;
  const cerrado = paquete(t, publicado());
  fs.chmodSync(path.dirname(cerrado.ruta), 0o555);
  const [salida, , aviso] = correr(cerrado.carpeta);
  assert.equal(salida, 0);
  assert.match(aviso, /^⚠️ Baileys: no pude poner el arreglo de las sesiones: EACCES: permission denied/);
});

// main.js had already loaded Baileys by the time it could put the fix on: it's the next process that runs with it.
test("al arrancar: si acaba de poner el arreglo corta para que el siguiente lo cargue, y si no, sigue", (t) => {
  const dicho = [];
  t.mock.method(console, "log", (...a) => dicho.push(["log", a.join(" ")]));
  t.mock.method(console, "warn", (...a) => dicho.push(["warn", a.join(" ")]));
  const arrancar = (resultado) => {
    const salidas = [];
    dicho.length = 0;
    const estado = ponerParcheAlArrancar({ poner: () => resultado, salir: (codigo) => salidas.push(codigo) });
    return { estado, salidas, dicho: [...dicho] };
  };

  // Not zero: start-process.js leaves a main.js that ended with 0 down.
  const puso = arrancar({ estado: "puesto", cambio: true });
  assert.deepEqual(puso.salidas, [1]);
  assert.deepEqual(puso.dicho, [["log", "🩹 Le puse a Baileys el arreglo de las sesiones (lib/parche-baileys.js). Reinicio para cargarlo."]]);

  assert.deepEqual(arrancar({ estado: "puesto", cambio: false }), { estado: "puesto", salidas: [], dicho: [] });

  const sinPermiso = arrancar({ estado: "falta", cambio: false, error: new Error("EACCES: permission denied") });
  assert.deepEqual([sinPermiso.estado, sinPermiso.salidas], ["falta", []]);
  assert.deepEqual(sinPermiso.dicho, [["warn", "⚠️ No pude ponerle a Baileys el arreglo de las sesiones (lib/parche-baileys.js): EACCES: permission denied. Sigo sin él."]]);

  const otro = arrancar({ estado: "otro", cambio: false });
  assert.deepEqual([otro.estado, otro.salidas], ["otro", []]);
  assert.deepEqual(otro.dicho, [["warn", "⚠️ El arreglo de las sesiones no le calza al Baileys instalado (lib/parche-baileys.js). Sigo sin él."]]);
});

test("main.js pone el arreglo antes que nada: antes de la memoria, la base, la sesión y los plugins", async () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const linea = async (selector) => (await nodosQue(selector, main)).map((n) => n.loc.start.line);
  const puesto = await linea('Program > ExpressionStatement > CallExpression[callee.name="ponerParcheAlArrancar"]');
  assert.equal(puesto.length, 1, "main.js lo llama una vez, suelto, al cargar");
  for (const despues of ["ImportExpression", 'CallExpression[callee.name="recuperarMemoria"]', 'CallExpression[callee.name="loadDatabase"]', 'CallExpression[callee.name="abrirSesion"]', 'CallExpression[callee.name="loadPlugins"]', 'CallExpression[callee.name="startBot"]']) {
    const lineas = await linea(despues);
    assert.ok(lineas.length > 0, `main.js ya no tiene ${despues}`);
    assert.ok(puesto[0] < Math.min(...lineas), `${despues} corre antes que el arreglo`);
  }
});

test("npm pone el arreglo al instalar", () => {
  const { scripts } = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(scripts.postinstall, "node scripts/parchar-baileys.mjs");
});

test(".estado dice qué Baileys tiene el bot y cómo está el arreglo", () => {
  assert.equal(lineaDeBaileys("7.0.0-rc14", "puesto"), "🧩 Baileys 7.0.0-rc14 · con el arreglo de las sesiones");
  assert.equal(lineaDeBaileys("7.0.0-rc14", "falta"), "🧩 Baileys 7.0.0-rc14 · ⚠️ sin el arreglo de las sesiones: se pone solo al reiniciar el bot (si sigue así, mirá el log)");
  assert.equal(lineaDeBaileys("7.1.0", "otro"), "🧩 Baileys 7.1.0 · ⚠️ el arreglo de las sesiones no le calza: puede que ya venga arreglada");
  assert.equal(lineaDeBaileys(null, "otro"), "🧩 Baileys ? · ⚠️ el arreglo de las sesiones no le calza: puede que ya venga arreglada");
  assert.equal(lineaDeBaileys(), `🧩 Baileys ${versionDeBaileys()} · con el arreglo de las sesiones`, "el instalado");
});
