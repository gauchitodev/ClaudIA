import { elegirAlAzar } from "../lib/azar.js";
import { lidMencionado } from "../lib/menciones.js";
import { parejaDe } from "../lib/parejas.js";

// .besar @x: beso virtual, salvo que alguno de los dos tenga pareja con otra persona. Un pedido de pareja pendiente no
// cuenta como pareja.
const plugin = {};
plugin.cmd = ["kiss", "beso", "besar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  const who = lidMencionado(m, text);
  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (who === client.user.lid) return client.sendText(m.chat, txt.besarBot, m);

  const mia = parejaDe(m.sender);
  if (mia && mia.pareja !== who) return client.sendText(m.chat, txt.besarInfiel(mia.pareja), m);
  const suya = parejaDe(who);
  if (suya && suya.pareja !== m.sender) return client.sendText(m.chat, txt.besarTienePareja(who), m);

  const teks = elegirAlAzar(["¡Muah! 💋 Beso virtual enviado con cariño.", "¡Besoo enviado! 💋", "¡Hermoso beso virtual para ti! 💋"]);
  const recibido = `${teks}\n\n*💌Lo recibe:* @${who.split("@")[0]}\n\n*😚De parte de:* @${m.sender.split("@")[0]}`;
  const rechazado = `@${who.split("@")[0]} rechazó el beso y le corrió la cara a @${m.sender.split("@")[0]} 🤣`;
  const mensaje = elegirAlAzar([recibido, rechazado]);
  const kz = await client.sendText(m.chat, mensaje, m);
  client.sendMessage(m.chat, { react: { text: mensaje === recibido ? "💋" : "🤣", key: kz.key } });
};

export default plugin;
