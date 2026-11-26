// Group odd jobs (changas): a job that needs a team. In the groups that switched them on (.changas on), Claudia posts
// one now and then on her own: "Cosecha de papas en Canelones, necesito 3, paga 120 c/u, se anotan en 30 minutos".
// People join by reacting to that message or with .anotarme. With the team complete in time everybody is paid, more
// with people of a kindred trade in it (a peón in a harvest), and sometimes something happens on the job (one of them
// gets clever and is paid double, the truck breaks down and they get half). With no team, nobody is paid and she
// makes fun of them.
// Anyone can post one too, paying for it from their pocket (.changa 3 50 Mudanza de la abuela): the money is taken on
// posting and goes back if the team doesn't form. Those pay exactly what was put in: no bonus and no event, so nobody
// mints coins by posting changas for their friends.
// So it isn't spam: hers are off unless the group asks for them, at most CHANGA.MAX_DIA a day inside the hours, one
// at a time, and never to a group that isn't talking right then.
// In a group that is a town (lib/pueblo.js), hers meet at one of its places and its events change what they pay (a
// drought, and the harvests pay more), and a changa done or left with no team is news for the Sunday paper.
// Every number is in CHANGA. The tables are in database-schema.js.
import { randomInt } from "crypto";
import { db, getChat, ganarCoins, gastarCoins, getSaldoCoins, chatsConOpcion, periodoCerrado, marcarPeriodoCerrado, crearPendiente, totalMensajesEntre, mensajesPorHora } from "../database-functions.js";
import { OFICIOS, laburoDe, nombreDeOficio } from "./laburos.js";
import { generoDe } from "./genero.js";
import { monedasActivas } from "./urucoins.js";
import { claveDia } from "./actividad.js";
import { leerEntero } from "./comandos.js";
import { esElBot } from "./identidad.js";
import { conexion } from "./conexion.js";
import { modificador, registrarHecho, lugarPara, eventosActivos } from "./pueblo.js";

export const CHANGA = {
  // Claudia's own
  MAX_DIA: 2, // at most this many a day per group; the day's hours are split in as many stretches, one in each
  PROBABILIDAD: 0.7, // odds of each of them being scheduled (with 2 and 0.7, about 1.4 a day)
  DESDE_HORA: 10, // they go out from 10:00 to 20:59
  HASTA_HORA: 21,
  MENSAJES_AYER: 30, // messages the group needs from the day before for any to be scheduled
  VIVO_MENSAJES: 5, // and in this hour and the one before for one to go out: no posting to a quiet group
  CUPOS_MIN: 2, // people one of hers needs
  CUPOS_MAX: 4,
  PAGA_MIN: 60, // what one of hers pays each, in steps of PAGA_PASO
  PAGA_MAX: 140,
  PAGA_PASO: 10,
  BONUS_AFIN: 0.1, // each member with a kindred trade adds this to everybody's pay
  BONUS_AFIN_MAX: 0.3,
  EVENTO_CHANCE: 30, // % of hers where something happens on the job (EVENTOS)
  // everybody's
  PLAZO_MIN: 30, // minutes to gather the team
  // posted by people (.changa)
  USUARIO_CUPOS_MIN: 2,
  USUARIO_CUPOS_MAX: 6,
  USUARIO_PAGA_MIN: 10, // each
  USUARIO_PAGA_MAX: 500,
  USUARIO_MAX_DIA: 3, // changas a person can post a day in a group
  TITULO_MIN: 4,
  TITULO_MAX: 80,
};

// The dice, here so the tests can load them.
export const _dep = { azar: (n) => randomInt(0, n) };
const alAzar = (lista) => lista[_dep.azar(lista.length)];

