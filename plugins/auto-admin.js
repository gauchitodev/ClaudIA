import { cambiarParticipante, idDelAutor } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["aa"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, isOwner, participants }) => {
  if (!isOwner) return;
  const { ok, status } = await cambiarParticipante(client, m.chat, idDelAutor(m, participants), "promote");
  if (!ok) return client.sendText(m.chat, `No pude darte el admin (error ${status}).`, m);
};

export default plugin;
