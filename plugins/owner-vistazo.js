import { getChat } from "../database-functions.js";
import { mensajesRecientes } from "../lib/contexto-chat.js";
import { hacerVistazo, textoInforme, claveDe, citaDe } from "../lib/vistazos.js";
import { duracion } from "../lib/tiempo.js";

if (!globalThis.vistazoAdminCooldown) globalThis.vistazoAdminCooldown = new Map();
// An admin's glance spends a Gemini call (a test one isn't even counted in the daily cap), so one per group every so
// often. The owner has no limit.
const COOLDOWN_ADMIN_MS = 10 * 60 * 1000;

// Admins' (and the owner's) tools for Claudia's initiative, in the group where they're written. The report goes to
// whoever asked, in private.
//   .vistazo            a glance right now: the schedule and the hours are skipped, the rest of the tact applies
//   .vistazo prueba     the same, but nothing is sent and nothing changes (it works with the initiative off, too)
//   .vistazo reaccion   reacts 👀 to the last message from someone, with the key a glance would use; no AI
//   .vistazo cita       quotes it the way a glance would; no AI
// The last two are the live check of the reaction and quote objects, which the tests can't reach.
const plugin = {};
plugin.cmd = ["vistazo"];
plugin.onlyAdmin = true;
plugin.onlyGroup = true;

const esComando = (texto) => globalThis.prefix.some((p) => texto.startsWith(p));

plugin.run = async (m, { client, args, isOwner }) => {
  const opcion = (args[0] || "").toLowerCase();
  const privado = m.senderJid || m.sender;

  if (opcion === "reaccion" || opcion === "reacción" || opcion === "cita") {
    const entrada = [...mensajesRecientes(m.chat, 0)].reverse().find((e) => !e.esBot && e.id && e.id !== m.id && !esComando(e.texto));
    if (!entrada) return client.sendText(m.chat, "No tengo en memoria ningún mensaje de alguien (con su id) para probar.", m);
    if (opcion === "cita") await client.sendText(m.chat, "(prueba de cita)", citaDe(m.chat, entrada));
    else await client.sendMessage(m.chat, { react: { text: "👀", key: claveDe(m.chat, entrada) } });
    return client.sendText(privado, `🔧 ${opcion === "cita" ? "Cita" : "Reacción"} de prueba sobre el mensaje ${entrada.id} de ${entrada.nombre} (participant: ${entrada.participant || entrada.usuario || "ninguno"}).`);
  }

  const prueba = opcion === "prueba";
  if (!prueba && getChat(m.chat)?.iniciativa !== 1) return client.sendText(m.chat, "La iniciativa está apagada en este grupo: prendela con .iniciativa on, o probá sin mandar nada con .vistazo prueba.", m);
  if (!isOwner) {
    const espera = COOLDOWN_ADMIN_MS - (Date.now() - (globalThis.vistazoAdminCooldown.get(m.chat) || 0));
    if (espera > 0) return client.sendText(m.chat, `Recién miré el grupo; esperá ${duracion(espera)} para pedir otro vistazo.`, m);
    globalThis.vistazoAdminCooldown.set(m.chat, Date.now());
  }
  const informe = await hacerVistazo(client, m.chat, { motivo: isOwner ? "owner" : "admin", forzado: true, prueba });
  await client.sendText(privado, textoInforme(informe));
};

export default plugin;
