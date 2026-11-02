import { antecedentesDe, MAX_ADVERTENCIAS } from "../database-functions.js";
import { destinatarioActual, esElBot, noSeDeQuien } from "../lib/identidad.js";
import { nombreDe } from "../lib/menciones.js";
import { fechaYHora } from "../lib/tiempo.js";

// .antecedentes [@persona]: someone's record in this group (database-functions.js, antecedentesDe), the last 30
// warnings with the day and the time, the reason, who gave each one and how it stands. Anyone sees their own; someone
// else's, the mods and the admins. Named without being tagged, as .listaadv does: a record has no business notifying
// anyone.
const plugin = {};
plugin.cmd = ["antecedentes"];
plugin.onlyGroup = true;

const LIMITE = 30;

// How a warning stands, after its reason and who gave it.
function estado(a) {
  if (a.estado === "vigente") return "⚠️ vigente";
  if (a.estado === "quitada") return `✅ la sacó ${nombreDe(a.quitadaPor)} el ${fechaYHora(a.quitadaEn)}`;
  if (a.estado === "expulso") return `🚪 con esta llegó a ${MAX_ADVERTENCIAS} y quedó afuera del grupo`;
  if (a.estado === "cerrada") return `· cerrada con la expulsión del ${fechaYHora(a.cerradaEn)}`;
  return "· ya no cuenta";
}

plugin.run = async (m, { client, text, participants, isMod, isOwner }) => {
  const { quien, lid, jid, mencionado } = await destinatarioActual(client, m, text, participants);
  // With nobody named, one's own. An "@" that names nobody the bot can tell (a name typed by hand) is a mistake, and
  // one's own record would answer something else.
  if (!mencionado && String(text || "").includes("@")) return client.sendText(m.chat, `📋 ${noSeDeQuien("los antecedentes", ".antecedentes")}`, m);
  // Replying to her own message, usually the warning she sent, names her: the record is the warned person's.
  if (mencionado && esElBot([lid, jid], client)) return client.sendText(m.chat, "📋 Esa soy yo: respondé un mensaje de la persona, o mencionala.", m);
  const propio = !mencionado || [lid, jid, quien].some((id) => id && (id === m.sender || id === m.senderJid));
  if (!propio && !isMod && !isOwner) {
    return client.sendText(m.chat, "📋 Los antecedentes de otra persona los ven los moderadores y los admins. Los tuyos los ves con .antecedentes, sin mencionar a nadie.", m);
  }

  const usuario = propio ? m.sender : quien;
  const r = usuario ? antecedentesDe(usuario, m.chat, { limite: LIMITE }) : { total: 0, deAntes: 0 };
  if (!r.total && !r.deAntes) return client.sendText(m.chat, propio ? "📋 No tenés antecedentes en este grupo." : `📋 ${nombreDe(usuario)} no tiene antecedentes en este grupo.`, m);

  const titulo = propio ? "📋 *Tus antecedentes en este grupo*" : `📋 *Antecedentes de ${nombreDe(usuario)} en este grupo*`;
  const resumen = [`⚠️ Vigentes: ${r.vigentes}/${MAX_ADVERTENCIAS}`, `Anotadas: ${r.total}`, r.expulsiones && `Expulsiones: ${r.expulsiones}`].filter(Boolean).join(" · ");
  const lineas = r.ultimas.map((a) => `• ${fechaYHora(a.fecha)} — «${a.motivo || "sin motivo"}» (de ${nombreDe(a.dadoPor)}) ${estado(a)}`);
  const pie = [
    r.total > r.ultimas.length && `_Te muestro las últimas ${r.ultimas.length} de ${r.total}._`,
    r.deAntes && `_Y ${r.deAntes === 1 ? "1 vigente" : `${r.deAntes} vigentes`} de antes de que las anotara, sin detalle._`,
  ].filter(Boolean);
  const bloques = [`${titulo}\n${resumen}`, lineas.join("\n"), pie.join("\n")].filter(Boolean);
  await client.sendText(m.chat, bloques.join("\n\n"), m);
};

export default plugin;
