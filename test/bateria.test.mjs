import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { prepararBase, ultimoEnviado, esperar } from "./helpers.mjs";
import strings from "../lib/strings.js";

// The battery of the phone or tablet the bot runs on (lib/bateria.js), for .bat and .estado. termux-battery-status and
// the system files are swapped for canned answers: neither exists outside the tablet.

let B, Bat, Estado;
const reales = {};
before(async () => {
  await prepararBase("bateria");
  globalThis.txt = strings;
  B = await import("../lib/bateria.js");
  Bat = (await import("../plugins/owner-bateria.js")).default;
  Estado = (await import("../plugins/estado.js")).default;
  Object.assign(reales, B._dep);
});
afterEach(() => Object.assign(B._dep, reales));

// What the device answers: termux-battery-status's JSON (or that the command isn't there), and the contents of the
// system's battery files (or that they can't be read).
function simular({ termux = null, archivos = null } = {}) {
  B._dep.ejecutar = async () => {
    if (!termux) throw Object.assign(new Error("spawn termux-battery-status ENOENT"), { code: "ENOENT" });
    return { stdout: JSON.stringify(termux), stderr: "" };
  };
  B._dep.leer = async (ruta) => {
    const nombre = ruta.split("/").pop();
    if (!archivos || !(nombre in archivos)) throw Object.assign(new Error(`EACCES: permission denied, open '${ruta}'`), { code: "EACCES" });
    return archivos[nombre];
  };
}

test("batería: lee termux-battery-status, aunque falte algún campo", async () => {
  simular({ termux: { present: true, health: "GOOD", plugged: "UNPLUGGED", status: "DISCHARGING", temperature: 25.5, percentage: 87, level: 87, scale: 100 } });
  assert.deepEqual(await B.leerBateria(), { porcentaje: 87, estado: "DISCHARGING", temperatura: 25.5 });
  // Termux:API leaves out what Android doesn't give: without "percentage", it comes from level/scale.
  simular({ termux: { status: "CHARGING", level: 120, scale: 200 } });
  assert.deepEqual(await B.leerBateria(), { porcentaje: 60, estado: "CHARGING", temperatura: undefined });
  // With neither, the pasted version answered "undefined%": now it tries the system files and then gives up.
  simular({ termux: { status: "UNKNOWN" } });
  assert.equal(await B.leerBateria(), null);
});

test("batería: sin Termux:API prueba los archivos del sistema, y si no puede leerlos, null", async () => {
  simular({ archivos: { capacity: "45\n", status: "Not charging\n" } });
  assert.deepEqual(await B.leerBateria(), { porcentaje: 45, estado: "Not charging" });
  simular({ archivos: { capacity: "45\n" } });
  assert.deepEqual(await B.leerBateria(), { porcentaje: 45, estado: "" }, "sin el archivo del estado igual da el porcentaje");
  simular({ archivos: { capacity: "\n" } });
  assert.equal(await B.leerBateria(), null, "un archivo vacío no es 0 %");
  simular();
  assert.equal(await B.leerBateria(), null);
});

// The real thing, with scripts standing in for Termux's in a folder put first in the PATH.
function comandoFalso(nombre, contenido) {
  const carpeta = path.resolve("bin-falso");
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(path.join(carpeta, nombre), `#!/bin/sh\n${contenido}\n`, { mode: 0o755 });
  return carpeta;
}
async function conPath(carpeta, hacer) {
  const real = process.env.PATH;
  process.env.PATH = `${carpeta}${path.delimiter}${real}`;
  try {
    return await hacer();
  } finally {
    process.env.PATH = real;
  }
}
// Gone, or a zombie on its way out (dead, waiting for whoever adopted it to collect it). It can be collected between
// the two looks, and then /proc no longer has it either.
function vivo(pid) {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    return fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1]?.[0] !== "Z";
  } catch (e) {
    return e.code !== "ENOENT";
  }
}

test("batería: corre termux-battery-status y lee lo que contesta; sin el comando, falla enseguida", async () => {
  const carpeta = comandoFalso("termux-battery-status", `echo '{"percentage": 77, "status": "FULL"}'`);
  const { stdout } = await conPath(carpeta, () => reales.ejecutar("termux-battery-status", [], { timeout: 5000 }));
  assert.equal(stdout, '{"percentage": 77, "status": "FULL"}\n');
  await assert.rejects(reales.ejecutar("claudia-comando-que-no-existe", [], { timeout: 5000 }), { code: "ENOENT" });
});

