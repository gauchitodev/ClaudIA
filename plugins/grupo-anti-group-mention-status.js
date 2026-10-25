import { expulsar, idDelAutor, lidDe } from "../lib/identidad.js";

const plugin = (m) => m;
plugin.before = async (m, { client, participants, isMod, isOwner, isBotAdmin, chat }) => {
  if (!chat.antiStatus) return;
  if (!isBotAdmin) return;
  if (m?.message?.groupStatusMentionMessage?.message?.protocolMessage && !isMod && !isOwner) {
    // The owner as config.toml has them may come with "+" and spaces, which made no id at all: by the digits, and by
    // the LID when the group or the database has it, which is what a mention takes in a group that lists by LID.
    const numero = String(globalThis.owners?.[0] ?? "").replace(/[^0-9]/g, "");
    const owner = numero ? lidDe(`${numero}@s.whatsapp.net`, participants) : null;
    await client.sendText(m.chat, "No mencionar al grupo en tus estados!!", m, { mentions: [m.sender, owner].filter(Boolean) });
    setTimeout(async () => {
      try {
        const { ok, status } = await expulsar(client, m.chat, idDelAutor(m, participants));
        if (!ok) await client.sendText(m.chat, `No pude sacarlo (error ${status}).`, m);
        await m.delete();
      } catch (e) {
        console.error("[anti-mención-estado] no se pudo expulsar/borrar:", e.message);
      }
    }, 3000);
  }

  return;
};
export default plugin;
