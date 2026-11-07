import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepararBase } from "./helpers.mjs";
import txt from "../lib/strings.js";

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
  globalThis.plugins = {};
  console.log = () => {}; // each reload says so
});
after(() => {
  console.log = logReal;
});

// The plugin as the bot has it after the file was saved: a module of its own (recargarPlugin, load-functions.js).
async function recargar(archivo) {
  await L.recargarPlugin(archivo, "change", PLUGINS);
  return globalThis.plugins[archivo.replace(".js", "")];
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
