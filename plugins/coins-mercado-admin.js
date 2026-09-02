import { crearMercadoDesdeTexto, resolver } from "../lib/mercados.js";

let plugin = {};
plugin.cmd = ["evento", "resolver"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, args, command, chat, isOwner }) => {
  if (!chat.games) return client.sendText(m.chat, txt.disabledGames, m);

  if (command === "evento") {
    const r = crearMercadoDesdeTexto(m.chat, m.sender, text);
    return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
  }

  // .resolver <id> <opción ganadora | anulado>
  const id = parseInt(args[0], 10);
  if (Number.isNaN(id) || !args[1]) return client.sendText(m.chat, "Uso: .resolver <número de mercado> <opción que ganó>, o .resolver <número> anulado para devolver todo.", m);
  const r = resolver(m.chat, m.sender, id, args.slice(1).join(" "), { esOwner: isOwner });
  if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
  await client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
};

export default plugin;
