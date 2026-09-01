import { getUser } from "../database-functions.js";

// Avatar genérico local (muñeco gris) para cuando no se puede obtener la foto real.
// Es un archivo dentro del bot, así nunca depende de un link externo que pueda caerse.
const AVATAR_DEFAULT = "./resources/avatar-default.png";

// Resuelve la foto de perfil de un usuario de la forma más robusta posible:
// 1. Si el identificador es un @lid, lo traduce al número real (jid) usando la base de datos.
// 2. Intenta obtener la URL de la foto.
// 3. Si no puede (privacidad, sin foto, etc.), devuelve la ruta del avatar genérico local.
// Siempre devuelve algo usable por Jimp.read(); nunca null.
export async function obtenerFotoPerfil(client, who) {
  if (!who) return AVATAR_DEFAULT;

  // Si es un @lid, intentar traducir al jid real
  let objetivo = who;
  if (who.endsWith("@lid")) {
    const user = getUser(who);
    if (user?.jid) objetivo = user.jid;
  }

  // Intentar con el objetivo resuelto
  let pp = await client.profilePictureUrl(objetivo, "image").catch(() => null);

  // Si falló y habíamos traducido, intentar también con el original por las dudas
  if (!pp && objetivo !== who) {
    pp = await client.profilePictureUrl(who, "image").catch(() => null);
  }

  // Si sigue sin haber foto, usar el avatar genérico local
  return pp || AVATAR_DEFAULT;
}
