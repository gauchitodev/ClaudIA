// The Sunday paper of each town (El Eco de <pueblo>, lib/pueblo.js): on Sunday night it goes out with the weekly recap
// (lib/recap.js), as one message: its front page as a picture, and its headlines and the recap as the caption. Where
// the recap is off, it doesn't go out: it's the recap's slot, and there's one Sunday message, not two.
// The headlines come from what the modules registered in the town that week (registrarHecho) and from the timba
// (whoever went broke), the most newsworthy first and one of each kind, written here with the humour of a small town's
// paper; with a quiet week, the paper fills itself as small-town papers do. One of the town's characters is quoted.
// Each edition is kept (pueblo_diarios): .eco shows the last one, and Claudia can quote old headlines in the chat
// (diarioParaPrompt).
// The front page is drawn by code (lib/tapa.js). Where the owner set it in config.toml ([pueblo] ilustraciones =
// true; off by default, with a cap a month), Gemini draws the main headline's picture, which goes in the same box; if
// it fails, or the month's cap is used up, the drawn one goes.
import { randomInt } from "crypto";
import { db, topCoins } from "../database-functions.js";
import { estadoDe, hechosDesde, EVENTOS } from "./pueblo.js";
import { nombreDe } from "./menciones.js";
import { topTimba } from "./timba.js";
import { dibujarTapa } from "./tapa.js";
import { configuracion } from "./configuracion.js";
import { avisosParaElDiario, marcarAvisosPublicados, comoLlega } from "./tienda.js";
import { estatuaDe } from "./pueblo.js";
import { MUNDO } from "./mundo.js";

export const DIARIO = {
  TITULARES_MAX: 5,
  TITULARES_MIN: 3, // with fewer, the paper fills itself
  FUNDIDO_MIN: 200, // what one has to have lost in the timba in the week to make the paper
  RECORDADOS: 3, // editions Claudia is told about
  ILUSTRACIONES_MES: 4, // the default cap of Gemini's pictures a month, for all the groups ([pueblo] ilustraciones_mes)
  MODELO_IMAGEN: "gemini-3.1-flash-image", // the default model ([pueblo] modelo_imagen)
  TIMEOUT_MS: 60000,
};

// The dice and the network, here so the tests can load them.
export const _dep = { azar: (n) => randomInt(0, n), fetch: (...a) => fetch(...a) };
const alAzar = (lista) => lista[_dep.azar(lista.length)];
const DIA_MS = 24 * 60 * 60 * 1000;
const mayuscula = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// ---------- the headlines ----------
// Each kind of fact as a headline: f(datos, quien, p, n) → { titulo, bajada, motivo }. quien(usuario) names someone
// (an @ in the caption, their name on the page), p is the town (estadoDe) and n how many of that kind the week had.
// motivo is what the picture shows (lib/tapa.js). Nothing here takes a player for a man or a woman.
const TITULOS_EVENTO = {
  temporal: (p) => ({ titulo: `Temporal histórico: cortada ${p.lugar.ruta} y una vaca vista en vuelo`, bajada: `${mayuscula(p.npc.almacenera)} jura que la vio pasar por ${p.lugar.plaza}. ${mayuscula(p.npc.comisario)} abrió una investigación y cerró el boliche, por las dudas.` }),
  fiesta: (p) => ({ titulo: `¡Fiesta del pueblo! Jineteada, torta frita y baile hasta que salió el sol`, bajada: `${mayuscula(p.npc.cura)} bendijo las parrillas; ${p.npc.viejo} bailó un chamamé y pidió una ambulancia.` }),
  paro: (p) => ({ titulo: `Paro de transporte: no anduvo ni el carro del lechero`, bajada: `Piquete con olla popular en ${p.lugar.ruta}. Los taxistas, de fiesta.` }),
  multinacional: (p) => ({ titulo: `Llega una multinacional y promete 400 puestos de trabajo`, bajada: `${mayuscula(p.npc.intendente)} se sacó la foto con el casco al revés. ${mayuscula(p.npc.almacenera)} ya sabe cuánto les pagan.` }),
  dolar: (p) => ({ titulo: `Se disparó el dólar: la yerba, por las nubes`, bajada: `${mayuscula(p.npc.usurero)} subió los intereses "por las dudas". En ${p.lugar.cooperativa} remarcan dos veces por día.` }),
  campeonato: (p) => ({ titulo: `Arranca el campeonato regional y ${p.lugar.cancha} juega de local`, bajada: `${mayuscula(p.npc.viejo)} dice que este año sí. Lo dice todos los años.` }),
  robo_banco: (p) => ({ titulo: `¡Robaron el banco a plena siesta!`, bajada: `Se llevaron la caja fuerte en una zorra. ${mayuscula(p.npc.comisario)} tiene una pista; ${p.npc.almacenera}, tres.` }),
  seca: (p) => ({ titulo: `Seca brava: los tajamares son un charco`, bajada: `${mayuscula(p.npc.cura)} sacó al santo a pasear por ${p.lugar.plaza}, a ver si se apiada.` }),
};

