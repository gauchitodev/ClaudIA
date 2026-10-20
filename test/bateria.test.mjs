import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { prepararBase, ultimoEnviado } from "./helpers.mjs";
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
// tell again once it's charging or past 15 %. The bot goes with the device, and with it every group.
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
  // On the charger it's ready again; unplugged before 15 %, the same notice isn't given twice.
  assert.deepEqual(await chequear(3, "CHARGING"), { umbral: null, textos: [] });
  assert.equal((await chequear(7)).umbral, 10);
  assert.equal((await chequear(12)).umbral, null);
  assert.equal((await chequear(9)).umbral, null, "sin enchufarse ni pasar del 15 %, el del 10 % ya está dado");
  assert.equal((await chequear(16)).umbral, null);
  assert.equal((await chequear(9)).umbral, 10, "pasado el 15 %, de nuevo");
  // Connected without charging doesn't keep up, and full counts as charging.
  assert.equal((await chequear(4, "NOT_CHARGING")).umbral, 5);
  assert.equal((await chequear(100, "FULL")).umbral, null);
  assert.equal((await chequear(9, "Discharging")).umbral, 10, "con el estado de los archivos del sistema también");
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

test("consistencia: las tareas de cada 5 minutos miran la batería", () => {
  const fuente = fs.readFileSync(new URL("../lib/tareas-programadas.js", import.meta.url), "utf8");
  assert.match(fuente, /chequearBateriaBaja\(\)\.catch/);
});
