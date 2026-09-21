import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

let F, R, P, Pf;
before(async () => {
  ({ F } = await prepararBase("roles"));
  R = await import("../lib/roles.js");
  P = (await import("../plugins/grupo-roles.js")).default;
  Pf = await import("../lib/perfil.js");
  globalThis.client.decodeJid = (j) => j;
  globalThis.client.user.lid = "999000@lid";
});
const persona = (n) => ({ chat: G, sender: `${n}@lid`, senderJid: `${n}@s.whatsapp.net`, pushName: `Persona ${n}` });
// 100 is a WhatsApp admin; 111, 222 and 333 are ordinary people; the bot is a group admin too
const participants = [{ id: "100@lid", admin: "superadmin" }, { id: "111@lid", admin: null }, { id: "222@lid", admin: null }, { id: "333@lid", admin: null }, { id: "999000@lid", admin: "admin" }];
// mimics the dispatcher: it works out isAdmin from the stored roles and passes isWaAdmin separately
const correr = (sender, command, text = "", { esOwner = false } = {}) => {
  const esAdminWhatsApp = !!participants.find((p) => p.id === sender)?.admin;
  const { isAdmin } = R.permisosDe(G, sender, { esOwner, esAdminWhatsApp });
  const args = text.trim() ? text.trim().split(/\s+/) : [];
  return P.run({ chat: G, sender, isGroup: true }, { client: globalThis.client, command, args, text, participants, isOwner: esOwner, isWaAdmin: esAdminWhatsApp, isAdmin });
};
const ultimo = () => ultimoEnviado().msg.text;

test("roles: permisos efectivos según owner, admin de WhatsApp y rol del bot", () => {
  const p = (u, extra) => R.permisosDe(G, u, extra);
  assert.deepEqual(p("111@lid"), { rol: null, isAdmin: false, isMod: false });
  assert.deepEqual(p("111@lid", { esOwner: true }), { rol: null, isAdmin: true, isMod: true });
  assert.deepEqual(p("111@lid", { esAdminWhatsApp: true }), { rol: null, isAdmin: true, isMod: true });
  F.setRolGrupo(G, "111@lid", "mod", "100@lid");
  assert.deepEqual(p("111@lid"), { rol: "mod", isAdmin: false, isMod: true });
  F.setRolGrupo(G, "111@lid", "admin", "100@lid");
  assert.deepEqual(p("111@lid"), { rol: "admin", isAdmin: true, isMod: true });
  assert.equal(R.etiquetaRol(G, "111@lid"), "🛡️ admin del bot");
  assert.deepEqual(p("111@lid"), R.permisosDe(G, "111@lid", {}), "en otro grupo no vale");
  assert.equal(R.permisosDe("otro@g.us", "111@lid").rol, null, "el rol es por grupo");
  assert.ok(F.quitarRolGrupo(G, "111@lid") && !F.quitarRolGrupo(G, "111@lid"));
});

