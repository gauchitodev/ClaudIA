// Compraventa: publicaciones numeradas por grupo con #vendo / #compro (o .vendo / .compro), catálogo, búsqueda,
// alertas por palabra y vencimiento con aviso. Pensado para grupos de compra y venta, pero anda en cualquiera.
import { crearPublicacion, getPublicacion, publicacionesActivas, publicacionesDe, contarPublicacionesActivas, actualizarPublicacion, publicacionesParaRevisar, agregarAlerta, quitarAlerta, alertasDe, alertasDelChat } from "../database-functions.js";
import { DIA_MS, duracion } from "./tiempo.js";

export const COMPRAVENTA = {
  DIAS_VIGENCIA: 7, // a los 7 días sin novedades el bot pregunta si sigue disponible
  DIAS_PARA_CONTESTAR: 2, // sin respuesta en ese plazo, la da de baja
  MAX_ACTIVAS_POR_PERSONA: 10,
  MAX_ALERTAS: 5,
  LARGO_LINEA: 90,
};

export const TIPOS = {
  vendo: { emoji: "🏷️", nombre: "Vendo", plural: "En venta" },
  compro: { emoji: "🔎", nombre: "Compro", plural: "Se busca" },
};
const HASHTAGS = { vendo: "vendo", venta: "vendo", vendemos: "vendo", compro: "compro", busco: "compro", necesito: "compro" };
const ESTADOS = { activa: "activa", reservada: "🔒 reservada", vendida: "✅ concretada", cerrada: "dada de baja", vencida: "⌛ vencida por falta de respuesta" };

export const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const mencion = (id) => `@${id.split("@")[0]}`;
const recortar = (t, n = COMPRAVENTA.LARGO_LINEA) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const linea = (p) => `${p.estado === "reservada" ? "🔒 " : ""}*#${p.numero}* ${recortar(p.texto)} — ${mencion(p.usuario)}`;

// ¿El mensaje trae #vendo, #compro o parecidos? → { tipo, texto sin el hashtag } o null
export function detectarPublicacion(texto) {
  const re = /(^|\s)#(vendo|venta|vendemos|compro|busco|necesito)\b/gi;
  const m = re.exec(String(texto || ""));
  if (!m) return null;
  return { tipo: HASHTAGS[m[2].toLowerCase()], texto: String(texto).replace(re, " ").replace(/\s+/g, " ").trim() };
}

// "$ 1.500", "1500 pesos", "USD 200", "U$S 200", "200 dólares", "2k" con moneda → el precio tal cual está escrito, o ""
export function detectarPrecio(texto) {
  const m = String(texto || "").match(/(?:u\$s|us\$|usd|uyu|\$)\s?\d[\d.,]*\s?(?:k|mil)?|\b\d[\d.,]*\s?(?:k|mil)?\s?(?:pesos|d[oó]lares|usd|uyu|palos|lucas)\b/i);
  return m ? m[0].trim() : "";
}

export function publicar(chat, usuario, tipo, texto, messageId = null) {
  const T = TIPOS[tipo];
  const limpio = String(texto || "").replace(/\s+/g, " ").trim();
  if (limpio.length < 3) return { ok: false, error: `¿Qué ${tipo === "vendo" ? "vendés" : "buscás"}? Poné qué es, precio y zona, por ejemplo: #${tipo} bici rodado 26, $ 4.000, Pocitos` };
  if (contarPublicacionesActivas(chat, usuario) >= COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA) {
    return { ok: false, error: `Ya tenés ${COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA} publicaciones activas. Cerrá alguna con .vendido N o .baja N (las ves con .mias).` };
  }
  const precio = detectarPrecio(limpio);
  const numero = crearPublicacion({ chat, usuario, tipo, texto: limpio, precio, messageId });
  const sinPrecio = tipo === "vendo" && !precio ? "\nOjo: no le pusiste precio. Con precio se vende más rápido." : "";
  const mensaje = `${T.emoji} *${T.nombre} #${numero}* registrada.${precio ? ` Precio: ${precio}.` : ""} Se ve con .${tipo}; cuando se concrete, .vendido ${numero}; para bajarla, .baja ${numero}.${sinPrecio}`;
  return { ok: true, numero, precio, mensaje, avisos: avisosPara(chat, usuario, numero, limpio, tipo) };
}

