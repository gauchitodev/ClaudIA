// Marketplace: posts numbered per group with #vendo / #compro (or .vendo / .compro), catalogue, search, keyword
// alerts and expiry with a heads-up. Built for buy-and-sell groups, but it works in any of them.
import { crearPublicacion, getPublicacion, getPublicacionPorMensaje, publicacionesActivas, publicacionesDe, contarPublicacionesActivas, actualizarPublicacion, publicacionesParaRevisar, publicacionesDelAviso, publicacionesPorResponder, agregarAlerta, quitarAlerta, alertasDe, alertasDelChat, cerrarPublicacionesDe, quitarAlertasDe, chatsConPublicaciones, mensajesDespuesDe, getChat, updateChat } from "../database-functions.js";
import { DIA_MS, duracion, duracionLarga } from "./tiempo.js";
import { nombreDe, sinMenciones } from "./menciones.js";
import { idsDeParticipante, mismaPersona, lidDe } from "./identidad.js";
import { volverAIntentar } from "./avisos-programados.js";
import { conexion } from "./conexion.js";
import { esGrupoDeVentas } from "./modo.js";
import { claveDia } from "./actividad.js";

export const COMPRAVENTA = {
  DIAS_VIGENCIA: 7, // after 7 quiet days the bot asks whether it's still available
  DIAS_PARA_CONTESTAR: 2, // with no answer within that window, it's taken down
  // The questions and the take-downs go out in one round a day, from this local hour on (a sales group's busiest) and
  // never from the other one on. They used to go out the minute each post turned 7 days old, at midnight too.
  RONDA_DESDE: 11,
  RONDA_HASTA: 21,
  MAX_ACTIVAS_POR_PERSONA: 10,
  MAX_ALERTAS: 5,
  LARGO_LINEA: 90,
  // A post is a few lines. One of 64.000 characters held the whole bot for 13 s (the price regex) and made every
  // search over it slow: what goes past this is cut off.
  MAX_LARGO_TEXTO: 1000,
  MAX_LARGO_RESPUESTA: 200, // an answer about a post ("Sigue 20") is a short message: a longer one isn't read as one
  MAX_DE_UNA_VEZ: 20, // posts a state command takes at once: each is a lookup, and a line of the answer
  MAX_PALABRAS_BUSQUEDA: 5,
  SUGERENCIAS_MAX: 2, // similar posts suggested at a time
  SUGERENCIAS_POR_HORA: 20, // replies to loose requests ("¿alguien vende…?") per group: each one is a message
  RECORDAR_SUGERENCIA_MS: DIA_MS, // the same post isn't suggested again to the same person within a day
  // A buy-and-sell group gets its catalogue unasked, within the round's hours: this far apart (three a day at most),
  // and only once the group has written this much since the last one, which by then is out of sight.
  CATALOGO_CADA_MS: 4 * 3600e3,
  CATALOGO_MIN_MENSAJES: 10,
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
// Lists name people instead of tagging them: a catalogue with twenty posts notified twenty sellers.
const linea = (p) => `${p.estado === "reservada" ? "🔒 " : ""}*#${p.numero}* ${recortar(p.texto)} — ${nombreDe(p.usuario)}`;

// Does the message carry #vendo, #compro or the like? → { tipo, text without the hashtag } or null
export function detectarPublicacion(texto) {
  const re = /(^|\s)#(vendo|venta|vendemos|compro|busco|necesito)\b/gi;
  const m = re.exec(String(texto || ""));
  if (!m) return null;
  return { tipo: HASHTAGS[m[2].toLowerCase()], texto: String(texto).replace(re, " ").replace(/\s+/g, " ").trim() };
}

// Written without a hashtag, which only counts in a buy-and-sell group (plugins/_compraventa.js): there that's what
// people come for, while in a group of friends "vendo a mi hermano" is a joke. Either may come after a greeting. An
// offer ("vendo…", "se vende…") is a post; a request ("busco…", "¿alguien vende…?", "necesito…") only gets suggestions,
// with soloSugerir: it isn't kept, it's often just a question.
const SALUDO = String.raw`(?:(?:hola|holis|buenas|buen d[ií]a|buenas tardes|buenas noches|gente|che)\b[\s,!.]*)*`;
const OFERTA_SUELTA = new RegExp(String.raw`^\s*${SALUDO}(?:vendo|vendemos|se vende|se venden|liquido)\b[\s:,.-]*(.*)$`, "is");
const PEDIDO_SUELTO = new RegExp(String.raw`^\s*${SALUDO}¿?\s*(?:busco|estoy buscando|ando buscando|necesito|quiero comprar|compro|alguien (?:que )?(?:venda|vende|tenga|tiene)|(?:alguno|alguna) (?:vende|tiene)|venden|tienen)\b[\s:,.-]*(.*)$`, "is");

export function detectarSuelta(texto) {
  const t = String(texto || "");
  const oferta = t.match(OFERTA_SUELTA);
  if (oferta && oferta[1].trim().length >= 3) return { tipo: "vendo", texto: oferta[1].replace(/\s+/g, " ").trim() };
  const pedido = t.match(PEDIDO_SUELTO);
  const queBusca = pedido ? pedido[1].replace(/[¿?!]+/g, " ").replace(/\s+/g, " ").trim() : "";
  if (queBusca && palabrasClave(queBusca).length) return { tipo: "compro", texto: queBusca, soloSugerir: true };
  return null;
}

// ---------- similar posts ----------
// What a post or a request is about: its words without accents, numbers (prices, sizes) or the ones that carry no
// weight, and with the usual short forms brought to one (bici and bicicleta are the same word here).
// The ones a request is made with and not about ("¿me lo reservás hasta mañana?", "me interesa") are here too: with one
// of them as the first word, any post that had it matched.
const VACIAS = new Set(
  "a ahi al alla algo alguien alguna alguno algun ando anda aca ayer bien buen buena buenas bueno busco buscando casi che como compro comprar con consulta consulto cosa cosas cual cuales cuando cuanto cuanta cuesta dale de del desde dia dias dolar dolares donde e el en era es esa esas ese eso esos esta estan estas este esto estos estoy etc favor fue gente gracias hace hacer hago hasta hay hola hoy impecable info informacion interesa interesada interesado interesados la las les listo lo los manana mas mi mis mucha mucho muchas muchos muy nada nadie necesito ninguna ninguno noche nos nueva nuevo o oferta otra otro otras otros para pero perfecta perfecto permuto peso pesos poca poco podes podria por porque precio puede pueden puedo que quien quienes quiero sale se semana sin solo son su sus tal tambien tarde tenga tengo tiene tienen toda todas todo todos u un una unas uno unos urgente usada usado usd uyu vale ver vende venden vendemos vendo venta x y zona".split(" "),
);
const SINONIMOS = { bicicleta: "bici", celular: "celu", telefono: "celu", televisor: "tele", television: "tele", tv: "tele", computadora: "compu", notebook: "compu", laptop: "compu", pc: "compu", coche: "auto", automovil: "auto", motocicleta: "moto", refrigerador: "heladera", lavadora: "lavarropa", lavarropas: "lavarropa", sillon: "sofa" };
const canonica = (w) => SINONIMOS[w] || (w.endsWith("es") && SINONIMOS[w.slice(0, -2)]) || (w.endsWith("s") && SINONIMOS[w.slice(0, -1)]) || w;
// Singular and plural are the same word: heladera/heladeras, celular/celulares, parlante/parlantes.
const mismaPalabra = (a, b) => a === b || `${a}s` === b || `${b}s` === a || `${a}es` === b || `${b}es` === a;

export function palabrasClave(texto) {
  const palabras = normalizar(texto)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => !/^\d+$/.test(w) && !VACIAS.has(w))
    .map(canonica)
    // Two letters are almost never the thing ("me", "lo", "ya"), and the few that are (tv, pc) became tele and compu.
    .filter((w) => w.length >= 3);
  return [...new Set(palabras)];
}

