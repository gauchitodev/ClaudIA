// Poker pots, pure: what each player put in becomes a main pot and side pots, and each pot goes to the best hand among
// those who can win it. Someone all-in for less than the others can only win up to their own level from each player;
// what the others put in beyond that is a side pot they settle among themselves. What the folded players put in stays
// in the pots they contributed to. Every chip goes somewhere: Σ pagos is always Σ aportes.

// jugadores: [{ id, aporte, retirado }]. Returns [{ monto, elegibles, soloSuyo }], from the main pot up: elegibles are
// the ids that can win it; soloSuyo marks a top pot that only one player put chips into (an uncalled bet), which just
// goes back to them.
export function armarPozos(jugadores) {
  const vivos = jugadores.filter((j) => !j.retirado);
  const niveles = [...new Set(vivos.map((j) => j.aporte).filter((aporte) => aporte > 0))].sort((a, b) => a - b);
  const pozos = [];
  let anterior = 0;
  for (const nivel of niveles) {
    const monto = jugadores.reduce((suma, j) => suma + Math.min(j.aporte, nivel) - Math.min(j.aporte, anterior), 0);
    const elegibles = vivos.filter((j) => j.aporte >= nivel).map((j) => j.id);
    const soloSuyo = elegibles.length === 1 && jugadores.every((j) => j.id === elegibles[0] || j.aporte <= anterior);
    if (monto > 0) pozos.push({ monto, elegibles, soloSuyo });
    anterior = nivel;
  }
  // Chips above every live player's level (a folded player who had put in more): it doesn't happen in play, since
  // nobody folds to a bet smaller than their own, but no chip may vanish, so they go to the ones still in.
  const resto = jugadores.reduce((suma, j) => suma + Math.max(0, j.aporte - anterior), 0);
  if (resto > 0 && vivos.length) pozos.push({ monto: resto, elegibles: vivos.map((j) => j.id), soloSuyo: false });
  return pozos;
}

// Each pot to the strongest among its elegibles (fuerzaDe(id) is a number, bigger is better), split evenly among
// ties; the chips that don't split go one each to the winners in table order (orden: ids clockwise from the first seat
// after the button). Returns the pots with { ganadores, pagos: { id: fichas } } added.
export function repartirPozos(pozos, fuerzaDe, orden) {
  const posicion = new Map(orden.map((id, i) => [id, i]));
  return pozos.map((pozo) => {
    const mejor = Math.max(...pozo.elegibles.map((id) => fuerzaDe(id)));
    const ganadores = pozo.elegibles.filter((id) => fuerzaDe(id) === mejor).sort((a, b) => (posicion.get(a) ?? 99) - (posicion.get(b) ?? 99));
    const base = Math.floor(pozo.monto / ganadores.length);
    const sobran = pozo.monto % ganadores.length;
    const pagos = Object.fromEntries(ganadores.map((id, i) => [id, base + (i < sobran ? 1 : 0)]));
    return { ...pozo, ganadores, pagos };
  });
}

// What each id takes out of a settled hand, every pot added up.
export function totalPorJugador(pozosRepartidos) {
  const total = {};
  for (const pozo of pozosRepartidos) for (const [id, fichas] of Object.entries(pozo.pagos)) total[id] = (total[id] || 0) + fichas;
  return total;
}
