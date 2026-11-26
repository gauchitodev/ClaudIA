// The welcome to the world, and the news of a big update. When a group becomes a town (.pueblo on, the first time),
// Claudia introduces the world in three short messages, as one who types them: the town that's born, how it's played,
// and the first steps. Once per group, ever (pueblos.bienvenida). The towns that were already born when a big update
// came get its news instead, once (novedades_vistas): from the scheduled tasks, in the daytime and only to a group
// that is talking, as the town's events go out. A town that got the welcome already knows what it says, so every
// news there was by then counts as told.
// The world's name, and the bank's, are in lib/mundo.js; the messages go out at the pace of lib/ritmo.js (each send
// waits its turn in lib/envios.js, and here each waits what typing it takes).
import { db, getChat, chatsConOpcion, mensajesPorHora } from "../database-functions.js";
import { puebloActivo, estadoDe, PUEBLO } from "./pueblo.js";
import { textoPlazos, tasaDe } from "./banco.js";
import { claveDia } from "./actividad.js";
import { demoraTipeo } from "./ritmo.js";
import { pausa } from "./pausas.js";
import { MUNDO } from "./mundo.js";

export const NOVEDADES = {
  DESDE_HORA: 10, // the news goes out from 10:00 to 20:59...
  HASTA_HORA: 21,
  VIVO_MENSAJES: PUEBLO.VIVO_MENSAJES, // ...to a group with this many messages in this hour and the one before
};

// The big updates, the oldest first. Each says what's new in one or two messages, for a town (p, as estadoDe gives
// it). A new one goes at the end, with a key of its own: each town that hadn't heard it gets it once.
export const ACTUALIZACIONES = [
  {
    clave: "banco-central",
    mensajes: (p) => [
      [
        `🆕 *Novedades en ${p.nombre}*: abrió sucursal el *${MUNDO.BANCO}* 🏦`,
        `💰 Plazo fijo: .plazofijo 500 90 (hoy paga, por año: ${textoPlazos(p.chat)}). Si lo rompés antes, perdés los intereses.`,
        `💳 Préstamos: .prestamo te dice cuánto te presto, según tu nivel, lo que tenés y cómo pagaste. Cuotas semanales que se descuentan solas; el que no paga se come un recargo, entra al clearing y le rematan un bien acá mismo.`,
        `🤝 Entre vecinos: .prestar @persona 200 10 14, con contrato que guardo yo y cobro yo.`,
        `📈 La tasa (hoy ${tasaDe(p.chat)} % anual) se mueve sola con la plata del pueblo, y ${p.intendente.persona ? "el intendente" : `${p.npc.intendente}`} la puede apretar. Todo en .banco`,
      ].join("\n"),
    ],
  },
];

// ---------- the welcome ----------
// The three messages of the welcome, for a town as it was just born.
export function mensajesBienvenida(chat) {
  const p = estadoDe(chat);
  if (!p) return [];
  const c = getChat(chat) || {};
  const apagados = ["encargos", "espias", "changas"].filter((k) => c[k] !== 1);
  const npcs = p.npc;
  return [
    [
      `🌎 *¡Bienvenidos a ${MUNDO.NOMBRE}!* Acaba de nacer *${p.nombre}*, fundado allá por ${p.anio}, según ${npcs.viejo}, que dice que estuvo.`,
      `Este grupo ahora es un pueblo: tiene ${p.lugar.plaza}, ${p.lugar.ruta} que lo cruza, ${p.lugar.boliche} y ${p.lugar.cancha}. Lo manejan ${npcs.intendente} y ${npcs.comisario}, y ${npcs.almacenera} se entera de todo antes que nadie. Lo que hagan acá mueve la prosperidad, la seguridad y el humor del pueblo, y el pueblo se acuerda.`,
    ].join("\n\n"),
    [
      "🧭 *Cómo se juega*",
      "💼 Agarrás un oficio y cobrás una vez por día: con los días subís de nivel y cobrás más. A nivel 10 de camionero, tambero o DJ fundás tu empresa.",
      `🏦 El *${MUNDO.BANCO}* paga plazo fijo (hoy hasta ${tasaDe(chat)} % anual) y presta según tu nivel y cómo pagás. La tasa se mueve sola, y el intendente la aprieta.`,
      `🚨 Encargos urgentes, 🕵️ misiones secretas y 🧰 changas${apagados.length ? ` (un admin los prende: ${apagados.map((k) => `.${k} on`).join(" · ")})` : ""}.`,
      `📰 Y los domingos sale *El Eco de ${p.nombre}*: si te mandás una macana, sale en el diario.`,
    ].join("\n"),
    [
      "👣 *Primeros pasos*: .laburo <oficio> para empezar a cobrar (.laburos muestra cuáles hay), .pueblo para ver cómo anda el pueblo, .banco para la tasa y tus ahorros, y .menu juegos para todo lo demás.",
      `Pórtense bien, que ${npcs.comisario} anota. ¡Bienvenidos a ${p.nombre}! 🧉`,
    ].join("\n\n"),
  ];
}

