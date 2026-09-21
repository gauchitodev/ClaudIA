import { desafiar, aceptar, rechazar, textoDuelos, accionPelea, textoPelea, DUELO, PELEA } from "../lib/duelos.js";
import { COINS } from "../lib/urucoins.js";
import { lidMencionado } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["duelo", "pelea", "acepto", "rechazo", "golpe", "patada", "cubrirse", "curar"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // the .horariojuegos schedule stops only these
plugin.onlyGroup = true;

const ACCIONES = new Set(["golpe", "patada", "cubrirse", "curar"]);

// .duelo @someone 20 [dado|carta|pelea] or .pelea @someone 20 challenges · .acepto / .rechazo is how the challenged
// answers · in a fight, whoever's turn it is uses .golpe, .patada, .cubrirse or .curar · .duelo with nothing lists
// what's pending
plugin.run = async (m, { client, args, text, command, chat }) => {
  const avisar = (msg) => client.sendMessage(m.chat, { text: msg.texto, mentions: msg.mentions || [] });

  let r;
  if (ACCIONES.has(command)) r = accionPelea(m.chat, m.sender, command);
  else if (command === "acepto") r = aceptar(m.chat, m.sender, avisar);
  else if (command === "rechazo") r = rechazar(m.chat, m.sender);
  else {
    if (!args.length) {
      const enCurso = textoPelea(m.chat, m.sender);
      if (enCurso) return client.sendText(m.chat, enCurso, m);
      const pendientes = textoDuelos(m.chat);
      if (pendientes) return client.sendMessage(m.chat, { text: pendientes.texto, mentions: pendientes.mentions }, { quoted: m });
      return client.sendText(
        m.chat,
        `⚔️ *Duelos* — uso: .duelo @alguien <cantidad> [dado|carta|pelea], o .pelea @alguien <cantidad>\n\nCada uno pone lo mismo y el ganador se lleva todo. La otra persona responde con .acepto o .rechazo; a los ${DUELO.MINUTOS} minutos sin respuesta se devuelve lo apostado.\n▸ Dados: gana el número más alto (empate se repite).\n▸ Cartas: gana la más alta; el palo desempata.\n▸ Pelea: por turnos, cada uno con ${PELEA.HP} de vida. En tu turno: .golpe (casi siempre pega, daño medio), .patada (pega más, falla más), .cubrirse (el próximo golpe te hace la mitad y podés contraatacar) o .curar (${PELEA.CURAS} veces). ${PELEA.SEGUNDOS_TURNO} segundos por turno o tirás un golpe solo; a los ${PELEA.MAX_TURNOS} turnos gana el que tenga más vida.\nMínimo ${COINS.APUESTA_MIN}, máximo ${COINS.DUELO_APUESTA_MAX} (o el ${COINS.APUESTA_MAX_PORCENTAJE} % de tu saldo, lo que sea mayor).`,
        m,
      );
    }
    const retado = lidMencionado(m, text); // the old regex swallowed the amount that came after the mention
    const cantidad = parseInt(args.find((a) => /^\d+$/.test(a)), 10);
    const tipo = command === "pelea" ? "pelea" : args.find((a) => /^(dado|dados|carta|cartas|pelea|peleas|piñas|pinas)$/i.test(a)) || "dado";
    r = desafiar(m.chat, m.sender, retado, cantidad, tipo, avisar);
  }
  if (!r.ok) return client.sendMessage(m.chat, { text: `❌ ${r.error}`, mentions: r.mentions || [] }, { quoted: m });
  await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
};

export default plugin;
