const plugin = {};
plugin.cmd = ["calc", "calcular"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  if (!text) return client.sendText(m.chat, txt.calcNull(usedPrefix, command), m);

  const input = text.replace(/\s+/g, "").replace(/x/gi, "*");
  if (!/^[\d.+\-*/()]+$/.test(input)) return client.sendText(m.chat, txt.calcCaracteresNull, m);

  try {
    const result = eval(input);
    client.sendText(m.chat, txt.calcSuccess(text, result), m);
  } catch (e) {
    console.log(e);
  }
};

export default plugin;
