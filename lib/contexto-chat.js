// Short-term per-chat memory: the latest messages, in RAM only (lost on restart, and that's fine).
// It lets Claudia follow the thread of a conversation instead of answering each message in a vacuum.

const MAX_MENSAJES = 14; // the ones that go into Claudia's prompt
const MAX_HISTORIAL = 200; // the ones kept per chat (for .resumen)
const MAX_LARGO = 220; // characters per stored message

if (!globalThis.contextoChat) globalThis.contextoChat = new Map();

export function recordarMensaje(chat, nombre, texto, esBot = false) {
  if (!chat || !texto) return;
  const limpio = String(texto).replace(/\s+/g, " ").trim();
  if (!limpio) return;
  const lista = globalThis.contextoChat.get(chat) || [];
  lista.push({ nombre: nombre || "alguien", texto: limpio.length > MAX_LARGO ? `${limpio.slice(0, MAX_LARGO)}…` : limpio, esBot, fecha: Date.now() });
  while (lista.length > MAX_HISTORIAL) lista.shift();
  globalThis.contextoChat.set(chat, lista);
}

// Text ready to drop into the prompt. "" when there is nothing. It leaves out the last message if asked to
// (because that is the one being answered and goes separately).
export function textoContexto(chat, excluirUltimo = true) {
  const lista = globalThis.contextoChat.get(chat) || [];
  const usar = (excluirUltimo ? lista.slice(0, -1) : lista).slice(-MAX_MENSAJES);
  if (usar.length === 0) return "";
  return usar.map((x) => `- ${x.esBot ? "Claudia (vos)" : x.nombre}: ${x.texto}`).join("\n");
}

// A chat's stored messages since a given moment (for .resumen).
export function mensajesRecientes(chat, desdeMs) {
  return (globalThis.contextoChat.get(chat) || []).filter((x) => x.fecha >= desdeMs);
}
