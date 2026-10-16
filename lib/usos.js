// The commands people use: each one that runs is counted, by chat, day and command as typed. It's what the menu's "lo
// más usado" is built from (lib/menu.js) and what .usos shows, and .podar trims it like the other day-by-day tables.
//
// What counts is a command that got past the dispatcher's checks and reached its plugin (handle-message.js): once per
// message even when two plugins share it, and even if the plugin then fails. A refusal from inside the plugin (".casino
// on" from someone who isn't an admin, ".play" with no title) counts too; one the dispatcher stops (no permission, a
// command blocked with .bladd, a banned person, a command that doesn't exist) doesn't.
import { claveDia, ultimosDias, ACTIVIDAD } from "./actividad.js";
import { nombreDeGrupo } from "./cache-grupos.js";
import { DIA_MS } from "./tiempo.js";
import { sumarUsoComando, usosPorComando, usosPorChat, primerDiaUsos, podarUsosComandos } from "../database-functions.js";

export const USOS = {
  DIAS: 30, // the window: the menu's ranking and .usos look at the last 30 days
  MAX_EN_PANEL: 15,
  MAX_LUGARES: 5, // groups listed under "Dónde" in the general .usos
};

// Groups by their id; every other chat into a single "privado" row, like what the bot sends (lib/envios.js).
export const lugarDeUso = (chat) => (String(chat || "").endsWith("@g.us") ? chat : "privado");

// Never throws: it runs in the middle of the dispatcher, and counting mustn't stop a command.
export function registrarUso(chat, comando, ahora = new Date()) {
  try {
    const cmd = String(comando || "").toLowerCase();
    if (cmd) sumarUsoComando(lugarDeUso(chat), claveDia(ahora), cmd);
  } catch (e) {
    console.error("[usos] no se pudo contar un comando:", e?.message || e);
  }
}

// How a command is shown: ".audio", and the bot's own number (talking to the AI by mentioning her, plugins/tools-ia.js)
// as "@mención".
export function nombreDeComando(cmd) {
  const botLid = globalThis.client?.user?.lid?.split("@")[0];
  return botLid && cmd === botLid ? "@mención" : `.${cmd}`;
}

const fechaCorta = (fecha) => {
  const [, mes, dia] = fecha.split("-").map(Number);
  return `${dia}/${mes}`;
};

// .usos: the most used commands in a group (chat), or everywhere with chat null, over the last USOS.DIAS days. Async
// because the general one names the groups. Returns { texto, mentions }.
export async function textoUsos(client, { chat = null, ahora = new Date() } = {}) {
  const titulo = chat ? "📈 *LO MÁS USADO EN ESTE GRUPO*" : "📈 *LO MÁS USADO*";
  const dias = ultimosDias(ahora, USOS.DIAS);
  const filas = usosPorComando(chat, dias, { conPrivados: !chat });
  const total = filas.reduce((t, f) => t + f.total, 0);
  if (total === 0) return { texto: `${titulo}\n\nNo tengo usos de comandos contados de los últimos ${USOS.DIAS} días${chat ? " en este grupo" : ""}.`, mentions: [] };

  // Counting may have started inside the window: then it says since when, instead of a 30 days it doesn't have.
  const desde = primerDiaUsos(chat);
  const periodo = desde && desde > dias[dias.length - 1] ? `Desde el ${fechaCorta(desde)}` : `Últimos ${USOS.DIAS} días`;
  const lineas = [`${periodo}: *${total}* ${total === 1 ? "comando" : "comandos"}`, ""];
  filas.slice(0, USOS.MAX_EN_PANEL).forEach((f, i) => lineas.push(`${i + 1}. ${nombreDeComando(f.comando)} — ${f.total} · ${Math.round((f.total / total) * 100)}%`));

  if (!chat) {
    lineas.push("", "*Dónde*");
    for (const r of usosPorChat(dias).slice(0, USOS.MAX_LUGARES)) {
      const nombre = r.chat === "privado" ? "privados" : await nombreDeGrupo(client, r.chat);
      lineas.push(`${nombre}: ${r.total} · ${Math.round((r.total / total) * 100)}%`);
    }
  }
  return { texto: `${titulo}\n\n${lineas.join("\n")}`, mentions: [] };
}

// Drops what's older than the same 90 days .podar keeps of the group activity. Returns how many rows went.
export function podarUsos(ahora = Date.now()) {
  return podarUsosComandos(claveDia(new Date(ahora - ACTIVIDAD.HORARIA_DIAS * DIA_MS)));
}