// Aviso para quienes tienen una alerta con una palabra que aparece en la publicación (menos quien la publicó).
export function avisosPara(chat, autor, numero, texto, tipo) {
  const t = normalizar(texto);
  const usuarios = [...new Set(alertasDelChat(chat).filter((a) => a.usuario !== autor && t.includes(normalizar(a.palabra))).map((a) => a.usuario))];
  if (!usuarios.length) return null;
  return { texto: `🔔 ${usuarios.map(mencion).join(" ")}: apareció algo que buscabas. ${TIPOS[tipo].nombre} #${numero}: ${recortar(texto)}`, mentions: usuarios };
}

// ---------- listados ----------
export function textoCatalogo(chat, tipo = null) {
  const lista = publicacionesActivas(chat, tipo);
  if (!lista.length) {
    const T = tipo ? TIPOS[tipo] : null;
    return { texto: `${T ? T.emoji : "🛒"} No hay publicaciones ${T ? `de "${T.nombre.toLowerCase()}" ` : ""}activas. Para publicar, escribí #vendo o #compro con qué es, precio y zona.`, mentions: [] };
  }
  const bloques = [];
  for (const t of tipo ? [tipo] : Object.keys(TIPOS)) {
    const del = lista.filter((p) => p.tipo === t);
    if (del.length) bloques.push(`${TIPOS[t].emoji} *${TIPOS[t].plural.toUpperCase()}* (${del.length})\n${del.map(linea).join("\n")}`);
  }
  return { texto: `${bloques.join("\n\n")}\n\nDetalle: .publicacion N · buscar: .buscar <palabra> · avisos: .avisame <palabra>`, mentions: [...new Set(lista.map((p) => p.usuario))] };
}

export function textoBusqueda(chat, consulta) {
  const palabras = normalizar(consulta).split(/\s+/).filter((w) => w.length >= 2);
  if (!palabras.length) return { texto: "¿Qué buscás? Por ejemplo: .buscar bici", mentions: [] };
  const lista = publicacionesActivas(chat, null, 500).filter((p) => palabras.every((w) => normalizar(p.texto).includes(w)));
  if (!lista.length) return { texto: `🔎 Nada activo con "${consulta.trim()}". Con .avisame ${palabras[0]} te menciono cuando aparezca.`, mentions: [] };
  return { texto: `🔎 *Resultados para "${consulta.trim()}"* (${lista.length})\n${lista.map((p) => `${TIPOS[p.tipo].emoji} ${linea(p)}`).join("\n")}`, mentions: [...new Set(lista.map((p) => p.usuario))] };
}

export function textoMias(chat, usuario) {
  const lista = publicacionesDe(chat, usuario);
  if (!lista.length) return { texto: "No tenés publicaciones activas. Para publicar, escribí #vendo o #compro con qué es, precio y zona.", mentions: [] };
  return { texto: `🗂️ *Tus publicaciones activas* (${lista.length})\n${lista.map((p) => `${TIPOS[p.tipo].emoji} ${linea(p)}`).join("\n")}\n\n.vendido N cuando se concrete · .baja N para sacarla · .reservado N si está señada · .sigue N para renovarla`, mentions: [usuario] };
}

export function textoPublicacion(chat, numero, ahora = Date.now()) {
  const p = getPublicacion(chat, numero);
  if (!p) return { texto: `No hay ninguna publicación #${numero} en este grupo.`, mentions: [] };
  const T = TIPOS[p.tipo];
  const lineas = [`${T.emoji} *${T.nombre} #${p.numero}* · ${ESTADOS[p.estado] || p.estado}`, p.texto, `${p.precio ? `Precio: ${p.precio} · ` : ""}Publicó ${mencion(p.usuario)} hace ${duracion(ahora - p.creada)}`];
  return { texto: lineas.join("\n"), mentions: [p.usuario] };
}

// ---------- estados ----------
const ACCIONES = {
  vendido: { estado: "vendida", texto: (p) => `✅ Listo, la #${p.numero} quedó como concretada. ¡Que la disfrute!` },
  baja: { estado: "cerrada", texto: (p) => `🗑️ Listo, di de baja la #${p.numero}.` },
  reservado: { estado: "reservada", texto: (p) => `🔒 La #${p.numero} quedó como reservada. Con .sigue ${p.numero} vuelve a estar libre; con .vendido ${p.numero} la cerrás.` },
  sigue: { estado: "activa", texto: (p) => `👍 La #${p.numero} sigue activa. Te vuelvo a preguntar en ${COMPRAVENTA.DIAS_VIGENCIA} días.` },
};

