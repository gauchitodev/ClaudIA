import { jugar, textoListaMercados, textoMercado } from "../lib/mercados.js";
import { textoPartidos } from "../lib/partidos.js";
import { getMercado } from "../database-functions.js";
import { leerEntero } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["jugar", "mercados", "mercado", "partidos"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // .casino off stops these
plugin.aCualquierHora = true; // and the .horariojuegos schedule doesn't (handle-message.js)
plugin.onlyGroup = true;

plugin.run = async (m, { client, args, command, chat }) => {

  if (command === "mercados") return client.sendText(m.chat, textoListaMercados(m.chat), m);

  // .partidos [competition]: the matches of the next week, with the number an admin opens their markets with.
  if (command === "partidos") return client.sendText(m.chat, textoPartidos(m.chat, args.join(" "), { fila: chat }), m);

  if (command === "mercado") {
    const id = parseInt(args[0], 10);
    const mercado = Number.isNaN(id) ? null : getMercado(id);
    if (!mercado || mercado.chat !== m.chat) return client.sendText(m.chat, "Uso: .mercado <número>. Los abiertos están en .mercados", m);
    return client.sendText(m.chat, textoMercado(mercado), m);
  }

  // .jugar <id> <option> <amount>: the amount comes last, the option may contain spaces
  const id = parseInt(args[0], 10);
  // The amount as people write it here (lib/comandos.js): "1.000" is a thousand, and parseInt read it as 1.
  const cantidad = leerEntero(args[args.length - 1]);
  const opcion = args.slice(1, -1).join(" ");
  if (args.length < 3 || Number.isNaN(id) || cantidad === null || !opcion) {
    return client.sendText(m.chat, "Uso: .jugar <número de mercado> <opción> <cantidad>\nEj: .jugar 7 Nacional 20 (o .jugar 7 3 20 usando el número de la opción)", m);
  }
  const r = jugar(m.chat, m.sender, id, opcion, cantidad);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
