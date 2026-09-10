// Tienda de UruCoins: catálogo de ítems, compra, y consumo de cada efecto.
import { gastarCoins, ganarCoins, getSaldoCoins, getItem, getInventario, agregarItem, consumirItem, borrarItem, updateUser } from "../database-functions.js";
import { etiquetaLaburo } from "./laburos.js";

const DIA_MS = 24 * 60 * 60 * 1000;

// Catálogo. "max" = cuántos se pueden tener guardados a la vez (evita apostar sin riesgo con 10 escudos).
export const ITEMS = {
  escudo: {
    nombre: "Escudo",
    emoji: "🛡️",
    precio: 25,
    max: 1,
    reintegro: 25, // devuelve hasta esto; más que el precio haría que apostar con escudo tenga esperanza positiva (con un pleno, sobre todo)
    desc: "Si perdés una apuesta (ruleta, tragamonedas, carrera, blackjack, duelos, mercados o .apostar), te devuelve lo apostado, hasta 25. Se usa solo, una vez.",
  },
  racha: {
    nombre: "Racha doble",
    emoji: "🔥",
    precio: 40,
    max: 1,
    desc: "24 horas ganando el doble por reacciones y por ganar juegos.",
  },
  votodoble: {
    nombre: "Voto doble",
    emoji: "✌️",
    precio: 15,
    max: 3,
    desc: "Tu próxima reacción a una historia, queja o recomendación vale por dos.",
  },
  apodo: {
    nombre: "Apodo",
    emoji: "🏷️",
    precio: 30,
    desc: "Claudia te llama como vos quieras. Ej: .comprar apodo Tito",
  },
};

// Acepta "voto doble", "Voto-Doble", "escudo", "rachadoble", etc.
export function buscarItem(texto) {
  const k = String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
  if (!k) return null;
  if (ITEMS[k]) return k;
  if (k === "voto" || k === "votodoble" || k === "doblevoto") return "votodoble";
  if (k === "rachadoble" || k === "doble") return "racha";
  if (k === "nombre" || k === "nick") return "apodo";
  return null;
}

// ---------- Compra ----------
// Devuelve { ok: true, mensaje } o { ok: false, error }.
export function comprar(chat, usuario, clave, argumento = "") {
  const item = ITEMS[clave];
  if (!item) return { ok: false, error: "Ese ítem no existe. Mirá la lista con .tienda" };

  // --- Apodo: se guarda en la ficha de la persona, no en el inventario ---
  if (clave === "apodo") {
    const apodo = String(argumento || "").replace(/\s+/g, " ").trim();
    if (!apodo) return { ok: false, error: "Decime el apodo: .comprar apodo Tito" };
    if (apodo.length < 2 || apodo.length > 20) return { ok: false, error: "El apodo tiene que tener entre 2 y 20 letras." };
    if (/[@\n]/.test(apodo)) return { ok: false, error: "El apodo no puede tener @ ni saltos de línea." };
    if (!gastarCoins(chat, usuario, item.precio, "compra_apodo")) {
      return { ok: false, error: `No te alcanza — cuesta ${item.precio} y tenés ${getSaldoCoins(chat, usuario)} UruCoins.` };
    }
    updateUser(usuario, { apodo });
    return { ok: true, mensaje: `${item.emoji} Listo, de ahora en más Claudia te dice *${apodo}*. Te quedan ${getSaldoCoins(chat, usuario)} UruCoins.` };
  }

  // --- Racha: no se acumula ni se renueva mientras está activa ---
  if (clave === "racha" && rachaActiva(chat, usuario)) {
    return { ok: false, error: `Ya tenés una racha activa hasta las ${horaVencimientoRacha(chat, usuario)}. Comprá otra cuando termine.` };
  }

  const actual = getItem(chat, usuario, clave)?.cantidad || 0;
  if (item.max && actual >= item.max) {
    return { ok: false, error: item.max === 1 ? `Ya tenés un ${item.nombre.toLowerCase()} guardado. Usalo antes de comprar otro.` : `Podés tener como máximo ${item.max} de ${item.nombre.toLowerCase()}.` };
  }

  if (!gastarCoins(chat, usuario, item.precio, `compra_${clave}`)) {
    return { ok: false, error: `No te alcanza — cuesta ${item.precio} y tenés ${getSaldoCoins(chat, usuario)} UruCoins.` };
  }

  if (clave === "racha") {
    agregarItem(chat, usuario, "racha", 1, String(Date.now() + DIA_MS));
    return { ok: true, mensaje: `${item.emoji} Racha doble activada hasta las ${horaVencimientoRacha(chat, usuario)}. Te quedan ${getSaldoCoins(chat, usuario)} UruCoins.` };
  }

  agregarItem(chat, usuario, clave, 1);
  return { ok: true, mensaje: `${item.emoji} Compraste *${item.nombre}*. Te quedan ${getSaldoCoins(chat, usuario)} UruCoins.` };
}

