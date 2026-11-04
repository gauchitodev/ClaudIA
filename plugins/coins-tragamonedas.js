import { jugarTragamonedas, textoPagosTragamonedas, textoLimitesCasino } from "../lib/casino.js";
import { leerEntero } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["tragamonedas", "slot", "slots"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // .casino off and the .horariojuegos schedule stop these
plugin.onlyGroup = true;

plugin.run = async (m, { client, args, chat }) => {
  // The amount as people write it here (lib/comandos.js): "1.000" is a thousand, and parseInt read it as 1.
  const cantidad = leerEntero(args[0]);
  if (cantidad === null) {
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
