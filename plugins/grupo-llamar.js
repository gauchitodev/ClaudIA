import { lidsMencionados } from "../lib/menciones.js";

const activeTimers = {};

const plugin = {};
plugin.cmd = ["llamar", "mencionar", "cancelar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
// Admins only, not moderators: ten messages in a row at someone is a burst the bot shouldn't hand out lightly.
// .cancelar goes with it: it only stops a .llamar.
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, command }) => {
  if (command === "cancelar") {
    if (!activeTimers[m.chat]) return client.sendText(m.chat, `No hay menciones en curso.`, m);
    for (const timers of activeTimers[m.chat]) for (const timer of timers) clearTimeout(timer);
    delete activeTimers[m.chat];
    return client.sendText(m.chat, `Menciones canceladas.`, m);
  }

  // The old parsing used a regex with \s that kept swallowing digits: ".llamar @111 5 minutos" ended up calling
  // "1115", who is nobody.
  const who = lidsMencionados(m, text);
  if (!who.length) return client.sendText(m.chat, "Mencione al menos una persona", m);
  const mencion = who.map((w) => `@${w.split("@")[0]}`).join(" ");

  if (!activeTimers[m.chat]) activeTimers[m.chat] = [];
  const timersArray = [];
  for (let i = 0; i < 10; i++) {
    const timer = setTimeout(() => {
      client.sendText(m.chat, mencion, m).catch(console.error);
    }, i * 1000);
    timersArray.push(timer);
  }
  activeTimers[m.chat].push(timersArray);
};

export default plugin;
