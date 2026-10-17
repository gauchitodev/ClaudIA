import { updateUserInGroup } from "../database-functions.js";
import { idsDeParticipante } from "../lib/identidad.js";
import { noRecibeLlamados } from "../lib/menciones-generales.js";

// .notagall / .sitagall: out of this group's calls to everyone (.tagall, .ht, a poll's call to vote, Claudia's .tagall)
// and back in (lib/menciones-generales.js). Anyone can: it's a preference about oneself, so it needs no admin. Mentions
// aimed at someone (@persona, .llamar) still arrive, and an admin can force a notice to everyone with .tagall -f.
const plugin = {};
plugin.cmd = ["notagall", "sitagall"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, command }) => {
  const salir = command === "notagall";
  const afuera = noRecibeLlamados(m.chat, idsDeParticipante({ id: m.sender, phoneNumber: m.senderJid }));
  if (salir && afuera) return client.sendText(m.chat, "🔕 Ya estabas fuera de los llamados a todos de este grupo. Con .sitagall volvés.", m);
  if (!salir && !afuera) return client.sendText(m.chat, "🔔 Ya recibís los llamados a todos de este grupo. Con .notagall te salís.", m);
  // Written as true or false, never deleted, and only under whoever asks: written through a number, it would land on
  // every row that shares it (lib/menciones-generales.js reads the LID row first).
  if (!updateUserInGroup(m.sender, m.chat, { sinTagall: salir })) return client.sendText(m.chat, "❌ No pude guardar el cambio, probá de nuevo en un rato.", m);
  return client.sendText(
    m.chat,
    salir ? "🔕 Listo: en este grupo los llamados a todos (.tagall, .ht y el aviso de las encuestas) ya no te arroban. Solo te llega un aviso que un admin fuerce con .tagall -f. Con .sitagall volvés." : "🔔 Listo: vuelvo a arrobarte en los llamados a todos de este grupo.",
    m,
  );
};

export default plugin;
