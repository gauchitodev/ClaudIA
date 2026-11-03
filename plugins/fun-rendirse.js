// .rendirse (or .rendirme) gives up whatever game you're in: the 4 en línea you're playing in this group
// (lib/cuatro-en-linea.js), or else your blackjack hand (lib/blackjack.js), which takes back half the stake. One
// command for both, which no two plugins may declare (test/menus.test.mjs).
// It isn't marked casino: giving up a 4 en línea works with the casino off or closed, free or with a bet. The way to
// the blackjack checks the casino's switches here (frenoDelCasino), as the dispatcher did when .rendirse was its own.
import { salaVigente, rendirse as rendirseCuatroEnLinea } from "../lib/cuatro-en-linea.js";
import { estadoMano, rendirse as rendirseBlackjack } from "../lib/blackjack.js";
import { frenoDelCasino } from "../lib/casino.js";

const plugin = {};
plugin.cmd = ["rendirse", "rendirme"];
plugin.juego = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, chat }) => {
  try {
    const sala = salaVigente(m.chat);
    const sentado = Boolean(sala && [sala.j1, sala.j2].includes(m.sender));
    if (sentado && sala.estado === "JUGANDO") {
      const r = rendirseCuatroEnLinea(m.chat, m.sender);
      return client.sendMessage(m.chat, { text: r.ok ? r.texto : r.error, mentions: r.mentions || [] }, { quoted: m });
    }
    if (estadoMano(m.chat, m.sender)) {
      const freno = frenoDelCasino(m, chat);
      if (freno) return freno(client);
      const r = rendirseBlackjack(m.chat, m.sender);
      return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
    }
    if (sentado) return client.sendText(m.chat, "Todavía no empezó: si querés dejar la mesa, usá .del4enlinea.", m);
    return client.sendText(m.chat, "No estás jugando al 4 en línea ni tenés una mano de blackjack.", m);
  } catch (e) {
    console.error("[rendirse] ERROR:", e);
  }
};

export default plugin;
