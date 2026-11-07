import { lidsMencionadosActual } from "../lib/identidad.js";
import { estadoDe } from "../lib/estado-de-plugins.js";

// chat -> the calls on their way, kept where a reload of this file doesn't lose them: .cancelar has to find them
// (lib/estado-de-plugins.js)
const activeTimers = estadoDe("grupo-llamar", () => ({}));
const VECES = 10; // calls in a series, one a second

const plugin = {};
plugin.cmd = ["llamar", "mencionar", "cancelar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
// Admins only, not moderators: ten messages in a row at someone is a burst the bot shouldn't hand out lightly.
// .cancelar goes with it: it only stops a .llamar.
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, command, participants, aLlamar }) => {
  if (command === "cancelar") {
    if (!activeTimers[m.chat]) return client.sendText(m.chat, `No hay menciones en curso.`, m);
    for (const timers of activeTimers[m.chat]) for (const timer of timers) clearTimeout(timer);
    delete activeTimers[m.chat];
    return client.sendText(m.chat, `Menciones canceladas.`, m);
  }

  // The old parsing used a regex with \s that kept swallowing digits: ".llamar @111 5 minutos" ended up calling
  // "1115", who is nobody. By the LID WhatsApp gives, which is what tags them (paraArrobar). Claudia hands over whoever
  // she already worked out (aLlamar, _auto-ia.js): asked again, a number WhatsApp gave no LID for was asked about
  // twice, and with WhatsApp not answering she took twice CONSULTA_MS to call.
  const who = aLlamar || (await lidsMencionadosActual(client, m, text, participants, { paraArrobar: true }));
  if (!who.length) return client.sendText(m.chat, "Mencione al menos una persona", m);
  const mencion = who.map((w) => `@${w.split("@")[0]}`).join(" ");

  if (!activeTimers[m.chat]) activeTimers[m.chat] = [];
  const timersArray = [];
  for (let i = 0; i < VECES; i++) {
    const timer = setTimeout(() => {
      client.sendText(m.chat, mencion, m).catch(console.error);
      if (i === VECES - 1) terminarSerie(m.chat, timersArray);
    }, i * 1000);
    timersArray.push(timer);
  }
  activeTimers[m.chat].push(timersArray);
};

// A series is over with its last call: it leaves the chat's calls, and with none left the chat has none going on. The
// series used to stay there when they ended on their own, and a .cancelar afterwards said it had stopped them.
function terminarSerie(chat, serie) {
  const quedan = (activeTimers[chat] || []).filter((s) => s !== serie);
  if (quedan.length) activeTimers[chat] = quedan;
  else delete activeTimers[chat];
}

export default plugin;
