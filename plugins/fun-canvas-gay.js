import { superponer } from "../lib/canvas.js";
import { obtenerFotoPerfil } from "../lib/foto-perfil.js";
import { destinatarioActual } from "../lib/identidad.js";
import txt from "../lib/strings.js";

const plugin = {};
plugin.cmd = ["gay"];
plugin.juego = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // It used to build "<digits>@lid" from whatever was typed: with a phone number, that is a LID which doesn't exist.
  const { objetivo: who, mencionado } = await destinatarioActual(client, m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  const pp = await obtenerFotoPerfil(client, who);
  // Without a photo the bot can see there's nothing to put the effect on: it used to go on a grey generic avatar.
  if (!pp) return client.sendText(m.chat, txt.defaultNoPP, m);
  m.react("⏳");
  try {
    const imagen = await superponer(pp, "https://vectorflags.s3.amazonaws.com/flags/org-lgbt-square-01.png", { opacidad: 0.3 });
    await client.sendFile(m.chat, imagen, `${Date.now()}.jpg`, "🌈🏳️‍🌈", m);
  } catch (e) {
    // If their photo or the layer doesn't come down, or the image doesn't go, that's said: it used to be just the ⏳.
    console.error(`[${command}] no pude armar la foto:`, e?.message || e);
    return client.sendText(m.chat, "No pude armar la foto; probá de nuevo en un rato.", m);
  }
};

export default plugin;
