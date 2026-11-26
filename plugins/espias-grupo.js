import { textoEspias, denunciar, anularMision, EMOJIS, ESPIA } from "../lib/espias.js";
import { updateChat } from "../database-functions.js";
import { leerInterruptor } from "../lib/comandos.js";
import { lidMencionadoActual } from "../lib/identidad.js";
import txt from "../lib/strings.js";

// The secret missions, in the group (lib/espias.js). .espias: how the game stands and how it's played · .espias
// on|off (admins): its switch, off unless asked for · .denunciar @persona (or .denunciar 🦊 @persona): say who the
// spy of the open envelope is. Signing up and reading the mission are done in private (plugins/espias-agente.js).
// The switch isn't one more of config-on-off.js: with no word, those flip, and .espias alone is a question.
const plugin = {};
plugin.cmd = ["espias", "denunciar"];
plugin.economia = true;
plugin.onlyGroup = true;

const sinVariante = (e) => String(e || "").replace(/️/g, "");

plugin.run = async (m, { client, command, args = [], text, participants, isAdmin, isOwner, botSettings }) => {
  try {
    if (command.toLowerCase() === "denunciar") {
      const emoji = EMOJIS.includes(sinVariante(args[0])) ? sinVariante(args[0]) : null;
      const acusado = await lidMencionadoActual(client, m, text, participants);
      if (!acusado) return client.sendText(m.chat, `Se denuncia así: .denunciar @persona (o respondiendo un mensaje suyo). Si acertás quién es el espía del sobre cobrás ${ESPIA.RECOMPENSA} UruCoins; si le errás, pagás ${ESPIA.DENUNCIA_FALSA}.`, m);
      const r = denunciar(m.chat, [m.sender, m.senderJid].filter(Boolean), acusado, emoji);
      return client.sendText(m.chat, r.ok ? r.texto : `❌ ${r.error}`, m, r.mentions?.length ? { mentions: r.mentions } : {});
    }

    const prender = args.length === 1 ? leerInterruptor(args[0]) : null;
    if (prender === null) return client.sendText(m.chat, textoEspias(m.chat), m);
    if (!isAdmin && !isOwner) return client.sendText(m.chat, txt.onlyAdmin, m);
    updateChat(m.chat, { espias: prender });
    if (!prender) {
      const anulado = anularMision(m.chat);
      return client.sendText(m.chat, `🕵️ Listo, se terminó el espionaje: no reparto más sobres.${anulado ? ` El de ${anulado} queda sin efecto.` : ""} Los que estaban anotados siguen anotados, por si vuelve.`, m);
    }
    // The whole game goes through private chats: with them closed, nobody can sign up.
    const cerrados = botSettings?.antiPrivate ? "\n\n⚠️ Ojo: los privados están cerrados (.antiprivado), y esto se juega por privado: así no se puede anotar nadie." : "";
    return client.sendText(m.chat, `🕵️ Misión secreta *prendida*. El que quiera jugar me escribe *por privado* .espia y le doy un emoji secreto, que no se le dice a nadie. Con ${ESPIA.MIN_AGENTES} anotados empiezan a llegar sobres: a lo sumo uno por día, de día, y solo si el grupo está charlando. .espias explica el resto y .espias off lo apaga.${cerrados}`, m);
  } catch (e) {
    console.error("[espias] ERROR:", e);
  }
};

export default plugin;
