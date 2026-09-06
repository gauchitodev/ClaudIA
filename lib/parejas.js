// Parejas, pedidos y casamientos. Una pareja es una fila en la tabla parejas; un pedido sin responder es una fila en
// solicitudes_pareja y vence solo; una relación terminada queda en exparejas. Toda la lógica pasa por acá y devuelve
// { ok, motivo }: los plugins solo eligen el texto. Las personas se identifican por lid, como en las menciones.
import { getUser, parejaDe as parejaEnBase, crearPareja, actualizarPareja, borrarPareja, listaParejas as listaEnBase, guardarSolicitudPareja, getSolicitudPareja, borrarSolicitudPareja, borrarSolicitudesCon, guardarExPareja, exParejasDe as exEnBase } from "../database-functions.js";
import { DIA_MS, parsearDuracion } from "./tiempo.js";

export const PAREJAS = {
  DIAS_SOLICITUD: 7, // un pedido sin respuesta vence a la semana
  DIAS_PARA_CASARSE: 7,
};

export const parejaDe = (lid) => parejaEnBase(lid);
export const sonPareja = (a, b) => parejaDe(a)?.pareja === b;

// el pedido pendiente que hizo esta persona, si no venció
export function solicitudDe(de, ahora = Date.now()) {
  const s = getSolicitudPareja(de);
  if (!s) return null;
  if (ahora - s.fecha > PAREJAS.DIAS_SOLICITUD * DIA_MS) {
    borrarSolicitudPareja(de);
    return null;
  }
  return s;
}
const solicitudPendiente = (de, para, ahora) => {
  const s = solicitudDe(de, ahora);
  return s && s.para === para ? s : null;
};
export const cancelarSolicitud = (de) => borrarSolicitudPareja(de);

function formar(a, b, desde) {
  borrarSolicitudesCon(a);
  borrarSolicitudesCon(b);
  return crearPareja(a, b, desde);
}

// .pareja @x
export function pedirPareja(de, para, chat = "", ahora = Date.now()) {
  if (de === para) return { ok: false, motivo: "mismo" };
  const mia = parejaDe(de);
  if (mia?.pareja === para) return { ok: false, motivo: "yaJuntos" };
  if (mia) return { ok: false, motivo: "vosTenesPareja", pareja: mia.pareja };
  const suya = parejaDe(para);
  if (suya) return { ok: false, motivo: "tienePareja", pareja: suya.pareja };
  if (solicitudPendiente(para, de, ahora)) return { ok: false, motivo: "teLoPidio" };
  guardarSolicitudPareja(de, para, chat, ahora);
  return { ok: true };
}

// .aceptar @x: x tiene que haber pedido, y ninguno de los dos puede estar en otra pareja
export function aceptarPareja(quien, de, ahora = Date.now()) {
  if (quien === de) return { ok: false, motivo: "mismo" };
  const mia = parejaDe(quien);
  if (mia?.pareja === de) return { ok: false, motivo: "yaJuntos" };
  if (!solicitudPendiente(de, quien, ahora)) return { ok: false, motivo: "sinSolicitud" };
  if (mia) return { ok: false, motivo: "tenesPareja", pareja: mia.pareja };
  const suya = parejaDe(de);
  if (suya) {
    borrarSolicitudPareja(de);
    return { ok: false, motivo: "tienePareja", pareja: suya.pareja };
  }
  formar(quien, de, ahora);
  return { ok: true };
}

// .rechazar @x
export function rechazarPareja(quien, de, ahora = Date.now()) {
  if (parejaDe(quien)?.pareja === de) return { ok: false, motivo: "yaJuntos" };
  if (!solicitudPendiente(de, quien, ahora)) return { ok: false, motivo: "sinSolicitud" };
  borrarSolicitudPareja(de);
  return { ok: true };
}

// .terminar: la relación pasa a las ex de los dos
export function terminarPareja(lid, ahora = Date.now()) {
  const p = parejaDe(lid);
  if (!p) return { ok: false, motivo: "sinPareja" };
  guardarExPareja(lid, p.pareja, p.desde, ahora);
  borrarPareja(p.id);
  return { ok: true, pareja: p.pareja, casados: p.casadosDesde > 0 };
}