// How much a post fits a request: 0 when the request's first word (almost always the thing itself: "heladera chica")
// isn't in it, so "mesa chica" doesn't match "heladera chica"; otherwise the number of words they share.
function parecido(pedido, oferta) {
  if (!pedido.length || !oferta.some((w) => mismaPalabra(w, pedido[0]))) return 0;
  return pedido.filter((w) => oferta.some((x) => mismaPalabra(w, x))).length;
}

// The active posts of one type that fit a text, the closest first and then the newest; never the person's own, under
// either of their identities (mismaPersona): one posted under the LID came back to whoever wrote with only the number.
function parecidas(chat, tipo, texto, autor, comoPedido) {
  const palabras = palabrasClave(texto);
  return publicacionesActivas(chat, tipo, 500)
    .filter((p) => p.estado === "activa" && !mismaPersona(p.usuario, autor))
    .map((p) => ({ p, puntos: comoPedido ? parecido(palabras, palabrasClave(p.texto)) : parecido(palabrasClave(p.texto), palabras) }))
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || b.p.creada - a.p.creada)
    .map((x) => x.p);
}

// What was suggested to whom (so a repeated request doesn't get the same posts again), and how many loose requests
// each group got answered in the last hour. In memory: a restart starts over.
const sugeridas = new Map(); // "chat|person|number" (a post suggested) or "chat|person|@seller" (a seller pointed out) -> when
const respuestasSueltas = new Map(); // chat -> [when, ...]

const yaSugerido = (clave, ahora) => ahora - (sugeridas.get(clave) ?? -Infinity) <= COMPRAVENTA.RECORDAR_SUGERENCIA_MS;

function nuevasPara(chat, persona, posts, ahora) {
  for (const [clave, cuando] of sugeridas) if (ahora - cuando > COMPRAVENTA.RECORDAR_SUGERENCIA_MS) sugeridas.delete(clave);
  const nuevas = posts.filter((p) => !sugeridas.has(`${chat}|${persona}|${p.numero}`)).slice(0, COMPRAVENTA.SUGERENCIAS_MAX);
  for (const p of nuevas) sugeridas.set(`${chat}|${persona}|${p.numero}`, ahora);
  return nuevas;
}

const haceCuanto = (p, ahora) => (ahora - p.creada >= DIA_MS ? `, hace ${duracionLarga(ahora - p.creada).split(", ")[0]}` : "");

// For someone looking for something: the posts selling something like it. "Recuerdo que @Juan está vendiendo…".
// { texto, mentions } or null when there's nothing new to suggest.
export function sugerenciasPara(chat, comprador, texto, { ahora = Date.now() } = {}) {
  const ventas = nuevasPara(chat, comprador, parecidas(chat, "vendo", texto, comprador, true), ahora);
  if (!ventas.length) return null;
  const lineas = ventas.map((p, i) => `💡 ${i === 0 ? `${mencion(comprador)}, recuerdo que` : "Y"} ${mencion(p.usuario)} está vendiendo «${recortar(sinMenciones(p.texto), 60)}» (#${p.numero}${haceCuanto(p, ahora)}).`);
  lineas.push(ventas.length === 1 ? "Para hablarle, respondé a su publicación." : "Para hablarles, respondé a sus publicaciones.");
  return { texto: lineas.join("\n"), mentions: [comprador, ...ventas.map((p) => p.usuario)] };
}

// For someone who just put something up for sale: who was looking for something like it (their #busco), the best
// request of each. Only the ones named count as told: the rest still get it suggested when they ask again.
function interesadosEn(chat, vendedor, numero, texto, ahora) {
  const porPersona = new Map();
  for (const p of parecidas(chat, "compro", texto, vendedor, false)) if (!porPersona.has(p.usuario)) porPersona.set(p.usuario, p);
  // Not twice a day to the same person about the same seller: publishing and taking the post down over and over
  // mentioned them every time, each round being a new post number.
  const pedidos = [...porPersona.values()].filter((p) => !yaSugerido(`${chat}|${p.usuario}|@${vendedor}`, ahora)).slice(0, COMPRAVENTA.SUGERENCIAS_MAX);
  if (!pedidos.length) return null;
  for (const p of pedidos) {
    nuevasPara(chat, p.usuario, [{ numero }], ahora);
    sugeridas.set(`${chat}|${p.usuario}|@${vendedor}`, ahora);
  }
  return {
    texto: pedidos.map((p) => `💡 Esto puede ser lo que buscaba ${mencion(p.usuario)}: «${recortar(sinMenciones(p.texto), 60)}» (#${p.numero}).`).join("\n"),
    mentions: pedidos.map((p) => p.usuario),
  };
}

// A loose request in a buy-and-sell group: the suggestions, under a cap per group and hour, since each one is a message
// of its own. null when there's nothing to say (no similar post, or already suggested).
export function respuestaAPedido(chat, comprador, texto, { ahora = Date.now() } = {}) {
  const recientes = (respuestasSueltas.get(chat) || []).filter((t) => ahora - t < 60 * 60 * 1000);
  if (recientes.length >= COMPRAVENTA.SUGERENCIAS_POR_HORA) return null;
  const s = sugerenciasPara(chat, comprador, texto, { ahora });
  if (!s) return null;
  respuestasSueltas.set(chat, [...recientes, ahora]);
  return { texto: `${s.texto}\nPara que quede anotado lo que buscás: #busco y qué es.`, mentions: s.mentions };
}