// Claudia's changas. afines are the trades (keys of OFICIOS) that make it pay more; hecho is how it went.
export const CHANGAS = [
  { clave: "papas", emoji: "🥔", titulo: "Cosecha de papas en Canelones", afines: ["peon", "feriante", "tambero"], hecho: "Sacaron las papas antes de que lloviera. Hay tierra hasta en el termo." },
  { clave: "mudanza", emoji: "📦", titulo: "Mudanza de un quinto piso sin ascensor en el Cordón", afines: ["camionero", "peon"], hecho: "Bajaron el ropero de la abuela por la escalera sin rayarlo. El piano, mejor ni preguntar." },
  { clave: "esquila", emoji: "🐑", titulo: "Esquila de apuro en una estancia de Durazno", afines: ["peon", "tambero"], hecho: "Trescientas ovejas peladas antes del mediodía. Ninguna quedó conforme con el corte." },
  { clave: "casamiento", emoji: "💒", titulo: "Atender un casamiento de 200 invitados en Atlántida", afines: ["mozo", "dj", "panadero"], hecho: "Salieron los 200 platos, sonó el vals y nadie se peleó hasta la torta." },
  { clave: "vendimia", emoji: "🍇", titulo: "Vendimia en una bodega de Las Piedras", afines: ["peon", "feriante"], hecho: "Cosecharon toda la uva. Lo que se tomaron después no figura en la planilla." },
  { clave: "tablado", emoji: "🎭", titulo: "Armar un tablado de carnaval en el Cerro", afines: ["dj", "mecanico", "streamer"], hecho: "El escenario quedó firme y las luces prendieron a la primera. La murga, agradecida." },
  { clave: "feria", emoji: "⛺", titulo: "Armar y desarmar la feria de Tristán Narvaja", afines: ["feriante", "camionero", "naranjita"], hecho: "Puestos armados a las cinco y desarmados a las tres. No sobró ni un cajón." },
  { clave: "censo", emoji: "📋", titulo: "Censo casa por casa en un barrio con muchos perros", afines: ["oficinista", "maestra", "politico"], hecho: "Censaron a todo el barrio, perros incluidos. Solo hubo que correr dos veces." },
  { clave: "playa", emoji: "🏖️", titulo: "Limpiar la playa de Piriápolis después del fin de semana largo", afines: ["guardavidas", "naranjita"], hecho: "Cuarenta bolsas de basura y una sombrilla sin dueño. La playa quedó como postal." },
  { clave: "ganado", emoji: "🐂", titulo: "Arrear una tropa por la ruta 26 hasta Tacuarembó", afines: ["peon", "tambero", "camionero"], hecho: "Llegó toda la tropa. Cortaron la ruta dos horas y nadie se animó a tocarles bocina." },
  { clave: "estadio", emoji: "🏟️", titulo: "Cortar el pasto y pintar las líneas del estadio antes del clásico", afines: ["futbolista", "peon"], hecho: "La cancha quedó como un billar. El área chica salió un poco torcida, pero que proteste el VAR." },
  { clave: "vacunacion", emoji: "💉", titulo: "Jornada de vacunación en la plaza de Minas", afines: ["enfermero", "maestra", "chofer"], hecho: "Vacunaron a medio pueblo. Lloraron tres gurises y un policía." },
  { clave: "aeropuerto", emoji: "🧳", titulo: "Llevar a una delegación entera al aeropuerto de Carrasco, con valijas", afines: ["taxista", "chofer", "camionero"], hecho: "Llegaron todos al vuelo. Una valija dio la vuelta por Pando, pero llegó." },
  { clave: "bizcochos", emoji: "🥐", titulo: "Hornear mil bizcochos para el desfile de Tacuarembó", afines: ["panadero", "mozo"], hecho: "Mil bizcochos, calentitos. Se contaron novecientos ochenta: los otros veinte fueron 'control de calidad'." },
  { clave: "taller", emoji: "🔧", titulo: "Poner a andar la flota de ómnibus antes del turno de las 5", afines: ["mecanico", "chofer"], hecho: "Arrancaron todos, alguno con alambre. Que lleguen a destino ya es otro contrato." },
  { clave: "acto", emoji: "📣", titulo: "Llenar un acto político en Paso de los Toros (hay choripán)", afines: ["politico", "streamer", "dj"], hecho: "El acto se llenó, o eso parece en la foto. El choripán alcanzó justo." },
];

// What can happen on one of Claudia's. factor multiplies everybody's pay; uno, only one member's (drawn).
// {uno} is that member, {todos} the whole team.
export const EVENTOS = [
  { clave: "vivo", uno: 2, texto: "😏 {uno} se hizo el vivo: pasó dos veces por la caja con distinta gorra y cobró doble." },
  { clave: "vivo", uno: 2, texto: "😏 {uno} le dijo al patrón que era el capataz. Capataz cobra doble." },
  { clave: "camion", factor: 0.5, texto: "🚚 A la vuelta se quedó el camión y hubo que pagar el remolque entre todos: cobran la mitad." },
  { clave: "camion", factor: 0.5, texto: "🌧️ Se largó a llover a mitad del trabajo y el patrón pagó medio jornal, 'porque medio día es medio día'." },
  { clave: "propina", factor: 1.5, texto: "🤑 El patrón quedó tan contento que pagó una vez y media. Dicen que estaba medio alegre." },
];