// termux-battery-status runs Termux's API helper as its child, and the helper waits for the Termux:API app: without it,
// forever. Here the helper writes down its pid and waits; when the time is up, it can't be left behind.
test("batería: si Termux:API no contesta, no deja procesos colgados", async () => {
  const pid = path.resolve("pid-del-ayudante");
  comandoFalso("ayudante", `echo $$ > "${pid}"\nexec sleep 1000`);
  // Like termux-api-package's script: the helper runs as a plain child, not with exec.
  const carpeta = comandoFalso("termux-battery-status", `"$(dirname "$0")/ayudante" BatteryStatus`);
  const t0 = Date.now();
  await assert.rejects(conPath(carpeta, () => reales.ejecutar("termux-battery-status", [], { timeout: 1500 })));
  assert.ok(Date.now() - t0 < 5000, "se da por vencido a tiempo");
  const ayudante = Number(fs.readFileSync(pid, "utf8"));
  for (let i = 0; i < 40 && vivo(ayudante); i++) await esperar(50);
  const quedo = vivo(ayudante);
  if (quedo) {
    try {
      process.kill(ayudante, "SIGKILL");
    } catch {}
  }
  assert.equal(quedo, false, "el ayudante quedó colgado");
});

// The check every 5 minutes: after Termux:API didn't answer, it leaves it alone for a while instead of starting one more
// helper waiting for nothing each time. .bat and .estado still try it, and an answer ends the pause.
test("batería: tras un timeout de Termux:API, el chequeo lo deja tranquilo un rato", async () => {
  let llamadas = 0;
  let contesta = false;
  let ahora = 1_000_000_000;
  B._dep.ahora = () => ahora;
  B._dep.ejecutar = async () => {
    llamadas++;
    if (!contesta) throw Object.assign(new Error("termux-battery-status no contestó en 8 s"), { code: "ETIMEDOUT" });
    return { stdout: JSON.stringify({ percentage: 50, status: "DISCHARGING" }) };
  };
  B._dep.leer = async (ruta) => {
    throw Object.assign(new Error(`EACCES: permission denied, open '${ruta}'`), { code: "EACCES" });
  };
  globalThis.bateriaBajaAvisada.clear();
  globalThis.bateriaLecturaAnterior = { porcentaje: 50, estado: "DISCHARGING", fecha: ahora }; // the battery is fine
  assert.equal(await B.chequearBateriaBaja(), null);
  assert.equal(llamadas, 1);
  ahora += 5 * 60 * 1000;
  assert.equal(await B.chequearBateriaBaja(), null);
  assert.equal(llamadas, 1, "en la pausa, el chequeo no lo llama");
  assert.equal(await B.leerBateria(), null);
  assert.equal(llamadas, 2, ".bat y .estado lo prueban igual");
  ahora += B.TERMUX_API.PAUSA_MS;
  await B.chequearBateriaBaja();
  assert.equal(llamadas, 3, "pasada la pausa, vuelve a probar");

  contesta = true;
  assert.deepEqual(await B.leerBateria(), { porcentaje: 50, estado: "DISCHARGING", temperatura: undefined });
  await B.chequearBateriaBaja();
  assert.equal(llamadas, 5, "si contestó, el chequeo lo llama de nuevo");

  // Not installed fails right away, with nothing left waiting: no pause for that.
  B._dep.ejecutar = async () => {
    llamadas++;
    throw Object.assign(new Error("spawn termux-battery-status ENOENT"), { code: "ENOENT" });
  };
  await B.chequearBateriaBaja();
  await B.chequearBateriaBaja();
  assert.equal(llamadas, 7);
});

test("batería: los estados en castellano, vengan de Termux:API o de los archivos", () => {
  assert.equal(B.estadoBateria("CHARGING"), "cargando ⚡");
  assert.equal(B.estadoBateria("Not charging"), "conectada sin cargar 🔌");
  assert.equal(B.estadoBateria("UNKNOWN"), "estado desconocido");
  assert.equal(B.estadoBateria(undefined), "");
});

test(".bat: solo para el owner, con porcentaje, estado y temperatura", async () => {
  assert.equal(Bat.onlyOwner, true);
  simular({ termux: { status: "CHARGING", temperature: 31.04, percentage: 80 } });
  await Bat.run({ chat: "owner@s.whatsapp.net" }, { client: globalThis.client });
  assert.equal(ultimoEnviado().msg.text, "🔋 Batería: *80%* (cargando ⚡)\n🌡️ Temperatura: 31.0 °C");
  simular();
  await Bat.run({ chat: "owner@s.whatsapp.net" }, { client: globalThis.client });
  assert.match(ultimoEnviado().msg.text, /^No pude leer la batería\. Falta instalar termux-api \(pkg install termux-api\)/);
});

