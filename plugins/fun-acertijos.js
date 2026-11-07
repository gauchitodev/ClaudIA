// .acertijo: a riddle and 30 seconds to answer it, quoting the question; the first to get it right wins the prize. The
// bank, how an answer is read and which riddle comes next live in lib/acertijos.js; each person has ACERTIJO.INTENTOS
// tries, and past them their answers get a 🙅 and count for nothing, as a second try does in the trivia.
import { juegoTerminado } from "../lib/urucoins.js";
import { abrirJuego } from "../lib/juego-rapido.js";
import { esComando } from "../lib/comandos.js";
import { ACERTIJO, elegirAcertijo, esRespuesta } from "../lib/acertijos.js";
import txt from "../lib/strings.js";
import { estadoDe } from "../lib/estado-de-plugins.js";

const plugin = {};
plugin.cmd = ["acertijo", "acertijos"];
plugin.juego = true;
plugin.botAdmin = true;

// chat -> the riddle in play, kept where a reload of this file doesn't lose it (lib/estado-de-plugins.js)
const acertijos = estadoDe("fun-acertijos", () => ({}));

plugin.run = async (m, { client }) => {
  // Before choosing: a riddle chosen for nothing would count among the group's latest.
  if (acertijos[m.chat]) return client.sendText(m.chat, txt.gameAlready, m);
  const acertijo = elegirAcertijo(m.chat);
  // The chat is taken before the riddle goes out, and only this riddle's timer can end it: see lib/juego-rapido.js.
  const abierto = await abrirJuego(acertijos, m.chat, {
    nombre: "acertijo",
    juego: { acertijo, intentos: new Map() },
    enviar: () =>
      client.sendText(m.chat, `*[🧠] Acertijo:*\n* ${acertijo.pregunta}\n\n*[💡] PISTA:* ${acertijo.pista}\n\n*[❗] RESPONDE A ESTE MENSAJE* con la respuesta.\n*[⏱️]* Tienen 30 segundos y ${ACERTIJO.INTENTOS} intentos cada uno.`, m),
    alVencer: () => {
      const resumen = juegoTerminado(m.chat, null, { nombre: "acertijo" });
      client.sendText(m.chat, `*[⏳] ¡TIEMPO!*\n\n*[🌟] La respuesta era:* ${acertijo.respuesta}${resumen}`, m).catch(console.error);
    },
  });
  if (!abierto) return client.sendText(m.chat, txt.gameAlready, m);
};

plugin.before = async (m, { client }) => {
  const juego = acertijos[m.chat];
  if (!juego) return;
  // An answer quotes the question.
  if (!m.quoted || m.quoted.id !== juego.mensajeId) return;
  // A command quoting the question isn't an answer: ".un piano" won the riddle, and ran as the command .un.
  if (esComando(m.text)) return;

  const usados = juego.intentos.get(m.sender) || 0;
  if (usados >= ACERTIJO.INTENTOS) return m.react("🙅");
  if (!esRespuesta(juego.acertijo, m.text)) {
    juego.intentos.set(m.sender, usados + 1);
    return m.react("❌");
  }
  clearTimeout(juego.timeout);
  delete acertijos[m.chat];
  const resumen = juegoTerminado(m.chat, m.sender, { nombre: "acertijo" });
  await client.sendText(m.chat, txt.gameSuccess + resumen, m);
};

export default plugin;
