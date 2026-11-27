// Services between players (servicios), in the groups that are a town (lib/pueblo.js): when something needs a trade,
// Claudia gives whoever needs it numbered options with the people of the group who have that trade, with their level,
// their nickname and their reviews, and the town's own as the last option (dearer, but it never says no). All of it
// in the group, nothing in private:
//   "Se te rompió el camión en la ruta 5. ¿A quién se lo llevás? 1 Fulano (mecánico nv. 7, «el Manos de Oro», ⭐4,5)
//    2 Sultano (nv. 3) 3 El taller del pueblo (caro: 120)"
// Whoever needs it picks with the number (or .servicio 2); Claudia tags the one picked: "¿cuánto le cobrás?". They
// answer .cobro 80 (or .cobro no); the other one .trato, .regateo 60 (and back to them) or picks another. Accepted,
// the money goes from whoever pays (the company's cash box, for one of its goods) to whoever does the job, the job is
// rolled at a chance by their level (a level 1 may leave it worse), and they gain experience in their trade. The one
// served can review it (.reseña 1-5), and the stars show in the options to come. With nobody answering in
// SERVICIO.PLAZO_MIN, it goes to the town's own. With nobody of the trade in the group, only the town's own is offered,
// and Claudia says so.
// One mechanism for every trade: each kind of need (NECESIDADES) says which trades do it, what the town's own charges
// and what's done when it's done. For now: a company's good that broke (the mecánico, or the trade's own), and someone
// hurt in an urgent errand that went wrong (the enfermero), who, until they're seen to, collect half their next wage.
// Every number is in SERVICIO. The tables are in database-schema.js.
import { randomInt } from "crypto";
import { db, ganarCoins, gastarCoins, getSaldoCoins, crearPendiente } from "../database-functions.js";
import { laburoDe, nivelDe, OFICIOS, nombreDeOficio, anotarExperiencia } from "./laburos.js";
import { generoDe } from "./genero.js";
import { apodoDe } from "./escenas.js";
import { puebloActivo, registrarHecho, npc, lugar, curar } from "./pueblo.js";

export const SERVICIO = {
  OPCIONES_MAX: 3, // people offered, the highest level first; the town's own goes after them
  PLAZO_MIN: 30, // minutes for the whole deal; then it goes to the town's own
  PRECIO_MAX: 2000,
  CHANCE_BASE: 50, // % of a job going well: this, plus CHANCE_NIVEL a level, up to CHANCE_MAX
  CHANCE_NIVEL: 5,
  CHANCE_MAX: 95,
  RESENA_HORAS: 24, // how long the one served has to review the job
  HERIDO_CHANCE: 30, // % of the urgent errands that go wrong where somebody is hurt (in a town)
  CURA_NPC: 60, // what the policlínica charges
};

// The dice, here so the tests can load them.
export const _dep = { azar: (n) => randomInt(0, n) };
const mencion = (id) => `@${String(id).split("@")[0]}`;
const NUMEROS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

// What each kind of need is. oficios(ref): the trades that do it; quien(ref): who pays ("caja" or "bolsillo");
// npc(ref): the town's own, with its price; que(ref): what it is, in a few words; hacer(ref, bien): what's done
// with it, done well (bien) or not.
export const NECESIDADES = {
  bien: {
    emoji: "🔧",
    oficios: (ref) => ["mecanico", ...(ref.tipo !== "camionero" ? [ref.tipo] : [])],
    paga: "caja",
    npc: (ref) => ({ nombre: "El taller del pueblo", precio: ref.costo }),
    que: (ref) => `${ref.bienNombre.toLowerCase()} de ${ref.empresaNombre}`,
    pregunta: (ref, chat) => `Se rompió ${ref.bienNombre.toLowerCase()} de *${ref.empresaNombre}*${lugar(chat, "ruta") && ref.tipo === "camionero" ? ` en ${lugar(chat, "ruta")}` : ""}. ¿A quién se lo llevás?`,
    nadie: "en este pueblo no hay un mecánico ni para remedio",
  },
  herido: {
    emoji: "🩹",
    oficios: () => ["enfermero"],
    paga: "bolsillo",
    npc: (ref, chat) => ({ nombre: `La guardia de ${lugar(chat, "hospital")}`, precio: SERVICIO.CURA_NPC }),
    que: () => "una curación",
    pregunta: () => `Te lastimaste en el encargo: hasta que te curen, tu próximo sueldo es la mitad. ¿Quién te cura?`,
    nadie: "en este pueblo no hay un enfermero ni para una curita",
  },
};