test(".estado: tiene una línea con la batería", async () => {
  const client = globalThis.client;
  client.groupFetchAllParticipating = async () => ({});
  client.chats = {};
  simular({ termux: { status: "DISCHARGING", temperature: 28.5, percentage: 64 } });
  await Estado.run({ chat: "x@g.us", sender: "a@lid" }, { client });
  assert.match(ultimoEnviado().msg.text, /\n🔋 Batería: 64% · descargando 🔋 · 28\.5 °C$/);
  simular();
  await Estado.run({ chat: "x@g.us", sender: "a@lid" }, { client });
  assert.match(ultimoEnviado().msg.text, /\n🔋 Batería: no la pude leer \(falta Termux:API\)$/);
});

// ---------- low battery ----------
// Below 10 % and not charging, the owner hears it in private, and again below 5 %: once each per discharge, ready to
// tell again once past 15 %. The bot goes with the device, and with it every group.
const OWNER = "59899111222@s.whatsapp.net"; // prepararBase's owner
async function chequear(porcentaje, status = "DISCHARGING") {
  simular({ termux: { percentage: porcentaje, status } });
  globalThis.enviados = [];
  const umbral = await B.chequearBateriaBaja();
  return { umbral, textos: globalThis.enviados.filter((e) => e.chat === OWNER).map((e) => e.msg.text) };
}
const DIEZ = (p) => `🤖 🔋 Me queda ${p} % de batería y no estoy cargando. Enchufame antes de que me apague.`;
const CINCO = (p) => `🤖 🪫 Me queda ${p} % de batería y no estoy cargando: me puedo apagar en cualquier momento. ¡Enchufame ya!`;

test("batería baja: avisa al owner por debajo del 10 % y del 5 %, una vez cada uno por descarga", async () => {
  globalThis.bateriaBajaAvisada.clear();
  assert.deepEqual(await chequear(12), { umbral: null, textos: [] });
  assert.deepEqual(await chequear(10), { umbral: null, textos: [] }, "con el 10 % justo, todavía no");
  assert.deepEqual(await chequear(9), { umbral: 10, textos: [DIEZ(9)] });
  assert.deepEqual(await chequear(8), { umbral: null, textos: [] }, "una sola vez");
  assert.deepEqual(await chequear(4), { umbral: 5, textos: [CINCO(4)] });
  assert.deepEqual(await chequear(3), { umbral: null, textos: [] });
  // Charging doesn't make them ready again, only going past 15 %: a short charge, unplugged before that, used to bring
  // the same notice again.
  assert.deepEqual(await chequear(3, "CHARGING"), { umbral: null, textos: [] });
  assert.equal((await chequear(7)).umbral, null, "cargó un poco y se desenchufó: el del 10 % ya está dado");
  assert.equal((await chequear(12)).umbral, null);
  assert.equal((await chequear(9)).umbral, null, "sin pasar del 15 %, tampoco");
  assert.equal((await chequear(16)).umbral, null);
  assert.equal((await chequear(9)).umbral, 10, "pasado el 15 %, de nuevo");
  // Connected without charging doesn't keep up, and full counts as charging.
  assert.equal((await chequear(4, "NOT_CHARGING")).umbral, 5);
  assert.equal((await chequear(100, "FULL")).umbral, null);
  assert.equal((await chequear(9, "Discharging")).umbral, 10, "con el estado de los archivos del sistema también");
});

// A loose cable plugs and unplugs by itself: charging used to make the notices ready again, and the same one came every
// 10 minutes. And plugged in without charging, the notice says so instead of asking to be plugged in.
test("batería baja: con un cable flojo avisa una vez, y si está enchufada sin cargar, lo dice", async () => {
  globalThis.bateriaBajaAvisada.clear();
  const avisos = [];
  for (let i = 0; i < 6; i++) avisos.push(...(await chequear(9, i % 2 ? "CHARGING" : "DISCHARGING")).textos);
  assert.deepEqual(avisos, [DIEZ(9)]);

  globalThis.bateriaBajaAvisada.clear();
  assert.deepEqual((await chequear(9, "NOT_CHARGING")).textos, ["🤖 🔌 Me queda 9 % de batería: estoy enchufada, pero no carga. Revisá el cargador o el cable antes de que me apague."]);
  assert.deepEqual((await chequear(4, "Not charging")).textos, ["🤖 🪫 Me queda 4 % de batería y no carga, aunque estoy enchufada: me puedo apagar en cualquier momento. ¡Revisá el cargador ya!"], "con el estado de los archivos del sistema también");
});

