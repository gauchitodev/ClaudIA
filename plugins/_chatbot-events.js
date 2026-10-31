const plugin = (m) => m;
plugin.moderacion = true; // runs before the other hooks (hooksEnOrden, load-functions.js)

// A live location shared in a group with .antiubicacion on: the whole group follows where the person goes for as long
// as they leave it on. Off unless the group turns it on. It came with the bot's original code on in every group, with
// no way to turn it off, and deleted without a word: whoever shared it saw it vanish and didn't know why. One notice
// per person every AVISO_UBICACION_MS, though each one is deleted: shared again and again, each time would bring the
// same notice. Who was told when goes on globalThis: in a variable of the plugin, saving the plugin's file started it
// over (load-functions.js imports it as a new module), and the next share brought the notice again.
const AVISO_UBICACION_MS = 10 * 60 * 1000;
// `${chat} ${sender}` -> when they were last told
if (!globalThis.avisoUbicacionCooldown) globalThis.avisoUbicacionCooldown = new Map();
function hayQueAvisar(chat, sender, ahora = Date.now()) {
  const avisados = globalThis.avisoUbicacionCooldown;
  for (const [clave, cuando] of avisados) if (ahora - cuando >= AVISO_UBICACION_MS) avisados.delete(clave);
  const clave = `${chat} ${sender}`;
  if (avisados.has(clave)) return false;
  avisados.set(clave, ahora);
  return true;
}

plugin.before = async (m, { client, isOwner, isMod, isBotAdmin, user, chat }) => {
  if (!m.isGroup) return;

  // What gets deleted here is marked, and no hook after this one touches it (Claudia, the marketplace, the hashtags).
  // As the anti-links do: only with the bot an admin, which deleting takes, and with the anti-delete on it says so
  // instead (plugins/_all-anti-links.js).
  if (m.mtype === "liveLocationMessage" && chat.antiLiveLocation && isBotAdmin && !isMod && !isOwner) {
    if (chat.antiDelete) {
      if (hayQueAvisar(m.chat, m.sender)) client.sendText(m.chat, "📍 Se compartió una ubicación en tiempo real, pero está el anti-eliminar prendido y no la borro (.antieliminar off para que la borre).", m).catch(console.error);
      return;
    }
    m.moderado = true;
    await m.delete();
    if (hayQueAvisar(m.chat, m.sender)) client.sendText(m.chat, `📍 @${m.sender.split("@")[0]}, en este grupo no se comparte la ubicación en tiempo real: la borré.`, null, { mentions: [m.sender] }).catch(console.error);
    return;
  }

  if (m.mentionedJid && m.mentionedJid.length >= 10 && !isOwner && !isMod) {
    m.moderado = true;
    m.delete();
    client.sendText(m.chat, `Ponete a hacer algo productivo y dejate de joder @${m.sender.split("@")[0]} 🤨`, m, { mentions: [m.sender] });
  }

  if (user.banned) return;
  if (chat.isBanned) return;

  return;
};

export default plugin;
