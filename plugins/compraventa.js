import { publicar, textoCatalogo, textoBusqueda, textoMias, textoPublicacion, cambiarEstado, gestionarAlerta, detectarPublicacion, anunciarPublicacion } from "../lib/compraventa.js";
import { getUser, getPublicacionPorMensaje } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["vendo", "compro", "catalogo", "catálogo", "buscar", "vendido", "baja", "reservado", "sigue", "mias", "avisame"];
plugin.onlyGroup = true;

// .vendo / .compro: with nothing → that type's catalogue; with text → it posts; quoting a message → it posts what
// that message says (a photo's caption, for instance), under the name of whoever sent it · .catalogo [N] ·
// .buscar <word> · .vendido / .baja / .reservado / .sigue: replying to the post, or with its number · .mias ·
// .avisame <word> (with "quitar" in front it removes it)
plugin.run = async (m, { client, command, args, text, isMod }) => {
  const enviar = (r) => client.sendMessage(m.chat, { text: r.texto ?? r.mensaje, mentions: r.mentions || [] }, { quoted: m });
  const contestar = (r) => (r.ok ? client.sendText(m.chat, r.mensaje, m) : client.sendText(m.chat, `❌ ${r.error}`, m));
  // m.quoted's getter rebuilds the object on every read (lib/wa-socket.js): read it once.
  const citado = m.quoted;

  if (command === "vendo" || command === "compro") {
    // Replying to one of the bot's messages is what anyone does to answer the catalogue: that posts nothing.
    const citaDePersona = citado && !citado.fromMe && !citado.isBaileys;
    if (!text.trim() && citaDePersona) return publicarCitando(m, citado, command, { client, isMod });
    if (!text.trim()) return enviar(textoCatalogo(m.chat, command));

    const r = publicar(m.chat, m.sender, command, text, m.key?.id || null);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    return anunciarPublicacion(client, m, r);
  }

  // .catalogo 12 is the detail of #12; with anything else (or nothing) it's the whole catalogue.
  if (command === "catalogo" || command === "catálogo") {
    return enviar(/^\d+$/.test(args[0] || "") ? textoPublicacion(m.chat, parseInt(args[0], 10)) : textoCatalogo(m.chat, null));
  }
  if (command === "buscar") return enviar(textoBusqueda(m.chat, text));
  if (command === "mias") return enviar(textoMias(m.chat, m.sender));
  if (command === "avisame") return contestar(gestionarAlerta(m.chat, m.sender, args));

  // States: the number comes from the argument or, failing that, from the post being replied to.
  const numero = /^\d+$/.test(args[0] || "") ? parseInt(args[0], 10) : getPublicacionPorMensaje(m.chat, citado?.id)?.numero;
  return contestar(cambiarEstado(m.chat, numero, m.sender, isMod, command));
};

// .vendo / .compro with no text, quoting a message: it posts what the quoted message says, under the name of
// whoever sent it. This is the photo-with-a-caption case, which is how people actually post in a sales group.
async function publicarCitando(m, citado, tipo, { client, isMod }) {
  // m.quoted.sender may arrive as a lid or as a jid, and m.sender is a lid: without normalizing, the photo's owner
  // couldn't post their own. Same pattern as lib/menciones.js.
  const crudo = citado.sender;
  const autor = crudo?.endsWith("@lid") ? crudo : getUser(crudo)?.lid || crudo;
  if (!autor) return client.sendText(m.chat, "❌ No pude ver quién mandó ese mensaje.", m);
  if (autor !== m.sender && !isMod) {
    return client.sendText(m.chat, `❌ Ese mensaje no es tuyo: solo quien lo mandó, o un moderador, puede publicarlo. (Sin responder a nada, .${tipo} te muestra el catálogo.)`, m);
  }

  const ya = getPublicacionPorMensaje(m.chat, citado.id);
  if (ya) return client.sendText(m.chat, `❌ Ese mensaje ya es la publicación *#${ya.numero}*. La ves con .catalogo ${ya.numero}.`, m);

  const bruto = String(citado.text || "").trim();
  if (!bruto) {
    return client.sendText(m.chat, `❌ Ese mensaje no tiene descripción. Poné qué es, precio y zona en el pie de la foto y volvé a intentar, o mandá .${tipo} <qué es, precio, zona>.`, m);
  }

  // If the quoted message already carried #vendo, it's stripped so it isn't repeated in the catalogue.
  const limpio = detectarPublicacion(bruto)?.texto ?? bruto;
  const r = publicar(m.chat, autor, tipo, limpio, citado.id || null);
  if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);

  const deOtro = autor !== m.sender;
  return anunciarPublicacion(client, m, r, deOtro ? { extra: ` Queda a nombre de @${autor.split("@")[0]}.`, mentions: [autor] } : {});
}

export default plugin;
