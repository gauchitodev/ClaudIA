// Per-group bot roles: "admin" (bot admin) and "mod" (moderator). They apply only in that group and don't affect
// WhatsApp admins, who have everything without needing a role. Hierarchy: moderator < bot admin < WhatsApp admin
// < owner. WhatsApp admins (or the owner) appoint bot admins; bot admins appoint moderators.
// What each one can do is decided by the plugin flags: onlyMod (moderation) and onlyAdmin (settings and group).
import { setRolGrupo, quitarRolGrupo, borrarRolGrupo, rolGrupo, rolesGrupo } from "../database-functions.js";
import { idsDeParticipante, identidadDelGrupo, esOwnerDe, lidDe } from "./identidad.js";

export const ROLES = {
  admin: { nombre: "admin del bot", emoji: "🛡️", poderes: "configurar el bot, manejar la economía y los juegos, moderar y nombrar moderadores", comando: "adminbot" },
  mod: { nombre: "moderador", emoji: "🧹", poderes: "advertir, silenciar, expulsar, fijar mensajes y mencionar a todo el grupo", comando: "moderador" },
};

const mencion = (id) => `@${id.split("@")[0]}`;

// A person's effective permissions in a chat. esOwner and esAdminWhatsApp are worked out by handle-message.
export function permisosDe(chat, usuario, { esOwner = false, esAdminWhatsApp = false } = {}) {
  const rol = rolGrupo(chat, usuario);
  const isAdmin = esOwner || esAdminWhatsApp || rol === "admin";
  const isMod = isAdmin || rol === "mod";
  return { rol, isAdmin, isMod };
}

// The role kept under exactly this id. For a number, that's the role given by it, to someone the bot knew by it alone:
// rolGrupo reads the role of the LID the database has for the number too, someone else's once the number moved on.
const rolBajo = (chat, id) => (id ? rolesGrupo(chat).find((r) => r.usuario === id)?.rol || null : null);

// A person's role in a group by both of their identities, the higher one. By the LID (and the number the database has
// for it), and the one given by their number: WhatsApp may say a number is a LID's that has nothing, the role being
// under the number, and by the LID alone a moderator was removed by another one, and a bot admin listed by another.
// With no LID, by the number, and the LID the database has for it: a group that lists people by number may not bring
// it, and a moderator was no one.
export function rolDe(chat, { lid, jid } = {}) {
  const roles = lid ? [rolGrupo(chat, lid), jid && jid !== lid ? rolBajo(chat, jid) : null] : [rolGrupo(chat, jid)];
  return roles.includes("admin") ? "admin" : roles.includes("mod") ? "mod" : null;
}