// Quien publicó, o un moderador, cambia el estado. "sigue" también revive una vencida o reservada.
export function cambiarEstado(chat, numero, usuario, esMod, accion, ahora = Date.now()) {
  const A = ACCIONES[accion];
  if (!A) return { ok: false, error: "Acciones: .vendido N, .baja N, .reservado N o .sigue N" };
  if (!Number.isInteger(numero)) return { ok: false, error: `¿Cuál? Poné el número, por ejemplo .${accion} 12 (las tuyas están en .mias)` };
  const p = getPublicacion(chat, numero);
  if (!p) return { ok: false, error: `No hay ninguna publicación #${numero} en este grupo.` };
  if (p.usuario !== usuario && !esMod) return { ok: false, error: `La #${numero} no es tuya: solo quien la publicó, o un moderador, puede cambiarla.` };
  if (p.estado === A.estado) return { ok: false, error: `La #${numero} ya está ${ESTADOS[p.estado]}.` };
  if ((p.estado === "vendida" || p.estado === "cerrada") && accion !== "sigue") return { ok: false, error: `La #${numero} ya está ${ESTADOS[p.estado]}. Con .sigue ${numero} la volvés a activar.` };
  actualizarPublicacion(chat, numero, { estado: A.estado, actualizada: ahora, aviso: 0 });
  return { ok: true, mensaje: A.texto(p) };
}

// ---------- alertas ----------
export function gestionarAlerta(chat, usuario, args) {
  const quitar = /^(quitar|sacar|borrar)$/i.test(args[0] || "");
  const palabra = normalizar(args.slice(quitar ? 1 : 0).join(" "));
  if (!palabra) {
    const lista = alertasDe(chat, usuario);
    return { ok: true, mensaje: lista.length ? `🔔 Tus alertas: ${lista.join(", ")}.\n.avisame <palabra> agrega, .avisame quitar <palabra> saca.` : "🔔 No tenés alertas. Con .avisame bici te menciono cuando alguien publique algo con esa palabra." };
  }
  if (quitar) return quitarAlerta(chat, usuario, palabra) ? { ok: true, mensaje: `🔕 Listo, saqué la alerta "${palabra}".` } : { ok: false, error: `No tenías una alerta "${palabra}".` };
  if (palabra.length < 3) return { ok: false, error: "La palabra tiene que tener al menos 3 letras." };
  if (alertasDe(chat, usuario).length >= COMPRAVENTA.MAX_ALERTAS) return { ok: false, error: `Ya tenés ${COMPRAVENTA.MAX_ALERTAS} alertas; sacá alguna con .avisame quitar <palabra>.` };
  if (!agregarAlerta(chat, usuario, palabra)) return { ok: false, error: `Ya tenías la alerta "${palabra}".` };
  return { ok: true, mensaje: `🔔 Listo: te menciono cuando alguien publique algo con "${palabra}".` };
}

// ---------- vencimiento (corre cada 5 minutos desde tareas-programadas.js) ----------
export async function chequearPublicaciones(ahora = Date.now(), client = globalThis.client) {
  const lista = publicacionesParaRevisar(ahora - COMPRAVENTA.DIAS_VIGENCIA * DIA_MS, ahora - COMPRAVENTA.DIAS_PARA_CONTESTAR * DIA_MS);
  let tocadas = 0;
  for (const p of lista) {
    try {
      if (p.aviso === 0) {
        actualizarPublicacion(p.chat, p.numero, { aviso: ahora });
        await client.sendMessage(p.chat, { text: `❓ ${mencion(p.usuario)}, ¿sigue en pie tu ${TIPOS[p.tipo].nombre.toLowerCase()} #${p.numero} (${recortar(p.texto, 60)})? Respondé .sigue ${p.numero} para mantenerla, o .vendido ${p.numero} / .baja ${p.numero}. Si no, en ${COMPRAVENTA.DIAS_PARA_CONTESTAR} días la doy de baja.`, mentions: [p.usuario] });
      } else {
        actualizarPublicacion(p.chat, p.numero, { estado: "vencida", actualizada: ahora });
        await client.sendMessage(p.chat, { text: `⌛ Di de baja la #${p.numero} de ${mencion(p.usuario)} por falta de respuesta. Si sigue en pie, .sigue ${p.numero} la vuelve a activar.`, mentions: [p.usuario] });
      }
      tocadas++;
    } catch (e) {
      console.error("[compraventa] no se pudo avisar:", e.message);
    }
  }
  return tocadas;
}
