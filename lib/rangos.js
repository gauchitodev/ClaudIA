// Rangos por antigüedad y actividad, como los rangos de un server: suben solos. Cada rango pide días en el grupo
// (desde la primera vez que el bot vio a la persona ahí) y mensajes mandados, y hay que cumplir los dos: así ni un
// recién llegado sube a fuerza de spam ni alguien que no escribe sube por viejo. Al subir, el bot lo anuncia en el
// grupo y da un premio chico. El rango guardado va en users.inGroup[chat].rango; la antigüedad en .desde.
import { updateUser, ganarCoins, primeraActividad } from "../database-functions.js";
import { DIA_MS } from "./tiempo.js";

export const RANGOS = [
  { clave: "nuevo", nombre: "Nuevo", emoji: "🌱", dias: 0, mensajes: 0, premio: 0 },
  { clave: "habitue", nombre: "Habitué", emoji: "🧉", dias: 7, mensajes: 100, premio: 10 },
  { clave: "delacasa", nombre: "De la casa", emoji: "🪑", dias: 30, mensajes: 500, premio: 25 },
  { clave: "veterano", nombre: "Veterano", emoji: "🎖️", dias: 90, mensajes: 2000, premio: 50 },
  { clave: "leyenda", nombre: "Leyenda", emoji: "👑", dias: 365, mensajes: 10000, premio: 100 },
];

const indice = (clave) => Math.max(0, RANGOS.findIndex((r) => r.clave === clave));
const mencion = (id) => `@${id.split("@")[0]}`;

function guardarEnGrupo(chat, usuario, user, datos) {
  if (!user) return;
  if (!user.inGroup) user.inGroup = {};
  user.inGroup[chat] = { ...(user.inGroup[chat] || {}), ...datos };
  updateUser(usuario, { inGroup: JSON.stringify(user.inGroup) });
}

// Desde cuándo el bot conoce a la persona en el grupo (ms). Las entradas anteriores a los rangos no lo tienen: se toma
// el primer día con actividad registrada (o hoy, si no hay) y queda guardado para que no cambie.
export function desdeCuando(chat, usuario, user) {
  const guardado = user?.inGroup?.[chat]?.desde;
  if (guardado > 0) return guardado;
  const primera = primeraActividad(chat, usuario);
  let desde = Date.now();
  if (primera) {
    const [a, m, d] = primera.split("-").map(Number);
    desde = new Date(a, m - 1, d, 12).getTime();
  }
  guardarEnGrupo(chat, usuario, user, { desde });
  return desde;
}

export const diasEnGrupo = (chat, usuario, user, ahora = Date.now()) => Math.max(0, Math.floor((ahora - desdeCuando(chat, usuario, user)) / DIA_MS));
export const mensajesEn = (chat, user) => user?.inGroup?.[chat]?.messageCount || 0;

// El rango más alto cuyos dos requisitos se cumplen.
export function rangoPara(dias, mensajes) {
  let rango = RANGOS[0];
  for (const r of RANGOS) if (dias >= r.dias && mensajes >= r.mensajes) rango = r;
  return rango;
}

// { rango, dias, mensajes, siguiente, faltanDias, faltanMensajes }
export function rangoDe(chat, usuario, user, ahora = Date.now()) {
  const dias = diasEnGrupo(chat, usuario, user, ahora);
  const mensajes = mensajesEn(chat, user);
  const rango = rangoPara(dias, mensajes);
  const siguiente = RANGOS[indice(rango.clave) + 1] || null;
  return {
    rango,
    dias,
    mensajes,
    siguiente,
    faltanDias: siguiente ? Math.max(0, siguiente.dias - dias) : 0,
    faltanMensajes: siguiente ? Math.max(0, siguiente.mensajes - mensajes) : 0,
  };
}

export const etiquetaRango = (chat, usuario, user) => {
  const { rango } = rangoDe(chat, usuario, user);
  return `${rango.emoji} ${rango.nombre}`;
};

// Se llama en cada mensaje. La primera vez guarda el rango actual sin avisar (para no anunciar ascensos viejos al
// estrenar la función); después, si subió, lo guarda, paga el premio y devuelve el aviso para el grupo.
// "pagar" en false (economía apagada) sube el rango y lo avisa, pero sin premio.
export function chequearAscenso(chat, usuario, user, ahora = Date.now(), { pagar = true } = {}) {
  if (!user) return null;
  const { rango } = rangoDe(chat, usuario, user, ahora);
  const guardado = user.inGroup?.[chat]?.rango;
  if (!guardado || indice(rango.clave) <= indice(guardado)) {
    if (guardado !== rango.clave) guardarEnGrupo(chat, usuario, user, { rango: rango.clave });
    return null;
  }
  guardarEnGrupo(chat, usuario, user, { rango: rango.clave });
  const conPremio = pagar && rango.premio > 0;
  if (conPremio) ganarCoins(chat, usuario, rango.premio, "rango_ascenso");
  const requisitos = `${rango.dias} ${rango.dias === 1 ? "día" : "días"} en el grupo y ${rango.mensajes} mensajes`;
  const premio = conPremio ? ` +${rango.premio} UruCoins.` : "";
  return { texto: `${rango.emoji} ${mencion(usuario)} subió a *${rango.nombre}* (${requisitos}).${premio}`, mentions: [usuario] };
}

// ---------- textos ----------
export function textoRango(chat, usuario, user, esPropio = false) {
  const r = rangoDe(chat, usuario, user);
  const titulo = esPropio ? "🎖️ *Tu rango:*" : `🎖️ *Rango de ${mencion(usuario)}:*`;
  const lineas = [`${titulo} ${r.rango.emoji} *${r.rango.nombre}*`, `${r.dias} ${r.dias === 1 ? "día" : "días"} en el grupo · ${r.mensajes} ${r.mensajes === 1 ? "mensaje" : "mensajes"}`];
  if (r.siguiente) {
    const faltan = [];
    if (r.faltanDias > 0) faltan.push(`${r.faltanDias} ${r.faltanDias === 1 ? "día" : "días"}`);
    if (r.faltanMensajes > 0) faltan.push(`${r.faltanMensajes} ${r.faltanMensajes === 1 ? "mensaje" : "mensajes"}`);
    lineas.push(`Siguiente: ${r.siguiente.emoji} ${r.siguiente.nombre}, ${faltan.length ? `faltan ${faltan.join(" y ")}` : "ya casi"}.`);
  } else {
    lineas.push("Es el rango máximo. No hay más que subir, solo mantenerse.");
  }
  return { texto: lineas.join("\n"), mentions: [usuario] };
}

export function textoRangos() {
  const lineas = RANGOS.map((r) => {
    const pide = r.dias === 0 && r.mensajes === 0 ? "desde que llegás" : `${r.dias} días y ${r.mensajes} mensajes`;
    return `${r.emoji} *${r.nombre}* — ${pide}${r.premio > 0 ? ` (+${r.premio} coins al subir)` : ""}`;
  });
  return `🎖️ *RANGOS DEL GRUPO*\nSuben solos con días en el grupo (desde que el bot te vio por primera vez acá) y mensajes mandados; hay que cumplir los dos.\n\n${lineas.join("\n")}\n\nTu rango: .rango · el de otra persona: .rango @alguien`;
}
