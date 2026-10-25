// Marketplace: posts numbered per group with #vendo / #compro (or .vendo / .compro), catalogue, search, keyword
// alerts and expiry with a heads-up. Built for buy-and-sell groups, but it works in any of them.
import { crearPublicacion, getPublicacion, publicacionesActivas, publicacionesDe, contarPublicacionesActivas, actualizarPublicacion, publicacionesParaRevisar, agregarAlerta, quitarAlerta, alertasDe, alertasDelChat, cerrarPublicacionesDe, quitarAlertasDe } from "../database-functions.js";
import { DIA_MS, duracion, duracionLarga } from "./tiempo.js";
import { nombreDe, sinMenciones } from "./menciones.js";
import { idsDeParticipante, mismaPersona, lidDe } from "./identidad.js";
import { volverAIntentar } from "./avisos-programados.js";

export const COMPRAVENTA = {
  DIAS_VIGENCIA: 7, // after 7 quiet days the bot asks whether it's still available
  DIAS_PARA_CONTESTAR: 2, // with no answer within that window, it's taken down
  MAX_ACTIVAS_POR_PERSONA: 10,
  MAX_ALERTAS: 5,
  LARGO_LINEA: 90,
  // A post is a few lines. One of 64.000 characters held the whole bot for 13 s (the price regex) and made every
  // search over it slow: what goes past this is cut off.
  MAX_LARGO_TEXTO: 1000,
  MAX_PALABRAS_BUSQUEDA: 5,
  SUGERENCIAS_MAX: 2, // similar posts suggested at a time
  SUGERENCIAS_POR_HORA: 20, // replies to loose requests ("¿alguien vende…?") per group: each one is a message
  RECORDAR_SUGERENCIA_MS: DIA_MS, // the same post isn't suggested again to the same person within a day
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

// Written without a hashtag, which only counts in a buy-and-sell group (plugins/_compraventa.js): there that's what people
// come for, while in a group of friends "vendo a mi hermano" is a joke. Either may come after a greeting. An offer
// ("vendo…", "se vende…") is a post; a request ("busco…", "¿alguien vende…?", "necesito…") only gets suggestions, with
// soloSugerir: it isn't kept, it's often just a question.
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

// "$ 1.500", "1500 pesos", "USD 200", "U$S 200", "200 dólares", "2k" with a currency → the price exactly as written, or ""
// The digits have a ceiling: with an open [\d.,]*, a long "1.1.1.1…" with no currency took quadratic time.
export function detectarPrecio(texto) {
  const m = String(texto || "").match(/(?:u\$s|us\$|usd|uyu|\$)\s?\d[\d.,]{0,15}\s?(?:k|mil)?|\b\d[\d.,]{0,15}\s?(?:k|mil)?\s?(?:pesos|d[oó]lares|usd|uyu|palos|lucas)\b/i);
  // A trailing dot or comma belongs to the sentence, not the number: "silla, $ 500, Pocitos" gives "$ 500", not "$ 500,".
  return m ? m[0].trim().replace(/[.,]+$/, "") : "";
}

export function publicar(chat, usuario, tipo, texto, messageId = null) {
  const T = TIPOS[tipo];
  // An "@digits" in it would become a real mention each time the post is shown or suggested (sendText turns them into
  // mentions): whoever it named is written by name instead.
  const entero = sinMenciones(String(texto || "")).replace(/\s+/g, " ").trim();
  const limpio = recortar(entero, COMPRAVENTA.MAX_LARGO_TEXTO);
  if (limpio.length < 3) return { ok: false, error: `¿Qué ${tipo === "vendo" ? "vendés" : "buscás"}? Poné qué es, precio y zona, por ejemplo: #${tipo} bici rodado 26, $ 4.000, Pocitos` };
  if (contarPublicacionesActivas(chat, usuario) >= COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA) {
    return { ok: false, error: `Ya tenés ${COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA} publicaciones activas. Cerrá alguna con .vendido N o .baja N (las ves con .mias).` };
  }
  const precio = detectarPrecio(limpio);
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
    return { ok: true, mensaje: `${p.estado === "reservada" ? "🔒" : "👍"} La #${numero} sigue ${p.estado}. Te vuelvo a preguntar en ${COMPRAVENTA.DIAS_VIGENCIA} días.` };
  }
  if ((p.estado === "vendida" || p.estado === "cerrada") && accion !== "sigue") return { ok: false, error: `La #${numero} ya está ${ESTADOS[p.estado]}. Con .sigue ${numero} la volvés a activar.` };
  // Bringing one back counts against the cap, like publishing: .baja and then .sigue used to get around it.
  if (!VIGENTES.includes(p.estado) && contarPublicacionesActivas(chat, p.usuario) >= COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA) {
    const quien = suya ? "ya tenés" : `${nombreDe(p.usuario)} ya tiene`;
    return { ok: false, error: `La #${numero} no se puede reactivar: ${quien} ${COMPRAVENTA.MAX_ACTIVAS_POR_PERSONA} publicaciones activas. Cerrá alguna con .vendido N o .baja N.` };
  }
  actualizarPublicacion(chat, numero, { estado: A.estado, actualizada: ahora, aviso: 0 });
  return { ok: true, mensaje: A.texto(p) };
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
export async function chequearPublicaciones(ahora = Date.now(), client = globalThis.client) {
  const lista = publicacionesParaRevisar(ahora - COMPRAVENTA.DIAS_VIGENCIA * DIA_MS, ahora - COMPRAVENTA.DIAS_PARA_CONTESTAR * DIA_MS);
  let tocadas = 0;
  for (const p of lista) {
    // Read again right before it's handled, and claimed in the same step (no await in between): a pass that outlasted
    // the 5 minutes left the next one listing the posts it hadn't reached yet, and both asked the seller. It also
    // skips one renewed or closed while the pass waited for its turn.
    const ahoraMismo = getPublicacion(p.chat, p.numero);
    if (!ahoraMismo || ahoraMismo.estado !== p.estado || ahoraMismo.aviso !== p.aviso || ahoraMismo.actualizada !== p.actualizada) continue;
    // Saved before sending, so two passes can't both send it, and put back if the send fails so the next pass tries
    // again: the "still on?" used to start the countdown even when it never reached the seller, and two days later the
    // post was taken down "for lack of an answer" to a question nobody got.
    const pregunta = p.aviso === 0;
    const antes = pregunta ? { aviso: 0 } : { estado: p.estado, actualizada: p.actualizada };
    try {
      if (pregunta) {
        actualizarPublicacion(p.chat, p.numero, { aviso: ahora });
        // A reserved one is kept with .reservado: .sigue frees it.
        const mantener = p.estado === "reservada" ? `.reservado ${p.numero} para mantenerla reservada, .sigue ${p.numero} si vuelve a estar libre` : `.sigue ${p.numero} para mantenerla`;
        await client.sendMessage(p.chat, { text: `❓ ${mencion(p.usuario)}, ¿sigue en pie tu ${TIPOS[p.tipo].nombre.toLowerCase()} #${p.numero} (${recortar(p.texto, 60)})? Respondé ${mantener}, o .vendido ${p.numero} / .baja ${p.numero}. Si no, en ${COMPRAVENTA.DIAS_PARA_CONTESTAR} días la doy de baja.`, mentions: [p.usuario] });
      } else {
        actualizarPublicacion(p.chat, p.numero, { estado: "vencida", actualizada: ahora });
        await client.sendMessage(p.chat, { text: `⌛ Di de baja la #${p.numero} de ${mencion(p.usuario)} por falta de respuesta. Si sigue en pie, .sigue ${p.numero} la vuelve a activar.`, mentions: [p.usuario] });
      }
      tocadas++;
    } catch (e) {
      console.error("[compraventa] no se pudo avisar:", e.message);
      if (volverAIntentar(`${p.chat}|publicacion|${p.numero}|${p.actualizada}|${pregunta ? "aviso" : "baja"}`)) actualizarPublicacion(p.chat, p.numero, antes);
    }
  }
  return tocadas;
}

// ---------- whoever leaves the group ----------
// Their live posts are taken down and their alerts removed (main.js, group-participants.update): they used to stay
// in the catalogue, and the "¿sigue en pie?" kept mentioning someone who was gone. Back in the group, .sigue N brings a
// post back. Returns how many posts and alerts it touched.
export function limpiarVentasAlSalir(chat, participantes, ahora = Date.now()) {
  let tocadas = 0;
  for (const p of participantes || []) for (const id of idsDeParticipante(p)) tocadas += cerrarPublicacionesDe(chat, id, ahora) + quitarAlertasDe(chat, id);
  return tocadas;
}
