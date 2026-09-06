import { comprarBoletos, textoEstadoLoteria } from "../lib/loteria.js";

const plugin = {};
plugin.cmd = ["loteria", "lotería", "boleto", "boletos"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // el horario de .horariojuegos frena solo estos
plugin.onlyGroup = true;

// .loteria → estado del pozo · .loteria 2 → compra 2 boletos · .boleto → compra 1
plugin.run = async (m, { client, args, command, chat }) => {
  const esBoleto = command.startsWith("boleto");
  if (!args[0] && !esBoleto) return client.sendText(m.chat, textoEstadoLoteria(m.chat, m.sender), m);

  const cantidad = args[0] ? parseInt(args[0], 10) : 1;
  const r = comprarBoletos(m.chat, m.sender, cantidad);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