// Each message, after what typing it would take (lib/ritmo.js); the client's own queue spaces them too.
async function mandarComoQuienTipea(client, chat, textos) {
  for (const texto of textos) {
    await client.sendPresenceUpdate?.("composing", chat)?.catch?.(() => {});
    await pausa(demoraTipeo(texto));
    await client.sendMessage(chat, { text: texto });
  }
}

const marcarVistas = (chat, claves, ahora) => {
  const marcar = db.prepare(`INSERT OR IGNORE INTO novedades_vistas (chat, clave, fecha) VALUES (?, ?, ?)`);
  for (const clave of claves) marcar.run(chat, clave, ahora);
};

// .pueblo on: the welcome, once per group, to a town that was never welcomed nor told any news (one that was on
// before the welcome existed gets the news instead). Every news there is counts as told. Returns whether it went.
export async function darBienvenida(client, chat, ahora = Date.now()) {
  const fila = db.prepare(`SELECT bienvenida FROM pueblos WHERE chat = ?`).get(chat);
  if (!fila || fila.bienvenida || !puebloActivo(chat)) return false;
  if (db.prepare(`SELECT 1 FROM novedades_vistas WHERE chat = ?`).get(chat)) return false;
  // Marked before it goes: two .pueblo on at once don't welcome twice.
  db.prepare(`UPDATE pueblos SET bienvenida = ? WHERE chat = ?`).run(ahora, chat);
  marcarVistas(
    chat,
    ACTUALIZACIONES.map((a) => a.clave),
    ahora,
  );
  await mandarComoQuienTipea(client, chat, mensajesBienvenida(chat));
  return true;
}

// ---------- the news ----------
// The news a town hasn't been told yet, the oldest first.
export function novedadesPendientes(chat) {
  const vistas = new Set(db.prepare(`SELECT clave FROM novedades_vistas WHERE chat = ?`).all(chat).map((r) => r.clave));
  return ACTUALIZACIONES.filter((a) => !vistas.has(a.clave));
}

function grupoVivo(chat, ahora) {
  const h = ahora.getHours();
  const porHora = new Map(mensajesPorHora(chat, [claveDia(ahora)]).map((r) => [r.hora, r.total]));
  return (porHora.get(h) || 0) + (porHora.get(h - 1) || 0) >= NOVEDADES.VIVO_MENSAJES;
}

// Every 5 minutes from tareas-programadas.js: to each town that's alive, in the daytime and talking, the oldest news it
// hasn't heard, one a pass. A town not welcomed yet (born before the welcome existed) gets the news, not the welcome.
// Returns how many went.
export async function chequearNovedades(client, ahora = new Date()) {
  if (!client) return 0;
  const h = ahora.getHours();
  if (h < NOVEDADES.DESDE_HORA || h >= NOVEDADES.HASTA_HORA) return 0;
  let enviadas = 0;
  for (const chat of chatsConOpcion("pueblo")) {
    if (!puebloActivo(chat) || getChat(chat)?.grupoCerradoPorHorario) continue;
    const [nueva] = novedadesPendientes(chat);
    if (!nueva || !grupoVivo(chat, ahora)) continue;
    const mensajes = nueva.mensajes(estadoDe(chat, ahora.getTime()));
    // Marked once the first one went: a send that fails leaves it for the next pass, and one that went isn't repeated.
    await mandarComoQuienTipea(client, chat, mensajes.slice(0, 1));
    marcarVistas(chat, [nueva.clave], ahora.getTime());
    await mandarComoQuienTipea(client, chat, mensajes.slice(1));
    enviadas++;
  }
  return enviadas;
}
