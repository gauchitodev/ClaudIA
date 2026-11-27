// The job board of a group: who's who in work, who's looking, and the one-day jobs the bosses post.
// .gente shows the group's people with their trade and level and how they stand: free, working (and where), a boss, or
// put down as looking for work with .disponible (.nodisponible takes it back; it lapses on its own after some days, and
// being hired takes it off). The bosses see who's looking in .puestos and .empresas, with the .contratar ready to copy.
// A boss can post a one-day job too (.ofrecerchanga 50 Descargar el camión): the pay is taken when it's posted, from
// the company's caja or from the pocket, and the first one to answer with .agarrar takes it and is paid at once; with
// nobody in time, the money goes back. It's money moving from someone to someone, nothing minted, and so it isn't a
// way to empty a caja into a second account without the DGI: the pay has a cap, a boss posts a few a day, a person
// takes one a day, the same two only a couple of times a week, and nobody takes their own.
// Every number is in BOLSA. The tables are in database-schema.js.
import { db, ganarCoins, gastarCoins, getSaldoCoins, crearPendiente } from "../database-functions.js";
import { laburoDe, nivelDe, nombreDeOficio } from "./laburos.js";
import { empresaDe, empleoDe, empresasDelGrupo, puestosDe, nivelEnPuesto, categoriaEmpresa, CATEGORIAS } from "./empresas.js";
import { generoDe } from "./genero.js";
import { nombreDe } from "./menciones.js";
import { esParticipante } from "./identidad.js";
import { filtrarTexto } from "./tienda.js";
import { leerEntero } from "./comandos.js";

export const BOLSA = {
  DISPONIBLE_DIAS: 7, // being down as looking for work lapses after this, unless .disponible is said again
  NOTA_MAX: 60, // the line someone can add (.disponible manejo camión)
  LISTA_MAX: 25, // people shown per section of .gente
  // The one-day jobs.
  PAGA_MIN: 10,
  PAGA_MAX: 100, // about three days of the best going wage: a favour, not a way to move a fortune
  HORAS: 8, // how long one stands
  TITULO_MIN: 4,
  TITULO_MAX: 80,
  POR_DIA: 2, // a boss posts this many a day in a group, one open at a time
  TOMAR_POR_DIA: 1, // a person takes this many a day in a group: it's a day's work
  MISMO_PAR_DIAS: 7, // the same boss and the same person, at most MISMO_PAR_MAX in these many days
  MISMO_PAR_MAX: 2,
  AVISAR_MAX: 5, // the people looking for work a new one is told to, by mention
};

