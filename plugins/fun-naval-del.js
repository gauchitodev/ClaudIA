// .delnaval: drops the group's batalla naval (lib/batalla-naval.js), the ones playing it or an admin. Apart from
// .naval, as .del4enlinea is from .4enlinea, so that it works outside the game hours too (.horariojuegos stops
// plugin.conHorario): a table left open at closing time can always be cleared. With a bet, what goes back to whom is
// decided there.
import { cancelar } from "../lib/batalla-naval.js";

const plugin = {};
plugin.cmd = ["delnaval"];
plugin.juego = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, isAdmin }) => {
  try {
    // isAdmin counts the owner too (permisosDe, lib/roles.js).
    const r = cancelar(m.chat, m.sender, isAdmin);
    if (!r.ok) return client.sendText(m.chat, r.error, m);
    return client.sendText(m.chat, r.texto, m, r.mentions.length ? { mentions: r.mentions } : {});
  } catch (e) {
    console.error("[naval] ERROR:", e);
  }
};

export default plugin;