export const TITULARES = {
  evento: (d, q, p) => ({ ...(TITULOS_EVENTO[d.clave] || ((x) => ({ titulo: `${EVENTOS[d.clave]?.nombre || "Algo"} en ${x.nombre}`, bajada: "Más detalles en la próxima edición." })))(p), motivo: d.clave }),
  campeonato: (d, q, p) =>
    d.ganado
      ? { titulo: `¡${p.nombre.toUpperCase()} CAMPEÓN!`, bajada: `Caravana por ${p.lugar.plaza}, bocinazos y ${p.npc.cura} tocando las campanas sin permiso.`, motivo: "campeonato_ganado" }
      : { titulo: `Eliminados en primera ronda: el técnico le echa la culpa a la cancha`, bajada: `${mayuscula(p.npc.viejo)} ya anunció que el año que viene sí.`, motivo: "campeonato" },
  intendente: (d, q, p) =>
    d.usuario
      ? { titulo: `${q(d.usuario)} asume la intendencia`, bajada: `Prometió bituminizar hasta el boliche. ${mayuscula(p.npc.almacenera)} le da dos semanas.`, motivo: "intendente" }
      : { titulo: `Vuelve ${p.npc.intendente.replace(/^el intendente /, "")} a la intendencia`, bajada: "Ningún político del pueblo dio la talla. Él tampoco, pero ya tenía el sillón.", motivo: "intendente" },
  impuesto: (d, q) => ({ titulo: `${d.ahora > d.antes ? "Sube" : "Baja"} el impuesto municipal: del ${d.antes} al ${d.ahora} %`, bajada: d.ahora > d.antes ? `Los patrones protestan${d.usuario ? ` frente a la casa de ${q(d.usuario)}` : ""}; la intendencia promete obras.` : "Los patrones aplauden; las calles, no tanto.", motivo: "intendente" }),
  obra: (d) => ({ titulo: `La intendencia ${d.que}`, bajada: `Costó ${d.costo} UruCoins de las arcas. La oposición dice que fue menos; el que la hizo, que fue más.`, motivo: "obra" }),
  empresa_fundada: (d, q) => ({ titulo: `Abre ${d.nombre}: ${q(d.usuario)} ya tiene empresa propia`, bajada: "Escribano, DGI, BPS y un asado para el inspector. Le auguramos éxito, o por lo menos un buen remate.", motivo: "empresa" }),
  empresa_categoria: (d, q) => ({ titulo: `${d.nombre} ya es ${d.categoria}`, bajada: `${q(d.usuario)} no saluda más. Se le vio comprando corbata.`, motivo: "empresa" }),
  robo_empresa: (d, q, p) => ({ titulo: `Asaltan ${d.nombre}: se llevan ${d.monto} UruCoins de la caja`, bajada: `${mayuscula(p.npc.comisario)} dice que está investigando, entre mate y mate. ${q(d.usuario)} ya puso candado nuevo.`, motivo: "robo_empresa" }),
  bien_roto: (d) => ({ titulo: `Se rompió ${d.bien === "Lote de Holando" ? "el lote de vacas" : `el ${d.bien.toLowerCase()}`} de ${d.nombre}`, bajada: "Tenía el service vencido. Nadie se sorprendió.", motivo: "empresa" }),
  coima: (d, q, p, n) => ({ titulo: n > 1 ? `Ola de coimas en el pueblo: ${n} en la semana` : `Coima en un control: ${q(d.usuario)} "lo arregló ahí"`, bajada: `${mayuscula(p.npc.comisario)} estrenó libreta. La seguridad del pueblo, en baja.`, motivo: "robo" }),
  apodo: (d, q) => ({ titulo: `Nuevo apodo en el pueblo: ${q(d.usuario)} ya es «${d.apodo}»`, bajada: "Se lo ganó laburando, que es la peor forma de ganarse un apodo.", motivo: "apodo" }),
  changa_hecha: (d, q, p, n) => ({ titulo: n > 1 ? `${n} changas hechas: el pueblo labura` : `Changa cumplida: «${d.titulo}»`, bajada: `${mayuscula(p.npc.viejo)}: "En mis tiempos se laburaba de sol a sol". Nadie le preguntó.`, motivo: "changa" }),
  changa_vacia: (d, q, p) => ({ titulo: `Nadie fue a la changa «${d.titulo}»`, bajada: `La pala quedó clavada, esperando. ${mayuscula(p.npc.almacenera)} tiene una lista de los que estaban en línea.`, motivo: "changa" }),
  espia_cumplida: (d, q) => ({ titulo: `Golpe de un espía (${d.emoji}): ${q(d.objetivo)} cayó sin darse cuenta`, bajada: `${d.palabra ? `Le hicieron decir «${d.palabra}»` : "Lo hicieron caer en la trampa"}. ${q(d.usuario)} cobró y nadie vio nada.`, motivo: "espia" }),
  espia_descubierto: (d, q) => ({ titulo: `Cae un espía (${d.emoji}): era ${q(d.usuario)}`, bajada: `${q(d.denunciante)} lo denunció y cobró la recompensa. La comisaría ya tiene foto de frente y de perfil.`, motivo: "espia" }),
  cumplio_encargo: (d, q) => ({ titulo: d.premio >= 200 ? `Hazaña: ${q(d.usuario)} cumplió «${d.titulo}» y cobró ${d.premio}` : `${q(d.usuario)} cumplió con «${d.titulo}»`, bajada: "Llegó a tiempo, contra todo pronóstico y contra algún saboteador.", motivo: "encargo" }),
  fallo_encargo: (d, q) => ({ titulo: `${q(d.usuario)} no llegó con «${d.titulo}»`, bajada: "Las apuestas en contra pagaron bien. Se investiga si hubo mano negra.", motivo: "encargo" }),
  saboteador: (d, q, p) => ({ titulo: `Pescan a ${q(d.usuario)} saboteando a ${q(d.de)}`, bajada: `Pagó la multa y quedó en la libreta de ${p.npc.comisario}.`, motivo: "espia" }),
  robo_encargo: (d, q, p) => ({ titulo: `Le arrebatan ${d.monto} UruCoins a ${q(d.usuario)} en ${p.lugar.ruta}`, bajada: `Volvía de cumplir «${d.titulo}». ${mayuscula(p.npc.comisario)} tomó nota, y siguió con el mate.`, motivo: "robo_encargo" }),
  servicio: (d, q) => ({ titulo: d.fallo ? `${q(d.usuario)} arregló ${d.que} y lo dejó peor` : `${q(d.usuario)} salvó las papas: ${d.que}, como nuevo`, bajada: d.fallo ? `${q(d.cliente)} ya le dejó una reseña.` : `Cobró ${d.precio} y ${q(d.cliente)} quedó conforme, que ya es mucho.`, motivo: "servicio" }),
  // what the shop sold (lib/tienda.js)
  estatua: (d, q, p) =>
    d.antes
      ? { titulo: `Derriban la estatua de ${q(d.antes)}: ya está la de ${q(d.usuario)}`, bajada: `${q(d.usuario)} puso ${d.monto} UruCoins, que fueron a las arcas. La anterior terminó en pedazos; ${p.npc.almacenera} se llevó la nariz de recuerdo.`, motivo: "obra" }
      : { titulo: `Inauguran una estatua de ${q(d.usuario)} en ${p.lugar.plaza}`, bajada: `Costó ${d.monto} UruCoins, que fueron a las arcas. Las palomas ya la estrenaron.`, motivo: "obra" },
  bien_comprado: (d, q, p, n) => ({ titulo: n > 1 ? `Fiebre de compras: ${n} vecinos estrenan casa, auto o bicho` : d.que === "mascota" ? `${q(d.usuario)} presenta en sociedad a su ${d.nombre}` : `${q(d.usuario)} estrena ${d.que === "casa" ? (d.nivel === 3 ? "estancia" : d.nombre.toLowerCase()) : d.nombre.toLowerCase()}`, bajada: d.que === "mascota" ? `${mayuscula(p.npc.cura)} ya lo bendijo; ${p.npc.almacenera} le fía el alimento.` : `${mayuscula(p.npc.almacenera)} quiere saber de dónde sacó la plata. ${mayuscula(p.npc.usurero)}, también.`, motivo: "empresa" }),
  robo_auto: (d, q, p) => ({ titulo: `Le roban ${d.auto === "Camioneta" ? "la camioneta" : `el ${d.auto.toLowerCase()}`} a ${q(d.usuario)} en pleno centro`, bajada: `${mayuscula(p.npc.comisario)} tomó nota. El seguro pagó poco, como siempre.`, motivo: "robo" }),
  robo_frustrado: (d, q) => ({ titulo: `Guardaespaldas frustra robo: los chorros se fueron con las orejas coloradas`, bajada: `Querían ${d.auto === "Camioneta" ? "la camioneta" : `el ${String(d.auto || "auto").toLowerCase()}`} de ${q(d.usuario)}. Ahora quieren otro oficio.`, motivo: "robo" }),
  // the Banco Central (lib/banco.js)
  tasa: (d, q, p) => ({ titulo: `${mayuscula(MUNDO.BANCO_CORTO)} ${d.ahora > d.antes ? "sube" : "baja"} la tasa: del ${d.antes} al ${d.ahora} % anual`, bajada: d.ahora > d.antes ? `Los ahorristas sonríen; los endeudados, no. ${mayuscula(p.npc.usurero)} dice que él la subió primero.` : `En ${p.lugar.boliche} ya hay quien habla de pedir un préstamo para la próxima vuelta.`, motivo: "banco" }),
  tasa_presion: (d, q) => ({ titulo: d.puntos < 0 ? `${d.usuario ? q(d.usuario) : "El intendente"} aprieta al banco y la tasa baja al ${d.ahora} %` : `${d.usuario ? q(d.usuario) : "El intendente"} manda enfriar el pueblo: la tasa sube al ${d.ahora} %`, bajada: d.puntos < 0 ? `"El crédito es un derecho", declaró, sin aclarar quién lo paga.` : "Los comerciantes ya juntan firmas. Los ahorristas, aplausos.", motivo: "intendente" }),
  tasa_rebote: (d, q, p) => ({ titulo: `Se asustó la plaza: la tasa rebota ${d.puntos} puntos`, bajada: `La plata barata del intendente duró poco. En la intendencia hablan de "un fenómeno internacional"; ${p.npc.almacenera}, de otra cosa.`, motivo: "banco" }),
  moroso: (d, q, p, n) => ({ titulo: n > 1 ? `Clearing: ${n} vecinos en rojo esta semana` : `${q(d.usuario)} entra al clearing como moroso`, bajada: d.acreedor ? `Le debe ${d.deuda} a ${q(d.acreedor)}, que ya no le contesta los audios.` : `Le debe ${d.deuda} al banco. ${mayuscula(p.npc.usurero)} ya le mandó una tarjeta.`, motivo: "fundido" }),
  remate: (d, q) => ({ titulo: d.comprador ? `Remate: ${q(d.comprador)} se queda con ${d.nombre} de ${q(d.usuario)} por ${d.precio}` : `Nadie quiso ${d.nombre} de ${q(d.usuario)}: se lo llevó el chatarrero`, bajada: d.comprador ? "El banco cobró, el comprador sonríe y el dueño anterior mira para otro lado." : `Pagó ${d.precio}. El martillero dice que nunca vio nada igual.`, motivo: "banco" }),
  prestamo: (d, q) => ({ titulo: `${q(d.usuario)} saca un préstamo de ${d.monto} en el banco`, bajada: "Dice que es para invertir. El gerente dice que todos dicen eso.", motivo: "banco" }),
  fundido: (d, q, p) => ({ titulo: `${q(d.usuario)} se fundió en la timba: perdió ${d.perdido} UruCoins`, bajada: `${mayuscula(p.npc.usurero)} ya le guardó una silla. ${mayuscula(p.npc.cura)} le guardó otra.`, motivo: "fundido" }),
};

