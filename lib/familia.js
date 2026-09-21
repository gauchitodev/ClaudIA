// Families: a married couple adopts people and the tree follows from that. Only who is whose child (with both
// parents) and each person's surname are stored; siblings, grandparents, grandchildren, uncles, cousins, nephews,
// in-laws and parents-in-law are all derived on the fly. Like couples, families are global, not per group. All the
// logic returns { ok, motivo } and the plugins pick the wording. People are identified by lid.
import { parejaDe, padresDe as padresEnBase, hijosDe as hijosEnBase, crearAdopcion, borrarAdopcion, adopcionesDesde, guardarSolicitudAdopcion, getSolicitudAdopcion, getSolicitudAdopcionDe, borrarSolicitudAdopcion, getApellido, setApellido, listaApellidos, gastarCoins, ganarCoins } from "../database-functions.js";
import { monedasActivas } from "./urucoins.js";
import { nombreDe } from "./menciones.js";
import { DIA_MS } from "./tiempo.js";

export const FAMILIA = {
  COSTO_ADOPCION: 30, // UruCoins from the adopter, in the group where they ask (a sink, like nicknames). Refunded on refusal.
  MAX_HIJOS: 4, // per person
  ADOPCIONES_POR_DIA: 1, // per adopting person
  DIAS_SOLICITUD: 7, // an unanswered request expires after a week, no refund: the paperwork was paid for anyway
  APELLIDO_MAX: 20,
};

// ---- basic reads ----
export const padresDe = (lid) => {
  const p = padresEnBase(lid);
  return p ? [p.padre_a, p.padre_b] : null;
};
export const hijosDe = (lid) => hijosEnBase(lid).map((h) => h.hijo);
export const apellidoDe = (lid) => getApellido(lid);
const conyugeDe = (lid) => parejaDe(lid)?.pareja || null; // partner, married or not
const casadoCon = (lid) => {
  const p = parejaDe(lid);
  return p && p.casadosDesde > 0 ? p.pareja : null;
};
const unicos = (lista) => [...new Set(lista)];

export function ancestrosDe(lid) {
  const vistos = new Set();
  const cola = [lid];
  while (cola.length) {
    for (const p of padresDe(cola.shift()) || []) {
      if (vistos.has(p)) continue;
      vistos.add(p);
      cola.push(p);
    }
  }
  return vistos;
}

// ---- parentescos ----
// Everything comes from "parents of" and "children of": siblings are my parents' other children (half-siblings
// included), uncles my parents' siblings, cousins my uncles' children, in-laws my partner's siblings and my
// siblings' partners, parents-in-law my partner's parents.
export function parientesDe(lid) {
  const padres = padresDe(lid) || [];
  const hijos = hijosDe(lid);
  const hermanos = unicos(padres.flatMap(hijosDe)).filter((x) => x !== lid);
  const abuelos = unicos(padres.flatMap((p) => padresDe(p) || []));
  const nietos = unicos(hijos.flatMap(hijosDe));
  const tios = unicos(abuelos.flatMap(hijosDe)).filter((x) => !padres.includes(x));
  const primos = unicos(tios.flatMap(hijosDe)).filter((x) => x !== lid && !hermanos.includes(x));
  const sobrinos = unicos(hermanos.flatMap(hijosDe));
  const conyuge = conyugeDe(lid);
  const suegros = conyuge ? padresDe(conyuge) || [] : [];
  const cunados = unicos([...(conyuge ? suegros.flatMap(hijosDe).filter((x) => x !== conyuge) : []), ...hermanos.map(conyugeDe).filter(Boolean)]).filter((x) => x !== lid);
  return { conyuge, padres, hijos, hermanos, abuelos, nietos, tios, primos, sobrinos, suegros, cunados };
}

// Close relatives, with how to name them from the person's point of view. In-laws don't count: there's no blood
// between them.
const RELACIONES = [
  ["padres", "tu padre o madre"],
  ["hijos", "tu hijo/a"],
  ["hermanos", "tu hermano/a"],
  ["abuelos", "tu abuelo/a"],
  ["nietos", "tu nieto/a"],
  ["tios", "tu tío/a"],
  ["sobrinos", "tu sobrino/a"],
  ["primos", "tu primo/a"],
];

// "tu hermano/a" if b is a close relative of a; null otherwise. Couples and kisses use it to block incest.
export function parentescoDe(a, b) {
  if (!a || !b || a === b) return null;
  const r = parientesDe(a);
  for (const [clave, nombre] of RELACIONES) if (r[clave].includes(b)) return nombre;
  return null;
}

// ---- adoption ----
function solicitudVigente(s, ahora) {
  if (!s) return null;
  if (ahora - s.fecha > FAMILIA.DIAS_SOLICITUD * DIA_MS) {
    borrarSolicitudAdopcion(s.hijo);
    return null;
  }
  return s;
}
export const solicitudAdopcionDe = (hijo, ahora = Date.now()) => solicitudVigente(getSolicitudAdopcion(hijo), ahora);
const solicitudPendienteDelPadre = (padre, ahora) => solicitudVigente(getSolicitudAdopcionDe(padre), ahora);
const devolverCosto = (s) => s.costo > 0 && ganarCoins(s.chat, s.padre_a, s.costo, "adopcion_devolucion");

