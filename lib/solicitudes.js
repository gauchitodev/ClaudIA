// The pending requests to join a group, for plugins/grupo-aprobar-participantes.js: listing them, and approving them
// one at a time, a few seconds apart, the way an admin taps them in the app. .ap used to approve them all in a single
// request and react ✅ without reading the answer, so one WhatsApp refused looked approved; and the blacklist was
// checked only when a request arrived with the bot as admin (plugins/_detect-events.js), so one from before got in.
// Now each request is looked up on the list and rejected if it's there, each answer is read, and the run ends with a
// summary of what happened to each.
import { estaEnListaNegra } from "./lista-negra.js";
import { pausa } from "./pausas.js";

export const SOLICITUDES = {
  ENTRE_PEDIDOS_MIN_MS: 4000, // between one request and the next: an admin tapping them, not a burst
  ENTRE_PEDIDOS_MAX_MS: 8000,
  AVISO_DESDE: 6, // with this many to go through, the run says it will take a while before starting
};

// So the tests hand over the dice.
export const _dep = { azar: Math.random };

// One run per group at a time: two admins writing .ap together would go through the same people twice.
const enCurso = new Set();
export const aprobacionEnCurso = (chat) => enCurso.has(chat);

const entrePedidos = () => SOLICITUDES.ENTRE_PEDIDOS_MIN_MS + Math.round(_dep.azar() * (SOLICITUDES.ENTRE_PEDIDOS_MAX_MS - SOLICITUDES.ENTRE_PEDIDOS_MIN_MS));

// What WhatsApp lists for a request: its jid (a LID, as a rule) and the number when it sends it. The first is the id
// the request is listed under, the one WhatsApp takes to approve or reject it.
export const idsDeSolicitud = (s) => [s.jid, s.phone_number].filter(Boolean);

// How they asked (request_method, Types/GroupMetadata.d.ts in Baileys), in words.
const METODOS = { invite_link: "por el link", non_admin_add: "lo agregó alguien que no es admin", linked_group_join: "desde la comunidad" };
// Their number when WhatsApp sent it, or when the request itself is listed by it; otherwise the LID, said to be one.
function quienEs(s) {
  const numero = s.phone_number || (String(s.jid || "").endsWith("@s.whatsapp.net") ? s.jid : "");
  return numero ? `+${String(numero).split("@")[0]}` : `LID ${String(s.jid || "").split("@")[0]}`;
}

export const SIN_PENDIENTES = "No hay pedidos pendientes para entrar al grupo.";
export const USO = "Para aprobar solo algunos: .ap 5 (los primeros 5, de a uno). .ap solo los aprueba a todos.";
export const YA_EN_CURSO = "Ya estoy aprobando los pedidos de este grupo: esperá a que termine.";

// .pendientes: who is waiting, with their number when WhatsApp sent it and how they asked.
export function textoPendientes(pendientes) {
  if (!pendientes.length) return SIN_PENDIENTES;
  const lineas = pendientes.map((s, i) => `${i + 1}. ${quienEs(s)}${METODOS[s.request_method] ? ` · ${METODOS[s.request_method]}` : ""}`);
  return `Pedidos pendientes para entrar (${pendientes.length}):\n${lineas.join("\n")}\n\nPara aprobarlos: .ap (todos, de a uno) o .ap 5 (los primeros 5).`;
}

// Before a long run: with six or more to go through, it would otherwise look stuck for a minute.
export function textoAviso(total, maximo = Infinity) {
  const aProcesar = Math.min(total, maximo);
  if (aProcesar < SOLICITUDES.AVISO_DESDE) return "";
  return `⏳ Hay ${total} pedidos: ${maximo < total ? `apruebo los primeros ${maximo}` : "los apruebo"} de a uno, con unos segundos entre cada uno. Te aviso cuando termine.`;
}

// Goes through the pending requests in the order WhatsApp lists them: whoever is on the blacklist is rejected, the
// rest approved, one request each and a pause in between, until "maximo" are approved. Each answer is read: a status
// other than 200 counts as failed, not approved. If WhatsApp stops answering, the run stops there and says so; what
// wasn't reached stays pending. { estado: "listo" | "cortado" | "enCurso", pendientes, aprobados, rechazados,
// fallados: [{ id, codigo }], quedan, error }.
export async function aprobarPendientes(client, chat, pendientes, { maximo = Infinity, participants = [] } = {}) {
  const r = { estado: "listo", pendientes: pendientes.length, aprobados: [], rechazados: [], fallados: [], quedan: 0, error: null };
  if (enCurso.has(chat)) return { ...r, estado: "enCurso" };
  enCurso.add(chat);
  try {
    let hechos = 0;
    for (const solicitud of pendientes) {
      if (r.aprobados.length >= maximo) break;
      const ids = idsDeSolicitud(solicitud);
      if (!ids.length) {
        r.fallados.push({ id: "?", codigo: "sin id" });
        continue;
      }
      try {
        if (hechos > 0) await pausa(entrePedidos());
        const accion = (await estaEnListaNegra(ids, chat, participants)) ? "reject" : "approve";
        const respuesta = await client.groupRequestParticipantsUpdate(chat, [ids[0]], accion);
        hechos++;
        const codigo = String(respuesta?.[0]?.status ?? "sin respuesta");
        if (codigo !== "200") r.fallados.push({ id: ids[0], codigo });
        else (accion === "approve" ? r.aprobados : r.rechazados).push(ids[0]);
      } catch (e) {
        r.estado = "cortado";
        r.error = e?.message || String(e);
        break;
      }
    }
  } finally {
    enCurso.delete(chat);
  }
  r.quedan = r.pendientes - r.aprobados.length - r.rechazados.length - r.fallados.length;
  return r;
}

const pedidos = (n) => (n === 1 ? "1 pedido" : `${n} pedidos`);

// The line that closes a run, with what happened to each.
export function textoResumen(r) {
  if (r.estado === "enCurso") return YA_EN_CURSO;
  const a = r.aprobados.length;
  const z = r.rechazados.length;
  const f = r.fallados.length;
  const partes = [];
  if (z) partes.push(`${z === 1 ? "1 estaba" : `${z} estaban`} en la lista negra y ${z === 1 ? "lo" : "los"} rechacé.`);
  if (f) {
    const codigos = [...new Set(r.fallados.map((x) => x.codigo))].join(", ");
    partes.push(`${f === 1 ? "1 no se pudo" : `${f} no se pudieron`} aprobar: WhatsApp contestó ${codigos} (puede que ya no ${f === 1 ? "estuviera" : "estuvieran"} pendiente${f === 1 ? "" : "s"}).`);
  }
  if (r.estado === "cortado") {
    const cabeza = a ? `⚠️ Aprobé ${pedidos(a)} y WhatsApp dejó de contestar (${r.error}).` : `⚠️ WhatsApp no contestó (${r.error}).`;
    const quedan = r.quedan ? ` ${r.quedan === 1 ? "Queda 1 pendiente" : `Quedan ${r.quedan} pendientes`}: probá .ap de nuevo en un rato.` : "";
    return [cabeza, ...partes].join(" ") + quedan;
  }
  const cabeza = a ? `✅ Aprobé ${a === r.pendientes ? (a === 1 ? "el pedido" : `los ${a} pedidos`) : pedidos(a)}.` : "No aprobé a nadie:";
  if (r.quedan) partes.push(`${r.quedan === 1 ? "Queda 1 pendiente" : `Quedan ${r.quedan} pendientes`}: .ap para seguir.`);
  return [cabeza, ...partes].join(" ");
}
