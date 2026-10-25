import { cambiarParticipante, idDelAutor } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["ad"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, isAdmin, participants }) => {
  if (isAdmin) {
    const { ok, status } = await cambiarParticipante(client, m.chat, idDelAutor(m, participants), "demote");
    if (!ok) return client.sendText(m.chat, `No pude sacarte el admin (error ${status}).`, m);
  }
};

export default plugin;
