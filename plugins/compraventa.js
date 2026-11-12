import { publicar, textoCatalogo, textoBusqueda, textoMias, textoPublicacion, cambiarPorComando, cambiarPrecio, corregirPublicacion, gestionarAlerta, detectarPublicacion, anunciarPublicacion } from "../lib/compraventa.js";
import { getPublicacionPorMensaje } from "../database-functions.js";
import { mismaPersona, lidDe } from "../lib/identidad.js";
import { modoDeNombre, nombrandoPor } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["vendo", "vender", "compro", "catalogo", "buscar", "vendido", "baja", "reservado", "sigue", "precio", "editar", "corregir", "mias", "avisame"];
plugin.onlyGroup = true;

// .vendo / .compro: with nothing → that type's catalogue; with text → it posts; quoting a message → it posts what
// that message says (a photo's caption, for instance), under the name of whoever sent it · .catalogo [N] [numero] ·
// .buscar <word> · .vendido / .baja / .reservado / .sigue: replying to the post, or with its number, several numbers
// or "todas" · .precio and .editar (or .corregir): the post's number and its new price or text, or replying to the post
// with only that · .mias · .avisame <word> (with "quitar" in front it removes it)
plugin.run = async (m, { client, command, args, text, isMod, participants }) => {
  const enviar = (r) => client.sendMessage(m.chat, { text: r.texto ?? r.mensaje, mentions: r.mentions || [] }, { quoted: m });
  // With whoever it names: a moderator's correction tells the post's author.
  const contestar = (r) => (r.ok ? client.sendText(m.chat, r.mensaje, m, r.mentions?.length ? { mentions: r.mentions } : undefined) : client.sendText(m.chat, `❌ ${r.error}`, m));
  // m.quoted's getter rebuilds the object on every read (lib/wa-socket.js): read it once.
  const citado = m.quoted;

  // .vender is how people say it out loud ("respondé la foto con .vender"): same thing as .vendo.
  const tipo = command === "vender" ? "vendo" : command;
  if (tipo === "vendo" || tipo === "compro") {
    // Replying to one of the bot's messages is what anyone does to answer the catalogue: that posts nothing.
    const citaDePersona = citado && !citado.fromMe && !citado.isBaileys;
    if (!text.trim() && citaDePersona) return publicarCitando(m, citado, tipo, { client, isMod });
    if (!text.trim()) return enviar(textoCatalogo(m.chat, tipo));

    const r = publicar(m.chat, m.sender, tipo, text, m.key?.id || null);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    return anunciarPublicacion(client, m, r);
  }

  // .catalogo 12 is the detail of #12; with anything else (or nothing) it's the whole catalogue. "numero", before or
  // after (lib/menciones.js), puts on each one the number the group lists its author with, to write to them without
  // tagging them, and on the detail too, which otherwise tags them. The group's and no other, even when its list
  // didn't come.
  if (command === "catalogo") {
    const { modo, texto } = modoDeNombre(text);
    const [primero = ""] = texto.trim().split(/\s+/);
    const porNumero = modo === "numeros";
    const armar = () => (/^\d+$/.test(primero) ? textoPublicacion(m.chat, parseInt(primero, 10), { usuario: m.sender, esMod: isMod, porNumero }) : textoCatalogo(m.chat, null, { porNumero }));
    return enviar(nombrandoPor(modo, armar, { grupo: participants || [] }));
  }
  if (command === "buscar") return enviar(textoBusqueda(m.chat, text));
  if (command === "mias") return enviar(textoMias(m.chat, m.sender));
  if (command === "avisame") return contestar(gestionarAlerta(m.chat, m.sender, args));
  // Corrections: whoever posted it, or a moderator (lib/compraventa.js).
  if (command === "precio") return contestar(cambiarPrecio(m.chat, m.sender, isMod, text, citado?.id || null));
  if (command === "editar" || command === "corregir") return contestar(corregirPublicacion(m.chat, m.sender, isMod, text, citado?.id || null));

  // States: what they're about comes after the command (a number, several, "todas") or, failing that, is the post
  // being replied to (lib/compraventa.js).
  // A moderator's .baja may name a person instead of a post: with a mention, or replying to a message of theirs
  // (not to one of the bot's, which is what "todas" answers).
  const dePersona = { mencionados: m.mentionedJid || [], autorCitado: citado && !citado.fromMe && !citado.isBaileys ? citado.sender || null : null };
  return contestar(cambiarPorComando(m.chat, m.sender, isMod, command, text, citado?.id || null, Date.now(), dePersona));
};

// .vendo / .compro with no text, quoting a message: it posts what the quoted message says, under the name of
// whoever sent it. This is the photo-with-a-caption case, which is how people actually post in a sales group.
async function publicarCitando(m, citado, tipo, { client, isMod }) {
  // m.quoted.sender may arrive as a lid or as a jid, and so may m.sender: the post goes under the LID when it's known
  // (lidDe), and whose it is goes by either identity (mismaPersona). Normalizing only the quoted one, the photo's
  // owner still heard it wasn't theirs when their reply came with only the number.
  const crudo = citado.sender;
  const autor = lidDe(crudo);
  if (!autor) return client.sendText(m.chat, "❌ No pude ver quién mandó ese mensaje.", m);
  const propio = mismaPersona(crudo, [m.sender, m.senderJid]);
  if (!propio && !isMod) {
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

  return anunciarPublicacion(client, m, r, propio ? {} : { extra: ` Queda a nombre de @${autor.split("@")[0]}.`, mentions: [autor] });
}

export default plugin;