// When the week was quiet, the paper fills itself, as they do.
const RELLENOS = [
  (p) => ({ titulo: `Semana tranquila en ${p.nombre}`, bajada: `${mayuscula(p.npc.almacenera)} no tiene nada que contar, lo cual ya es noticia.`, motivo: "" }),
  (p) => ({ titulo: `${mayuscula(p.npc.intendente.replace(/^el intendente /, "el intendente "))} inauguró una placa`, bajada: "Conmemora la inauguración de la placa anterior.", motivo: "intendente" }),
  (p) => ({ titulo: `Pronóstico: ${p.clima.texto}`, bajada: `${mayuscula(p.npc.viejo)} dice que le duele la rodilla, así que cambia.`, motivo: "" }),
  (p) => ({ titulo: `Se perdió un perro en ${p.lugar.plaza}`, bajada: "Responde al nombre de Firulais, o a cualquiera que tenga un chorizo.", motivo: "" }),
  (p) => ({ titulo: `${mayuscula(p.npc.cura)} pide que vuelvan a misa`, bajada: "Promete homilías de menos de una hora. Nadie le cree.", motivo: "" }),
];

// What the characters say, for the quote. Which one speaks follows the main headline.
const CITAS = {
  comisario: ["En este pueblo se respeta la ley, salvo los feriados", "Tengo una pista. Bueno, tengo un mate, que es casi lo mismo", "Al que agarre, lo agarro"],
  cura: ["Recemos por los que perdieron en la timba, y por los que van a perder", "La limosna también se acepta en UruCoins", "Dios aprieta pero no ahorca; el usurero sí"],
  almacenera: ["Yo no digo nada, pero todo el mundo sabe", "A mí me lo contaron, y yo lo cuento", "Fiado no, que después se mudan a otro grupo"],
  intendente: ["Esta intendencia no descansa, salvo de 12 a 16", "Las obras están, lo que falta es verlas", "El impuesto es para el pueblo, que somos todos, empezando por mí"],
  usurero: ["Yo no presto: invierto en la desgracia ajena", "El que se funde siempre vuelve. A mí", "Intereses moderados: los míos"],
  viejo: ["En mis tiempos esto no pasaba, pasaban otras cosas peores", "Este año sí", "La juventud de hoy no sabe ni coimear"],
};
const HABLA_DE = { robo: "comisario", robo_empresa: "comisario", robo_encargo: "comisario", espia: "comisario", fundido: "usurero", intendente: "intendente", obra: "intendente", campeonato: "viejo", campeonato_ganado: "viejo", fiesta: "cura", seca: "cura", temporal: "almacenera", dolar: "usurero", banco: "usurero" };

