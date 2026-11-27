import { reaccionFirma, entradaTriunfal } from "../lib/tienda.js";
import { esComando } from "../lib/comandos.js";
import { monedasActivas } from "../lib/urucoins.js";
import { yaReaccionoElBot } from "../lib/envios.js";

// What the shop's status does in the group (lib/tienda.js): the signature reaction on some of one's messages, and the
// grand entrance on the first of the day. Only where the economy is on; it takes nothing from the message.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.isGroup || !m.message || m.fromMe || m.isBaileys || !m.sender) return;
    if ((m.text && esComando(m.text)) || !monedasActivas(m.chat)) return;
    const entrada = entradaTriunfal(m.chat, m.sender);
    // Not awaited: it waits its turn to go out (lib/envios.js), and the hooks after this one shouldn't wait with it.
    if (entrada) client.sendMessage(m.chat, { text: entrada.texto, mentions: entrada.mentions }, { quoted: m }).catch((e) => console.error("[tienda] ERROR:", e));
    // A message the bot already reacted to (the streak's 🔥) keeps that one: WhatsApp keeps one reaction per message.
    const emoji = yaReaccionoElBot(m.key?.id) ? null : reaccionFirma(m.chat, m.sender);
    if (emoji) m.react(emoji).catch(() => {});
  } catch (e) {
    console.error("[tienda] ERROR:", e);
  }
};

export default plugin;
