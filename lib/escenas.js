// Payday scenes: some of the times someone collects their wage (.cobrar, lib/laburos.js), instead of the day's random
// event they get a scene of their trade with two or three numbered options: "te para la caminera con exceso de carga:
// 1 coimear, 2 discutir, 3 pagar la multa". They answer with the number (or .elegir 2) within a while; with no answer,
// it resolves on its own with the scene's "do nothing" option.
// Each option's chance, what it pays (a multiplier on the day's wage) and what it does to the person's fame are in the
// bank (lib/escenas-banco.js), and the outcome is rolled here: the AI decides nothing.
// The fame has two axes, moved by what one chooses: honesto ↔ pícaro and cagón ↔ valiente. Past a threshold, the trade
// and the fame make a nickname ("el Coimero de la Ruta 5"), shown in .perfil and .baltop and told to Claudia with the
// trade. The fame also changes the scenes to come: a known pícaro gets inspected more often, and each fame has scenes
// of its own.
// In a group that is a town (lib/pueblo.js), what's chosen where somebody inspects is the town's business: a crooked
// option lowers its safety and the comisario takes note, and once he knows someone he's the one inspecting them, and
// their crooked options are harder. A nickname earned is news for the Sunday paper.
// Every number is in ESCENA. The tables are in database-schema.js.
import { randomInt } from "crypto";
import { db, ganarCoins, getSaldoCoins, crearPendiente } from "../database-functions.js";
import { laburoDe, cobrar, jornalDe, anotarCobro, notasDelCobro, yaCobroHoy } from "./laburos.js";
import { generoDe } from "./genero.js";
import { monedasActivas } from "./urucoins.js";
import { ESCENAS, ESCENAS_GENERALES, APODOS } from "./escenas-banco.js";
import { PUEBLO, registrarHecho, recordar, memoriaDe, npc, puebloActivo } from "./pueblo.js";
import { usarAbogado, alegato, comoLlega } from "./tienda.js";

export const ESCENA = {
  CHANCE: 33, // % of the paydays that come as a scene instead of the plain event: one in three
  PLAZO_MIN: 10, // minutes to answer; after that it resolves on its own with the "do nothing" option
  FAMA_MAX: 10, // each axis goes from −FAMA_MAX to +FAMA_MAX
  FAMA_UMBRAL: 4, // from here on, on either side, the fame is known: a nickname, scenes of its own, more inspections
  // How likely each scene is to be the one dealt, against the others it could be.
  PESO_OFICIO: 2, // one of the trade's own
  PESO_GENERAL: 1, // one for any trade
  PESO_FAMA: 3, // one only that fame gets (pide)
  PESO_CONTROL_PICARO: 3, // times a scene where somebody inspects (control) weighs for a known pícaro
  PESO_CONTROL_HONESTO: 0.5, // and for a known honesto
  // What the bank has to keep to (test/escenas.test.mjs): the multipliers, and what an option pays on average.
  MULT_MIN: 0.25,
  MULT_MAX: 2.5,
  VALOR_MIN: 0.7,
  VALOR_MAX: 1.4,
};

// The dice, here so the tests can load them.
export const _dep = { azar: (n) => randomInt(0, n), pueblo: (chat) => puebloActivo(chat) };

// The four fames: which axis and which side of it, and how it's said of a man (or of anybody) and of a woman.
export const POLOS = {
  picaro: { eje: "picaro", signo: 1, nombre: ["pícaro", "pícara"] },
  honesto: { eje: "picaro", signo: -1, nombre: ["honesto", "honesta"] },
  valiente: { eje: "valiente", signo: 1, nombre: ["valiente", "valiente"] },
  cagon: { eje: "valiente", signo: -1, nombre: ["cagón", "cagona"] },
};
const enGenero = (formas, genero) => (Array.isArray(formas) ? formas[genero === "mujer" ? 1 : 0] : formas);
const poloDe = (eje, valor) => Object.keys(POLOS).find((k) => POLOS[k].eje === eje && POLOS[k].signo === Math.sign(valor));
const NUMEROS = ["1️⃣", "2️⃣", "3️⃣"];

// ---------- fame ----------
export function famaDe(chat, usuario) {
  return db.prepare(`SELECT picaro, valiente, escenas, ultima FROM laburos_fama WHERE chat = ? AND usuario = ?`).get(chat, usuario) || { picaro: 0, valiente: 0, escenas: 0, ultima: "" };
}

// The fames someone is known for (past the threshold), the strongest first; on a tie, honesto ↔ pícaro comes first.
export function polosDe(fama) {
  return ["picaro", "valiente"]
    .filter((eje) => Math.abs(fama[eje]) >= ESCENA.FAMA_UMBRAL)
    .sort((a, b) => Math.abs(fama[b]) - Math.abs(fama[a]))
    .map((eje) => poloDe(eje, fama[eje]));
}

