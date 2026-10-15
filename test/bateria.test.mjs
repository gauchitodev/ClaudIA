import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
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
