// Short-term per-chat memory: the latest messages, in RAM only. It lets Claudia follow the thread of a conversation
// instead of answering each message in a vacuum, and it's what .resumen, her glances and the weekly recap read.
// It keeps the last 6 hours of each chat (as far back as .resumen goes) and never fewer than its last 200 messages, so
// a quiet chat still keeps days of them. It never touches the disk: start-process.js keeps a copy in its own RAM
// (lib/relevo-memoria.js), so cutting main.js to update doesn't lose it; only a full restart (the tablet, Termux, a new
// npm start) does.
//
// Every change is a plain object that aplicarCambio applies, and that whoever listens is told about (alCambiarMemoria):
// the copy applies the same ones, with the same "now", to a memory of its own (crearMemoria), and ends up the same.
// Nothing done on load, and no imports but lib/comandos.js, which imports only lib/plugins-cargados.js, and that one
// nothing: start-process.js loads this too.
import { esComando } from "./comandos.js";

// Whether a text is a command, told the same way as the dispatcher tells it (lib/comandos.js): for fueComando, below,
// and for whoever already took it from here.
export { esComando };

export const MEMORIA_CORTA = {
  HORAS_MS: 6 * 60 * 60 * 1000, // all of this stays, however many
  MINIMO: 200, // never fewer than these per chat, however old
  TOPE: 5000, // never more than these per chat, however recent: a flood doesn't eat the RAM
  MAX_LARGO: 220, // characters per stored message
  EN_CONTEXTO: 14, // the ones that go into Claudia's prompt
  MAX_INGRESOS: 5000,
};

// One line, cut at MAX_LARGO: "" when there's no text.
function limpiar(texto) {
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  return limpio.length > MEMORIA_CORTA.MAX_LARGO ? `${limpio.slice(0, MEMORIA_CORTA.MAX_LARGO)}…` : limpio;
}

const esTexto = (v) => typeof v === "string" && v.length > 0;
const esNumero = (v) => typeof v === "number" && Number.isFinite(v);

// A stored message with only the fields it can have, or null if it isn't one: what reaches the copy has been through
// a serialization, and a broken change mustn't leave anything odd behind.
function entradaValida(e) {
  if (!e || typeof e !== "object" || !esTexto(e.texto) || !esNumero(e.fecha)) return null;
  const entrada = {
    nombre: esTexto(e.nombre) ? e.nombre : "alguien",
    texto: e.texto,
    esBot: e.esBot === true,
    fecha: e.fecha,
    id: esTexto(e.id) ? e.id : null,
    usuario: esTexto(e.usuario) ? e.usuario : null,
    participant: esTexto(e.participant) ? e.participant : null,
  };
  if (e.esAudio === true) entrada.esAudio = true;
  if (typeof e.comando === "boolean") entrada.comando = e.comando;
  return entrada;
}

// A copy from exportarMemoria, checked whole before anything is touched: null if any part of it doesn't fit.
function copiaValida(copia) {
  if (!copia || copia.v !== 1 || !esNumero(copia.desde) || !Array.isArray(copia.chats) || !Array.isArray(copia.ingresos)) return null;
  const chats = [];
  for (const par of copia.chats) {
    if (!Array.isArray(par) || !esTexto(par[0]) || !par[1] || !Array.isArray(par[1].mensajes)) return null;
    const recorte = par[1].recorte ?? null;
    if (recorte !== null && !esNumero(recorte)) return null;
    const mensajes = par[1].mensajes.map(entradaValida);
    if (mensajes.some((e) => !e)) return null;
    chats.push([par[0], { mensajes, recorte }]);
  }
  for (const par of copia.ingresos) if (!Array.isArray(par) || !esTexto(par[0]) || !esNumero(par[1])) return null;
  return { desde: copia.desde, chats, ingresos: copia.ingresos };
}

