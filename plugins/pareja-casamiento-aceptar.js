import { pausa } from "../lib/pausas.js";
import { responderCasamiento, parejaDe } from "../lib/parejas.js";
import { generoDeVarios, concordarPlural } from "../lib/genero.js";
import { responderAdopcion, textoRespuestaAdopcion, porAdoptar } from "../lib/familia.js";
import { comoLoEsperan } from "../lib/identidad.js";
import txt from "../lib/strings.js";

// .si: accepts your partner's marriage proposal, or the adoption you were offered.
const plugin = {};
plugin.cmd = ["si"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, participants }) => {
  // Asked by their LID, whoever writes from their number alone answers from it (lib/identidad.js), and the child is
  // that LID, as everything done to them when they're named.
  const hijo = await comoLoEsperan(client, m, participants, porAdoptar(m.sender));
  const adopcion = textoRespuestaAdopcion(m.sender, responderAdopcion(hijo, true));
  if (adopcion) return client.sendMessage(m.chat, adopcion, { quoted: m });
  const r = responderCasamiento(m.sender, true);
  if (!r.ok) {
    if (r.motivo === "sinPareja") return client.sendText(m.chat, txt.parejaCasamientoNull, m);
    // "casadas" when both are women (.genero, lib/genero.js); otherwise as always.
    if (r.motivo === "yaCasados") return client.sendText(m.chat, concordarPlural(txt.parejaCasamientoAlready, generoDeVarios([m.sender, parejaDe(m.sender)?.pareja])), m);
    return; // no pending proposal: ".si" is a common word, better to say nothing
  }
  const kz = await client.sendText(m.chat, concordarPlural(txt.parejaCasamientoSuccess(m.sender, r.pareja), generoDeVarios([m.sender, r.pareja])), m);
  await pausa(700);
  for (const emoji of ["💗", "❤️‍🔥", "🩵", "💚", "💛", "🩷", "❤️"]) {
    await client.sendMessage(m.chat, { react: { text: emoji, key: kz.key } });
    await pausa(700);
  }
};

export default plugin;
