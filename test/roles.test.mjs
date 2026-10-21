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

test("roles: el rango ordena dueño > admin de WhatsApp > admin del bot > moderador > miembro", () => {
  F.initDataDB(persona(501));
  F.initDataDB(persona(502));
  F.setRolGrupo(G, "501@lid", "admin", "100@lid");
  F.setRolGrupo(G, "502@lid", "mod", "501@lid");
  const dueno = `${globalThis.owners[0]}@s.whatsapp.net`;

  assert.equal(R.rango(G, { jid: dueno }), 4, "al dueño lo reconoce por su número aunque no se diga");
  assert.equal(R.rango(G, { lid: "100@lid", esAdminWhatsApp: true }), 3);
  assert.equal(R.rango(G, { lid: "501@lid" }), 2);
  assert.equal(R.rango(G, { lid: "502@lid" }), 1);
  assert.equal(R.rango(G, { lid: "111@lid" }), 0);
  assert.equal(R.rango("otro@g.us", { lid: "501@lid" }), 0, "los roles del bot son de cada grupo");

  // Only strictly above: equal rank doesn't reach, whichever the rank.
  assert.equal(R.impedimentoParaModerar(G, { lid: "501@lid" }, { lid: "502@lid" }), null);
  assert.match(R.impedimentoParaModerar(G, { lid: "502@lid" }, { lid: "502@lid" }), /es moderador/);
  assert.match(R.impedimentoParaModerar(G, { lid: "100@lid", esAdminWhatsApp: true }, { lid: "444@lid", esAdminWhatsApp: true }), /\.demote/);
});

// A role is given to the id a mention resolves to: the LID nowadays, the number for someone the bot didn't know yet. And
// a message from a group that lists people by number may bring only the number: either identity has to find it.
test("roles: un rol se encuentra por cualquiera de las dos identidades", () => {
  F.initDataDB(persona(601));
  F.setRolGrupo(G, "601@lid", "mod", "100@lid");
  assert.equal(F.rolGrupo(G, "601@s.whatsapp.net"), "mod", "dado a la LID, se encuentra con el número");
  assert.deepEqual(R.permisosDe(G, "601@s.whatsapp.net"), { rol: "mod", isAdmin: false, isMod: true });
  F.setRolGrupo(G, "602@s.whatsapp.net", "admin", "100@lid");
  F.initDataDB(persona(602));
  assert.equal(F.rolGrupo(G, "602@lid"), "admin", "dado al número, se encuentra con la LID");
  assert.equal(R.rango(G, { lid: "602@lid" }), 2);
  assert.equal(F.rolGrupo(G, "603@s.whatsapp.net"), null, "y alguien sin rol sigue sin rol");
});

// The same group, listed by number: a WhatsApp admin is named by their number there, with the LID apart.
test("roles: en un grupo que lista por número, a un admin de WhatsApp no se le da rol", async () => {
  const porNumero = participants.map((p) => ({ ...p, id: `${p.id.split("@")[0]}@s.whatsapp.net`, lid: p.id }));
  F.setRolGrupo(G, "333@lid", "admin", "100@lid"); // a bot admin
  const { isAdmin } = R.permisosDe(G, "333@lid", {});
  await P.run({ chat: G, sender: "333@lid", isGroup: true, mentionedJid: ["100@lid"] }, { client: globalThis.client, command: "moderador", args: ["@100"], text: "@100", participants: porNumero, isOwner: false, isWaAdmin: false, isAdmin });
  assert.match(ultimo(), /@100 ya es admin de WhatsApp: tiene todo sin necesidad de rol/);
  assert.equal(F.rolGrupo(G, "100@lid"), null);
});

// A role given by number, before the bot knew the person's LID, is taken off by the LID too: it used to stay, with the
// bot saying it was gone. And giving another one leaves a single row, not one under each identity.
test("roles: dado por número, se saca y se cambia aunque la mención llegue con la LID", () => {
  F.setRolGrupo(G, "59899000700@s.whatsapp.net", "mod", "100@lid");
  F.initDataDB({ chat: G, sender: "700@lid", senderJid: "59899000700@s.whatsapp.net", pushName: "Persona 700" });
  const delGrupo = () => F.rolesGrupo(G).filter((f) => f.usuario.includes("700")).map((f) => [f.usuario, f.rol]);
  const admin = { lid: "100@lid", esAdminWhatsApp: true, isAdmin: true };
  assert.equal(R.quitarRol(G, "mod", admin, { lid: "700@lid" }).ok, true);
  assert.equal(F.rolGrupo(G, "700@lid"), null, "y de verdad no lo tiene");
  assert.deepEqual(delGrupo(), []);

  F.setRolGrupo(G, "59899000700@s.whatsapp.net", "mod", "100@lid");
  assert.equal(R.darRol(G, "admin", { ...admin, esOwner: false }, { lid: "700@lid", estaEnGrupo: true }).ok, true);
  assert.deepEqual(delGrupo(), [["700@lid", "admin"]], "una sola fila");
  assert.equal(R.quitarRol(G, "admin", admin, { lid: "700@lid" }).ok, true);
  assert.equal(F.rolGrupo(G, "59899000700@s.whatsapp.net"), null, "sin el moderador de antes");
});

test("esOwner reconoce el LID del dueño aunque tenga una fila vieja guardada por número", () => {
  const numero = `${globalThis.owners[0]}@s.whatsapp.net`;
  F.initDataDB({ chat: numero, sender: numero, senderJid: numero }); // from before LIDs: the row is keyed by the number
  F.initDataDB({ chat: G, sender: "4242@lid", senderJid: numero }); // the same owner, now writing in a group by LID
  assert.ok(F.esOwner("4242@lid"), "solo miraba la primera fila con ese número, la vieja");
  assert.ok(F.esOwner(numero));
  assert.ok(!F.esOwner("5555@lid"));
});
