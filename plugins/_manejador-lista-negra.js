import { estaEnListaNegra } from "../lib/lista-negra.js";
import { expulsar } from "../lib/identidad.js";

// The blacklist's safety net: if someone on it got in anyway, they're removed as soon as they write. Removal on
// joining is handled by main.js through the participants event; this covers whoever was already inside when they
// were listed, and whoever the bot couldn't recognize at that moment.
const plugin = (m) => m;
plugin.before = async (m, { client, participants, isBotAdmin, isRAdmin }) => {
  if (isRAdmin) return;
  if (!isBotAdmin) return;
  if (!m.isGroup) return;
  if (m.messageStubType) return;

  // Both identities are checked: the number they were listed under and the LID they write with. It used to look at
  // the number only, which in newer groups often isn't in the message at all.
  const encontrado = estaEnListaNegra([m.senderJid, m.sender], m.chat, participants);
  if (!encontrado) return;

  // delete the message and remove the user.
  await m.delete();
  const { ok, status } = await expulsar(client, m.chat, encontrado.participante?.id || m.sender);
  if (!ok) {
    console.error("[lista negra] no se pudo expulsar de", m.chat, status);
    return true;
  }
  await client.sendText(m.chat, txt.blackList(m.senderJid || m.sender, encontrado.entrada.reason), null, { mentions: [m.sender] });
  return true;
};

export default plugin;
