import { setTimeout as esperar } from "node:timers/promises";
import { getChat } from "../database-functions.js";
import { duracion } from "../lib/tiempo.js";

// The same text to every group, spaced out and at an uneven pace: a burst of identical messages to many chats is what
// WhatsApp's spam filter looks for, and the number was already blocked once for volume. It used to go every 1.5 s, and
// to the groups with .banchat too, where the bot is off.
export const AVISO_TODOS = { ESPERA_MIN_MS: 20 * 1000, ESPERA_MAX_MS: 40 * 1000 };
// Injectable for the tests.
export const _dep = { esperar, azar: Math.random };

// The notice going out right now, or null: { total, enviados, fallidos, control }. Spaced out like this, fifty groups
// take some 25 minutes: one with a typo couldn't be stopped, and a second one sent meanwhile went out alongside it. In
// globalThis, so a reload of this file doesn't lose track of it.
if (globalThis.avisoATodos === undefined) globalThis.avisoATodos = null;

const comoVa = (aviso) => (aviso.total ? `va por ${aviso.enviados + aviso.fallidos} de ${aviso.total} grupo(s)` : "recién arranca");

const plugin = {};
plugin.cmd = ["avisartodos", "broadcast"];

plugin.run = async (m, { client, text, isOwner }) => {
  if (!isOwner) return client.sendText(m.chat, "Este comando es solo para el dueño del bot.", m);
  const enCurso = globalThis.avisoATodos;
  // ".avisartodos cancelar" alone stops the one going out, even halfway through a wait; the loop below says how far it
  // got.
  if (/^(cancelar|parar)$/i.test((text || "").trim())) {
    if (!enCurso) return client.sendText(m.chat, "No hay ningún aviso saliendo.", m);
    enCurso.control.abort();
    return;
  }
  if (enCurso) return client.sendText(m.chat, `📣 Ya estoy mandando un aviso: ${comoVa(enCurso)}. Esperá a que termine o cortalo con .avisartodos cancelar.`, m);
  if (!text) return client.sendText(m.chat, "Escribí el mensaje después del comando. Ej: .avisartodos Hoy arranca el ranking mensual 🏆", m);

  // Taken before the first wait, so a second .avisartodos sent right after this one finds it.
  const aviso = { total: 0, enviados: 0, fallidos: 0, control: new AbortController() };
  globalThis.avisoATodos = aviso;
  try {
    const grupos = Object.keys(await client.groupFetchAllParticipating());
    const jids = grupos.filter((jid) => !getChat(jid)?.isBanned);
    aviso.total = jids.length;
    const salteados = grupos.length - jids.length;
    const promedio = (AVISO_TODOS.ESPERA_MIN_MS + AVISO_TODOS.ESPERA_MAX_MS) / 2;
    await client.sendText(m.chat, `📣 Lo mando a ${jids.length} grupo(s), de a uno y espaciado: tarda unos ${duracion(Math.max(0, jids.length - 1) * promedio)}.${salteados ? ` Salteo ${salteados} con .banchat.` : ""} Para cortarlo: .avisartodos cancelar.`, m);

    for (const [i, jid] of jids.entries()) {
      if (i > 0) await _dep.esperar(AVISO_TODOS.ESPERA_MIN_MS + Math.floor(_dep.azar() * (AVISO_TODOS.ESPERA_MAX_MS - AVISO_TODOS.ESPERA_MIN_MS)), undefined, { signal: aviso.control.signal }).catch(() => {});
      if (aviso.control.signal.aborted) break;
      try {
        await client.sendText(jid, text, null);
        aviso.enviados++;
      } catch (e) {
        console.error(`[avisar-todos] falló en ${jid}:`, e.message);
        aviso.fallidos++;
      }
    }
  } finally {
    globalThis.avisoATodos = null;
  }

  const fallaron = aviso.fallidos > 0 ? ` (${aviso.fallidos} fallaron)` : "";
  await client.sendText(m.chat, aviso.control.signal.aborted ? `⏹️ Corté el aviso: llegó a ${aviso.enviados} de ${aviso.total} grupo(s).${fallaron}` : `✅ Mensaje enviado a ${aviso.enviados} grupo(s).${fallaron}`, m);
};

export default plugin;
