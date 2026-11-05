import { mandarConImagen } from "../lib/con-imagen.js";
import { tarjetaPedida } from "../lib/redes-persona.js";

// .ig @usuario (or the link): your Instagram for the group, as a card with the link. With someone mentioned, theirs as
// they loaded it with .misredes; alone, yours, loaded the same way (lib/redes-persona.js, tarjetaPedida).
const plugin = {};
plugin.cmd = ["ig"];
plugin.botAdmin = true;

const IMAGEN = "https://telegra.ph/file/1af5d76a06d74180fac0d.jpg";

plugin.run = async (m, { client, text, command, participants }) => {
  const r = await tarjetaPedida("instagram", { client, m, text, participants, comando: command, uso: `Pasame tu usuario o el link de tu Instagram: .${command} @usuario.` });
  if (!r.mentions) return client.sendText(m.chat, r.texto, m);
  m.react("🤳");
  // The picture is a decoration: what matters is the link, and it goes even if the picture doesn't come.
  await mandarConImagen(client, m.chat, IMAGEN, r.texto, m, "ig");
};

export default plugin;
