import { obtenerFotoPerfil, AVATAR_DEFAULT } from "../lib/foto-perfil.js";
import { destinatarioActual } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["gpu", "getppuser"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // It used to build "<digits>@lid" from whatever was typed: with a phone number, that is a LID which doesn't exist.
  const { objetivo: who, mencionado } = await destinatarioActual(client, m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // obtenerFotoPerfil translates the @lid to the real number; if it returns the generic avatar, no picture is visible.
  const pp = await obtenerFotoPerfil(client, who);
  if (!pp || pp === AVATAR_DEFAULT) return client.sendText(m.chat, txt.defaultNoPP, m);
  // The picture is the answer: if it doesn't come down (sendFile throws, lib/wa-socket.js), that's said instead of
  // nothing.
  await client.sendFile(m.chat, pp, "pp.jpg", null, m).catch((e) => {
    console.error("[gpu] no pude mandar la foto:", e?.message || e);
    return client.sendText(m.chat, "No pude bajar esa foto de perfil; probá de nuevo en un rato.", m);
  });
};

export default plugin;
