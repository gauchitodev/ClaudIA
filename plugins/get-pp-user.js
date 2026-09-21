import { obtenerFotoPerfil, AVATAR_DEFAULT } from "../lib/foto-perfil.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["gpu", "getppuser"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // Antes se armaba "<dígitos>@lid" con lo que estuviera escrito: con un teléfono, eso es un LID que no existe.
  const { objetivo: who, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // obtenerFotoPerfil traduce el @lid al número real; si devuelve el avatar genérico es que no hay foto visible.
  const pp = await obtenerFotoPerfil(client, who);
  if (!pp || pp === AVATAR_DEFAULT) return client.sendText(m.chat, txt.defaultNoPP, m);
  await client.sendFile(m.chat, pp, "pp.jpg", null, m);
};

export default plugin;
