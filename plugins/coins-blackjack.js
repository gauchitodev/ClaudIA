import { repartir, pedir, plantarse, doblar, dividir, seguro, rendirse, estadoMano, BLACKJACK } from "../lib/blackjack.js";
import { COINS } from "../lib/urucoins.js";

const plugin = {};
plugin.cmd = ["blackjack", "bj", "pedir", "plantarse", "plantarme", "doblar", "dividir", "seguro", "rendirse", "rendirme"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // el horario de .horariojuegos frena solo estos
plugin.onlyGroup = true;

const ACCIONES = { pedir, plantarse, plantarme: plantarse, doblar, dividir, seguro, rendirse, rendirme: rendirse };

plugin.run = async (m, { client, args, command, chat }) => {

  let r;
  if (ACCIONES[command]) r = ACCIONES[command](m.chat, m.sender);
  else {
    const cantidad = parseInt(args[0], 10);
    if (!args[0] || Number.isNaN(cantidad)) {
      const enJuego = estadoMano(m.chat, m.sender);
      if (enJuego) return client.sendText(m.chat, enJuego, m);
      return client.sendText(
        m.chat,
        `🃏 *Blackjack* — uso: .blackjack <cantidad>\n\nJugás contra la banca: te reparte dos cartas y una a la vista de ella. La banca pide hasta 17 y se planta. Ganar paga x2, blackjack natural x2.5, empate devuelve.\n\n▸ .pedir / .plantarse\n▸ .doblar — con las dos primeras cartas: otra apuesta igual, una carta y te plantás\n▸ .dividir — con dos cartas del mismo valor: dos manos con otra apuesta igual (los ases reciben una carta cada uno)\n▸ .seguro — si la banca muestra un as: cuesta la mitad y paga 2 a 1 si tiene blackjack\n▸ .rendirse — con las dos primeras cartas: recuperás la mitad\n\nSi no decidís en ${BLACKJACK.SEGUNDOS_DECISION} segundos, te plantás solo. Mínimo ${COINS.APUESTA_MIN}, máximo ${COINS.CASINO_APUESTA_MAX} por mano (o el ${COINS.APUESTA_MAX_PORCENTAJE} % de tu saldo, lo que sea mayor), tope ${COINS.CASINO_TOPE_DIA} por día en el casino.\nEj: .blackjack 20`,
        m,
      );
    }
    r = repartir(m.chat, m.sender, cantidad, (vencida) => client.sendMessage(m.chat, { text: vencida.mensaje, mentions: vencida.mentions }));
  }
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
