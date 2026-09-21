import { banderaCircular } from "../lib/canvas.js";
import { obtenerFotoPerfil } from "../lib/foto-perfil.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["trans", "transexual"];
plugin.juego = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // It used to build "<digits>@lid" from whatever was typed: with a phone number, that is a LID which doesn't exist.
  const { objetivo: who, mencionado } = destinatario(m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  const pp = await obtenerFotoPerfil(client, who);
  m.react("⏳");
  try {
    const imagen = await banderaCircular(pp, "https://openclipart.org/image/800px/345534");
    await client.sendFile(m.chat, imagen, `${Date.now()}.png`, "🏳️‍⚧️", m);
  } catch (e) {
    console.error(e);
  }
};

export default plugin;
