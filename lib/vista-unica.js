// "View once" photos, videos and voice notes. WhatsApp doesn't hand them to linked devices like the bot (they arrive as
// <unavailable type="view_once">, with no content): the only copy the bot ever sees is the one inside a reply that
// quotes it. This is the one place that decides whether a quote is a view-once and who may take it. .r, .s and every
// command that downloads or forwards a quoted file go through puedeRecuperarCitado; they each used to carry their own
// copy of the check, or none at all.

// viewOnceMessage (V1, the wrapper Baileys itself sends them in), viewOnceMessageV2 and viewOnceMessageV2Extension.
// By prefix, so a future version is caught without touching this.
const ENVOLTORIO = /^viewOnce/;

// Whether a message (a quotedMessage, say) is a view-once: one of the wrappers, or media with viewOnce: true. It follows
// the { message } wrappers (an ephemeralMessage around a view-once...) as deep as Baileys' normalizeMessageContent, and
// never goes into a contextInfo: a plain photo that replied to a view-once isn't one. Only own properties count: a
// decoded protobuf has every field on its prototype as an enumerable null, so for...in would list viewOnceMessage on
// any message.
export function esVistaUnica(mensaje, nivel = 0) {
  if (!mensaje || typeof mensaje !== "object" || nivel > 5) return false;
  return Object.entries(mensaje).some(([clave, valor]) => {
    if (!valor || typeof valor !== "object") return false;
    return ENVOLTORIO.test(clave) || valor.viewOnce === true || esVistaUnica(valor.message, nivel + 1);
  });
}

// Whether whoever sent m may take what m quotes. Anything that isn't a view-once: anyone. A view-once: its author, the
// admins (isAdmin: WhatsApp admins, .adminbot and the owner; moderators don't) and the owner. The quote is read from
// m.msg.contextInfo, where m.quoted comes from, whatever the type of m: the old check only looked inside
// extendedTextMessage, so a command sent as the caption of a photo got past it.
export function puedeRecuperarCitado(m, { isAdmin = false, isOwner = false } = {}) {
  if (!esVistaUnica(m.msg?.contextInfo?.quotedMessage)) return true;
  if (isAdmin || isOwner) return true;
  // m.quoted.sender usually arrives as @lid, so it's compared against both of the sender's formats.
  const autor = m.quoted?.sender;
  return Boolean(autor) && [m.sender, m.senderJid].includes(autor);
}
