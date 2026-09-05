// Roles del bot por grupo: "admin" (admin del bot) y "mod" (moderador). Valen solo en ese grupo y no tocan a los
// admins de WhatsApp, que tienen todo sin necesidad de rol. Jerarquía: moderador < admin del bot < admin de WhatsApp
// < owner. Los admins de WhatsApp (o el owner) nombran admins del bot; los admins del bot nombran moderadores.
// Qué puede cada uno lo deciden los flags de los plugins: onlyMod (moderación) y onlyAdmin (configuración y grupo).
import { setRolGrupo, quitarRolGrupo, rolGrupo, rolesGrupo, getUser } from "../database-functions.js";

export const ROLES = {
  admin: { nombre: "admin del bot", emoji: "🛡️", poderes: "configurar el bot, manejar la economía y los juegos, moderar y nombrar moderadores", comando: "adminbot" },
  mod: { nombre: "moderador", emoji: "🧹", poderes: "advertir, silenciar, expulsar y mencionar a todo el grupo", comando: "moderador" },
};

const mencion = (id) => `@${id.split("@")[0]}`;

// Permisos efectivos de una persona en un chat. esOwner y esAdminWhatsApp los calcula handle-message.
export function permisosDe(chat, usuario, { esOwner = false, esAdminWhatsApp = false } = {}) {
  const rol = rolGrupo(chat, usuario);
  const isAdmin = esOwner || esAdminWhatsApp || rol === "admin";
  const isMod = isAdmin || rol === "mod";
  return { rol, isAdmin, isMod };
}

// "🛡️ admin del bot", "🧹 moderador" o ""
export function etiquetaRol(chat, usuario) {
  const r = ROLES[rolGrupo(chat, usuario)];
  return r ? `${r.emoji} ${r.nombre}` : "";
}

const puedeConRol = (rol, quien) => (rol === "admin" ? quien.esOwner || quien.esAdminWhatsApp : quien.isAdmin);

// quien: { lid, esOwner, esAdminWhatsApp, isAdmin } · objetivo: { lid, esAdminWhatsApp, esBot, estaEnGrupo }
export function darRol(chat, rol, quien, objetivo) {
  const R = ROLES[rol];
  if (!puedeConRol(rol, quien)) return { ok: false, error: rol === "admin" ? "Solo un admin de WhatsApp (o el owner) puede nombrar admins del bot." : "Solo un admin puede nombrar moderadores." };
  if (!objetivo.lid) return { ok: false, error: `¿A quién? Mencionalo: .${R.comando} @persona, o respondé a un mensaje suyo.` };
  if (objetivo.esBot) return { ok: false, error: "Yo ya me modero sola, gracias." };
  if (objetivo.lid === quien.lid) return { ok: false, error: "A vos mismo no. Ya tenés permisos." };
  if (!objetivo.estaEnGrupo) return { ok: false, error: "Esa persona no está en el grupo." };
  if (objetivo.esAdminWhatsApp) return { ok: false, error: `${mencion(objetivo.lid)} ya es admin de WhatsApp: tiene todo sin necesidad de rol.`, mentions: [objetivo.lid] };
  const actual = rolGrupo(chat, objetivo.lid);
  if (actual === rol) return { ok: false, error: `${mencion(objetivo.lid)} ya es ${R.nombre} acá.`, mentions: [objetivo.lid] };
  if (actual === "admin" && rol === "mod") return { ok: false, error: `${mencion(objetivo.lid)} ya es admin del bot, que incluye lo de moderador. Para bajarlo: .adminbot quitar @persona y después .moderador @persona.`, mentions: [objetivo.lid] };
  setRolGrupo(chat, objetivo.lid, rol, quien.lid);
  const cambio = actual === "mod" ? " Deja de ser moderador porque esto lo incluye." : "";
  return { ok: true, mensaje: `${R.emoji} ${mencion(objetivo.lid)} ahora es *${R.nombre}* en este grupo: puede ${R.poderes}.${cambio} Con .${R.comando} quitar @persona se saca.`, mentions: [objetivo.lid] };
}

export function quitarRol(chat, rol, quien, objetivo) {
  if (!objetivo.lid) return { ok: false, error: "¿A quién? Mencionalo o respondé a un mensaje suyo." };
  const actual = rolGrupo(chat, objetivo.lid);
  if (!actual) return { ok: false, error: `${mencion(objetivo.lid)} no tiene rol del bot en este grupo.`, mentions: [objetivo.lid] };
  if (actual !== rol) return { ok: false, error: `${mencion(objetivo.lid)} es ${ROLES[actual].nombre}, no ${ROLES[rol].nombre}. Usá .${ROLES[actual].comando} quitar @persona.`, mentions: [objetivo.lid] };
  if (!puedeConRol(actual, quien)) return { ok: false, error: actual === "admin" ? "Solo un admin de WhatsApp (o el owner) puede sacar admins del bot." : "Solo un admin puede sacar moderadores." };
  quitarRolGrupo(chat, objetivo.lid);
  return { ok: true, mensaje: `Listo, ${mencion(objetivo.lid)} ya no es ${ROLES[actual].nombre} acá.`, mentions: [objetivo.lid] };
}

export function textoRoles(chat) {
  const filas = rolesGrupo(chat);
  const lista = (rol) => filas.filter((f) => f.rol === rol).map((f) => mencion(f.usuario));
  const admins = lista("admin");
  const mods = lista("mod");
  const texto = [
    `🛡️ *Admins del bot:* ${admins.length ? admins.join(", ") : "nadie"}`,
    `🧹 *Moderadores:* ${mods.length ? mods.join(", ") : "nadie"}`,
    "",
    `Los admins de WhatsApp tienen todo sin necesidad de rol. Un admin del bot puede ${ROLES.admin.poderes}; un moderador puede ${ROLES.mod.poderes}.`,
    `.adminbot @persona y .moderador @persona para dar el rol; con "quitar" antes de la mención se saca.`,
  ].join("\n");
  return { texto, mentions: filas.map((f) => f.usuario) };
}

// Cuando alguien sale del grupo (o lo sacan) pierde el rol. "participantes" viene del evento de Baileys: pueden ser
// ids sueltos u objetos con id, y venir como @lid o como @s.whatsapp.net, así que se prueban los dos.
export function limpiarRolesAlSalir(chat, participantes) {
  let borrados = 0;
  for (const p of participantes || []) {
    const id = typeof p === "string" ? p : p?.id || p?.lid || p?.phoneNumber || "";
    if (!id) continue;
    const candidatos = new Set([id]);
    if (!id.endsWith("@lid")) {
      const u = getUser(id);
      if (u?.lid) candidatos.add(u.lid);
    }
    for (const c of candidatos) if (quitarRolGrupo(chat, c)) borrados++;
  }
  return borrados;
}
