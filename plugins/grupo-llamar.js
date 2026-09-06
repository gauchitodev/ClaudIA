const activeTimers = {};

const plugin = {};
plugin.cmd = ["llamar", "mencionar", "cancelar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, command }) => {
  if (command === "cancelar") {
    if (activeTimers[m.chat]) {
      for (const timers of activeTimers[m.chat]) {
        for (const timer of timers) {
          clearTimeout(timer);
        }
      }
      delete activeTimers[m.chat];
      return client.sendText(m.chat, `Menciones canceladas.`, m);
    } else {
      return client.sendText(m.chat, `No hay menciones en curso.`, m);
    }
  }

  let who;
  let mencion;

  const numberMatches = text.match(/@[0-9\s]+/g);

  if (numberMatches && numberMatches.length > 0) {
    who = numberMatches.map((match) => `${match.replace(/[@\s]/g, "")}@lid`);
    mencion = who.map((w) => `@${w.split("@")[0]}`).join(" ");
  } else if (m.quoted) {
    who = [m.quoted.sender];
    mencion = `@${who[0].split("@")[0]}`;
  } else return client.sendText(m.chat, "Mencione al menos una persona", m);

  if (who) {
    if (!activeTimers[m.chat]) {
      activeTimers[m.chat] = [];
    }
    const timersArray = [];
    for (let i = 0; i < 10; i++) {
      const timer = setTimeout(async () => {
        client.sendText(m.chat, mencion, m).catch(console.error);
      }, i * 1000);
      timersArray.push(timer);
    }
    activeTimers[m.chat].push(timersArray);
  }
};

export default plugin;
