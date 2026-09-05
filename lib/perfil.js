// Ficha de una persona en el grupo: junta en un solo mensaje lo que guardan la economía, los laburos, la actividad,
// las parejas, los cumpleaños y la tienda. La usa .perfil.
import { getUser, getSaldoCoins, puestoCoins, getCumple, puestoRankingMensual, contarMovimientos } from "../database-functions.js";
import { laburoDe, textoNivel } from "./laburos.js";
import { textoRacha } from "./actividad.js";
import { textoInventario } from "./tienda.js";
import { MESES } from "./cumpleanos.js";
import { mesDe } from "./hashtags.js";
import { duracion } from "./tiempo.js";
import { rangoDe } from "./rangos.js";
import { etiquetaRol } from "./roles.js";

const mencion = (id) => `@${id.split("@")[0]}`;

// Devuelve { texto, mentions }. "user" es la fila de users de esa persona (getUser); esPropio cambia el título y el tono.
export function textoPerfil(chat, lid, user, esPropio = false) {
  const mentions = [lid];
  const lineas = [];

  const r = rangoDe(chat, lid, user);
  const rol = etiquetaRol(chat, lid);
  lineas.push(`${r.rango.emoji} ${r.rango.nombre}${rol ? ` · ${rol}` : ""} · ${r.dias === 0 ? "en el grupo desde hoy" : `${r.dias} ${r.dias === 1 ? "día" : "días"} en el grupo`}`);

  const saldo = getSaldoCoins(chat, lid);
  const puesto = puestoCoins(chat, lid);
  lineas.push(`🪙 ${saldo} UruCoins${puesto ? ` · puesto ${puesto} del grupo` : ""}`);

  const laburo = laburoDe(chat, lid);
  lineas.push(laburo ? `💼 ${laburo.oficio.emoji} ${laburo.oficio.nombre}, ${textoNivel(laburo.cobros)}` : "💼 Sin laburo (.laburos)");

  lineas.push(textoRacha(chat, lid) || "🔥 Sin racha diaria");

  const ranking = puestoRankingMensual(mesDe(), chat, lid);
  if (ranking) lineas.push(`🏆 Ranking del mes: puesto ${ranking.puesto} · ${ranking.recibidas} reacciones recibidas, ${ranking.emitidas} dadas`);

  // duelos jugados = apuestas menos devoluciones (desafíos rechazados o vencidos y empates no cuentan como jugados)
  const jugados = contarMovimientos(chat, lid, "duelo_apuesta") - contarMovimientos(chat, lid, "duelo_devolucion");
  if (jugados > 0) {
    const ganados = contarMovimientos(chat, lid, "duelo_premio");
    lineas.push(`⚔️ Duelos: ${ganados} ${ganados === 1 ? "ganado" : "ganados"} de ${jugados}`);
  }

  if (user?.couple) {
    const pareja = getUser(user.couple);
    if (pareja?.lid && pareja.couple === user.jid) {
      mentions.push(pareja.lid);
      const casados = user.married && pareja.married;
      const desde = casados ? user.marriedTime : user.coupleTime;
      const hace = desde > 0 ? `, desde hace ${duracion(Date.now() - desde)}` : "";
      lineas.push(`${casados ? "💍 Matrimonio con" : "💞 Pareja:"} ${mencion(pareja.lid)}${hace}`);
    }
  }

  const cumple = getCumple(chat, lid);
  if (cumple) lineas.push(`🎂 Cumple: ${cumple.dia} de ${MESES[cumple.mes - 1]}`);

  const mensajes = user?.inGroup?.[chat]?.messageCount;
  if (mensajes > 0) lineas.push(`💬 ${mensajes} mensajes en el grupo`);

  // el inventario ya trae la línea del laburo; acá va arriba, así que se filtra
  const items = textoInventario(chat, lid, null).split("\n").filter((l) => l && !l.startsWith("💼"));
  if (items.length) lineas.push(`🎒 ${items.join(" · ")}`);

  if (user?.apodo) lineas.push(`🏷️ Claudia ${esPropio ? "te" : "le"} dice "${user.apodo}"`);

  const titulo = esPropio ? "👤 *Tu perfil*" : `👤 *Perfil de ${mencion(lid)}*`;
  return { texto: `${titulo}\n\n${lineas.join("\n")}`, mentions };
}
