// Pendientes: lo que Claudia se compromete a hacer más tarde. Por ahora, un solo tipo:
// volver a intentar una descarga que falló. Con correa corta: solo descargas que la persona ya
// pidió con el comando, un reintento por pedido, y un tope diario por grupo.
import { encolarDescarga } from "./cola-descargas.js";
import { ejecutarRecordatorio } from "./recordatorios.js";
import { crearPendiente, hayPendiente, contarPendientesHoy, tomarPendientesVencidos, cerrarPendiente, recuperarPendientesColgados } from "../database-functions.js";

export const REINTENTO = {
  ESPERA_MIN: 30, // minutos hasta el reintento
  VENTANA_FALLO_MS: 2 * 60 * 60 * 1000, // solo se puede reintentar un fallo de las últimas 2 horas
  TOPE_DIA_POR_GRUPO: 10,
};

// Último fallo de descarga por persona y chat (en RAM): es lo único que se puede reintentar.
if (!globalThis.fallosDescarga) globalThis.fallosDescarga = new Map();
const claveFallo = (chat, usuario) => `${chat}|${usuario}`;

export function registrarFalloDescarga(chat, usuario, texto, tipo) {
  globalThis.fallosDescarga.set(claveFallo(chat, usuario), { texto, tipo, fecha: Date.now() });
}

function horaLegible(ms) {
  return new Date(ms).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Agenda el reintento del último fallo de esa persona. Devuelve { ok, mensaje } o { ok: false, error }.
export function programarReintento(chat, usuario) {
  const fallo = globalThis.fallosDescarga.get(claveFallo(chat, usuario));
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
  globalThis.fallosDescarga.delete(claveFallo(chat, usuario));
  return { ok: true, mensaje: `🔁 Anotado. A las ${horaLegible(ejecutarEn)} vuelvo a intentar con *${fallo.texto}* y te aviso acá.` };
}

// ---------- Ejecución (la llama main.js cada un minuto) ----------

let procesando = false;

export async function procesarPendientes(client) {
  // Si el bot está desconectado, el envío fallaría y el pendiente se marcaría "error": mejor esperar a la próxima vuelta.
  if (procesando || !client?.user || !globalThis.botConectado) return;
  procesando = true;
  try {
    const vencidos = tomarPendientesVencidos();
    for (const p of vencidos) {
      try {
        if (p.tipo === "reintento_descarga") await ejecutarReintentoDescarga(client, p);
        else if (p.tipo === "cerrar_mercado" || p.tipo === "anular_mercado") await ejecutarPendienteMercado(client, p);
        else if (p.tipo === "recordatorio") await ejecutarRecordatorio(client, p);
        else if (p.tipo === "trivia_relampago") await (await import("./trivia-relampago.js")).lanzarTriviaRelampago(client, p.chat);
        cerrarPendiente(p.id, "hecho");
      } catch (e) {
        console.error(`[pendientes] error ejecutando #${p.id} (${p.tipo}):`, e);
        cerrarPendiente(p.id, "error");
      }
    }
  } finally {
    procesando = false;
  }
}

async function ejecutarReintentoDescarga(client, p) {
  // import tardío para no crear un ciclo (dl-youtube importa esta librería)
  const { descargarMultimedia } = await import("../plugins/dl-youtube.js");
  const numero = p.usuario.split("@")[0];
  await client.sendMessage(p.chat, { text: `🔁 @${numero}, como te prometí, vuelvo a intentar con *${p.datos.texto}*.`, mentions: [p.usuario] });
  // pasa por la misma cola que las descargas normales, para no pisarse con una en curso
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

// Mercados de apuestas: a la hora de cierre se cierran las apuestas; una semana después, si nadie cargó el resultado,
// se anula y se devuelve todo. import tardío para no crear un ciclo con lib/mercados.js.
async function ejecutarPendienteMercado(client, p) {
  const { cerrarMercadoPorTiempo, anularMercadoVencido } = await import("./mercados.js");
  const r = p.tipo === "cerrar_mercado" ? cerrarMercadoPorTiempo(p.datos.id) : anularMercadoVencido(p.datos.id);
  if (r) await client.sendMessage(p.chat, { text: r.texto, mentions: r.mentions || [] });
}

// Lee globalThis.client en cada vuelta porque el socket se vuelve a crear al reconectar.
export function iniciarPendientes() {
  const recuperados = recuperarPendientesColgados();
  if (recuperados > 0) console.log(`[pendientes] ${recuperados} pendiente(s) recuperado(s) tras el reinicio`);
  setInterval(() => procesarPendientes(globalThis.client).catch((e) => console.error("[pendientes]", e)), 60 * 1000);
}
