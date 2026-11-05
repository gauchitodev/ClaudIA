import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado, esperar } from "./helpers.mjs";

// Sharing one's profile on a network with the group (lib/redes-persona.js, tarjetaPedida): .ig @usuario, .tt @usuario
// and the commands of the other networks, with the username or the link; someone mentioned gets theirs as loaded with
// .misredes; alone, one's own. .tt and .igdl still download a video's link.
let F, RP, Ig, Tt, Igdl, Red, Y;
const L = (n) => `${n}@lid`;
const participants = [{ id: L(951), admin: null }, { id: L(952), admin: null }];
before(async () => {
  ({ F } = await prepararBase("tarjetas-de-redes"));
  globalThis.txt = (await import("../lib/strings.js")).default;
  RP = await import("../lib/redes-persona.js");
  Y = await import("../lib/ytdlp.js");
  Ig = (await import("../plugins/insta-usuario.js")).default;
  Tt = (await import("../plugins/dl-tiktok.js")).default;
  Igdl = (await import("../plugins/dl-instagram.js")).default;
  Red = (await import("../plugins/tarjeta-red.js")).default;
  F.initDataDB({ chat: G, sender: L(951), senderJid: "", pushName: "Ana" });
  F.initDataDB({ chat: G, sender: L(952), senderJid: "", pushName: "Beto" });
  // yt-dlp never runs here: a download fails at once, and the plugin's download path is what's checked.
  Y._dep.ejecutar = async () => {
    throw Object.assign(new Error("Command failed"), { stderr: "no en los tests" });
  };
  Y._dep.esperar = async () => {};
});
// A plugin run as the dispatcher would: what it sent as text, reacted and sent as a file (the card with its picture).
async function correr(P, text, { sender = L(951), quien = null, command = P.cmd[0] } = {}) {
  globalThis.enviados = [];
  const reacciones = [];
  const archivos = [];
  const client = { ...globalThis.client, sendFile: async (chat, archivo, nombre, caption) => (archivos.push({ archivo, caption }), {}) };
  await P.run({ chat: G, sender, senderJid: "", text, mentionedJid: quien ? [quien] : [], isGroup: true, react: async (e) => reacciones.push(e) }, { client, text, command, participants });
  return { msg: ultimoEnviado()?.msg ?? {}, reacciones, archivos };
}
const m = (sender = L(951), quien = null) => ({ chat: G, sender, senderJid: "", mentionedJid: quien ? [quien] : [], isGroup: true });

test("tarjetaPedida: el usuario o el link dan la tarjeta; la mención, la de esa persona; nada, la propia o el uso", async () => {
  const pedir = (red, text, extra = {}) => RP.tarjetaPedida(red, { client: globalThis.client, m: m(extra.sender, extra.quien), text, participants, comando: extra.comando || red, uso: "USO." });
  assert.deepEqual(await pedir("instagram", "@carlos_planchon", { comando: "ig" }), { texto: "📸 *Instagram de @951*\n👤 @carlos_planchon\n🔗 https://instagram.com/carlos_planchon", mentions: [L(951)] });
  assert.deepEqual(await pedir("instagram", "https://www.instagram.com/carlos_planchon/"), { texto: "📸 *Instagram de @951*\n👤 @carlos_planchon\n🔗 https://www.instagram.com/carlos_planchon/", mentions: [L(951)] });
  assert.deepEqual(await pedir("bluesky", "carlos"), { texto: "🦋 *Bluesky de @951*\n👤 @carlos.bsky.social\n🔗 https://bsky.app/profile/carlos.bsky.social", mentions: [L(951)] });
  assert.deepEqual(await pedir("mastodon", "@carlos@mastodon.social"), { texto: "🐘 *Mastodon de @951*\n👤 @carlos\n🔗 https://mastodon.social/@carlos", mentions: [L(951)] });
  // someone mentioned: what they loaded with .misredes, or that they loaded none
  RP.fijarRedPersona(L(952), G, "instagram", "@beto");
  assert.deepEqual(await pedir("instagram", "@952", { quien: L(952) }), { texto: "📸 *Instagram de @952*\n👤 @beto\n🔗 https://instagram.com/beto", mentions: [L(952)] });
  assert.deepEqual(await pedir("tiktok", "@952", { quien: L(952) }), { texto: "🎵 Beto no tiene TikTok cargado en este grupo: se carga con .misredes tiktok @usuario." });
  // nothing: one's own, loaded the same way, or how it's used
  RP.fijarRedPersona(L(951), G, "x", "@ana");
  assert.deepEqual(await pedir("x", ""), { texto: "🐦 *X de @951*\n👤 @ana\n🔗 https://x.com/ana", mentions: [L(951)] });
  assert.deepEqual(await pedir("mastodon", "", { comando: "mastodon" }), { texto: "🐘 USO. Si lo cargás con .misredes mastodon @usuario, después alcanza con .mastodon solo." });
  // what isn't a username nor a link, named by the command typed, and a video where a channel was asked for
  assert.deepEqual(await pedir("instagram", "mi usuario", { comando: "ig" }), { texto: "❌ Pasame tu usuario o el link: .ig @usuario" });
  assert.deepEqual(await pedir("youtube", "https://youtu.be/abc123", { comando: "yt" }), { texto: "▶️ Eso es un video: para bajarlo, .video <link> (o .play, el audio). Para mandar tu canal: .yt @usuario" });
  assert.deepEqual(await pedir("youtube", "@carlos", { comando: "yt" }), { texto: "▶️ *YouTube de @951*\n👤 @carlos\n🔗 https://youtube.com/@carlos", mentions: [L(951)] });
  F.updateUserInGroup(L(951), G, { redes: {} });
  F.updateUserInGroup(L(952), G, { redes: {} });
});

