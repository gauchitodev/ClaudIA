// Memoria corta por chat: los últimos mensajes, solo en RAM (se pierde al reiniciar, y está bien).
// Sirve para que Claudia siga el hilo de la conversación en vez de responder cada mensaje en el vacío.

const MAX_MENSAJES = 14; // los que van al prompt de Claudia
const MAX_HISTORIAL = 200; // los que se guardan por chat (para .resumen)
const MAX_LARGO = 220; // caracteres por mensaje guardado

if (!globalThis.contextoChat) globalThis.contextoChat = new Map();

export function recordarMensaje(chat, nombre, texto, esBot = false) {
  if (!chat || !texto) return;
  const limpio = String(texto).replace(/\s+/g, " ").trim();
  if (!limpio) return;
  const lista = globalThis.contextoChat.get(chat) || [];
  lista.push({ nombre: nombre || "alguien", texto: limpio.length > MAX_LARGO ? limpio.slice(0, MAX_LARGO) + "…" : limpio, esBot, fecha: Date.now() });
  while (lista.length > MAX_HISTORIAL) lista.shift();
  globalThis.contextoChat.set(chat, lista);
}

// Texto listo para pegar en el prompt. "" si no hay nada. Excluye el último mensaje si se pide
// (porque ese es el que se está respondiendo y va aparte).
export function textoContexto(chat, excluirUltimo = true) {
  const lista = globalThis.contextoChat.get(chat) || [];
  const usar = (excluirUltimo ? lista.slice(0, -1) : lista).slice(-MAX_MENSAJES);
  if (usar.length === 0) return "";
  return usar.map((x) => `- ${x.esBot ? "Claudia (vos)" : x.nombre}: ${x.texto}`).join("\n");
}

// Mensajes guardados de un chat desde un momento dado (para .resumen).
export function mensajesRecientes(chat, desdeMs) {
  return (globalThis.contextoChat.get(chat) || []).filter((x) => x.fecha >= desdeMs);
}
