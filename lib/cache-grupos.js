// The group metadata cache: who is in each group, who is an admin there, what the group is called.
//
// Why this exists as a module. Baileys asks WhatsApp for a group's participant list on EVERY message the bot sends
// to that group, unless the socket is handed a "cachedGroupMetadata" callback — its own documentation flags that as
// a way to get rate-limited or banned. The bot already kept a copy in client.chats[jid].metadata, but it was
// written from four different places, Baileys never saw it, and nothing ever expired it: a promote that got lost on
// the way left that person as a non-admin forever.
//
// So this is now the only door to group metadata. It keeps writing client.chats[jid] because three plugins read it
// straight (grupo-lista-negra, owner-blacklist-grupo, lista-advertidos), but that is a copy, not the source.

export const CACHE_GRUPOS = {
  VIDA_MS: 5 * 60 * 1000, // how long a copy is trusted; the same number the Baileys docs use in their example
  REFRESCO_MIN_MS: 3000, // two forced refreshes closer than this share one query (a join fires two events);
  // it doubles as how long a failed query is remembered before trying again
};

const cache = new Map(); // chat -> { metadata, pedidaEn, forzada }
const enVuelo = new Map(); // chat -> { promesa, forzada }, so several asks at once turn into a single query
const fallos = new Map(); // chat -> when the last query failed, so a failing group isn't asked about forever
const cuenta = { aciertos: 0, pedidos: 0 };

const esGrupo = (chat) => typeof chat === "string" && chat.endsWith("@g.us");

// Stores the copy, and mirrors it into client.chats for whoever still reads it from there. Returns the copy that ended
// up stored, which is not the one passed in when a newer one was already there. "ahora" is when the copy was ASKED
// for, not when it arrived: that is what says which of two copies is older.
export function guardar(client, chat, metadata, { ahora = Date.now(), forzada = false } = {}) {
  if (!esGrupo(chat) || !metadata) return null;
  const existente = cache.get(chat);
  // A forced refresh answers something that just changed (a join, a promote), so a copy asked for before it can only
  // be older. A routine query or a bulk load already under way when the change arrived would otherwise finish later
  // and put the old list back.
  if (existente?.forzada && existente.pedidaEn > ahora) return existente.metadata;
  cache.set(chat, { metadata, pedidaEn: ahora, forzada });
  fallos.delete(chat);
  if (client?.chats) {
    // The entry is edited in place, never replaced: pushMessage holds a reference to it while it files the chat's
    // last messages, and swapping the object underneath would send those messages to an orphan.
    const entrada = client.chats[chat] || (client.chats[chat] = { id: chat });
    entrada.id = chat;
    entrada.subject = metadata.subject;
    entrada.isChats = true;
    entrada.metadata = metadata;
  }
  return metadata;
}

// For what groupFetchAllParticipating() returns: every group at once, for free. "ahora" is when the bulk load was
// asked for, so a forced refresh that came in while it was under way isn't undone by it.
export function guardarVarios(client, grupos, ahora = Date.now()) {
  let guardados = 0;
  for (const chat in grupos || {}) {
    if (guardar(client, chat, grupos[chat], { ahora })) guardados++;
  }
  return guardados;
}

// The copy, only if it's still within its lifetime. Synchronous: it never asks WhatsApp.
export function enCache(chat, ahora = Date.now()) {
  const guardada = cache.get(chat);
  return guardada && ahora - guardada.pedidaEn < CACHE_GRUPOS.VIDA_MS ? guardada.metadata : null;
}

export function invalidar(client, chat) {
  cache.delete(chat);
  if (client?.chats?.[chat]) delete client.chats[chat].metadata;
}

