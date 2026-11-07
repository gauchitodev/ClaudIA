import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";
import { configuracion } from "../lib/configuracion.js";

// The group's social links (lib/redes.js, plugins/redes.js): an admin loads them, anyone sees them, the welcome with
// the rules points to them, and Claudia has them in her prompt (auto-ia.test.mjs).
let F, R, Re, P;
before(async () => {
  ({ F } = await prepararBase("redes"));
  R = await import("../lib/redes.js");
  Re = await import("../lib/reglas.js");
  P = (await import("../plugins/redes.js")).default;
  F.initDataDB({ chat: G, sender: "a@lid", senderJid: "", pushName: "Ana" });
});
const TODAS = "instagram, facebook, x, tiktok, youtube, twitch, spotify, discord, telegram, canal, grupo, web";
async function correr(text, { command = "redes", isAdmin = false, isOwner = false, isBotAdmin = false, chat = G, client = globalThis.client } = {}) {
  globalThis.enviados = [];
  await P.run({ chat, sender: "a@lid", isGroup: true, text }, { client, text, command, isAdmin, isOwner, isBotAdmin });
  return ultimoEnviado()?.msg?.text;
}

test("leerRed: las redes, sus alias y sin acentos; otra cosa, no", () => {
  const casos = [["instagram", "instagram"], ["Insta", "instagram"], ["ig", "instagram"], ["twitter", "x"], ["X", "x"], ["yt", "youtube"], ["Página", "web"], ["canal", "canal"], ["grupo", "grupo"], ["fb", "facebook"]];
  for (const [palabra, red] of casos) assert.equal(R.leerRed(palabra), red, palabra);
  for (const palabra of ["", "mastodon", "https://x.com/a"]) assert.equal(R.leerRed(palabra), null, palabra);
});

test("fijarRed: solo links http(s) de la red que dicen ser, hasta 200 letras; se guardan por grupo y se borran", () => {
  assert.equal(R.fijarRed(G, "mastodon", "https://mastodon.social/@x").error, `No conozco esa red. Las que van: ${TODAS}.`);
  assert.equal(R.fijarRed(G, "instagram", "instagram.com/xuru").error, "Pasame el link completo, con https://: .redes instagram https://…");
  assert.match(R.fijarRed(G, "instagram", "https://instagram .com/x").error, /^Pasame el link completo/);
  assert.match(R.fijarRed(G, "web", "ftp://xuru.uy/archivo").error, /^Pasame el link completo/, "http(s) y nada más");
  assert.equal(R.fijarRed(G, "instagram", `https://instagram.com/${"x".repeat(200)}`).error, "Muy largo: como mucho 200 caracteres.");
  assert.equal(R.fijarRed(G, "instagram", "https://tiktok.com/@xuru").error, "Ese link no es de Instagram: tiene que ser de instagram.com.");
  assert.equal(R.fijarRed(G, "canal", "https://chat.whatsapp.com/ABC").error, "Ese link no es de Canal de WhatsApp: tiene que ser de whatsapp.com, con /channel/.");
  assert.equal(R.fijarRed(G, "discord", "https://discord.gg.evil.com/x").error, "Ese link no es de Discord: tiene que ser de discord.gg o discord.com.");
  // subdomains of the network's domains count, the channel needs its path, and the web takes any http(s) link
  assert.equal(R.fijarRed(G, "instagram", "https://www.instagram.com/xuru/").ok, true);
  assert.equal(R.fijarRed(G, "spotify", "https://open.spotify.com/playlist/1").ok, true);
  assert.equal(R.fijarRed(G, "canal", "https://whatsapp.com/channel/0029Va").ok, true);
  assert.equal(R.fijarRed(G, "x", "https://twitter.com/xuru").ok, true);
  assert.deepEqual(R.fijarRed(G, "web", "http://xuru.uy"), { ok: true, red: "web", mensaje: "🌐 Listo: Web del grupo cargado. Cualquiera lo ve con .redes, y yo lo paso si me lo piden." });
  assert.deepEqual(R.redesDe(G), { instagram: "https://www.instagram.com/xuru/", x: "https://twitter.com/xuru", spotify: "https://open.spotify.com/playlist/1", canal: "https://whatsapp.com/channel/0029Va", web: "http://xuru.uy" });
  assert.deepEqual(R.redesDe("otro@g.us"), {}, "son de cada grupo");
  assert.deepEqual(R.borrarRed(G, "x"), { ok: true, red: "x", mensaje: "🗑️ Listo, borré el X del grupo." });
  assert.equal(R.borrarRed(G, "x").error, "Este grupo no tiene X cargado.");
  assert.equal(R.borrarRed(G, "mastodon").error, `No conozco esa red. Las que van: ${TODAS}.`);
  assert.ok(!("x" in R.redesDe(G)));
});