// ---------- the table ----------
const porId = (id) => {
  const s = db.prepare(`SELECT * FROM servicios WHERE id = ?`).get(id);
  return s ? { ...s, ref: JSON.parse(s.ref || "{}"), opciones: JSON.parse(s.opciones || "[]") } : null;
};
// The deal someone has open in a group (as the one served), or null.
export function servicioDe(chat, cliente) {
  const s = db.prepare(`SELECT id FROM servicios WHERE chat = ? AND cliente = ? AND estado IN ('opciones', 'esperando', 'precio') ORDER BY id DESC LIMIT 1`).get(chat, cliente);
  return s ? porId(s.id) : null;
}
// The deal someone has been asked to do (as the one picked), or null.
const pedidoA = (chat, proveedor) => {
  const s = db.prepare(`SELECT id FROM servicios WHERE chat = ? AND proveedor = ? AND estado IN ('esperando', 'precio') ORDER BY id DESC LIMIT 1`).get(chat, proveedor);
  return s ? porId(s.id) : null;
};
const guardar = (s, cambios) => {
  Object.assign(s, cambios);
  const columnas = Object.keys(cambios);
  db.prepare(`UPDATE servicios SET ${columnas.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(...columnas.map((c) => (typeof cambios[c] === "object" ? JSON.stringify(cambios[c]) : cambios[c])), s.id);
};

// Someone's reviews in a group: the average stars and how many, or null with none.
export function resenasDe(chat, proveedor) {
  const r = db.prepare(`SELECT AVG(estrellas) AS promedio, COUNT(*) AS n FROM servicios_resenas WHERE chat = ? AND proveedor = ?`).get(chat, proveedor);
  return r.n ? { promedio: Math.round(r.promedio * 10) / 10, n: r.n } : null;
}

// The people of the group who can do it: those with one of its trades, but for whoever needs it, the highest level
// first.
function candidatos(chat, cliente, oficios) {
  const filas = db.prepare(`SELECT usuario, laburo, cobros FROM laburos WHERE chat = ? AND laburo IN (${oficios.map(() => "?").join(", ")}) AND usuario != ?`).all(chat, ...oficios, cliente);
  return filas
    .map((f) => ({ usuario: f.usuario, oficio: f.laburo, nivel: nivelDe(f.cobros) }))
    .sort((a, b) => b.nivel - a.nivel)
    .slice(0, SERVICIO.OPCIONES_MAX);
}

function lineaOpcion(chat, o, i) {
  if (!o.usuario) return `${NUMEROS[i]} ${o.nombre} — ${o.precio} UruCoins, y no regatea`;
  const oficio = nombreDeOficio(OFICIOS[o.oficio], generoDe(o.usuario)).toLowerCase();
  const apodo = apodoDe(chat, o.usuario);
  const resenas = resenasDe(chat, o.usuario);
  return `${NUMEROS[i]} ${mencion(o.usuario)} (${oficio} nv. ${o.nivel}${apodo ? `, «${apodo}»` : ""}${resenas ? `, ⭐${String(resenas.promedio).replace(".", ",")} de ${resenas.n}` : ""})`;
}

// ---------- offering ----------
// A need comes up (a module calls this): the options are worked out and the deal opened. Returns { texto, mentions }
// to add to what the module tells the group, or null with no town.
export function ofrecerServicio(chat, cliente, tipo, ref, ahora = Date.now()) {
  const def = NECESIDADES[tipo];
  if (!def || !puebloActivo(chat)) return null;
  const viejo = servicioDe(chat, cliente);
  if (viejo) guardar(viejo, { estado: "anulado" });
  const gente = candidatos(chat, cliente, def.oficios(ref));
  const opciones = [...gente, { usuario: null, ...def.npc(ref, chat) }];
  const vence = ahora + SERVICIO.PLAZO_MIN * 60 * 1000;
  const id = Number(
    db.prepare(`INSERT INTO servicios (chat, cliente, tipo, ref, opciones, estado, vence, creado) VALUES (?, ?, ?, ?, ?, 'opciones', ?, ?)`).run(chat, cliente, tipo, JSON.stringify(ref), JSON.stringify(opciones), vence, ahora).lastInsertRowid,
  );
  crearPendiente(chat, cliente, "servicio_vence", { id }, vence);
  const lineas = [`${def.emoji} ${mencion(cliente)}: ${def.pregunta(ref, chat)}`, ...opciones.map((o, i) => lineaOpcion(chat, o, i))];
  if (!gente.length) lineas.push(`_(${def.nadie}: queda ${opciones[0].nombre.replace(/^El /, "el ").replace(/^La /, "la ")})_`);
  lineas.push(`_Elegí con .servicio <número>. Si en ${SERVICIO.PLAZO_MIN} minutos no se arregla nada, va ${opciones.at(-1).nombre.replace(/^El /, "al ").replace(/^La /, "a la ")}._`);
  return { id, texto: lineas.join("\n"), mentions: [cliente, ...gente.map((g) => g.usuario)] };
}

// ---------- the deal ----------
// .servicio 2: whoever needs it picks. The town's own does it right away; a person is tagged and asked for a price.
export function elegirServicio(chat, cliente, numero, ahora = Date.now()) {
  const s = servicioDe(chat, cliente);
  if (!s) return { ok: false, error: "No tenés nada que arreglar ahora. Cuando se te rompa algo, te ofrezco quién." };
  const o = s.opciones[numero - 1];
  if (!Number.isInteger(numero) || !o) return { ok: false, error: `Las opciones van del 1 al ${s.opciones.length}.` };
  if (!o.usuario) return hacer(s, { proveedor: "", precio: o.precio, nombre: o.nombre }, ahora);
  if (o.rechazo) return { ok: false, error: `${mencion(o.usuario)} ya te dijo que no. Elegí otro.`, mentions: [o.usuario] };
  guardar(s, { proveedor: o.usuario, estado: "esperando", precio: 0 });
  const def = NECESIDADES[s.tipo];
  return { ok: true, texto: `${def.emoji} ${mencion(o.usuario)}, ${mencion(cliente)} te trae ${def.que(s.ref)}. ¿Cuánto le cobrás? Contestá .cobro 80, o .cobro no si no te da el cuero.`, mentions: [o.usuario, cliente] };
}

// .cobro 80 / .cobro no: whoever was picked names their price, or says no.
export function ponerPrecio(chat, proveedor, precio) {
  const s = pedidoA(chat, proveedor);
  if (!s) return { ok: false, error: "Nadie te pidió nada. Cuando alguien necesite tu oficio, te etiqueto." };
  if (precio === "no") {
    const opciones = s.opciones.map((o) => (o.usuario === proveedor ? { ...o, rechazo: true } : o));
    guardar(s, { estado: "opciones", proveedor: "", precio: 0, opciones });
    return { ok: true, texto: `🙅 ${mencion(proveedor)} no lo agarra. ${mencion(s.cliente)}, elegí otro con .servicio <número> (${opciones.length} es ${opciones.at(-1).nombre.replace(/^El /, "el ").replace(/^La /, "la ")}).`, mentions: [s.cliente, proveedor] };
  }
  if (!Number.isInteger(precio) || precio < 1 || precio > SERVICIO.PRECIO_MAX) return { ok: false, error: `Decí un precio de 1 a ${SERVICIO.PRECIO_MAX}: .cobro 80 (o .cobro no).` };
  guardar(s, { estado: "precio", precio });
  const npcPrecio = s.opciones.at(-1).precio;
  return { ok: true, texto: `💬 ${mencion(proveedor)} te cobra *${precio} UruCoins*, ${mencion(s.cliente)}${precio > npcPrecio ? ` (el del pueblo cobra ${npcPrecio}, para que sepas)` : ""}. .trato, .regateo <precio>, o elegí otro con .servicio <número>.`, mentions: [s.cliente, proveedor] };
}

// .regateo 60: whoever needs it offers less; it's the other one's move again (.cobro).
export function regatear(chat, cliente, precio) {
  const s = servicioDe(chat, cliente);
  if (!s || s.estado !== "precio") return { ok: false, error: "No hay ningún precio que regatear: primero elegí quién y esperá que te diga cuánto." };
  if (!Number.isInteger(precio) || precio < 1 || precio >= s.precio) return { ok: false, error: `Regatear es ofrecer menos de ${s.precio}: .regateo ${Math.max(1, Math.floor(s.precio * 0.7))}` };
  const proveedor = s.proveedor;
  guardar(s, { estado: "esperando" });
  return { ok: true, texto: `🤝 ${mencion(cliente)} te ofrece ${precio}, ${mencion(proveedor)}. .cobro ${precio} si cerrás, u otro precio.`, mentions: [proveedor, cliente] };
}

// .trato: the price stands; the job is done.
export function aceptar(chat, cliente, ahora = Date.now()) {
  const s = servicioDe(chat, cliente);
  if (!s || s.estado !== "precio") return { ok: false, error: "No hay ningún precio para aceptar todavía." };
  return hacer(s, { proveedor: s.proveedor, precio: s.precio }, ahora);
}

// The chance of a person's job going well, by their level.
export const chanceDe = (nivel) => Math.min(SERVICIO.CHANCE_MAX, SERVICIO.CHANCE_BASE + nivel * SERVICIO.CHANCE_NIVEL);

// Whether there's still something to do: a good fixed meanwhile (.service, the town's own) needs nobody.
const sigueHaciendoFalta = (s) => s.tipo !== "bien" || Boolean(db.prepare(`SELECT roto FROM empresas_bienes WHERE id = ?`).get(s.ref.bien)?.roto);

// The job: paid (from the company's cash box or the pocket), rolled (the town's own always does it well), done, and
// the one who did it gains experience in their trade. Returns { ok, texto, mentions } or { ok: false, error }.
function hacer(s, { proveedor, precio, nombre = "" }, ahora) {
  const def = NECESIDADES[s.tipo];
  if (!sigueHaciendoFalta(s)) {
    guardar(s, { estado: "anulado" });
    return { ok: false, error: `${def.que(s.ref)[0].toUpperCase()}${def.que(s.ref).slice(1)} ya está arreglado: no hace falta nadie.`, anulado: true };
  }
  const pagado = pagar(s, proveedor, precio);
  if (!pagado.ok) return pagado;
  const nivel = proveedor ? nivelDe(laburoDe(s.chat, proveedor)?.cobros || 0) : 0;
  const bien = !proveedor || _dep.azar(100) < chanceDe(nivel);
  if (bien) resolverNecesidad(s);
  if (proveedor) anotarExperiencia(s.chat, proveedor);
  guardar(s, { estado: "hecho", proveedor, precio, resultado: bien ? 1 : 0, hecho: ahora });
  const que = def.que(s.ref);
  if (proveedor) registrarHecho(s.chat, "servicio", { usuario: proveedor, cliente: s.cliente, que, precio, fallo: !bien }, ahora);
  const lineas = [];
  if (!proveedor) lineas.push(`${def.emoji} ${nombre || s.opciones.at(-1).nombre} se encargó de ${que}: tarde, caro y sin una sonrisa, pero quedó. Pagaste ${precio}.`);
  else if (bien) lineas.push(`${def.emoji} ${mencion(proveedor)} hizo ${que} y quedó joya. Cobró *${precio} UruCoins* y suma experiencia de oficio.`);
  else lineas.push(`💥 ${mencion(proveedor)} metió mano en ${que} y lo dejó peor que antes. Cobró *${precio} UruCoins* igual (nivel ${nivel}: ${chanceDe(nivel)} % de que saliera bien). ${s.tipo === "bien" ? "Sigue roto: .service lo manda al taller del pueblo." : "Seguís lastimado."}`);
  if (proveedor) lineas.push(`_${mencion(s.cliente)}, contá cómo te atendió con .reseña 1 a 5._`);
  return { ok: true, texto: lineas.join("\n"), mentions: [s.cliente, ...(proveedor ? [proveedor] : [])], bien };
}

function pagar(s, proveedor, precio) {
  if (NECESIDADES[s.tipo].paga === "caja") {
    const e = db.prepare(`SELECT caja, nombre FROM empresas WHERE id = ?`).get(s.ref.empresa);
    if (!e) return { ok: false, error: "Esa empresa ya no existe." };
    if (e.caja < precio) return { ok: false, error: `En la caja de *${e.nombre}* hay ${e.caja} y son ${precio}: .caja depositar ${precio - e.caja}` };
    db.transaction(() => {
      db.prepare(`UPDATE empresas SET caja = caja - ? WHERE id = ?`).run(precio, s.ref.empresa);
      if (proveedor) ganarCoins(s.chat, proveedor, precio, "servicio_cobro");
    })();
    return { ok: true };
  }
  let ok = false;
  db.transaction(() => {
    if (!gastarCoins(s.chat, s.cliente, precio, "servicio_pago")) return;
    if (proveedor) ganarCoins(s.chat, proveedor, precio, "servicio_cobro");
    ok = true;
  })();
  return ok ? { ok: true } : { ok: false, error: `No te alcanza: son ${precio} y tenés ${getSaldoCoins(s.chat, s.cliente)}.` };
}

// What getting it done does.
function resolverNecesidad(s) {
  if (s.tipo === "bien") db.prepare(`UPDATE empresas_bienes SET estado = 100, roto = 0 WHERE id = ?`).run(s.ref.bien);
  if (s.tipo === "herido") curar(s.chat, s.cliente);
}

// ---------- the deadline ----------
// The pending work of a deal (lib/pendientes.js): not done in time, it goes to the town's own, if there's money for it.
// Returns what to tell the group, or null when it was done already.
export function vencerServicio(id, ahora = Date.now()) {
  const s = porId(id);
  if (!s || !["opciones", "esperando", "precio"].includes(s.estado) || s.vence > ahora) return null;
  const npcOpcion = s.opciones.at(-1);
  const r = hacer(s, { proveedor: "", precio: npcOpcion.precio, nombre: npcOpcion.nombre }, ahora);
  if (r.anulado) return null;
  if (r.ok) return { texto: `⏰ No se arregló nada a tiempo, ${mencion(s.cliente)}.\n${r.texto}`, mentions: r.mentions };
  guardar(s, { estado: "vencido" });
  return { texto: `⏰ ${mencion(s.cliente)}, no se arregló nada a tiempo y ni para ${npcOpcion.nombre.replace(/^El /, "el ").replace(/^La /, "la ")} alcanza: ${r.error}`, mentions: [s.cliente] };
}

// ---------- reviews ----------
// .reseña 4: whoever was served reviews the last job a person did for them, within RESENA_HORAS, once.
export function resenar(chat, cliente, estrellas, ahora = Date.now()) {
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) return { ok: false, error: "Las reseñas van de 1 a 5 estrellas: .reseña 4" };
  const s = db.prepare(`SELECT * FROM servicios WHERE chat = ? AND cliente = ? AND estado = 'hecho' AND proveedor != '' AND hecho >= ? ORDER BY hecho DESC LIMIT 1`).get(chat, cliente, ahora - SERVICIO.RESENA_HORAS * 3600e3);
  if (!s) return { ok: false, error: "No tenés ningún trabajo reciente de alguien del grupo para reseñar." };
  if (db.prepare(`SELECT 1 FROM servicios_resenas WHERE servicio = ?`).get(s.id)) return { ok: false, error: "Ese trabajo ya lo reseñaste." };
  db.prepare(`INSERT INTO servicios_resenas (servicio, chat, proveedor, cliente, estrellas, fecha) VALUES (?, ?, ?, ?, ?, ?)`).run(s.id, chat, s.proveedor, cliente, estrellas, ahora);
  const r = resenasDe(chat, s.proveedor);
  return { ok: true, texto: `${"⭐".repeat(estrellas)} para ${mencion(s.proveedor)}. Ya lleva ${String(r.promedio).replace(".", ",")} de promedio en ${r.n} ${r.n === 1 ? "reseña" : "reseñas"}.`, mentions: [s.proveedor] };
}

// ---------- the hurt ----------
// An errand gone wrong (lib/encargos.js), in a town: HERIDO_CHANCE % of someone getting hurt (their next wage is
// worth HERIDO_FACTOR, lib/laburos.js), offered a cure. Returns { texto, mentions } to add to the errand's outcome,
// or null.
export function quizasHerido(chat, usuario, ahora = Date.now()) {
  if (!puebloActivo(chat) || _dep.azar(100) >= SERVICIO.HERIDO_CHANCE) return null;
  db.prepare(`INSERT OR REPLACE INTO pueblo_heridos (chat, usuario, desde) VALUES (?, ?, ?)`).run(chat, usuario, ahora);
  const oferta = ofrecerServicio(chat, usuario, "herido", {}, ahora);
  return oferta ? { texto: `🤕 Y encima volvió con un tobillo a la miseria. ${npc(chat, "almacenera").replace(/^d/, "D")} ya anda diciendo que fue peor.\n${oferta.texto}`, mentions: oferta.mentions } : null;
}