// A memory: the default one below, and the copy start-process.js keeps (lib/relevo-memoria.js).
export function crearMemoria(desde = Date.now()) {
  const chats = new Map(); // chat -> its messages, oldest first, in the order they were sent
  const recortes = new Map(); // chat -> when the newest message that had to go was sent: from there back it's incomplete
  // When each person came into each group ("chat|id" -> when), so .resumen doesn't tell a newcomer what was said before
  // they came in.
  const ingresos = new Map();
  const versiones = new Map(); // chat -> goes up with each deletion or edit that changes something (lib/resumen.js)
  let inicio = desde; // since when this memory holds what was said

  const subirVersion = (chat) => versiones.set(chat, (versiones.get(chat) || 0) + 1);

  // From the front, what's over TOPE, and what's older than HORAS_MS as long as more than MINIMO stay. In one splice:
  // after a burst there may be thousands to cut.
  function podarChat(chat, ahora) {
    const lista = chats.get(chat);
    if (!lista) return;
    let corte = Math.max(0, lista.length - MEMORIA_CORTA.TOPE);
    const limite = ahora - MEMORIA_CORTA.HORAS_MS;
    while (corte < lista.length - MEMORIA_CORTA.MINIMO && lista[corte].fecha < limite) corte++;
    if (corte === 0) return;
    recortes.set(chat, Math.max(recortes.get(chat) ?? -Infinity, lista[corte - 1].fecha));
    lista.splice(0, corte);
  }

  // In its place by when it was sent: something that came late (sent while the bot was down) lands where it was said,
  // and two from the same moment keep the order they came in.
  function agregar(chat, entrada, ahora) {
    const lista = chats.get(chat) || [];
    // That part of the history was already cut: letting it back in would make it look complete.
    if (recortes.has(chat) && entrada.fecha <= recortes.get(chat)) return false;
    if (entrada.id && lista.some((x) => x.id === entrada.id)) return false; // the same message twice (a re-delivery)
    let i = lista.length;
    if (i > 0 && lista[i - 1].fecha > entrada.fecha) {
      let desdeAca = 0;
      let hasta = lista.length;
      while (desdeAca < hasta) {
        const medio = (desdeAca + hasta) >> 1;
        if (lista[medio].fecha <= entrada.fecha) desdeAca = medio + 1;
        else hasta = medio;
      }
      i = desdeAca;
    }
    lista.splice(i, 0, entrada);
    chats.set(chat, lista);
    podarChat(chat, ahora);
    return true;
  }

  function olvidar(chat, id) {
    const lista = chats.get(chat);
    const i = lista ? lista.findIndex((x) => x.id === id) : -1;
    if (i < 0) return false;
    lista.splice(i, 1);
    subirVersion(chat);
    return true;
  }

  // Only its author's edit counts: WhatsApp only lets the author edit, but the bot doesn't get that check for free, and
  // anyone could have changed what Claudia remembers of somebody else. Any of the ids the edit came with (autores) will
  // do against the ones the message came with: in a group listed by number, one message may come with the LID alongside
  // and the next without. An edit that leaves no text forgets the message.
  function editar(chat, id, texto, autores, comando) {
    const entrada = (chats.get(chat) || []).find((x) => x.id === id);
    const suyos = [entrada?.usuario, entrada?.participant].filter(Boolean);
    if (!suyos.length || !autores.some((autor) => autor && suyos.includes(autor))) return false;
    const limpio = limpiar(texto);
    if (!limpio) return olvidar(chat, id);
    entrada.texto = limpio;
    if (comando !== null) entrada.comando = comando;
    subirVersion(chat);
    return true;
  }

  function ingreso(chat, ids, cuando) {
    for (const id of ids) {
      if (!esTexto(id)) continue;
      ingresos.delete(`${chat}|${id}`);
      ingresos.set(`${chat}|${id}`, cuando);
    }
    while (ingresos.size > MEMORIA_CORTA.MAX_INGRESOS) ingresos.delete(ingresos.keys().next().value);
    return true;
  }

  function podar(ahora) {
    for (const chat of chats.keys()) podarChat(chat, ahora);
    return true;
  }

  // Applies a change and says whether it changed anything. A change that doesn't fit (a wrong field, an unknown op) is
  // left out without an error: the copy gets them through a channel, and nothing it gets may take it down.
  function aplicarCambio(cambio) {
    try {
      if (!cambio || typeof cambio !== "object") return false;
      switch (cambio.op) {
        case "agregar": {
          const entrada = entradaValida(cambio.entrada);
          return esTexto(cambio.chat) && entrada !== null && esNumero(cambio.ahora) ? agregar(cambio.chat, entrada, cambio.ahora) : false;
        }
        case "olvidar":
          return esTexto(cambio.chat) && esTexto(cambio.id) ? olvidar(cambio.chat, cambio.id) : false;
        case "editar":
          if (!esTexto(cambio.chat) || !esTexto(cambio.id) || typeof cambio.texto !== "string" || !Array.isArray(cambio.autores)) return false;
          return editar(cambio.chat, cambio.id, cambio.texto, cambio.autores, typeof cambio.comando === "boolean" ? cambio.comando : null);
        case "ingreso":
          return esTexto(cambio.chat) && Array.isArray(cambio.ids) && esNumero(cambio.cuando) ? ingreso(cambio.chat, cambio.ids, cambio.cuando) : false;
        case "podar":
          return esNumero(cambio.ahora) ? podar(cambio.ahora) : false;
        case "reiniciar":
          if (!esNumero(cambio.desde)) return false;
          chats.clear();
          recortes.clear();
          ingresos.clear();
          inicio = cambio.desde;
          return true;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  // Everything, as plain data that can travel through a channel. Pruned first, so what's sent is what still counts.
  function instantanea(ahora = Date.now()) {
    podar(ahora);
    return {
      v: 1,
      desde: inicio,
      chats: [...new Set([...chats.keys(), ...recortes.keys()])].map((chat) => [chat, { mensajes: (chats.get(chat) || []).map((e) => ({ ...e })), recorte: recortes.get(chat) ?? null }]),
      ingresos: [...ingresos],
    };
  }

  // Joins a copy with what's here: the same message once (the one here first), in order, nothing from before either
  // side's cut, pruned. Its texts are taken as they are: they were cleaned when they were stored, and cleaning a text
  // that already ends cut ("…") would cut it again. Returns false, changing nothing, if the copy doesn't fit.
  function restaurar(copia, ahora = Date.now()) {
    const valida = copiaValida(copia);
    if (!valida) return false;
    for (const [chat, { mensajes, recorte }] of valida.chats) {
      const corte = Math.max(recortes.get(chat) ?? -Infinity, recorte ?? -Infinity);
      const vistos = new Set();
      const juntos = [];
      for (const entrada of [...(chats.get(chat) || []), ...mensajes]) {
        if (entrada.id && vistos.has(entrada.id)) continue;
        if (entrada.id) vistos.add(entrada.id);
        if (entrada.fecha > corte) juntos.push(entrada);
      }
      juntos.sort((a, b) => a.fecha - b.fecha); // stable: the same moment keeps its order
      chats.set(chat, juntos);
      if (corte !== -Infinity) recortes.set(chat, corte);
      podarChat(chat, ahora);
    }
    // When someone came in, the latest one known: the stricter for what a newcomer gets told.
    for (const [clave, cuando] of valida.ingresos) {
      if (ingresos.has(clave) && ingresos.get(clave) >= cuando) continue;
      ingresos.delete(clave);
      ingresos.set(clave, cuando);
    }
    while (ingresos.size > MEMORIA_CORTA.MAX_INGRESOS) ingresos.delete(ingresos.keys().next().value);
    inicio = valida.desde;
    return true;
  }

  return { chats, recortes, ingresos, versiones, desde: () => inicio, aplicarCambio, instantanea, restaurar };
}

// ---------- the bot's memory ----------

const memoria = crearMemoria();
export const contextoChat = memoria.chats;
export const contextoChatRecorte = memoria.recortes;
export const ingresosGrupo = memoria.ingresos;

let oyente = null;
let falloAvisado = false;

// Who gets told each change (lib/relevo-memoria.js, which passes it to start-process.js's copy). One at a time; null
// stops it. A listener that fails doesn't keep the change from being stored here.
export function alCambiarMemoria(fn) {
  oyente = typeof fn === "function" ? fn : null;
}

function avisar(cambio) {
  if (!oyente) return;
  try {
    oyente(cambio);
  } catch (e) {
    if (!falloAvisado) console.error("[memoria corta] no se pudo pasar un cambio a la copia:", e?.message || e);
    falloAvisado = true;
  }
}

// Since when this memory holds what was said: when the bot started, or when the memory it got back had started.
export const memoriaDesde = () => memoria.desde();

// Goes up with each deletion or edit applied in the chat, so a summary made before it isn't handed out again.
export const versionDe = (chat) => memoria.versiones.get(chat) || 0;

// lib/participantes.js, on group-participants.update "add": each of the ids the person may write with
// (lib/identidad.js).
export function recordarIngreso(chat, ids, cuando = Date.now()) {
  if (!chat) return;
  const cambio = { op: "ingreso", chat, ids: (ids || []).filter(esTexto), cuando };
  if (cambio.ids.length && memoria.aplicarCambio(cambio)) avisar(cambio);
}

// When they came into the group, 0 if it was before the memory started (or it never heard).
export const ingresoDe = (chat, id) => ingresosGrupo.get(`${chat}|${id}`) || 0;

// id, usuario and participant are what a glance needs to react to the message or quote it later (lib/vistazos.js).
// esAudio: the text is what a voice note said, not the message itself, so a glance can react to it but not quote it.
// comando: whether it was a bot command, told by its text as it came (fueComando, below). fecha: when it was sent.
// Returns whether it was stored.
export function recordarMensaje(chat, nombre, texto, esBot = false, { id = null, usuario = null, participant = null, fecha = Date.now(), esAudio = false, comando = null } = {}) {
  if (!chat || !texto) return false;
  const limpio = limpiar(texto);
  if (!limpio) return false;
  const entrada = { nombre: nombre || "alguien", texto: limpio, esBot, fecha, id, usuario, participant, ...(esAudio && { esAudio }), ...(comando !== null && { comando }) };
  const cambio = { op: "agregar", chat, entrada, ahora: Date.now() };
  if (!memoria.aplicarCambio(cambio)) return false;
  avisar(cambio);
  return true;
}

// Someone deleted the message: Claudia shouldn't quote it, react to it or summarize it. Returns whether it was here.
// The copy is told even if it wasn't: it may still have it.
export function olvidarMensaje(chat, id) {
  if (!chat || !id) return false;
  const cambio = { op: "olvidar", chat, id };
  const hecho = memoria.aplicarCambio(cambio);
  avisar(cambio);
  return hecho;
}

// Someone edited the message: what stays is how they left it. It used to keep the original, so whatever someone took
// back by editing still reached .resumen and Claudia. comando: whether the text left is a command (fueComando), told
// here because the copy can't (it has no plugins). Returns whether it changed anything; the copy is told regardless.
export function editarMensaje(chat, id, texto, autores, { comando = null } = {}) {
  if (!chat || !id) return false;
  const cambio = { op: "editar", chat, id, texto: String(texto ?? ""), autores: (autores || []).filter(esTexto), comando };
  const hecho = memoria.aplicarCambio(cambio);
  avisar(cambio);
  return hecho;
}

// What's older than the last 6 hours goes, beyond each chat's last 200, also in a chat that went quiet after a burst,
// where nothing new would trigger it (lib/tareas-programadas.js, every 5 minutes).
export function podarMemoria(ahora = Date.now()) {
  const cambio = { op: "podar", ahora };
  memoria.aplicarCambio(cambio);
  avisar(cambio);
}

// An empty memory, held from "desde" on: what main.js starts with when it got nothing back (lib/relevo-memoria.js),
// told to the copy too, so it doesn't keep what this one doesn't have.
export function reiniciarMemoria(desde = Date.now()) {
  const cambio = { op: "reiniciar", desde };
  memoria.aplicarCambio(cambio);
  avisar(cambio);
}

export const exportarMemoria = (ahora = Date.now()) => memoria.instantanea(ahora);

// A copy back (lib/relevo-memoria.js), joined with what's here. Not told to anybody: it came from the copy.
export const restaurarMemoria = (copia, ahora = Date.now()) => memoria.restaurar(copia, ahora);

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
  return entradasDeContexto(chat, idActual)
    .map((x) => `- ${x.esBot ? "Claudia (vos)" : x.nombre}: ${x.texto}`)
    .join("\n");
}

// The messages that text is made of, for what else the prompt says about whoever wrote them (lib/genero.js).
export function entradasDeContexto(chat, idActual = null) {
  const lista = contextoChat.get(chat) || [];
  const posicion = idActual ? lista.findIndex((x) => x.id === idActual) : -1;
  return (posicion >= 0 ? lista.slice(0, posicion) : lista).slice(-MEMORIA_CORTA.EN_CONTEXTO);
}

// A chat's stored messages since a given moment (for .resumen).
export function mensajesRecientes(chat, desdeMs) {
  return (contextoChat.get(chat) || []).filter((x) => x.fecha >= desdeMs);
}

// From when on a chat's history is complete for a window that starts at desdeMs: desdeMs itself, unless messages from
// inside the window had to be dropped to make room (then the oldest one kept), or the memory began after it (then when
// it began; what arrived late from before, sent while the bot was down, takes it back to that).
export function historialCompletoDesde(chat, desdeMs) {
  const recorte = contextoChatRecorte.get(chat);
  const lista = contextoChat.get(chat) || [];
  const porLoCortado = recorte === undefined || recorte < desdeMs || lista.length === 0 ? desdeMs : Math.max(desdeMs, lista[0].fecha);
  return Math.max(porLoCortado, Math.min(memoriaDesde(), lista[0]?.fecha ?? Infinity));
}

// Whether a stored message was a bot command, for .resumen and the glances to leave it out. Told as it came, by its
// text as typed (plugins/_memoria-corta.js marks it): the stored text carries its mentions as names, and "@Sol ¿venís?"
// read as "@" and the command .sol, so whatever someone said to Sol dropped out of both. What carries no mark (her own
// messages, what a voice note said) goes by its text.
export const fueComando = (entrada) => entrada.comando ?? esComando(entrada.texto);
