import { buscarItem, comprar } from "../lib/tienda.js";
import { empresaDe, buscarBien, comprarBien } from "../lib/empresas.js";

const plugin = {};
plugin.cmd = ["comprar", "buy"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, args }) => {
  // .comprar escudo  /  .comprar voto doble  /  .comprar apodo Tito  /  .comprar firma 🦄  /  .comprar mascota carpincho Ramón
  let clave = buscarItem(args[0]);
  let resto = args.slice(1);

  // lets the item be written as two words ("voto doble", "racha doble")
  if (!clave && args.length >= 2) {
    clave = buscarItem(args[0] + args[1]);
    resto = args.slice(2);
  }

  // Not in the shop: what a company owner buys for the company (lib/empresas.js), paid from its cash box.
  if (!clave && args.length) {
    const empresa = empresaDe(m.chat, m.sender);
    if (empresa && buscarBien(empresa.tipo, args.join(" "))) {
      const r = comprarBien(m.chat, m.sender, args.join(" "));
      return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
    }
  }

  if (!clave) {
    return client.sendText(m.chat, "¿Qué querés comprar? Ej: .comprar escudo — mirá la lista con .tienda", m);
  }

  const resultado = comprar(m.chat, m.sender, clave, resto.join(" "));
  await client.sendText(m.chat, resultado.ok ? resultado.mensaje : `❌ ${resultado.error}`, m, resultado.mentions?.length ? { mentions: resultado.mentions } : {});
};

export default plugin;
