// What Claudia looked up on the web, so she can hand over the sources when someone asks for them. She answers
// without links by default (it's a chat, not a paper), and the links only go out on request: "claudia, ¿de dónde
// sacaste eso?", even a while later.
// In memory: after a restart she just doesn't have them, and says so.

const MAX_POR_CHAT = 10;
// Past this, "pasame la fuente" is no longer about that search.
export const VIGENCIA_MS = 3 * 60 * 60 * 1000;
const MAX_LINKS = 5;

if (!globalThis.fuentesPorChat) globalThis.fuentesPorChat = new Map();

// idMensaje: the message where Claudia gave the answer, so a reply to it gets its own sources.
export function guardarFuentes(chat, { idMensaje = null, tema = "", fuentes = [] }, ahora = Date.now()) {
  if (!chat || !fuentes.length) return;
  const lista = globalThis.fuentesPorChat.get(chat) || [];
  lista.push({ idMensaje, tema, fuentes: fuentes.slice(0, MAX_LINKS), fecha: ahora });
  while (lista.length > MAX_POR_CHAT) lista.shift();
  globalThis.fuentesPorChat.set(chat, lista);
}

// The search being asked about: the one of the quoted message if it has one, otherwise the chat's latest, if recent.
export function fuentesPara(chat, idCitado = null, ahora = Date.now()) {
  const lista = globalThis.fuentesPorChat.get(chat) || [];
  const citada = idCitado ? lista.find((x) => x.idMensaje === idCitado) : null;
  if (citada) return citada;
  const ultima = lista[lista.length - 1];
  return ultima && ahora - ultima.fecha < VIGENCIA_MS ? ultima : null;
}

// Google hands its sources as redirect links (vertexaisearch.cloud.google.com/grounding-api-redirect/...), long and
// unreadable in a chat: it's worth following them to the real page. If that fails, the redirect still works.
export async function urlReal(url, { timeoutMs = 5000 } = {}) {
  if (!/grounding-api-redirect/.test(url)) return url;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return res.headers?.get?.("location") || url;
  } catch {
    return url;
  }
}

// The message with the links, one per line.
export async function textoFuentes(entrada) {
  const lineas = await Promise.all(entrada.fuentes.map(async (f) => `• ${f.titulo}: ${await urlReal(f.url)}`));
  return `Fuentes:\n${lineas.join("\n")}`;
}
