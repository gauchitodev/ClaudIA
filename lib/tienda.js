// UruCoins shop: the item catalogue, buying, and spending each effect.
// Besides the game items (Escudo, Racha doble, Voto doble) and the Apodo, it sells status: WhatsApp lets nothing sit
// next to a name, so the status shows in what Claudia does and says. A signature reaction (firma: Claudia reacts to
// some of your messages with your emoji), a grand entrance (entrada: your first message of the day, she welcomes you
// with your phrase), a paid notice or gossip in the town's Sunday paper (aviso, chisme), the statue in the plaza
// (estatua: whoever puts the most, the previous one is knocked down), an informant (informante: a tip about the open
// secret mission), a lawyer (abogado: gets you out of one fine) and a bodyguard (guardaespaldas: some days safe from
// sabotage and robberies), and goods (casa, auto, mascota with a name of its own) that .perfil shows and that the
// scenes, the errands and the paper bring up. The town's things (the notice, the statue, the car being stolen) only
// where the group is a town (lib/pueblo.js).
// Every price and number is in ITEMS and TIENDA, up here, to be adjusted. The tables are in database-schema.js.
import { randomInt } from "crypto";
import { db, gastarCoins, ganarCoins, getSaldoCoins, getItem, getInventario, agregarItem, consumirItem, borrarItem, updateUser, getChat, chatsConOpcion, periodoCerrado, marcarPeriodoCerrado, crearPendiente, mensajesPorHora } from "../database-functions.js";
import { etiquetaLaburo, laburoDe } from "./laburos.js";
import { PUEBLO, puebloActivo, estadoDe, registrarHecho, modificador, estatuaDe, sumarArcas, recordar } from "./pueblo.js";
import { misionAbierta } from "./espias.js";
import { generoDe } from "./genero.js";
import { claveDia } from "./actividad.js";
import { nombreDe } from "./menciones.js";

const DIA_MS = 24 * 60 * 60 * 1000;

// Status, signs and services: what each costs and how it works.
export const TIENDA = {
  // the signature reaction
  FIRMA_DIAS: 7,
  FIRMA_PERMANENTE: 400, // "para siempre" costs this instead of the item's price
  FIRMA_CHANCE: 10, // % of one's messages Claudia reacts to: about one in ten...
  FIRMA_TOPE_DIA: 5, // ...and no more than this many a day
  // the grand entrance
  ENTRADA_DIAS: 7,
  ENTRADA_FRASE_MAX: 80,
  ENTRADA_ACTIVO: 30, // with this many messages in the group in this hour and the one before, it's busy...
  ENTRADA_CHANCE_ACTIVO: 30, // ...and then only this % of the entrances are announced
  ENTRADAS_GRUPO_DIA: 6, // and no more than this many a day in a group
  // the notices in the Sunday paper
  AVISO_MAX: 160, // letters
  AVISOS_EDICION: 3, // notices an edition prints (the oldest first); the rest wait for the next one
  AVISOS_PERSONA: 1, // waiting at once, per person
  // the statue
  ESTATUA_BASE: 500, // the first one in a plaza
  ESTATUA_SUBA: 1.25, // knocking one down takes putting this many times what it cost
  // the bodyguard and the car
  GUARDAESPALDAS_DIAS: 3,
  AUTO_ROBO_FACTOR: 0.5, // a day's chance of a car being stolen in a town: the town's robbery % times this
  AUTO_SEGURO: 25, // % of what the car cost the insurance pays back
  ROBO_DESDE_HORA: 10, // the car is stolen in the daytime, as the town's events start
  ROBO_HASTA_HORA: 21,
};

// The dice, here so the tests can load them.
export const _dep = { azar: (n) => randomInt(0, n) };
const alAzar = (lista) => lista[_dep.azar(lista.length)];

// The emojis one can sign with: one code point each, and none Claudia already uses for something (🔥 the streak, 🪙
// today's question, ✅ the trivia, 📩 the envelopes).
export const EMOJIS_FIRMA = ["🦄", "👑", "🌵", "🐐", "🧉", "🎸", "🦩", "🍀", "💎", "🐉", "🦁", "🍷", "🚀", "🎩", "🦚", "🐺", "🌻", "⚡", "🥩", "🐊", "🦉", "🍕", "🌶", "🎺", "🛸", "🐙", "🦖", "🍩", "🥊", "🧲"];

// The goods: the house and the car go up a step at a time; the pet is one, with a name of its own.
export const CASAS = [
  { clave: "rancho", nombre: "Rancho", emoji: "🛖", precio: 150, compra: "Un rancho de terrón con techo de paja y un aljibe. Humilde, pero con vista al campo." },
  { clave: "chalet", nombre: "Chalet", emoji: "🏡", precio: 450, compra: "Chalet con parrillero, jardín y un enano de yeso en la entrada. Ya sos de los que tienen." },
  { clave: "estancia", nombre: "Estancia", emoji: "🏰", precio: 1200, compra: "Una estancia con casco, monte de eucaliptos y capataz. El pueblo te saluda con la boina en la mano." },
];
export const AUTOS = [
  { clave: "fusca", nombre: "Fusca", emoji: "🚗", precio: 120, compra: "Un Fusca del 72 que arranca en bajada y tiene una estampita del Sagrado Corazón." },
  { clave: "camioneta", nombre: "Camioneta", emoji: "🛻", precio: 400, compra: "Una camioneta doble cabina con barra antivuelco. Para ir al almacén, obviamente." },
  { clave: "importado", nombre: "Importado", emoji: "🏎️", precio: 1000, compra: "Un importado que no entra por la calle de tierra, pero que se ve desde la ruta." },
];
export const MASCOTAS = {
  perro: { nombre: "perro", emoji: "🐕", precio: 60 },
  gato: { nombre: "gato", emoji: "🐈", precio: 60 },
  loro: { nombre: "loro", emoji: "🦜", precio: 80 },
  chancho: { nombre: "chancho", emoji: "🐖", precio: 90 },
  carpincho: { nombre: "carpincho", emoji: "🦫", precio: 150 },
  caballo: { nombre: "caballo criollo", emoji: "🐎", precio: 250 },
  nandu: { nombre: "ñandú", emoji: "🐦", precio: 200 },
};

// The shelves of .tienda, in this order.
export const CATEGORIAS = [
  { clave: "juego", nombre: "🎲 Para jugar" },
  { clave: "estatus", nombre: "✨ Para que se note" },
  { clave: "pueblo", nombre: "🏘️ Del pueblo" },
  { clave: "servicios", nombre: "🕴️ Servicios" },
  { clave: "bienes", nombre: "🏠 Bienes" },
];

