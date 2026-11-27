import { textoEncargos, elegirCamino, aportar, anularEncargo, ENCARGO } from "../lib/encargos.js";
import { updateChat } from "../database-functions.js";
import { leerInterruptor, leerEntero } from "../lib/comandos.js";
import txt from "../lib/strings.js";

// The urgent errands (lib/encargos.js). .encargo / .encargos: the one running and how they work · .encargos on|off
// (admins): the switch, off unless asked for · .ruta 2: whoever has the errand chooses their way (the bare number
// does the same, plugins/_encargos.js) · .ayudo 30 / .saboteo 30: coins that raise or lower the chance. Betting on it
// is plugins/coins-encargos-apuesta.js, which the casino's switch stops.
// The switch isn't one more of config-on-off.js: with no word, those flip, and .encargos alone is a question.
const plugin = {};
plugin.cmd = ["encargo", "encargos", "ruta", "camino", "ayudo", "saboteo"];
plugin.economia = true;
plugin.onlyGroup = true;

const responder = (client, m, r) => client.sendText(m.chat, r.ok ? r.texto : `❌ ${r.error}`, m, r.mentions?.length ? { mentions: r.mentions } : {});

plugin.run = async (m, { client, command, args = [], isAdmin, isOwner }) => {
  try {
    const cmd = command.toLowerCase();
    const quien = [m.sender, m.senderJid].filter(Boolean);

    if (cmd === "ruta" || cmd === "camino") {
      const r = elegirCamino(m.chat, quien, leerEntero(args[0]));
      if (!r) return client.sendText(m.chat, "No hay ningún encargo corriendo ahora. .encargos cuenta cómo van.", m);
      return responder(client, m, r);
    }

    if (cmd === "ayudo" || cmd === "saboteo") {
      const cantidad = leerEntero(args[0]);
      if (cantidad === null) return client.sendText(m.chat, `Decime cuánto ponés: .${cmd} 30 (de ${ENCARGO.APORTE_MIN} a ${ENCARGO.APORTE_MAX} UruCoins por encargo; cada ${ENCARGO.APORTE_PASO} ${cmd === "ayudo" ? "suben" : "bajan"} un punto la chance).`, m);
      return responder(client, m, aportar(m.chat, quien, cmd === "ayudo" ? "ayuda" : "sabotaje", cantidad));
    }

    const prender = args.length === 1 ? leerInterruptor(args[0]) : null;
    if (prender === null) {
      const estado = textoEncargos(m.chat);
      return client.sendText(m.chat, estado.texto, m, estado.mentions.length ? { mentions: estado.mentions } : {});
    }
    if (!isAdmin && !isOwner) return client.sendText(m.chat, txt.onlyAdmin, m);
    updateChat(m.chat, { encargos: prender });
    if (prender) return client.sendText(m.chat, `🚨 Encargos urgentes *prendidos*: cada tanto etiqueto a alguien que esté charlando y le tiro un encargo de su oficio, con ${ENCARGO.PLAZO_MIN} minutos de plazo. Los demás apuestan, ayudan o sabotean. A lo sumo ${ENCARGO.MAX_DIA} por día, de día, y solo si el grupo está charlando. .encargos explica el resto y .encargos off los apaga.`, m);
    const anulado = anularEncargo(m.chat);
    await client.sendText(m.chat, "🚨 Listo, no reparto más encargos urgentes.", m);
    if (anulado) await client.sendMessage(m.chat, { text: anulado.texto, mentions: anulado.mentions });
  } catch (e) {
    console.error("[encargos] ERROR:", e);
  }
};

export default plugin;
