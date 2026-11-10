import { detectarPublicacion, detectarSuelta, publicar, anunciarPublicacion, respuestaAPedido, leerRespuesta, cambiosDeRespuesta, aplicarCambios } from "../lib/compraventa.js";
import { esGrupoDeVentas } from "../lib/modo.js";
import { isCommandBlacklisted } from "../database-functions.js";
import { esComando } from "../lib/comandos.js";

// #vendo / #compro (and #busco, #venta, #necesito) in a group message record the post with a number, in any group. In a
// buy-and-sell group (esGrupoDeVentas, lib/modo.js) it reads loose messages too: one that opens with "vendo…" or "se
// vende…" is posted the same way, and a request ("busco…", "¿alguien vende…?") gets reminded of who sells something
// like it. In any group, whoever has posts up answers about them without the prefix: "Sigue 20", "Vendido #17".
const plugin = (m) => m;
plugin.before = async (m, { client, chat, user, isOwner, isMod }) => {
  try {
    if (!m.isGroup || !m.text || m.fromMe || m.isBaileys) return;
    // Deleted by the moderation (an anti-link, the blacklist): it used to be published anyway, link included, and
    // .avisame passed it on.
    if (m.moderado) return;
    // A command is the command's (.vendo), told the dispatcher's way (lib/comandos.js).
    if (esComando(m.text)) return;
    // The doors handle-message closes before any command, which this hook runs ahead of (as in _auto-ia.js): a chat
    // banned with .banchat, .modoadmin for whoever isn't a moderator, and a person banned from the bot.
    if (!isOwner && (chat?.isBanned || user?.banned || (chat?.adminMode && !isMod))) return;
    // An answer about their own posts, as people write it to the "¿sigue en pie?": the command without its dot, or
    // its word alone replying to the post or to the question (m.quoted is rebuilt on every read: read once, and only
    // for a message that reads as an answer).
    const respuesta = leerRespuesta(m.text);
    const cambios = respuesta ? cambiosDeRespuesta(m.chat, m.sender, respuesta, m.quoted?.id || null) : [];
    if (cambios.length) {
      // Taken: it's a reply to the bot more often than not, and Claudia would chat back to it (plugins/_auto-ia.js).
      m.respuestaDeVenta = true;
      // A blocked command is blocked without its dot too.
      if (chat?.blacklistMode && !isOwner && cambios.some(([, accion]) => isCommandBlacklisted(m.chat, accion))) {
        if (m.react) m.react("🔒").catch(() => {});
        return;
      }
      const r = aplicarCambios(m.chat, m.sender, false, cambios);
      return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
    }
    const conHashtag = detectarPublicacion(m.text);
    const d = conHashtag || (esGrupoDeVentas(chat) ? detectarSuelta(m.text) : null);
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
    // An ad sent again, read from a loose message: its post is renewed (lib/compraventa.js) and a reaction says so.
    // Whoever repeats their ad every other day, without ever typing a command, used to get a new post and its
    // confirmation each time. With a hashtag it was asked for: that one gets the answer in words.
    if (r.renovada && !conHashtag) {
      if (m.react) m.react("🔁").catch(() => {});
      return;
    }
    // The same announcement .vendo makes, so a post created by hashtag can be closed by replying to it too.
    await anunciarPublicacion(client, m, r);
  } catch (e) {
    console.error("[compraventa] ERROR:", e);
  }
};

export default plugin;