// Catalogue. "max" = how many can be held at once (keeps anyone from betting risk-free with 10 shields).
export const ITEMS = {
  escudo: {
    nombre: "Escudo",
    emoji: "🛡️",
    precio: 25,
    max: 1,
    categoria: "juego",
    reintegro: 25, // refunds up to this; more than its price would make betting with a shield positive-expectation (on a straight-up, above all)
    desc: "Si perdés una apuesta (ruleta, tragamonedas, mines, carrera, blackjack, duelos, 4 en línea o mercados), te devuelve lo apostado, hasta 25. Se usa solo, una vez.",
  },
  racha: {
    nombre: "Racha doble",
    emoji: "🔥",
    precio: 40,
    max: 1,
    categoria: "juego",
    desc: "24 horas ganando el doble por reacciones y por ganar juegos.",
  },
  votodoble: {
    nombre: "Voto doble",
    emoji: "✌️",
    precio: 15,
    max: 3,
    categoria: "juego",
    desc: "Tu próxima reacción a una historia, queja o recomendación vale por dos.",
  },
  apodo: {
    nombre: "Apodo",
    emoji: "🏷️",
    precio: 30,
    categoria: "estatus",
    desc: "Claudia te llama como vos quieras. Ej: .comprar apodo Tito",
  },
  firma: {
    nombre: "Reacción firma",
    emoji: "💫",
    precio: 60,
    categoria: "estatus",
    desc: `Elegís tu emoji (uno que nadie del grupo tenga) y Claudia le reacciona con ese a algunos de tus mensajes. ${TIENDA.FIRMA_DIAS} días, o para siempre por ${TIENDA.FIRMA_PERMANENTE}. Ej: .comprar firma 🦄 (o .comprar firma 🦄 siempre)`,
  },
  entrada: {
    nombre: "Entrada triunfal",
    emoji: "🎺",
    precio: 50,
    categoria: "estatus",
    desc: `${TIENDA.ENTRADA_DIAS} días en que tu primer mensaje del día lo recibe Claudia con tu frase (si el grupo está a los gritos, no siempre). Ej: .comprar entrada llegó el patrón de la ruta 5`,
  },
  aviso: {
    nombre: "Clasificado en El Eco",
    emoji: "📢",
    precio: 40,
    categoria: "pueblo",
    pueblo: true,
    desc: "Un aviso en el diario del domingo, marcado como aviso pago. Nada de teléfonos ni datos de nadie; un admin lo puede vetar. Ej: .comprar aviso Vendo bicicleta con una rueda sola, ideal para equilibristas",
  },
  chisme: {
    nombre: "Chisme en El Eco",
    emoji: "🗣️",
    precio: 60,
    categoria: "pueblo",
    pueblo: true,
    desc: "Un chisme en el diario del domingo, firmado por vos y marcado como pago. Sin acusaciones graves ni datos de nadie; un admin lo puede vetar. Ej: .comprar chisme dicen que el intendente baila cumbia a escondidas",
  },
  estatua: {
    nombre: "Estatua en la plaza",
    emoji: "🗿",
    precio: TIENDA.ESTATUA_BASE,
    categoria: "pueblo",
    pueblo: true,
    desc: `Tu estatua en la plaza del pueblo, en .pueblo y en el diario hasta que alguien ponga más: tirarla cuesta ${Math.round((TIENDA.ESTATUA_SUBA - 1) * 100)} % más de lo que costó, y la plata va a las arcas del pueblo. Ej: .comprar estatua (o .comprar estatua 800, para ponerle más)`,
  },
  informante: {
    nombre: "Informante",
    emoji: "🕵️",
    precio: 40,
    categoria: "servicios",
    desc: "Una pista sobre el espía del sobre abierto (la misión secreta), nunca el nombre. Una por sobre por persona, y la dice en voz alta: el informante es chusma.",
  },
  abogado: {
    nombre: "Abogado",
    emoji: "⚖️",
    precio: 70,
    max: 1,
    categoria: "servicios",
    desc: "Te saca una vez de una multa: la del control en una escena del laburo, la de una denuncia falsa a un espía o la de un sabotaje descubierto. Se usa solo.",
  },
  guardaespaldas: {
    nombre: "Guardaespaldas",
    emoji: "🕶️",
    precio: 90,
    categoria: "servicios",
    desc: `${TIENDA.GUARDAESPALDAS_DIAS} días en que nadie te sabotea un encargo, ni te roban el premio a la vuelta, ni la caja de tu empresa, ni el auto.`,
  },
  casa: {
    nombre: "Casa",
    emoji: "🏡",
    precio: CASAS[0].precio,
    categoria: "bienes",
    escalera: CASAS,
    desc: "De a un escalón. Se ve en tu perfil y en el diario. Ej: .comprar casa",
  },
  auto: {
    nombre: "Auto",
    emoji: "🚗",
    precio: AUTOS[0].precio,
    categoria: "bienes",
    escalera: AUTOS,
    desc: "De a un escalón. Llegás en él a las escenas, a los encargos y al diario; si la seguridad del pueblo está por el piso y no tenés guardaespaldas, te lo pueden robar. Ej: .comprar auto",
  },
  mascota: {
    nombre: "Mascota",
    emoji: "🐾",
    precio: Math.min(...Object.values(MASCOTAS).map((m) => m.precio)),
    categoria: "bienes",
    desc: `Con nombre propio, y te acompaña a todos lados. ${Object.values(MASCOTAS).map((m) => `${m.emoji} ${m.nombre} ${m.precio}`).join(" · ")}. Ej: .comprar mascota carpincho Ramón`,
  },
};

// Acepta "voto doble", "Voto-Doble", "escudo", "rachadoble", etc.
export function buscarItem(texto) {
  const k = String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
  if (!k) return null;
  if (ITEMS[k]) return k;
  if (k === "voto" || k === "votodoble" || k === "doblevoto") return "votodoble";
  if (k === "rachadoble" || k === "doble") return "racha";
  if (k === "nombre" || k === "nick") return "apodo";
  if (k === "reaccion" || k === "reaccionfirma" || k === "aura") return "firma";
  if (k === "entradatriunfal" || k === "llegada") return "entrada";
  if (k === "clasificado" || k === "avisopago") return "aviso";
  if (k === "chusmerio") return "chisme";
  if (k === "monumento") return "estatua";
  if (k === "pista" || k === "soplon") return "informante";
  if (k === "custodia" || k === "patovica") return "guardaespaldas";
  if (k === "vivienda" || CASAS.some((c) => c.clave === k)) return "casa";
  if (k === "coche" || k === "auto" || AUTOS.some((a) => a.clave === k)) return "auto";
  if (k === "perro" || k === "gato" || k === "carpincho") return "mascota";
  return null;
}

