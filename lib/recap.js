// Weekly recap: on Sunday night, in the groups that have it on (.recapsemanal, on by default), Claudia sums up the
// week from the database: messages, the most active, the most voted, lightning trivias, the lottery, the markets,
// the richest, and a line from the AI about the most talked-about thing if there are messages in memory.
import { chatsConOpcion, periodoCerrado, marcarPeriodoCerrado, topMensajesEntre, totalMensajesEntre, topCoins, boletosLoteria, entradaMasVotada, contarLogDesde, ganadoresLogDesde, mercadosResueltosDesde } from "../database-functions.js";
import { HASHTAGS_CONFIG, semanaDe } from "./hashtags.js";
import { mensajesRecientes } from "./contexto-chat.js";
import { preguntarIA } from "./ia.js";
import { ACTIVIDAD, claveDia } from "./actividad.js";
import { DIA_MS } from "./tiempo.js";

const mencion = (lid) => `@${lid.split("@")[0]}`;
const MEDALLAS = ["🥇", "🥈", "🥉"];

// local Monday 00:00 of the current week, and the 7 day keys
export function rangoSemana(ahora = Date.now()) {
  const d = new Date(ahora);
  const dia = d.getDay();
  d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));
  d.setHours(0, 0, 0, 0);
  const desdeMs = d.getTime();
  const fechas = Array.from({ length: 7 }, (_, i) => claveDia(new Date(desdeMs + i * DIA_MS)));
  return { desdeMs, fechas };
}

// Returns { texto, mentions } or null if there was no activity.
export async function armarRecap(chat, ahora = Date.now()) {
  const { desdeMs, fechas } = rangoSemana(ahora);
  const total = totalMensajesEntre(chat, fechas);
  if (total === 0) return null;
  const semana = semanaDe(ahora);
  const lineas = [`💬 Mensajes de la semana: *${total}*`];
  const mentions = [];

  const top = topMensajesEntre(chat, fechas, 3);
  if (top.length) {
    lineas.push(`🏃 Los que más hablaron: ${top.map((t, i) => `${MEDALLAS[i]} ${mencion(t.usuario)} (${t.total})`).join(" · ")}`);
    mentions.push(...top.map((t) => t.usuario));
  }
  for (const [tag, cfg] of Object.entries(HASHTAGS_CONFIG)) {
    const e = entradaMasVotada(chat, tag, semana);
    if (!e) continue;
    lineas.push(`${cfg.emoji} ${cfg.nombre} más votada: ${mencion(e.usuario)} (${e.reacciones} reacciones)`);
    mentions.push(e.usuario);
  }
  const relampagos = ganadoresLogDesde(chat, "trivia_relampago", desdeMs);
  if (relampagos.length) {
    lineas.push(`⚡ Trivias relámpago: ${relampagos.slice(0, 3).map((g) => `${mencion(g.usuario)} ×${g.total}`).join(", ")}`);
    mentions.push(...relampagos.slice(0, 3).map((g) => g.usuario));
  }
  const respuestas = contarLogDesde(chat, "pregunta_dia", desdeMs);
  if (respuestas) lineas.push(`💭 Respuestas a la pregunta del día: ${respuestas}`);
  const boletos = boletosLoteria(chat, semana);
  const nBoletos = boletos.reduce((s, b) => s + b.cantidad, 0);
  if (nBoletos) lineas.push(`🎟️ Lotería: ${nBoletos} boletos de ${boletos.length} ${boletos.length === 1 ? "persona" : "personas"}; se sortea al empezar la semana`);
  const mercados = mercadosResueltosDesde(chat, desdeMs);
  if (mercados.length) lineas.push(`📊 Mercados resueltos: ${mercados.map((m) => `${m.titulo} → ${m.opciones[m.ganadora]}`).join(" · ")}`);
  const ricos = topCoins(chat, 3);
  if (ricos.length) {
    lineas.push(`🪙 Los más ricos: ${ricos.map((r) => `${mencion(r.usuario)} (${r.saldo})`).join(", ")}`);
    mentions.push(...ricos.map((r) => r.usuario));
  }
  const recientes = mensajesRecientes(chat, desdeMs).filter((x) => !x.esBot);
  if (globalThis.geminiApiKey && recientes.length >= 30) {
    const r = await preguntarIA(`Estos son mensajes del grupo de esta semana:\n${recientes.slice(-150).map((x) => `- ${x.nombre}: ${x.texto}`).join("\n")}\n\n(Instrucción para vos, no la muestres: decí en UNA sola frase, con tu onda, cuál fue el tema o el momento más comentado. Sin @, sin inventar nada.)`).catch(() => ({ ok: false }));
    if (r.ok && r.texto && r.texto.length < 300) lineas.push(`🗣️ Lo más comentado: ${r.texto.trim()}`);
  }
  return { texto: `📅 *RECAP DE LA SEMANA*\n\n${lineas.join("\n")}`, mentions: [...new Set(mentions)] };
}

// Runs every 5 minutes from tareas-programadas.js
export async function chequearRecapSemanal() {
  const ahora = new Date();
  if (ahora.getDay() !== ACTIVIDAD.DIA_RECAP || ahora.getHours() < ACTIVIDAD.HORA_RECAP) return;
  const semana = semanaDe(Date.now());
  for (const chat of chatsConOpcion("recapSemanal")) {
    if (periodoCerrado(chat, "recap", semana)) continue;
    marcarPeriodoCerrado(chat, "recap", semana);
    try {
      const r = await armarRecap(chat);
      if (r) await globalThis.client.sendMessage(chat, { text: r.texto, mentions: r.mentions });
    } catch (e) {
      console.error("[recap]", e.message);
    }
  }
}
