import { setTimeout as esperar } from "node:timers/promises";
import { getChat } from "../database-functions.js";
import { duracion } from "../lib/tiempo.js";

// The same text to every group, spaced out and at an uneven pace: a burst of identical messages to many chats is what
// WhatsApp's spam filter looks for, and the number was already blocked once for volume. It used to go every 1.5 s, and
// to the groups with .banchat too, where the bot is off. With the connection down it looks again every
// REVISAR_CONEXION_MS whether it came back.
export const AVISO_TODOS = { ESPERA_MIN_MS: 20 * 1000, ESPERA_MAX_MS: 40 * 1000, REVISAR_CONEXION_MS: 5 * 1000 };
// Injectable for the tests.
export const _dep = { esperar, azar: Math.random };

// The notice going out right now, or null: { total, enviados, fallidos (the groups it surely didn't reach, for now),
// dudosos (the ones it can't tell), nombres (each group's name), reintentando, saliendo (the group on its way),
// cortadoDesde, control }. Spaced out like this, fifty groups take some 25 minutes: one with a typo couldn't be stopped,
// and a second one sent meanwhile went out alongside it. In globalThis, so a reload of this file doesn't lose track of it.
if (globalThis.avisoATodos === undefined) globalThis.avisoATodos = null;

// Groups by their names: the owner used to hear only how many it didn't reach.
const nombresDe = (aviso, jids) => jids.map((jid) => aviso.nombres.get(jid) || jid).join(", ");
function comoVa(aviso) {
  if (!aviso.total) return "recién arranca";
  const n = aviso.fallidos.length;
  const otraVez = aviso.reintentando && n ? `, y vuelve a probar ${n === 1 ? "con el que falló" : `con los ${n} que fallaron`}` : "";
  return `va por ${aviso.enviados + n + aviso.dudosos.length} de ${aviso.total} grupo(s)${otraVez}`;
}
// How far one that was cut got. A group send already on its way can't be called back, and it isn't among the ones that
// didn't go out: cut during the second try, the group on its way came out as one it hadn't reached.
function hastaDonde(aviso) {
  if (!aviso.total) return "no salió a ningún grupo";
  const fallidos = aviso.fallidos.filter((jid) => jid !== aviso.saliendo);
  const detalle = [fallidos.length && `no salió en ${nombresDe(aviso, fallidos)}`, aviso.dudosos.length && `no sé si llegó a ${nombresDe(aviso, aviso.dudosos)}`].filter(Boolean).join("; ");
  return `llegó a ${aviso.enviados} de ${aviso.total} grupo(s)${aviso.saliendo ? ", más el que estaba saliendo" : ""}${detalle ? ` (${detalle})` : ""}`;
}

// Without a connection a send fails: each group whose turn came while main.js reconnected (5 s or more) used to be
// counted as failed, and lost. It waits for the connection instead, and says whether the notice is still on (false if
// it was cut meanwhile). Without a signal it just waits: if main.js can't reconnect it ends the process, and
// start-process.js starts it again, the notice gone with it.
async function conectado(signal) {
  while (!globalThis.botConectado && !signal?.aborted) await _dep.esperar(AVISO_TODOS.REVISAR_CONEXION_MS, undefined, { signal }).catch(() => {});
  return !signal?.aborted;
}

const plugin = {};
plugin.cmd = ["avisartodos", "broadcast"];

