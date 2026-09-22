// Per-group bot roles: "admin" (bot admin) and "mod" (moderator). They apply only in that group and don't affect
// WhatsApp admins, who have everything without needing a role. Hierarchy: moderator < bot admin < WhatsApp admin
// < owner. WhatsApp admins (or the owner) appoint bot admins; bot admins appoint moderators.
// What each one can do is decided by the plugin flags: onlyMod (moderation) and onlyAdmin (settings and group).
import { setRolGrupo, quitarRolGrupo, rolGrupo, rolesGrupo, getUser, esOwner } from "../database-functions.js";

export const ROLES = {
  admin: { nombre: "admin del bot", emoji: "🛡️", poderes: "configurar el bot, manejar la economía y los juegos, moderar y nombrar moderadores", comando: "adminbot" },
  mod: { nombre: "moderador", emoji: "🧹", poderes: "advertir, silenciar, expulsar y mencionar a todo el grupo", comando: "moderador" },
};

const mencion = (id) => `@${id.split("@")[0]}`;

// A person's effective permissions in a chat. esOwner and esAdminWhatsApp are worked out by handle-message.
export function permisosDe(chat, usuario, { esOwner = false, esAdminWhatsApp = false } = {}) {
  const rol = rolGrupo(chat, usuario);
  const isAdmin = esOwner || esAdminWhatsApp || rol === "admin";
  const isMod = isAdmin || rol === "mod";
  return { rol, isAdmin, isMod };
}

// Rank inside a group, for anything one member does to another: 4 bot owner, 3 WhatsApp admin, 2 bot admin,
// 1 moderator, 0 everyone else. "persona" is { lid, jid, esOwner, esAdminWhatsApp }; when esOwner isn't given it's
// looked up, which is what the target of a command needs (for whoever runs it, handle-message already knows).
export function rango(chat, persona = {}) {
  const dueno = persona.esOwner ?? [persona.lid, persona.jid].some((id) => id && esOwner(id));
  if (dueno) return 4;
  if (persona.esAdminWhatsApp) return 3;
  const rol = persona.lid ? rolGrupo(chat, persona.lid) : null;
  return rol === "admin" ? 2 : rol === "mod" ? 1 : 0;
}

// Why "quien" can't moderate "objetivo" (remove, warn, mute, blacklist, the ban roulette), or null when they can.
// Only from strictly above, which is what the hierarchy at the top of this file says: a moderator can't touch another
// moderator or a bot admin, a bot admin can't touch a WhatsApp admin, and a WhatsApp admin can't touch another one
// without taking their admin away first (the rule .ln already had). Before this, any moderator could remove an admin.
export function impedimentoParaModerar(chat, quien, objetivo) {
  const arriba = rango(chat, quien);
  const suyo = rango(chat, objetivo);
  if (suyo < arriba) return null;
  if (suyo === 4) return "es dueño del bot.";
  if (suyo === 3) {
    return arriba === 3 ? "es admin del grupo. Primero hay que sacarle el admin con .demote." : "es admin del grupo, y los admins de WhatsApp están por encima de los roles del bot.";
  }
  if (suyo === 2) return "es admin del bot. Eso lo puede hacer un admin de WhatsApp.";
  if (suyo === 1) return "es moderador. Eso lo puede hacer un admin del bot o de WhatsApp.";
  return "no tenés rango para moderar acá.";
}

// "🛡️ admin del bot", "🧹 moderador" or ""
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

// When someone leaves the group (or is removed) they lose the role. "participantes" comes from the Baileys event:
// they may be bare ids or objects with an id, and arrive as @lid or @s.whatsapp.net, so both are tried.
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
