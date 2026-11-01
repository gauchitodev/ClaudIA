// What changes for the bot when a group's participants do (Baileys' group-participants.update): someone came in, left
// or was removed, was promoted or demoted, or changed numbers. main.js hands each event over.
//
// It used to live inline in main.js, where no test could reach it: the tests read main.js's text instead, and passed
// with a cleanup commented out, or with the group taken away from them, and failed when a variable was renamed.
import { metadataDe, ultimaCopia } from "./cache-grupos.js";
import { limpiarRolesAlSalir } from "./roles.js";
import { limpiarVentasAlSalir } from "./compraventa.js";
import { recibirNuevos } from "./bienvenida.js";
import { recordarIngreso } from "./contexto-chat.js";
import { idsDeParticipante, idsDelGrupo } from "./identidad.js";
import { reiniciarSiEsElBot, anotarIngresos } from "./inactivos.js";

// The group for the cleanups on leaving, for whoever leaves with their number alone, or their LID alone: as WhatsApp
// says it is now, which may list with another number whoever had theirs before, and, of the copy from before, whoever
// the new one no longer lists, by either id: whoever left, with the id the event didn't bring. Whoever the new one
// still lists is still in the group, and the copy from before may be older than a number changing hands. With no new
// copy, the one from before as it is.
function grupoAlIrse(nuevo, anterior) {
  if (!nuevo) return anterior;
  const siguen = new Set(nuevo.flatMap(idsDelGrupo));
  return [...nuevo, ...(anterior || []).filter((p) => !idsDelGrupo(p).some((id) => siguen.has(id)))];
}

// "participants" come as Baileys gives them: objects with an id, and the lid or the phoneNumber apart when WhatsApp
// sends them (Socket/messages-recv.js). It never throws: it runs as an event listener.
export async function alCambiarParticipantes(client, { id, participants, action } = {}) {
  try {
    if (!id?.endsWith("@g.us")) return;
    // When it happened: whoever left takes their posts down as of then, though it waits for the copy asked for below.
    const cuando = Date.now();
    // The group as the bot last saw it, however old (ultimaCopia), for who it lists with which number: the LID the
    // database knows for a number isn't whoever comes with it alone when the group lists that one with another number
    // (idsDeParticipante). It was the copy at hand, and there's none 5 minutes after the last one nor after
    // reconnecting: whoever had the number before looked like they had just come in, and lost their role and their
    // posts when whoever has it now left.
    const antes = ultimaCopia(id)?.participants || null;

    // The bot itself coming in or leaving: .inactivos starts counting the group over (lib/inactivos.js). Ahead of the
    // copy asked for below, which notes whether the group is closed: started over after it, the count dropped that,
    // and coming into a closed group, .inactivos tagged everyone.
    if (action === "add" || action === "remove") reiniciarSiEsElBot(client, id, participants);
    // Whoever comes in: when, so .resumen only tells them what was said from then on, and in the database, so
    // .inactivos gives them time even after a restart (anotarIngresos, lib/inactivos.js). Right away, ahead of the copy
    // asked for below: a message of theirs while it was on its way would have lifted a warning from before they left,
    // and paid them a "Volvió".
    if (action === "add") {
      for (const p of participants || []) recordarIngreso(id, idsDeParticipante(p, antes));
      anotarIngresos(id, participants);
    }

    // The group as it is now: without it the admin list stays as it was, and the bot doesn't find out it was given (or
    // stripped of) admin until the next restart. The blacklist needs to know which id the group lists each person
    // under. If it couldn't be fetched, carry on anyway: the group rules still get sent. The same join also reaches
    // processMessageStubType, and the cache collapses both into a single query.
    const metadata = await metadataDe(client, id, { fresca: true });

    // Whoever leaves the group (or is removed) loses the bot role they had there, and their posts and alerts, by the
    // group as it is now and whoever left with the event (grupoAlIrse).
    if (action === "remove") {
      const grupo = grupoAlIrse(metadata?.participants || null, antes);
      limpiarRolesAlSalir(id, participants, grupo);
      limpiarVentasAlSalir(id, participants, cuando, grupo);
    }
    // The blacklisted are removed on the spot, everyone else gets the group rules.
    if (action === "add") await recibirNuevos(client, id, participants, metadata);
  } catch (e) {
    console.error("[grupos] error con un cambio de participantes:", e);
  }
}