const DIA_MS = 24 * 60 * 60 * 1000;
const arroba = (lid) => `@${String(lid).split("@")[0]}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const inicioDelDia = (ahora) => new Date(ahora).setHours(0, 0, 0, 0);

// ---------- looking for work ----------
const vigenteDesde = (ahora) => ahora - BOLSA.DISPONIBLE_DIAS * DIA_MS;

// Who's down as looking for work in a group, the newest first: [{ usuario, nota, desde }]. The lapsed are dropped.
export function disponibles(chat, ahora = Date.now()) {
  db.prepare(`DELETE FROM bolsa_disponibles WHERE chat = ? AND desde <= ?`).run(chat, vigenteDesde(ahora));
  return db.prepare(`SELECT usuario, nota, desde FROM bolsa_disponibles WHERE chat = ? ORDER BY desde DESC, usuario ASC`).all(chat);
}
export const estaDisponible = (chat, usuario, ahora = Date.now()) => Boolean(db.prepare(`SELECT 1 FROM bolsa_disponibles WHERE chat = ? AND usuario = ? AND desde > ?`).get(chat, usuario, vigenteDesde(ahora)));

// .disponible [what you're after]: down as looking for work, for BOLSA.DISPONIBLE_DIAS days. Saying it again renews it
// (and changes the line). A boss gives work, doesn't look for it.
export function anotarDisponible(chat, usuario, nota = "", ahora = Date.now()) {
  const propia = empresaDe(chat, usuario);
  if (propia) return { ok: false, error: `Sos patrón de *${propia.nombre}*: el laburo lo das vos. Los que buscan están en .gente` };
  let linea = "";
  if (String(nota || "").trim()) {
    const f = filtrarTexto(nota, { min: 2, max: BOLSA.NOTA_MAX });
    if (!f.ok) return { ok: false, error: f.error };
    linea = f.texto;
  }
  const ya = estaDisponible(chat, usuario, ahora);
  db.prepare(`INSERT INTO bolsa_disponibles (chat, usuario, nota, desde) VALUES (?, ?, ?, ?) ON CONFLICT(chat, usuario) DO UPDATE SET nota = excluded.nota, desde = excluded.desde`).run(chat, usuario, linea, ahora);
  const empleo = empleoDe(chat, usuario);
  const actual = laburoDe(chat, usuario);
  const como = actual ? `${nombreDeOficio(actual.oficio, generoDe(usuario)).toLowerCase()} nivel ${nivelDe(actual.cobros)}` : "sin oficio (con uno, .laburos, te miran mejor)";
  return {
    ok: true,
    mensaje: `📋 ${ya ? "Renovado" : "Anotado"}: ${arroba(usuario)} busca laburo, ${como}${linea ? `: «${linea}»` : ""}.\nLos patrones te ven en .puestos y .empresas, y te aviso cuando alguno publique una changa de un día. Vale ${BOLSA.DISPONIBLE_DIAS} días; .nodisponible te saca antes.${empleo ? `\n_Ojo: hoy laburás en *${empleo.empresa.nombre}*; para que otro patrón te contrate, primero .renunciar. Las changas de un día sí las podés agarrar._` : ""}`,
    mentions: [usuario],
  };
}

// .nodisponible: off the board.
export function quitarDisponible(chat, usuario) {
  const habia = db.prepare(`DELETE FROM bolsa_disponibles WHERE chat = ? AND usuario = ?`).run(chat, usuario).changes > 0;
  return habia ? { ok: true, mensaje: "📋 Listo, te saqué de la bolsa de trabajo. Si volvés a buscar, .disponible" } : { ok: false, error: "No estabas anotado como que buscás laburo. Para anotarte, .disponible" };
}

// ---------- .gente ----------
// Whether someone is still in the group, by the participants the plugin has (with none, everyone counts).
const enElGrupo = (participants, usuario) => !participants?.length || participants.some((p) => esParticipante(p, usuario.endsWith("@lid") ? { lid: usuario } : { jid: usuario }));

const oficioCorto = (chat, usuario) => {
  const actual = laburoDe(chat, usuario);
  return actual ? `${nombreDeOficio(actual.oficio, generoDe(usuario)).toLowerCase()} nv.${nivelDe(actual.cobros)}` : "sin oficio";
};
const nombrePuesto = (def, usuario) => ((generoDe(usuario) === "mujer" && def.femenino) || def.nombre).toLowerCase();

// How everyone with a trade, a post, a company or a line on the board stands: { buscan, libres, empleados, patrones },
// each a list of { usuario, linea } by name.
export function genteDelGrupo(chat, participants = null, ahora = Date.now()) {
  const patrones = new Map(empresasDelGrupo(chat).map((e) => [e.patron, e]));
  const anotados = new Map(disponibles(chat, ahora).map((d) => [d.usuario, d]));
  const conOficio = db.prepare(`SELECT usuario FROM laburos WHERE chat = ? AND laburo != ''`).all(chat).map((r) => r.usuario);
  const empleados = db.prepare(`SELECT emp.usuario FROM empresas_empleados emp JOIN empresas e ON e.id = emp.empresa WHERE e.chat = ? AND emp.usuario != ''`).all(chat).map((r) => r.usuario);
  const todos = [...new Set([...patrones.keys(), ...anotados.keys(), ...conOficio, ...empleados])].filter((u) => enElGrupo(participants, u));
  const grupos = { buscan: [], libres: [], empleados: [], patrones: [] };
  for (const usuario of todos) {
    const oficio = oficioCorto(chat, usuario);
    const e = patrones.get(usuario);
    if (e) {
      grupos.patrones.push({ usuario, linea: () => `${nombreDe(usuario)} — ${oficio} · ${e.def.emoji} *${e.nombre}* (${CATEGORIAS[categoriaEmpresa(e, ahora)].nombre})` });
      continue;
    }
    const empleo = empleoDe(chat, usuario);
    const anotado = anotados.get(usuario);
    const enPuesto = empleo ? `${nombrePuesto(empleo.def, usuario)} nv.${nivelEnPuesto(chat, usuario, empleo.puesto)} en *${empleo.empresa.nombre}*` : "";
    if (anotado) grupos.buscan.push({ usuario, linea: () => `${nombreDe(usuario)} — ${oficio}${enPuesto ? ` · hoy ${enPuesto}` : ""}${anotado.nota ? ` · «${anotado.nota}»` : ""}` });
    else if (empleo) grupos.empleados.push({ usuario, linea: () => `${nombreDe(usuario)} — ${oficio} · ${enPuesto}` });
    else grupos.libres.push({ usuario, linea: () => `${nombreDe(usuario)} — ${oficio}` });
  }
  // By name, as the group knows them, so each one is easy to find.
  const porNombre = (a, b) => nombreDe(a.usuario).localeCompare(nombreDe(b.usuario), "es") || a.usuario.localeCompare(b.usuario);
  for (const lista of Object.values(grupos)) lista.sort(porNombre);
  return grupos;
}

// .gente: the board, by sections. Names, never mentions (the lists don't tag anyone).
export function textoGente(chat, participants = null, ahora = Date.now()) {
  const g = genteDelGrupo(chat, participants, ahora);
  const seccion = (titulo, lista) => {
    if (!lista.length) return null;
    const vistos = lista.slice(0, BOLSA.LISTA_MAX).map((x) => `• ${x.linea()}`);
    const resto = lista.length - vistos.length;
    return `${titulo} (${lista.length})\n${vistos.join("\n")}${resto > 0 ? `\n_y ${plural(resto, "persona", "personas")} más_` : ""}`;
  };
  const partes = [seccion("🔎 *Buscan laburo*", g.buscan), seccion("🟢 *Libres*", g.libres), seccion("👷 *Empleados*", g.empleados), seccion("🏭 *Patrones*", g.patrones)].filter(Boolean);
  if (!partes.length) return `👥 Acá nadie tiene oficio todavía, ni hay patrones ni gente buscando. Se arranca con .laburos, y quien busca laburo se anota con .disponible`;
  return `👥 *Bolsa de trabajo del grupo*\n\n${partes.join("\n\n")}\n\n_.disponible te anota como que buscás laburo (y .nodisponible te saca): los patrones te ven en .puestos y .empresas. Quien no tiene oficio ni se anotó no aparece._`;
}

// ---------- what the bosses see ----------
// The post that suits someone best in a company: the one they have most levels in, and with none, the one that works
// the goods (the company's trade's). Returns its key.
function puestoPara(e, usuario) {
  const puestos = Object.entries(puestosDe(e));
  const operario = puestos.find(([, p]) => p.tipo === "operario")[0];
  let mejor = operario;
  let nivel = 1;
  for (const [clave] of puestos) {
    const n = nivelEnPuesto(e.chat, usuario, clave);
    if (n > nivel) [mejor, nivel] = [clave, n];
  }
  return mejor;
}

// For a boss (in .puestos and .empresas): who's looking for work and can be hired, each with the .contratar ready to
// copy (the number goes as typed, which the command reads; nobody is tagged). "" with nobody, or for whoever isn't a
// boss.
export function textoBuscanParaPatron(chat, patron, participants = null, ahora = Date.now()) {
  const e = empresaDe(chat, patron);
  if (!e) return "";
  const lista = disponibles(chat, ahora).filter((d) => d.usuario !== patron && !empresaDe(chat, d.usuario) && !empleoDe(chat, d.usuario) && enElGrupo(participants, d.usuario));
  if (!lista.length) return "";
  const lineas = lista.slice(0, BOLSA.LISTA_MAX).map((d) => {
    const clave = puestoPara(e, d.usuario);
    const def = puestosDe(e)[clave];
    const nivel = nivelEnPuesto(chat, d.usuario, clave);
    return `• ${nombreDe(d.usuario)} — ${oficioCorto(chat, d.usuario)}${nivel > 1 ? ` · ya es ${nombrePuesto(def, d.usuario)} nv.${nivel}` : ""}${d.nota ? ` · «${d.nota}»` : ""}\n   .contratar ${arroba(d.usuario)} ${clave} ${def.sueldo}`;
  });
  return `🔎 *Buscan laburo* (${lista.length}): copiá la línea, cambiale el puesto o el sueldo si querés, y mandala.\n${lineas.join("\n")}`;
}

// ---------- the one-day jobs ----------
const porId = (id) => db.prepare(`SELECT * FROM bolsa_changas WHERE id = ?`).get(id) || null;
export const changasDelDia = (chat, ahora = Date.now()) => db.prepare(`SELECT * FROM bolsa_changas WHERE chat = ? AND estado = 'abierta' AND vence > ? ORDER BY id ASC`).all(chat, ahora);

// Who pays a one-day job: the company (its name) or the boss.
const quienPaga = (c) => {
  const e = c.empresa ? db.prepare(`SELECT nombre FROM empresas WHERE id = ?`).get(c.empresa) : null;
  return e ? { de: `*${e.nombre}*`, caja: true } : { de: arroba(c.patron), caja: false };
};

const USO = () => `Se publica así: .ofrecerchanga 50 Descargar el camión de soja (la paga y qué es). La paga sale de la caja de tu empresa; para pagarla de tu bolsillo, .ofrecerchanga 50 bolsillo Descargar el camión. De ${BOLSA.PAGA_MIN} a ${BOLSA.PAGA_MAX} UruCoins, y la agarra el primero que conteste .agarrar`;

// .ofrecerchanga <pay> [caja|bolsillo] <what>: a boss posts a one-day job. The pay is taken now, from the caja (the
// default) or the pocket. Returns { ok, id, texto, mentions } with the post to send (the plugin notes its message
// with anotarMensaje), or { ok: false, error }. participants, when given, keeps whoever left the group out of the
// mentions.
export function ofrecerChanga(chat, patron, args = [], ahora = Date.now(), participants = null) {
  const e = empresaDe(chat, patron);
  if (!e) return { ok: false, error: `Las changas de un día las ofrece un patrón: hay que tener empresa (.fundar). Para armar una con equipo, pagándola de tu bolsillo, está .changa 3 50 <qué>.` };
  const [primero, ...resto] = args;
  const paga = leerEntero(primero);
  let palabras = resto;
  let deBolsillo = false;
  const fuente = String(palabras[0] || "").toLowerCase();
  if (["bolsillo", "caja"].includes(fuente)) {
    deBolsillo = fuente === "bolsillo";
    palabras = palabras.slice(1);
  }
  if (paga === null || !palabras.length) return { ok: false, error: USO() };
  if (paga < BOLSA.PAGA_MIN || paga > BOLSA.PAGA_MAX) return { ok: false, error: `Una changa de un día paga de ${BOLSA.PAGA_MIN} a ${BOLSA.PAGA_MAX} UruCoins. Para más, contratá con .contratar` };
  const f = filtrarTexto(palabras.join(" "), { min: BOLSA.TITULO_MIN, max: BOLSA.TITULO_MAX });
  if (!f.ok) return { ok: false, error: f.error };
  const abierta = changasDelDia(chat, ahora).find((c) => c.patron === patron);
  if (abierta) return { ok: false, error: `Ya tenés una changa esperando a alguien («${abierta.titulo}»): de a una.` };
  const hoy = db.prepare(`SELECT COUNT(*) AS n FROM bolsa_changas WHERE chat = ? AND patron = ? AND creada >= ?`).get(chat, patron, inicioDelDia(ahora)).n;
  if (hoy >= BOLSA.POR_DIA) return { ok: false, error: `Ya ofreciste ${plural(BOLSA.POR_DIA, "changa", "changas")} hoy. Mañana seguís dando laburo, o contratá a alguien fijo.` };

  const vence = ahora + BOLSA.HORAS * 3600e3;
  let id = null;
  db.transaction(() => {
    const pagado = deBolsillo ? gastarCoins(chat, patron, paga, "bolsa_changa") : db.prepare(`UPDATE empresas SET caja = caja - ? WHERE id = ? AND caja >= ?`).run(paga, e.id, paga).changes > 0;
    if (!pagado) return;
    id = Number(db.prepare(`INSERT INTO bolsa_changas (chat, patron, empresa, titulo, paga, creada, vence) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(chat, patron, deBolsillo ? 0 : e.id, f.texto, paga, ahora, vence).lastInsertRowid);
    crearPendiente(chat, patron, "bolsa_changa_vence", { id }, vence);
  })();
  if (id === null) {
    return { ok: false, error: deBolsillo ? `Para pagarla hacen falta ${paga} y tenés ${getSaldoCoins(chat, patron)} en el bolsillo.` : `En la caja de *${e.nombre}* hay ${e.caja} y la changa paga ${paga}. Poné plata (.caja depositar) o pagala de tu bolsillo: .ofrecerchanga ${paga} bolsillo ${f.texto}` };
  }
  // The ones looking for work hear of it (they asked to): a few, by mention.
  const avisar = disponibles(chat, ahora).map((d) => d.usuario).filter((u) => u !== patron && enElGrupo(participants, u)).slice(0, BOLSA.AVISAR_MAX);
  const quien = quienPaga(porId(id));
  const texto = `🧰 *CHANGA DE UN DÍA* — de ${quien.de}${quien.caja ? ` (${e.def.emoji} paga la caja)` : " (de su bolsillo)"}\n«${f.texto}»\n\nPaga *${paga} UruCoins* al primero que la agarre: .agarrar (o contestándole a este mensaje). Vale ${BOLSA.HORAS} horas; si nadie la agarra, la plata vuelve.${avisar.length ? `\n🔎 Para los que buscan laburo: ${avisar.map(arroba).join(" ")}` : ""}`;
  return { ok: true, id, texto, mentions: [patron, ...avisar] };
}