const BURLAS = [
  "Después dicen que no hay laburo.",
  "Así no levantamos el país, muchachos.",
  "Mucho quejarse del sueldo, pero para la changa no aparece nadie.",
  "El patrón se fue a buscar gente a otro grupo.",
  "Quedó la pala clavada, esperando.",
];

const mencion = (id) => `@${String(id).split("@")[0]}`;
const enLista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}` : xs[0] || "");
const personas = (n) => `${n} ${n === 1 ? "persona" : "personas"}`;
const plazo = () => `${CHANGA.PLAZO_MIN} minutos`;

// ---------- the table ----------
const porId = (id) => db.prepare(`SELECT * FROM changas WHERE id = ?`).get(id) || null;
export const changaAbierta = (chat) => db.prepare(`SELECT * FROM changas WHERE chat = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 1`).get(chat) || null;
export const anotadosEn = (id) => db.prepare(`SELECT usuario FROM changas_anotados WHERE changa = ? ORDER BY rowid`).all(id).map((r) => r.usuario);
const inicioDelDia = (ahora) => new Date(ahora).setHours(0, 0, 0, 0);
const deHoy = (chat, ahora, deClaudia) => db.prepare(`SELECT COUNT(*) AS n FROM changas WHERE chat = ? AND creada >= ? AND (creador = '') = ?`).get(chat, inicioDelDia(ahora), deClaudia ? 1 : 0).n;

function crear({ chat, creador = "", clave = "", titulo, cupos, paga, ahora }) {
  const vence = ahora + CHANGA.PLAZO_MIN * 60 * 1000;
  const id = db.prepare(`INSERT INTO changas (chat, creador, clave, titulo, cupos, paga, mensaje_id, vence, estado, creada) VALUES (?, ?, ?, ?, ?, ?, '', ?, 'abierta', ?)`).run(chat, creador, clave, titulo, cupos, paga, vence, ahora).lastInsertRowid;
  crearPendiente(chat, creador || "bot", "changa_vence", { id: Number(id) }, vence);
  return Number(id);
}

// The message a changa went out as: reacting to it is joining.
export function anotarMensajeDeChanga(id, mensajeId) {
  if (mensajeId) db.prepare(`UPDATE changas SET mensaje_id = ? WHERE id = ?`).run(mensajeId, id);
}

// ---------- Claudia's own ----------
const afinesEnPalabras = (afines) => enLista(afines.map((k) => OFICIOS[k].nombre.toLowerCase()));

function textoAnuncio(changa, banco) {
  const comun = `Se anotan reaccionando a este mensaje o con .anotarme, y tienen ${plazo()}.`;
  if (!changa.creador) {
    const donde = changa.chat ? lugarPara(changa.chat, "changa") : "";
    return `🧰 *CHANGA* — ${banco.emoji} ${changa.titulo}\n\nNecesito *${changa.cupos}* y pago *${changa.paga} UruCoins* a cada uno. ${comun}${donde ? `\n📍 La camioneta sale de ${donde}.` : ""}${extraDelPueblo(changa.chat, banco.clave)}\n_Si se junta el equipo cobran todos; si no, nadie. Rinde más con gente del rubro: ${afinesEnPalabras(banco.afines)}._`;
  }
  return `🧰 *CHANGA de ${mencion(changa.creador)}* — ${changa.titulo}\n\nNecesita *${changa.cupos}* y paga *${changa.paga} UruCoins* a cada uno, de su bolsillo. ${comun}\n_Si no se junta el equipo, nadie cobra y la plata le vuelve._`;
}

// What the town's events do to one of hers (lib/pueblo.js): "🏘️ Con la seca en el pueblo, paga 50 % más.", or "".
function extraDelPueblo(chat, clave) {
  if (!chat) return "";
  const factor = modificador(chat, `changa:${clave}`);
  const pct = Math.round((factor - 1) * 100);
  if (!pct) return "";
  const eventos = eventosActivos(chat).filter((e) => e.def.changa?.[clave]).map((e) => e.def.nombre.toLowerCase());
  return `\n🏘️ Con ${eventos.length ? `${eventos.join(" y ")} en el pueblo` : "lo que pasa en el pueblo"}, paga ${pct > 0 ? `${pct} % más` : `${-pct} % menos`}.`;
}

// Schedules the day's changas, once a day per group, as the lightning trivia does (lib/trivia-relampago.js): the
// hours are split in MAX_DIA stretches and each one is rolled for, at a random moment of its own stretch. Only in
// groups that talked the day before. Runs every 5 minutes from tareas-programadas.js.
export function programarChangasDelDia(ahora = new Date()) {
  if (ahora.getHours() < CHANGA.DESDE_HORA) return 0;
  const hoy = claveDia(ahora);
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  let agendadas = 0;
  for (const chat of chatsConOpcion("changas")) {
    if (!monedasActivas(chat)) continue; // not marked done: with the economy back on, the next pass schedules it
    if (periodoCerrado(chat, "changas_prog", hoy)) continue;
    marcarPeriodoCerrado(chat, "changas_prog", hoy);
    if (totalMensajesEntre(chat, [claveDia(ayer)]) < CHANGA.MENSAJES_AYER) continue;
    const abre = new Date(ahora).setHours(CHANGA.DESDE_HORA, 0, 0, 0);
    const cierra = new Date(ahora).setHours(CHANGA.HASTA_HORA, 0, 0, 0);
    const tramo = (cierra - abre) / CHANGA.MAX_DIA;
    for (let i = 0; i < CHANGA.MAX_DIA; i++) {
      const inicio = Math.max(ahora.getTime() + 60 * 1000, abre + i * tramo);
      const fin = abre + (i + 1) * tramo;
      if (fin <= inicio || Math.random() > CHANGA.PROBABILIDAD) continue;
      crearPendiente(chat, "bot", "changa_grupal", {}, inicio + Math.floor(Math.random() * (fin - inicio)));
      agendadas++;
    }
  }
  return agendadas;
}

// Is the group talking right now? Its messages of this hour and the one before (plugins/_actividad-horaria.js).
function grupoVivo(chat, ahora) {
  const hora = ahora.getHours();
  const porHora = new Map(mensajesPorHora(chat, [claveDia(ahora)]).map((r) => [r.hora, r.total]));
  return (porHora.get(hora) || 0) + (porHora.get(hora - 1) || 0) >= CHANGA.VIVO_MENSAJES;
}

// Called by the pending-work processor at the scheduled time (lib/pendientes.js). It was scheduled that morning, so
// everything is checked again: the switch, the economy, the hour (the bot may have been down), the group's own hours,
// that no other changa is open, the day's cap and that the group is talking. Returns the changa's id, or null.
export async function lanzarChangaDeClaudia(client, chat, ahora = new Date()) {
  const fila = getChat(chat);
  const hora = ahora.getHours();
  if (fila?.changas !== 1 || fila.monedas === 0 || fila.grupoCerradoPorHorario) return null;
  if (hora < CHANGA.DESDE_HORA || hora >= CHANGA.HASTA_HORA) return null;
  if (changaAbierta(chat) || deHoy(chat, ahora.getTime(), true) >= CHANGA.MAX_DIA) return null;
  if (!grupoVivo(chat, ahora)) return null;

  // Not the one this group got last.
  const ultima = db.prepare(`SELECT clave FROM changas WHERE chat = ? AND creador = '' ORDER BY id DESC LIMIT 1`).get(chat)?.clave;
  const banco = alAzar(CHANGAS.filter((c) => c.clave !== ultima));
  const cupos = CHANGA.CUPOS_MIN + _dep.azar(CHANGA.CUPOS_MAX - CHANGA.CUPOS_MIN + 1);
  const paga = CHANGA.PAGA_MIN + CHANGA.PAGA_PASO * _dep.azar((CHANGA.PAGA_MAX - CHANGA.PAGA_MIN) / CHANGA.PAGA_PASO + 1);
  // Sent before it's stored: a send that fails leaves nothing open, and the pending work tries again.
  const enviado = await client.sendMessage(chat, { text: textoAnuncio({ chat, creador: "", titulo: banco.titulo, cupos, paga }, banco) });
  const id = crear({ chat, clave: banco.clave, titulo: banco.titulo, cupos, paga, ahora: ahora.getTime() });
  anotarMensajeDeChanga(id, enviado?.key?.id);
  return id;
}

// ---------- posted by people ----------
const USO = () => `Se publica así: .changa 3 50 Mudanza de la abuela (necesitás 3 personas y le pagás 50 a cada una, de tu bolsillo). De ${CHANGA.USUARIO_CUPOS_MIN} a ${CHANGA.USUARIO_CUPOS_MAX} personas, de ${CHANGA.USUARIO_PAGA_MIN} a ${CHANGA.USUARIO_PAGA_MAX} cada una.`;

// .changa <people> <pay each> <what>: the whole pay is taken from the pocket now. Returns { ok, id, texto, mentions }
// with the announcement to send (the plugin notes the message with anotarMensajeDeChanga), or { ok: false, error }.
export function publicarChanga(chat, usuario, args, ahora = Date.now()) {
  const [cuantos, cuanto, ...resto] = args || [];
  const cupos = leerEntero(cuantos);
  const paga = leerEntero(cuanto);
  const titulo = resto.join(" ").replace(/\s+/g, " ").trim().slice(0, CHANGA.TITULO_MAX);
  if (cupos === null || paga === null || titulo.length < CHANGA.TITULO_MIN) return { ok: false, error: USO() };
  if (cupos < CHANGA.USUARIO_CUPOS_MIN || cupos > CHANGA.USUARIO_CUPOS_MAX) return { ok: false, error: `Una changa es para ${CHANGA.USUARIO_CUPOS_MIN} a ${CHANGA.USUARIO_CUPOS_MAX} personas.` };
  if (paga < CHANGA.USUARIO_PAGA_MIN || paga > CHANGA.USUARIO_PAGA_MAX) return { ok: false, error: `La paga va de ${CHANGA.USUARIO_PAGA_MIN} a ${CHANGA.USUARIO_PAGA_MAX} UruCoins por persona.` };
  if (changaAbierta(chat)) return { ok: false, error: "Ya hay una changa abierta en el grupo: de a una. Mirala con .changa" };
  const hoy = db.prepare(`SELECT COUNT(*) AS n FROM changas WHERE chat = ? AND creador = ? AND creada >= ?`).get(chat, usuario, inicioDelDia(ahora)).n;
  if (hoy >= CHANGA.USUARIO_MAX_DIA) return { ok: false, error: `Ya publicaste ${CHANGA.USUARIO_MAX_DIA} changas hoy. Mañana seguís dando trabajo.` };
  const total = cupos * paga;
  let id = null;
  db.transaction(() => {
    if (!gastarCoins(chat, usuario, total, "changa_publicada")) return;
    id = crear({ chat, creador: usuario, titulo, cupos, paga, ahora });
  })();
  if (id === null) return { ok: false, error: `Para pagarle ${paga} a ${personas(cupos)} hacen falta ${total} UruCoins y tenés ${getSaldoCoins(chat, usuario)}.` };
  return { ok: true, id, texto: textoAnuncio(porId(id), null), mentions: [usuario] };
}

// ---------- joining ----------
// Someone joins the group's open changa (.anotarme, or a reaction to its message). With the team complete, the job
// is done right there: hecha carries what to tell the group. Returns { ok, texto, mentions, hecha } or { ok: false,
// error }.
export function anotarse(chat, usuario, ahora = Date.now()) {
  const changa = changaAbierta(chat);
  if (!changa || changa.vence <= ahora) return { ok: false, error: "No hay ninguna changa abierta ahora." };
  if (changa.creador === usuario) return { ok: false, error: "La changa es tuya: vos ponés la plata, no la espalda." };
  const anotados = anotadosEn(changa.id);
  if (anotados.includes(usuario)) return { ok: false, error: `Ya estás en la lista. Van ${anotados.length} de ${changa.cupos}.` };
  db.prepare(`INSERT OR IGNORE INTO changas_anotados (changa, usuario) VALUES (?, ?)`).run(changa.id, usuario);
  const van = anotados.length + 1;
  if (van >= changa.cupos) {
    const hecha = hacerChanga(changa);
    return { ok: true, hecha, texto: hecha.texto, mentions: hecha.mentions };
  }
  const faltan = changa.cupos - van;
  return { ok: true, hecha: null, texto: `✍️ Anotado para «${changa.titulo}». Van ${van} de ${changa.cupos}: ${faltan === 1 ? "falta 1" : `faltan ${faltan}`}.`, mentions: [] };
}

// Someone takes their reaction back before the team is complete: off the list.
export function desanotarse(chat, usuario) {
  const changa = changaAbierta(chat);
  if (!changa) return false;
  return db.prepare(`DELETE FROM changas_anotados WHERE changa = ? AND usuario = ?`).run(changa.id, usuario).changes > 0;
}

// A reaction in a group (lib/reacciones.js): on the message of the group's open changa it's joining (or leaving, when
// it's taken back) and nothing else, so it pays no UruCoins nor ranking, as a vote of the aura duels. Returns whether
// the reaction was the changa's. Joining this way says nothing, unless it completes the team.
export function reaccionAChanga(client, { key, reaction } = {}) {
  const chat = key?.remoteJid;
  const changa = chat && key?.id ? changaAbierta(chat) : null;
  if (!changa?.mensaje_id || changa.mensaje_id !== key.id) return false;
  const quien = reaction?.key?.participant;
  if (!quien || reaction.key.fromMe || esElBot(quien, client)) return true;
  if (!reaction.text) {
    desanotarse(chat, quien);
    return true;
  }
  const r = anotarse(chat, quien);
  if (r.hecha) (client || conexion.client).sendMessage(chat, { text: r.texto, mentions: r.mentions }).catch((e) => console.error("[changas] no se pudo avisar la changa hecha:", e?.message || e));
  return true;
}

// ---------- the job ----------
// The team is complete: everybody is paid. One of Claudia's pays more with kindred trades in the team and may have
// an event; one of a person's pays what its owner put in, to the coin.
function hacerChanga(changa) {
  const equipo = anotadosEn(changa.id);
  const banco = CHANGAS.find((c) => c.clave === changa.clave) || null;
  const deClaudia = !changa.creador;
  const afines = deClaudia && banco ? equipo.filter((u) => banco.afines.includes(laburoDe(changa.chat, u)?.laburo)) : [];
  const bonus = Math.min(CHANGA.BONUS_AFIN_MAX, afines.length * CHANGA.BONUS_AFIN);
  const evento = deClaudia && _dep.azar(100) < CHANGA.EVENTO_CHANCE ? alAzar(EVENTOS) : null;
  const elVivo = evento?.uno ? alAzar(equipo) : null;
  // The town's events (lib/pueblo.js), on hers only: 1 with no town.
  const pueblo = deClaudia && banco ? modificador(changa.chat, `changa:${banco.clave}`) : 1;
  const pagas = new Map(equipo.map((u) => [u, Math.max(1, Math.round(changa.paga * (1 + bonus) * pueblo * (evento?.factor || 1) * (u === elVivo ? evento.uno : 1)))]));
  db.transaction(() => {
    db.prepare(`UPDATE changas SET estado = 'hecha' WHERE id = ?`).run(changa.id);
    for (const [u, paga] of pagas) ganarCoins(changa.chat, u, paga, "changa_paga");
  })();

  const lineas = [`🧰 *Changa hecha* — ${banco ? `${banco.emoji} ` : ""}${changa.titulo}`];
  if (banco) lineas.push(banco.hecho);
  if (evento) lineas.push(evento.texto.replace("{uno}", mencion(elVivo)).replace("{todos}", enLista(equipo.map(mencion))));
  if (afines.length) {
    const quienes = afines.map((u) => `${mencion(u)} (${nombreDeOficio(laburoDe(changa.chat, u).oficio, generoDe(u)).toLowerCase()})`);
    lineas.push(`💪 Con ${enLista(quienes)} en el equipo, que ${afines.length === 1 ? "es" : "son"} del rubro, rindió un ${Math.round(bonus * 100)} % más para todos.`);
  }
  const extra = pueblo !== 1 ? extraDelPueblo(changa.chat, banco.clave).trim() : "";
  if (extra) lineas.push(extra.replace("paga", "pagó"));
  registrarHecho(changa.chat, "changa_hecha", { usuario: equipo[0], equipo, titulo: changa.titulo, deClaudia });
  const montos = new Set(pagas.values());
  if (montos.size === 1) lineas.push(`🪙 ${enLista(equipo.map(mencion))} cobran *${[...montos][0]} UruCoins* cada uno.`);
  else lineas.push(`🪙 Cobran: ${enLista(equipo.map((u) => `${mencion(u)} *${pagas.get(u)}*`))} UruCoins.`);
  if (!deClaudia) lineas.push(`Pagó ${mencion(changa.creador)}, de su bolsillo.`);
  return { texto: lineas.join("\n"), mentions: [...equipo, ...(deClaudia ? [] : [changa.creador])], pagas, evento: evento?.clave || null, bonus };
}

// The pending work of a changa (lib/pendientes.js), at its deadline: still open, the team didn't form. Nobody is paid,
// whoever posted it gets the money back, and the group is told. null when it was done already.
export function vencerChanga(id, ahora = Date.now()) {
  const changa = porId(id);
  if (!changa || changa.estado !== "abierta" || changa.vence > ahora) return null;
  const equipo = anotadosEn(changa.id);
  const total = changa.cupos * changa.paga;
  db.transaction(() => {
    db.prepare(`UPDATE changas SET estado = 'vencida' WHERE id = ?`).run(changa.id);
    if (changa.creador) ganarCoins(changa.chat, changa.creador, total, "changa_devolucion");
  })();
  registrarHecho(changa.chat, "changa_vacia", { titulo: changa.titulo, anotados: equipo.length, cupos: changa.cupos });
  const seAnotaron = equipo.length === 0 ? "No se anotó nadie" : `${equipo.length === 1 ? "Se anotó" : "Se anotaron"} ${enLista(equipo.map(mencion))}, y hacían falta ${changa.cupos}`;
  const lineas = [`🦗 La changa «${changa.titulo}» quedó sin equipo. ${seAnotaron}: nadie cobra.`, alAzar(BURLAS)];
  if (changa.creador) lineas.push(`A ${mencion(changa.creador)} le vuelven sus ${total} UruCoins.`);
  return { texto: lineas.join("\n"), mentions: [...equipo, ...(changa.creador ? [changa.creador] : [])] };
}

// ---------- .changa / .changas ----------
// How the changas stand in the group: the open one, if any, and how they work.
export function textoChangas(chat, ahora = Date.now()) {
  const fila = getChat(chat);
  const prendidas = fila?.changas === 1;
  const partes = [];
  const changa = changaAbierta(chat);
  if (changa && changa.vence > ahora) {
    const equipo = anotadosEn(changa.id);
    const minutos = Math.max(1, Math.ceil((changa.vence - ahora) / 60000));
    partes.push(`🧰 *Changa abierta*${changa.creador ? ` de ${mencion(changa.creador)}` : ""}: ${changa.titulo}\nPaga *${changa.paga} UruCoins* a cada uno y hacen falta ${changa.cupos}. ${equipo.length ? `Van ${equipo.length}: ${enLista(equipo.map(mencion))}` : "Todavía no se anotó nadie"}. ${minutos === 1 ? "Queda 1 minuto" : `Quedan ${minutos} minutos`}: .anotarme, o reaccionando al mensaje de la changa.`);
  } else partes.push("🧰 Ahora no hay ninguna changa abierta.");
  partes.push(
    prendidas
      ? `Las mías están *prendidas*: cada tanto publico una (hasta ${CHANGA.MAX_DIA} por día, de ${CHANGA.DESDE_HORA} a ${CHANGA.HASTA_HORA} y solo si el grupo está charlando). Si se junta el equipo en ${plazo()} cobran todos, y más con gente del rubro. Un admin las apaga con .changas off`
      : `Las mías están *apagadas*: prendidas, cada tanto publico una changa que necesita equipo (hasta ${CHANGA.MAX_DIA} por día, de ${CHANGA.DESDE_HORA} a ${CHANGA.HASTA_HORA} y solo si el grupo está charlando). Un admin las prende con .changas on`,
  );
  partes.push(`Cualquiera puede publicar una pagándola: .changa 3 50 Mudanza de la abuela (3 personas, 50 a cada una; la plata se descuenta al publicar y vuelve si no se junta el equipo).`);
  const mentions = changa && changa.vence > ahora ? [...anotadosEn(changa.id), ...(changa.creador ? [changa.creador] : [])] : [];
  return { texto: partes.join("\n\n"), mentions };
}
