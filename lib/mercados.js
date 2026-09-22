// Betting markets on real events (football, the weather, whatever): an admin opens the market with its options and
// a closing time, people bet UruCoins, and once the event has happened an admin enters the outcome.
// Payout is pari-mutuel: everything staked is split among those who got it right, in proportion to what each put in.
// The house risks nothing, it only redistributes. If nobody got it right, or the market is voided, everything is refunded.
import { crearMercado, getMercado, mercadosDeChat, actualizarMercado, apuestaEnMercado, apostarEnMercado, apuestasDeMercado, gastarCoins, ganarCoins, getSaldoCoins, crearPendiente } from "../database-functions.js";
import { protegerApuesta } from "./tienda.js";
import { COINS, apuestaMaxima } from "./urucoins.js";
import { parsearMomento, textoFecha, DIA_MS } from "./tiempo.js";

const mencion = (lid) => `@${lid.split("@")[0]}`;
const normalizar = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

// ---------- crear ----------
// text: "Título | opción 1 | opción 2 [| opción 3...] | cierre"
export function crearMercadoDesdeTexto(chat, usuario, texto) {
  const partes = String(texto || "")
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length < 4) return { ok: false, error: "Uso: .evento Título | opción 1 | opción 2 | cierre\nEj: .evento Peñarol vs Nacional | Peñarol | Empate | Nacional | 20:30" };
  const titulo = partes[0];
  const cierreTexto = partes[partes.length - 1];
  const opciones = partes.slice(1, -1);
  if (titulo.length > 80) return { ok: false, error: "El título es muy largo (máximo 80 letras)." };
  if (opciones.length > COINS.MERCADO_MAX_OPCIONES) return { ok: false, error: `Máximo ${COINS.MERCADO_MAX_OPCIONES} opciones.` };
  if (opciones.some((o) => o.length > 30)) return { ok: false, error: "Cada opción puede tener hasta 30 letras." };
  const normalizadas = opciones.map(normalizar);
  if (new Set(normalizadas).size !== normalizadas.length) return { ok: false, error: "Hay opciones repetidas." };
  if (normalizadas.includes("anulado")) return { ok: false, error: `"anulado" está reservado para cancelar el mercado.` };
  const cierraEn = parsearMomento(cierreTexto);
  if (!cierraEn) return { ok: false, error: `No entendí la hora de cierre "${cierreTexto}". Probá con 20:30, mañana 20:30, 18/09 20:30, en 2h o en 90m.` };
  if (cierraEn <= Date.now() + 60 * 1000) return { ok: false, error: "La hora de cierre tiene que ser al menos un minuto en el futuro." };
  if (cierraEn > Date.now() + 60 * DIA_MS) return { ok: false, error: "La hora de cierre no puede estar a más de 60 días." };

  const id = crearMercado(chat, titulo, opciones, cierraEn, usuario);
  // automatic closing of the betting, and voiding with refunds if nobody enters the outcome within a week
  crearPendiente(chat, usuario, "cerrar_mercado", { id }, cierraEn);
  crearPendiente(chat, usuario, "anular_mercado", { id }, cierraEn + COINS.MERCADO_DIAS_PARA_RESOLVER * DIA_MS);
  return { ok: true, id, mensaje: `${textoMercado(getMercado(id))}\n\nApostá con .jugar ${id} <opción> <cantidad>` };
}

// ---------- ver ----------
function pozos(mercado, apuestas) {
  const porOpcion = mercado.opciones.map(() => 0);
  let total = 0;
  for (const a of apuestas) {
    porOpcion[a.opcion] += a.cantidad;
    total += a.cantidad;
  }
  return { porOpcion, total };
}

export function textoMercado(mercado, apuestas = apuestasDeMercado(mercado.id)) {
  const { porOpcion, total } = pozos(mercado, apuestas);
  const estado = mercado.estado === "abierto" && Date.now() >= mercado.cierra_en ? "cerrado" : mercado.estado;
  const lineas = mercado.opciones.map((o, i) => {
    const cuota = porOpcion[i] > 0 ? ` · paga x${(total / porOpcion[i]).toFixed(2)}` : "";
    const marca = mercado.estado === "resuelto" && mercado.ganadora === i ? " 🏆" : "";
    return `${i + 1}. ${o}${marca} — ${porOpcion[i]} UruCoins${cuota}`;
  });
  const pie = { abierto: `Cierra ${textoFecha(mercado.cierra_en)}`, cerrado: "Cerrado, esperando resultado", resuelto: "Resuelto", anulado: "Anulado" }[estado] || estado;
  return `📊 *Mercado #${mercado.id}: ${mercado.titulo}*\n${lineas.join("\n")}\nPozo: ${total} UruCoins (${apuestas.length} ${apuestas.length === 1 ? "apuesta" : "apuestas"}) · ${pie}`;
}