// The message a one-day job went out as: answering it with .agarrar takes that one.
export function anotarMensaje(id, mensajeId) {
  if (mensajeId) db.prepare(`UPDATE bolsa_changas SET mensaje_id = ? WHERE id = ?`).run(mensajeId, id);
}

// Why someone can't take that one, or null.
function noPuedeAgarrar(c, usuario, ahora) {
  if (usuario === c.patron) return "Es tu propia changa: no te podés pagar a vos.";
  const suya = empresaDe(c.chat, usuario);
  if (suya && c.empresa === suya.id) return "Es una changa de tu empresa: no te podés pagar a vos.";
  const hoy = db.prepare(`SELECT COUNT(*) AS n FROM bolsa_changas WHERE chat = ? AND tomador = ? AND tomada >= ?`).get(c.chat, usuario, inicioDelDia(ahora)).n;
  if (hoy >= BOLSA.TOMAR_POR_DIA) return "Hoy ya hiciste una changa de un día: el cuerpo pide descanso. Mañana agarrás otra.";
  const par = db.prepare(`SELECT COUNT(*) AS n FROM bolsa_changas WHERE chat = ? AND patron = ? AND tomador = ? AND tomada >= ?`).get(c.chat, c.patron, usuario, ahora - BOLSA.MISMO_PAR_DIAS * DIA_MS).n;
  if (par >= BOLSA.MISMO_PAR_MAX) return `Ya le hiciste ${plural(par, "changa", "changas")} a ${nombreDe(c.patron)} esta semana: que le toque a otro, que se nota el acomodo.`;
  return null;
}

