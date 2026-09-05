import { buscarItem, comprar } from "../lib/tienda.js";

let plugin = {};
plugin.cmd = ["comprar", "buy"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, args }) => {
  // .comprar escudo  /  .comprar voto doble  /  .comprar apodo Tito
  let clave = buscarItem(args[0]);
  let resto = args.slice(1);

  // permite escribir el ítem en dos palabras ("voto doble", "racha doble")
  if (!clave && args.length >= 2) {
    clave = buscarItem(args[0] + args[1]);
    resto = args.slice(2);
  }

  if (!clave) {
    return client.sendText(m.chat, "¿Qué querés comprar? Ej: .comprar escudo — mirá la lista con .tienda", m);
  }

  const resultado = comprar(m.chat, m.sender, clave, resto.join(" "));
  await client.sendText(m.chat, resultado.ok ? resultado.mensaje : `❌ ${resultado.error}`, m);
};

export default plugin;