// ex de una persona, sin contar a la pareja actual si volvieron
export function exParejasDe(lid) {
  const actual = parejaDe(lid)?.pareja;
  return exEnBase(lid).filter((x) => x !== actual);
}

// .casarse: solo con pareja de al menos una semana
export function proponerCasamiento(lid, ahora = Date.now()) {
  const p = parejaDe(lid);
  if (!p) return { ok: false, motivo: "sinPareja" };
  if (p.casadosDesde > 0) return { ok: false, motivo: "yaCasados" };
  if (ahora - p.desde < PAREJAS.DIAS_PARA_CASARSE * DIA_MS) return { ok: false, motivo: "pocoTiempo" };
  if (p.propusoCasamiento === p.pareja) return { ok: false, motivo: "yaTePropuso" };
  actualizarPareja(p.id, { propuso_casamiento: lid });
  return { ok: true, pareja: p.pareja };
}

// .si / .no a la propuesta de casamiento de la pareja
export function responderCasamiento(lid, acepta, ahora = Date.now()) {
  const p = parejaDe(lid);
  if (!p) return { ok: false, motivo: "sinPareja" };
  if (p.casadosDesde > 0) return { ok: false, motivo: "yaCasados" };
  if (p.propusoCasamiento !== p.pareja) return { ok: false, motivo: "sinPropuesta" };
  actualizarPareja(p.id, acepta ? { propuso_casamiento: "", casados_desde: ahora } : { propuso_casamiento: "" });
  return { ok: true, pareja: p.pareja };
}

// Para el owner: arma la pareja de una, terminando las que tuvieran con otras personas.
export function fijarPareja(a, b, desde = Date.now()) {
  if (a === b) return { ok: false, motivo: "mismo" };
  const actual = parejaDe(a);
  if (actual?.pareja === b) {
    actualizarPareja(actual.id, { desde });
    return { ok: true };
  }
  for (const lid of [a, b]) if (parejaDe(lid)) terminarPareja(lid);
  formar(a, b, desde);
  return { ok: true };
}

export function fijarCasamiento(a, b, desde = Date.now()) {
  const p = parejaDe(a);
  if (!p || p.pareja !== b) return { ok: false, motivo: "noSonPareja" };
  actualizarPareja(p.id, { casados_desde: desde, propuso_casamiento: "" });
  return { ok: true };
}

export const listaParejas = () => listaEnBase();

// ---- ayudas para los comandos del owner ----
export const AVISO_DOS_PERSONAS = "❌ No se pudieron obtener los dos usuarios.\n\nPuede que:\n• No hayas mencionado correctamente a ambos.\n• Uno de los usuarios no exista en la base de datos.\n• Alguno aún no haya hablado con el bot.\n\nEjemplo válido:\n+59899999999 +59898888888";

// Dos personas por mención, por "@número" escrito o por dos teléfonos con +. Devuelve [lid, lid] o null.
export function dosPersonas(m, text) {
  const texto = String(text || "");
  let lids = (m?.mentionedJid || []).map((j) => (j.endsWith("@lid") ? j : getUser(j)?.lid)).filter(Boolean);
  if (lids.length < 2) lids = [...texto.matchAll(/@(\d{3,})/g)].map((x) => `${x[1]}@lid`);
  if (lids.length < 2) lids = [...texto.matchAll(/\+\d[\d\s]*/g)].map((x) => getUser(`${x[0].replace(/[+\s]/g, "")}@s.whatsapp.net`)?.lid).filter(Boolean);
  lids = lids.slice(0, 2);
  if (lids.length < 2 || lids[0] === lids[1] || !getUser(lids[0]) || !getUser(lids[1])) return null;
  return lids;
}

// ".setpareja @a @b | 3 días": cuánto tiempo llevan. Sin "|" es un segundo; con un tiempo que no se entiende, null.
export function tiempoIndicado(text) {
  const partes = String(text || "").split("|");
  if (partes.length < 2) return 1000;
  const ms = parsearDuracion(partes[1]);
  return ms > 0 ? ms : null;
}