// The nickname their trade and their strongest fame make, or "" with no trade or no fame to speak of. It isn't
// stored: change trades and the fame follows, with the new trade's nickname.
export function apodoDe(chat, usuario) {
  const laburo = laburoDe(chat, usuario);
  const [polo] = polosDe(famaDe(chat, usuario));
  if (!laburo || !polo) return "";
  return enGenero(APODOS[laburo.laburo]?.[polo], generoDe(usuario)) || "";
}

function moverFama(chat, usuario, rep, clave) {
  const fama = famaDe(chat, usuario);
  const tope = (n) => Math.max(-ESCENA.FAMA_MAX, Math.min(ESCENA.FAMA_MAX, n));
  db.prepare(`INSERT INTO laburos_fama (chat, usuario, picaro, valiente, escenas, ultima) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(chat, usuario) DO UPDATE SET picaro = excluded.picaro, valiente = excluded.valiente, escenas = escenas + 1, ultima = excluded.ultima`)
    .run(chat, usuario, tope(fama.picaro + (rep.picaro || 0)), tope(fama.valiente + (rep.valiente || 0)), clave);
}

// "+2 pícaro, +1 cagón": what an option moved, each axis by the side it went to.
function textoMovida(rep, genero) {
  return ["picaro", "valiente"]
    .filter((eje) => rep[eje])
    .map((eje) => `+${Math.abs(rep[eje])} ${enGenero(POLOS[poloDe(eje, rep[eje])].nombre, genero)}`)
    .join(", ");
}

// For .perfil: "🎭 Fama: *el Coimero de la Ruta 5* · pícaro 6, valiente 2 (de 10)", or "" for whoever has none yet.
export function lineaDeFama(chat, usuario) {
  const fama = famaDe(chat, usuario);
  const genero = generoDe(usuario);
  const ejes = ["picaro", "valiente"].filter((eje) => fama[eje]).map((eje) => `${enGenero(POLOS[poloDe(eje, fama[eje])].nombre, genero)} ${Math.abs(fama[eje])}`);
  if (!ejes.length) return "";
  const apodo = apodoDe(chat, usuario);
  return `🎭 Fama: ${apodo ? `*${apodo}* · ` : ""}${ejes.join(", ")} (de ${ESCENA.FAMA_MAX})`;
}

// For Claudia's prompt, next to the trade (plugins/_auto-ia.js): the nickname and what it's for. "" with none.
export function famaParaPrompt(chat, usuario, nombre) {
  const apodo = apodoDe(chat, usuario);
  if (!apodo) return "";
  const [polo] = polosDe(famaDe(chat, usuario));
  return `Por cómo labura, en ese juego ${nombre} se ganó fama de ${enGenero(POLOS[polo].nombre, generoDe(usuario))} y el apodo "${apodo}". Podés cargarle con eso si viene al caso, sin forzarlo.`;
}

// ---------- the scenes ----------
// A scene by its key ("camionero/caminera", "general/paro"), or null if the bank no longer has it.
export function buscarEscena(clave) {
  const [grupo, id] = String(clave || "").split("/");
  return (grupo === "general" ? ESCENAS_GENERALES : ESCENAS[grupo] || []).find((e) => e.id === id) || null;
}

// The scenes someone of that trade and that fame can get, each with its weight. The last one they got is left out.
export function escenasPara(oficio, fama) {
  const polos = polosDe(fama);
  const control = polos.includes("picaro") ? ESCENA.PESO_CONTROL_PICARO : polos.includes("honesto") ? ESCENA.PESO_CONTROL_HONESTO : 1;
  return [
    ...(ESCENAS[oficio] || []).map((escena) => ({ clave: `${oficio}/${escena.id}`, escena, peso: ESCENA.PESO_OFICIO })),
    ...ESCENAS_GENERALES.filter((escena) => !escena.pide || polos.includes(escena.pide)).map((escena) => ({ clave: `general/${escena.id}`, escena, peso: escena.pide ? ESCENA.PESO_FAMA : ESCENA.PESO_GENERAL })),
  ]
    .filter((c) => c.clave !== fama.ultima)
    .map((c) => ({ ...c, peso: c.escena.control ? c.peso * control : c.peso }));
}

function sortearEscena(oficio, fama) {
  const candidatas = escenasPara(oficio, fama);
  // In tenths, so the half weights count.
  const pesos = candidatas.map((c) => Math.max(1, Math.round(c.peso * 10)));
  let tiro = _dep.azar(pesos.reduce((s, p) => s + p, 0));
  return candidatas.find((_, i) => (tiro -= pesos[i]) < 0) || candidatas[0];
}