// Rank inside a group, for anything one member does to another: 4 bot owner, 3 WhatsApp admin, 2 bot admin,
// 1 moderator, 0 everyone else. "persona" is { lid, jid, esOwner, esAdminWhatsApp }; when esOwner isn't given it's
// looked up, which is what the target of a command needs (for whoever runs it, handle-message already knows). The role
// by both identities (rolDe).
export function rango(chat, persona = {}) {
  const dueno = persona.esOwner ?? esOwnerDe([persona.lid, persona.jid]);
  if (dueno) return 4;
  if (persona.esAdminWhatsApp) return 3;
  const rol = rolDe(chat, persona);
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

// quien: { lid, esOwner, esAdminWhatsApp, isAdmin } · objetivo: { lid, jid, esAdminWhatsApp, esBot, estaEnGrupo }. The
// role goes under the LID, and what objetivo had under the number (jid), given by it, is taken into account and goes.
export function darRol(chat, rol, quien, objetivo) {
  const R = ROLES[rol];
  if (!puedeConRol(rol, quien)) return { ok: false, error: rol === "admin" ? "Solo un admin de WhatsApp (o el owner) puede nombrar admins del bot." : "Solo un admin puede nombrar moderadores." };
  if (!objetivo.lid) return { ok: false, error: `¿A quién? Mencionalo: .${R.comando} @persona, o respondé a un mensaje suyo.` };
  if (objetivo.esBot) return { ok: false, error: "Yo ya me modero sola, gracias." };
  if (objetivo.lid === quien.lid) return { ok: false, error: "A vos mismo no. Ya tenés permisos." };
  if (!objetivo.estaEnGrupo) return { ok: false, error: "Esa persona no está en el grupo." };
  if (objetivo.esAdminWhatsApp) return { ok: false, error: `${mencion(objetivo.lid)} ya es admin de WhatsApp: tiene todo sin necesidad de rol.`, mentions: [objetivo.lid] };
  const actual = rolDe(chat, objetivo);
  if (actual === rol) return { ok: false, error: `${mencion(objetivo.lid)} ya es ${R.nombre} acá.`, mentions: [objetivo.lid] };
  if (actual === "admin" && rol === "mod") return { ok: false, error: `${mencion(objetivo.lid)} ya es admin del bot, que incluye lo de moderador. Para bajarlo: .adminbot quitar @persona y después .moderador @persona.`, mentions: [objetivo.lid] };
  setRolGrupo(chat, objetivo.lid, rol, quien.lid);
  if (objetivo.jid && objetivo.jid !== objetivo.lid) borrarRolGrupo(chat, objetivo.jid);
  const cambio = actual === "mod" ? " Deja de ser moderador porque esto lo incluye." : "";
  return { ok: true, mensaje: `${R.emoji} ${mencion(objetivo.lid)} ahora es *${R.nombre}* en este grupo: puede ${R.poderes}.${cambio} Con .${R.comando} quitar @persona se saca.`, mentions: [objetivo.lid] };
}

// By both identities, as darRol: given by the number, the role stayed under it when WhatsApp gave the person's LID.
export function quitarRol(chat, rol, quien, objetivo) {
  if (!objetivo.lid) return { ok: false, error: "¿A quién? Mencionalo o respondé a un mensaje suyo." };
  const actual = rolDe(chat, objetivo);
  if (!actual) return { ok: false, error: `${mencion(objetivo.lid)} no tiene rol del bot en este grupo.`, mentions: [objetivo.lid] };
  if (actual !== rol) return { ok: false, error: `${mencion(objetivo.lid)} es ${ROLES[actual].nombre}, no ${ROLES[rol].nombre}. Usá .${ROLES[actual].comando} quitar @persona.`, mentions: [objetivo.lid] };
  if (!puedeConRol(actual, quien)) return { ok: false, error: actual === "admin" ? "Solo un admin de WhatsApp (o el owner) puede sacar admins del bot." : "Solo un admin puede sacar moderadores." };
  // It says "listo" only once the role is gone.
  const quitados = [quitarRolGrupo(chat, objetivo.lid), objetivo.jid && objetivo.jid !== objetivo.lid && borrarRolGrupo(chat, objetivo.jid)];
  if (!quitados.some(Boolean)) return { ok: false, error: `No pude sacarle el rol a ${mencion(objetivo.lid)}. Probá de nuevo en un rato.`, mentions: [objetivo.lid] };
  return { ok: true, mensaje: `Listo, ${mencion(objetivo.lid)} ya no es ${ROLES[actual].nombre} acá.`, mentions: [objetivo.lid] };
}

// Each person with a role in the group, once, under the LID when it's known, and their role. From before giving a role
// went by both identities, someone may have one under each (a mod by number, an admin by LID): .roles and .config
// listed them twice, once by their number, and the higher one is the one that counts (rolGrupo).
export function rolesPorPersona(chat) {
  const porPersona = new Map();
  for (const f of rolesGrupo(chat)) {
    const id = lidDe(f.usuario);
    if (porPersona.get(id) !== "admin") porPersona.set(id, f.rol);
  }
  return porPersona;
}

// .roles: one line per person.
export function textoRoles(chat) {
  const porPersona = rolesPorPersona(chat);
  const lista = (rol) => [...porPersona].filter(([, r]) => r === rol).map(([id]) => mencion(id));
  const admins = lista("admin");
  const mods = lista("mod");
  const texto = [
    `🛡️ *Admins del bot:* ${admins.length ? admins.join(", ") : "nadie"}`,
    `🧹 *Moderadores:* ${mods.length ? mods.join(", ") : "nadie"}`,
    "",
    `Los admins de WhatsApp tienen todo sin necesidad de rol. Un admin del bot puede ${ROLES.admin.poderes}; un moderador puede ${ROLES.mod.poderes}.`,
    `.adminbot @persona y .moderador @persona para dar el rol; con "quitar" antes de la mención se saca.`,
  ].join("\n");
  return { texto, mentions: [...porPersona.keys()] };
}

// When someone leaves the group (or is removed) they lose the role. "participantes" comes from the Baileys event:
// they may be bare ids or objects with an id, and arrive as @lid or @s.whatsapp.net, so both are tried. By the LID when
// the event brings it: quitarRolGrupo takes a number to the LID the database knows for it, which may be whoever had the
// number before, and they lost their role when the one who has it now left.
export function limpiarRolesAlSalir(chat, participantes) {
  let borrados = 0;
  for (const p of participantes || []) {
    const { lid } = identidadDelGrupo(p);
    for (const id of lid ? [lid] : idsDeParticipante(p)) if (quitarRolGrupo(chat, id)) borrados++;
  }
  return borrados;
}