// What to do with one entry of a "groups.update" event. Two different things arrive through it:
// groupFetchAllParticipating() emits it with the WHOLE metadata of every group (Baileys' Socket/groups.js:56), and
// so does the refresh WhatsApp asks for with "CB:ib,,dirty" — that is metadata already paid for, so it gets kept.
// A settings change (open/closed, name, description) arrives as a partial object with no participants, and that one
// only invalidates. Until they were told apart, every insertAllGroup() wiped the cache it had just filled.
export function aplicarCambioDeGrupo(client, cambio) {
  if (!cambio?.id) return null;
  if (!Array.isArray(cambio.participants)) {
    invalidar(client, cambio.id);
    return null;
  }
  // Whole metadata only fills a gap, never replaces a copy that is still current: Baileys holds groups.update back for
  // up to 30 s while it buffers (Utils/event-buffer.js), and group-participants.update isn't buffered, so this may be
  // older than a refresh that already happened.
  return enCache(cambio.id) ? null : guardar(client, cambio.id, cambio);
}

// Dropped on reconnect: events may have been missed while the bot was down. The counters go with it, so what
// .estado shows is always "since this connection".
export function vaciar() {
  cache.clear();
  fallos.clear();
  cuenta.aciertos = 0;
  cuenta.pedidos = 0;
}

export function estadisticas() {
  return { grupos: cache.size, aciertos: cuenta.aciertos, pedidos: cuenta.pedidos };
}

// The only way to get a group's metadata. "fresca" is for the events that change it (someone joined, was promoted,
// the group was opened): it skips the lifetime and asks WhatsApp, unless another forced refresh just did.
//
// It never rejects: it resolves to the metadata, or to null when there is nothing to give. That matters because one
// of its callers is the cachedGroupMetadata callback, which Baileys awaits in the middle of sending a message: a
// rejection there would take the message down with it.
export async function metadataDe(client, chat, { fresca = false, ahora = Date.now() } = {}) {
  if (!esGrupo(chat)) return null;
  const pendiente = enVuelo.get(chat);
  // A forced refresh on its way means the stored copy is known to be old: everyone waits for the new one. Otherwise a
  // command sent right after a demote would still be checked against the list from before it.
  if (pendiente?.forzada) return pendiente.promesa;

  const guardada = cache.get(chat);
  const edad = guardada ? ahora - guardada.pedidaEn : Infinity;
  // A forced refresh only settles for another forced one from the last REFRESCO_MIN_MS: a join arrives twice (the
  // group notice through processMessageStubType, and group-participants.update) and one query covers both. A routine
  // copy won't do however recent it is, because it may have been asked for a second before the change.
  const sirve = fresca ? guardada?.forzada && edad < CACHE_GRUPOS.REFRESCO_MIN_MS : edad < CACHE_GRUPOS.VIDA_MS;
  if (guardada && sirve) {
    cuenta.aciertos++;
    return guardada.metadata;
  }
  if (pendiente && !fresca) return pendiente.promesa;
  // A group that can't be fetched — the bot was removed, WhatsApp is rate-limiting — would otherwise be asked
  // about on every single message that arrives from it, which is the very loop this cache exists to break.
  if (ahora - (fallos.get(chat) || 0) < CACHE_GRUPOS.REFRESCO_MIN_MS) return guardada?.metadata || null;

  const promesa = (async () => {
    cuenta.pedidos++;
    return guardar(client, chat, await client.groupMetadata(chat), { ahora, forzada: fresca });
  })()
    // If WhatsApp doesn't answer, an old copy beats nothing: without it handle-message ends up with an empty
    // participant list, which reads as "nobody is an admin" and knocks out every onlyAdmin command.
    .catch((e) => {
      console.error("[grupos] no se pudo pedir la metadata de", chat, e?.message || e);
      fallos.set(chat, ahora);
      return cache.get(chat)?.metadata || null;
    })
    // A forced refresh may have taken this query's place in enVuelo: only its own entry is removed.
    .finally(() => {
      if (enVuelo.get(chat)?.promesa === promesa) enVuelo.delete(chat);
    });

  enVuelo.set(chat, { promesa, forzada: fresca });
  return promesa;
}

// Just the group's name. It settles for an expired copy: a name doesn't go stale the way an admin list does.
export async function nombreDeGrupo(client, chat) {
  if (!esGrupo(chat)) return chat;
  const guardado = client?.chats?.[chat]?.subject || cache.get(chat)?.metadata?.subject;
  if (guardado) return guardado;
  return (await metadataDe(client, chat))?.subject || chat;
}
