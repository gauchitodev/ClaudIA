import { puedeRecuperarCitado } from "../lib/vista-unica.js";

const plugin = {};
plugin.cmd = ["r", "recovery", "recuperar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, isAdmin, isOwner }) => {
  if (!puedeRecuperarCitado(m, { isAdmin, isOwner })) return client.sendText(m.chat, txt.recoveryOnceRestrict, m);
  const q = m.quoted; // a getter that rebuilds the quote on every read, so it's read once
  if (!q) return client.sendText(m.chat, txt.recoveryOnceNull, m);
  if (q.sender === client.user.lid) return m.react("❌");
  const mime = q.mimetype || q.mediaType || "";
  if (!/image|video|audio/.test(mime)) return client.sendText(m.chat, txt.recoveryOnceNull, m);
  // The copy inside a quote may come without the file's address (downloadM returns an empty buffer) or without its key
  // (Baileys throws "Cannot derive from empty media key"). That used to go out as an empty file with the success
  // caption, or die in handle-message's catch without a word to whoever asked.
  let archivo;
  try {
    archivo = await q.download?.();
  } catch (e) {
    console.error("[recuperar] ❌ .r: no se pudo bajar el archivo citado:", e?.message || e);
  }
  if (!archivo?.length) return client.sendText(m.chat, txt.recoveryOnceFail, m);
  if (/image|video/.test(mime)) return client.sendFile(m.chat, archivo, null, txt.recoveryOnceSuccess, m);
  // A voice note, sent like every other one in the repo: sendFile turns it into ogg/opus and Baileys measures its length.
  return client.sendFile(m.chat, archivo, "vista-unica.opus", null, m, true);
};

export default plugin;
