// Per-group bot roles: "admin" (bot admin) and "mod" (moderator). They apply only in that group and don't affect
// WhatsApp admins, who have everything without needing a role. Hierarchy: moderator < bot admin < WhatsApp admin
// < owner. WhatsApp admins (or the owner) appoint bot admins; bot admins appoint moderators.
// What each one can do is decided by the plugin flags: onlyMod (moderation) and onlyAdmin (settings and group).
import { setRolGrupo, borrarRolGrupo, rolesGrupo } from "../database-functions.js";
import { idsDeParticipante, identidadDelGrupo, esOwnerDe, lidDe, numeroDeLaLid } from "./identidad.js";

export const ROLES = {
  admin: { nombre: "admin del bot", emoji: "🛡️", poderes: "configurar el bot, manejar la economía y los juegos, moderar y nombrar moderadores", comando: "adminbot" },
  mod: { nombre: "moderador", emoji: "🧹", poderes: "advertir, silenciar, expulsar, fijar mensajes y mencionar a todo el grupo", comando: "moderador" },
};

const mencion = (id) => `@${id.split("@")[0]}`;

// A person's effective permissions in a chat. esOwner and esAdminWhatsApp are worked out by handle-message, and
// participants are the group's: the role is read as rolDe reads it, so whoever writes from a number that moved on
// doesn't get the role of whoever had it before, as long as something says it moved on: the group, listing that one
// with another number. A message with the number alone, in a group that doesn't list the one who had it, is read as
// theirs, the role too: nothing says otherwise, and WhatsApp isn't asked on every message.
export function permisosDe(chat, usuario, { esOwner = false, esAdminWhatsApp = false, participants = null } = {}) {
  const rol = rolDe(chat, { lid: usuario }, participants);
  const isAdmin = esOwner || esAdminWhatsApp || rol === "admin";
  const isMod = isAdmin || rol === "mod";
  return { rol, isAdmin, isMod };
}

// The higher of the roles kept in a group under exactly these ids. rolGrupo (database-functions.js) reads under the
// other identity the database has for an id too: for a number, the LID of whoever had it before, once it moved on, and
// for a LID, the number its row still has, whoever has it now.
function rolBajo(chat, ids) {
  const roles = rolesGrupo(chat).filter((r) => ids.includes(r.usuario)).map((r) => r.rol);
  return roles.includes("admin") ? "admin" : roles.includes("mod") ? "mod" : null;
}

// A person's two identities, as the role goes by them: the LID, when there's one, and the number (jid, or a number
// given as the lid, for someone the bot knows by it alone). With the number alone, the LID the group pairs it with,
// failing that the database's unless the group lists that one with another number (lidDe): the database may still have
// the number on whoever had it before, and through it ".moderador quitar +598…" took their role away, ".moderador
// @598…" said the person was a bot admin already, and ".kick +598…" from a moderator was refused for their role. With
// the LID alone, the number the group lists it with, failing that the one its row has unless the group lists that one
// with another LID (numeroDeLaLid): a role kept under a number is whoever has it now's, and by the number the row of
// whoever had it before still had, they were a moderator, ".moderador quitar @persona" took the role from whoever has
// it now, and so did their leaving the group.
function identidadesDelRol({ lid, jid } = {}, participants = null) {
  const numero = jid || (lid && !lid.endsWith("@lid") ? lid : null);
  const suLid = lid?.endsWith("@lid") ? lid : lidDe(numero, participants, { oElMismo: false });
  const conLid = suLid?.endsWith("@lid") ? suLid : null;
  return { lid: conLid, jid: numero || numeroDeLaLid(conLid, participants) };
}

// A person's role in a group by both of their identities (identidadesDelRol), the higher one, each read by itself
// (rolBajo): WhatsApp may say a number is a LID's that has nothing, the role being under the number, and by the LID
// alone a moderator was removed by another one, and a bot admin listed by another. With no LID given, the number's LID
// counts too: a group that lists people by number may not bring it, and a moderator was no one. participants are the
// group's, when at hand.
export function rolDe(chat, persona = {}, participants = null) {
  const { lid, jid } = identidadesDelRol(persona, participants);
  return rolBajo(chat, [lid, jid].filter(Boolean));
}

