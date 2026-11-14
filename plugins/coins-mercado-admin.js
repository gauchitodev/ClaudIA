import { crearMercadoDesdeTexto, resolver } from "../lib/mercados.js";
import { abrirDesdeLista } from "../lib/partidos.js";
import { limpiarPalabra } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["evento", "resolver"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // .casino off stops these
plugin.aCualquierHora = true; // and the .horariojuegos schedule doesn't, unless .horariojuegos mercados on (handle-message.js)
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, args, command, chat, isOwner }) => {

  if (command === "evento") {
    // .evento partido 12 [pasa]: the market of a match from .partidos, which the bot resolves on its own.
    const r = limpiarPalabra(args[0]) === "partido" ? abrirDesdeLista(m.chat, m.sender, Number(args[1]), args.slice(2).join(" ")) : crearMercadoDesdeTexto(m.chat, m.sender, text);
    return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
  }

  // .resolver <id> <winning option | anulado>
  const id = parseInt(args[0], 10);
  if (Number.isNaN(id) || !args[1]) return client.sendText(m.chat, "Uso: .resolver <número de mercado> <opción que ganó>, o .resolver <número> anulado para devolver todo.", m);
  const r = resolver(m.chat, m.sender, id, args.slice(1).join(" "), { esOwner: isOwner });
  if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
  await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
};

export default plugin;
