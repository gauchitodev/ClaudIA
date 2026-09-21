import { getUser } from "../database-functions.js";

// A local generic avatar (grey figure) for when the real picture can't be fetched.
// It's a file inside the bot, so it never depends on an external link that could go down.
export const AVATAR_DEFAULT = "./resources/avatar-default.png";

// Resolves a user's profile picture as robustly as possible:
// 1. If the identifier is a @lid, it translates it to the real number (jid) through the database.
// 2. It tries to get the picture's URL.
// 3. If it can't (privacy, no picture, etc.), it returns the path of the local generic avatar.
// It always returns something Jimp.read() can take; never null.
export async function obtenerFotoPerfil(client, who) {
  if (!who) return AVATAR_DEFAULT;

  // If it's a @lid, try translating it to the real jid
  let objetivo = who;
  if (who.endsWith("@lid")) {
    const user = getUser(who);
    if (user?.jid) objetivo = user.jid;
  }

  // Try with the resolved target
  let pp = await client.profilePictureUrl(objetivo, "image").catch(() => null);

  // If that failed and we had translated, try the original too, just in case
  if (!pp && objetivo !== who) {
    pp = await client.profilePictureUrl(who, "image").catch(() => null);
  }

  // If there is still no picture, fall back to the local generic avatar
  return pp || AVATAR_DEFAULT;
}
