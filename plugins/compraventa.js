import { publicar, textoCatalogo, textoBusqueda, textoMias, textoPublicacion, cambiarEstado, gestionarAlerta, detectarPublicacion, anunciarPublicacion } from "../lib/compraventa.js";
import { getUser, getPublicacionPorMensaje } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["vendo", "compro", "catalogo", "catálogo", "buscar", "vendido", "baja", "reservado", "sigue", "mias", "avisame"];
plugin.onlyGroup = true;

// .vendo / .compro: sin nada → catálogo de ese tipo; con texto → publica; citando un mensaje → publica lo que dice ese
// mensaje (la descripción de una foto, por ejemplo), a nombre de quien lo mandó · .catalogo [N] · .buscar <palabra> ·
// .vendido / .baja / .reservado / .sigue: respondiendo a la publicación, o con su número · .mias ·
// .avisame <palabra> (con "quitar" adelante la saca)
plugin.run = async (m, { client, command, args, text, isMod }) => {
  const enviar = (r) => client.sendMessage(m.chat, { text: r.texto ?? r.mensaje, mentions: r.mentions || [] }, { quoted: m });
  const contestar = (r) => (r.ok ? client.sendText(m.chat, r.mensaje, m) : client.sendText(m.chat, `❌ ${r.error}`, m));
  // El getter de m.quoted rearma el objeto en cada lectura (lib/wa-socket.js): se lee una sola vez.
  const citado = m.quoted;

  if (command === "vendo" || command === "compro") {
    // Responder a un mensaje del bot es lo que hace cualquiera para contestarle al catálogo: eso no publica nada.
    const citaDePersona = citado && !citado.fromMe && !citado.isBaileys;
    if (!text.trim() && citaDePersona) return publicarCitando(m, citado, command, { client, isMod });
    if (!text.trim()) return enviar(textoCatalogo(m.chat, command));

    const r = publicar(m.chat, m.sender, command, text, m.key?.id || null);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    return anunciarPublicacion(client, m, r);
  }

  // .catalogo 12 es el detalle de la #12; con cualquier otra cosa (o nada) es el catálogo entero.
  if (command === "catalogo" || command === "catálogo") {
    return enviar(/^\d+$/.test(args[0] || "") ? textoPublicacion(m.chat, parseInt(args[0], 10)) : textoCatalogo(m.chat, null));
  }
  if (command === "buscar") return enviar(textoBusqueda(m.chat, text));
  if (command === "mias") return enviar(textoMias(m.chat, m.sender));
  if (command === "avisame") return contestar(gestionarAlerta(m.chat, m.sender, args));

  // Estados: el número sale del argumento o, si no hay, de la publicación que se está respondiendo.
  const numero = /^\d+$/.test(args[0] || "") ? parseInt(args[0], 10) : getPublicacionPorMensaje(m.chat, citado?.id)?.numero;
  return contestar(cambiarEstado(m.chat, numero, m.sender, isMod, command));
};

// .vendo / .compro sin texto citando un mensaje: publica lo que dice el citado, a nombre de quien lo mandó. Es el
// caso de la foto con la descripción en el pie, que es como se publica de verdad en un grupo de ventas.
async function publicarCitando(m, citado, tipo, { client, isMod }) {
  // m.quoted.sender puede venir como lid o como jid, y m.sender es lid: sin normalizar, el dueño de la foto no podría
  // publicar la suya propia. Mismo patrón que lib/menciones.js.
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

  // Si el citado ya traía #vendo, se lo saca para no repetirlo en el catálogo.
  const limpio = detectarPublicacion(bruto)?.texto ?? bruto;
  const r = publicar(m.chat, autor, tipo, limpio, citado.id || null);
  if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);

  const deOtro = autor !== m.sender;
  return anunciarPublicacion(client, m, r, deOtro ? { extra: ` Queda a nombre de @${autor.split("@")[0]}.`, mentions: [autor] } : {});
}

export default plugin;
