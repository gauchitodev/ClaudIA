import { prenderDiario, apagarDiario, borrarElDiario, textoDelDiario, DIARIO } from "../lib/diario.js";
import txt from "../lib/strings.js";
import { leerInterruptor, limpiarPalabra } from "../lib/comandos.js";

// .diario (or .historial): Claudia's diary of the group (lib/diario.js). Alone, what whoever asks gets to read of it
// and how it's set · .diario on|off and .diario borrar (admins). Like .iniciativa, it isn't one more switch of
// config-on-off.js: it has something to show, and turning it on says what it means for the group.
const plugin = {};
plugin.cmd = ["diario", "historial"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, args = [], isAdmin, isOwner }) => {
  const estado = leerInterruptor(args[0]);
  const borra = ["borrar", "limpiar"].includes(limpiarPalabra(args[0]));
  if (estado === null && !borra) return client.sendText(m.chat, textoDelDiario(m.chat, { para: [m.sender, m.senderJid] }), m);
  if (!isAdmin && !isOwner) return client.sendText(m.chat, txt.onlyAdmin, m);
  if (borra) {
    const dias = borrarElDiario(m.chat);
    return client.sendText(m.chat, dias ? `🗑️ Listo, borré el diario de este grupo (${dias === 1 ? "1 día" : `${dias} días`}).` : "📔 No había nada anotado en el diario de este grupo.", m);
  }
  if (!estado) {
    return client.sendText(m.chat, apagarDiario(m.chat) ? `📔 Listo, dejo de anotar y de usar lo que tenía anotado. Lo escrito se va solo a los ${DIARIO.DIAS} días; para borrarlo ya, .diario borrar.` : "📔 El diario ya estaba apagado.", m);
  }
  if (!prenderDiario(m.chat)) return client.sendText(m.chat, "📔 El diario ya estaba prendido. Se lee con .diario.", m);
  await client.sendText(
    m.chat,
    `📔 Listo: desde ahora llevo un diario de este grupo. Un par de veces por día anoto en pocas líneas de qué se habló, sin nombrar a nadie, para acordarme los días siguientes (lo resume la misma IA con la que charlo); lo que se dijo hasta ahora no lo anoto. Cada día se guarda ${DIARIO.DIAS} días y después se borra solo. Cualquiera lo lee con .diario, y un admin lo apaga con .diario off o lo borra con .diario borrar.`,
    m,
  );
};

export default plugin;