// .agarrar: the first to answer takes a one-day job and is paid. Which one: the one the message answers, or the
// number (.agarrar 2, as listed), or the only one open. Returns { ok, mensaje, mentions } or { ok: false, error }.
export function agarrarChanga(chat, usuario, { citado = null, numero = null } = {}, ahora = Date.now()) {
  const abiertas = changasDelDia(chat, ahora);
  let c = null;
  if (citado) c = abiertas.find((x) => x.mensaje_id === citado) || null;
  if (!c && numero) c = abiertas[numero - 1] || null;
  if (!c && !numero && abiertas.length === 1) c = abiertas[0];
  if (!c) {
    if (!abiertas.length) return { ok: false, error: "No hay ninguna changa de un día esperando. Si buscás laburo, anotate con .disponible y te aviso." };
    return { ok: false, error: `Hay ${abiertas.length} changas de un día: contestale a la que quieras con .agarrar, o decime el número:\n${abiertas.map((x, i) => `${i + 1}. «${x.titulo}» — ${x.paga}, de ${quienPaga(x).de}`).join("\n")}` };
  }
  const no = noPuedeAgarrar(c, usuario, ahora);
  if (no) return { ok: false, error: no };
  // Taken by whoever got there first: the row changes only if it's still open.
  const tomada = db.transaction(() => {
    if (db.prepare(`UPDATE bolsa_changas SET estado = 'tomada', tomador = ?, tomada = ? WHERE id = ? AND estado = 'abierta'`).run(usuario, ahora, c.id).changes === 0) return false;
    ganarCoins(chat, usuario, c.paga, "bolsa_changa_paga");
    return true;
  })();
  if (!tomada) return { ok: false, error: "Te la ganaron de mano: ya la agarró otro." };
  const paga = quienPaga(c);
  return {
    ok: true,
    mensaje: `🤝 ${arroba(usuario)} agarró la changa de ${paga.de}: «${c.titulo}». ${alAzar(HECHAS)}\n🪙 Cobró *${c.paga} UruCoins*${paga.caja ? ", de la caja de la empresa" : `, del bolsillo de ${arroba(c.patron)}`}. Tiene ${getSaldoCoins(chat, usuario)}.`,
    mentions: [usuario, c.patron],
  };
}