// A weak charger, or the tablet using more than it gets: it says "charging" and goes down all the same, and the device
// dies just as if it were unplugged. Lower than at the check before, while charging, the owner hears it.
test("batería baja: cargando pero bajando, avisa que el cargador no da abasto", async () => {
  globalThis.bateriaBajaAvisada.clear();
  globalThis.bateriaNoAlcanzaAvisada?.clear();
  globalThis.bateriaLecturaAnterior = null;
  assert.deepEqual(await chequear(11, "CHARGING"), { umbral: null, textos: [] });
  assert.deepEqual(await chequear(10, "CHARGING"), { umbral: null, textos: [] }, "con el 10 % justo, todavía no");
  assert.deepEqual(await chequear(9, "CHARGING"), { umbral: 10, textos: ["🤖 🔌 Me queda 9 % de batería y sigue bajando, aunque estoy cargando: el cargador no da abasto. Probá con otro antes de que me apague."] });
  assert.deepEqual(await chequear(8, "CHARGING"), { umbral: null, textos: [] }, "una sola vez, aunque siga bajando");
  assert.deepEqual(await chequear(4, "CHARGING"), { umbral: 5, textos: ["🤖 🪫 Me queda 4 % de batería y sigue bajando, aunque estoy cargando: me puedo apagar en cualquier momento. ¡Cambiá el cargador ya!"] });

  // Without a connection right then, it's told on the next check, though the percentage stayed put.
  globalThis.bateriaBajaAvisada.clear();
  globalThis.bateriaNoAlcanzaAvisada?.clear();
  globalThis.bateriaLecturaAnterior = null;
  await chequear(10, "CHARGING");
  globalThis.botConectado = false;
  try {
    assert.deepEqual(await chequear(9, "CHARGING"), { umbral: null, textos: [] });
  } finally {
    globalThis.botConectado = true;
  }
  assert.equal((await chequear(9, "CHARGING")).umbral, 10, "al volver la conexión");

  // Going up while charging, the charger keeps up: nothing to tell.
  globalThis.bateriaBajaAvisada.clear();
  globalThis.bateriaNoAlcanzaAvisada?.clear();
  globalThis.bateriaLecturaAnterior = null;
  assert.deepEqual(await chequear(6, "CHARGING"), { umbral: null, textos: [] });
  assert.deepEqual(await chequear(7, "CHARGING"), { umbral: null, textos: [] });
  // Against a reading from too long ago it can't tell: it may have been unplugged in between.
  const ahora = B._dep.ahora;
  B._dep.ahora = () => ahora() + B.BATERIA_BAJA.ENTRE_LECTURAS_MS + 60 * 1000;
  assert.deepEqual(await chequear(6, "CHARGING"), { umbral: null, textos: [] });
});

// The drop has to happen while charging: one since a reading taken unplugged is the time it was unplugged, and blamed a
// good charger just plugged in. And after an "Enchufame", a weak charger plugged in is still told about: the two
// notices used to share the record of what was told, and it stayed quiet down to 5 %.
test("batería baja: no culpa al cargador por lo que bajó desenchufada, y avisa del débil después del Enchufame", async () => {
  globalThis.bateriaBajaAvisada.clear();
  globalThis.bateriaNoAlcanzaAvisada?.clear();
  globalThis.bateriaLecturaAnterior = null;
  await chequear(10, "DISCHARGING");
  assert.deepEqual(await chequear(9, "CHARGING"), { umbral: null, textos: [] }, "bajó antes de que la enchufaran");
  assert.deepEqual(await chequear(10, "CHARGING"), { umbral: null, textos: [] });

  globalThis.bateriaBajaAvisada.clear();
  globalThis.bateriaLecturaAnterior = null;
  assert.deepEqual(await chequear(9, "DISCHARGING"), { umbral: 10, textos: [DIEZ(9)] });
  assert.deepEqual(await chequear(8, "CHARGING"), { umbral: null, textos: [] }, "recién enchufada");
  assert.deepEqual(await chequear(7, "CHARGING"), { umbral: 10, textos: ["🤖 🔌 Me queda 7 % de batería y sigue bajando, aunque estoy cargando: el cargador no da abasto. Probá con otro antes de que me apague."] });
  assert.deepEqual(await chequear(6, "CHARGING"), { umbral: null, textos: [] }, "una vez");
});