export const escenaAbierta = (chat, usuario) => db.prepare(`SELECT * FROM laburos_escenas WHERE chat = ? AND usuario = ?`).get(chat, usuario) || null;

const opcionPasiva = (escena) => escena.opciones.find((o) => o.pasiva);

// Whether the town's comisario knows someone (lib/pueblo.js): then, in a scene where somebody inspects, he's the one.
const lojuna = (chat, usuario, escena) => Boolean(escena?.control) && memoriaDe(chat, "comisario", usuario).veces >= PUEBLO.COMISARIO_JUNA;
const comoContestar = (escena) => `Contestá con el número (o .elegir ${escena.opciones.length > 2 ? 2 : 1})`;

// .cobrar for whoever collects their own trade's wage (plugins/coins-laburos.js): the plain payday (cobrar), or a
// scene in its place. With a scene, the day is taken and counts towards the level now, and the wage is paid when it
// resolves. Returns what cobrar returns, with escena: true when a scene opened: then the plugin notes the message it
// went out as (anotarMensajeDeEscena).
export function cobrarConEscena(chat, usuario, ahora = Date.now()) {
  const abierta = escenaAbierta(chat, usuario);
  if (abierta) {
    // Its time is up and the pending work hasn't got to it yet: it resolves now.
    if (abierta.vence <= ahora) return { ok: true, mensaje: resolver(abierta, null, { sola: true }).texto };
    const escena = buscarEscena(abierta.escena);
    return { ok: false, error: `Primero resolvé la escena de hoy, que el sueldo depende de eso. ${escena ? comoContestar(escena) : "Contestá con el número"}.` };
  }
  const actual = laburoDe(chat, usuario);
  // Only in a group that is a town (.pueblo on): with it off, .cobrar stays as it always was.
  if (!actual || yaCobroHoy(actual) || !_dep.pueblo(chat) || _dep.azar(100) >= ESCENA.CHANCE) return cobrar(chat, usuario);

  const { clave, escena } = sortearEscena(actual.laburo, famaDe(chat, usuario));
  const jornal = jornalDe(chat, usuario, actual);
  const vence = ahora + ESCENA.PLAZO_MIN * 60 * 1000;
  db.transaction(() => {
    anotarCobro(chat, usuario);
    db.prepare(`INSERT OR REPLACE INTO laburos_escenas (chat, usuario, escena, jornal, mensaje_id, vence) VALUES (?, ?, ?, ?, '', ?)`).run(chat, usuario, clave, jornal.jornal, vence);
    crearPendiente(chat, usuario, "escena_laburo", {}, vence);
  })();

  const notas = notasDelCobro(actual, usuario, jornal);
  const opciones = escena.opciones.map((o, i) => `${NUMEROS[i]} ${o.nombre}`).join("\n");
  const pasiva = opcionPasiva(escena);
  const comisario = lojuna(chat, usuario, escena) ? `\n\n👮 Y el que controla es ${npc(chat, "comisario")}, que ya te tiene junado: «¿Otra vez vos?». Lo pícaro te sale ${PUEBLO.COMISARIO_CASTIGO} puntos más difícil.` : "";
  // Whoever has a car or a pet (lib/tienda.js) arrives in it.
  const llega = comoLlega(chat, usuario, { vos: true });
  return {
    ok: true,
    escena: true,
    mensaje: `${actual.oficio.emoji} *Hoy el sueldo viene con escena*${llega ? ` _(llegaste ${llega})_` : ""}\n\n${escena.texto}${comisario}\n\n${opciones}\n\n🪙 En juego, tu jornal de hoy: ${Math.max(1, Math.round(jornal.jornal))} UruCoins${notas.racha}${notas.nivel}. Según qué elijas y cómo salga, cobrás más o menos.\n_${comoContestar(escena)}. Tenés ${ESCENA.PLAZO_MIN} minutos; si no, va la ${escena.opciones.indexOf(pasiva) + 1}._${notas.dinamico}${notas.subida}`,
  };
}

// The message a scene went out as: a number quoting it is an answer to it, whatever else is being played.
export function anotarMensajeDeEscena(chat, usuario, mensajeId) {
  if (mensajeId) db.prepare(`UPDATE laburos_escenas SET mensaje_id = ? WHERE chat = ? AND usuario = ?`).run(mensajeId, chat, usuario);
}

