// The scheduled announcements (the birthday greeting, the daily question, the weekly recap, the marketplace's notices)
// are marked as done before they go out, so two passes can't both send one. When the send failed, the mark stayed and
// the announcement was simply lost. Now the mark is undone and the next pass (5 minutes later) tries again, a few times
// and no more: one that can't go out (the bot was removed from the group) mustn't come back every 5 minutes for good,
// asking WhatsApp each time. Kept in memory: a restart gives it a fresh go.

export const AVISOS = { INTENTOS_MAX: 5 };

const fallidos = new Map(); // announcement -> failed attempts

// After a failed send: whether to undo the mark so it's tried again. "clave" names the announcement: the group, what it
// is and its period.
export function volverAIntentar(clave) {
  const intentos = (fallidos.get(clave) || 0) + 1;
  fallidos.set(clave, intentos);
  return intentos < AVISOS.INTENTOS_MAX;
}
