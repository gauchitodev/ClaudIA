import os from "os";
import fs from "fs";
import { contarPendientesPorTipo, getTotalUsers } from "../database-functions.js";
import { ultimoBackup, tamano } from "../lib/backup.js";
import { duracion, textoFecha } from "../lib/tiempo.js";
import { modelosEnPausa } from "../lib/gemini.js";
import { modeloActivo } from "../lib/ia.js";
import { estadisticas, guardarVarios } from "../lib/cache-grupos.js";
import { leerBateria, estadoBateria } from "../lib/bateria.js";
import { reenviosPerdidos, REENVIOS } from "../lib/reenvios.js";
import { colaDescargas } from "../lib/cola-descargas.js";
import { configuracion } from "../lib/configuracion.js";
import { conexion } from "../lib/conexion.js";
import { cargados } from "../lib/plugins-cargados.js";
import { lineaDeBaileys } from "../lib/parche-baileys.js";

const plugin = {};
plugin.cmd = ["estado", "status"];
plugin.onlyMod = true;

plugin.run = async (m, { client }) => {
  // Started first so its wait (up to 8 s without Termux:API) overlaps the groups query below instead of adding to it.
  const leyendoBateria = leerBateria();
  const ahora = Date.now();
  const conectada = conexion.horaConexion ? duracion(ahora - conexion.horaConexion) : "?";

  const enPausa = modelosEnPausa(ahora).map((p) => `${p.modelo} (vuelve en ${duracion(p.faltaMs)})`);
  const ia = `${modeloActivo() || "todavía no respondió ninguno"}${enPausa.length ? ` · en pausa por cuota: ${enPausa.join(", ")}` : ""}`;

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

  // The messages of the bot's someone asked for again when Baileys no longer had them to send (lib/reenvios.js): for
  // whoever asked, that message stays as "Esperando el mensaje". The line is here to tell whether keeping what the bot
  // sends is worth it (issue #5).
  const r = reenviosPerdidos(new Date(ahora));
  const [, mes, dia] = (r.desde || "").split("-").map(Number);
  // And, when there were any, why they were missing, which is what says what would have had them: see causaDe there.
  const porQue = [`${r.antesDeArrancar} de antes de arrancar`, `${r.tarde} de más de ${REENVIOS.EN_BAILEYS_MS / 60000} min`, `${r.reciente} ${r.reciente === 1 ? "reciente" : "recientes"}`];
  if (r.sinClasificar) porQue.push(`${r.sinClasificar} sin clasificar`);
  // And, on a line under it, what asked for them, with the most devices of each kind that asked in one day: that tells
  // many people missing a message from a few devices asking for a lot, and what Baileys would do with one handed over
  // (quienPide there). "Distintos por día" is said once, with the first kind that has any.
  const quienes = [
    [r.deTelefono, r.telefonos, "teléfonos"],
    [r.deVinculado, r.vinculados, "dispositivos vinculados"],
    [r.dePropio, r.propios, "mi propio número"],
  ];
  const primero = quienes.findIndex(([pedidos]) => pedidos);
  const porQuien = quienes.map(([pedidos, dispositivos, nombre], i) => {
    if (!pedidos) return `0 desde ${nombre}`;
    return `${pedidos} desde ${nombre} (hasta ${dispositivos}${i === primero ? ` ${dispositivos === 1 ? "distinto" : "distintos"} por día` : ""})`;
  });
  if (r.sinQuien) porQuien.push(`${r.sinQuien} de antes de contar quién`);
  const reenvios = `hoy ${r.hoy} · 7 días: ${r.semana}${r.desde ? ` (cuento desde el ${dia}/${mes})` : ""}${r.semana ? ` · ${porQue.join(", ")}\n   └ Me los pidieron: ${porQuien.join(", ")}` : ""}`;

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
    `🤖 *Claudia ${configuracion.botVersion}* · Node ${process.version} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    // Which Baileys it runs on, and whether the fix for the sessions is on it (lib/parche-baileys.js).
    lineaDeBaileys(),
    `⏱️ Encendida: ${duracion(process.uptime() * 1000)} · conectada: ${conectada}`,
    `🧠 IA: ${ia}`,
    `📥 Descargas: ${descargas}`,
    `⏰ Pendientes: ${pendientes}`,
    `🗄️ Último backup: ${backup} · base: ${base}`,
    `👥 Grupos: ${grupos} · usuarios: ${getTotalUsers()} · plugins: ${Object.keys(cargados.plugins || {}).length}`,
    `🗂️ Caché de grupos: ${cache}`,
    `📨 Reenvíos que no pude hacer: ${reenvios}`,
    `🗃️ En memoria: ${enMemoria}`,
    `💾 Memoria: ${tamano(process.memoryUsage().rss)} · carga: ${os.loadavg()[0].toFixed(2)}`,
    `🔋 Batería: ${bateria}`,
  ].join("\n");
  await client.sendText(m.chat, texto, m);
};

export default plugin;
