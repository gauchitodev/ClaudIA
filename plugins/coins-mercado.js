import { jugar, textoListaMercados, textoMercado } from "../lib/mercados.js";
import { getMercado } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["jugar", "mercados", "mercado"];
plugin.economia = true;
plugin.juego = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, args, command, chat }) => {

  if (command === "mercados") return client.sendText(m.chat, textoListaMercados(m.chat), m);

  if (command === "mercado") {
    const id = parseInt(args[0], 10);
    const mercado = Number.isNaN(id) ? null : getMercado(id);
    if (!mercado || mercado.chat !== m.chat) return client.sendText(m.chat, "Uso: .mercado <número>. Los abiertos están en .mercados", m);
    return client.sendText(m.chat, textoMercado(mercado), m);
  }

  // .jugar <id> <opción> <cantidad>: la cantidad es lo último, la opción puede tener espacios
  const id = parseInt(args[0], 10);
  const cantidad = parseInt(args[args.length - 1], 10);
  const opcion = args.slice(1, -1).join(" ");
  if (args.length < 3 || Number.isNaN(id) || Number.isNaN(cantidad) || !opcion) {
    return client.sendText(m.chat, "Uso: .jugar <número de mercado> <opción> <cantidad>\nEj: .jugar 7 Nacional 20 (o .jugar 7 3 20 usando el número de la opción)", m);
  }
  const r = jugar(m.chat, m.sender, id, opcion, cantidad);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
