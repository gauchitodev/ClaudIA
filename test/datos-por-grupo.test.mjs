import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prepararBase, G } from "./helpers.mjs";
import strings from "../lib/strings.js";

// A person's data in each group (users.inGroup: messages, rank, AFK, mute, warnings) lives in a single JSON column.
// handle-message reads the person once, when the message arrives, and hands that copy to every hook. The hooks used to
// write the whole copy back, so whatever changed while the message was being handled went with it: a .silenciar or an
// .adv given meanwhile was undone, a second message from the same person counted over the same old number, and the
// rank promotion was paid twice. The window is wide: a hook that sends something waits its turn (lib/ritmo.js) before
// the hooks after it run.

let F, Conteo, Rangos, Afk, AfkCmd;
const DIA = 24 * 60 * 60 * 1000;
before(async () => {
  ({ F } = await prepararBase("datos-por-grupo"));
  globalThis.txt = strings;
  Conteo = (await import("../plugins/_messsage-count.js")).default;
  Rangos = (await import("../plugins/_rangos.js")).default;
  Afk = (await import("../plugins/_afk.js")).default;
  AfkCmd = (await import("../plugins/afk.js")).default;
});
const persona = (n) => ({ chat: G, sender: `${n}@lid`, senderJid: `${n}@s.whatsapp.net`, pushName: `Persona ${n}` });
const mensaje = (n) => ({ chat: G, sender: `${n}@lid`, isGroup: true, message: { conversation: "hola" }, mentionedJid: [], quoted: null });

// A reaction, a deletion or an edit isn't a message: counted as one, reacting or deleting a lot climbed the ranks.
test("datos por grupo: las reacciones, los borrados y las ediciones no cuentan como mensajes", async () => {
  F.initDataDB(persona(222));
  const contar = (mtype) => Conteo.before({ chat: G, sender: "222@lid", isGroup: true, message: { [mtype]: {} }, mtype }, { client: globalThis.client, user: F.getUser("222@lid", G) });
  for (const mtype of ["reactionMessage", "protocolMessage", "editedMessage", "pollUpdateMessage"]) await contar(mtype);
  assert.equal(F.getUser("222@lid").inGroup[G].messageCount, 0);
  for (const mtype of ["conversation", "stickerMessage", "imageMessage"]) await contar(mtype);
  assert.equal(F.getUser("222@lid").inGroup[G].messageCount, 3);
});

test("datos por grupo: contar un mensaje no deshace un .silenciar ni un .adv dados mientras tanto", async () => {
  F.initDataDB(persona(111));
  const foto = F.getUser("111@lid", G); // what handle-message hands the hooks when the message arrives
  F.updateUserInGroup("111@lid", G, { mute: true }); // .silenciar (grupo-silenciar.js) while it's being handled
  F.setAdvertencias("111@lid", G, 2); // two .adv
  await Conteo.before(mensaje(111), { client: globalThis.client, user: foto });
  const fila = F.getUser("111@lid").inGroup[G];
  assert.equal(fila.mute, true, "el silencio se deshacía");
  assert.equal(fila.warn, 2, "las advertencias se borraban");
  assert.equal(fila.messageCount, 1);
  assert.equal(foto.inGroup[G].messageCount, 1, "la copia queda al día para los hooks que siguen");
});

test("datos por grupo: dos mensajes cruzados de la misma persona cuentan los dos y pagan el ascenso una vez", async () => {
  F.initDataDB(persona(222));
  F.updateUserInGroup("222@lid", G, { messageCount: 99, desde: Date.now() - 8 * DIA, rango: "nuevo" });
  // Both copies are read before either message is handled: the first one is held up waiting for the AI, and the second
  // goes through every hook in the meantime. The hooks run in the dispatcher's order: the count, then the rank.
  const primero = F.getUser("222@lid", G);
  const segundo = F.getUser("222@lid", G);
  const saldoAntes = F.getSaldoCoins(G, "222@lid");
  for (const foto of [segundo, primero]) {
    await Conteo.before(mensaje(222), { client: globalThis.client, user: foto });
    await Rangos.before(mensaje(222), { client: globalThis.client, user: foto, chat: { monedas: 1, ascensos: 1 } });
  }
  const fila = F.getUser("222@lid").inGroup[G];
  assert.equal(fila.messageCount, 101, "se perdía uno de los dos mensajes");
  assert.equal(fila.rango, "habitue");
  assert.equal(F.getSaldoCoins(G, "222@lid") - saldoAntes, 10, "el premio de Habitué se pagaba dos veces");
});

test("datos por grupo: volver del AFK no pisa lo que cambió mientras tanto, y se anuncia una sola vez", async () => {
  F.initDataDB(persona(333));
  F.updateUserInGroup("333@lid", G, { afk: Date.now() - 60 * 1000, afkReason: "durmiendo" });
  // Two quick messages on their way, and an .adv in between.
  const primero = F.getUser("333@lid", G);
  const segundo = F.getUser("333@lid", G);
  F.setAdvertencias("333@lid", G, 1);
  const antes = globalThis.enviados.length;
  await Afk.before(mensaje(333), { client: globalThis.client, user: primero });
  await Afk.before(mensaje(333), { client: globalThis.client, user: segundo });
  assert.equal(globalThis.enviados.length - antes, 1, "el segundo mensaje volvía a anunciar que volvió");
  assert.match(globalThis.enviados.at(-1).msg.text, /durmiendo/);
  const fila = F.getUser("333@lid").inGroup[G];
  assert.equal(fila.afk, -1);
  assert.equal(fila.warn, 1, "la advertencia se borraba");
});

test("datos por grupo: .afk guarda solo lo suyo", async () => {
  F.initDataDB(persona(444));
  const foto = F.getUser("444@lid", G);
  F.updateUserInGroup("444@lid", G, { mute: true });
  await AfkCmd.run({ chat: G, sender: "444@lid", isGroup: true }, { client: globalThis.client, text: "a comer", args: ["a", "comer"], user: foto });
  const fila = F.getUser("444@lid").inGroup[G];
  assert.equal(fila.afkReason, "a comer");
  assert.ok(fila.afk > 0);
  assert.equal(fila.mute, true, "el silencio se deshacía");
});

// ---------- consistency: scanning the source ----------
// A new hook that writes the whole copy back brings the bug back without any test noticing.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const archivosDe = (carpeta) =>
  fs
    .readdirSync(path.join(RAIZ, carpeta))
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(RAIZ, carpeta, f));

test("consistencia: users.inGroup se escribe solo desde database-functions.js", () => {
  const fuentes = [...archivosDe("lib"), ...archivosDe("plugins"), path.join(RAIZ, "main.js"), path.join(RAIZ, "handle-message.js")];
  assert.ok(fuentes.length > 100, `se encontraron muy pocos archivos (${fuentes.length}): el escaneo no está andando`);
  const escriben = fuentes.filter((archivo) => /inGroup:\s*JSON\.stringify/.test(fs.readFileSync(archivo, "utf8"))).map((archivo) => path.relative(RAIZ, archivo));
  assert.deepEqual(escriben, [], "escriben inGroup entero: tienen que usar updateUserInGroup o sumarMensajeEnGrupo");
});