// Closes a scene with an option (null: its "do nothing" one), rolls how it went, pays and moves the fame.
function resolver(abierta, opcion, { sola = false } = {}) {
  const { chat, usuario } = abierta;
  const escena = buscarEscena(abierta.escena);
  const elegida = opcion || (escena && opcionPasiva(escena));
  const genero = generoDe(usuario);
  const antes = apodoDe(chat, usuario);
  // A scene the bank no longer has (it was open through an update) pays the plain wage.
  // The comisario who knows them makes the crooked options harder (lib/pueblo.js).
  const castigo = (elegida?.rep?.picaro || 0) > 0 && lojuna(chat, usuario, escena) ? PUEBLO.COMISARIO_CASTIGO : 0;
  const salioBien = !elegida?.mal || _dep.azar(100) < elegida.chance - castigo;
  const [multDado, texto] = elegida ? (salioBien ? elegida.bien : elegida.mal) : [1, "Día normal, cobraste tu sueldo."];
  // Where somebody inspects, going badly is a fine: a lawyer from the shop (lib/tienda.js) gets them the plain wage.
  const abogado = Boolean(escena?.control) && !salioBien && multDado < 1 && usarAbogado(chat, usuario);
  const mult = abogado ? 1 : multDado;
  const cobrado = Math.max(1, Math.round(abierta.jornal * mult));
  db.transaction(() => {
    db.prepare(`DELETE FROM laburos_escenas WHERE chat = ? AND usuario = ?`).run(chat, usuario);
    ganarCoins(chat, usuario, cobrado, "sueldo_laburo");
    moverFama(chat, usuario, elegida?.rep || {}, abierta.escena);
  })();

  const lineas = [];
  if (sola) lineas.push(`⏰ @${usuario.split("@")[0]} no contestó a tiempo y la escena se resolvió sola.`);
  lineas.push(`${laburoDe(chat, usuario)?.oficio.emoji || "💼"} ${elegida ? `*${elegida.nombre}.* ` : ""}${texto}`);
  if (abogado) lineas.push(`⚖️ Pero tu abogado ${alegato()}, y te sacó de la multa: cobrás el jornal entero.`);
  lineas.push(`🪙 Cobraste *${cobrado} UruCoins*${mult === 1 ? "" : ` (el jornal ×${String(mult).replace(".", ",")})`}. Tenés ${getSaldoCoins(chat, usuario)}.`);
  const movida = textoMovida(elegida?.rep || {}, genero);
  if (movida) lineas.push(`🎭 Fama: ${movida}.`);
  const despues = apodoDe(chat, usuario);
  contarAlPueblo(chat, usuario, escena, elegida, { salioBien, apodo: despues !== antes ? despues : "" });
  if (despues && despues !== antes) lineas.push(`🏷️ Te ganaste un apodo: de ahora en más, en este grupo sos *${despues}*.`);
  else if (antes && !despues) lineas.push(`🏷️ Se te lavó la fama: ya nadie te dice ${antes}.`);
  return { ok: true, texto: lineas.join("\n"), mentions: sola ? [usuario] : [], cobrado, mult, salioBien };
}

// What a scene was for the town, where the group is one (lib/pueblo.js; nothing otherwise): where somebody inspects,
// a crooked option is a bribe the comisario takes note of and the straight one makes the town a little safer; a
// nickname earned is news.
function contarAlPueblo(chat, usuario, escena, elegida, { salioBien, apodo }) {
  const picaro = elegida?.rep?.picaro || 0;
  if (escena?.control && picaro > 0) {
    registrarHecho(chat, "coima", { usuario, escena: escena.id, salioBien });
    recordar(chat, "comisario", usuario, "coima");
  } else if (escena?.control && picaro < 0) registrarHecho(chat, "honestidad", { usuario });
  if (apodo) registrarHecho(chat, "apodo", { usuario, apodo });
}

// Someone's answer to their open scene: the option's number. null with no scene open.
export function elegirEnEscena(chat, usuario, numero) {
  const abierta = escenaAbierta(chat, usuario);
  if (!abierta) return null;
  const escena = buscarEscena(abierta.escena);
  if (!escena) return resolver(abierta, null);
  const opcion = escena.opciones[numero - 1];
  if (!Number.isInteger(numero) || !opcion) return { ok: false, error: `Las opciones van del 1 al ${escena.opciones.length}.` };
  return resolver(abierta, opcion);
}

// The pending work of a scene (lib/pendientes.js), at the time it was due: still open, it resolves on its own.
// Returns what to say in the group, or null: it was answered already, or the group turned the economy off meanwhile
// (the wage is paid all the same, without a word).
export function vencerEscena(chat, usuario, ahora = Date.now()) {
  const abierta = escenaAbierta(chat, usuario);
  if (!abierta || abierta.vence > ahora) return null;
  const r = resolver(abierta, null, { sola: true });
  return monedasActivas(chat) ? r : null;
}