test("roles: quién puede dar y sacar cada rol", async () => {
  for (const n of [100, 111, 222, 333]) F.initDataDB(persona(n));
  await correr("111@lid", "adminbot", "@222");
  assert.match(ultimo(), /Solo un admin de WhatsApp \(o el owner\) puede nombrar admins del bot/);
  await correr("100@lid", "adminbot", "@222");
  assert.match(ultimo(), /🛡️ @222 ahora es \*admin del bot\* en este grupo: puede configurar el bot/);
  assert.deepEqual(ultimoEnviado().msg.mentions, ["222@lid"]);
  assert.equal(F.rolGrupo(G, "222@lid"), "admin");
  await correr("100@lid", "adminbot", "@222");
  assert.match(ultimo(), /@222 ya es admin del bot acá/);
  // a bot admin appoints moderators, but not bot admins
  await correr("222@lid", "moderador", "@333");
  assert.match(ultimo(), /🧹 @333 ahora es \*moderador\* en este grupo: puede advertir, silenciar, expulsar/);
  assert.equal(F.rolGrupo(G, "333@lid"), "mod");
  await correr("222@lid", "adminbot", "@111");
  assert.match(ultimo(), /Solo un admin de WhatsApp/);
  // an ordinary person appoints nobody
  await correr("111@lid", "mod", "@333");
  assert.match(ultimo(), /Solo un admin puede nombrar moderadores/);
  // subir un moderador a admin lo reemplaza; bajar un admin a moderador se hace en dos pasos
  await correr("100@lid", "moderador", "@222");
  assert.match(ultimo(), /ya es admin del bot, que incluye lo de moderador/);
  await correr("100@lid", "adminbot", "@333");
  assert.match(ultimo(), /Deja de ser moderador porque esto lo incluye/);
  assert.equal(F.rolGrupo(G, "333@lid"), "admin");
  // revoking: a bot admin only by a WhatsApp admin; using the command of the role they hold
  await correr("222@lid", "adminbot", "quitar @333");
  assert.match(ultimo(), /Solo un admin de WhatsApp \(o el owner\) puede sacar admins del bot/);
  await correr("100@lid", "moderador", "quitar @333");
  assert.match(ultimo(), /@333 es admin del bot, no moderador\. Usá \.adminbot quitar/);
  await correr("100@lid", "adminbot", "quitar @333");
  assert.match(ultimo(), /Listo, @333 ya no es admin del bot acá/);
  assert.equal(F.rolGrupo(G, "333@lid"), null);
  await correr("100@lid", "adminbot", "quitar @333");
  assert.match(ultimo(), /@333 no tiene rol del bot en este grupo/);
  // the owner can do everything even without being a group admin
  await correr("111@lid", "adminbot", "@333", { esOwner: true });
  assert.equal(F.rolGrupo(G, "333@lid"), "admin");
});

test("roles: validaciones del objetivo y listado", async () => {
  await correr("100@lid", "adminbot", "@100");
  assert.match(ultimo(), /A vos mismo no/);
  await correr("100@lid", "moderador", "@999000");
  assert.match(ultimo(), /Yo ya me modero sola/);
  await correr("222@lid", "moderador", "@100");
  assert.match(ultimo(), /@100 ya es admin de WhatsApp: tiene todo sin necesidad de rol/);
  await correr("100@lid", "moderador", "@999");
  assert.match(ultimo(), /Esa persona no está en el grupo/);
  await correr("100@lid", "moderador", "quitar");
  assert.match(ultimo(), /¿A quién\?/);
  await correr("100@lid", "moderador", "");
  assert.match(ultimo(), /🛡️ \*Admins del bot:\* @222, @333\n🧹 \*Moderadores:\* nadie/);
  F.setRolGrupo(G, "111@lid", "mod", "100@lid");
  await correr("111@lid", "roles", "");
  assert.match(ultimo(), /🧹 \*Moderadores:\* @111/);
  assert.deepEqual(ultimoEnviado().msg.mentions.sort(), ["111@lid", "222@lid", "333@lid"]);
  // replying to a message works too
  await P.run({ chat: G, sender: "100@lid", isGroup: true, quoted: { sender: "111@lid" } }, { client: globalThis.client, command: "moderador", args: ["quitar"], text: "quitar", participants, isOwner: false, isWaAdmin: true, isAdmin: true });
  assert.match(ultimo(), /@111 ya no es moderador acá/);
});

test("roles: se pierden al salir del grupo y se ven en el perfil", () => {
  F.setRolGrupo(G, "111@lid", "mod", "100@lid");
  assert.equal(R.limpiarRolesAlSalir(G, ["111@lid"]), 1);
  assert.equal(F.rolGrupo(G, "111@lid"), null);
  assert.equal(R.limpiarRolesAlSalir(G, [{ id: "222@s.whatsapp.net" }]), 1, "con el jid también, resolviendo el lid por la base");
  assert.equal(F.rolGrupo(G, "222@lid"), null);
  assert.equal(R.limpiarRolesAlSalir(G, ["nadie@lid", null]), 0);
  assert.equal(F.rolGrupo(G, "333@lid"), "admin", "los que se quedan conservan el rol");
  assert.match(Pf.textoPerfil(G, "333@lid", F.getUser("333@lid")).texto, /🌱 Nuevo · 🛡️ admin del bot · /);
});
