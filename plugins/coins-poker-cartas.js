import { CMD, mesasDeJugador, textoCartasDe } from "../lib/poker.js";
import { idsDe } from "../lib/identidad.js";
import { nombreDeGrupo } from "../lib/cache-grupos.js";

// .cartas: a poker player's two cards, only in a private chat with Claudia (lib/poker.js). She never writes first:
// each player asks, every hand, as often as they like. In a group it refuses and points to private, so no card is ever
// shown to the table. The player is found by any id they come under, LID or number, across every open table.
const plugin = {};
plugin.cmd = [...CMD.cartas];

plugin.run = async (m, { client }) => {
  try {
    if (m.isGroup) return client.sendText(m.chat, `Las cartas te las digo por privado: escribime .${CMD.cartas[0]} a mí, no acá.`, m);
    const mesas = mesasDeJugador(idsDe([m.sender, m.senderJid].filter(Boolean), { conSuNumero: true }));
    if (!mesas.length) return client.sendText(m.chat, `No estás sentado en ninguna mesa de póker. Se juega en un grupo: .${CMD.poker[0]} 100 abre una mesa o te sienta en la que haya.`, m);
    const partes = [];
    for (const { mesa, asiento } of mesas) {
      const grupo = await nombreDeGrupo(client, mesa.chat);
      partes.push(`🃏 *Póker en ${grupo}*${mesa.mano ? ` · mano ${mesa.mano.numero}` : ""}\n${textoCartasDe(mesa, asiento)}`);
    }
    return client.sendText(m.chat, partes.join("\n\n"), m);
  } catch (e) {
    console.error("[poker] ERROR:", e);
  }
};

export default plugin;
