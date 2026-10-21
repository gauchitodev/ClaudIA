import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { prepararBase, G, clienteFalso, ultimoEnviado, fijarSaldo, esperar } from "./helpers.mjs";
import strings from "../lib/strings.js";

// .play / .video (plugins/dl-youtube.js) with a fake yt-dlp. .playya and .videoya charge for skipping the wait and
// didn't give it back when nothing came out; and when the "here you go" after a song failed, the next candidate was
// downloaded, sent and paid for again.

let F, D, COINS;
const YO = "yo@lid";
let resultados = []; // what the YouTube search finds: [{ title, id, thumbnail? }]
let bajadaFalla = false;
const logReal = console.log;
const errorReal = console.error;

before(async () => {
  ({ F } = await prepararBase("descargas-youtube"));
  globalThis.txt = strings;
  console.log = () => {};
  console.error = () => {};
  fs.mkdirSync("tmp", { recursive: true });
  F.initDataDB({ chat: G, sender: YO, senderJid: "", pushName: "Yo" });
  D = await import("../plugins/dl-youtube.js");
  ({ COINS } = await import("../lib/urucoins.js"));
  // Searches answer a JSON line per result (nothing on SoundCloud); a download creates the file it was asked for
  // with -o, or fails the way YouTube does.
  D._dep.ejecutar = async (bin, args) => {
    if (args[0].startsWith("scsearch")) return { stdout: "", stderr: "" };
    if (args[0].startsWith("ytsearch")) {
      const lineas = resultados.map((r) => JSON.stringify({ title: r.title, webpage_url: `https://www.youtube.com/watch?v=${r.id}`, thumbnail: r.thumbnail ?? null, id: r.id }));
      return { stdout: lineas.join("\n"), stderr: "" };
    }
    if (bajadaFalla) return { stdout: "", stderr: "ERROR: Sign in to confirm you're not a bot" };
    fs.writeFileSync(args[args.indexOf("-o") + 1].replace("%(ext)s", "m4a"), "audio");
    return { stdout: "", stderr: "" };
  };
});
after(() => {
  console.log = logReal;
  console.error = errorReal;
});
beforeEach(() => {
  resultados = [];
  bajadaFalla = false;
});

// The download runs in the global queue, after the command answers.
async function terminarCola() {
  for (let i = 0; i < 200 && (globalThis.colaDescargas.procesando || globalThis.colaDescargas.tareas.length); i++) await esperar(5);
}
async function pedir(command, { enEspera = true } = {}) {
  const m = { chat: G, sender: YO, isGroup: true, react: () => {} };
  const user = { lastmining: enEspera ? Date.now() : 0, commandAttempts: 0 };
  await D.default.run(m, { client: globalThis.client, args: ["tema"], text: "tema", isOwner: false, command, user, groupMetadata: { participants: [] } });
  await terminarCola();
  return ultimoEnviado().msg.text;
}

test(".playya: si no encuentra nada, devuelve lo que cobró por saltar la espera", async () => {
  fijarSaldo(F, G, YO, 20);
  assert.equal(await pedir("playya"), `❌ No encontré resultados para eso en YouTube. Probá con otro título.\n🪙 Te devolví los ${COINS.SALTAR_COOLDOWN} UruCoins de saltar la espera.`);
  assert.equal(F.getSaldoCoins(G, YO), 20);
});

test(".videoya: si ninguna opción baja, devuelve lo cobrado y ofrece reintentar", async () => {
  resultados = [{ title: "Gol de Suárez", id: "ccccccccccc" }];
  bajadaFalla = true;
  fijarSaldo(F, G, YO, 20);
  assert.match(await pedir("videoya"), new RegExp(`ninguna se pudo descargar\\. Probá con otro título o de nuevo más tarde\\.\\n🪙 Te devolví los ${COINS.SALTAR_COOLDOWN} UruCoins de saltar la espera\\.\\n\\n🔁 Si querés, mandá \\.reintentar`));
  assert.equal(F.getSaldoCoins(G, YO), 20);
});

test("sin pagar no hay nada que devolver, y si el aviso de la falla no sale, devuelve una sola vez", async () => {
  fijarSaldo(F, G, YO, 20);
  assert.doesNotMatch(await pedir("play", { enEspera: false }), /Te devolví/);
  assert.equal(F.getSaldoCoins(G, YO), 20);

  // The failure notice can't be sent: the outer catch fails a second time.
  resultados = [{ title: "Gol de Suárez", id: "ccccccccccc" }];
  bajadaFalla = true;
  const client = { ...clienteFalso(), sendText: async () => { throw new Error("se cortó"); } };
  await D.descargarMultimedia({ client, chat: G, usuario: YO, texto: "gol", tipo: "video", pagoPorSaltar: COINS.SALTAR_COOLDOWN }).catch(() => {});
  assert.equal(F.getSaldoCoins(G, YO), 20 + COINS.SALTAR_COOLDOWN);
});

