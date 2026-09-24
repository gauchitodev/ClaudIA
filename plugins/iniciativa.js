import { textoIniciativa } from "../lib/iniciativa.js";
import { activarIniciativa, desactivarIniciativa } from "../lib/vistazos.js";

// .iniciativa: how Claudia's initiative is going in this group · .iniciativa on|off (admins). It isn't one more switch
// of config-on-off.js: those need the bot to be a group admin, and this one has a status to show.
const plugin = {};
plugin.cmd = ["iniciativa"];
plugin.onlyGroup = true;

const PRENDER = new Set(["on", "prender", "activar", "si", "sí"]);
const APAGAR = new Set(["off", "apagar", "desactivar", "no"]);

plugin.run = async (m, { client, args, isAdmin, isOwner }) => {
  const opcion = (args[0] || "").toLowerCase();
  if (PRENDER.has(opcion) || APAGAR.has(opcion)) {
    if (!isAdmin && !isOwner) return client.sendText(m.chat, txt.onlyAdmin, m);
    if (APAGAR.has(opcion)) {
      desactivarIniciativa(m.chat);
      return client.sendText(m.chat, "🙋 Listo, vuelvo a hablar solo cuando me nombran.", m);
    }
    activarIniciativa(m.chat);
    return client.sendText(m.chat, "🙋 Listo: desde ahora a veces miro el grupo por mi cuenta (unas pocas veces por día, nunca de noche) y, si viene al caso, reacciono o comento algo. Si molesto, díganme «callate Claudia» y me freno unas horas. .iniciativa off lo apaga.", m);
  }
  await client.sendText(m.chat, textoIniciativa(m.chat), m);
};

export default plugin;
