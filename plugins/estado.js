import os from "os";
import fs from "fs";
import { contarPendientesPorTipo, getTotalUsers } from "../database-functions.js";
import { ultimoBackup, tamano } from "../lib/backup.js";
import { duracion, textoFecha } from "../lib/tiempo.js";
import { modelosEnPausa } from "../lib/gemini.js";
import { estadisticas, guardarVarios } from "../lib/cache-grupos.js";
import { leerBateria, estadoBateria } from "../lib/bateria.js";
import { colaDescargas } from "../lib/cola-descargas.js";

const plugin = {};
plugin.cmd = ["estado", "status"];
plugin.onlyMod = true;

plugin.run = async (m, { client }) => {
  // Started first so its wait (up to 8 s without Termux:API) overlaps the groups query below instead of adding to it.
  const leyendoBateria = leerBateria();
  const ahora = Date.now();
  const conectada = globalThis.horaConexion ? duracion(ahora - globalThis.horaConexion) : "?";

  const enPausa = modelosEnPausa(ahora).map((p) => `${p.modelo} (vuelve en ${duracion(p.faltaMs)})`);
  const ia = `${globalThis.modeloActivo || "todavía no respondió ninguno"}${enPausa.length ? ` · en pausa por cuota: ${enPausa.join(", ")}` : ""}`;

  const descargas = `${colaDescargas.procesando ? "1 en curso" : "ninguna en curso"}, ${colaDescargas.tareas.length} en cola`;

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

  // If "pedidos" climbs with every message the bot sends, the cache isn't plugged into Baileys.
  // See lib/cache-grupos.js.
  const c = estadisticas();
  const cache = `${c.grupos} ${c.grupos === 1 ? "grupo" : "grupos"} · ${c.aciertos} aciertos, ${c.pedidos} pedidos`;

  // What client.chats holds (lib/wa-socket.js, pushMessage): an entry per chat and per person who writes, and up to 40
  // recent messages in each chat and in each person someone quoted. Only a restart empties it: this line sits next to
  // the memory to tell whether it needs a ceiling.
  const chats = Object.entries(client.chats || {});
  const gruposEnMemoria = chats.filter(([id]) => id.endsWith("@g.us")).length;
  const mensajes = chats.reduce((total, [, chat]) => total + Object.keys(chat?.messages || {}).length, 0);
  const enMemoria = `${chats.length} chats y contactos (${gruposEnMemoria} grupos) · ${mensajes} mensajes`;

  const pila = await leyendoBateria;
  const bateria = pila ? [`${pila.porcentaje}%`, estadoBateria(pila.estado), Number.isFinite(pila.temperatura) ? `${pila.temperatura.toFixed(1)} °C` : ""].filter(Boolean).join(" · ") : "no la pude leer (falta Termux:API)";

  const texto = [
    `🤖 *Claudia ${globalThis.botVersion}* · Node ${process.version} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `⏱️ Encendida: ${duracion(process.uptime() * 1000)} · conectada: ${conectada}`,
    `🧠 IA: ${ia}`,
    `📥 Descargas: ${descargas}`,
    `⏰ Pendientes: ${pendientes}`,
    `🗄️ Último backup: ${backup} · base: ${base}`,
    `👥 Grupos: ${grupos} · usuarios: ${getTotalUsers()} · plugins: ${Object.keys(globalThis.plugins || {}).length}`,
    `🗂️ Caché de grupos: ${cache}`,
    `🗃️ En memoria: ${enMemoria}`,
    `💾 Memoria: ${tamano(process.memoryUsage().rss)} · carga: ${os.loadavg()[0].toFixed(2)}`,
    `🔋 Batería: ${bateria}`,
  ].join("\n");
  await client.sendText(m.chat, texto, m);
};

export default plugin;
