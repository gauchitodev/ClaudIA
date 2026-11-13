import { evaluar, normalizar, mostrar } from "../lib/calculadora.js";
import txt from "../lib/strings.js";

const plugin = {};
plugin.cmd = ["calc", "calcular"];
plugin.botAdmin = true;

// What the evaluator can't give a result for, said the way a person would (ErrorDeCuenta, lib/calculadora.js). It
// used to answer Infinity, NaN or 1e+21.
const SIN_RESULTADO = { cero: txt.calcCero, grande: txt.calcGrande, negativa: txt.calcNegativa };

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  if (!text) return client.sendText(m.chat, txt.calcNull(usedPrefix, command), m);

  // Numbers, the signs (× ÷ x and − already as * / and -), brackets and "de", and nothing else: the answer says what
  // goes, and that the decimals go with a dot, for whoever writes them with a comma.
  const input = normalizar(text);
  if (!/^(?:[\d.+\-*/()^%]|de)+$/.test(input)) return client.sendText(m.chat, txt.calcCaracteresNull, m);
  // A cap on the length: nobody types a 300-character sum,
  // and thousands of nested brackets would only exhaust the stack.
  if (input.length > 300) return client.sendText(m.chat, txt.calcInvalida, m);

  // lib/calculadora.js, not eval(): it understands arithmetic and nothing else. An expression it can't read gets an
  // answer instead of silence (eval's errors used to go to the log and nothing more).
  let result;
  try {
    result = evaluar(input);
  } catch (e) {
    return client.sendText(m.chat, SIN_RESULTADO[e.motivo] || txt.calcInvalida, m);
  }
  await client.sendText(m.chat, txt.calcSuccess(text, mostrar(result)), m);
};

export default plugin;
