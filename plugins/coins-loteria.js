import { comprarBoletos, textoEstadoLoteria } from "../lib/loteria.js";
import { leerEntero } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["loteria", "boleto", "boletos"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // .casino off and the .horariojuegos schedule stop these
plugin.onlyGroup = true;

// .loteria → the pot's state · .loteria 2 → buys 2 tickets · .boleto → buys 1
plugin.run = async (m, { client, args, command, chat }) => {
  const esBoleto = command.startsWith("boleto");
  if (!args[0] && !esBoleto) return client.sendText(m.chat, textoEstadoLoteria(m.chat, m.sender), m);

  // How many tickets, written as people write numbers here (lib/comandos.js): "1.000" bought 1.
  const cantidad = args[0] ? leerEntero(args[0]) : 1;
  const r = comprarBoletos(m.chat, m.sender, cantidad);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
