// Familias: un matrimonio adopta gente y de ahí sale el árbol. Se guarda solo quién es hijo de quién (con sus dos
// padres) y el apellido de cada persona; hermanos, abuelos, nietos, tíos, primos, sobrinos, cuñados y suegros se
// calculan al momento. Como las parejas, las familias son globales, no por grupo. Toda la lógica devuelve { ok, motivo }
// y los plugins eligen el texto. Las personas se identifican por lid.
import { parejaDe, padresDe as padresEnBase, hijosDe as hijosEnBase, crearAdopcion, borrarAdopcion, adopcionesDesde, guardarSolicitudAdopcion, getSolicitudAdopcion, getSolicitudAdopcionDe, borrarSolicitudAdopcion, getApellido, setApellido, listaApellidos, gastarCoins, ganarCoins } from "../database-functions.js";
import { monedasActivas } from "./urucoins.js";
import { nombreDe } from "./menciones.js";
import { DIA_MS } from "./tiempo.js";

export const FAMILIA = {
  COSTO_ADOPCION: 30, // UruCoins del que adopta, en el grupo donde lo pide (un desagüe, como el apodo). Se devuelven si rechazan.
  MAX_HIJOS: 4, // por persona
  ADOPCIONES_POR_DIA: 1, // por persona que adopta
  DIAS_SOLICITUD: 7, // un pedido sin respuesta vence a la semana, sin devolución: el trámite se pagó igual
  APELLIDO_MAX: 20,
};

// ---- lecturas básicas ----
export const padresDe = (lid) => {
  const p = padresEnBase(lid);
  return p ? [p.padre_a, p.padre_b] : null;
};
export const hijosDe = (lid) => hijosEnBase(lid).map((h) => h.hijo);
export const apellidoDe = (lid) => getApellido(lid);
const conyugeDe = (lid) => parejaDe(lid)?.pareja || null; // pareja, casados o no
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
// Todo sale de "padres de" e "hijos de": hermanos son los otros hijos de mis padres (medio hermanos incluidos), tíos
// los hermanos de mis padres, primos los hijos de mis tíos, cuñados los hermanos de mi pareja y las parejas de mis
// hermanos, suegros los padres de mi pareja.
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

// Parientes cercanos, con cómo nombrarlos desde el punto de vista de la persona. Los políticos (cuñados, suegros) no
// cuentan: con ellos no hay sangre de por medio.
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

// "tu hermano/a" si b es pariente cercano de a; null si no. Lo usan parejas y besos para frenar el incesto.
export function parentescoDe(a, b) {
  if (!a || !b || a === b) return null;
  const r = parientesDe(a);
  for (const [clave, nombre] of RELACIONES) if (r[clave].includes(b)) return nombre;
  return null;
}

// ---- adopción ----
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

// .adoptar @x, por alguien casado: x no puede tener padres, ni ser antepasado o pariente cercano del matrimonio (ni
// estar en pareja con uno), y cada persona tiene tope de hijos y una adopción por día. El trámite se cobra al pedir.
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
  // si otro matrimonio le había pedido a la misma persona, ese pedido cae y se le devuelve el trámite
  const anterior = solicitudAdopcionDe(hijo, ahora);
  if (anterior) devolverCosto(anterior);
  guardarSolicitudAdopcion(hijo, de, conyuge, chat, costo, ahora);
  return { ok: true, conyuge, costo };
}

// .si / .no de la persona a la que quieren adoptar. Al aceptar hereda el apellido de la familia, si tiene.
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
// Cambia el apellido de una persona y arrastra a los descendientes que llevaban el mismo que ella (los que eligieron
// otro con su propio matrimonio se quedan con el suyo).
function renombrar(lid, nuevo) {
  const viejo = getApellido(lid);
  setApellido(lid, nuevo);
  for (const h of hijosDe(lid)) if (getApellido(h) === viejo) renombrar(h, nuevo);
}

export function limpiarApellido(texto) {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  return t.length >= 2 && t.length <= FAMILIA.APELLIDO_MAX && /^\p{L}[\p{L}' -]*$/u.test(t) ? t : "";
}

// .apellido Rodríguez, por alguien casado: queda para los dos y para los descendientes que llevaban el de cada uno.
export function elegirApellido(lid, texto) {
  const conyuge = casadoCon(lid);
  if (!conyuge) return { ok: false, motivo: "sinCasar" };
  const apellido = limpiarApellido(texto);
  if (!apellido) return { ok: false, motivo: "invalido" };
  renombrar(lid, apellido);
  renombrar(conyuge, apellido);
  return { ok: true, apellido, conyuge };
}

// ---- irse de la familia ----
// El hijo pierde a sus padres. Si llevaba el apellido de la familia, lo deja (y sus descendientes que lo compartían).
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

// .familia: el árbol entero de una persona, con nombres y sin etiquetar a nadie
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

// .familias: las familias con apellido, de la más grande a la más chica
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

// la línea de la familia en .perfil; "" si no hay nada que decir
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

// Lo que contesta el bot a un .si / .no de adopción: { text, mentions } para mandar; null si no había pedido.
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
