import { lidMencionadoActual, esElBot, mismaPersona } from "../lib/identidad.js";
import { fijarRedPersona, borrarRedPersona, textoRedesPersona } from "../lib/redes-persona.js";

// .misredes: your own social links in your profile of this group (lib/redes-persona.js). .misredes instagram @usuario
// (or the link) loads one, .misredes shows yours, .misredes @persona someone else's, named and not tagged, and
// .misredes borrar instagram takes one out (.misredes borrar todo, all of them). Nobody loads someone else's; an admin
// takes one out of someone else's with .misredes borrar instagram @persona.
const plugin = {};
plugin.cmd = ["misredes"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, text, participants, isAdmin, isOwner }) => {
  const mencionado = await lidMencionadoActual(client, m, text, participants);
  const otro = mencionado && !mismaPersona([m.sender, m.senderJid].filter(Boolean), [mencionado]) ? mencionado : null;
  // The words, the mention's digits aside: a username ("@xuru") has none, so it stays.
  const palabras = String(text || "").replace(/@\d{3,}/g, " ").trim().split(/\s+/).filter(Boolean);
  const borrar = Boolean(palabras[0]) && /^(borrar|quitar|sacar)$/i.test(palabras[0]);

  if (otro) {
    if (esElBot([otro], client)) return client.sendText(m.chat, "❌ Esa soy yo: mis redes son las del grupo, .redes.", m);
    if (borrar) {
      if (!isAdmin && !isOwner) return client.sendText(m.chat, "🔗 Las redes de otra persona se las saca un admin. Las tuyas, con .misredes borrar <red>.", m);
      const r = borrarRedPersona(otro, m.chat, palabras[1]);
      return client.sendText(m.chat, r.ok ? r.mensajeAjeno : `❌ ${r.error}`, m);
    }
    if (palabras.length) return client.sendText(m.chat, "🔗 Las redes de otra persona no se le cargan: cada uno carga las suyas con .misredes. Un admin se las puede sacar con .misredes borrar <red> @persona.", m);
    return client.sendText(m.chat, textoRedesPersona(otro, m.chat), m);
  }
  if (!palabras.length) return client.sendText(m.chat, textoRedesPersona(m.sender, m.chat, { esPropio: true }), m);
  const r = borrar ? borrarRedPersona(m.sender, m.chat, palabras[1]) : fijarRedPersona(m.sender, m.chat, palabras[0], palabras.slice(1).join(" "));
  return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
