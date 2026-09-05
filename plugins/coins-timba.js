// .timba: ranking de los más ludópatas del grupo. Cuenta todo lo apostado (casino, apuestas en juegos,
// lotería y mercados) y el resultado neto (premios y devoluciones menos lo apostado).
// .timba mes → solo lo de este mes.

import { etiquetaLaburo } from "../lib/laburos.js";

const MOTIVOS_APUESTA = ["casino_ruleta", "casino_tragamonedas", "apuesta_%", "loteria_boletos", "mercado_apuesta_%"];
const MOTIVOS_COBRO = ["casino_ruleta_premio", "casino_tragamonedas_premio", "apuesta_ganada", "escudo_devolucion", "loteria_premio", "loteria_devolucion", "mercado_premio_%", "mercado_devolucion_%"];

const TITULOS = ["🎰 Ludópata mayor", "🎲 Timbero serial", "🃏 Aprendiz del vicio", "🎯 Ocasional", "🪙 Turista"];

function topTimba(chat, desde = 0, n = 5) {
  const like = (lista) => lista.map(() => "motivo LIKE ?").join(" OR ");
  const apostado = globalThis.db
    .prepare(`SELECT usuario, SUM(-cantidad) AS apostado, COUNT(*) AS jugadas FROM urucoins_log WHERE chat = ? AND cantidad < 0 AND fecha >= ? AND (${like(MOTIVOS_APUESTA)}) GROUP BY usuario ORDER BY apostado DESC LIMIT ?`)
    .all(chat, desde, ...MOTIVOS_APUESTA, n);
  const cobrado = globalThis.db.prepare(`SELECT COALESCE(SUM(cantidad), 0) AS total FROM urucoins_log WHERE chat = ? AND usuario = ? AND cantidad > 0 AND fecha >= ? AND (${like(MOTIVOS_COBRO)})`);
  return apostado.map((r) => ({ ...r, neto: cobrado.get(chat, r.usuario, desde, ...MOTIVOS_COBRO).total - r.apostado }));
}

let plugin = {};
plugin.cmd = ["timba", "ludopatas", "ludópatas"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, args }) => {
  const soloMes = /^mes$/i.test(args[0] || "");
  let desde = 0;
  if (soloMes) {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    desde = d.getTime();
  }

  const top = topTimba(m.chat, desde, 5);
  if (top.length === 0) return client.sendText(m.chat, soloMes ? "Este mes nadie apostó nada todavía. Sanos." : "Acá nadie apostó nunca. Sospechoso.", m);

  const lineas = top.map((r, i) => {
    const signo = r.neto > 0 ? `+${r.neto}` : `${r.neto}`;
    const estado = r.neto > 0 ? "🟢" : r.neto < 0 ? "🔴" : "⚪";
    const laburo = etiquetaLaburo(m.chat, r.usuario);
    return `${i + 1}. @${r.usuario.split("@")[0]}${laburo ? ` (${laburo})` : ""} — ${TITULOS[i]}\n   apostó *${r.apostado}* en ${r.jugadas} ${r.jugadas === 1 ? "jugada" : "jugadas"} · balance ${estado} ${signo}`;
  });

  const texto = `🎰 *LOS MÁS LUDÓPATAS${soloMes ? " DEL MES" : ""}*\n\n${lineas.join("\n")}\n\nCuenta casino, apuestas en juegos, lotería y mercados.${soloMes ? "" : " Probá .timba mes para solo este mes."}`;
  await client.sendMessage(m.chat, { text: texto, mentions: top.map((r) => r.usuario) }, { quoted: m });
};

export default plugin;
