import { fijarHorario, quitarHorario, horarioDe, textoHorario, juegosAbiertos } from "../lib/horario-juegos.js";
import { limpiarPalabra } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["horariojuegos", "juegoshorario"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

// .horariojuegos 20:00-23:00 sets the window · .horariojuegos off clears it ·
// .horariojuegos with nothing shows the current one
plugin.run = async (m, { client, text, chat }) => {
  const pedido = (text || "").trim().toLowerCase();
  const avisoApagados = chat.games ? "" : "\n\nOjo: los juegos están apagados con .juegos; el horario aplica cuando los prendas.";

  if (!pedido) {
    const h = horarioDe(chat);
    if (!h) return client.sendText(m.chat, `🕒 Este grupo no tiene horario de juegos: el casino, el ta-te-ti y el 4 en línea andan a cualquier hora (mientras estén activados con .juegos).\n\nPara ponerle uno: .horariojuegos 20:00-23:00${avisoApagados}`, m);
    const estado = juegosAbiertos(chat) ? "ahora están abiertos" : "ahora están cerrados";
    return client.sendText(m.chat, `🕒 En este grupo, el casino, el ta-te-ti y el 4 en línea van ${textoHorario(h)}; ${estado}. Los mercados de apuestas andan a cualquier hora.\n\n.horariojuegos off lo saca, .horariojuegos 21:00-00:00 lo cambia.${avisoApagados}`, m);
  }

  // the word, read as the command's name is (lib/comandos.js): ".horariojuegos off." was taken for a schedule
  if (/^(off|no|quitar|sacar|borrar|siempre)$/.test(limpiarPalabra(pedido))) return client.sendText(m.chat, quitarHorario(m.chat).mensaje, m);

  const r = fijarHorario(m.chat, pedido);
  return client.sendText(m.chat, r.ok ? r.mensaje + avisoApagados : `❌ ${r.error}`, m);
};

export default plugin;