// ---------- the price ----------
// What an ad asks, as its author wrote it, or "". It used to be read only with its currency ("$ 1.500", "1500 pesos",
// "USD 200"), and in a real sales group one price in six was written some other way: "1600$", "a 5500", "200 cada
// una", "lo dejo 900", "4 mil". Those ads were told "no le pusiste precio".
// The forms go from the surest sign to the weakest, and the first kind found is the price: in "120 mil km, USD 8.000"
// it's the one with the currency. A number by itself never is ("iPhone 17", "GTX 1650", a year), and neither is one
// that counts or measures something ("a 100 metros", "dejo 10 fotos", "30 mil seguidores").
// The digits have a ceiling everywhere: with an open [\d.,]*, a long "1.1.1.1…" took quadratic time.
const EMPIEZA = String.raw`(?<![\p{L}\p{N}])`; // a word or a number starts here
const TERMINA = String.raw`(?![\p{L}\p{N}])`; // and ends here
const MILES = String.raw`(?:\s?(?:k|mil)${TERMINA})?`;
// "$ 4.000", "$U 500", "u$s 350", "USD 200" · "1500 pesos", "2 lucas" · "1600$", and "1600 $" unless that sign opens
// the next number ("talle 42 $ 1.500").
const CON_MONEDA = new RegExp(
  String.raw`(?:u\$s|us\$|usd|uyu|\$u?)\s?\d[\d.,]{0,15}${MILES}` +
    String.raw`|${EMPIEZA}\d[\d.,]{0,15}${MILES}\s?(?:pesos|d[oó]lares|usd|uyu|palos|lucas)${TERMINA}` +
    String.raw`|${EMPIEZA}\d[\d.,]{0,15}${MILES}(?:\$|\s\$(?!\s?\d))`,
  "iu",
);
// Without a currency, the number has to look like an amount: it opens with 1 to 9 (a phone opens with 0) and has
// "min" digits or more, or it's so many "mil".
const monto = (min) => String.raw`(?:\d{1,3}(?:[.,]\d{1,2})?\s?mil|[1-9](?:[.,]?\d){${min - 1},8})`;
// And what follows it isn't what it counts: a unit stuck to it ("220v", "1080p"), a percentage, another number (a
// phone in two halves) or a word of measure.
const MEDIDAS =
  "km|kms|kil[oó]metros?|m|mt|mts|metros?|cm|cms|mm|m2|pulgadas?|pulg|kg|kgs|kilos?|g|gr|grs|gramos?|l|lt|lts|litros?|ml|cc|gb|mb|tb|gigas?|megas?|hz|mah|w|watts?|v|volts?|voltios?|mp|fps|rpm|btu|" +
  "hs|hrs|h|horas?|min|mins|minutos?|seg|segundos?|d[ií]as?|semanas?|mes|meses|a[nñ]os?|u|unid|unidades?|prendas?|piezas?|pares?|fotos?|im[aá]genes|personas?|plazas?|cuotas?|pagos?|cupos?|lugares?|" +
  "entradas?|productos?|art[ií]culos?|modelos?|colores?|talles?|sabores?|p[aá]ginas?|hojas?|cuadras?|puertas?|seguidores|suscriptores|veces|puntos";
const NO_MIDE = String.raw`(?![.,]?[\p{L}\p{N}])(?!\s?[%°º])(?!\s+\d)(?!\s+(?:${MEDIDAS})${TERMINA})`;
// "200 cada una", "500 c/u": said whole, since that's the price.
const POR_UNIDAD = new RegExp(String.raw`${EMPIEZA}${monto(2)}\s?(?:c\/u|c\/una|cada un[oa]|cada)${TERMINA}`, "iu");
// "precio 900", "sale 350", "lo dejo en 1.500", "c/u 200": the word announces it.
const CON_PALABRA = new RegExp(String.raw`${EMPIEZA}(?:precio|valor|sale|salen|cuesta|cuestan|vale|valen|dejo|dejamos|c\/u|cada un[oa])(?:\s+(?:en|a|de|es|son|final|total|ahora|solo))*\s*[:=]?\s*(${monto(2)})${NO_MIDE}`, "iu");
// "10 por 1500", "2x1500": so many for so much, said whole too.
const POR_CANTIDAD = new RegExp(String.raw`${EMPIEZA}(\d{1,2}\s?(?:x|por)\s?${monto(3)})${NO_MIDE}`, "iu");
// "a 5500", "todo por 3000": from three digits on, so "de 10 a 45 prendas" isn't one.
const CON_PREPOSICION = new RegExp(String.raw`${EMPIEZA}(?:a|por)\s+(${monto(3)})${NO_MIDE}`, "iu");
// "4 mil" and nothing else.
const EN_MILES = new RegExp(String.raw`${EMPIEZA}(\d{1,3}(?:[.,]\d{1,2})?\s?mil)${NO_MIDE}`, "iu");

export function detectarPrecio(texto) {
  const t = String(texto || "");
  const conMoneda = t.match(CON_MONEDA);
  // A trailing dot or comma belongs to the sentence, not the number:
  // "silla, $ 500, Pocitos" gives "$ 500", not "$ 500,".
  if (conMoneda) return conMoneda[0].trim().replace(/[.,]+$/, "");
  const porUnidad = t.match(POR_UNIDAD);
  if (porUnidad) return porUnidad[0].trim();
  for (const forma of [CON_PALABRA, POR_CANTIDAD, CON_PREPOSICION, EN_MILES]) {
    const m = t.match(forma);
    if (m) return m[1].trim();
  }
  return "";
}

// ---------- the same ad again ----------
// Sellers send the same ad every few days, and each time it became one more post: one in six of a real group's
// catalogue was a repeat, each with its own "¿sigue en pie?" a week later. An ad its author already has up renews that
// post instead. It's the same ad when both name the same thing first and one says everything the other does: the same
// text again, with a line added ("Todas las tarjetas"), or cut down to a reminder ("Vendo iPhone 17"). What an ad
// says, for this, is its words and numbers in order, without the price, the signs, the emoji or the words that carry
// no weight. Unlike palabrasClave, the short ones and the numbers count: "talle M" and "talle L" are two things for
// sale. So are two different prices: the same words may be another book.
function loQueDice(texto, precio) {
  const sinPrecio = precio ? String(texto).replace(precio, " ") : String(texto);
  const palabras = normalizar(sinPrecio).replace(/[^a-z0-9\s]/g, " ").split(/\s+/);
  return [...new Set(palabras.filter((w) => w && !VACIAS.has(w)).map(canonica))];
}
const precioComparable = (precio) => normalizar(precio).replace(/[\s.,]/g, "");
const laCosa = (palabras) => palabras.find((w) => /[a-z]/.test(w)) ?? palabras[0];
// Singular and plural are one word here too, from three letters on: the size "M" isn't the "mes" of "1 mes de uso".
const esLaMisma = (a, b) => a === b || (a.length >= 3 && b.length >= 3 && mismaPalabra(a, b));
const dentroDe = (unas, otras) => unas.every((w) => otras.some((x) => esLaMisma(w, x)));

// null when they're two ads. Otherwise, whether the new one says everything the old one did: that's when its text
// replaces the old one's, which a reminder cut short doesn't.
function mismoAviso(vieja, nueva) {
  if (vieja.precio && nueva.precio && precioComparable(vieja.precio) !== precioComparable(nueva.precio)) return null;
  // With nothing but empty words ("una más"), only the very same text.
  if (!vieja.dice.length || !nueva.dice.length) return vieja.dice.length === nueva.dice.length && normalizar(vieja.texto) === normalizar(nueva.texto) ? { completa: true } : null;
  if (!esLaMisma(laCosa(vieja.dice), laCosa(nueva.dice))) return null;
  const completa = dentroDe(vieja.dice, nueva.dice);
  return completa || dentroDe(nueva.dice, vieja.dice) ? { completa } : null;
}

