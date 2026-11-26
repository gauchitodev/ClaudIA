import { textoAvisos, vetarAviso } from "../lib/tienda.js";
import { leerEntero } from "../lib/comandos.js";

// The paid notices and gossip for the town's Sunday paper (lib/tienda.js). .avisos: the ones waiting, with their
// number · .vetar <número> (admins): takes one out before it's printed, and it's paid back.
const plugin = {};
plugin.cmd = ["avisos", "vetar"];
plugin.economia = true;
plugin.onlyGroup = true;

const mandar = (client, m, texto, mentions = []) => client.sendText(m.chat, texto, m, mentions.length ? { mentions } : {});

plugin.run = async (m, { client, command, args = [], isAdmin, isOwner }) => {
  try {
    if (command.toLowerCase() === "vetar") {
      if (!isAdmin && !isOwner) return mandar(client, m, "✂️ Vetar avisos es cosa de los admins. Si uno te molesta, avisale a alguno.");
      const id = leerEntero(String(args[0] || "").replace("#", ""));
      if (id === null) return mandar(client, m, "✂️ ¿Cuál? .vetar <número>, con el número que muestra .avisos");
      const r = vetarAviso(m.chat, id);
      return mandar(client, m, r.ok ? r.texto : `❌ ${r.error}`, r.mentions || []);
    }
    const r = textoAvisos(m.chat);
    return mandar(client, m, r.texto, r.mentions);
  } catch (e) {
    console.error("[avisos] ERROR:", e);
  }
};

export default plugin;