// Who went broke in the timba that week: the one who lost the most, from FUNDIDO_MIN on, or null.
function fundidoDeLaSemana(chat, desde) {
  const peor = topTimba(chat, { desde, n: 50 }).sort((a, b) => a.neto - b.neto)[0];
  return peor && -peor.neto >= DIARIO.FUNDIDO_MIN ? { tipo: "fundido", usuario: peor.usuario, datos: { usuario: peor.usuario, perdido: -peor.neto }, peso: 4, fecha: Date.now() } : null;
}

// The week's news, the most newsworthy first: one of each kind (the weightiest, the newest on a tie), with how many of
// it there were.
export function noticiasDeLaSemana(chat, desde, hasta = Date.now() + 1) {
  const porTipo = new Map();
  for (const h of hechosDesde(chat, desde, hasta)) {
    if (!TITULARES[h.tipo]) continue;
    const ya = porTipo.get(h.tipo);
    if (!ya) porTipo.set(h.tipo, { ...h, n: 1 });
    else {
      ya.n++;
      if (h.peso > ya.peso) porTipo.set(h.tipo, { ...h, n: ya.n });
    }
  }
  const fundido = fundidoDeLaSemana(chat, desde);
  if (fundido) porTipo.set("fundido", { ...fundido, n: 1 });
  return [...porTipo.values()].sort((a, b) => b.peso - a.peso || b.fecha - a.fecha);
}

