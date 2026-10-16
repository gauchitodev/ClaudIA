// What Claudia learns of each person while chatting (the "recordar" field of her replies), kept per group, in
// inGroup[chat].memoria. It used to be one memory per person for the whole bot: something told to her in private, or in
// another group, came up in the prompt of every group that person talked to her in, and in their birthday greeting.
// In private she keeps nothing. Whoever it's about can see it and have it forgotten (.memoria yo / .memoria olvidame).
import { getUser, updateUserInGroup } from "../database-functions.js";
import { SENSIBLE } from "./memoria-grupo.js";

export const MEMORIA_PERSONA = { MAX_DATOS: 6, MAX_LARGO: 600, MAX_DATO: 200 };

export const memoriaDe = (usuario, chat) => getUser(usuario)?.inGroup?.[chat]?.memoria || "";

// Adds what she learned to what she knew, read from the row right then: two chats at once each used to write back the
// memory they had read on arrival, and the last one wiped the other's. The prompt asks her not to keep anything
// sensitive; the same filter as .recordá makes sure. Returns the new memory, or null if nothing was kept.
export function anotarDe(usuario, chat, dato) {
  const limpio = String(dato || "").replace(/\s+/g, " ").trim().slice(0, MEMORIA_PERSONA.MAX_DATO);
  if (!limpio || !String(chat).endsWith("@g.us") || SENSIBLE.test(limpio)) return null;
  const previos = memoriaDe(usuario, chat).split(" | ").filter(Boolean);
  const nueva = [...previos, limpio].slice(-MEMORIA_PERSONA.MAX_DATOS).join(" | ").slice(-MEMORIA_PERSONA.MAX_LARGO);
  return updateUserInGroup(usuario, chat, { memoria: nueva }) ? nueva : null;
}

export function olvidarDe(usuario, chat) {
  if (!memoriaDe(usuario, chat)) return false;
  updateUserInGroup(usuario, chat, { memoria: "" });
  return true;
}
