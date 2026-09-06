import { fijarHorario, quitarHorario, horarioDe, textoHorario, juegosAbiertos } from "../lib/horario-juegos.js";

const plugin = {};
plugin.cmd = ["horariojuegos", "juegoshorario"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

// .horariojuegos 20:00-23:00 fija la franja · .horariojuegos off la saca · .horariojuegos sin nada muestra la actual
plugin.run = async (m, { client, text, chat }) => {
  const pedido = (text || "").trim().toLowerCase();
  const avisoApagados = chat.games ? "" : "\n\nOjo: los juegos están apagados con .juegos; el horario aplica cuando los prendas.";

  if (!pedido) {
    const h = horarioDe(chat);
    if (!h) return client.sendText(m.chat, `🕒 Este grupo no tiene horario de juegos: andan a cualquier hora (mientras estén activados con .juegos).\n\nPara ponerle uno: .horariojuegos 20:00-23:00${avisoApagados}`, m);
    const estado = juegosAbiertos(chat) ? "ahora están abiertos" : "ahora están cerrados";
    return client.sendText(m.chat, `🕒 Los juegos en este grupo van ${textoHorario(h)}; ${estado}.\n\n.horariojuegos off lo saca, .horariojuegos 21:00-00:00 lo cambia.${avisoApagados}`, m);
  }

  if (/^(off|no|quitar|sacar|borrar|siempre)$/.test(pedido)) return client.sendText(m.chat, quitarHorario(m.chat).mensaje, m);

  const r = fijarHorario(m.chat, pedido);
  return client.sendText(m.chat, r.ok ? r.mensaje + avisoApagados : `❌ ${r.error}`, m);
};

export default plugin;
