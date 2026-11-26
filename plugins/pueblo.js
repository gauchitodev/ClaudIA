import { textoPueblo, nacer, ponerNombre, fijarImpuesto, textoNacimiento, dormirPueblo, nombreDelPueblo } from "../lib/pueblo.js";
import { updateChat, getChat } from "../database-functions.js";
import { leerInterruptor, leerEntero } from "../lib/comandos.js";
import txt from "../lib/strings.js";

// The town of the group (lib/pueblo.js). .pueblo: the board · .pueblo on|off (admins): the switch, off unless asked
// for · .pueblo nombre <name> (admins) · .impuesto 12: the intendente sets the municipal tax. The Sunday paper is
// plugins/pueblo-eco.js.
// The switch isn't one more of config-on-off.js: with no word, those flip, and .pueblo alone is the board.
const plugin = {};
plugin.cmd = ["pueblo", "impuesto", "intendente"];
plugin.economia = true;
plugin.onlyGroup = true;

const mandar = (client, m, texto, mentions = []) => client.sendText(m.chat, texto, m, mentions.length ? { mentions } : {});

plugin.run = async (m, { client, command, args = [], isAdmin, isOwner }) => {
  try {
    const cmd = command.toLowerCase();
    const quien = [m.sender, m.senderJid].filter(Boolean);

    if (cmd === "impuesto") {
      const valor = leerEntero(String(args[0] || "").replace("%", ""));
      if (valor === null) {
        const tablero = await textoPueblo(m.chat);
        const linea = tablero.texto.split("\n").find((l) => l.startsWith("🏛️"));
        return mandar(client, m, `${linea || "Acá no hay pueblo, así que tampoco impuesto municipal. Un admin lo prende con .pueblo on"}\nEl intendente lo cambia con .impuesto <porcentaje>, una vez por semana.`, tablero.mentions);
      }
      const r = fijarImpuesto(m.chat, quien, valor);
      return mandar(client, m, r.ok ? r.texto : `❌ ${r.error}`, r.mentions || []);
    }

    if (cmd === "intendente") {
      const tablero = await textoPueblo(m.chat);
      const linea = tablero.texto.split("\n").find((l) => l.startsWith("🏛️"));
      return mandar(client, m, linea || tablero.texto, tablero.mentions);
    }

    const primera = String(args[0] || "").toLowerCase();
    if (primera === "nombre") {
      if (!isAdmin && !isOwner) return client.sendText(m.chat, txt.onlyAdmin, m);
      const r = ponerNombre(m.chat, args.slice(1).join(" "));
      return mandar(client, m, r.ok ? r.texto : `❌ ${r.error}`);
    }

    const prender = args.length === 1 ? leerInterruptor(args[0]) : null;
    if (prender === null) {
      const r = await textoPueblo(m.chat);
      return mandar(client, m, r.texto, r.mentions);
    }
    if (!isAdmin && !isOwner) return client.sendText(m.chat, txt.onlyAdmin, m);
    if (prender) {
      const nuevo = !nombreDelPueblo(m.chat);
      const yaEstaba = getChat(m.chat)?.pueblo === 1;
      nacer(m.chat);
      updateChat(m.chat, { pueblo: 1 });
      if (yaEstaba) return mandar(client, m, `🏘️ El pueblo ya estaba prendido. .pueblo muestra cómo está.`);
      return mandar(client, m, textoNacimiento(m.chat, { nuevo }));
    }
    updateChat(m.chat, { pueblo: 0 });
    const aviso = await dormirPueblo(m.chat);
    await mandar(client, m, `🏘️ Listo: ${nombreDelPueblo(m.chat) || "el pueblo"} se quedó dormido. Los oficios, las empresas y los juegos siguen andando como siempre, sin pueblo de por medio; con .pueblo on se despierta tal cual quedó.`);
    if (aviso) await client.sendMessage(m.chat, { text: aviso.texto, mentions: aviso.mentions });
  } catch (e) {
    console.error("[pueblo] ERROR:", e);
  }
};

export default plugin;