// The author's live post this ad already is, the newest one: { p, completa } or null. Whose it is goes by either
// identity (mismaPersona), asked only of the ones that say the same.
function yaPublicada(chat, usuario, tipo, texto, precio) {
  const nueva = { texto, precio, dice: loQueDice(texto, precio) };
  for (const p of publicacionesActivas(chat, tipo, 500)) {
    const igual = mismoAviso({ texto: p.texto, precio: p.precio, dice: loQueDice(p.texto, p.precio) }, nueva);
    if (igual && mismaPersona(p.usuario, usuario)) return { p, completa: igual.completa };
  }
  return null;
}

// The repeat renews the post, which is also the answer to a "¿sigue en pie?" that was waiting. The post goes on to
// point at the newest message, the one people will reply to, and keeps its number, its state and whatever it had that
// the new text doesn't bring (the price of a reminder with none).
function renovar(chat, { p, completa }, texto, precio, messageId) {
  const cambios = { actualizada: Date.now(), aviso: 0 };
  if (messageId) cambios.messageId = messageId;
  if (completa) Object.assign(cambios, { texto, precio: precio || p.precio });
  actualizarPublicacion(chat, p.numero, cambios);
  const mensaje = `🔁 Ya estaba publicada: es la *${TIPOS[p.tipo].nombre} #${p.numero}*. La renové en vez de publicarla de nuevo, y vuelvo a preguntar si sigue en pie en ${COMPRAVENTA.DIAS_VIGENCIA} días.`;
  return { ok: true, renovada: true, numero: p.numero, precio: cambios.precio ?? p.precio, mensaje, sugerencias: null, avisos: null };
}

export function publicar(chat, usuario, tipo, texto, messageId = null) {
  const T = TIPOS[tipo];
  // An "@digits" in it would become a real mention each time the post is shown or suggested (sendText turns them into
  // mentions): whoever it named is written by name instead.
  const entero = sinMenciones(String(texto || "")).replace(/\s+/g, " ").trim();
  const limpio = recortar(entero, COMPRAVENTA.MAX_LARGO_TEXTO);
  if (limpio.length < 3) return { ok: false, error: `¿Qué ${tipo === "vendo" ? "vendés" : "buscás"}? Poné qué es, precio y zona, por ejemplo: #${tipo} bici rodado 26, $ 4.000, Pocitos` };
  const precio = detectarPrecio(limpio);
  // Before the cap: a repeat adds nothing to the count (r.renovada: nobody is told about it again).
  const repetida = yaPublicada(chat, usuario, tipo, limpio, precio);
  if (repetida) return renovar(chat, repetida, limpio, precio, messageId);
  if (contarPublicacionesActivas(chat, usuario) >= COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA) {
    return { ok: false, error: `Ya tenés ${COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA} publicaciones activas. Cerrá alguna con .vendido N o .baja N (las ves con .mias).` };
  }
  const numero = crearPublicacion({ chat, usuario, tipo, texto: limpio, precio, messageId });
  const sinPrecio = tipo === "vendo" && !precio ? "\nOjo: no le pusiste precio. Con precio se vende más rápido." : "";
  const recortada = limpio !== entero ? `\nEra muy larga: guardé las primeras ${COMPRAVENTA.MAX_LARGO_TEXTO} letras.` : "";
  const mensaje = `${T.emoji} *${T.nombre} #${numero}* registrada.${precio ? ` Precio: ${precio}.` : ""} Se ve con .${tipo}. Cuando se concrete, respondé este mensaje con .vendido (o .baja para sacarla).${sinPrecio}${recortada}`;
  // Whoever looks for something is reminded of who sells something like it, and whoever sells hears who was looking:
  // it goes in the same confirmation, so it costs no extra message.
  const sugerencias = tipo === "compro" ? sugerenciasPara(chat, usuario, limpio) : interesadosEn(chat, usuario, numero, limpio, Date.now());
  return { ok: true, numero, precio, mensaje, sugerencias, avisos: avisosPara(chat, usuario, numero, limpio, tipo, sugerencias?.mentions) };
}

// A heads-up for anyone whose alert keyword shows up in the post (except whoever posted it, and whoever the
// suggestions already named).
export function avisosPara(chat, autor, numero, texto, tipo, yaAvisados = []) {
  const t = normalizar(texto);
  // Each person once, by either identity: an alert kept under the number named again someone the suggestions had just
  // named by their LID. By one key per person, the LID the database knows for a number, as mismaPersona compares
  // them: comparing each alert with every one already in took half a second with a hundred of them, the bot held.
  const persona = (id) => lidDe(id);
  const vistas = new Set([autor, ...(yaAvisados || [])].filter(Boolean).map(persona));
  const usuarios = [];
  for (const a of alertasDelChat(chat)) {
    if (!t.includes(normalizar(a.palabra))) continue;
    const quien = persona(a.usuario);
    if (vistas.has(quien)) continue;
    vistas.add(quien);
    usuarios.push(a.usuario);
  }
  if (!usuarios.length) return null;
  return { texto: `🔔 ${usuarios.map(mencion).join(" ")}: apareció algo que buscabas. ${TIPOS[tipo].nombre} #${numero}: ${recortar(texto)}`, mentions: usuarios };
}

// The announcement of a new post, the same for every route (a #vendo, .vendo, or a loose "vendo…" in a buy-and-sell
// group), with its suggestions. It stores the confirmation message's id: quoting it later closes the post, with no
// need to remember its number.
export async function anunciarPublicacion(client, m, r, { extra = "", mentions = [] } = {}) {
  const sugerencias = r.sugerencias ? `\n\n${r.sugerencias.texto}` : "";
  const enviado = await client.sendText(m.chat, r.mensaje + extra + sugerencias, m, { mentions: [...new Set([...mentions, ...(r.sugerencias?.mentions || [])])] });
  if (enviado?.key?.id) actualizarPublicacion(m.chat, r.numero, { mensajeBot: enviado.key.id });
  if (r.avisos) await client.sendMessage(m.chat, { text: r.avisos.texto, mentions: r.avisos.mentions });
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
  return { texto: `${bloques.join("\n\n")}\n\nDetalle: .catalogo N · buscar: .buscar <palabra> · avisos: .avisame <palabra>`, mentions: [] };
}

// A few different words, and each post normalised once: it used to normalise every post again for each word, with no
// limit on how many, and a long search over long posts held the whole bot for seconds.
export function textoBusqueda(chat, consulta) {
  const palabras = [...new Set(normalizar(consulta).split(/\s+/).filter((w) => w.length >= 2))].slice(0, COMPRAVENTA.MAX_PALABRAS_BUSQUEDA);
  if (!palabras.length) return { texto: "¿Qué buscás? Por ejemplo: .buscar bici", mentions: [] };
  const lista = publicacionesActivas(chat, null, 500).filter((p) => {
    const texto = normalizar(p.texto);
    return palabras.every((w) => texto.includes(w));
  });
  const pedido = recortar(String(consulta).trim(), 60);
  if (!lista.length) return { texto: `🔎 Nada activo con "${pedido}". Con .avisame ${palabras[0]} te menciono cuando aparezca.`, mentions: [] };
  return { texto: `🔎 *Resultados para "${pedido}"* (${lista.length})\n${lista.map((p) => `${TIPOS[p.tipo].emoji} ${linea(p)}`).join("\n")}`, mentions: [] };
}