// ---------- Efectos ----------

// ¿tiene una racha doble vigente? (si venció, la limpia)
export function rachaActiva(chat, usuario) {
  const row = getItem(chat, usuario, "racha");
  if (!row) return false;
  if (Date.now() > Number(row.extra || 0)) {
    borrarItem(chat, usuario, "racha");
    return false;
  }
  return true;
}

// x2 si tiene racha, x1 si no
export function multiplicador(chat, usuario) {
  return rachaActiva(chat, usuario) ? 2 : 1;
}

function horaVencimientoRacha(chat, usuario) {
  const row = getItem(chat, usuario, "racha");
  if (!row) return "";
  const fecha = new Date(Number(row.extra));
  const hoy = new Date().toDateString() === fecha.toDateString();
  const hora = fecha.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });
  return hoy ? hora : `${hora} de mañana`;
}

// consume un escudo si hay; true si se usó
export function usarEscudo(chat, usuario) {
  return consumirItem(chat, usuario, "escudo");
}

// Al perder una apuesta: si la persona tiene escudo, lo consume y le devuelve lo apostado, hasta el tope del ítem.
// Devuelve lo devuelto, 0 si no tenía. Lo llaman todos los juegos con apuesta al liquidar una pérdida.
export function protegerApuesta(chat, usuario, cantidad, motivo = "escudo_devolucion") {
  if (!(cantidad > 0) || !usarEscudo(chat, usuario)) return 0;
  const devuelto = Math.min(cantidad, ITEMS.escudo.reintegro);
  ganarCoins(chat, usuario, devuelto, motivo);
  return devuelto;
}

// consume un voto doble si hay; true si se usó
export function usarVotoDoble(chat, usuario) {
  return consumirItem(chat, usuario, "votodoble");
}

// ---------- Textos ----------

export function textoTienda() {
  const lineas = Object.entries(ITEMS).map(([clave, it]) => `${it.emoji} *${it.nombre}* — ${it.precio} coins\n${it.desc}\n▸ .comprar ${clave}`);
  return `🛒 *TIENDA DE URUCOINS*\n\n${lineas.join("\n\n")}\n\nVer lo tuyo: .inventario`;
}

// resumen corto de lo que tiene una persona (para .inventario). "" si no tiene nada.
export function textoInventario(chat, usuario, user = null) {
  rachaActiva(chat, usuario); // limpia la racha si venció
  const partes = getInventario(chat, usuario)
    .filter((r) => ITEMS[r.item])
    .map((r) => {
      const it = ITEMS[r.item];
      if (r.item === "racha") return `${it.emoji} Racha doble (hasta las ${horaVencimientoRacha(chat, usuario)})`;
      return `${it.emoji} ${it.nombre}${r.cantidad > 1 ? ` x${r.cantidad}` : ""}`;
    });
  if (user?.apodo) partes.push(`🏷️ Apodo: ${user.apodo}`);
  const laburo = etiquetaLaburo(chat, usuario);
  if (laburo) partes.push(`💼 Laburo: ${laburo}`);
  return partes.join("\n");
}