// Rank inside a group, for anything one member does to another: 4 bot owner, 3 WhatsApp admin, 2 bot admin,
// 1 moderator, 0 everyone else. "persona" is { lid, jid, esOwner, esAdminWhatsApp }; when esOwner isn't given it's
// looked up, which is what the target of a command needs (for whoever runs it, handle-message already knows). The role
// by both identities (rolDe), with the group's participants when at hand.
export function rango(chat, persona = {}, participants = null) {
  const dueno = persona.esOwner ?? esOwnerDe([persona.lid, persona.jid]);
  if (dueno) return 4;
  if (persona.esAdminWhatsApp) return 3;
  const rol = rolDe(chat, persona, participants);
  return rol === "admin" ? 2 : rol === "mod" ? 1 : 0;
}

// Why "quien" can't moderate "objetivo" (remove, warn, mute, blacklist, the ban roulette), or null when they can.
// Only from strictly above, which is what the hierarchy at the top of this file says: a moderator can't touch another
// moderator or a bot admin, a bot admin can't touch a WhatsApp admin, and a WhatsApp admin can't touch another one
// without taking their admin away first (the rule .ln already had). Before this, any moderator could remove an admin.
// participants are the group's, for both ranks (rango).
export function impedimentoParaModerar(chat, quien, objetivo, participants = null) {
  const arriba = rango(chat, quien, participants);
  const suyo = rango(chat, objetivo, participants);
  if (suyo < arriba) return null;
  if (suyo === 4) return "es dueño del bot.";
  if (suyo === 3) {
    return arriba === 3 ? "es admin del grupo. Primero hay que sacarle el admin con .demote." : "es admin del grupo, y los admins de WhatsApp están por encima de los roles del bot.";
  }
  if (suyo === 2) return "es admin del bot. Eso lo puede hacer un admin de WhatsApp.";
  if (suyo === 1) return "es moderador. Eso lo puede hacer un admin del bot o de WhatsApp.";
  return "no tenés rango para moderar acá.";
}

// "🛡️ admin del bot", "🧹 moderador" or "", for usuario (a LID, or a number for someone the bot knows by it alone) as
// rolDe reads the role, with the group's participants when at hand: read by the database alone, ".perfil @598…" of
// whoever has a number now showed the role of whoever had it before.
export function etiquetaRol(chat, usuario, participants = null) {
  const r = ROLES[rolDe(chat, { lid: usuario }, participants)];
  return r ? `${r.emoji} ${r.nombre}` : "";
}

const puedeConRol = (rol, quien) => (rol === "admin" ? quien.esOwner || quien.esAdminWhatsApp : quien.isAdmin);

// quien: { lid, esOwner, esAdminWhatsApp, isAdmin } · objetivo: { lid, jid, esAdminWhatsApp, esBot, estaEnGrupo }. The
// role goes under the LID, and what objetivo had under the number (jid), given by it, is taken into account and goes.
// With no LID to go by (identidadesDelRol), under the number alone. Nothing goes under the other identity the database
// has for the one the role goes under: setRolGrupo by the number took away the role of the LID the database has for
// it, whoever had it before, and by the LID, the role under the number its row still had, whoever has it now.
// participants are the group's.
export function darRol(chat, rol, quien, objetivo, participants = null) {
  const R = ROLES[rol];
  if (!puedeConRol(rol, quien)) return { ok: false, error: rol === "admin" ? "Solo un admin de WhatsApp (o el owner) puede nombrar admins del bot." : "Solo un admin puede nombrar moderadores." };
  if (!objetivo.lid) return { ok: false, error: `¿A quién? Mencionalo: .${R.comando} @persona, o respondé a un mensaje suyo.` };
  if (objetivo.esBot) return { ok: false, error: "Yo ya me modero sola, gracias." };
  if (objetivo.lid === quien.lid) return { ok: false, error: "A vos mismo no. Ya tenés permisos." };
  if (!objetivo.estaEnGrupo) return { ok: false, error: "Esa persona no está en el grupo." };
  if (objetivo.esAdminWhatsApp) return { ok: false, error: `${mencion(objetivo.lid)} ya es admin de WhatsApp: tiene todo sin necesidad de rol.`, mentions: [objetivo.lid] };
  const actual = rolDe(chat, objetivo, participants);
  if (actual === rol) return { ok: false, error: `${mencion(objetivo.lid)} ya es ${R.nombre} acá.`, mentions: [objetivo.lid] };
  if (actual === "admin" && rol === "mod") return { ok: false, error: `${mencion(objetivo.lid)} ya es admin del bot, que incluye lo de moderador. Para bajarlo: .adminbot quitar @persona y después .moderador @persona.`, mentions: [objetivo.lid] };
  const { lid, jid } = identidadesDelRol(objetivo, participants);
  setRolGrupo(chat, lid || jid, rol, quien.lid, lid && jid ? [jid] : []);
  const cambio = actual === "mod" ? " Deja de ser moderador porque esto lo incluye." : "";
  return { ok: true, mensaje: `${R.emoji} ${mencion(objetivo.lid)} ahora es *${R.nombre}* en este grupo: puede ${R.poderes}.${cambio} Con .${R.comando} quitar @persona se saca.`, mentions: [objetivo.lid] };
}

