import { apostarCarrera, textoCarrera, CARRERA } from "../lib/carrera.js";
import { COINS } from "../lib/urucoins.js";
import { setTimeout as esperar } from "node:timers/promises";

const plugin = {};
plugin.cmd = ["carrera", "caballos"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // el horario de .horariojuegos frena solo estos
plugin.onlyGroup = true;

// .carrera <cantidad> <número o nombre>: la primera apuesta abre la carrera; a los 45 s se corre para todos.
plugin.run = async (m, { client, args, chat }) => {
  const cantidad = parseInt(args[0], 10);
  if (!args[0] || Number.isNaN(cantidad)) {
    const abierta = textoCarrera(m.chat);
    if (abierta) return client.sendMessage(m.chat, { text: abierta.texto, mentions: abierta.mentions }, { quoted: m });
    return client.sendText(
      m.chat,
      `🏇 *Carrera de caballos* — uso: .carrera <cantidad> <número o nombre del caballo>\n\nLa primera apuesta abre la carrera y muestra los cinco caballos con sus cuotas, que cambian en cada carrera. Se puede apostar hasta ${CARRERA.MAX_APUESTAS_POR_PERSONA} veces por persona, a distintos caballos si querés. A los ${CARRERA.SEGUNDOS} segundos largan y se corre para todos; el que acierta cobra su apuesta por la cuota.\nMínimo ${COINS.APUESTA_MIN}, máximo ${COINS.CASINO_APUESTA_MAX} por apuesta, tope ${COINS.CASINO_TOPE_DIA} por día en el casino.\nEj: .carrera 20 3`,
      m,
    );
  }
  const r = apostarCarrera(m.chat, m.sender, cantidad, args.slice(1).join(" "), async ({ cuadros, resultado }) => {
    for (const cuadro of cuadros) {
      await client.sendMessage(m.chat, { text: cuadro });
      await esperar(2500);
    }
    await client.sendMessage(m.chat, { text: resultado.texto, mentions: resultado.mentions });
  });
  if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
  await client.sendMessage(m.chat, { text: r.mensaje, mentions: r.mentions }, { quoted: m });
};

export default plugin;
