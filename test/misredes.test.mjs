import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

// Someone's own social links in their profile of a group (lib/redes-persona.js, plugins/misredes.js): by username or
// by link, per group; nobody loads someone else's, an admin takes one out, and .perfil lists them.
let F, RP, Pf, P;
const L = (n) => `${n}@lid`;
const participants = [901, 902, 903].map((n) => ({ id: L(n), admin: n === 902 ? "admin" : null }));
const TODAS = "instagram, x, tiktok, threads, bluesky, mastodon, facebook, youtube, twitch, spotify, github, steam, linkedin, telegram, discord, web";
before(async () => {
  ({ F } = await prepararBase("misredes"));
  RP = await import("../lib/redes-persona.js");
  Pf = await import("../lib/perfil.js");
  P = (await import("../plugins/misredes.js")).default;
  for (const [n, nombre] of [[901, "Ana"], [902, "Beto"], [903, "Caro"]]) F.initDataDB({ chat: G, sender: L(n), senderJid: "", pushName: nombre });
});
async function correr(sender, text, { quien = null, isAdmin = false, isOwner = false, chat = G } = {}) {
  globalThis.enviados = [];
  await P.run({ chat, sender, senderJid: "", text, mentionedJid: quien ? [quien] : [], isGroup: true }, { client: globalThis.client, text, participants, isAdmin, isOwner });
  return ultimoEnviado()?.msg ?? {};
}

test("valorDe: el usuario se vuelve link en cada red, el link se valida por dominio, Discord es texto y Mastodon lleva instancia", () => {
  const casos = [
    ["instagram", "@xuru", "https://instagram.com/xuru"],
    ["instagram", "xuru", "https://instagram.com/xuru"],
    ["instagram", "https://www.instagram.com/xuru/", "https://www.instagram.com/xuru/"],
    ["x", "@xuru", "https://x.com/xuru"],
    ["x", "https://twitter.com/xuru", "https://twitter.com/xuru"],
    ["tiktok", "@xuru", "https://tiktok.com/@xuru"],
    ["threads", "xuru", "https://threads.net/@xuru"],
    ["bluesky", "xuru", "https://bsky.app/profile/xuru.bsky.social"],
    ["bluesky", "xuru.uy", "https://bsky.app/profile/xuru.uy"],
    ["mastodon", "@xuru@mastodon.social", "https://mastodon.social/@xuru"],
    ["mastodon", "https://mstdn.uy/@xuru", "https://mstdn.uy/@xuru"],
    ["youtube", "@xuru", "https://youtube.com/@xuru"],
    ["twitch", "xuru", "https://twitch.tv/xuru"],
    ["github", "xuru", "https://github.com/xuru"],
    ["steam", "xuru", "https://steamcommunity.com/id/xuru"],
    ["linkedin", "xuru", "https://linkedin.com/in/xuru"],
    ["telegram", "@xuru", "https://t.me/xuru"],
    ["spotify", "https://open.spotify.com/user/xuru", "https://open.spotify.com/user/xuru"],
    ["discord", "xuru", "xuru"],
    ["discord", "@xuru.uy", "xuru.uy"],
    ["discord", "Xuru#1234", "Xuru#1234"],
    ["web", "https://xuru.uy", "https://xuru.uy"],
  ];
  for (const [red, texto, valor] of casos) assert.deepEqual(RP.valorDe(red, texto), { valor }, `${red} ${texto}`);
  assert.deepEqual(RP.valorDe("instagram", "https://tiktok.com/@xuru"), { error: "Ese link no es de Instagram: tiene que ser de instagram.com." });
  assert.deepEqual(RP.valorDe("instagram", ""), { error: "Pasame tu usuario o el link: .misredes instagram @usuario" });
  assert.deepEqual(RP.valorDe("instagram", "mi usuario"), { error: "Pasame tu usuario o el link: .misredes instagram @usuario" });
  assert.deepEqual(RP.valorDe("discord", "https://discord.gg/xuru"), { error: "Pasame tu usuario de Discord, sin link: .misredes discord usuario" });
  assert.deepEqual(RP.valorDe("mastodon", "@xuru"), { error: "Pasame tu usuario de Mastodon con su instancia (@usuario@instancia) o el link." });
  assert.deepEqual(RP.valorDe("web", "xuru.uy"), { error: "Pasame el link completo, con https://: .misredes web https://…" });
  assert.deepEqual(RP.valorDe("web", `https://xuru.uy/${"a".repeat(200)}`), { error: "Muy largo: como mucho 200 caracteres." });
  for (const [palabra, red] of [["Insta", "instagram"], ["twitter", "x"], ["bsky", "bluesky"], ["Página", "web"], ["masto", "mastodon"], ["mastodon", "mastodon"]]) assert.equal(RP.leerRedPersona(palabra), red, palabra);
  assert.equal(RP.leerRedPersona("myspace"), null);
});

