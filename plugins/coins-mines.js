import { iniciar, destapar, retirar, estadoPartida, MINES } from "../lib/mines.js";
import { COINS } from "../lib/urucoins.js";

// .mines <cantidad> [minas] · .destapar B3 · .retirar
const plugin = {};
plugin.cmd = ["mines", "minas", "destapar", "abrir", "retirar"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, args, command }) => {
  let r;
  if (command === "destapar" || command === "abrir") r = destapar(m.chat, m.sender, args[0]);
  else if (command === "retirar") r = retirar(m.chat, m.sender);
  else {
    const cantidad = parseInt(args[0], 10);
    if (!args[0] || Number.isNaN(cantidad)) {
      const enJuego = estadoPartida(m.chat, m.sender);
      if (enJuego) return client.sendText(m.chat, enJuego, m);
      return client.sendText(
        m.chat,
        `💣 *Mines* — uso: .mines <cantidad> [minas]\n\nUna grilla de 5x5 con minas escondidas (${MINES.MINAS_DEFAULT} si no decís cuántas, hasta ${MINES.MINAS_MAX}). Destapás casillas de a una: cada segura sube el multiplicador, y podés retirar cuando quieras. Si tocás una mina, perdés la apuesta. Más minas, más paga cada casilla.\n\n▸ .destapar B3 (o .destapar 8) — abre una casilla\n▸ .retirar — cobrás apuesta x multiplicador\n\nEl premio tiene techo de x${MINES.MAX_MULT}; al llegar, o al destapar todas las seguras, se retira solo. Si no decidís en ${MINES.SEGUNDOS_DECISION} segundos, también. Mínimo ${COINS.APUESTA_MIN}, máximo ${COINS.CASINO_APUESTA_MAX} (o el ${COINS.APUESTA_MAX_PORCENTAJE} % de tu saldo, lo que sea mayor). La racha doble no aplica en el casino; el escudo sí.\nEj: .mines 20 3`,
        m,
      );
    }
    r = iniciar(m.chat, m.sender, cantidad, args[1], (vencida) => client.sendMessage(m.chat, { text: vencida.mensaje, mentions: vencida.mentions }));
  }
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
