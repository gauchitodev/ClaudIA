// Short-term per-chat memory: the latest messages, in RAM only (lost on restart, and that's fine).
// It lets Claudia follow the thread of a conversation instead of answering each message in a vacuum.

const MAX_MENSAJES = 14; // the ones that go into Claudia's prompt
const MAX_HISTORIAL = 200; // the ones kept per chat (for .resumen)
const MAX_LARGO = 220; // characters per stored message

if (!globalThis.contextoChat) globalThis.contextoChat = new Map();
// When the oldest message of each chat that fell off the end was sent: from there back, the history is incomplete.
if (!globalThis.contextoChatRecorte) globalThis.contextoChatRecorte = new Map();

// One line, cut at MAX_LARGO: "" when there's no text.
function limpiar(texto) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  return limpio.length > MAX_LARGO ? `${limpio.slice(0, MAX_LARGO)}…` : limpio;
}

// id, usuario and participant are what a glance needs to react to the message or quote it later (lib/vistazos.js).
// esAudio: the text is what a voice note said, not the message itself, so a glance can react to it but not quote it.
export function recordarMensaje(chat, nombre, texto, esBot = false, { id = null, usuario = null, participant = null, fecha = Date.now(), esAudio = false } = {}) {
  if (!chat || !texto) return;
  const limpio = limpiar(texto);
  if (!limpio) return;
  const lista = globalThis.contextoChat.get(chat) || [];
  lista.push({ nombre: nombre || "alguien", texto: limpio, esBot, fecha, id, usuario, participant, ...(esAudio && { esAudio }) });
  while (lista.length > MAX_HISTORIAL) globalThis.contextoChatRecorte.set(chat, lista.shift().fecha);
  globalThis.contextoChat.set(chat, lista);
}

// Someone deleted the message: Claudia shouldn't quote it, react to it or summarize it. Returns whether it was stored.
export function olvidarMensaje(chat, id) {
  const lista = id ? globalThis.contextoChat.get(chat) : null;
  const i = lista ? lista.findIndex((x) => x.id === id) : -1;
  if (i < 0) return false;
  lista.splice(i, 1);
  return true;
}

// Someone edited the message: what stays is how they left it, and an edit that leaves no text forgets it. It used to
// keep the original, so whatever someone took back by editing still reached .resumen and Claudia. Only its author's
// edit counts: WhatsApp only lets the author edit, but the bot doesn't get that check for free, and anyone could have
// changed what Claudia remembers of somebody else. Returns whether it changed anything.
export function editarMensaje(chat, id, texto, autor) {
  const entrada = id ? (globalThis.contextoChat.get(chat) || []).find((x) => x.id === id) : null;
  if (!entrada?.usuario || entrada.usuario !== autor) return false;
  const limpio = limpiar(texto);
  if (!limpio) return olvidarMensaje(chat, id);
  entrada.texto = limpio;
  return true;
}

// The last n stored messages from before a moment (what a glance had already read, as context).
export function mensajesAntesDe(chat, hastaMs, n) {
  if (n <= 0) return [];
  return (globalThis.contextoChat.get(chat) || []).filter((x) => x.fecha < hastaMs).slice(-n);
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

// From when on a chat's history is complete for a window that starts at desdeMs: desdeMs itself, unless messages from
// inside the window had to be dropped to make room (a busy group), in which case it's the oldest one kept.
export function historialCompletoDesde(chat, desdeMs) {
  const recorte = globalThis.contextoChatRecorte.get(chat);
  const lista = globalThis.contextoChat.get(chat) || [];
  if (recorte === undefined || recorte < desdeMs || lista.length === 0) return desdeMs;
  return Math.max(desdeMs, lista[0].fecha);
}

// Whether a stored message was a bot command. "@" is also a prefix, but a message that starts by mentioning someone
// ("@59899… vení") is chat, not a command: with "@" it only counts when the word after it is a plugin's command.
export function esComando(texto) {
  const prefijo = (globalThis.prefix || []).find((p) => String(texto).startsWith(p));
  if (!prefijo) return false;
  if (prefijo !== "@") return true;
  const palabra = String(texto).slice(1).trim().split(/\s+/)[0].toLowerCase();
  return Object.values(globalThis.plugins || {}).some((plugin) => plugin.cmd?.includes(palabra));
}
