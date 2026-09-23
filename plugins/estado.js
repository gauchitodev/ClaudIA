import os from "os";
import fs from "fs";
import { contarPendientesPorTipo, getTotalUsers } from "../database-functions.js";
import { ultimoBackup, tamano } from "../lib/backup.js";
import { duracion, textoFecha } from "../lib/tiempo.js";
import { COOLDOWN_REINTENTO_MS } from "../lib/gemini.js";
import { estadisticas, guardarVarios } from "../lib/cache-grupos.js";

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
    const pedida = Date.now();
    const todos = await client.groupFetchAllParticipating();
    grupos = Object.keys(todos).length;
    guardarVarios(client, todos, pedida); // the query is already paid for: it may as well fill the cache
  } catch {}

  // If "pedidos" climbs with every message the bot sends, the cache isn't plugged into Baileys. See lib/cache-grupos.js.
  const c = estadisticas();
  const cache = `${c.grupos} ${c.grupos === 1 ? "grupo" : "grupos"} · ${c.aciertos} aciertos, ${c.pedidos} pedidos`;

  // What client.chats holds (lib/wa-socket.js, pushMessage): an entry per chat and per person who writes, and up to 40
  // recent messages in each chat and in each person someone quoted. Only a restart empties it: this line sits next to
  // the memory to tell whether it needs a ceiling.
  const chats = Object.entries(client.chats || {});
  const gruposEnMemoria = chats.filter(([id]) => id.endsWith("@g.us")).length;
  const mensajes = chats.reduce((total, [, chat]) => total + Object.keys(chat?.messages || {}).length, 0);
  const enMemoria = `${chats.length} chats y contactos (${gruposEnMemoria} grupos) · ${mensajes} mensajes`;

  const texto = [
    `🤖 *Claudia ${globalThis.botVersion}* · Node ${process.version}`,
    `⏱️ Encendida: ${duracion(process.uptime() * 1000)} · conectada: ${conectada}`,
    `🧠 IA: ${ia}`,
    `📥 Descargas: ${descargas}`,
    `⏰ Pendientes: ${pendientes}`,
    `🗄️ Último backup: ${backup} · base: ${base}`,
    `👥 Grupos: ${grupos} · usuarios: ${getTotalUsers()} · plugins: ${Object.keys(globalThis.plugins || {}).length}`,
    `🗂️ Caché de grupos: ${cache}`,
    `🗃️ En memoria: ${enMemoria}`,
    `💾 Memoria: ${tamano(process.memoryUsage().rss)} · carga: ${os.loadavg()[0].toFixed(2)}`,
  ].join("\n");
  await client.sendText(m.chat, texto, m);
};

export default plugin;