export function textoListaMercados(chat) {
  const lista = mercadosDeChat(chat, ["abierto", "cerrado"]);
  if (lista.length === 0) return "No hay mercados abiertos. Un admin puede crear uno con .evento Título | opción 1 | opción 2 | cierre";
  return lista.map((m) => textoMercado(m)).join("\n\n");
}

// ---------- apostar ----------
function buscarOpcion(mercado, texto) {
  const t = normalizar(texto);
  if (!t) return -1;
  if (/^\d+$/.test(t)) {
    const i = Number(t) - 1;
    return i >= 0 && i < mercado.opciones.length ? i : -1;
  }
  const norm = mercado.opciones.map(normalizar);
  const exacta = norm.indexOf(t);
  if (exacta >= 0) return exacta;
  const candidatas = norm.map((o, i) => (o.includes(t) ? i : -1)).filter((i) => i >= 0);
  return candidatas.length === 1 ? candidatas[0] : -1;
}

const listaOpciones = (mercado) => mercado.opciones.map((o, i) => `${i + 1}. ${o}`).join(" · ");

export function jugar(chat, usuario, id, textoOpcion, cantidad) {
  const mercado = getMercado(id);
  if (!mercado || mercado.chat !== chat) return { ok: false, error: `No hay ningún mercado #${id} en este grupo. Mirá los abiertos con .mercados` };
  if (mercado.estado !== "abierto" || Date.now() >= mercado.cierra_en) return { ok: false, error: `Las apuestas del mercado #${id} ya cerraron.` };
  if (!Number.isInteger(cantidad) || cantidad < COINS.APUESTA_MIN) return { ok: false, error: `La apuesta mínima es ${COINS.APUESTA_MIN} UruCoins.` };
  const opcion = buscarOpcion(mercado, textoOpcion);
  if (opcion < 0) return { ok: false, error: `¿A qué le jugás? Opciones: ${listaOpciones(mercado)}` };
  const previa = apuestaEnMercado(id, usuario);
  if (previa && previa.opcion !== opcion) return { ok: false, error: `Ya le jugaste a "${mercado.opciones[previa.opcion]}" en este mercado. No se puede cambiar de bando, pero podés sumar más a esa opción.` };
  const yaPuesto = previa?.cantidad || 0;
  const maximo = apuestaMaxima(chat, usuario, COINS.MERCADO_APUESTA_MAX);
  if (yaPuesto + cantidad > maximo) return { ok: false, error: `Máximo ${maximo} UruCoins por persona en cada mercado (ya tenés ${yaPuesto}).` };
  if (!gastarCoins(chat, usuario, cantidad, `mercado_apuesta_${id}`)) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, usuario)} UruCoins.` };
  apostarEnMercado(id, usuario, opcion, cantidad);
  return {
    ok: true,
    mensaje: `📊 Le jugaste ${cantidad} UruCoins a *${mercado.opciones[opcion]}* en el mercado #${id}${yaPuesto ? ` (llevás ${yaPuesto + cantidad})` : ""}. Te quedan ${getSaldoCoins(chat, usuario)}. Cierra ${textoFecha(mercado.cierra_en)}.`,
  };
}

// ---------- resolver / anular ----------
function devolverTodo(mercado, apuestas) {
  for (const a of apuestas) ganarCoins(mercado.chat, a.usuario, a.cantidad, `mercado_devolucion_${mercado.id}`);
}

const textoAnulado = (mercado, apuestas, motivo) => ({
  texto: `📊 *Mercado #${mercado.id} anulado: ${mercado.titulo}*\n${motivo} Se devolvieron ${apuestas.reduce((s, a) => s + a.cantidad, 0)} UruCoins a ${apuestas.length} ${apuestas.length === 1 ? "persona" : "personas"}.`,
  mentions: apuestas.map((a) => a.usuario),
});

