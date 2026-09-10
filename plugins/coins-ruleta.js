import { apostarRuleta, textoMesaRuleta, textoLimitesCasino, CASINO } from "../lib/casino.js";

const plugin = {};
plugin.cmd = ["ruleta"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // el horario de .horariojuegos frena solo estos
plugin.onlyGroup = true;

// .ruleta <cantidad> <apuesta>: la primera apuesta abre la mesa; durante unos segundos apuestan todos, y después
// la bola sale una sola vez para todas las apuestas. .ruleta sin nada muestra la mesa abierta o la ayuda.
plugin.run = async (m, { client, args, chat }) => {
  const cantidad = parseInt(args[0], 10);
  if (!args[0] || Number.isNaN(cantidad)) {
    const mesa = textoMesaRuleta(m.chat);
    if (mesa) return client.sendMessage(m.chat, { text: mesa.texto, mentions: mesa.mentions }, { quoted: m });
    return client.sendText(
      m.chat,
      `🎡 *Ruleta* — uso: .ruleta <cantidad> <apuesta>\n\n▸ rojo, negro, par, impar, 1-18, 19-36 → x2\n▸ docenas (1-12, 13-24, 25-36) y columnas (columna 1, 2 o 3) → x3\n▸ seisena, seis seguidos (16-17-18-19-20-21) → x6\n▸ cuadro, la esquina de cuatro (17-18-20-21) → x9\n▸ calle, tres seguidos (16-17-18) → x12\n▸ caballo, dos vecinos (17-18 o 17-20) → x18\n▸ pleno, un número del 0 al 36 (al 0 también como verde o cero) → x36\n\nLa primera apuesta abre la mesa y la bola sale a los ${CASINO.RULETA_SEGUNDOS} segundos, para todas las apuestas juntas. Hasta ${CASINO.RULETA_MAX_APUESTAS_POR_PERSONA} apuestas por persona por giro.\n${textoLimitesCasino("apuesta")}\nEj: .ruleta 20 rojo`,
      m,
    );
  }
  const r = apostarRuleta(m.chat, m.sender, cantidad, args.slice(1).join(" "), (resultado) => client.sendMessage(m.chat, { text: resultado.texto, mentions: resultado.mentions }));
  if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
  await client.sendMessage(m.chat, { text: r.mensaje, mentions: r.mentions }, { quoted: m });
};

export default plugin;