const nombreLimpio = (u) => nombreDe(u) || `+${String(u).split("@")[0]}`;
const conArroba = (u) => `@${String(u).split("@")[0]}`;

// ---------- the edition ----------
// The paper of the week that ends at "ahora", for a town: its headlines (each twice, for the page with names and for
// the caption with @), the quote, the weather and the numbers. null with the town off.
export function armarDiario(chat, ahora = Date.now(), { desde = ahora - 7 * DIA_MS } = {}) {
  const p = estadoDe(chat, ahora);
  if (!p) return null;
  const noticias = noticiasDeLaSemana(chat, desde, ahora + 1).slice(0, DIARIO.TITULARES_MAX);
  const mentions = new Set();
  const titulares = noticias.map((h) => {
    const f = TITULARES[h.tipo];
    const pagina = f(h.datos, nombreLimpio, p, h.n);
    const caption = f(
      h.datos,
      (u) => {
        mentions.add(u);
        return conArroba(u);
      },
      p,
      h.n,
    );
    return { ...pagina, tipo: h.tipo, caption: { titulo: caption.titulo, bajada: caption.bajada } };
  });
  // Someone with a car or a pet arrives in it, in one headline a week (lib/tienda.js): the first that has them.
  const conBienes = titulares.findIndex((t, i) => noticias[i]?.datos?.usuario && comoLlega(chat, noticias[i].datos.usuario));
  if (conBienes >= 0) {
    const u = noticias[conBienes].datos.usuario;
    const llega = ` (${nombreLimpio(u)} llegó ${comoLlega(chat, u)}.)`;
    titulares[conBienes].bajada += llega;
    titulares[conBienes].caption.bajada += llega;
  }
  const rellenos = [...RELLENOS];
  while (titulares.length < DIARIO.TITULARES_MIN && rellenos.length) {
    const r = rellenos.splice(_dep.azar(rellenos.length), 1)[0](p);
    titulares.push({ ...r, tipo: "relleno", caption: { titulo: r.titulo, bajada: r.bajada } });
  }
  const habla = HABLA_DE[titulares[0].motivo] || alAzar(Object.keys(CITAS));
  const edicion = db.prepare(`SELECT COUNT(*) AS n FROM pueblo_diarios WHERE chat = ?`).get(chat).n + 1;
  const fecha = new Date(ahora).toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(",", "");
  const clima = p.clima.texto === "temporal" ? "temporal" : p.clima.texto.startsWith("seca") ? "seca" : p.clima.lluvia ? "lluvia" : ["☀️", "🌤️", "🌸"].includes(p.clima.emoji) ? "sol" : "nublado";
  const ricos = topCoins(chat, 1);
  // The paid notices waiting for this edition, and the statue standing in the plaza (lib/tienda.js).
  const avisos = avisosParaElDiario(chat).map((a) => {
    mentions.add(a.usuario);
    return { ...a, de: nombreLimpio(a.usuario), arroba: conArroba(a.usuario) };
  });
  const estatua = estatuaDe(chat);
  return {
    chat,
    nombre: `El Eco de ${p.nombre}`,
    pueblo: p.nombre,
    numero: edicion,
    anio: Math.floor((ahora - p.fundado) / (365 * DIA_MS)) + 1,
    fechaTexto: fecha,
    lema: `Decano de la prensa de ${p.nombre} desde ${p.anio}`,
    titulares,
    clima: { texto: `${p.estacion}, ${p.clima.texto}`, tipo: clima },
    numeros: { prosperidad: p.prosperidad, seguridad: p.seguridad, humor: p.humor, impuesto: p.impuesto },
    cita: { quien: p.npc[habla], texto: alAzar(CITAS[habla]) },
    pie: `Impreso en la imprenta de ${p.nombre}${ricos.length ? ` · Patrocina: el bolsillo de ${nombreLimpio(ricos[0].usuario)}` : ""}${estatua ? ` · En la plaza, la estatua de ${nombreLimpio(estatua.usuario)}` : ""}`,
    avisos,
    estatua: estatua ? { usuario: estatua.usuario, monto: estatua.monto } : null,
    mentions: [...mentions],
  };
}