// ---------- the filter ----------
// What people write that Claudia will say or print (the entrance phrase, the notices, the pet's name): no tags, no
// links, no phone numbers or ID numbers, no insults (they'd be at somebody), and for the paper no serious accusations
// either. Compared without accents. Returns { ok, texto } or { ok: false, error }.
const INSULTOS = /\b(put[oa]s?|putit[oa]s?|trol[oa]s?|forr[oa]s?|bolud[oa]s?|pelotud[oa]s?|idiotas?|imbeciles?|estupid[oa]s?|tarad[oa]s?|mogolic[oa]s?|subnormal(es)?|hdp|hijos? de (re)?puta|conchud[oa]s?|chot[oa]s?|garcas?|cornud[oa]s?|gil(es)?|gila|lacras?|mierdas?|malparid[oa]s?|culiad[oa]s?|bastard[oa]s?|zorras?|perr[oa] de mierda)\b/;
const GRAVES = /\b(viol\w*|abus\w*|pedof\w*|narco\w*|drog\w*|asesin\w*|mat[oó]\s+a|robo\w*|rob[oóa]\w*|chorr[oa]s?|ladr[oó]n\w*|estaf\w*|coim\w*|infiel\w*|cuernos?|amante|pres[oa]s?|cana|denunci\w*|deud\w*|debe plata)\b/;
const sinAcentos = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function filtrarTexto(texto, { min = 2, max = 80, graves = false } = {}) {
  const limpio = String(texto || "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (limpio.length < min) return { ok: false, error: "Escribí algo, que no leo la mente." };
  if (limpio.length > max) return { ok: false, error: `Muy largo: hasta ${max} letras.` };
  if (/@/.test(limpio)) return { ok: false, error: "Nada de arrobar a nadie: esto es tuyo, no de otros." };
  if (/https?:|www\.|\.(com|uy|net|org)\b/i.test(limpio)) return { ok: false, error: "Nada de links." };
  if (/\d[\d .-]{5,}\d/.test(limpio)) return { ok: false, error: "Nada de teléfonos, cédulas ni números largos: datos personales, no." };
  const plano = sinAcentos(limpio);
  if (INSULTOS.test(plano)) return { ok: false, error: "Con insultos no: Claudia no le pone la voz a eso." };
  if (graves && GRAVES.test(plano)) return { ok: false, error: "Eso es una acusación seria: El Eco es un diario chico, pero no se hace cargo de juicios. Probá con algo más liviano." };
  return { ok: true, texto: limpio };
}

// ---------- the inventory's status rows ----------
// The status items keep their data as JSON in the inventory's extra: { emoji, hasta } for the signature, { frase,
// hasta, dia } for the entrance, { hasta } for the bodyguard, { nivel } for the house and the car, { tipo, nombre }
// for the pet. hasta 0 is forever.
const leer = (row) => {
  try {
    return JSON.parse(row?.extra || "") || {};
  } catch {
    return {};
  }
};
function guardar(chat, usuario, item, datos) {
  db.transaction(() => {
    borrarItem(chat, usuario, item);
    agregarItem(chat, usuario, item, 1, JSON.stringify(datos));
  })();
}
// The row's data while it lasts; an expired one is cleared.
function vigente(chat, usuario, item, ahora = Date.now()) {
  const row = getItem(chat, usuario, item);
  if (!row) return null;
  const datos = leer(row);
  if (datos.hasta && datos.hasta <= ahora) {
    borrarItem(chat, usuario, item);
    return null;
  }
  return datos;
}
const fechaCorta = (ms) => new Date(ms).toLocaleDateString("es-UY", { day: "numeric", month: "numeric" });
const hastaTexto = (hasta) => (hasta ? `hasta el ${fechaCorta(hasta)}` : "para siempre");
const mencion = (id) => `@${String(id).split("@")[0]}`;
const sinPlata = (chat, usuario, precio) => ({ ok: false, error: `No te alcanza — cuesta ${precio} y tenés ${getSaldoCoins(chat, usuario)} UruCoins.` });
const teQuedan = (chat, usuario) => `Te quedan ${getSaldoCoins(chat, usuario)} UruCoins.`;

// ---------- Compra ----------
// Devuelve { ok: true, mensaje } o { ok: false, error }; with someone named in it, mentions too.
export function comprar(chat, usuario, clave, argumento = "", ahora = Date.now()) {
  const item = ITEMS[clave];
  if (!item) return { ok: false, error: "Ese ítem no existe. Mirá la lista con .tienda" };
  // "entrada triunfal …" and "reacción firma 🦄" come in two words: the second isn't part of what follows.
  const arg = String(argumento || "")
    .trim()
    .replace(clave === "entrada" ? /^triunfal\b\s*/i : clave === "firma" ? /^firma\b\s*/i : /^$/, "")
    .trim();
  if (item.pueblo && !puebloActivo(chat)) return { ok: false, error: `${item.nombre}: eso es cosa del pueblo, y este grupo no tiene (o lo tiene dormido). Un admin lo prende con .pueblo on` };

  // --- Nickname: stored on the person's record, not in the inventory ---
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

  if (clave === "firma") return comprarFirma(chat, usuario, arg, ahora);
  if (clave === "entrada") return comprarEntrada(chat, usuario, arg, ahora);
  if (clave === "aviso" || clave === "chisme") return comprarAviso(chat, usuario, clave, arg, ahora);
  if (clave === "estatua") return comprarEstatua(chat, usuario, arg, ahora);
  if (clave === "informante") return comprarInformante(chat, usuario, ahora);
  if (clave === "guardaespaldas") return comprarGuardaespaldas(chat, usuario, ahora);
  if (clave === "casa" || clave === "auto") return comprarEscalon(chat, usuario, clave, ahora);
  if (clave === "mascota") return comprarMascota(chat, usuario, arg, ahora);

  // --- Streak: it neither stacks nor renews while it's active ---
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
  if (clave === "abogado") return { ok: true, mensaje: `⚖️ Contrataste al Dr. ${alAzar(ABOGADOS)}, que cobra por adelantado y alega por vos la próxima vez que te quieran multar. ${teQuedan(chat, usuario)}` };
  return { ok: true, mensaje: `${item.emoji} Compraste *${item.nombre}*. Te quedan ${getSaldoCoins(chat, usuario)} UruCoins.` };
}
const ABOGADOS = ["Pereyra Lamas, de traje marrón", "Etchegoyen, que se recibió en el 81 y no perdió nunca (no le dieron casos)", "Rodríguez Larreta, sin parentesco con nadie importante", "Cardozo, el del maletín vacío"];

// --- The signature reaction ---
// Whose emoji is it in the group, among the signatures that last: the person, or null.
function dueñoDeFirma(chat, emoji, ahora = Date.now()) {
  const filas = db.prepare(`SELECT usuario, extra FROM inventario WHERE chat = ? AND item = 'firma'`).all(chat);
  const fila = filas.find((f) => {
    const d = leer(f);
    return d.emoji === emoji && (!d.hasta || d.hasta > ahora);
  });
  return fila?.usuario || null;
}
const firmasLibres = (chat, ahora) => EMOJIS_FIRMA.filter((e) => !dueñoDeFirma(chat, e, ahora));

function comprarFirma(chat, usuario, arg, ahora) {
  const siempre = /\b(siempre|permanente|para siempre)\b/i.test(arg);
  const emoji = EMOJIS_FIRMA.find((e) => arg.replace(/[️\s]/g, "").includes(e.replace(/️/g, "")));
  const libres = firmasLibres(chat, ahora);
  if (!emoji) return { ok: false, error: `Elegí tu emoji: .comprar firma 🦄 (${TIENDA.FIRMA_DIAS} días, ${ITEMS.firma.precio}) o .comprar firma 🦄 siempre (${TIENDA.FIRMA_PERMANENTE}). Libres en el grupo: ${libres.join(" ") || "ninguno, se los llevaron todos"}` };
  const actual = vigente(chat, usuario, "firma", ahora);
  const dueño = dueñoDeFirma(chat, emoji, ahora);
  if (dueño && dueño !== usuario) return { ok: false, error: `${emoji} ya es la firma de otra persona del grupo. Libres: ${libres.join(" ") || "ninguno"}` };
  if (actual && !actual.hasta) return { ok: false, error: `Ya tenés firma para siempre: ${actual.emoji}. Más permanente que eso, el mármol.` };
  if (actual && !siempre) return { ok: false, error: `Ya tenés la firma ${actual.emoji} ${hastaTexto(actual.hasta)}. Cuando venza comprás otra, o la pasás a para siempre con .comprar firma ${emoji} siempre` };
  const precio = siempre ? TIENDA.FIRMA_PERMANENTE : ITEMS.firma.precio;
  if (!gastarCoins(chat, usuario, precio, "compra_firma")) return sinPlata(chat, usuario, precio);
  const hasta = siempre ? 0 : ahora + TIENDA.FIRMA_DIAS * DIA_MS;
  guardar(chat, usuario, "firma", { emoji, hasta, dia: "", hoy: 0 });
  return { ok: true, mensaje: `${emoji} Listo: esa es tu firma ${hastaTexto(hasta)}. De vez en cuando te la voy a dejar en algún mensaje, para que se sepa quién sos. ${teQuedan(chat, usuario)}` };
}

// A message of someone's in the group (plugins/_tienda.js): the emoji to react with, or null. About one in ten of
// their messages while the signature lasts, up to the day's cap.
export function reaccionFirma(chat, usuario, ahora = Date.now()) {
  const datos = vigente(chat, usuario, "firma", ahora);
  if (!datos?.emoji) return null;
  const hoy = claveDia(new Date(ahora));
  const yaHoy = datos.dia === hoy ? datos.hoy || 0 : 0;
  if (yaHoy >= TIENDA.FIRMA_TOPE_DIA || _dep.azar(100) >= TIENDA.FIRMA_CHANCE) return null;
  db.prepare(`UPDATE inventario SET extra = ? WHERE chat = ? AND usuario = ? AND item = 'firma'`).run(JSON.stringify({ ...datos, dia: hoy, hoy: yaHoy + 1 }), chat, usuario);
  return datos.emoji;
}

// --- The grand entrance ---
function comprarEntrada(chat, usuario, arg, ahora) {
  if (!arg) return { ok: false, error: `Decime la frase con que te recibo: .comprar entrada llegó el patrón de la ruta 5 (${ITEMS.entrada.precio} por ${TIENDA.ENTRADA_DIAS} días)` };
  const f = filtrarTexto(arg, { min: 3, max: TIENDA.ENTRADA_FRASE_MAX, graves: true });
  if (!f.ok) return f;
  const actual = vigente(chat, usuario, "entrada", ahora);
  // Already paid for: the phrase changes, free, and the days stay as they were.
  if (actual) {
    guardar(chat, usuario, "entrada", { ...actual, frase: f.texto });
    return { ok: true, mensaje: `🎺 Cambiada la frase, sin cargo: de ahora en más llegás con «${f.texto}» (${hastaTexto(actual.hasta)}).` };
  }
  if (!gastarCoins(chat, usuario, ITEMS.entrada.precio, "compra_entrada")) return sinPlata(chat, usuario, ITEMS.entrada.precio);
  const hasta = ahora + TIENDA.ENTRADA_DIAS * DIA_MS;
  // Today counts as done when it's bought: the entrance is for tomorrow's first message on.
  guardar(chat, usuario, "entrada", { frase: f.texto, hasta, dia: claveDia(new Date(ahora)) });
  return { ok: true, mensaje: `🎺 Contratada la banda: desde mañana, tu primer mensaje del día te recibo con «${f.texto}» (${hastaTexto(hasta)}). ${teQuedan(chat, usuario)}` };
}

const entradasDelDia = new Map(); // `${chat}|${dia}` → how many were announced
const FANFARRIAS = ["🎺 ¡Atención, pueblo!", "📯 ¡Abran paso!", "🥁 Redoble de tambores:", "🎉 ¡Paren todo!", "📣 ¡Silencio en la sala!"];

// Someone's first message of the day in the group (plugins/_tienda.js): what Claudia says to welcome them, { texto,
// mentions }, or null. Only the first message counts, said or not: with the group busy it's said only some of the
// times, and a group has its cap of them a day.
export function entradaTriunfal(chat, usuario, ahora = Date.now()) {
  const datos = vigente(chat, usuario, "entrada", ahora);
  const hoy = claveDia(new Date(ahora));
  if (!datos?.frase || datos.dia === hoy) return null;
  db.prepare(`UPDATE inventario SET extra = ? WHERE chat = ? AND usuario = ? AND item = 'entrada'`).run(JSON.stringify({ ...datos, dia: hoy }), chat, usuario);
  const clave = `${chat}|${hoy}`;
  if ((entradasDelDia.get(clave) || 0) >= TIENDA.ENTRADAS_GRUPO_DIA) return null;
  const h = new Date(ahora).getHours();
  const porHora = new Map(mensajesPorHora(chat, [hoy]).map((r) => [r.hora, r.total]));
  const movido = (porHora.get(h) || 0) + (porHora.get(h - 1) || 0) >= TIENDA.ENTRADA_ACTIVO;
  if (movido && _dep.azar(100) >= TIENDA.ENTRADA_CHANCE_ACTIVO) return null;
  if (entradasDelDia.size > 500) entradasDelDia.clear();
  entradasDelDia.set(clave, (entradasDelDia.get(clave) || 0) + 1);
  const llega = comoLlega(chat, usuario);
  return { texto: `${alAzar(FANFARRIAS)} Llegó ${mencion(usuario)}${llega ? `, ${llega}` : ""}: «${datos.frase}»`, mentions: [usuario] };
}

// --- The notices in the Sunday paper ---
export const avisosPendientes = (chat) => db.prepare(`SELECT * FROM tienda_avisos WHERE chat = ? AND estado = 'pendiente' ORDER BY id`).all(chat);

function comprarAviso(chat, usuario, clave, arg, ahora) {
  const item = ITEMS[clave];
  if (!arg) return { ok: false, error: `¿Qué querés que salga? ${item.desc.split(" Ej: ")[1] ? `Ej: ${item.desc.split(" Ej: ")[1]}` : ""}` };
  const f = filtrarTexto(arg, { min: 8, max: TIENDA.AVISO_MAX, graves: true });
  if (!f.ok) return f;
  const pendientes = avisosPendientes(chat);
  if (pendientes.filter((a) => a.usuario === usuario).length >= TIENDA.AVISOS_PERSONA) return { ok: false, error: "Ya tenés un aviso esperando el domingo. Uno por número, que el papel no es gratis." };
  if (!gastarCoins(chat, usuario, item.precio, `compra_${clave}`)) return sinPlata(chat, usuario, item.precio);
  db.prepare(`INSERT INTO tienda_avisos (chat, usuario, tipo, texto, precio, fecha) VALUES (?, ?, ?, ?, ?, ?)`).run(chat, usuario, clave, f.texto, item.precio, ahora);
  const nombre = estadoDe(chat, ahora)?.nombre || "";
  const enCola = pendientes.length >= TIENDA.AVISOS_EDICION ? ` Hay ${pendientes.length} antes que el tuyo: si no entra este domingo, sale el otro.` : "";
  const recap = getChat(chat)?.recapSemanal === 0 ? " Ojo: el diario sale con la recap del domingo, y en este grupo está apagada; hasta que un admin la prenda, queda en la imprenta." : "";
  return { ok: true, mensaje: `${item.emoji} Recibido: tu ${clave === "chisme" ? "chisme" : "clasificado"} sale el domingo en *El Eco de ${nombre}*, con el sello de *aviso pago*.${enCola}${recap} Un admin lo puede vetar (.avisos). ${teQuedan(chat, usuario)}` };
}

// .vetar <n>: an admin takes a notice out before it's printed, and it's paid back. Returns { ok, texto } or { ok:
// false, error }.
export function vetarAviso(chat, id) {
  const aviso = db.prepare(`SELECT * FROM tienda_avisos WHERE id = ? AND chat = ?`).get(id, chat);
  if (!aviso || aviso.estado !== "pendiente") return { ok: false, error: "No hay ningún aviso esperando con ese número. Los que hay: .avisos" };
  db.transaction(() => {
    db.prepare(`UPDATE tienda_avisos SET estado = 'vetado' WHERE id = ?`).run(id);
    ganarCoins(chat, aviso.usuario, aviso.precio, "aviso_vetado");
  })();
  return { ok: true, texto: `✂️ Vetado el aviso #${id}: no sale en El Eco. A ${mencion(aviso.usuario)} se le devuelven los ${aviso.precio} UruCoins; la tinta, no.`, mentions: [aviso.usuario] };
}

// .avisos: the notices waiting for Sunday, with their number for .vetar.
export function textoAvisos(chat) {
  const pendientes = avisosPendientes(chat);
  if (!puebloActivo(chat)) return { texto: "📢 Sin pueblo no hay diario, y sin diario no hay avisos. Un admin lo prende con .pueblo on", mentions: [] };
  if (!pendientes.length) return { texto: `📢 No hay avisos esperando el domingo. Se compran con .comprar aviso <texto> (${ITEMS.aviso.precio}) o .comprar chisme <texto> (${ITEMS.chisme.precio}).`, mentions: [] };
  const lineas = pendientes.map((a, i) => `#${a.id} ${a.tipo === "chisme" ? "🗣️ chisme" : "📢 clasificado"} de ${mencion(a.usuario)}: «${a.texto}»${i >= TIENDA.AVISOS_EDICION ? " _(para el otro domingo)_" : ""}`);
  return { texto: `📢 *Avisos para El Eco del domingo*\n\n${lineas.join("\n")}\n\n_Un admin saca uno con .vetar <número>, y se le devuelve la plata a quien lo pagó._`, mentions: [...new Set(pendientes.map((a) => a.usuario))] };
}

// For the paper (lib/pueblo-diario.js): the notices this edition prints, the oldest first.
export function avisosParaElDiario(chat) {
  return avisosPendientes(chat)
    .slice(0, TIENDA.AVISOS_EDICION)
    .map((a) => ({ id: a.id, tipo: a.tipo, texto: a.texto, usuario: a.usuario }));
}
// The edition went out: its notices are printed.
export function marcarAvisosPublicados(ids, edicion) {
  for (const id of ids) db.prepare(`UPDATE tienda_avisos SET estado = 'publicado', edicion = ? WHERE id = ? AND estado = 'pendiente'`).run(edicion, id);
}

// --- The statue ---
// What it takes to put up the next statue in a town's plaza: the base, or what the one standing cost and a bit more,
// rounded up to tens.
export function precioEstatua(chat) {
  const actual = estatuaDe(chat);
  return actual ? Math.ceil((actual.monto * TIENDA.ESTATUA_SUBA) / 10) * 10 : TIENDA.ESTATUA_BASE;
}

const DERRIBOS = [
  "La bajaron con una grúa de la intendencia, entre aplausos y algún llanto.",
  "La tiraron a la madrugada con una cuerda y un tractor. La cabeza quedó en el boliche, de recuerdo.",
  "La derribaron en un acto oficial; la banda municipal tocó la marcha fúnebre, mal.",
  "La sacaron de a pedazos: los vecinos se llevaron la nariz, una oreja y la placa.",
];

function comprarEstatua(chat, usuario, arg, ahora) {
  const minimo = precioEstatua(chat);
  const actual = estatuaDe(chat);
  const pide = Number.parseInt(String(arg).replace(/\D/g, ""), 10);
  const monto = Number.isInteger(pide) && pide > 0 ? pide : minimo;
  if (actual?.usuario === usuario) return { ok: false, error: `La estatua de la plaza ya es tuya (la pagaste ${actual.monto}). Tirarte a vos mismo es mucho, hasta para este pueblo.` };
  if (monto < minimo) return { ok: false, error: `Con ${monto} no alcanza: ${actual ? `para tirar la de ${nombreDe(actual.usuario) || "quien está"} hay que poner por lo menos ${minimo}` : `una estatua arranca en ${minimo}`}.` };
  if (!gastarCoins(chat, usuario, monto, "compra_estatua")) return sinPlata(chat, usuario, monto);
  db.transaction(() => {
    if (actual) db.prepare(`UPDATE tienda_estatuas SET derribada = ? WHERE id = ?`).run(ahora, actual.id);
    db.prepare(`INSERT INTO tienda_estatuas (chat, usuario, monto, fecha) VALUES (?, ?, ?, ?)`).run(chat, usuario, monto, ahora);
    sumarArcas(chat, monto);
  })();
  registrarHecho(chat, "estatua", { usuario, monto, antes: actual?.usuario || "", antesMonto: actual?.monto || 0 }, ahora);
  const p = estadoDe(chat, ahora);
  const plaza = p?.lugar?.plaza || "la plaza";
  const derribo = actual ? `\n🪓 La de ${mencion(actual.usuario)} ya no está: ${alAzar(DERRIBOS)} Sale en el diario del domingo.` : "";
  return {
    ok: true,
    mensaje: `🗿 *Inauguran estatua en ${plaza}*: ${mencion(usuario)}, en bronce (bah, en yeso pintado), con la mirada perdida en el horizonte. Los ${monto} UruCoins fueron a las arcas del pueblo, y ${p?.npc?.intendente || "el intendente"} cortó la cinta.${derribo}\n_Para tirarla hay que poner ${precioEstatua(chat)} o más. ${teQuedan(chat, usuario)}_`,
    mentions: [usuario, ...(actual ? [actual.usuario] : [])],
  };
}

// --- The informant ---
// The tips the informant can give about the open envelope, each true: some about the spy, never their name. Each
// returns the tip or null when it doesn't apply.
const PISTAS = {
  genero: (m) => {
    const g = generoDe(m.agente);
    return g === "mujer" ? "el sobre lo tiene una mujer" : g === "hombre" ? "el espía no es mujer" : null;
  },
  oficio: (m) => {
    const l = laburoDe(m.chat, m.agente);
    return l ? `el espía labura de ${l.oficio.nombre.toLowerCase()} (o eso dice el recibo)` : "el espía no tiene laburo: vive de rentas, o de espiar";
  },
  escribio: (m, quien, ahora) => {
    const fila = db.prepare(`SELECT mensajes FROM actividad_diaria WHERE chat = ? AND usuario = ? AND fecha = ?`).get(m.chat, m.agente, claveDia(new Date(ahora)));
    return fila?.mensajes ? "el espía ya charló hoy en el grupo, como si nada" : "el espía no dijo ni mu hoy en el grupo: está agazapado";
  },
  sobre: (m) => (m.abierta ? "el espía ya abrió el sobre y anda en la suya" : "el espía todavía ni abrió el sobre: o es muy vivo o es muy dormido"),
  plata: (m, quien) => {
    if (quien === m.agente) return null;
    const suya = getSaldoCoins(m.chat, m.agente);
    const tuya = getSaldoCoins(m.chat, quien);
    return suya > tuya ? "el espía tiene más UruCoins que vos" : suya < tuya ? "el espía tiene menos UruCoins que vos" : null;
  },
  objetivo: (m) => {
    const g = generoDe(m.objetivo);
    return m.tipo === "palabra" ? (g === "mujer" ? "a quien tienen que hacer hablar es una mujer" : g === "hombre" ? "a quien tienen que hacer hablar es un hombre" : "la misión es hacerle decir una palabra a alguien") : "la misión es de las difíciles: hacer que alguien compre o venda algo";
  },
};

export const pistaDe = (mision, usuario) => db.prepare(`SELECT pista FROM tienda_pistas WHERE mision = ? AND usuario = ?`).get(mision, usuario)?.pista || null;

function comprarInformante(chat, usuario, ahora) {
  const mision = misionAbierta(chat);
  if (!mision || mision.vence <= ahora) return { ok: false, error: "No hay ningún sobre dando vueltas: el informante no tiene nada que contar (y no cobra por chusmerío… bueno, sí, pero no ahora)." };
  const ya = pistaDe(mision.id, usuario);
  if (ya) return { ok: false, error: `El informante ya te dijo lo que sabía de este sobre: «${ya}». Una pista por sobre por cabeza.` };
  const posibles = Object.values(PISTAS)
    .map((f) => f(mision, usuario, ahora))
    .filter(Boolean);
  if (!gastarCoins(chat, usuario, ITEMS.informante.precio, "compra_informante")) return sinPlata(chat, usuario, ITEMS.informante.precio);
  const pista = alAzar(posibles);
  db.prepare(`INSERT OR IGNORE INTO tienda_pistas (mision, usuario, pista, fecha) VALUES (?, ?, ?, ?)`).run(mision.id, usuario, pista, ahora);
  return { ok: true, mensaje: `🕵️ Un tipo de sobretodo se le acerca a ${mencion(usuario)} y le dice al oído, pero bastante fuerte: «${pista}». Sobre ${mision.emoji}, una pista por cabeza. ${teQuedan(chat, usuario)}`, mentions: [usuario] };
}

// --- The lawyer ---
// A fine about to be paid: if the person has a lawyer, it's spent and they don't pay. true if it was used. The modules
// that fine call it (lib/escenas.js, lib/espias.js, lib/encargos.js).
export function usarAbogado(chat, usuario) {
  return Boolean(usuario) && consumirItem(chat, usuario, "abogado");
}
const ALEGATOS = ["alegó «error de buena fe»", "presentó un recurso de amparo escrito en una servilleta", "le recordó al juez que son primos segundos", "habló cuarenta minutos sin respirar hasta que lo soltaron por cansancio", "encontró una coma mal puesta en el acta"];
export const alegato = () => alAzar(ALEGATOS);

// --- The bodyguard ---
function comprarGuardaespaldas(chat, usuario, ahora) {
  const actual = vigente(chat, usuario, "guardaespaldas", ahora);
  if (actual) return { ok: false, error: `Ya tenés guardaespaldas ${hastaTexto(actual.hasta)}. Dos juntos se pelean entre ellos.` };
  if (!gastarCoins(chat, usuario, ITEMS.guardaespaldas.precio, "compra_guardaespaldas")) return sinPlata(chat, usuario, ITEMS.guardaespaldas.precio);
  const hasta = ahora + TIENDA.GUARDAESPALDAS_DIAS * DIA_MS;
  guardar(chat, usuario, "guardaespaldas", { hasta });
  return { ok: true, mensaje: `🕶️ Contratado: un ropero de dos metros con lentes negros te sigue a todos lados ${hastaTexto(hasta)}. Nada de sabotajes en tus encargos ni robos a lo tuyo. ${teQuedan(chat, usuario)}` };
}
// Whether someone goes with a bodyguard now (lib/encargos.js, lib/empresas.js and the car).
export const tieneGuardaespaldas = (chat, usuario, ahora = Date.now()) => Boolean(usuario) && Boolean(vigente(chat, usuario, "guardaespaldas", ahora));

// --- The goods ---
// The house or the car someone has ({ ...step, nivel }), or null.
export function escalonDe(chat, usuario, clave) {
  const row = getItem(chat, usuario, clave);
  const nivel = leer(row).nivel || 0;
  const escalera = ITEMS[clave]?.escalera;
  return nivel && escalera?.[nivel - 1] ? { ...escalera[nivel - 1], nivel } : null;
}
export function mascotaDe(chat, usuario) {
  const datos = leer(getItem(chat, usuario, "mascota"));
  const def = MASCOTAS[datos.tipo];
  return def && datos.nombre ? { ...def, tipo: datos.tipo, nombreMascota: datos.nombre } : null;
}
// What goods cost in a town: their price by its prosperity (lib/pueblo.js), in tens; as it is without one.
export const precioBien = (chat, precio) => Math.max(10, Math.round((precio * modificador(chat, "precios")) / 10) * 10);

function comprarEscalon(chat, usuario, clave, ahora) {
  const escalera = ITEMS[clave].escalera;
  const actual = escalonDe(chat, usuario, clave);
  const siguiente = escalera[actual ? actual.nivel : 0];
  if (!siguiente) return { ok: false, error: clave === "casa" ? `Ya tenés ${actual.nombre.toLowerCase() === "estancia" ? "una estancia" : actual.nombre}. Más arriba está el Palacio Salvo, y no se vende.` : `Ya tenés un ${actual.nombre.toLowerCase()}. Más que eso es un avión, y la pista es de tierra.` };
  const precio = precioBien(chat, siguiente.precio);
  if (!gastarCoins(chat, usuario, precio, `compra_${clave}`)) return sinPlata(chat, usuario, precio);
  guardar(chat, usuario, clave, { nivel: actual ? actual.nivel + 1 : 1 });
  const nivel = actual ? actual.nivel + 1 : 1;
  registrarHecho(chat, "bien_comprado", { usuario, que: clave, nombre: siguiente.nombre, nivel, peso: nivel }, ahora);
  const antes = actual ? ` ${clave === "casa" ? `El ${actual.nombre.toLowerCase()} queda para las visitas.` : `El ${actual.nombre} lo vendiste a un sobrino.`}` : "";
  const mas = escalera[nivel] ? ` El próximo escalón: ${escalera[nivel].emoji} ${escalera[nivel].nombre}.` : "";
  return { ok: true, mensaje: `${siguiente.emoji} *${siguiente.nombre}*: ${siguiente.compra}${antes}${mas} ${teQuedan(chat, usuario)}` };
}

// "carpincho Ramón", "caballo criollo Relámpago": the kind and the name.
function leerMascota(texto) {
  const palabras = String(texto || "").trim().split(/\s+/).filter(Boolean);
  const llano = (t) => sinAcentos(t).replace(/[^a-z]/g, "");
  if (!palabras.length) return { tipo: null, nombre: "" };
  const primera = llano(palabras[0]);
  if (primera === "caballo") return { tipo: "caballo", nombre: palabras.slice(llano(palabras[1] || "") === "criollo" ? 2 : 1).join(" ") };
  return { tipo: MASCOTAS[primera] ? primera : null, nombre: palabras.slice(1).join(" ") };
}

function comprarMascota(chat, usuario, arg, ahora) {
  const { tipo, nombre } = leerMascota(arg);
  const lista = Object.entries(MASCOTAS).map(([k, m]) => `${m.emoji} ${k === "caballo" ? "caballo" : m.nombre} ${precioBien(chat, m.precio)}`).join(" · ");
  if (!tipo) return { ok: false, error: `¿Qué bicho? .comprar mascota carpincho Ramón. Hay: ${lista}` };
  const f = filtrarTexto(nombre, { min: 2, max: 20 });
  if (!nombre || !f.ok) return { ok: false, error: nombre ? `Ese nombre no: ${f.error}` : `Ponele nombre: .comprar mascota ${tipo === "caballo" ? "caballo Relámpago" : `${MASCOTAS[tipo].nombre} Ramón`}` };
  const def = MASCOTAS[tipo];
  const precio = precioBien(chat, def.precio);
  const antes = mascotaDe(chat, usuario);
  if (!gastarCoins(chat, usuario, precio, "compra_mascota")) return sinPlata(chat, usuario, precio);
  guardar(chat, usuario, "mascota", { tipo, nombre: f.texto });
  registrarHecho(chat, "bien_comprado", { usuario, que: "mascota", nombre: `${def.nombre} ${f.texto}`, nivel: 1, peso: 1 }, ahora);
  const despedida = antes ? ` ${antes.nombreMascota} se fue a vivir al campo de un tío, donde es muy feliz.` : "";
  return { ok: true, mensaje: `${def.emoji} Bienvenido el ${def.nombre} *${f.texto}*: de ahora en más te acompaña a todos lados.${despedida} ${teQuedan(chat, usuario)}` };
}

// How someone arrives, for the stories: "en su camioneta, con el carpincho Ramón" (vos: "en tu camioneta…"), or "".
export function comoLlega(chat, usuario, { vos = false } = {}) {
  const auto = escalonDe(chat, usuario, "auto");
  const mascota = mascotaDe(chat, usuario);
  const su = vos ? "tu" : "su";
  const partes = [];
  if (auto) partes.push(`en ${su} ${auto.nombre.toLowerCase()}`);
  if (mascota) partes.push(`con el ${mascota.nombre} ${mascota.nombreMascota}`);
  return partes.join(", ");
}

// For .perfil: "🏡 Chalet · 🛻 Camioneta · 🦫 el carpincho Ramón", or "".
export function lineaDeBienes(chat, usuario) {
  const casa = escalonDe(chat, usuario, "casa");
  const auto = escalonDe(chat, usuario, "auto");
  const mascota = mascotaDe(chat, usuario);
  return [casa && `${casa.emoji} ${casa.nombre}`, auto && `${auto.emoji} ${auto.nombre}`, mascota && `${mascota.emoji} el ${mascota.nombre} ${mascota.nombreMascota}`].filter(Boolean).join(" · ");
}

// For Claudia's prompt (plugins/_auto-ia.js): what someone has, so she can bring it up. "" with nothing.
export function bienesParaPrompt(chat, usuario, nombre) {
  const casa = escalonDe(chat, usuario, "casa");
  const auto = escalonDe(chat, usuario, "auto");
  const mascota = mascotaDe(chat, usuario);
  const partes = [casa && `${casa.nivel === 3 ? "una" : "un"} ${casa.nombre.toLowerCase()}`, auto && `${auto.nombre === "Camioneta" ? "una camioneta" : `un ${auto.nombre.toLowerCase()}`}`, mascota && `un ${mascota.nombre} que se llama ${mascota.nombreMascota}`].filter(Boolean);
  if (!partes.length) return "";
  return `En el juego del grupo, ${nombre} se compró ${partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0]}. Podés nombrarlo si viene al caso ("llegó en su camioneta con el carpincho Ramón"), sin forzarlo.`;
}

// --- The car stolen ---
// Every few minutes (lib/tareas-programadas.js): in each town, once a day, a car may be stolen, at the town's robbery
// rate (lib/pueblo.js: low safety and events) times AUTO_ROBO_FACTOR. One of the group's cars, drawn, at a moment of
// the day's hours. Returns how many were scheduled.
export function chequearRobosDeAutos(ahora = new Date()) {
  let agendados = 0;
  for (const chat of chatsConOpcion("pueblo")) {
    if (!puebloActivo(chat) || ahora.getHours() < TIENDA.ROBO_DESDE_HORA) continue;
    const hoy = claveDia(ahora);
    if (periodoCerrado(chat, "robo_auto", hoy)) continue;
    marcarPeriodoCerrado(chat, "robo_auto", hoy);
    const chance = modificador(chat, "robo", ahora.getTime()) * TIENDA.AUTO_ROBO_FACTOR;
    const dueños = db.prepare(`SELECT usuario FROM inventario WHERE chat = ? AND item = 'auto'`).all(chat);
    if (!dueños.length || !(chance > 0) || _dep.azar(100) >= chance) continue;
    const inicio = ahora.getTime() + 60 * 1000;
    const fin = new Date(ahora).setHours(TIENDA.ROBO_HASTA_HORA, 0, 0, 0);
    if (fin <= inicio) continue;
    crearPendiente(chat, alAzar(dueños).usuario, "robo_auto", {}, inicio + _dep.azar(fin - inicio));
    agendados++;
  }
  return agendados;
}

// The pending work of a car robbery (lib/pendientes.js), at its moment: everything is checked again (the town, the
// hours, the group talking, the car, that safety is still low). With a bodyguard the robbery fails; without one, the
// car is gone and the insurance pays AUTO_SEGURO % of what it cost. Returns what to tell the group, or null.
export function robarAuto(chat, usuario, ahora = new Date()) {
  const c = getChat(chat);
  if (!puebloActivo(chat) || c?.grupoCerradoPorHorario) return null;
  const h = ahora.getHours();
  if (h < TIENDA.ROBO_DESDE_HORA || h >= TIENDA.ROBO_HASTA_HORA) return null;
  const auto = escalonDe(chat, usuario, "auto");
  if (!auto || modificador(chat, "robo", ahora.getTime()) <= 0) return null;
  const porHora = new Map(mensajesPorHora(chat, [claveDia(ahora)]).map((r) => [r.hora, r.total]));
  if ((porHora.get(h) || 0) + (porHora.get(h - 1) || 0) < PUEBLO.VIVO_MENSAJES) return null;
  const p = estadoDe(chat, ahora.getTime());
  const comisario = p.npc.comisario.replace(/^el/, "El");
  if (tieneGuardaespaldas(chat, usuario, ahora.getTime())) {
    registrarHecho(chat, "robo_frustrado", { usuario, auto: auto.nombre }, ahora.getTime());
    return { texto: `🕶️ Dos chorros quisieron llevarse ${auto.nombre === "Camioneta" ? "la camioneta" : `el ${auto.nombre.toLowerCase()}`} de ${mencion(usuario)} frente a ${p.lugar.boliche}, pero el guardaespaldas los agarró de las orejas y se los entregó a ${p.npc.comisario}. Plata bien gastada.`, mentions: [usuario] };
  }
  const seguro = Math.floor((auto.precio * TIENDA.AUTO_SEGURO) / 100);
  db.transaction(() => {
    borrarItem(chat, usuario, "auto");
    if (seguro > 0) ganarCoins(chat, usuario, seguro, "auto_seguro");
  })();
  registrarHecho(chat, "robo_auto", { usuario, auto: auto.nombre }, ahora.getTime());
  recordar(chat, "comisario", usuario, "le robaron el auto", ahora.getTime());
  const cual = auto.nombre === "Camioneta" ? "la camioneta" : `el ${auto.nombre.toLowerCase()}`;
  return {
    texto: `🚨 *¡Le robaron ${cual} a ${mencion(usuario)}!* La dejó en ${p.lugar.plaza} "un minutito" y cuando volvió había un ladrillo donde estaba. Con la seguridad del pueblo en ${p.seguridad}, ${p.npc.almacenera} dice que se veía venir. ${comisario} tomó nota.\n🪙 El seguro le devuelve ${seguro} UruCoins (el ${TIENDA.AUTO_SEGURO} %, por la letra chica). _Un guardaespaldas lo hubiera evitado._`,
    mentions: [usuario],
  };
}

// ---------- Efectos ----------

// do they have a live double streak? (if it expired, it's cleared)
export function rachaActiva(chat, usuario) {
  const row = getItem(chat, usuario, "racha");
  if (!row) return false;
  if (Date.now() > Number(row.extra || 0)) {
    borrarItem(chat, usuario, "racha");
    return false;
  }
  return true;
}

// x2 with a streak, x1 without
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

// spends a shield if there is one; true if it was used
export function usarEscudo(chat, usuario) {
  return consumirItem(chat, usuario, "escudo");
}

// On losing a bet: if the person has a shield, it's spent and the stake refunded, up to the item's cap.
// Returns what was refunded, 0 if they had none. Every betting game calls it when settling a loss, passing its own
// reason ("escudo_ruleta", "escudo_blackjack"...) so .mitimba can put the refund back in the game it came from.
// Rows recorded before that carry the old default and count only towards the overall balance.
export function protegerApuesta(chat, usuario, cantidad, motivo = "escudo_devolucion") {
  if (!(cantidad > 0) || !usarEscudo(chat, usuario)) return 0;
  const devuelto = Math.min(cantidad, ITEMS.escudo.reintegro);
  ganarCoins(chat, usuario, devuelto, motivo);
  return devuelto;
}

// spends a double vote if there is one; true if it was used
export function usarVotoDoble(chat, usuario) {
  return consumirItem(chat, usuario, "votodoble");
}

// ---------- Textos ----------

// The price as .tienda shows it: the steps of the house and the car, the statue's going rate, the goods by the town.
function precioEnTienda(chat, clave, it) {
  if (it.escalera) return it.escalera.map((e) => `${e.emoji} ${e.nombre} ${chat ? precioBien(chat, e.precio) : e.precio}`).join(" → ");
  if (clave === "estatua") return `desde ${chat && puebloActivo(chat) ? precioEstatua(chat) : it.precio}`;
  if (clave === "mascota") return `desde ${chat ? precioBien(chat, it.precio) : it.precio}`;
  if (clave === "firma") return `${it.precio} (${TIENDA.FIRMA_DIAS} días) o ${TIENDA.FIRMA_PERMANENTE} (para siempre)`;
  return `${it.precio}`;
}

// .tienda: the shelves, each with its items. .tienda <shelf> shows that one only (estatus, pueblo, servicios, bienes,
// juego). chat, for what depends on the group (the town's prices and whether it has one).
export function textoTienda(chat = null, categoria = "") {
  const k = sinAcentos(String(categoria || "")).trim();
  const pedida = k ? CATEGORIAS.find((c) => c.clave === k || sinAcentos(c.nombre).includes(k)) : null;
  const sinPueblo = chat && !puebloActivo(chat);
  const bloques = (pedida ? [pedida] : CATEGORIAS).map((cat) => {
    const items = Object.entries(ITEMS).filter(([, it]) => it.categoria === cat.clave);
    const lineas = items.map(([clave, it]) => `${it.emoji} *${it.nombre}* — ${precioEnTienda(chat, clave, it)} coins${it.pueblo && sinPueblo ? " _(solo con pueblo: .pueblo on)_" : ""}\n${it.desc}\n▸ .comprar ${clave}`);
    return `*${cat.nombre}*\n\n${lineas.join("\n\n")}`;
  });
  return `🛒 *TIENDA DE URUCOINS*\n\n${bloques.join("\n\n━━━━━━━━━━\n\n")}\n\nVer lo tuyo: .inventario${pedida ? "" : " · una sola góndola: .tienda bienes (o estatus, pueblo, servicios, juego)"}`;
}

// a short summary of what a person holds (for .inventario). "" when they have nothing. sinBienes leaves the house, the
// car and the pet out (.perfil shows them on a line of their own).
export function textoInventario(chat, usuario, user = null, { sinBienes = false } = {}) {
  rachaActiva(chat, usuario); // clears the streak if it expired
  const ahora = Date.now();
  for (const item of ["firma", "entrada", "guardaespaldas"]) vigente(chat, usuario, item, ahora); // and these
  const partes = getInventario(chat, usuario)
    .filter((r) => ITEMS[r.item] && !(sinBienes && ITEMS[r.item].categoria === "bienes"))
    .map((r) => {
      const it = ITEMS[r.item];
      const d = leer(r);
      if (r.item === "racha") return `${it.emoji} Racha doble (hasta las ${horaVencimientoRacha(chat, usuario)})`;
      if (r.item === "firma") return `${d.emoji} Reacción firma (${hastaTexto(d.hasta)})`;
      if (r.item === "entrada") return `🎺 Entrada triunfal: «${d.frase}» (${hastaTexto(d.hasta)})`;
      if (r.item === "guardaespaldas") return `🕶️ Guardaespaldas (${hastaTexto(d.hasta)})`;
      if (r.item === "casa" || r.item === "auto") {
        const e = escalonDe(chat, usuario, r.item);
        return e ? `${e.emoji} ${e.nombre}` : "";
      }
      if (r.item === "mascota") {
        const m = mascotaDe(chat, usuario);
        return m ? `${m.emoji} el ${m.nombre} ${m.nombreMascota}` : "";
      }
      return `${it.emoji} ${it.nombre}${r.cantidad > 1 ? ` x${r.cantidad}` : ""}`;
    })
    .filter(Boolean);
  if (user?.apodo) partes.push(`🏷️ Apodo: ${user.apodo}`);
  const laburo = etiquetaLaburo(chat, usuario);
  if (laburo) partes.push(`💼 Laburo: ${laburo}`);
  return partes.join("\n");
}
