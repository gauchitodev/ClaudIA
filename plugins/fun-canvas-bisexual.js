import { superponer } from "../lib/canvas.js";
import { obtenerFotoPerfil } from "../lib/foto-perfil.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["bisexual", "bi"];
plugin.juego = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // Antes se armaba "<dígitos>@lid" con lo que estuviera escrito: con un teléfono, eso es un LID que no existe.
  const { objetivo: who, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  const pp = await obtenerFotoPerfil(client, who);
  m.react("⏳");
  try {
    const imagen = await superponer(pp, "https://openclipart.org/image/800px/344896", { opacidad: 0.9, escala: 1.05 });
    await client.sendFile(m.chat, imagen, `${Date.now()}.jpg`, "🌈🏳️‍🌈", m);
  } catch (err) {
    console.error(err);
  }
};

export default plugin;