const HECHAS = [
  "Lo hizo en la mitad del tiempo y le sobró para el mate.",
  "Llegó tarde, pero llegó, que en este país ya es mucho.",
  "Quedó impecable. El patrón dice que lo iba a hacer él, pero bueno.",
  "Trabajo limpio y sin preguntar demasiado. Como debe ser.",
  "Hubo un par de puteadas, pero salió.",
];
const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];

// The pending work at a one-day job's deadline (lib/pendientes.js): still open, nobody took it. The money goes back
// to where it came from, and the group is told. null when it was taken already.
export function vencerChangaDelDia(id, ahora = Date.now()) {
  const c = porId(id);
  if (!c || c.estado !== "abierta" || c.vence > ahora) return null;
  const paga = quienPaga(c);
  db.transaction(() => {
    db.prepare(`UPDATE bolsa_changas SET estado = 'vencida' WHERE id = ?`).run(c.id);
    // To the caja it came from (it's no deposit: it was the company's), or to the pocket. A company gone, to its boss.
    const vuelveACaja = c.empresa && db.prepare(`UPDATE empresas SET caja = caja + ? WHERE id = ?`).run(c.paga, c.empresa).changes > 0;
    if (!vuelveACaja) ganarCoins(c.chat, c.patron, c.paga, "bolsa_changa_devolucion");
  })();
  return { texto: `🦗 Nadie agarró la changa de un día de ${paga.de}: «${c.titulo}». Después dicen que no hay laburo.\nLos ${c.paga} UruCoins vuelven ${paga.caja ? "a la caja" : `al bolsillo de ${arroba(c.patron)}`}.`, mentions: [c.patron] };
}

// What .ofrecerchanga says with nothing after it: how it goes, and the ones waiting.
export function textoChangasDelDia(chat, ahora = Date.now()) {
  const abiertas = changasDelDia(chat, ahora);
  const lista = abiertas.length ? `\n\n🧰 *Esperando a alguien*\n${abiertas.map((x, i) => `${i + 1}. «${x.titulo}» — ${x.paga}, de ${quienPaga(x).de}`).join("\n")}\nSe agarra con .agarrar (o .agarrar 2).` : "";
  return `🧰 *Changas de un día*\n${USO()}.\nLa plata se descuenta al publicar y vuelve si nadie la agarra en ${BOLSA.HORAS} horas. Cada patrón ofrece ${BOLSA.POR_DIA} por día y cada persona hace una por día; nadie agarra la suya.${lista}`;
}