test("fijar, listar y borrar las propias: por grupo, y .perfil las muestra en una línea", () => {
  const H = "otro@g.us";
  F.initDataDB({ chat: H, sender: L(901), senderJid: "", pushName: "Ana" });
  assert.deepEqual(RP.fijarRedPersona(L(901), G, "instagram", "@xuru"), { ok: true, red: "instagram", valor: "https://instagram.com/xuru", mensaje: "📸 Listo: tu Instagram quedó en tu perfil de este grupo: https://instagram.com/xuru" });
  assert.equal(RP.fijarRedPersona(L(901), G, "discord", "xuru").mensaje, "👾 Listo: tu Discord quedó en tu perfil de este grupo: Discord: xuru");
  assert.equal(RP.fijarRedPersona(L(901), G, "x", "@xuru").ok, true);
  assert.equal(RP.fijarRedPersona(L(901), G, "myspace", "xuru").error, `No conozco esa red. Las que van: ${TODAS}.`);
  assert.deepEqual(RP.redesPersonaDe(L(901), G), { instagram: "https://instagram.com/xuru", x: "https://x.com/xuru", discord: "xuru" });
  assert.deepEqual(RP.redesPersonaDe(L(901), H), {}, "son por grupo");
  assert.equal(RP.textoRedesPersona(L(901), G, { esPropio: true }), "🔗 *Tus redes en este grupo*\n📸 Instagram: https://instagram.com/xuru\n🐦 X: https://x.com/xuru\n👾 Discord: xuru");
  assert.equal(RP.textoRedesPersona(L(901), G), "🔗 *Redes de Ana en este grupo*\n📸 Instagram: https://instagram.com/xuru\n🐦 X: https://x.com/xuru\n👾 Discord: xuru");
  assert.equal(RP.textoRedesPersona(L(901), H, { esPropio: true }), `🔗 No tenés redes cargadas en este grupo. Cargá una con .misredes instagram @usuario (o el link). Van: ${TODAS}.`);
  assert.equal(RP.textoRedesPersona(L(901), H), "🔗 Ana no tiene redes cargadas en este grupo.");
  assert.equal(RP.lineaDeRedes(L(901), G), "🔗 📸 instagram.com/xuru · 🐦 x.com/xuru · 👾 Discord: xuru");
  assert.match(Pf.textoPerfil(G, L(901), F.getUser(L(901)), true).texto, /\n🔗 📸 instagram\.com\/xuru · 🐦 x\.com\/xuru · 👾 Discord: xuru(\n|$)/);
  assert.doesNotMatch(Pf.textoPerfil(H, L(901), F.getUser(L(901)), true).texto, /🔗/);
  assert.deepEqual(RP.borrarRedPersona(L(901), G, "twitter"), { ok: true, red: "x", mensaje: "🗑️ Listo, saqué tu X de este grupo.", mensajeAjeno: "🗑️ Listo, le saqué el X a Ana en este grupo." });
  assert.equal(RP.borrarRedPersona(L(901), G, "x").error, "No hay X cargado en este grupo.");
  assert.equal(RP.borrarRedPersona(L(901), G, "").error, `¿Cuál saco? .misredes borrar instagram, o .misredes borrar todo. Van: ${TODAS}.`);
  assert.deepEqual(RP.borrarRedPersona(L(901), G, "todo"), { ok: true, red: null, mensaje: "🗑️ Listo, saqué todas tus redes de este grupo.", mensajeAjeno: "🗑️ Listo, le saqué todas las redes a Ana en este grupo." });
  assert.deepEqual(RP.redesPersonaDe(L(901), G), {});
  assert.equal(RP.borrarRedPersona(L(901), G, "todo").error, "No hay redes cargadas en este grupo.");
});