test(".ig: la tarjeta con su foto por el usuario, con mención la de esa persona, y sola el uso", async () => {
  const conUsuario = await correr(Ig, "@carlos_planchon");
  assert.deepEqual(conUsuario.reacciones, ["🤳"]);
  assert.equal(conUsuario.archivos.length, 1);
  assert.equal(conUsuario.archivos[0].archivo, "https://telegra.ph/file/1af5d76a06d74180fac0d.jpg");
  assert.equal(conUsuario.archivos[0].caption, "📸 *Instagram de @951*\n👤 @carlos_planchon\n🔗 https://instagram.com/carlos_planchon");
  assert.equal(conUsuario.msg.text, undefined, "la tarjeta va con la foto, no como texto aparte");
  const sola = await correr(Ig, "");
  assert.deepEqual(sola.reacciones, []);
  assert.equal(sola.msg.text, "📸 Pasame tu usuario o el link de tu Instagram: .ig @usuario. Si lo cargás con .misredes instagram @usuario, después alcanza con .ig solo.");
  RP.fijarRedPersona(L(952), G, "instagram", "@beto");
  try {
    assert.equal((await correr(Ig, "@952", { quien: L(952) })).archivos[0].caption, "📸 *Instagram de @952*\n👤 @beto\n🔗 https://instagram.com/beto");
    assert.equal((await correr(Ig, "", { sender: L(952) })).archivos[0].caption, "📸 *Instagram de @952*\n👤 @beto\n🔗 https://instagram.com/beto", "sola, la propia");
  } finally {
    F.updateUserInGroup(L(952), G, { redes: {} });
  }
});

