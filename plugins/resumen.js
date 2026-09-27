import { mensajesRecientes, historialCompletoDesde, esComando } from "../lib/contexto-chat.js";
import { preguntarIA } from "../lib/ia.js";
import { duracion } from "../lib/tiempo.js";

if (!globalThis.resumenCooldown) globalThis.resumenCooldown = new Map();
const COOLDOWN_MS = 5 * 60 * 1000;

const plugin = {};
plugin.cmd = ["resumen", "quemeperdi"];
plugin.onlyGroup = true;

// .resumen [hours]: an AI summary of the group's latest messages (from 1 to 24 hours, 6 by default).
// Only what's been kept in memory since the bot started counts; no WhatsApp history is read.
plugin.run = async (m, { client, args }) => {
  if (!globalThis.geminiApiKey) return client.sendText(m.chat, "Falta configurar la API key de Gemini en config.toml (geminiApiKey).", m);
  const pedido = parseInt(args[0], 10);
  const horas = Number.isNaN(pedido) ? 6 : Math.min(24, Math.max(1, pedido));

  const ultimo = globalThis.resumenCooldown.get(m.chat) || 0;
  if (Date.now() - ultimo < COOLDOWN_MS) return client.sendText(m.chat, `Recién hice un resumen; esperá ${duracion(COOLDOWN_MS - (Date.now() - ultimo))} y pedilo de nuevo.`, m);

  const ahora = Date.now();
  const desde = ahora - horas * 60 * 60 * 1000;
  const lista = mensajesRecientes(m.chat, desde).filter((x) => !esComando(x.texto));
  if (lista.length < 5) return client.sendText(m.chat, `Casi no hubo mensajes en las últimas ${horas} h. Ojo que guardo solo lo que pasa desde que arranqué, hace ${duracion(process.uptime() * 1000)}.`, m);

  // What the summary really covers: in a busy group the oldest messages of the window no longer fit in memory, and
  // nothing from before the bot started is there. The header says so instead of promising the hours asked for.
  const cubreDesde = Math.max(historialCompletoDesde(m.chat, desde), ahora - process.uptime() * 1000);
  const recortado = cubreDesde - desde > 60 * 1000;
  const periodo = recortado ? duracion(ahora - cubreDesde) : `${horas} h`;

  // Set before asking, so two requests at once don't both go to the AI; undone if the AI fails, so it can be retried.
  globalThis.resumenCooldown.set(m.chat, ahora);
  await client.sendPresenceUpdate("composing", m.chat);

  const transcripcion = lista.map((x) => `- ${x.esBot ? "Claudia (vos)" : x.nombre}: ${x.texto}`).join("\n");
  const consulta = `Estos son los mensajes del grupo de las últimas ${periodo}, del más viejo al más nuevo:\n${transcripcion}\n\n(Instrucción para vos, no la muestres: hacé un resumen para alguien que no estuvo, de 4 a 8 líneas, con tu tono de siempre. Contá de qué se habló y quién dijo qué cuando importe, sin inventar nada que no esté ahí. No uses @ ni menciones. Si hay varios temas sueltos, listalos con guiones.)`;
  const r = await preguntarIA(consulta);
  if (!r.ok) {
    globalThis.resumenCooldown.delete(m.chat);
    return client.sendText(m.chat, r.sinCuota ? "Se me acabó la cuota de la IA por hoy, no puedo resumir 😅" : "Se me trabó el resumen, probá de nuevo en un rato.", m);
  }
  const aviso = recortado ? `; pediste ${horas} h, pero no tengo guardado más atrás` : "";
  await client.sendText(m.chat, `📝 *Resumen de las últimas ${periodo}* (${lista.length} mensajes${aviso})\n\n${r.texto}`, m);
};

export default plugin;
