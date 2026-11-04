import { updateUserInGroup } from "../database-functions.js";
import { fueraDeAura, soltarDesafioDe, votandoCon } from "../lib/aura.js";
import { idsDeParticipante } from "../lib/identidad.js";

// .noaura / .siaura: out of this group's aura duels (lib/aura.js) and back in, as .notagall: out, nobody can challenge
// them and they can challenge nobody. Anyone can, with .modoadmin, the games off or .bladd too: it's about oneself, so
// it's no game and has no section. The aura already won stays in the ranking.
const plugin = {};
plugin.cmd = ["noaura", "siaura"];
plugin.onlyGroup = true;
plugin.fueraDelModoAdmin = true; // handle-message.js lets it through .modoadmin

plugin.run = async (m, { client, command }) => {
  const salir = command === "noaura";
  const ids = idsDeParticipante({ id: m.sender, phoneNumber: m.senderJid });
  const afuera = fueraDeAura(m.chat, ids);
  if (salir && afuera) return client.sendText(m.chat, "🚫 Ya estabas fuera de los duelos de aura de este grupo. Con .siaura volvés.", m);
  if (!salir && !afuera) return client.sendText(m.chat, "✨ Ya estás en los duelos de aura de este grupo. Con .noaura te salís.", m);
  // Written as true or false, and only under whoever asks, as .notagall (lib/menciones-generales.js).
  if (!updateUserInGroup(m.sender, m.chat, { sinAura: salir })) return client.sendText(m.chat, "❌ No pude guardar el cambio, probá de nuevo en un rato.", m);
  if (!salir) return client.sendText(m.chat, "✨ Listo: volvés a los duelos de aura de este grupo.", m);
  // A challenge still waiting for its answer goes with them; a duel already being voted ends as it is: both accepted.
  const despues = soltarDesafioDe(m.chat, ids) ? "\nEl desafío que estaba pendiente queda sin efecto." : votandoCon(m.chat, ids) ? "\nEl duelo que ya se está votando termina igual." : "";
  return client.sendText(m.chat, `🚫 Listo: en este grupo ya no te pueden desafiar a duelos de aura, ni vos podés desafiar a nadie. El aura que ganaste sigue en el ranking. Con .siaura volvés.${despues}`, m);
};

export default plugin;