// .adoptar @x, by someone married: x can't already have parents, nor be an ancestor or close relative of the couple
// (nor be partnered with one), and each person has a cap on children and one adoption a day. The fee is charged on request.
export function pedirAdopcion(chat, de, hijo, ahora = Date.now()) {
  if (de === hijo) return { ok: false, motivo: "mismo" };
  const conyuge = casadoCon(de);
  if (!conyuge) return { ok: false, motivo: "sinCasar" };
  if (hijo === conyuge) return { ok: false, motivo: "esTuPareja" };
  const padres = padresDe(hijo);
  if (padres) return { ok: false, motivo: "tienePadres", padres };
  if (ancestrosDe(de).has(hijo) || ancestrosDe(conyuge).has(hijo)) return { ok: false, motivo: "antepasado" };
  const parentesco = parentescoDe(de, hijo) || parentescoDe(conyuge, hijo);
  if (parentesco) return { ok: false, motivo: "pariente", parentesco };
  const suPareja = conyugeDe(hijo);
  const parentescoPolitico = suPareja && (parentescoDe(de, suPareja) || parentescoDe(conyuge, suPareja));
  if (parentescoPolitico) return { ok: false, motivo: "pariente", parentesco: `la pareja de ${parentescoPolitico}` };
  if (hijosDe(de).length >= FAMILIA.MAX_HIJOS || hijosDe(conyuge).length >= FAMILIA.MAX_HIJOS) return { ok: false, motivo: "muchosHijos" };
  if (adopcionesDesde(de, ahora - DIA_MS) >= FAMILIA.ADOPCIONES_POR_DIA) return { ok: false, motivo: "porHoy" };
  const pendiente = solicitudPendienteDelPadre(de, ahora);
  if (pendiente) return { ok: false, motivo: pendiente.hijo === hijo ? "yaPedida" : "pendiente", hijo: pendiente.hijo };
  const costo = monedasActivas(chat) ? FAMILIA.COSTO_ADOPCION : 0;
  if (costo && !gastarCoins(chat, de, costo, "adopcion")) return { ok: false, motivo: "sinCoins", costo };
  // if another couple had asked the same person, that request is dropped and their fee refunded
  const anterior = solicitudAdopcionDe(hijo, ahora);
  if (anterior) devolverCosto(anterior);
  guardarSolicitudAdopcion(hijo, de, conyuge, chat, costo, ahora);
  return { ok: true, conyuge, costo };
}

// .si / .no from the person being adopted. On accepting they inherit the family's surname, if it has one.
export function responderAdopcion(hijo, acepta, ahora = Date.now()) {
  const s = solicitudAdopcionDe(hijo, ahora);
  if (!s) return { ok: false, motivo: "sinSolicitud" };
  borrarSolicitudAdopcion(hijo);
  const padres = [s.padre_a, s.padre_b];
  if (!acepta) {
    devolverCosto(s);
    return { ok: true, acepta: false, padres };
  }
  if (casadoCon(s.padre_a) !== s.padre_b) {
    devolverCosto(s);
    return { ok: false, motivo: "yaNoCasados", padres };
  }
  if (padresDe(hijo) || ancestrosDe(s.padre_a).has(hijo) || ancestrosDe(s.padre_b).has(hijo)) return { ok: false, motivo: "yaNoSePuede", padres };
  crearAdopcion(hijo, s.padre_a, s.padre_b, ahora);
  const apellido = getApellido(s.padre_a) || getApellido(s.padre_b);
  if (apellido) renombrar(hijo, apellido);
  return { ok: true, acepta: true, padres, apellido };
}

// ---- apellidos ----
// Changes a person's surname and carries along the descendants who shared it (those who picked another one with
// their own marriage keep theirs).
function renombrar(lid, nuevo) {
  const viejo = getApellido(lid);
  setApellido(lid, nuevo);
  for (const h of hijosDe(lid)) if (getApellido(h) === viejo) renombrar(h, nuevo);
}

