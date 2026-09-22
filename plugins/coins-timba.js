// .timba: a ranking of the group's biggest gamblers. It counts everything staked (casino, bets on games, the
// lottery and the markets) and the net result (prizes and refunds minus what was staked).
// .timba mes → solo lo de este mes. Your own breakdown, game by game, is .mitimba.
// Which reason belongs to which game lives in lib/timba.js, shared with .mitimba and guarded by test/motivos.test.mjs.

import { topTimba, inicioDeMes } from "../lib/timba.js";
import { etiquetaLaburo } from "../lib/laburos.js";
import { nombreDe } from "../lib/menciones.js";

const TITULOS = ["🎰 Ludópata mayor", "🎲 Timbero serial", "🃏 Aprendiz del vicio", "🎯 Ocasional", "🪙 Turista"];

const plugin = {};
plugin.cmd = ["timba", "ludopatas", "ludópatas"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, args }) => {
  const soloMes = /^mes$/i.test(args[0] || "");
  const top = topTimba(m.chat, { desde: soloMes ? inicioDeMes() : 0, n: 5 });
  if (top.length === 0) return client.sendText(m.chat, soloMes ? "Este mes nadie apostó nada todavía. Sanos." : "Acá nadie apostó nunca. Sospechoso.", m);

  const lineas = top.map((r, i) => {
    const signo = r.neto > 0 ? `+${r.neto}` : `${r.neto}`;
    const estado = r.neto > 0 ? "🟢" : r.neto < 0 ? "🔴" : "⚪";
    const laburo = etiquetaLaburo(m.chat, r.usuario);
    return `${i + 1}. ${nombreDe(r.usuario)}${laburo ? ` (${laburo})` : ""} — ${TITULOS[i]}\n   apostó *${r.apostado}* en ${r.jugadas} ${r.jugadas === 1 ? "jugada" : "jugadas"} · balance ${estado} ${signo}`;
  });

  const texto = `🎰 *LOS MÁS LUDÓPATAS${soloMes ? " DEL MES" : ""}*\n\n${lineas.join("\n")}\n\nCuenta casino, duelos, apuestas en juegos, lotería y mercados. Tu detalle por juego: .mitimba${soloMes ? "" : " · .timba mes para solo este mes"}`;
  await client.sendText(m.chat, texto, m); // no mentions: a ranking has no business notifying everyone on it
};

export default plugin;
