import { detectarPublicacion, detectarSuelta, publicar, anunciarPublicacion, respuestaAPedido, leerRespuesta, cambiosDeRespuesta, aplicarCambios, explicacionPara, primeraConfirmacion, textoPrimeraPublicacion, editarPublicacion, esPrecioDicho, precioDicho, cambiarPrecio } from "../lib/compraventa.js";
import { esGrupoDeVentas } from "../lib/modo.js";
import { edicionDe } from "../lib/ediciones.js";
import { loHabriaBorrado } from "../lib/memoria-corta.js";
import { isCommandBlacklisted, getPublicacionPorMensaje } from "../database-functions.js";
import { esComando } from "../lib/comandos.js";

// #vendo / #compro (and #busco, #venta, #necesito) in a group message record the post with a number, in any group. In a
// buy-and-sell group (esGrupoDeVentas, lib/modo.js) it reads loose messages too: one that opens with "vendo…" or "se
// vende…" is posted the same way, and a request ("busco…", "¿alguien vende…?") gets reminded of who sells something
// like it. In any group, whoever has posts up answers about them without the prefix: "Sigue 20", "Vendido #17", and
// gives one a new price: "precio 12 $ 3.500".
// An ad for sale gets in with what it is and its price (publicar, lib/compraventa.js). Written loose, it's answered
// with a mark and not a message: 🏷️ when it got in, ❔ when it lacks something; how to post is explained once to each
// person, and so is their first post. And a message edited counts as written again: an ad completed that way gets in.
const plugin = (m) => m;
plugin.before = async (m, { client, chat, user, isOwner, isMod }) => {
  try {
    if (!m.isGroup || m.fromMe || m.isBaileys) return;
    const edicion = edicionDe(m);
    const texto = edicion ? edicion.texto : m.text;
    if (!texto) return;
    // Deleted by the moderation (an anti-link, the blacklist): it used to be published anyway, link included, and
    // .avisame passed it on. The moderation doesn't read an edit: one that it would have deleted as a message (a link
    // of any kind, someone muted or on the blacklist) is left alone here, or editing would be the way around it.
    if (m.moderado) return;
    if (edicion && loHabriaBorrado({ chat: m.chat, sender: m.sender, senderJid: m.senderJid, key: m.key, text: texto })) return;
    // A command is the command's (.vendo), told the dispatcher's way (lib/comandos.js).
    if (esComando(texto)) return;
    // The doors handle-message closes before any command, which this hook runs ahead of (as in _auto-ia.js): a chat
    // banned with .banchat, .modoadmin for whoever isn't a moderator, and a person banned from the bot.
    if (!isOwner && (chat?.isBanned || user?.banned || (chat?.adminMode && !isMod))) return;
    // An answer about their own posts, as people write it to the "¿sigue en pie?": the command without its dot, or
    // its word alone replying to the post or to the question (m.quoted is rebuilt on every read: read once, and only
    // for a message that reads as an answer). An edit isn't one: it says what the message says now, not something new.
    const respuesta = edicion ? null : leerRespuesta(texto);
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
    // The price of one of their posts, said the same way: "precio 12 $ 3.500", or "precio $ 3.500" replying to it.
    if (!edicion && esPrecioDicho(texto)) {
      const citado = m.quoted?.id || null;
      const dicho = precioDicho(m.chat, m.sender, texto, citado);
      if (dicho) {
        m.respuestaDeVenta = true;
        if (chat?.blacklistMode && !isOwner && isCommandBlacklisted(m.chat, "precio")) {
          if (m.react) m.react("🔒").catch(() => {});
          return;
        }
        const r = cambiarPrecio(m.chat, m.sender, false, dicho, citado);
        return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
      }
    }
    const conHashtag = detectarPublicacion(texto);
    const d = conHashtag || (esGrupoDeVentas(chat) ? detectarSuelta(texto) : null);
    if (!d) return;
    // What the bot answers goes to the message itself. An edit is a note about a message: its marks and its quotes go
    // to the one it rewrites, by its key (the chat, the id and whoever wrote it) and with what it says now.
    const original = edicion ? { chat: m.chat, key: { remoteJid: m.chat, fromMe: false, id: edicion.id, participant: m.key?.participant || m.sender }, message: edicion.contenido } : m;
    const marcar = (emoji) => {
      const marca = edicion ? client.sendMessage(m.chat, { react: { text: emoji, key: original.key } }) : m.react?.(emoji);
      marca?.catch?.(() => {});
    };
    // .blon + .bladd: a blocked .vendo or .compro is blocked as a hashtag or written loose too, as when it's typed (the
    // 🔒). It used to publish anyway. A loose request only gets suggestions, and what only may be an ad is no post:
    // nothing is said there.
    if (chat?.blacklistMode && !isOwner && isCommandBlacklisted(m.chat, d.tipo)) {
      if (!d.soloSugerir && !d.quizas) marcar("🔒");
      return;
    }
    if (d.soloSugerir) {
      if (edicion) return;
      const r = respuestaAPedido(m.chat, m.sender, d.texto);
      if (r) await client.sendText(m.chat, r.texto, m, { mentions: r.mentions });
      return;
    }
    // The message is already a post: its author's edit rewrites it (lib/compraventa.js), and anybody else's, or one
    // that leaves it short of something, touches nothing. Never a second post from the same message.
    if (edicion && getPublicacionPorMensaje(m.chat, edicion.id)) {
      if (editarPublicacion(m.chat, m.sender, edicion.id, d.tipo, d.texto)) marcar("🏷️");
      return;
    }
    // A thing and its price, without saying it's for sale: how to post, once, unless it answers somebody (a price
    // given to whoever asked) or it's an edit (whoever is rewriting their message has just been told).
    if (d.quizas) {
      if (edicion || m.quoted) return;
      const explicacion = explicacionPara(m.chat, m.sender, [], { quizas: true });
      if (explicacion) await client.sendText(m.chat, explicacion, m);
      return;
    }
    const r = publicar(m.chat, m.sender, d.tipo, d.texto, original.key?.id || null);
    if (!r.ok) {
      // Asked for with the hashtag, it's answered in words every time, like the command. Written loose, an ad that
      // lacks something gets how to post once, and after that the mark.
      if (edicion) return;
      if (conHashtag || !r.falta?.length) return client.sendText(m.chat, `❌ ${r.error}`, m);
      const explicacion = explicacionPara(m.chat, m.sender, r.falta);
      if (explicacion) return client.sendText(m.chat, explicacion, m);
      return marcar("❔");
    }
    // The same announcement .vendo makes, so a post created by hashtag can be closed by replying to it too.
    if (conHashtag) return anunciarPublicacion(client, original, r);
    // An ad sent again, read from a loose message: its post is renewed (lib/compraventa.js) and a mark says so.
    // Whoever repeats their ad every other day, without ever typing a command, used to get a new post and its
    // confirmation each time.
    if (r.renovada) return marcar("🔁");
    // A new one: the mark, and in words only their first, or whoever was looking for something like it.
    marcar("🏷️");
    await anunciarPublicacion(client, original, r, primeraConfirmacion(m.chat, m.sender) ? { mensaje: textoPrimeraPublicacion(r) } : { callada: true });
  } catch (e) {
    console.error("[compraventa] ERROR:", e);
  }
};

export default plugin;
