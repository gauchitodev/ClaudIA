import { identidadesDe } from "./identidad.js";

// A user's profile picture URL, or null when the bot can't see one: no picture, a privacy setting that leaves the bot
// out, or WhatsApp not answering. Whoever asks (.gay, .trans and the other effects, .gpu) says so and stops: the
// effects used to get a grey generic avatar instead, and put the effect on it as if it were that person's photo.
// 1. If the identifier is a @lid, it translates it to the real number (jid) through the database.
// 2. It tries to get the picture's URL, by the number first and then by the LID.
export async function obtenerFotoPerfil(client, who) {
  if (!who) return null;

  // If it's a @lid, try translating it to the real jid
  let objetivo = who;
  if (who.endsWith("@lid")) objetivo = identidadesDe(who).jid || who;

  // Try with the resolved target
  let pp = await client.profilePictureUrl(objetivo, "image").catch(() => null);

  // If that failed and we had translated, try the original too, just in case
  if (!pp && objetivo !== who) {
    pp = await client.profilePictureUrl(who, "image").catch(() => null);
  }

  // Baileys throws when WhatsApp answers with an error, but gives undefined when it doesn't answer in time.
  return pp || null;
}
