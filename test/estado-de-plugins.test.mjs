import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepararBase } from "./helpers.mjs";
import txt from "../lib/strings.js";
import { cargados } from "../lib/plugins-cargados.js";

// What a plugin keeps through a reload of its file (lib/estado-de-plugins.js). load-functions.js imports the file again
// as a new module when it changes: the round in play stayed in the old module, the new one didn't hear its answers,
// and a .cancelar found no .llamar going on.
const PLUGINS = `${path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plugins")}/`;
let E, L;
const logReal = console.log;
before(async () => {
  await prepararBase("estado-de-plugins");
  E = await import("../lib/estado-de-plugins.js");
  L = await import("../load-functions.js");
  cargados.plugins = {};
  console.log = () => {}; // each reload says so
});
after(() => {
  console.log = logReal;
});

// The plugin as the bot has it after the file was saved: a module of its own (recargarPlugin, load-functions.js).
async function recargar(archivo) {
  await L.recargarPlugin(archivo, "change", PLUGINS);
  return cargados.plugins[archivo.replace(".js", "")];
}
// A client that keeps what goes out; each message comes back with an id, as the real one's do.
function cliente() {
  const salidas = [];
  return { salidas, sendText: async (chat, texto) => (salidas.push(texto), { key: { id: `E${salidas.length}` } }) };
}
const mensaje = (chat, text, extra = {}) => ({ chat, sender: "a@lid", senderJid: "", text, isGroup: true, react: async () => {}, ...extra });

test("estadoDe da siempre el mismo objeto para el mismo nombre, y lo arma una sola vez", () => {
  let armados = 0;
  const a = E.estadoDe("prueba-a", () => (armados++, { n: 1 }));
  assert.equal(E.estadoDe("prueba-a", () => (armados++, {})), a);
  assert.equal(armados, 1);
  assert.notEqual(E.estadoDe("prueba-b", () => ({})), a, "otro nombre, otro estado");
});

for (const [archivo, respuestaDe] of [
  ["fun-banderas.js", (juego) => juego.pais],
  ["fun-acertijos.js", (juego) => juego.acertijo.respuesta],
  ["fun-ordenar-palabra.js", (juego) => juego.palabra],
]) {
  test(`${archivo}: guardado el archivo en plena ronda, la respuesta igual gana`, async () => {
    const chat = `recarga-${archivo}@g.us`;
    const client = cliente();
    const viejo = await recargar(archivo);
    await viejo.run(mensaje(chat, ""), { client });
    const nuevo = await recargar(archivo);
    assert.notEqual(nuevo, viejo, "un módulo nuevo, como al guardar el archivo");
    const rondas = E.estadoDe(archivo.replace(".js", ""), () => ({}));
    const juego = rondas[chat];
    assert.ok(juego?.mensajeId, "la ronda abierta, con su pregunta");
    await nuevo.before(mensaje(chat, respuestaDe(juego), { quoted: { id: juego.mensajeId } }), { client });
    assert.ok(client.salidas.at(-1).startsWith(txt.gameSuccess), client.salidas.at(-1));
    assert.equal(rondas[chat], undefined, "y la ronda se cerró, con su reloj");
  });
}

test("fun-ahorcado.js: guardado el archivo en plena partida, la letra igual cuenta", async (t) => {
  const chat = "recarga-ahorcado@g.us";
  const client = cliente();
  const viejo = await recargar("fun-ahorcado.js");
  await viejo.run(mensaje(chat, ""), { client });
  const partidas = E.estadoDe("fun-ahorcado", () => ({}));
  const juego = partidas["a@lid"];
  t.after(() => {
    clearTimeout(juego.timeout);
    delete partidas["a@lid"];
  });
  const nuevo = await recargar("fun-ahorcado.js");
  await nuevo.before(mensaje(chat, juego.palabra[0]), { client });
  assert.deepEqual(juego.letrasProbadas, [juego.palabra[0]], "el módulo nuevo jugó la letra en la partida abierta");
});

test("grupo-llamar.js: guardado el archivo con un .llamar en curso, .cancelar lo encuentra", async () => {
  const chat = "recarga-llamar@g.us";
  const client = cliente();
  const viejo = await recargar("grupo-llamar.js");
  await viejo.run(mensaje(chat, ".llamar"), { client, text: "", command: "llamar", participants: [], aLlamar: ["111@lid"] });
  const nuevo = await recargar("grupo-llamar.js");
  await nuevo.run(mensaje(chat, ".cancelar"), { client, text: "", command: "cancelar", participants: [] });
  assert.equal(client.salidas.at(-1), "Menciones canceladas.");
  assert.equal(E.estadoDe("grupo-llamar", () => ({}))[chat], undefined);
});

// A series of calls that ends on its own leaves the chat's calls: it used to stay, and a .cancelar afterwards said it
// had stopped them.
test("grupo-llamar.js: una serie que termina sola deja de estar en curso, y otra a medias sigue cancelable", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const chat = "llamar-termina@g.us";
    const client = cliente();
    const P = await recargar("grupo-llamar.js");
    const llamar = (quien) => P.run(mensaje(chat, ".llamar"), { client, text: "", command: "llamar", participants: [], aLlamar: [quien] });
    const cancelar = async () => (await P.run(mensaje(chat, ".cancelar"), { client, text: "", command: "cancelar", participants: [] }), client.salidas.at(-1));
    await llamar("111@lid");
    mock.timers.tick(5000);
    await llamar("222@lid"); // a second one, while the first is halfway
    mock.timers.tick(5000);
    assert.equal(client.salidas.filter((s) => s === "@111").length, 10, "la primera terminó");
    assert.equal(await cancelar(), "Menciones canceladas.", "la segunda seguía");
    await llamar("333@lid");
    mock.timers.tick(10_000);
    assert.equal(client.salidas.filter((s) => s === "@333").length, 10);
    assert.equal(await cancelar(), "No hay menciones en curso.", "terminó sola: no queda nada que cancelar");
  } finally {
    mock.timers.reset();
  }
});

// The owner's numbered list of groups (.blgrupos), which the next command goes by (.blon 1): saving the plugin's file
// left the next command without it, and it asked for the list again.
test("owner-blacklist-grupo.js: la lista de grupos que vio el owner sigue después de recargar el archivo", async () => {
  const client = { ...cliente(), chats: { "recarga-bl@g.us": { subject: "Grupo de la recarga" } }, insertAllGroup: async () => {} };
  const privado = { chat: "59899000777@s.whatsapp.net", sender: "777@lid", senderJid: "59899000777@s.whatsapp.net", isGroup: false };
  const viejo = await recargar("owner-blacklist-grupo.js");
  await viejo.run(privado, { client, text: "", chat: {}, usedPrefix: ".", command: "blgrupos" });
  const nuevo = await recargar("owner-blacklist-grupo.js");
  await nuevo.run(privado, { client, text: "1", chat: {}, usedPrefix: ".", command: "blon" });
  assert.match(client.salidas.at(-1), /Modo blacklist activado en \*Grupo de la recarga\*/);
});