export function textoMias(chat, usuario) {
  const lista = publicacionesDe(chat, usuario);
  if (!lista.length) return { texto: "No tenés publicaciones activas. Para publicar, escribí #vendo o #compro con qué es, precio y zona.", mentions: [] };
  return { texto: `🗂️ *Tus publicaciones activas* (${lista.length})\n${lista.map((p) => `${TIPOS[p.tipo].emoji} ${linea(p)}`).join("\n")}\n\n.vendido N cuando se concrete · .baja N para sacarla · .reservado N si está señada · .sigue N para renovarla`, mentions: [usuario] };
}

// usuario and esMod are who asks: the text of one no longer up is only for whoever posted it and the moderators.
export function textoPublicacion(chat, numero, { usuario = null, esMod = false, ahora = Date.now() } = {}) {
  const p = getPublicacion(chat, numero);
  if (!p) return { texto: `No hay ninguna publicación #${numero} en este grupo.`, mentions: [] };
  const T = TIPOS[p.tipo];
  const cabecera = `${T.emoji} *${T.nombre} #${p.numero}* · ${ESTADOS[p.estado] || p.estado}`;
  // It may have been taken down for showing a phone number or an address, and it used to stay readable by anyone,
  // forever.
  if (!VIGENTES.includes(p.estado) && !mismaPersona(p.usuario, usuario) && !esMod) return { texto: `${cabecera}\nYa no está publicada.`, mentions: [] };
  const lineas = [cabecera, p.texto, `${p.precio ? `Precio: ${p.precio} · ` : ""}Publicó ${mencion(p.usuario)} hace ${duracion(ahora - p.creada)}`];
  return { texto: lineas.join("\n"), mentions: [p.usuario] };
}

// ---------- estados ----------
const ACCIONES = {
  vendido: { estado: "vendida", texto: (p) => `✅ Listo, la #${p.numero} quedó como concretada. ¡Que la disfrute!` },
  baja: { estado: "cerrada", texto: (p) => `🗑️ Listo, di de baja la #${p.numero}.` },
  reservado: { estado: "reservada", texto: (p) => `🔒 La #${p.numero} quedó como reservada. Con .sigue ${p.numero} vuelve a estar libre; con .vendido ${p.numero} la cerrás.` },
  sigue: { estado: "activa", texto: (p) => `👍 La #${p.numero} sigue activa. Te vuelvo a preguntar en ${COMPRAVENTA.DIAS_VIGENCIA} días.` },
};
// The same answers for several posts at once (aplicarCambios), by what happened to them: each action, and a reserved
// one that was renewed as it was.
const VARIAS = {
  sigue: (cuales) => `👍 Las ${cuales} siguen activas. Te vuelvo a preguntar en ${COMPRAVENTA.DIAS_VIGENCIA} días.`,
  sigueReservada: (cuales) => `🔒 Las ${cuales} siguen reservadas. Te vuelvo a preguntar en ${COMPRAVENTA.DIAS_VIGENCIA} días.`,
  reservado: (cuales) => `🔒 Las ${cuales} quedaron como reservadas. Con .sigue y su número vuelven a estar libres; con .vendido, las cerrás.`,
  vendido: (cuales) => `✅ Listo, las ${cuales} quedaron como concretadas.`,
  baja: (cuales) => `🗑️ Listo, di de baja las ${cuales}.`,
};

const VIGENTES = ["activa", "reservada"];

// Whoever posted, or a moderator, changes the state. "sigue" also revives an expired, sold or closed one, and frees a
// reserved one.
export function cambiarEstado(chat, numero, usuario, esMod, accion, ahora = Date.now()) {
  const A = ACCIONES[accion];
  if (!A) return { ok: false, error: "Acciones: .vendido N, .baja N, .reservado N o .sigue N" };
  if (!Number.isInteger(numero)) return { ok: false, error: `¿Cuál? Respondé a la publicación y escribí .${accion}, o poné el número: .${accion} 12 (las tuyas están en .mias)` };
  const p = getPublicacion(chat, numero);
  if (!p) return { ok: false, error: `No hay ninguna publicación #${numero} en este grupo.` };
  // Whose it is goes by either identity (mismaPersona): a message may bring the number and the post have the LID.
  const suya = mismaPersona(p.usuario, usuario);
  if (!suya && !esMod) return { ok: false, error: `La #${numero} no es tuya: solo quien la publicó, o un moderador, puede cambiarla.` };
  if (p.estado === A.estado) {
    if (!VIGENTES.includes(p.estado)) return { ok: false, error: `La #${numero} ya está ${ESTADOS[p.estado]}.` };
    // The same state again renews it, which is what the "¿sigue en pie?" asks for: .sigue on an active post used to
    // answer "ya está activa", and two days later the post was taken down for lack of an answer.
    actualizarPublicacion(chat, numero, { actualizada: ahora, aviso: 0 });
    const reservada = p.estado === "reservada";
    return { ok: true, numero, clase: reservada ? "sigueReservada" : "sigue", mensaje: `${reservada ? "🔒" : "👍"} La #${numero} sigue ${p.estado}. Te vuelvo a preguntar en ${COMPRAVENTA.DIAS_VIGENCIA} días.` };
  }
  if ((p.estado === "vendida" || p.estado === "cerrada") && accion !== "sigue") return { ok: false, error: `La #${numero} ya está ${ESTADOS[p.estado]}. Con .sigue ${numero} la volvés a activar.` };
  // Bringing one back counts against the cap, like publishing: .baja and then .sigue used to get around it. Only
  // bringing it back: with the cap reached, an expired one couldn't be marked as sold either.
  if (VIGENTES.includes(A.estado) && !VIGENTES.includes(p.estado) && contarPublicacionesActivas(chat, p.usuario) >= COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA) {
    const quien = suya ? "ya tenés" : `${nombreDe(p.usuario)} ya tiene`;
    return { ok: false, error: `La #${numero} no se puede reactivar: ${quien} ${COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA} publicaciones activas. Cerrá alguna con .vendido N o .baja N.` };
  }
  actualizarPublicacion(chat, numero, { estado: A.estado, actualizada: ahora, aviso: 0 });
  return { ok: true, numero, clase: accion, mensaje: A.texto(p) };
}

// "#5, #6 y #7"
const enLista = (numeros) => numeros.map((n) => `#${n}`).join(", ").replace(/, ([^,]*)$/, " y $1");

// Several changes in one go ([[number, action], ...]) and one answer for all of them: a single change answers as
// cambiarEstado does, and several say each thing once ("Las #5, #6 y #7 siguen activas"), with what couldn't be done
// after it.
export function aplicarCambios(chat, usuario, esMod, cambios, ahora = Date.now()) {
  const resultados = cambios.map(([numero, accion]) => cambiarEstado(chat, numero, usuario, esMod, accion, ahora));
  if (resultados.length === 1) return resultados[0];
  const lineas = [];
  for (const [clase, varias] of Object.entries(VARIAS)) {
    const hechas = resultados.filter((r) => r.ok && r.clase === clase);
    if (hechas.length) lineas.push(hechas.length === 1 ? hechas[0].mensaje : varias(enLista(hechas.map((r) => r.numero))));
  }
  const errores = resultados.filter((r) => !r.ok).map((r) => r.error);
  if (!lineas.length) return { ok: false, error: errores.join("\n❌ ") };
  return { ok: true, mensaje: [...lineas, ...errores.map((e) => `❌ ${e}`)].join("\n") };
}