// The caption: the paper's headlines in text, with the @ of whoever is in them.
export function textoDelDiario(diario) {
  const lineas = [`📰 *${diario.nombre.toUpperCase()}* · N.º ${diario.numero} · ${diario.fechaTexto}`, ""];
  diario.titulares.forEach((t, i) => {
    lineas.push(`${i === 0 ? "🗞️" : "▪️"} *${t.caption.titulo}*`);
    lineas.push(`_${t.caption.bajada}_`);
  });
  if (diario.avisos?.length) {
    lineas.push("", "📢 *AVISOS PAGOS* _(El Eco no se hace responsable, pero cobra)_");
    for (const a of diario.avisos) lineas.push(a.tipo === "chisme" ? `🗣️ _Chisme:_ «${a.texto}» — lo pagó ${a.arroba}` : `▪️ _Clasificado:_ ${a.texto} — ${a.arroba}`);
  }
  lineas.push("", `💬 «${diario.cita.texto}» — ${diario.cita.quien}`);
  return lineas.join("\n");
}

// ---------- Gemini's picture ----------
const claveMes = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const ilustracionesDelMes = (ahora = Date.now()) => db.prepare(`SELECT usadas FROM pueblo_ilustraciones WHERE mes = ?`).get(claveMes(ahora))?.usadas || 0;
// [pueblo] in config.toml (lib/configuracion.js): on only with ilustraciones = true, and the cap and the model only
// when they're what they should be.
const opcionesIlustracion = () => {
  const c = configuracion.pueblo || {};
  return {
    prendida: c.ilustraciones === true,
    tope: Number.isInteger(c.ilustraciones_mes) && c.ilustraciones_mes >= 0 ? c.ilustraciones_mes : DIARIO.ILUSTRACIONES_MES,
    modelo: typeof c.modelo_imagen === "string" && c.modelo_imagen.trim() ? c.modelo_imagen.trim() : DIARIO.MODELO_IMAGEN,
  };
};

