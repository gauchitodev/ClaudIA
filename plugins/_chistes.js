import { elegirAlAzar } from "../lib/azar.js";

// Two jokes from the template, for "dame admin" and "te eliminó". They used to run among the moderation hooks, ahead of
// the blacklist, and whoever it was about to remove got their answer first; out here, like any hook after the
// moderation, they leave alone what it deleted (handle-message.js).
const plugin = (m) => m;
plugin.before = async (m, { client, isOwner }) => {
  if (!m.isGroup) return;

  if (/^(dame admin|denme admin|quiero admin|haganme admin|quiero ser admin|háganme admin|haceme admin|ponganme de admin|merezco ser admin|me das admin|admin quiero)$/i.test(m.text)) {
    const teks = elegirAlAzar([`No.`, `Jajaja no.`, `Acá no se reparte admin, dejá.`, `Pedir admin no suma puntos, eh.`, `No va a pasar, pero me gusta el entusiasmo.`, `Seguí participando 😌`]);
    client.sendText(m.chat, teks, m, { mentions: [m.sender] });
  }

  // It also used to REMOVE anyone who wrote exactly "te eliminó." (or "te eliminó!").
  if (/^te eliminó[.!]?$/i.test(m.text) && !isOwner) {
    client.sendText(m.chat, `No, pensionista.`, m, { mentions: [m.sender] });
  }
};

export default plugin;
