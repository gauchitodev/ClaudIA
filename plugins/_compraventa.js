import { detectarPublicacion, detectarSuelta, publicar, anunciarPublicacion, respuestaAPedido } from "../lib/compraventa.js";
import { modoActual } from "../lib/modo.js";

// #vendo / #compro (and #busco, #venta, #necesito) in a group message record the post with a number, in any group. In a
// buy-and-sell group (.modo compraventa) it reads loose messages too: one that opens with "vendo…" or "se vende…" is
// posted the same way, and a request ("busco…", "¿alguien vende…?") gets reminded of who sells something like it.
const plugin = (m) => m;
plugin.before = async (m, { client, chat, user, isOwner, isMod }) => {
  try {
    if (!m.isGroup || !m.text || m.fromMe || m.isBaileys) return;
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return;
    // The doors handle-message closes before any command, which this hook runs ahead of (as in _auto-ia.js): a chat
    // banned with .banchat, .modoadmin for whoever isn't a moderator, and a person banned from the bot.
    if (!isOwner && (chat?.isBanned || user?.banned || (chat?.adminMode && !isMod))) return;
    const d = detectarPublicacion(m.text) || (modoActual(chat) === "compraventa" ? detectarSuelta(m.text) : null);
    if (!d) return;
    if (d.soloSugerir) {
      const r = respuestaAPedido(m.chat, m.sender, d.texto);
      if (r) await client.sendText(m.chat, r.texto, m, { mentions: r.mentions });
      return;
    }
    const r = publicar(m.chat, m.sender, d.tipo, d.texto, m.key?.id || null);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    // The same announcement .vendo makes, so a post created by hashtag can be closed by replying to it too.
    await anunciarPublicacion(client, m, r);
  } catch (e) {
    console.error("[compraventa] ERROR:", e);
  }
};

export default plugin;
