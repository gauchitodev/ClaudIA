// Short-term per-chat memory: the latest messages, in RAM only (lost on restart, and that's fine).
// It lets Claudia follow the thread of a conversation instead of answering each message in a vacuum.

const MAX_MENSAJES = 14; // the ones that go into Claudia's prompt
const MAX_HISTORIAL = 200; // the ones kept per chat (for .resumen)
const MAX_LARGO = 220; // characters per stored message

export const contextoChat = new Map();
// When the oldest message of each chat that fell off the end was sent: from there back, the history is incomplete.
export const contextoChatRecorte = new Map();
// When each person came into each group ("chat|id" -> when), since the bot started like the messages here: nothing kept
// here is older than that, so it's enough for .resumen not to tell a newcomer what was said before they came in.
export const ingresosGrupo = new Map();
const MAX_INGRESOS = 5000;

// main.js, on group-participants.update "add": each of the ids the person may write with (lib/identidad.js).
export function recordarIngreso(chat, ids, cuando = Date.now()) {
  for (const id of ids || []) {
    ingresosGrupo.delete(`${chat}|${id}`);
    ingresosGrupo.set(`${chat}|${id}`, cuando);
  }
  while (ingresosGrupo.size > MAX_INGRESOS) ingresosGrupo.delete(ingresosGrupo.keys().next().value);
}

// When they came into the group, 0 if it was before the bot started (or it never heard).
export const ingresoDe = (chat, id) => ingresosGrupo.get(`${chat}|${id}`) || 0;

// One line, cut at MAX_LARGO: "" when there's no text.
function limpiar(texto) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  return limpio.length > MAX_LARGO ? `${limpio.slice(0, MAX_LARGO)}…` : limpio;
}

// id, usuario and participant are what a glance needs to react to the message or quote it later (lib/vistazos.js).
// esAudio: the text is what a voice note said, not the message itself, so a glance can react to it but not quote it.
// comando: whether it was a bot command, told by its text as it came (fueComando, below).
export function recordarMensaje(chat, nombre, texto, esBot = false, { id = null, usuario = null, participant = null, fecha = Date.now(), esAudio = false, comando = null } = {}) {
  if (!chat || !texto) return;
  const limpio = limpiar(texto);
  if (!limpio) return;
  const lista = contextoChat.get(chat) || [];
  lista.push({ nombre: nombre || "alguien", texto: limpio, esBot, fecha, id, usuario, participant, ...(esAudio && { esAudio }), ...(comando !== null && { comando }) });
  while (lista.length > MAX_HISTORIAL) contextoChatRecorte.set(chat, lista.shift().fecha);
  contextoChat.set(chat, lista);
}

// Someone deleted the message: Claudia shouldn't quote it, react to it or summarize it. Returns whether it was stored.
export function olvidarMensaje(chat, id) {
  const lista = id ? contextoChat.get(chat) : null;
  const i = lista ? lista.findIndex((x) => x.id === id) : -1;
  if (i < 0) return false;
  lista.splice(i, 1);
  return true;
}

// Someone edited the message: what stays is how they left it, and an edit that leaves no text forgets it. It used to
// keep the original, so whatever someone took back by editing still reached .resumen and Claudia. Only its author's
// edit counts: WhatsApp only lets the author edit, but the bot doesn't get that check for free, and anyone could have
// changed what Claudia remembers of somebody else. Any of the ids the edit came with (autores) will do against the ones
// the message came with: in a group listed by number, one message may come with the LID alongside and the next without,
// and an edit taken for someone else's left what they had taken back. comando: whether the text left is a command
// (fueComando). Returns whether it changed anything.
export function editarMensaje(chat, id, texto, autores, { comando = null } = {}) {
  const entrada = id ? (contextoChat.get(chat) || []).find((x) => x.id === id) : null;
  const suyos = [entrada?.usuario, entrada?.participant].filter(Boolean);
  if (!suyos.length || !autores.some((autor) => autor && suyos.includes(autor))) return false;
  const limpio = limpiar(texto);
  if (!limpio) return olvidarMensaje(chat, id);
  entrada.texto = limpio;
  if (comando !== null) entrada.comando = comando;
  return true;
}

// The last n stored messages from before a moment (what a glance had already read, as context).
export function mensajesAntesDe(chat, hastaMs, n) {
  if (n <= 0) return [];
  return (contextoChat.get(chat) || []).filter((x) => x.fecha < hastaMs).slice(-n);
}

// Text ready to drop into the prompt. "" when there is nothing. Given the id of the message being answered (it goes
// separately), only what came before it. It used to leave out the last one stored, which wasn't always that message:
// a voice note isn't stored until she has heard it, so the last thing said before it went missing, and now each
// message is stored as it comes (plugins/_memoria-corta.js), with newer ones possibly after it.
export function textoContexto(chat, idActual = null) {
  const lista = contextoChat.get(chat) || [];
  const posicion = idActual ? lista.findIndex((x) => x.id === idActual) : -1;
  const usar = (posicion >= 0 ? lista.slice(0, posicion) : lista).slice(-MAX_MENSAJES);
  if (usar.length === 0) return "";
  return usar.map((x) => `- ${x.esBot ? "Claudia (vos)" : x.nombre}: ${x.texto}`).join("\n");
}

// A chat's stored messages since a given moment (for .resumen).
export function mensajesRecientes(chat, desdeMs) {
  return (contextoChat.get(chat) || []).filter((x) => x.fecha >= desdeMs);
}

// From when on a chat's history is complete for a window that starts at desdeMs: desdeMs itself, unless messages from
// inside the window had to be dropped to make room (a busy group), in which case it's the oldest one kept.
export function historialCompletoDesde(chat, desdeMs) {
  const recorte = contextoChatRecorte.get(chat);
  const lista = contextoChat.get(chat) || [];
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

// Whether a stored message was a bot command, for .resumen and the glances to leave it out. Told as it came, by its
// text as typed (plugins/_memoria-corta.js marks it): the stored text carries its mentions as names, and "@Sol ¿venís?"
// read as "@" and the command .sol, so whatever someone said to Sol dropped out of both. What carries no mark (her own
// messages, what a voice note said) goes by its text.
export const fueComando = (entrada) => entrada.comando ?? esComando(entrada.texto);
