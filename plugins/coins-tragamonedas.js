import { jugarTragamonedas, textoPagosTragamonedas, textoLimitesCasino } from "../lib/casino.js";

const plugin = {};
plugin.cmd = ["tragamonedas", "slot", "slots"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // the .horariojuegos schedule stops only these
plugin.onlyGroup = true;

plugin.run = async (m, { client, args, chat }) => {
  const cantidad = parseInt(args[0], 10);
  if (!args[0] || Number.isNaN(cantidad)) {
    return client.sendText(
      m.chat,
      `🎰 *Tragamonedas* — uso: .tragamonedas <cantidad>\n\n${textoPagosTragamonedas()}\n\n${textoLimitesCasino("jugada")}\nEj: .tragamonedas 10`,
      m,
    );
  }
  const r = jugarTragamonedas(m.chat, m.sender, cantidad);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