plugin.run = async (m, { client, text, isOwner }) => {
  if (!isOwner) return client.sendText(m.chat, "Este comando es solo para el dueño del bot.", m);
  const enCurso = globalThis.avisoATodos;
  // ".avisartodos cancelar" alone stops the one going out, even halfway through a wait, and says right away how far it
  // got. The corrected one can go out right after, while the send that was on its way finishes.
  if (/^(cancelar|parar)$/i.test((text || "").trim())) {
    if (!enCurso) return client.sendText(m.chat, "No hay ningún aviso saliendo.", m);
    enCurso.control.abort();
    enCurso.cortadoDesde = m.chat;
    globalThis.avisoATodos = null;
    return client.sendText(m.chat, `⏹️ Corté el aviso: ${hastaDonde(enCurso)}.`, m);
  }
  if (enCurso) return client.sendText(m.chat, `📣 Ya estoy mandando un aviso: ${comoVa(enCurso)}. Esperá a que termine o cortalo con .avisartodos cancelar.`, m);
  if (!text) return client.sendText(m.chat, "Escribí el mensaje después del comando. Ej: .avisartodos Hoy arranca el ranking mensual 🏆", m);

  // Taken before the first wait, so a second .avisartodos sent right after this one finds it.
  const aviso = { total: 0, enviados: 0, fallidos: [], dudosos: [], nombres: new Map(), reintentando: false, saliendo: null, cortadoDesde: null, control: new AbortController() };
  globalThis.avisoATodos = aviso;
  const { signal } = aviso.control;
  // Through the socket of the moment: after a reconnection, the one that took the command is closed, and everything
  // sent through it fails (main.js makes a new one, globalThis.client).
  const socket = () => globalThis.client || client;
  const pausa = () => _dep.esperar(AVISO_TODOS.ESPERA_MIN_MS + Math.floor(_dep.azar() * (AVISO_TODOS.ESPERA_MAX_MS - AVISO_TODOS.ESPERA_MIN_MS)), undefined, { signal }).catch(() => {});
  // One group: "ok", "reintentar" when it surely didn't go out, or "dudoso". Baileys throws Connection Closed (428)
  // before writing anything, but a Timed Out (408) may come with the message already sent: it races the write against
  // a timer (lib/Socket/socket.js, sendRawMessage), and trying that one again sent it twice.
  const mandar = async (jid) => {
    aviso.saliendo = jid;
    try {
      await socket().sendText(jid, text, null);
      aviso.enviados++;
      return "ok";
    } catch (e) {
      console.error(`[avisar-todos] falló en ${jid}:`, e.message);
      return e?.output?.statusCode === 428 || e?.message === "Connection Closed" ? "reintentar" : "dudoso";
    } finally {
      aviso.saliendo = null;
    }
  };
  try {
    const grupos = await client.groupFetchAllParticipating();
    const todos = Object.keys(grupos);
    const jids = todos.filter((jid) => !getChat(jid)?.isBanned);
    for (const jid of jids) if (grupos[jid]?.subject) aviso.nombres.set(jid, grupos[jid].subject);
    // Cut while the list came, it doesn't go anywhere.
    if (!signal.aborted) {
      aviso.total = jids.length;
      const salteados = todos.length - jids.length;
      const promedio = (AVISO_TODOS.ESPERA_MIN_MS + AVISO_TODOS.ESPERA_MAX_MS) / 2;
      const empieza = `📣 Lo mando a ${jids.length} grupo(s), de a uno y espaciado: tarda unos ${duracion(Math.max(0, jids.length - 1) * promedio)}.${salteados ? ` Salteo ${salteados} con .banchat.` : ""} Para cortarlo: .avisartodos cancelar.`;
      // If this one doesn't go out (the connection dropped right then), the groups get the notice all the same: it used
      // to end here, without reaching any of them, and nobody told the owner.
      if (await conectado(signal)) await socket().sendText(m.chat, empieza, m).catch((e) => console.error("[avisar-todos] no salió el aviso de que arranca:", e.message));
    }

    for (const [i, jid] of jids.entries()) {
      if (i > 0) await pausa();
      if (!(await conectado(signal))) break;
      const resultado = await mandar(jid);
      if (resultado === "reintentar") aviso.fallidos.push(jid);
      if (resultado === "dudoso") aviso.dudosos.push(jid);
    }
    // What surely didn't go out even so (the connection dropped as it went) gets one more go once the rest went out.
    aviso.reintentando = true;
    for (const jid of [...aviso.fallidos]) {
      if (signal.aborted) break;
      await pausa();
      if (!(await conectado(signal))) break;
      const resultado = await mandar(jid);
      if (resultado === "reintentar") continue;
      aviso.fallidos.splice(aviso.fallidos.indexOf(jid), 1);
      if (resultado === "dudoso") aviso.dudosos.push(jid);
    }
  } finally {
    // A cancel already let go of it, and a new notice may have taken it since.
    if (globalThis.avisoATodos === aviso) globalThis.avisoATodos = null;
  }

  await conectado(); // the owner hears how it went once there's a connection to tell them through
  if (signal.aborted) {
    // The chat it was cut from already heard how far it got; the one that started it hears it here, if that was another.
    if (aviso.cortadoDesde !== m.chat) await socket().sendText(m.chat, `⏹️ Cortaron el aviso desde otro chat: ${hastaDonde(aviso)}.`, m);
    return;
  }
  const fallaron = aviso.fallidos.length ? ` No salió en ${aviso.fallidos.length}, ni probando de nuevo: ${nombresDe(aviso, aviso.fallidos)}.` : "";
  const dudosos = aviso.dudosos.length ? ` No sé si llegó a ${aviso.dudosos.length} (WhatsApp no confirmó el envío), y no lo repetí para no mandarlo dos veces: ${nombresDe(aviso, aviso.dudosos)}.` : "";
  await socket().sendText(m.chat, `✅ Mensaje enviado a ${aviso.enviados} grupo(s).${fallaron}${dudosos}`, m);
};

export default plugin;
