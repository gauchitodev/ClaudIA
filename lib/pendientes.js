// Pending work: what Claudia commits to doing later. For now, a single kind: retrying a download that failed.
// On a short leash: only downloads the person already asked for with the command, one retry per request, and a
// daily cap per group.
import { encolarDescarga } from "./cola-descargas.js";
import { ejecutarRecordatorio } from "./recordatorios.js";
import { crearPendiente, hayPendiente, contarPendientesHoy, tomarPendientesVencidos, cerrarPendiente, reprogramarPendiente, recuperarPendientesColgados } from "../database-functions.js";

export const REINTENTO = {
  ESPERA_MIN: 30, // minutes until the retry
  VENTANA_FALLO_MS: 2 * 60 * 60 * 1000, // only a failure from the last 2 hours can be retried
  TOPE_DIA_POR_GRUPO: 10,
};

// A pending item that fails is tried again a few times, waiting twice as long each time, before it's given up on
// ("error"). It used to be given up on at the first failure: a reminder the person had been promised was lost for good
// to a single send that failed (the connection dropping in the middle of the pass, say).
export const PENDIENTES = {
  INTENTOS_MAX: 6,
  ESPERA_TRAS_FALLO_MS: 60 * 1000, // after the first failure: 1, 2, 4, 8 and 16 minutes, about half an hour in all
};

// The last download failure per person and chat (in RAM): it's the only thing that can be retried.
const fallosDescarga = new Map();
const claveFallo = (chat, usuario) => `${chat}|${usuario}`;

export function registrarFalloDescarga(chat, usuario, texto, tipo) {
  fallosDescarga.set(claveFallo(chat, usuario), { texto, tipo, fecha: Date.now() });
}

function horaLegible(ms) {
  return new Date(ms).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Schedules the retry of that person's last failure. Returns { ok, mensaje } or { ok: false, error }.
export function programarReintento(chat, usuario) {
  const fallo = fallosDescarga.get(claveFallo(chat, usuario));
  if (!fallo || Date.now() - fallo.fecha > REINTENTO.VENTANA_FALLO_MS) {
    return { ok: false, error: "No tengo ninguna descarga tuya que haya fallado hace poco. Pedila con .play o .video, y si falla, ahí sí mandá .reintentar" };
  }
  if (hayPendiente(chat, usuario, "reintento_descarga")) {
    return { ok: false, error: "Ya tenés un reintento agendado, esperá a que salga ese." };
  }
  if (contarPendientesHoy(chat, "reintento_descarga") >= REINTENTO.TOPE_DIA_POR_GRUPO) {
    return { ok: false, error: "Por hoy ya agendé todos los reintentos que puedo en este grupo. Mañana de nuevo." };
  }

  const ejecutarEn = Date.now() + REINTENTO.ESPERA_MIN * 60 * 1000;
  crearPendiente(chat, usuario, "reintento_descarga", { texto: fallo.texto, tipo: fallo.tipo }, ejecutarEn);
  fallosDescarga.delete(claveFallo(chat, usuario));
  return { ok: true, mensaje: `🔁 Anotado. A las ${horaLegible(ejecutarEn)} vuelvo a intentar con *${fallo.texto}* y te aviso acá.` };
}

// ---------- Execution (main.js calls it every minute) ----------

let procesando = false;

export async function procesarPendientes(client) {
  // If the bot is disconnected the send would fail and use up an attempt: better to wait for the next pass.
  if (procesando || !client?.user || !globalThis.botConectado) return;
  procesando = true;
  try {
    const vencidos = tomarPendientesVencidos();
    for (const [i, p] of vencidos.entries()) {
      // The connection checked above may drop halfway through the pass: what's left goes back to waiting without
      // counting as an attempt, instead of going out over a dead socket.
      if (!globalThis.botConectado) {
        for (const resto of vencidos.slice(i)) reprogramarPendiente(resto.id, resto.ejecutar_en, { contarIntento: false });
        break;
      }
      try {
        if (p.tipo === "reintento_descarga") await ejecutarReintentoDescarga(client, p);
        else if (p.tipo === "cerrar_mercado" || p.tipo === "anular_mercado") await ejecutarPendienteMercado(client, p);
        else if (p.tipo === "recordatorio") await ejecutarRecordatorio(client, p);
        else if (p.tipo === "trivia_relampago") await (await import("./trivia-relampago.js")).lanzarTriviaRelampago(client, p.chat);
        cerrarPendiente(p.id, "hecho");
      } catch (e) {
        const intentos = (p.intentos || 0) + 1;
        if (intentos >= PENDIENTES.INTENTOS_MAX) {
          console.error(`[pendientes] #${p.id} (${p.tipo}) falló ${intentos} veces, lo dejo:`, e);
          cerrarPendiente(p.id, "error");
          continue;
        }
        const espera = PENDIENTES.ESPERA_TRAS_FALLO_MS * 2 ** (intentos - 1);
        console.error(`[pendientes] #${p.id} (${p.tipo}) falló, lo reintento en ${Math.round(espera / 60000)} min:`, e?.message || e);
        reprogramarPendiente(p.id, Date.now() + espera);
      }
    }
  } finally {
    procesando = false;
  }
}

async function ejecutarReintentoDescarga(client, p) {
  // late import to avoid a cycle (dl-youtube imports this library)
  const { descargarMultimedia } = await import("../plugins/dl-youtube.js");
  const numero = p.usuario.split("@")[0];
  await client.sendMessage(p.chat, { text: `🔁 @${numero}, como te prometí, vuelvo a intentar con *${p.datos.texto}*.`, mentions: [p.usuario] });
  // it goes through the same queue as normal downloads, so it doesn't collide with one in progress
  encolarDescarga(() =>
    descargarMultimedia({
      client,
      chat: p.chat,
      usuario: p.usuario,
      texto: p.datos.texto,
      tipo: p.datos.tipo,
      quoted: null,
      isOwner: false,
      esReintento: true,
    }),
  );
}

// Betting markets: at closing time the bets are closed; a week later, if nobody entered the outcome, it's voided
// and everything refunded. Late import to avoid a cycle with lib/mercados.js.
async function ejecutarPendienteMercado(client, p) {
  const { cerrarMercadoPorTiempo, anularMercadoVencido } = await import("./mercados.js");
  const r = p.tipo === "cerrar_mercado" ? cerrarMercadoPorTiempo(p.datos.id) : anularMercadoVencido(p.datos.id);
  if (r) await client.sendMessage(p.chat, { text: r.texto, mentions: r.mentions || [] });
}

// Reads globalThis.client on each pass because the socket is recreated on reconnect.
export function iniciarPendientes() {
  const recuperados = recuperarPendientesColgados();
  if (recuperados > 0) console.log(`[pendientes] ${recuperados} pendiente(s) recuperado(s) tras el reinicio`);
  setInterval(() => procesarPendientes(globalThis.client).catch((e) => console.error("[pendientes]", e)), 60 * 1000);
}
