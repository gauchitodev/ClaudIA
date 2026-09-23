// What the bot itself sends. Every send goes through here once: it waits its turn (lib/ritmo.js) and gets counted in
// envios_bot, by chat, day, hour and kind.
//
// Why a wrapper around client.sendMessage, and not the bot's own messages echoing back (Baileys re-emits them with
// emitOwnEvents): the echo would also count whatever someone types from Claudia's phone. And why the pace lives here:
// it used to be applied only in sendText, so the roulette, the reactions and every direct sendMessage went out without
// waiting — the kind of volume WhatsApp blocked the number for.
import { esperarTurno, RITMO } from "./ritmo.js";
import { claveDia, ACTIVIDAD, ultimosDias, lineasDeDias, lineasHorasPico } from "./actividad.js";
import { nombreDeGrupo } from "./cache-grupos.js";
import { DIA_MS } from "./tiempo.js";
import { sumarEnvioBot, enviosBotPorDia, enviosBotPorHora, enviosBotPorTipo, enviosBotPorChat, primerDiaEnviosBot, podarEnviosBot } from "../database-functions.js";

const MULTIMEDIA = ["image", "video", "audio", "document", "sticker"];
const MULTIMEDIA_REENVIADA = ["imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage"];

// The kind of send, from the content handed to sendMessage. Never throws: it runs before the send.
export function tipoDeEnvio(contenido) {
  if (contenido?.react) return "reaccion";
  if (contenido?.delete) return "borrado";
  if (contenido?.edit) return "otro"; // an edit wraps any content, so it's checked before the text
  // A forward (the anti-delete, the hidetags) is whatever it forwards.
  const reenviado = contenido?.forward?.message;
  if (reenviado) {
    if (MULTIMEDIA_REENVIADA.some((clave) => reenviado[clave])) return "multimedia";
    if (reenviado.conversation != null || reenviado.extendedTextMessage) return "texto";
    return "otro";
  }
  if (MULTIMEDIA.some((clave) => contenido?.[clave])) return "multimedia";
  if (contenido?.text != null) return "texto"; // "" too: a hidetag with no text is still a message
  return "otro"; // polls and the like
}

// Reactions the queue didn't send because their turn was too far off. In memory, since the bot started: it's how
// .enviados shows that the reactions' queue is doing its job.
const descartadas = { reacciones: 0 };
export const reaccionesDescartadas = () => descartadas.reacciones;

// Groups by their id; every other chat into a single "privado" row: how much the bot talks in private matters, to
// whom doesn't.
export function registrarEnvio(chat, tipo, ahora = new Date()) {
  const donde = String(chat || "").endsWith("@g.us") ? chat : "privado";
  sumarEnvioBot(donde, claveDia(ahora), ahora.getHours(), tipo);
}

// Swaps client.sendMessage for one that waits its turn and counts what went out. Deletions don't wait: they're
// moderation (spam, a muted person), and late they're worse. Reactions wait in a queue of their own and are dropped
// when their turn is more than REACCION_ESPERA_MAX_MS away: a busy trivia reacts to every answer, and in the messages'
// queue that burst held up the bot's replies for up to 25 s. A dropped reaction returns undefined; whoever reacts
// already ignores the result.
export function envolverEnvios(client) {
  const enviar = client.sendMessage;
  if (typeof enviar !== "function" || enviar.envuelto) return client; // wrapping twice would wait twice
  const envuelto = async (jid, contenido, ...resto) => {
    const tipo = tipoDeEnvio(contenido);
    if (tipo === "reaccion") {
      const espera = await esperarTurno(jid, { fila: "reacciones", descartarSiPasa: RITMO.REACCION_ESPERA_MAX_MS });
      if (espera === null) {
        descartadas.reacciones++;
        return undefined;
      }
    } else if (tipo !== "borrado") {
      await esperarTurno(jid);
    }
    const enviado = await enviar(jid, contenido, ...resto);
    // Only what went out counts: Baileys returns nothing when it sends nothing (a disappearing-messages setting, for
    // instance). And counting never breaks a send: by now the message is out, and a database hiccup shouldn't make it
    // look failed.
    if (enviado) {
      try {
        registrarEnvio(jid, tipo);
      } catch (e) {
        console.error("[envios] no se pudo contar un envío:", e?.message || e);
      }
    }
    return enviado;
  };
  envuelto.envuelto = true;
  client.sendMessage = envuelto;
  return client;
}

// ---------- .enviados ----------

const NOMBRE_TIPO = { texto: "textos", multimedia: "multimedia", reaccion: "reacciones", borrado: "borrados", otro: "otros" };
const MAX_EN_RANKING = 5;

// What the bot sent in a group (chat) or everywhere (chat null), over the last week. Async because the general one
// names the groups. Returns { texto, mentions }.
export async function textoEnviados(client, { chat = null, ahora = new Date() } = {}) {
  const titulo = chat ? "🤖 *LO QUE MANDÉ EN ESTE GRUPO*" : "🤖 *LO QUE MANDÉ*";
  const dias = ultimosDias(ahora);
  const porDia = new Map(enviosBotPorDia(chat, dias).map((r) => [r.fecha, r.total]));
  const total = dias.reduce((t, d) => t + (porDia.get(d) || 0), 0);
  if (total === 0) return { texto: `${titulo}\n\nNo tengo envíos contados de los últimos 7 días${chat ? " en este grupo" : ""}.`, mentions: [] };

  const porHora = Array(24).fill(0);
  for (const r of enviosBotPorHora(chat, dias)) porHora[r.hora] = r.total;
  const lineas = [...lineasDeDias({ dias, porDia, desde: primerDiaEnviosBot(chat) }), "", ...lineasHorasPico(porHora)];

  const tipos = enviosBotPorTipo(chat, dias).map((r) => `${r.total} ${NOMBRE_TIPO[r.tipo] || r.tipo}`);
  lineas.push("", `*Por tipo:* ${tipos.join(" · ")}`);

  if (!chat) {
    const donde = enviosBotPorChat(dias).slice(0, MAX_EN_RANKING);
    lineas.push("", "*Dónde*");
    for (const r of donde) {
      const nombre = r.chat === "privado" ? "privados" : await nombreDeGrupo(client, r.chat);
      lineas.push(`${nombre}: ${r.total} · ${Math.round((r.total / total) * 100)}%`);
    }
  }

  const sinMandar = reaccionesDescartadas();
  if (sinMandar > 0) lineas.push("", `Reacciones que la cola no mandó desde que arranqué: ${sinMandar}`);

  return { texto: `${titulo}\n\n${lineas.join("\n")}`, mentions: [] };
}

// Drops what's older than the same 90 days .podar keeps of the group activity. Returns how many rows went.
export function podarEnvios(ahora = Date.now()) {
  return podarEnviosBot(claveDia(new Date(ahora - ACTIVIDAD.HORARIA_DIAS * DIA_MS)));
}
