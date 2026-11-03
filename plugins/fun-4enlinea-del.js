// .del4enlinea: drops the group's 4 en línea table (lib/cuatro-en-linea.js), the ones playing it or an admin. Apart
// from .4enlinea, as .delttt is from .ttt, so that it works outside the game hours too (.horariojuegos stops
// plugin.conHorario): a table left open at closing time can always be cleared. With a bet, what goes back to whom is
// decided there.
import { cancelar } from "../lib/cuatro-en-linea.js";

const plugin = {};
plugin.cmd = ["del4enlinea"];
plugin.juego = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, isAdmin }) => {
  try {
    // isAdmin counts the owner too (permisosDe, lib/roles.js).
    const r = cancelar(m.chat, m.sender, isAdmin);
    if (!r.ok) return client.sendText(m.chat, r.error, m);
    return client.sendText(m.chat, r.texto, m, r.mentions.length ? { mentions: r.mentions } : {});
  } catch (e) {
    console.error("[4enlinea] ERROR:", e);
  }
};

export default plugin;