// The main headline's picture from Gemini, where the owner set it on, within the month's cap: a Buffer, or null
// (off, no key, no quota, or it failed: then the drawn one goes). A picture that comes counts towards the cap.
export async function ilustrar(titular, pueblo, ahora = Date.now()) {
  const { prendida, tope, modelo } = opcionesIlustracion();
  if (!prendida || !configuracion.geminiApiKey || ilustracionesDelMes(ahora) >= tope) return null;
  const prompt = `Ilustración para la tapa de un diario de pueblo del interior de Uruguay, estilo grabado antiguo en blanco y negro, con humor costumbrista, formato apaisado. Sin ningún texto ni letras en la imagen. Escena: "${titular.titulo}". ${titular.bajada} El pueblo se llama ${pueblo}: casas bajas, una iglesia, campo alrededor.`;
  const controller = new AbortController();
  const corte = setTimeout(() => controller.abort(), DIARIO.TIMEOUT_MS);
  try {
    const res = await _dep.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${configuracion.geminiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "16:9" } } }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[eco] ${modelo} respondió ${res.status} a la ilustración: sale la tapa dibujada`);
      return null;
    }
    const json = await res.json();
    const parte = (json?.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData?.data || x.inline_data?.data);
    const datos = parte?.inlineData?.data || parte?.inline_data?.data;
    if (!datos) return null;
    db.prepare(`INSERT INTO pueblo_ilustraciones (mes, usadas) VALUES (?, 1) ON CONFLICT(mes) DO UPDATE SET usadas = usadas + 1`).run(claveMes(ahora));
    return Buffer.from(datos, "base64");
  } catch (e) {
    console.error("[eco] no se pudo ilustrar la tapa:", e?.message || e);
    return null;
  } finally {
    clearTimeout(corte);
  }
}

// ---------- publishing ----------
// The week's edition, drawn and kept: { imagen, texto, mentions, ilustrada, diario }, or null with the town off. A
// week's edition is kept once (the first time it's made); made again (a send that failed), it's the same number.
export async function publicarDiario(chat, ahora = Date.now(), { semana = "", conIlustracion = true } = {}) {
  const ya = semana ? db.prepare(`SELECT numero FROM pueblo_diarios WHERE chat = ? AND semana = ?`).get(chat, semana) : null;
  const diario = armarDiario(chat, ahora);
  if (!diario) return null;
  if (ya) diario.numero = ya.numero;
  const dibujo = conIlustracion ? await ilustrar(diario.titulares[0], diario.pueblo, ahora) : null;
  const imagen = await dibujarTapa(diario, { ilustracion: dibujo });
  if (semana && !ya) {
    // The notices it printed won't be printed again.
    marcarAvisosPublicados(diario.avisos.map((a) => a.id), diario.numero);
    db.prepare(`INSERT OR IGNORE INTO pueblo_diarios (chat, semana, numero, titulares, fecha, ilustrada) VALUES (?, ?, ?, ?, ?, ?)`).run(
      chat,
      semana,
      diario.numero,
      JSON.stringify(diario.titulares.map((t) => ({ titulo: t.titulo, bajada: t.bajada }))),
      ahora,
      dibujo ? 1 : 0,
    );
  }
  return { imagen, texto: textoDelDiario(diario), mentions: diario.mentions, ilustrada: Boolean(dibujo), diario };
}

// The editions kept for a town, the newest first, each with its headlines.
export function edicionesDe(chat, n = DIARIO.RECORDADOS) {
  const leer = (texto) => {
    try {
      return JSON.parse(texto);
    } catch {
      return [];
    }
  };
  return db.prepare(`SELECT * FROM pueblo_diarios WHERE chat = ? ORDER BY fecha DESC LIMIT ?`).all(chat, n).map((e) => ({ ...e, titulares: leer(e.titulares) }));
}

// For Claudia's prompt (plugins/_auto-ia.js): the last editions' headlines, so she can quote them. "" with none.
export function diarioParaPrompt(chat) {
  const ediciones = edicionesDe(chat);
  const nombre = estadoDe(chat)?.nombre;
  if (!ediciones.length || !nombre) return "";
  const fecha = (ms) => new Date(ms).toLocaleDateString("es-UY", { day: "numeric", month: "numeric" });
  const lineas = ediciones.map((e) => `el ${fecha(e.fecha)}: ${e.titulares.map((t) => `«${t.titulo}»`).join(", ")}`);
  return `El diario del pueblo, El Eco de ${nombre}, sale los domingos. Sus últimos titulares (${lineas.join("; ")}). Si viene al caso podés citarlos o acordarte de lo que pasó, como quien leyó el diario; no inventes titulares que no estén acá.`;
}