test("textoRedes y el prompt: la lista en orden, una sola, el canal del bot por defecto, y nada si no hay", () => {
  const C = "redes-texto@g.us";
  F.initDataDB({ chat: C, sender: "a@lid", senderJid: "", pushName: "Ana" });
  assert.equal(R.textoRedes(C), `🔗 Este grupo no tiene redes cargadas. Un admin las pone con .redes instagram <link> (o ${TODAS.replace("instagram, ", "")}).`);
  assert.equal(R.textoRedesParaPrompt(C), "");
  assert.equal(R.textoRedes(C, { red: "discord" }), "🎮 Este grupo no tiene Discord cargado. Un admin lo pone con .redes discord <link>.");
  R.fijarRed(C, "discord", "https://discord.gg/xuru");
  R.fijarRed(C, "instagram", "https://instagram.com/xuru");
  assert.equal(R.textoRedes(C), "🔗 *Redes del grupo*\n📸 Instagram: https://instagram.com/xuru\n🎮 Discord: https://discord.gg/xuru");
  assert.equal(R.textoRedes(C, { red: "discord" }), "🎮 Discord del grupo:\nhttps://discord.gg/xuru");
  assert.equal(R.textoRedes(C, { grupoInvitacion: "https://chat.whatsapp.com/INV" }), "🔗 *Redes del grupo*\n📸 Instagram: https://instagram.com/xuru\n🎮 Discord: https://discord.gg/xuru\n👥 Link de invitación: https://chat.whatsapp.com/INV");
  assert.equal(R.textoRedesParaPrompt(C), "Redes y links del grupo (si alguien te los pide, pasalos tal cual, sin cambiarlos): Instagram: https://instagram.com/xuru · Discord: https://discord.gg/xuru");
  // the bot's channel (config.toml) where the group loaded none; the group's own wins
  const canalAntes = configuracion.canalConfig;
  configuracion.canalConfig = { enlace: "https://whatsapp.com/channel/BOT" };
  try {
    assert.match(R.textoRedes(C), /\n📣 Canal de WhatsApp: https:\/\/whatsapp\.com\/channel\/BOT$/);
    R.fijarRed(C, "canal", "https://whatsapp.com/channel/GRUPO");
    assert.match(R.textoRedes(C), /\n📣 Canal de WhatsApp: https:\/\/whatsapp\.com\/channel\/GRUPO$/);
  } finally {
    configuracion.canalConfig = canalAntes;
  }
  // a broken column reads as none
  F.updateChat(C, { redes: "no es json" });
  assert.deepEqual(R.redesDe(C), {});
});

