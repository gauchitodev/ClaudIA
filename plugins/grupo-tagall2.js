import { mencionesParaTodos, separarForzado, textoTagall, textoSinNadie } from "../lib/menciones-generales.js";

const plugin = {};
plugin.cmd = ["tagall2", "todos2"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
// Admins only, not moderators: mentioning the whole group ten times in a row is the closest thing to spam the bot does.
plugin.onlyAdmin = true;

plugin.run = async (m, { client, isOwner, text, participants, chat }) => {
  if (!chat.mentions && !isOwner) return client.sendText(m.chat, txt.mentionsDisabled, m);
  // Forcing a notice past the opt-outs is .tagall's, once: not a burst of ten.
  if (separarForzado(text).forzar) return client.sendText(m.chat, "❌ El -f va con .tagall: la ráfaga de .tagall2 no se fuerza.", m);

  // Worked out once, not on each of the ten sends: who opted out with .notagall is read from the database.
  const { ids, fuera } = mencionesParaTodos(m.chat, participants, { client });
  if (!ids.length) return client.sendText(m.chat, textoSinNadie(fuera), m);
  const teks = textoTagall({ texto: text, ids, fuera });

  const repeatCount = 10;
  const interval = 500;

  let i = 0;
  const intervalId = setInterval(() => {
    client.sendMessage(m.chat, { text: teks, mentions: ids }, { quoted: m }).catch(console.error);
    i++;
    if (i >= repeatCount) {
      clearInterval(intervalId);
    }
  }, interval);
};

export default plugin;
