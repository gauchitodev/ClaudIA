import { superponer } from "../lib/canvas.js";
import { obtenerFotoPerfil } from "../lib/foto-perfil.js";

const plugin = {};
plugin.cmd = ["bisexual", "bi"];
plugin.juego = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  const numberMatchesPlus = text.match(/\+[0-9\s]+/g);
  if (numberMatchesPlus && numberMatchesPlus.length > 0) {
    who = `${numberMatchesPlus[0].replace(/[+\s]/g, "")}@s.whatsapp.net`;
  } else if (numberMatches && numberMatches.length > 0) {
    who = `${numberMatches[0].replace("@", "").replace(/\s+/g, "")}@lid`;
  } else if (m.quoted) {
    who = m.quoted.sender;
  }
  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

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
