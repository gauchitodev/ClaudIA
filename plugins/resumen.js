import { mensajesRecientes } from "../lib/contexto-chat.js";
import { preguntarIA } from "../lib/ia.js";
import { duracion } from "../lib/tiempo.js";

if (!globalThis.resumenCooldown) globalThis.resumenCooldown = new Map();
const COOLDOWN_MS = 5 * 60 * 1000;

const plugin = {};
plugin.cmd = ["resumen", "quemeperdi"];
plugin.onlyGroup = true;

// .resumen [horas]: resumen con IA de los últimos mensajes del grupo (de 1 a 24 horas, 6 por defecto).
// Solo cuenta lo guardado en memoria desde que arrancó el bot; no se lee historial de WhatsApp.
plugin.run = async (m, { client, args }) => {
  if (!globalThis.geminiApiKey) return client.sendText(m.chat, "Falta configurar la API key de Gemini en config.toml (geminiApiKey).", m);
  const horas = Math.min(24, Math.max(1, parseInt(args[0], 10) || 6));

  const ultimo = globalThis.resumenCooldown.get(m.chat) || 0;
  if (Date.now() - ultimo < COOLDOWN_MS) return client.sendText(m.chat, `Recién hice un resumen; esperá ${duracion(COOLDOWN_MS - (Date.now() - ultimo))} y pedilo de nuevo.`, m);

  const desde = Date.now() - horas * 60 * 60 * 1000;
  const lista = mensajesRecientes(m.chat, desde).filter((x) => !globalThis.prefix.some((p) => x.texto.startsWith(p)));
  if (lista.length < 5) return client.sendText(m.chat, `Casi no hubo mensajes en las últimas ${horas} h. Ojo que guardo solo lo que pasa desde que arranqué, hace ${duracion(process.uptime() * 1000)}.`, m);

  globalThis.resumenCooldown.set(m.chat, Date.now());
  await client.sendPresenceUpdate("composing", m.chat);

  const transcripcion = lista.map((x) => `- ${x.esBot ? "Claudia (vos)" : x.nombre}: ${x.texto}`).join("\n");
  const consulta = `Estos son los mensajes del grupo de las últimas ${horas} horas, del más viejo al más nuevo:\n${transcripcion}\n\n(Instrucción para vos, no la muestres: hacé un resumen para alguien que no estuvo, de 4 a 8 líneas, con tu tono de siempre. Contá de qué se habló y quién dijo qué cuando importe, sin inventar nada que no esté ahí. No uses @ ni menciones. Si hay varios temas sueltos, listalos con guiones.)`;
  const r = await preguntarIA(consulta);
  if (!r.ok) return client.sendText(m.chat, r.sinCuota ? "Se me acabó la cuota de la IA por hoy, no puedo resumir 😅" : "Se me trabó el resumen, probá de nuevo en un rato.", m);
  await client.sendText(m.chat, `📝 *Resumen de las últimas ${horas} h* (${lista.length} mensajes)\n\n${r.texto}`, m);
};

export default plugin;
