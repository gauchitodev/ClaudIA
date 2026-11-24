// A warning for someone in a group: one more on their count, into their record (.antecedentes), and out on the third
// (MAX_ADVERTENCIAS). It's what .advertir gives by hand (plugins/grupo-advertir.js) and what the anti-flood gives on its
// own (plugins/_antiflood.js): the order of the count, the record and the removal lives here, once.
import { advertenciasDe, setAdvertencias, MAX_ADVERTENCIAS, anotarAdvertencia, marcarExpulsion } from "../database-functions.js";
import { expulsar, lidDe } from "./identidad.js";
import { generoDe, concordar } from "./genero.js";
import txt from "./strings.js";

// "chat person" a third warning is removing right now. The count only changes once WhatsApp has answered, two sends
// later: a second third warning in the meantime (the anti-flood under a burst of stickers, or a mod typing .adv during
// it) read the same count, and announced the removal and removed them all over again.
const saliendo = new Set();

// quien: the id their row is read by. expulsarA: the id the group lists them under, the one WhatsApp takes for removing.
// citado: the message the texts answer to (the command's), or none.
// Returns { advertencias, expulsion }: the count it got to, and null or what WhatsApp answered to the removal ({ ok,
// status }). Or { advertencias, saliendo: true } when that removal was already under way, and nothing was done.
export async function darAdvertencia(client, chat, quien, { motivo, dadoPor, expulsarA, citado = null }) {
  const advertencias = advertenciasDe(quien, chat) + 1;
  // Into their record (.antecedentes), with the reason, who gave it and when: the count alone forgot all three. Noted
  // where the count changes, so neither goes without the other if a send or the removal fails before it.
  const anotar = () => anotarAdvertencia(quien, chat, { motivo, dadoPor });

  if (advertencias < MAX_ADVERTENCIAS) {
    anotar();
    setAdvertencias(quien, chat, advertencias);
    // With the mention: of someone the bot knows by their number alone, the "@" in the text tagged nobody (sendText).
    await client.sendText(chat, txt.advertirSuccess(quien, motivo, advertencias, MAX_ADVERTENCIAS), citado, { mentions: [quien] });
    return { advertencias, expulsion: null };
  }

  const clave = `${chat} ${lidDe(quien)}`;
  if (saliendo.has(clave)) return { advertencias, saliendo: true };
  saliendo.add(clave);
  try {
    await client.sendText(chat, concordar(txt.advertirKick(quien), generoDe(quien)), citado, { mentions: [quien] });
    // Removal uses the id the group lists the person under, and the count is cleared only if WhatsApp accepted.
    const expulsion = await expulsar(client, chat, expulsarA);
    const anotada = anotar();
    if (expulsion.ok) {
      marcarExpulsion(anotada);
      setAdvertencias(quien, chat, 0);
    } else {
      setAdvertencias(quien, chat, advertencias);
      await client.sendText(chat, `No me dejaron echarlo (error ${expulsion.status}). Le quedan anotadas las ${advertencias} advertencias.`, citado);
    }
    return { advertencias, expulsion };
  } finally {
    saliendo.delete(clave);
  }
}
