import { detectarPublicacion, detectarSuelta, publicar, anunciarPublicacion, respuestaAPedido } from "../lib/compraventa.js";
import { esGrupoDeVentas } from "../lib/modo.js";
import { isCommandBlacklisted } from "../database-functions.js";

// #vendo / #compro (and #busco, #venta, #necesito) in a group message record the post with a number, in any group. In a
// buy-and-sell group (esGrupoDeVentas, lib/modo.js) it reads loose messages too: one that opens with "vendo…" or "se
// vende…" is posted the same way, and a request ("busco…", "¿alguien vende…?") gets reminded of who sells something
// like it.
const plugin = (m) => m;
plugin.before = async (m, { client, chat, user, isOwner, isMod }) => {
  try {
    if (!m.isGroup || !m.text || m.fromMe || m.isBaileys) return;
    // Deleted by the moderation (an anti-link, the blacklist): it used to be published anyway, link included, and
    // .avisame passed it on.
    if (m.moderado) return;
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return;
    // The doors handle-message closes before any command, which this hook runs ahead of (as in _auto-ia.js): a chat
    // banned with .banchat, .modoadmin for whoever isn't a moderator, and a person banned from the bot.
    if (!isOwner && (chat?.isBanned || user?.banned || (chat?.adminMode && !isMod))) return;
    const d = detectarPublicacion(m.text) || (esGrupoDeVentas(chat) ? detectarSuelta(m.text) : null);
    if (!d) return;
    // .blon + .bladd: a blocked .vendo or .compro is blocked as a hashtag or written loose too, as when it's typed (the
    // 🔒). It used to publish anyway. A loose request only gets suggestions: nothing is said there.
    if (chat?.blacklistMode && !isOwner && isCommandBlacklisted(m.chat, d.tipo)) {
      if (!d.soloSugerir && m.react) m.react("🔒").catch(() => {});
      return;
    }
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