// The person's posts that one of the bot's notices named (the "¿sigue en pie?", the take-down for lack of an answer),
// for a reply to that notice: never one its owner closed since. citado is the id of the message replied to.
const delAviso = (chat, usuario, citado) => publicacionesDelAviso(chat, citado).filter((p) => p.estado !== "vendida" && p.estado !== "cerrada" && mismaPersona(p.usuario, usuario));

// "todas", for whoever says it: replying to a notice, the ones it named; otherwise the posts the bot is waiting on
// (asked about and still up) and the ones it took down this week for lack of an answer.
function porResponder(chat, usuario, citado, ahora) {
  const nombradas = delAviso(chat, usuario, citado);
  return nombradas.length ? nombradas : publicacionesPorResponder(chat, ahora - COMPRAVENTA.DIAS_VIGENCIA * DIA_MS).filter((p) => mismaPersona(p.usuario, usuario));
}

// Said of several at once, "sigue" means they still stand as they are: the reserved one stays reserved. With its
// number, .sigue frees it, as always.
const enBloque = (p, accion) => [p.numero, accion === "sigue" && p.estado === "reservada" ? "reservado" : accion];

// A state command (.vendido, .baja, .reservado, .sigue): what it's about comes after it, one number, several (when
// nothing else follows them: ".baja 12 2 unidades" is about the #12) or "todas", which is what the bot asked about
// or, with nothing asked, every post the person has up. With none of that, it's the post being replied to: the
// person's message, the bot's confirmation, or a notice (the "¿sigue en pie?"), which is about the ones it named.
export function cambiarPorComando(chat, usuario, esMod, accion, texto, citado = null, ahora = Date.now()) {
  // The sign glued at the end goes, as on a command's name: ".sigue 12." is about the #12.
  const palabras = normalizar(texto).split(/[\s,]+/).map((w) => w.replace(/[.;:!?]+$/, "")).filter(Boolean);
  const numeroDe = (w) => (/^#?\d{1,9}$/.test(w) ? parseInt(w.replace("#", ""), 10) : null);
  const suya = (p) => mismaPersona(p.usuario, usuario);
  let cambios;
  if (/^tod[oa]s?$/.test(palabras[0] || "")) {
    const pendientes = porResponder(chat, usuario, citado, ahora);
    const todas = pendientes.length ? pendientes : publicacionesActivas(chat, null, 500).filter(suya).reverse();
    if (!todas.length) return { ok: false, error: "No tenés publicaciones activas." };
    cambios = todas.map((p) => enBloque(p, accion));
  } else if (numeroDe(palabras[0] || "") !== null) {
    const lista = palabras.filter((w) => w !== "y" && w !== "e").map(numeroDe);
    const numeros = lista.includes(null) ? lista.slice(0, 1) : [...new Set(lista)];
    if (numeros.length > COMPRAVENTA.MAX_DE_UNA_VEZ) return { ok: false, error: `De a ${COMPRAVENTA.MAX_DE_UNA_VEZ} publicaciones como mucho.` };
    cambios = numeros.map((n) => [n, accion]);
  } else {
    const una = getPublicacionPorMensaje(chat, citado);
    const nombradas = una ? [] : delAviso(chat, usuario, citado);
    cambios = una ? [[una.numero, accion]] : nombradas.length ? nombradas.map((p) => enBloque(p, accion)) : [[undefined, accion]];
  }
  return aplicarCambios(chat, usuario, esMod, cambios, ahora);
}

// ---------- answers written without the prefix ----------
// The bot asks "¿sigue en pie tu vendo #20?" and people answer it as they'd answer a person: "Sigue 20", "Vendido #17",
// "Baja #30. Sin stock por el momento", "Vendido 19 / Baja 19". Without the dot none of them was a command: a quarter
// of a real group's questions ended in a take-down "for lack of an answer" that the seller had given. They're read
// here: an action's word opening a line or a sentence (a greeting may come first), and right after it the posts'
// numbers or "todas". After those, only the end, a sign or a word of courtesy: in "Vendido 2 de los 3" or "Baja 500
// pesos" the number isn't a post, and neither is "1.500". Each piece stays within its line. The asterisks of an answer
// copied from the question, where they show in bold, are signs like any other.
const B = String.raw`[^\S\n]`; // a blank that isn't a line break
const SIN_MAS = String.raw`(?![\p{L}\p{N}])`; // the word ends here
const ANTES = String.raw`(?:(?:hola|holis|buenas tardes|buenas noches|buenas|buen dia|gente|che|claudia|si|ya|ok|dale|listo|@\S+)${SIN_MAS}(?:${B}|[,!.])*)*`;
const VERBO = String.raw`(siguen?|vendid[oa]s?|baja|reservad[oa]s?)${SIN_MAS}`;
const ENTRE = String.raw`(?:${B}+(?:en pie|disponibles?|las?|el|los|nro\.?|n[°º]|numero|publicacion(?:es)?)${SIN_MAS})*`;
// A post's number, with or without "#": not part of a longer one, a decimal, a time, a fraction, a percentage or a
// price.
const NUMERO = String.raw`#?\d{1,6}(?!\d|[.:/]\d|${B}*[%$°º])`;
const LISTA = String.raw`((?:(?:${B}*,${B}*|${B}+[ye]${B}+|${B}+|(?=#))${NUMERO})+)`;
const CORTESIA = String.raw`(?:(?:${B}|,)*(?:muchas gracias|gracias|grax|porfa|por favor|plis|ok|dale|ya|todavia|aun|nomas|en pie|disponibles?)${SIN_MAS})*`;
const RESPUESTA = new RegExp(String.raw`(?<=^|[^\p{L}\p{N}\s#@])${B}*${ANTES}${VERBO}${ENTRE}(?:${B}+(tod[oa]s?)${SIN_MAS}|${LISTA})?${CORTESIA}${B}*(?=$|[^\p{L}\p{N}\s])`, "gmu");
// The action's word and nothing else in the whole message ("Vendido", "Sigue en pie, gracias 👍"): it says which post
// only as a reply to one.
const SOLA = new RegExp(String.raw`^\s*${ANTES}${VERBO}(?:${B}+(?:en pie|disponibles?|todavia|aun)${SIN_MAS})*${CORTESIA}[^\p{L}\p{N}]*$`, "u");
const accionDe = (verbo) => (!verbo ? null : verbo.startsWith("sigue") ? "sigue" : verbo.startsWith("vendid") ? "vendido" : verbo === "baja" ? "baja" : "reservado");

// What a message asks to do with posts, written as an answer: { pedidos: [{ accion, numeros } or { accion, todas }],
// sola: the action said with nothing else, or null }, or null when it asks nothing.
export function leerRespuesta(texto) {
  const crudo = String(texto || "");
  if (!crudo.trim() || crudo.length > COMPRAVENTA.MAX_LARGO_RESPUESTA) return null;
  const t = normalizar(crudo);
  const pedidos = [];
  for (const m of t.matchAll(RESPUESTA)) {
    if (m[2]) pedidos.push({ accion: accionDe(m[1]), todas: true });
    else if (m[3]) pedidos.push({ accion: accionDe(m[1]), numeros: m[3].match(/\d+/g).map(Number) });
  }
  const sola = pedidos.length ? null : accionDe(t.match(SOLA)?.[1]);
  return pedidos.length || sola ? { pedidos, sola } : null;
}

// What an answer changes: [[number, action], ...], only among the posts of whoever wrote it, and only the ones that
// are up or that the bot took down for lack of an answer (one its owner closed stays closed). Empty when the message
// isn't about any of them, which is most of the time: "Vendido 2" from someone with no post #2 is just talk. The
// first thing said of a post stands ("Vendido 19 / Baja 19"). citado is the id of the message being replied to.
export function cambiosDeRespuesta(chat, usuario, respuesta, citado = null, ahora = Date.now()) {
  const cambios = new Map();
  const anotar = (p, accion, bloque) => {
    if (!p || cambios.has(p.numero) || !(VIGENTES.includes(p.estado) || p.estado === "vencida") || !mismaPersona(p.usuario, usuario)) return;
    cambios.set(p.numero, bloque ? enBloque(p, accion)[1] : accion);
  };
  for (const pedido of respuesta?.pedidos || []) {
    if (pedido.todas) for (const p of porResponder(chat, usuario, citado, ahora)) anotar(p, pedido.accion, true);
    else for (const n of pedido.numeros) anotar(getPublicacion(chat, n), pedido.accion, false);
  }
  if (respuesta?.sola && citado) {
    const una = getPublicacionPorMensaje(chat, citado);
    if (una) anotar(una, respuesta.sola, false);
    else for (const p of delAviso(chat, usuario, citado)) anotar(p, respuesta.sola, true);
  }
  return [...cambios];
}

// ---------- alertas ----------
export function gestionarAlerta(chat, usuario, args) {
  const quitar = /^(quitar|sacar|borrar)$/i.test(args[0] || "");
  const palabra = normalizar(args.slice(quitar ? 1 : 0).join(" "));
  // What's echoed back goes without mentions: these replies go through sendText, which turns an "@digits" into one.
  if (!palabra) {
    const lista = alertasDe(chat, usuario);
    return { ok: true, mensaje: lista.length ? `🔔 Tus alertas: ${sinMenciones(lista.join(", "))}.\n.avisame <palabra> agrega, .avisame quitar <palabra> saca.` : "🔔 No tenés alertas. Con .avisame bici te menciono cuando alguien publique algo con esa palabra." };
  }
  if (quitar) return quitarAlerta(chat, usuario, palabra) ? { ok: true, mensaje: `🔕 Listo, saqué la alerta "${sinMenciones(palabra)}".` } : { ok: false, error: `No tenías una alerta "${sinMenciones(palabra)}".` };
  if (palabra.includes("@")) return { ok: false, error: "La alerta es una palabra de lo que buscás, sin @. Por ejemplo: .avisame bici" };
  if (palabra.length < 3) return { ok: false, error: "La palabra tiene que tener al menos 3 letras." };
  if (alertasDe(chat, usuario).length >= COMPRAVENTA.MAX_ALERTAS) return { ok: false, error: `Ya tenés ${COMPRAVENTA.MAX_ALERTAS} alertas; sacá alguna con .avisame quitar <palabra>.` };
  if (!agregarAlerta(chat, usuario, palabra)) return { ok: false, error: `Ya tenías la alerta "${palabra}".` };
  return { ok: true, mensaje: `🔔 Listo: te menciono cuando alguien publique algo con "${palabra}".` };
}

// ---------- expiry (runs every 5 minutes from tareas-programadas.js) ----------
// A third of what the bot said in a real sales group was this: a "¿sigue en pie?" for each post the minute it turned 7
// days old, five in a row to one seller, at any hour, and two days later a take-down message for each. Now there's
// one round a day: one question to each person, with all of theirs that are due, and one message for everything
// taken down in the group.
const textoCorto = (p) => recortar(p.texto, 60);

function textoPregunta(posts) {
  const quien = mencion(posts[0].usuario);
  const dias = COMPRAVENTA.DIAS_PARA_CONTESTAR;
  const n = posts[0].numero;
  // The answers go without the dot, in bold: that's how people wrote them anyway (leerRespuesta), and the dot commands
  // still work.
  if (posts.length === 1) {
    // A reserved one is kept with "reservado": "sigue" frees it.
    const mantener = posts[0].estado === "reservada" ? `*reservado ${n}* para mantenerla reservada, *sigue ${n}* si vuelve a estar libre` : `*sigue ${n}* para mantenerla`;
    return `❓ ${quien}, ¿sigue en pie tu ${TIPOS[posts[0].tipo].nombre.toLowerCase()} #${n} (${textoCorto(posts[0])})? Respondé ${mantener}, o *vendido ${n}* / *baja ${n}*. Si no, en ${dias} días la doy de baja.`;
  }
  const lineas = posts.map((p) => `${TIPOS[p.tipo].emoji} ${p.estado === "reservada" ? "🔒 " : ""}*#${p.numero}* ${textoCorto(p)}`);
  return `❓ ${quien}, ¿siguen en pie tus publicaciones?\n${lineas.join("\n")}\nRespondé *sigue todas* para mantenerlas como están, o de a una: *sigue ${n}*, *vendido ${n}* o *baja ${n}*. Las que queden sin respuesta las doy de baja en ${dias} días.`;
}

function textoBajas(posts) {
  const n = posts[0].numero;
  if (posts.length === 1) return `⌛ Di de baja la #${n} de ${mencion(posts[0].usuario)} por falta de respuesta. Si sigue en pie, *sigue ${n}* la vuelve a activar.`;
  const lineas = posts.map((p) => `*#${p.numero}* ${textoCorto(p)} — ${mencion(p.usuario)}`);
  return `⌛ Di de baja por falta de respuesta:\n${lineas.join("\n")}\nSi alguna sigue en pie, quien la publicó la vuelve a activar con *sigue* y su número (*sigue ${n}*), o con *sigue todas*.`;
}

// One notice: the question to one person about their posts, or a group's take-downs. Returns how many posts it told
// about.
async function avisar({ pregunta, chat, posts }, ahora, client) {
  // Read again right before they're handled, and claimed in the same step (no await in between): a pass that outlasted
  // the 5 minutes left the next one listing the posts it hadn't reached yet, and both asked the seller. It also skips
  // one renewed or closed while the pass waited for its turn.
  const igual = (p, campos) => {
    const hoy = getPublicacion(chat, p.numero);
    return Boolean(hoy) && Object.entries(campos).every(([campo, valor]) => hoy[campo] === valor);
  };
  const quedan = posts.filter((p) => igual(p, { estado: p.estado, aviso: p.aviso, actualizada: p.actualizada }));
  if (!quedan.length) return 0;
  // Saved before sending, so two passes can't both send it, and put back if the send fails so the next pass tries
  // again: the "still on?" used to start the countdown even when it never reached the seller, and two days later the
  // post was taken down "for lack of an answer" to a question nobody got.
  const marca = pregunta ? { aviso: ahora } : { estado: "vencida", actualizada: ahora };
  for (const p of quedan) actualizarPublicacion(chat, p.numero, marca);
  try {
    const enviado = await client.sendMessage(chat, { text: pregunta ? textoPregunta(quedan) : textoBajas(quedan), mentions: [...new Set(quedan.map((p) => p.usuario))] });
    // A reply to this message with one word ("sigue") is about the posts it names.
    if (enviado?.key?.id) for (const p of quedan) actualizarPublicacion(chat, p.numero, { mensajeAviso: enviado.key.id });
    return quedan.length;
  } catch (e) {
    console.error("[compraventa] no se pudo avisar:", e.message);
    const clave = `${chat}|publicaciones|${pregunta ? "aviso" : "baja"}|${quedan.map((p) => `${p.numero}:${p.actualizada}`).join(",")}`;
    if (!volverAIntentar(clave)) return 0;
    // Only what's still as this pass left it: whoever answered while the send was failing keeps their answer.
    for (const p of quedan) if (igual(p, marca)) actualizarPublicacion(chat, p.numero, pregunta ? { aviso: 0 } : { estado: p.estado, actualizada: p.actualizada });
    return 0;
  }
}

export async function chequearPublicaciones(ahora = Date.now(), client = conexion.client) {
  const hoy = new Date(ahora);
  if (hoy.getHours() < COMPRAVENTA.RONDA_DESDE || hoy.getHours() >= COMPRAVENTA.RONDA_HASTA) return 0;
  // What the round asks about is what was due when it opened, whatever the pass that gets to it: the passes that follow
  // in the day find nothing new to ask, and a post that turns 7 days old in the afternoon waits for tomorrow's round. A
  // take-down comes at the first pass of a round with the two days gone: the posts asked about together go together.
  const apertura = hoy.setHours(COMPRAVENTA.RONDA_DESDE, 0, 0, 0);
  const lista = publicacionesParaRevisar(apertura - COMPRAVENTA.DIAS_VIGENCIA * DIA_MS, ahora - COMPRAVENTA.DIAS_PARA_CONTESTAR * DIA_MS);
  const avisos = new Map();
  for (const p of lista) {
    const pregunta = p.aviso === 0;
    // Each person's posts under one key, the LID the database knows for a number: one may be kept under each.
    const clave = pregunta ? `pregunta|${p.chat}|${lidDe(p.usuario)}` : `baja|${p.chat}`;
    if (!avisos.has(clave)) avisos.set(clave, { pregunta, chat: p.chat, posts: [] });
    avisos.get(clave).posts.push(p);
  }
  let tocadas = 0;
  // The take-downs first: in a group they read before the day's questions.
  for (const aviso of [...avisos.values()].sort((a, b) => Number(a.pregunta) - Number(b.pregunta))) tocadas += await avisar(aviso, ahora, client);
  return tocadas;
}

// ---------- the catalogue, unasked ----------
// In a buy-and-sell group the catalogue goes out by itself every few hours. Nobody asked for it: in a real group 3
// people in 210 ever typed .catalogo, so being in it was worth nothing to a seller, who sent the same ad again every
// few days because the chat buries it. Shown unasked, the list is what brings an ad back up.
// It goes out within the round's hours (RONDA_DESDE to RONDA_HASTA), CATALOGO_CADA_MS apart at least, and only when
// the group wrote CATALOGO_MIN_MENSAJES or more since the hour of the last one: in a quiet group that one is still in
// sight, and the bot would be talking to itself. An admin switches it off with .catalogoauto off.
// The list is .catalogo's, under a title and with how to get into it, which is what whoever never types a command
// is missing.
const textoCatalogoAuto = (chat) =>
  `🛒 *CATÁLOGO DEL GRUPO*\n\n${textoCatalogo(chat).texto}\n📌 ¿Vendés algo? Empezá tu mensaje con «vendo», decí qué es y a cuánto, y queda en esta lista.`;

export async function mostrarCatalogos(ahora = Date.now(), client = conexion.client) {
  const hora = new Date(ahora).getHours();
  if (hora < COMPRAVENTA.RONDA_DESDE || hora >= COMPRAVENTA.RONDA_HASTA) return 0;
  let mostrados = 0;
  // Only where something is up: an empty list is no catalogue.
  for (const chat of chatsConPublicaciones()) {
    const fila = getChat(chat);
    // Not where the bot was told to keep quiet (.banchat), nor where only the admins use it (.modoadmin): there the
    // list would invite everyone to post, and nobody else's message is read.
    if (!esGrupoDeVentas(fila) || !fila.catalogoAuto || fila.isBanned || fila.adminMode) continue;
    const anterior = fila.catalogoMostrado || 0;
    if (ahora - anterior < COMPRAVENTA.CATALOGO_CADA_MS) continue;
    const entonces = new Date(anterior);
    if (mensajesDespuesDe(chat, claveDia(entonces), entonces.getHours()) < COMPRAVENTA.CATALOGO_MIN_MENSAJES) continue;
    // Marked before it goes out, as the round's notices are: a pass that overlaps this one finds it shown.
    updateChat(chat, { catalogoMostrado: ahora });
    try {
      const enviado = await client.sendMessage(chat, { text: textoCatalogoAuto(chat) });
      mostrados++;
      const id = enviado?.key?.id;
      // Without the new one's id there'd be no deleting it next time: the old one stays, and stays the one on record.
      if (!id) continue;
      updateChat(chat, { catalogoMensaje: id });
      // The one before is deleted, so the chat holds a single catalogue and no outdated one further up. It's the bot's
      // own message, and its key is the one Baileys gave it when it went out: the chat, fromMe and the id. A deletion
      // that fails (WhatsApp takes them for a couple of days) leaves that message where it was, and that's all.
      if (fila.catalogoMensaje) await client.sendMessage(chat, { delete: { remoteJid: chat, fromMe: true, id: fila.catalogoMensaje } }).catch(() => {});
    } catch (e) {
      console.error("[compraventa] no se pudo mostrar el catálogo:", e.message);
      // Tried again in the next pass, a few times and no more (lib/avisos-programados.js); after that, in a few hours.
      if (volverAIntentar(`${chat}|catalogo|${anterior}`)) updateChat(chat, { catalogoMostrado: anterior });
    }
  }
  return mostrados;
}

// ---------- whoever leaves the group ----------
// Their live posts are taken down and their alerts removed (lib/participantes.js): they used to stay in the catalogue,
// and the "¿sigue en pie?" kept mentioning someone who was gone. Back in the group, .sigue N brings a post back.
// Returns how many posts and alerts it touched. participants are the group's, as for the roles (limpiarRolesAlSalir,
// lib/roles.js).
export function limpiarVentasAlSalir(chat, participantes, ahora = Date.now(), participants = null) {
  let tocadas = 0;
  for (const p of participantes || []) for (const id of idsDeParticipante(p, participants)) tocadas += cerrarPublicacionesDe(chat, id, ahora) + quitarAlertasDe(chat, id);
  return tocadas;
}
