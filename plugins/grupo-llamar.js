import { lidsMencionados } from "../lib/menciones.js";

const activeTimers = {};

const plugin = {};
plugin.cmd = ["llamar", "mencionar", "cancelar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, command }) => {
  if (command === "cancelar") {
    if (!activeTimers[m.chat]) return client.sendText(m.chat, `No hay menciones en curso.`, m);
    for (const timers of activeTimers[m.chat]) for (const timer of timers) clearTimeout(timer);
    delete activeTimers[m.chat];
    return client.sendText(m.chat, `Menciones canceladas.`, m);
  }

  // El recorte viejo usaba un regex con \s que seguía tragando dígitos: ".llamar @111 5 minutos" terminaba llamando
  // a "1115", que no es nadie.
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
