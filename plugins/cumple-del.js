import { borrarCumpleDe } from "../lib/cumpleanos.js";
import { destinatarioActual, esElBot } from "../lib/identidad.js";

// .delcumple @persona, replying to one of their messages, or with their number (.delcumple +598 99 123 456, the "+"
// optional): an admin deletes someone's birthday in this group (lib/cumpleanos.js). The number is for whoever left the
// group, whom WhatsApp no longer offers when typing @: .cumples lists them apart, and they're not greeted anymore. It's
// whoever has the number now, as WhatsApp says (destinatarioActual), and the birthday goes under whichever of their ids
// it was noted. .setcumple @persona borrar does it too.
const plugin = {};
plugin.cmd = ["delcumple"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, participants }) => {
  const t = String(text || "").trim();
  // A number on its own, spaced or not, goes as the "+598…" destinatario reads. Fewer than 7 digits make no number.
  const digitos = /^\+?[\d\s.-]+$/.test(t) ? t.replace(/\D/g, "") : "";
  const numero = digitos.length >= 7 ? digitos : null;
  // A leading 0 is the number as it's dialed at home, without the country's code: it's nobody's.
  if (numero?.startsWith("0")) return client.sendText(m.chat, "❌ Poné el número con el código del país: .delcumple +598 99 123 456", m);
  // The number typed wins over the message it answers, as in numeroActual: answering a message of Claudia's, that
  // message named her.
  const mensaje = numero && m.quoted ? Object.create(m, { quoted: { value: null } }) : m;
  const d = await destinatarioActual(client, mensaje, numero ? `+${numero}` : t, participants);
  if (!d.mencionado) return client.sendText(m.chat, "❌ ¿De quién? Mencioná a la persona, respondé un mensaje suyo o poné su número (así se borra el de quien ya no está en el grupo): .delcumple @persona o .delcumple +598 99 123 456", m);
  if (esElBot([d.lid, d.jid], client)) return client.sendText(m.chat, "❌ Esa soy yo: mencioná a la persona, respondé un mensaje suyo o poné su número.", m);
  // The number their row has may be someone else's by now, unless the message names it or the group lists it with
  // them (jidDeLaFila): no birthday is looked for under it.
  const r = borrarCumpleDe(m.chat, [d.quien, d.lid, d.jidDeLaFila ? null : d.jid]);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m, r.mentions ? { mentions: r.mentions } : undefined);
};

export default plugin;
