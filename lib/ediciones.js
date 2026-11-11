// A message someone edited, as WhatsApp sends it: not the message again but a note about it (a protocolMessage of type
// 14, which may come wrapped in editedMessage) with the key of the message it rewrites and its new content. Claudia's
// memory keeps the text as it was left (lib/memoria-corta.js), and the marketplace reads an ad completed by editing it
// (plugins/_compraventa.js).

// The text of a message's content: the conversation's, or the text or the caption of whatever it is.
export const textoDeContenido = (contenido) => contenido?.conversation || Object.values(contenido || {}).map((v) => v?.text ?? v?.caption).find((t) => typeof t === "string") || "";

// The edit a message brings, or null: the id of the message it rewrites, what it says now and its new content.
export function edicionDe(m) {
  const protocolo = m?.message?.protocolMessage || m?.message?.editedMessage?.message?.protocolMessage;
  if (protocolo?.type !== 14 || !protocolo.key?.id) return null;
  return { id: protocolo.key.id, contenido: protocolo.editedMessage, texto: textoDeContenido(protocolo.editedMessage) };
}
