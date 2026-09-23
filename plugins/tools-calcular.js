import { evaluar } from "../lib/calculadora.js";

const plugin = {};
plugin.cmd = ["calc", "calcular"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  if (!text) return client.sendText(m.chat, txt.calcNull(usedPrefix, command), m);

  const input = text.replace(/\s+/g, "").replace(/x/gi, "*");
  if (!/^[\d.+\-*/()]+$/.test(input)) return client.sendText(m.chat, txt.calcCaracteresNull, m);
  // A cap on the length: nobody types a 300-character sum, and thousands of nested brackets would only exhaust the stack.
  if (input.length > 300) return client.sendText(m.chat, txt.calcInvalida, m);

  // lib/calculadora.js, not eval(): it understands arithmetic and nothing else. An expression it can't read gets an
  // answer instead of silence (eval's errors used to go to the log and nothing more).
  let result;
  try {
    result = evaluar(input);
  } catch {
    return client.sendText(m.chat, txt.calcInvalida, m);
  }
  await client.sendText(m.chat, txt.calcSuccess(text, result), m);
};

export default plugin;
