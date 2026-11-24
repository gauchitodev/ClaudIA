// The anti-flood (.antiflood): in a group that turned it on, whoever sends too many messages in a row is asked to slow
// down, and warned if they do it again. The count, the ladder and why nothing gets deleted are in lib/antiflood.js.
// Not mods or above, and only with the bot an admin, as the anti-links: the third warning removes them.
import { contarMensaje, cerrarPaso, avisoDeFlood, motivoDeFlood } from "../lib/antiflood.js";
import { darAdvertencia } from "../lib/advertencias.js";
import { NO_SON_MENSAJES } from "../lib/inactivos.js";
import { esVistaUnicaRecibida } from "../lib/vista-unica.js";
import { idDelAutor } from "../lib/identidad.js";
import { lidDelBot } from "../lib/conexion.js";
import { enviadoEn } from "../lib/tiempo.js";

// What a message with nothing to show has for a type (lib/wa-socket.js, mtype).
const SIN_CONTENIDO = new Set(["senderKeyDistributionMessage", "messageContextInfo"]);
// What counts: what shows in the chat as a message of that person's. Not a reaction, an edit, a deletion, a poll vote
// or a pin (NO_SON_MENSAJES). Nor what comes with no content: a group notice, or one the bot couldn't decrypt. But for
// a view-once, which reaches the bot with no content either (lib/vista-unica.js), and in the chat is one more message.
const esUnMensaje = (m) => (m.message ? Boolean(m.mtype) && !NO_SON_MENSAJES.has(m.mtype) && !SIN_CONTENIDO.has(m.mtype) : esVistaUnicaRecibida(m));

const plugin = (m) => m;
// With the moderation, though it deletes nothing and marks nothing (m.moderado): those hooks are the only ones that
// see a view-once without content and what an anti-link has just deleted (handle-message.js), and both are part of a
// flood.
plugin.moderacion = true;

plugin.before = async (m, { client, participants, isMod, isOwner, isBotAdmin, chat }) => {
  if (!m.isGroup || !chat.antiFlood || !isBotAdmin || isMod || isOwner) return;
  if (!esUnMensaje(m)) return;
  // By when each message was sent: after a reconnection a minute of chat arrives all at once.
  const paso = contarMensaje(m.chat, m.sender, { id: m.key?.id, pieza: m._pieza }, enviadoEn(m) || Date.now());
  if (!paso) return;
  // Not awaited: a send waits its turn (lib/envios.js), and behind it this message got late to everything else, its
  // own command included. Kept where the tests can wait for it, as plugins/_stickers-grupo.js does.
  plugin.enCurso = cumplir(paso, m, client, participants).then(
    (r) => cerrarPaso(m.chat, m.sender, { expulsado: Boolean(r?.expulsion?.ok || r?.saliendo) }),
    (e) => {
      console.error("[antiflood] ERROR:", e);
      cerrarPaso(m.chat, m.sender, { fallo: true });
    },
  );
};

// The notice quotes nothing: it names them, and the message it would quote is one among eight. The warning is
// .advertir's own, in Claudia's name, and removes by the id the group lists them under.
async function cumplir(paso, m, client, participants) {
  if (paso === "aviso") return client.sendText(m.chat, avisoDeFlood(m.sender), null, { mentions: [m.sender] });
  return darAdvertencia(client, m.chat, m.sender, { motivo: motivoDeFlood(), dadoPor: lidDelBot(client) || "claudia", expulsarA: idDelAutor(m, participants) });
}

export default plugin;