test(".misredes: las propias se cargan, se ven y se sacan; las de otro se ven por nombre, nadie se las carga y un admin se las saca", async () => {
  assert.match((await correr(L(903), "")).text, /^🔗 No tenés redes cargadas en este grupo\./);
  assert.equal((await correr(L(903), "instagram @caro")).text, "📸 Listo: tu Instagram quedó en tu perfil de este grupo: https://instagram.com/caro");
  assert.equal((await correr(L(903), "tiktok https://tiktok.com/@caro")).text, "🎵 Listo: tu TikTok quedó en tu perfil de este grupo: https://tiktok.com/@caro");
  assert.equal((await correr(L(903), "instagram https://x.com/caro")).text, "❌ Ese link no es de Instagram: tiene que ser de instagram.com.");
  assert.equal((await correr(L(903), "myspace caro")).text, `❌ No conozco esa red. Las que van: ${TODAS}.`);
  assert.equal((await correr(L(903), "")).text, "🔗 *Tus redes en este grupo*\n📸 Instagram: https://instagram.com/caro\n🎵 TikTok: https://tiktok.com/@caro");
  // someone else's: named and not tagged; nobody loads them for them; only an admin takes one out
  const deCaro = await correr(L(901), "@903", { quien: L(903) });
  assert.equal(deCaro.text, "🔗 *Redes de Caro en este grupo*\n📸 Instagram: https://instagram.com/caro\n🎵 TikTok: https://tiktok.com/@caro");
  assert.equal(deCaro.mentions, undefined);
  assert.equal((await correr(L(901), "@903 instagram @otra", { quien: L(903) })).text, "🔗 Las redes de otra persona no se le cargan: cada uno carga las suyas con .misredes. Un admin se las puede sacar con .misredes borrar <red> @persona.");
  assert.equal((await correr(L(901), "borrar instagram @903", { quien: L(903) })).text, "🔗 Las redes de otra persona se las saca un admin. Las tuyas, con .misredes borrar <red>.");
  assert.equal((await correr(L(902), "borrar instagram @903", { quien: L(903), isAdmin: true })).text, "🗑️ Listo, le saqué el Instagram a Caro en este grupo.");
  assert.equal((await correr(L(902), "@903 borrar instagram", { quien: L(903), isAdmin: true })).text, "❌ No hay Instagram cargado en este grupo.");
  assert.deepEqual(RP.redesPersonaDe(L(903), G), { tiktok: "https://tiktok.com/@caro" });
  assert.equal((await correr(L(903), "sacar todo")).text, "🗑️ Listo, saqué todas tus redes de este grupo.");
  assert.equal((await correr(L(901), "@903", { quien: L(903) })).text, "🔗 Caro no tiene redes cargadas en este grupo.");
  // naming oneself is one's own, and Claudia has none of her own
  assert.match((await correr(L(901), "@901", { quien: L(901) })).text, /^🔗 No tenés redes cargadas en este grupo\./);
  assert.equal((await correr(L(901), "@bot", { quien: globalThis.client.user.lid })).text, "❌ Esa soy yo: mis redes son las del grupo, .redes.");
});

test(".misredes es de los grupos, está entre los extras y el menú la nombra, junto con el perfil", async () => {
  const fs = await import("node:fs");
  const { secciones } = await import("../lib/secciones.js");
  assert.deepEqual([P.onlyGroup, P.onlyAdmin, P.onlyMod], [true, undefined, undefined]);
  assert.ok(secciones.extras.includes("misredes"));
  const menu = fs.readFileSync(new URL("../lib/menu.js", import.meta.url), "utf8");
  assert.match(menu, /\n▸ \$\{usedPrefix\}misredes instagram @usuario 🔗 – /);
  assert.match(menu, /cumple, redes, reputación/);
});