test("batería baja: de golpe por debajo del 5 %, un solo aviso; sin conexión, en la vuelta siguiente; sin batería que leer, nada", async () => {
  globalThis.bateriaBajaAvisada.clear();
  assert.deepEqual(await chequear(4), { umbral: 5, textos: [CINCO(4)] });
  assert.deepEqual(await chequear(3), { umbral: null, textos: [] }, "ni el del 10 % después");

  globalThis.bateriaBajaAvisada.clear();
  globalThis.botConectado = false;
  try {
    assert.deepEqual(await chequear(8), { umbral: null, textos: [] });
  } finally {
    globalThis.botConectado = true;
  }
  assert.deepEqual(await chequear(8), { umbral: 10, textos: [DIEZ(8)] }, "al volver la conexión");

  globalThis.bateriaBajaAvisada.clear();
  simular();
  assert.equal(await B.chequearBateriaBaja(), null);
});

// On a device whose system files can't be read, a single slow answer from Termux:API left the check half an hour
// without readings: here the notice at 9 % would have come 25 minutes late, or never. With the battery low it asks again
// on the next check; with the battery fine, the pause holds.
test("batería baja: un timeout de Termux:API no deja el chequeo media hora sin lecturas", async () => {
  let llamadas = 0;
  let responde = null; // what Termux:API answers; null: not in time
  let ahora = 2_000_000_000;
  B._dep.ahora = () => ahora;
  B._dep.ejecutar = async () => {
    llamadas++;
    if (!responde) throw Object.assign(new Error("termux-battery-status no contestó en 8 s"), { code: "ETIMEDOUT" });
    return { stdout: JSON.stringify(responde) };
  };
  B._dep.leer = async (ruta) => {
    throw Object.assign(new Error(`EACCES: permission denied, open '${ruta}'`), { code: "EACCES" });
  };
  const cadaCinco = async (respuesta) => {
    responde = respuesta;
    ahora += 5 * 60 * 1000;
    return B.chequearBateriaBaja();
  };
  globalThis.bateriaBajaAvisada.clear();
  globalThis.bateriaLecturaAnterior = null;
  globalThis.enviados = [];
  assert.equal(await cadaCinco({ percentage: 12, status: "DISCHARGING" }), null);
  assert.equal(await cadaCinco(null), null);
  assert.equal(await cadaCinco({ percentage: 9, status: "DISCHARGING" }), 10, "en el chequeo siguiente lo prueba de nuevo, y avisa");
  assert.equal(llamadas, 3);
  assert.deepEqual(globalThis.enviados.filter((e) => e.chat === OWNER).map((e) => e.msg.text), [DIEZ(9)]);

  await cadaCinco({ percentage: 40, status: "CHARGING" });
  await cadaCinco(null);
  await cadaCinco({ percentage: 40, status: "CHARGING" });
  assert.equal(llamadas, 5, "con la batería bien, la pausa sigue");

  // With no reading yet, the first check after a restart: nothing says the battery is fine, so no pause either.
  globalThis.bateriaLecturaAnterior = null;
  ahora += B.TERMUX_API.PAUSA_MS; // the pause from before is over
  await cadaCinco(null);
  assert.equal(await cadaCinco({ percentage: 4, status: "DISCHARGING" }), 5, "cinco minutos después lo prueba, y avisa");
  assert.equal(llamadas, 7);
});

// Going past 15 % makes both records ready again: the low battery's and the weak charger's.
test("batería baja: pasado el 15 %, el aviso del cargador que no da abasto vuelve a estar listo", async () => {
  globalThis.bateriaBajaAvisada.clear();
  globalThis.bateriaNoAlcanzaAvisada?.clear();
  globalThis.bateriaLecturaAnterior = null;
  await chequear(10, "CHARGING");
  assert.equal((await chequear(9, "CHARGING")).umbral, 10);
  await chequear(16, "CHARGING");
  await chequear(10, "CHARGING");
  assert.equal((await chequear(9, "CHARGING")).umbral, 10, "otra descarga, otro aviso");
});

test("consistencia: las tareas de cada 5 minutos miran la batería", () => {
  const fuente = fs.readFileSync(new URL("../lib/tareas-programadas.js", import.meta.url), "utf8");
  assert.match(fuente, /chequearBateriaBaja\(\)\.catch/);
});