export function resolver(chat, usuario, id, textoOpcion, { esOwner = false } = {}) {
  const mercado = getMercado(id);
  if (!mercado || mercado.chat !== chat) return { ok: false, error: `No hay ningún mercado #${id} en este grupo.` };
  if (mercado.estado === "resuelto" || mercado.estado === "anulado") return { ok: false, error: `El mercado #${id} ya está ${mercado.estado}.` };
  const apuestas = apuestasDeMercado(id);
  if (!esOwner && apuestas.some((a) => a.usuario === usuario)) return { ok: false, error: "Apostaste en este mercado, así que no podés resolverlo vos. Que lo resuelva otro admin que no haya apostado, o el dueño del bot." };

  if (normalizar(textoOpcion) === "anulado") {
    devolverTodo(mercado, apuestas);
    actualizarMercado(id, { estado: "anulado" });
    return { ok: true, ...textoAnulado(mercado, apuestas, "Lo anuló un admin.") };
  }
  if (Date.now() < mercado.cierra_en) return { ok: false, error: `Las apuestas siguen abiertas hasta ${textoFecha(mercado.cierra_en)}. Si el evento se suspendió, anulalo con .resolver ${id} anulado.` };
  const ganadora = buscarOpcion(mercado, textoOpcion);
  if (ganadora < 0) return { ok: false, error: `¿Cuál ganó? Opciones: ${listaOpciones(mercado)}, o "anulado" para devolver todo.` };

  const { porOpcion, total } = pozos(mercado, apuestas);
  const pozoGanador = porOpcion[ganadora];
  actualizarMercado(id, { estado: "resuelto", ganadora });
  const cabecera = `📊 *Mercado #${id} resuelto: ${mercado.titulo}*\nGanó: *${mercado.opciones[ganadora]}* · Pozo: ${total} UruCoins`;
  if (apuestas.length === 0) return { ok: true, texto: `${cabecera}\nNadie había apostado.`, mentions: [] };
  if (pozoGanador === 0) {
    devolverTodo(mercado, apuestas);
    return { ok: true, texto: `${cabecera}\nNadie le había jugado a esa opción: se devuelve lo apostado a todos.`, mentions: apuestas.map((a) => a.usuario) };
  }
  const lineas = [];
  const mentions = [];
  let perdidas = 0;
  let coinsPerdidas = 0;
  for (const a of apuestas) {
    if (a.opcion === ganadora) {
      // proportional split: what they put in over the winning pool, times the total pot (rounded down)
      const premio = Math.floor((a.cantidad * total) / pozoGanador);
      ganarCoins(mercado.chat, a.usuario, premio, `mercado_premio_${id}`);
      lineas.push(`🏆 ${mencion(a.usuario)} apostó ${a.cantidad} y cobra *${premio}*`);
      mentions.push(a.usuario);
    } else if (protegerApuesta(mercado.chat, a.usuario, a.cantidad, "escudo_mercado")) {
      lineas.push(`🛡️ ${mencion(a.usuario)} apostó ${a.cantidad} y su escudo se lo devuelve`);
      mentions.push(a.usuario);
    } else {
      perdidas++;
      coinsPerdidas += a.cantidad;
    }
  }
  if (perdidas > 0) lineas.push(`💸 ${perdidas === 1 ? "1 apuesta perdida" : `${perdidas} apuestas perdidas`} (${coinsPerdidas} UruCoins)`);
  return { ok: true, texto: `${cabecera}\n${lineas.join("\n")}`, mentions };
}

// Called by the pending-work processor at closing time. Returns the announcement, or null if it no longer applies.
export function cerrarMercadoPorTiempo(id) {
  const mercado = getMercado(id);
  if (!mercado || mercado.estado !== "abierto") return null;
  actualizarMercado(id, { estado: "cerrado" });
  const apuestas = apuestasDeMercado(id);
  return { texto: `${textoMercado({ ...mercado, estado: "cerrado" }, apuestas)}\n\nCerraron las apuestas. Cuando se sepa el resultado, un admin lo carga con .resolver ${id} <opción>`, mentions: [] };
}

// Called by the pending-work processor a week after closing: if nobody entered the outcome, everything is refunded.
export function anularMercadoVencido(id) {
  const mercado = getMercado(id);
  if (!mercado || (mercado.estado !== "abierto" && mercado.estado !== "cerrado")) return null;
  const apuestas = apuestasDeMercado(id);
  devolverTodo(mercado, apuestas);
  actualizarMercado(id, { estado: "anulado" });
  return textoAnulado(mercado, apuestas, `Pasó una semana del cierre y ningún admin cargó el resultado.`);
}
