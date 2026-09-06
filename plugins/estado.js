import os from "os";
import fs from "fs";
import { contarPendientesPorTipo, getTotalUsers } from "../database-functions.js";
import { ultimoBackup, tamano } from "../lib/backup.js";
import { duracion, textoFecha } from "../lib/tiempo.js";
import { COOLDOWN_REINTENTO_MS } from "../lib/gemini.js";

const plugin = {};
plugin.cmd = ["estado", "status"];
plugin.onlyMod = true;

plugin.run = async (m, { client }) => {
  const ahora = Date.now();
  const conectada = globalThis.horaConexion ? duracion(ahora - globalThis.horaConexion) : "?";

  const sinCuota = [...(globalThis.modeloSinCuotaDesde || new Map()).entries()].filter(([, desde]) => ahora - desde < COOLDOWN_REINTENTO_MS).map(([modelo]) => modelo);
  const ia = `${globalThis.modeloActivo || "todavía no respondió ninguno"}${sinCuota.length ? ` · sin cuota: ${sinCuota.join(", ")}` : ""}`;

  const cola = globalThis.colaDescargas || { tareas: [], procesando: false };
  const descargas = `${cola.procesando ? "1 en curso" : "ninguna en curso"}, ${cola.tareas.length} en cola`;

  const nombres = { recordatorio: "recordatorios", reintento_descarga: "reintentos de descarga", cerrar_mercado: "cierres de mercado", anular_mercado: "anulaciones de mercado" };
  const pendientes = contarPendientesPorTipo().map((p) => `${p.total} ${nombres[p.tipo] || p.tipo}`).join(", ") || "ninguno";

  const b = ultimoBackup();
  const backup = b ? `${textoFecha(b.fecha)} (${tamano(b.bytes)})` : "todavía ninguno";
  const base = fs.existsSync("./database/database.db") ? tamano(fs.statSync("./database/database.db").size) : "?";

  let grupos = "?";
  try {
    grupos = Object.keys(await client.groupFetchAllParticipating()).length;
  } catch {}

  const texto = [
    `🤖 *Claudia ${globalThis.botVersion}* · Node ${process.version}`,
    `⏱️ Encendida: ${duracion(process.uptime() * 1000)} · conectada: ${conectada}`,
    `🧠 IA: ${ia}`,
    `📥 Descargas: ${descargas}`,
    `⏰ Pendientes: ${pendientes}`,
    `🗄️ Último backup: ${backup} · base: ${base}`,
    `👥 Grupos: ${grupos} · usuarios: ${getTotalUsers()} · plugins: ${Object.keys(globalThis.plugins || {}).length}`,
    `💾 Memoria: ${tamano(process.memoryUsage().rss)} · carga: ${os.loadavg()[0].toFixed(2)}`,
  ].join("\n");
  await client.sendText(m.chat, texto, m);
};

export default plugin;