// By both identities, as darRol: given by the number, the role stayed under it when WhatsApp gave the person's LID.
// Each by itself, as identidadesDelRol works them out: quitarRolGrupo goes to the other identity the database has, and
// by the number it took away the role of the LID the database has for it, by the LID the role under the number its row
// still had, whoever has it now.
export function quitarRol(chat, rol, quien, objetivo, participants = null) {
  if (!objetivo.lid) return { ok: false, error: "¿A quién? Mencionalo o respondé a un mensaje suyo." };
  const actual = rolDe(chat, objetivo, participants);
  if (!actual) return { ok: false, error: `${mencion(objetivo.lid)} no tiene rol del bot en este grupo.`, mentions: [objetivo.lid] };
  if (actual !== rol) return { ok: false, error: `${mencion(objetivo.lid)} es ${ROLES[actual].nombre}, no ${ROLES[rol].nombre}. Usá .${ROLES[actual].comando} quitar @persona.`, mentions: [objetivo.lid] };
  if (!puedeConRol(actual, quien)) return { ok: false, error: actual === "admin" ? "Solo un admin de WhatsApp (o el owner) puede sacar admins del bot." : "Solo un admin puede sacar moderadores." };
  // It says "listo" only once the role is gone.
  const { lid, jid } = identidadesDelRol(objetivo, participants);
  const quitados = [lid && borrarRolGrupo(chat, lid), jid && borrarRolGrupo(chat, jid)];
  if (!quitados.some(Boolean)) return { ok: false, error: `No pude sacarle el rol a ${mencion(objetivo.lid)}. Probá de nuevo en un rato.`, mentions: [objetivo.lid] };
  return { ok: true, mensaje: `Listo, ${mencion(objetivo.lid)} ya no es ${ROLES[actual].nombre} acá.`, mentions: [objetivo.lid] };
}

// Each person with a role in the group, once, under the LID when it's known, and their role. From before giving a role
// went by both identities, someone may have one under each (a mod by number, an admin by LID): .roles and .config
// listed them twice, once by their number, and the higher one is the one that counts (rolDe). A number goes to the LID
// as lidDe takes it, with the group's participants when at hand: by the database alone, a role under a number that
// moved on named whoever had it before.
export function rolesPorPersona(chat, participants = null) {
  const porPersona = new Map();
  for (const f of rolesGrupo(chat)) {
    const id = lidDe(f.usuario, participants);
    if (porPersona.get(id) !== "admin") porPersona.set(id, f.rol);
  }
  return porPersona;
}

// .roles: one line per person.
export function textoRoles(chat, participants = null) {
  const porPersona = rolesPorPersona(chat, participants);
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
// the event brings it, and the number it brings with it, failing that the one the group lists that LID with
// (numeroDeLaLid, with participants, the group's), each by itself: quitarRolGrupo takes a number to the LID the
// database knows for it, which may be whoever had the number before, and a LID to the number its row still has, which
// may be whoever has it now's, and each lost their role when the other one left. With the number alone, the role under
// it and the one of the LID the database knows for it, unless the group lists that one with another number
// (idsDeParticipante): by the number, the one who had it lost theirs all the same.
export function limpiarRolesAlSalir(chat, participantes, participants = null) {
  let borrados = 0;
  for (const p of participantes || []) {
    const { lid, jid } = identidadDelGrupo(p);
    const ids = lid ? [lid, jid || numeroDeLaLid(lid, participants)] : idsDeParticipante(p, participants);
    for (const id of new Set(ids)) if (id && borrarRolGrupo(chat, id)) borrados++;
  }
  return borrados;
}