export function limpiarApellido(texto) {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  return t.length >= 2 && t.length <= FAMILIA.APELLIDO_MAX && /^\p{L}[\p{L}' -]*$/u.test(t) ? t : "";
}

// .apellido Rodríguez, by someone married: it applies to both of them and to the descendants who bore either one.
export function elegirApellido(lid, texto) {
  const conyuge = casadoCon(lid);
  if (!conyuge) return { ok: false, motivo: "sinCasar" };
  const apellido = limpiarApellido(texto);
  if (!apellido) return { ok: false, motivo: "invalido" };
  renombrar(lid, apellido);
  renombrar(conyuge, apellido);
  return { ok: true, apellido, conyuge };
}

// ---- leaving the family ----
// The child loses their parents. If they bore the family surname, they drop it (along with descendants who shared it).
function separar(hijo, padres) {
  borrarAdopcion(hijo);
  const apellido = getApellido(hijo);
  const deLaFamilia = apellido && (apellido === getApellido(padres[0]) || apellido === getApellido(padres[1]));
  if (deLaFamilia) renombrar(hijo, "");
  return deLaFamilia ? apellido : "";
}

// .emancipar
export function emanciparse(lid) {
  const padres = padresDe(lid);
  if (!padres) return { ok: false, motivo: "sinPadres" };
  return { ok: true, padres, apellidoPerdido: separar(lid, padres) };
}

// .desheredar @hijo
export function desheredar(padre, hijo) {
  const padres = padresDe(hijo);
  if (!padres || !padres.includes(padre)) return { ok: false, motivo: "noEsTuHijo" };
  return { ok: true, padres, apellidoPerdido: separar(hijo, padres) };
}

// ---- textos ----
const enumerar = (lista) => (lista.length <= 1 ? lista.join("") : `${lista.slice(0, -1).join(", ")} y ${lista.at(-1)}`);
const nombres = (lista) => enumerar(lista.map(nombreDe));
const ordenados = (lista) => lista.map(nombreDe).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

// .familia: a person's whole tree, with names and without tagging anyone
export function textoFamilia(lid, esPropio = false) {
  const r = parientesDe(lid);
  const apellido = getApellido(lid);
  const titulo = apellido ? `👨‍👩‍👧‍👦 *Familia ${apellido}* · ${nombreDe(lid)}` : `👨‍👩‍👧‍👦 *Familia de ${nombreDe(lid)}*`;
  const lineas = [];
  if (r.conyuge) lineas.push(`${casadoCon(lid) ? "💍 Cónyuge" : "💞 Pareja"}: ${nombreDe(r.conyuge)}`);
  const partes = [
    ["👨‍👩‍👧 Padres", r.padres],
    ["👶 Hijos", r.hijos],
    ["🧑‍🤝‍🧑 Hermanos", r.hermanos],
    ["🧓 Abuelos", r.abuelos],
    ["🍼 Nietos", r.nietos],
    ["🎩 Tíos", r.tios],
    ["🤝 Primos", r.primos],
    ["🧒 Sobrinos", r.sobrinos],
    ["🏠 Suegros", r.suegros],
    ["🍻 Cuñados", r.cunados],
  ];
  for (const [etiqueta, lista] of partes) if (lista.length) lineas.push(`${etiqueta}: ${nombres(lista)}`);
  if (!lineas.length) return `${titulo}\n${esPropio ? "No tenés" : "No tiene"} familia todavía. Un matrimonio adopta con .adoptar @persona, y elige apellido con .apellido.`;
  return `${titulo}\n${lineas.join("\n")}`;
}

// .familias: the families that have a surname, largest first
export function textoFamilias() {
  const grupos = new Map();
  for (const { lid, apellido } of listaApellidos()) grupos.set(apellido, [...(grupos.get(apellido) || []), lid]);
  if (!grupos.size) return "Todavía no hay familias con apellido. Un matrimonio elige el suyo con .apellido, y adopta con .adoptar @persona.";
  const orden = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "es"));
  const lineas = orden.slice(0, 15).map(([apellido, lids], i) => {
    const miembros = ordenados(lids);
    return `${i + 1}. *${apellido}* — ${cuenta(lids.length, "persona", "personas")}: ${enumerar(miembros.slice(0, 8))}${miembros.length > 8 ? ` y ${miembros.length - 8} más` : ""}`;
  });
  return `👨‍👩‍👧‍👦 *FAMILIAS*\n\n${lineas.join("\n")}`;
}

// the family line in .perfil; "" when there is nothing to say
export function resumenFamilia(lid) {
  const r = parientesDe(lid);
  const apellido = getApellido(lid);
  const partes = [];
  if (apellido) partes.push(`Familia ${apellido}`);
  if (r.padres.length) partes.push(`padres: ${nombres(r.padres)}`);
  if (r.hermanos.length) partes.push(cuenta(r.hermanos.length, "hermano", "hermanos"));
  if (r.hijos.length) partes.push(cuenta(r.hijos.length, "hijo", "hijos"));
  return partes.length ? `👨‍👩‍👧 ${partes.join(" · ")}` : "";
}

// What the bot answers to an adoption .si / .no: { text, mentions } to send; null if there was no request.
export function textoRespuestaAdopcion(hijo, r) {
  if (r.motivo === "sinSolicitud") return null;
  const padres = r.padres.map(nombreDe);
  const mentions = [hijo];
  const hijoM = `@${hijo.split("@")[0]}`;
  if (r.motivo === "yaNoCasados") return { text: `${padres[0]} y ${padres[1]} ya no están casados, así que la adopción quedó sin efecto.`, mentions };
  if (!r.ok) return { text: `La adopción ya no se puede hacer: ${hijoM} tiene familia por otro lado.`, mentions };
  if (!r.acepta) return { text: `💔 ${hijoM} rechazó la adopción de ${padres[0]} y ${padres[1]}.`, mentions };
  return { text: `👨‍👩‍👧 ¡${hijoM} ya es parte de la familia! Sus padres son ${padres[0]} y ${padres[1]}.${r.apellido ? ` Desde hoy es ${nombreDe(hijo)} ${r.apellido}.` : ""}`, mentions };
}
