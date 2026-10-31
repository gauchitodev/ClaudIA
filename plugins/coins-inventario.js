import { getUser } from "../database-functions.js";
import { textoInventario } from "../lib/tienda.js";
import { deQuienEsActual, noSeDeQuien } from "../lib/identidad.js";
import { nombreDe } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["inventario", "mochila", "inv"];
plugin.economia = true;
plugin.onlyGroup = true;

// Your items, nickname and job, or with .inventario @persona (or replying to one of their messages) someone else's,
// named without tagging them, as .bal does.
plugin.run = async (m, { client, text, participants, user }) => {
  const lid = await deQuienEsActual(client, m, text, participants);
  if (!lid) return client.sendText(m.chat, `🎒 ${noSeDeQuien("el inventario", ".inventario")}`, m);

  const propio = lid === m.sender;
  const contenido = textoInventario(m.chat, lid, propio ? user : getUser(lid));
  if (propio) return client.sendText(m.chat, contenido ? `🎒 *Tu inventario*\n\n${contenido}` : "🎒 Tu inventario está vacío. Mirá qué hay en .tienda", m);
  const nombre = nombreDe(lid);
  await client.sendText(m.chat, contenido ? `🎒 *Inventario de ${nombre}*\n\n${contenido}` : `🎒 ${nombre} no tiene nada en el inventario.`, m);
};

export default plugin;
