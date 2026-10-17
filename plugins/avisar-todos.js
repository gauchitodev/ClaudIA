import { setTimeout as esperar } from "node:timers/promises";
import { getChat } from "../database-functions.js";
import { duracion } from "../lib/tiempo.js";

// The same text to every group, spaced out and at an uneven pace: a burst of identical messages to many chats is what
// WhatsApp's spam filter looks for, and the number was already blocked once for volume. It used to go every 1.5 s, and
// to the groups with .banchat too, where the bot is off.
export const AVISO_TODOS = { ESPERA_MIN_MS: 20 * 1000, ESPERA_MAX_MS: 40 * 1000 };
// Injectable for the tests.
export const _dep = { esperar, azar: Math.random };

const plugin = {};
plugin.cmd = ["avisartodos", "broadcast"];

plugin.run = async (m, { client, text, isOwner }) => {
  if (!isOwner) return client.sendText(m.chat, "Este comando es solo para el dueño del bot.", m);
  if (!text) return client.sendText(m.chat, "Escribí el mensaje después del comando. Ej: .avisartodos Hoy arranca el ranking mensual 🏆", m);

  const grupos = Object.keys(await client.groupFetchAllParticipating());
  const jids = grupos.filter((jid) => !getChat(jid)?.isBanned);
  const salteados = grupos.length - jids.length;
  const promedio = (AVISO_TODOS.ESPERA_MIN_MS + AVISO_TODOS.ESPERA_MAX_MS) / 2;
  await client.sendText(m.chat, `📣 Lo mando a ${jids.length} grupo(s), de a uno y espaciado: tarda unos ${duracion(Math.max(0, jids.length - 1) * promedio)}.${salteados ? ` Salteo ${salteados} con .banchat.` : ""}`, m);

  let enviados = 0;
  let fallidos = 0;
  for (const [i, jid] of jids.entries()) {
    if (i > 0) await _dep.esperar(AVISO_TODOS.ESPERA_MIN_MS + Math.floor(_dep.azar() * (AVISO_TODOS.ESPERA_MAX_MS - AVISO_TODOS.ESPERA_MIN_MS)));
    try {
      await client.sendText(jid, text, null);
      enviados++;
    } catch (e) {
      console.error(`[avisar-todos] falló en ${jid}:`, e.message);
      fallidos++;
    }
  }

  await client.sendText(m.chat, `✅ Mensaje enviado a ${enviados} grupo(s).${fallidos > 0 ? ` (${fallidos} fallaron)` : ""}`, m);
};

export default plugin;