test(".tt y .igdl: con un usuario o el link de un perfil, la tarjeta; con el link de un video, la descarga de siempre", async () => {
  assert.deepEqual((await correr(Tt, "@carlos_planchon")).msg, { text: "🎵 *TikTok de @951*\n👤 @carlos_planchon\n🔗 https://tiktok.com/@carlos_planchon", mentions: [L(951)] });
  assert.match((await correr(Tt, "https://www.tiktok.com/@carlos_planchon")).msg.text, /^🎵 \*TikTok de @951\*\n👤 @carlos_planchon\n🔗 https:\/\/www\.tiktok\.com\/@carlos_planchon$/);
  assert.equal((await correr(Tt, "")).msg.text, "🎵 Pasame el link de un TikTok para bajarlo, o tu usuario para mandar tu perfil: .tt @usuario. Si lo cargás con .misredes tiktok @usuario, después alcanza con .tt solo.");
  assert.equal((await correr(Tt, "https://youtube.com/watch?v=x", { command: "tiktok" })).msg.text, "❌ Ese link no es de TikTok: tiene que ser de tiktok.com.");
  assert.equal((await correr(Tt, "https://www.tiktok.com/tag/futbol")).msg.text, "❌ Ese link no es de un video: colecciones o hashtags enteros no los bajo. Mandame el link de un TikTok en particular, o un usuario (.tt @usuario) para mandar su perfil.");
  const video = await correr(Tt, "https://www.tiktok.com/@a/video/7681414892942839071");
  assert.deepEqual(video.reacciones, ["⏳"], "el link de un video sigue yendo a la descarga");
  assert.doesNotMatch(video.msg.text || "", /TikTok de/);
  await esperar(80); // the download fails at once and says so; let it land before the next check

  assert.deepEqual((await correr(Igdl, "@carlos_planchon")).msg, { text: "📸 *Instagram de @951*\n👤 @carlos_planchon\n🔗 https://instagram.com/carlos_planchon", mentions: [L(951)] });
  assert.equal((await correr(Igdl, "", { command: "instagram" })).msg.text, "📸 Pasame el link de un post o un reel para bajarlo, o tu usuario para mandar tu perfil: .instagram @usuario. Si lo cargás con .misredes instagram @usuario, después alcanza con .instagram solo.");
  const post = await correr(Igdl, "https://www.instagram.com/reel/C7Cv2zGtqGh/");
  assert.deepEqual(post.reacciones, ["⏳"], "el link de un reel sigue yendo a la descarga");
  await esperar(80);
});

test("los comandos de las otras redes: .x, .github, .bsky, .tg y compañía, cada uno con su red", async () => {
  assert.deepEqual((await correr(Red, "@carlos_planchon", { command: "x" })).msg, { text: "🐦 *X de @951*\n👤 @carlos_planchon\n🔗 https://x.com/carlos_planchon", mentions: [L(951)] });
  assert.equal((await correr(Red, "carlos", { command: "twitter" })).msg.text, "🐦 *X de @951*\n👤 @carlos\n🔗 https://x.com/carlos");
  assert.equal((await correr(Red, "carlos", { command: "github" })).msg.text, "🐙 *GitHub de @951*\n👤 @carlos\n🔗 https://github.com/carlos");
  assert.equal((await correr(Red, "carlos", { command: "bsky" })).msg.text, "🦋 *Bluesky de @951*\n👤 @carlos.bsky.social\n🔗 https://bsky.app/profile/carlos.bsky.social");
  assert.equal((await correr(Red, "@carlos", { command: "tg" })).msg.text, "✈️ *Telegram de @951*\n👤 @carlos\n🔗 https://t.me/carlos");
  assert.equal((await correr(Red, "", { command: "steam" })).msg.text, "🎮 Pasame tu usuario o el link de tu Steam: .steam @usuario. Si lo cargás con .misredes steam @usuario, después alcanza con .steam solo.");
  assert.equal((await correr(Red, "https://youtu.be/abc", { command: "yt" })).msg.text, "▶️ Eso es un video: para bajarlo, .video <link> (o .play, el audio). Para mandar tu canal: .yt @usuario");
  assert.equal((await correr(Red, "https://tiktok.com/@x", { command: "facebook" })).msg.text, "❌ Ese link no es de Facebook: tiene que ser de facebook.com o fb.com o fb.me.");
  // every command answers to a network of the catalog, and they're all among the extras, with the menu's line
  const fs = await import("node:fs");
  const { secciones } = await import("../lib/secciones.js");
  for (const c of Red.cmd) assert.ok(RP.leerRedPersona(c), c);
  assert.ok(Red.cmd.every((c) => secciones.extras.includes(c)));
  const menu = fs.readFileSync(new URL("../lib/menu.js", import.meta.url), "utf8");
  assert.match(menu, /\n▸ \$\{usedPrefix\}x @usuario 🐦 – /);
  assert.match(menu, /\n▸ \$\{usedPrefix\}ig @usuario 🤳 – /);
});