test(".redes: cualquiera ve, un admin carga y borra; .redes instagram una sola; .links y .discord siguen andando", async () => {
  const C = "redes-plugin@g.us";
  F.initDataDB({ chat: C, sender: "a@lid", senderJid: "", pushName: "Ana" });
  const en = (text, extra = {}) => correr(text, { chat: C, ...extra });
  const soloAdmins = "🔗 Las redes del grupo las carga y las borra un admin. Vos las ves con .redes.";
  assert.match(await en(""), /^🔗 Este grupo no tiene redes cargadas\./);
  assert.equal(await en("instagram https://instagram.com/xuru"), soloAdmins);
  assert.equal(await en("borrar instagram"), soloAdmins);
  assert.equal(await en("instagram https://instagram.com/xuru", { isAdmin: true }), "📸 Listo: Instagram del grupo cargado. Cualquiera lo ve con .redes, y yo lo paso si me lo piden.");
  assert.equal(await en("https://discord.gg/xuru", { command: "discord", isOwner: true }), "🎮 Listo: Discord del grupo cargado. Cualquiera lo ve con .redes, y yo lo paso si me lo piden.");
  assert.equal(await en("mastodon https://mastodon.social/x", { isAdmin: true }), `❌ No conozco esa red. Las que van: ${TODAS}.`);
  assert.equal(await en("instagram https://tiktok.com/x", { isAdmin: true }), "❌ Ese link no es de Instagram: tiene que ser de instagram.com.");
  assert.equal(await en(""), "🔗 *Redes del grupo*\n📸 Instagram: https://instagram.com/xuru\n🎮 Discord: https://discord.gg/xuru");
  assert.equal(await en("", { command: "links" }), "🔗 *Redes del grupo*\n📸 Instagram: https://instagram.com/xuru\n🎮 Discord: https://discord.gg/xuru");
  assert.equal(await en("insta"), "📸 Instagram del grupo:\nhttps://instagram.com/xuru");
  assert.equal(await en("", { command: "discord" }), "🎮 Discord del grupo:\nhttps://discord.gg/xuru");
  assert.equal(await en("tiktok"), "🎵 Este grupo no tiene TikTok cargado. Un admin lo pone con .redes tiktok <link>.");
  assert.equal(await en("mastodon"), `❌ No conozco esa red. Las que van: ${TODAS}.`);
  // this group's invite link when the bot is admin and nobody loaded one; what's loaded wins
  const client = { ...globalThis.client, groupInviteCode: async () => "INVITE" };
  assert.match(await en("", { isBotAdmin: true, client }), /\n👥 Link de invitación: https:\/\/chat\.whatsapp\.com\/INVITE$/);
  assert.equal(await en("grupo", { isBotAdmin: true, client }), "👥 Link de invitación del grupo:\nhttps://chat.whatsapp.com/INVITE");
  assert.doesNotMatch(await en("", { isBotAdmin: false, client }), /chat\.whatsapp\.com/, "sin ser admin del grupo no lo puede pedir");
  assert.equal(await en("grupo https://chat.whatsapp.com/PROPIO", { isAdmin: true }), "👥 Listo: Link de invitación del grupo cargado. Cualquiera lo ve con .redes, y yo lo paso si me lo piden.");
  assert.match(await en("", { isBotAdmin: true, client }), /\n👥 Link de invitación: https:\/\/chat\.whatsapp\.com\/PROPIO$/);
  assert.equal(await en("sacar discord", { isAdmin: true }), "🗑️ Listo, borré el Discord del grupo.");
  assert.doesNotMatch(await en(""), /Discord/);
});

test("la bienvenida con las reglas nombra .redes cuando el grupo tiene links", () => {
  const C = "redes-reglas@g.us";
  F.initDataDB({ chat: C, sender: "a@lid", senderJid: "", pushName: "Ana" });
  Re.fijarReglas(C, "Nada de spam.");
  assert.match(Re.avisoReglasParaNuevos(C, ["b@lid"]).texto, /\(\.reglas las muestra de nuevo · \.plantilla el formato para publicar\)$/);
  R.fijarRed(C, "instagram", "https://instagram.com/xuru");
  assert.match(Re.avisoReglasParaNuevos(C, ["b@lid"]).texto, /\(\.reglas las muestra de nuevo · \.plantilla el formato para publicar · \.redes los links del grupo\)$/);
});

test(".redes es de los grupos, está entre los extras y el menú lo nombra para todos y para los admins", async () => {
  const fs = await import("node:fs");
  const { secciones } = await import("../lib/secciones.js");
  assert.deepEqual([P.onlyGroup, P.onlyAdmin, P.onlyMod], [true, undefined, undefined]);
  assert.ok(["redes", "links", "discord", "sociales"].every((c) => secciones.extras.includes(c)));
  const menu = fs.readFileSync(new URL("../lib/menu.js", import.meta.url), "utf8");
  assert.match(menu, /\n▸ \$\{usedPrefix\}redes 🔗 – /);
  assert.match(menu, /\n▸ \$\{usedPrefix\}redes instagram <link> 🔗 – \\`Solo admins:/);
});