test("si el ✅ no sale, el tema ya se mandó: no baja otro ni paga dos veces", async () => {
  resultados = [
    { title: "Cielito lindo - Los Panchos", id: "aaaaaaaaaaa" },
    { title: "Cielito lindo - Los Panchos (en vivo)", id: "bbbbbbbbbbb" },
  ];
  fijarSaldo(F, G, YO, 0);
  const client = {
    ...clienteFalso(),
    sendText: async (chat, text) => {
      if (text.startsWith("✅")) throw new Error("se cortó");
      globalThis.enviados.push({ chat, msg: { text } });
      return { key: { id: "X" } };
    },
  };
  assert.equal(await D.descargarMultimedia({ client, chat: G, usuario: YO, texto: "cielito lindo", tipo: "audio" }), true);
  assert.equal(globalThis.enviados.filter((e) => e.msg?.audio).length, 1, "un solo audio");
  assert.equal(F.getSaldoCoins(G, YO), COINS.MUSICA, "una sola paga por la música");
});

// The joke when a song has to wait: it's "in the queue" of someone in the group, never the bot nor whoever asked. A group
// that lists people by number names both by it, with the LID apart, and the joke used to pick either of them there.
test("la cola de .play no se la cuelga al bot ni a quien pidió, aunque el grupo los liste por número", async () => {
  const { encolarDescarga } = await import("../lib/cola-descargas.js");
  let soltar;
  encolarDescarga(() => new Promise((resolve) => (soltar = resolve)));
  const bot = globalThis.client.user;
  const participants = [
    { id: bot.jid, lid: bot.lid, admin: "admin" },
    { id: "59899000071@s.whatsapp.net", lid: YO, admin: null },
  ];
  const m = { chat: G, sender: YO, senderJid: "59899000071@s.whatsapp.net", isGroup: true, react: () => {} };
  await D.default.run(m, { client: globalThis.client, args: ["tema"], text: "tema", isOwner: false, command: "play", user: { lastmining: 0, commandAttempts: 0 }, groupMetadata: { participants } });
  assert.match(ultimoEnviado().msg.text, /^⏳ Tu descarga está en la cola\. Hay 1 antes que la tuya/);
  soltar();
  await terminarCola();
});

// The searches used to print four lines per result, read by position: a title with a line break moved the fields up,
// and whatever landed in the thumbnail's place went to sendFile, which reads any local file that exists.
test("búsquedas: un resultado por línea JSON, y el link y la miniatura solo valen si son https", () => {
  const salida = [
    "WARNING: [soundcloud] algo",
    JSON.stringify({ title: "Tema\nfalso", webpage_url: "https://soundcloud.com/a/b", thumbnail: "config.toml", id: "1" }),
    JSON.stringify({ title: "Otro", webpage_url: "config.toml", thumbnail: "https://i1.sndcdn.com/x.jpg", id: "2" }),
    JSON.stringify({ title: "Bien", webpage_url: "https://soundcloud.com/c/d", thumbnail: "https://i1.sndcdn.com/y.jpg", id: "3" }),
    "{roto",
  ].join("\n");
  assert.deepEqual(D.parsearResultados(salida, "soundcloud"), [
    { title: "Tema falso", url: "https://soundcloud.com/a/b", thumbnail: "", fuente: "soundcloud" },
    { title: "Bien", url: "https://soundcloud.com/c/d", thumbnail: "https://i1.sndcdn.com/y.jpg", fuente: "soundcloud" },
  ]);
  const deYoutube = JSON.stringify({ title: "T", webpage_url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", thumbnail: "config.toml", id: "aaaaaaaaaaa" });
  assert.equal(D.parsearResultados(deYoutube, "youtube")[0].thumbnail, "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg", "YouTube: la .jpg sacada del id");
});

test("el aviso de envío no le pasa a sendFile nada que no sea un link", async () => {
  fs.writeFileSync("config.toml", 'geminiApiKey = "secreta"'); // in the test's temp folder, not the repo's
  resultados = [{ title: "Tema raro", id: "corto", thumbnail: "config.toml" }]; // not an 11-character id: the field is used
  const antes = globalThis.enviados.length;
  await D.descargarMultimedia({ client: globalThis.client, chat: G, usuario: YO, texto: "tema raro", tipo: "audio" });
  const nuevos = globalThis.enviados.slice(antes);
  assert.ok(!nuevos.some((e) => "archivo" in e), "sendFile no se usó");
  assert.match(nuevos[0].msg.text, /^Tema raro\n/, "el aviso salió como texto");
});
