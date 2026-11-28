import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado, fijarSaldo } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";
import txt from "../lib/strings.js";

let F, M, U, A, R, Pf, Modo, Config;
before(async () => {
  ({ F } = await prepararBase("modo"));
  M = await import("../lib/modo.js");
  U = await import("../lib/urucoins.js");
  A = await import("../lib/actividad.js");
  R = await import("../lib/rangos.js");
  Pf = await import("../lib/perfil.js");
  Modo = (await import("../plugins/grupo-modo.js")).default;
  Config = (await import("../plugins/config-on-off.js")).default;
});
const persona = (n) => ({ chat: G, sender: `${n}@lid`, senderJid: `${n}@s.whatsapp.net` });
const msg = { chat: G, sender: "111@lid", isGroup: true };
const ultimo = () => ultimoEnviado().msg.text;

// Each of these three in a group of its own, which it creates: this one looks at what a group starts with, which the
// other two changed in G, and those two need a group with its row (updateChat writes on one, and without it the
// economy stays on).
test("modo: interruptores nuevos prendidos por defecto, .modo compraventa y .modo amigos", async () => {
  const chat = "modo-cambios@g.us";
  const aca = { ...msg, chat };
  F.initDataDB({ ...persona(111), chat });
  let c = F.getChat(chat);
  assert.deepEqual([c.charla, c.saludos, c.saludoCumple, c.monedas, c.ascensos, c.diversion, c.convertidores], [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(M.modoActual(c), "amigos");
  await Modo.run(aca, { client: conexion.client, text: "" });
  assert.match(ultimo(), /Modo actual: \*amigos\*\n✅ juegos · ✅ diversión · ✅ stickers y convertidores · ✅ charla de Claudia/);
  F.updateChat(chat, { iniciativa: 1, reactions: 1, diarioDesde: Date.now() }); // opt-in, like the daily question: compraventa turns them off too
  await Modo.run(aca, { client: conexion.client, text: "compraventa" });
  assert.match(ultimo(), /quedó en modo \*compraventa\*: sin juegos ni casino, sin diversión \(parejas, familias, frases como \.orsi, horóscopo, versículos, temáticas, el ranking del mes…\), sin stickers ni convertidores \(\.s, \.tts, \.qr, efectos de audio…\), sin charla/);
  assert.match(ultimo(), /sin saludo automático ni de cumpleaños, sin economía/);
  assert.match(ultimo(), /y sin recap, pregunta del día, trivia, iniciativa, reacciones ni diario\. Quedan /);
  c = F.getChat(chat);
  assert.deepEqual([c.games, c.diversion, c.convertidores, c.charla, c.saludos, c.saludoCumple, c.monedas, c.ascensos, c.recapSemanal, c.preguntaDia, c.triviaRelampago, c.iniciativa, c.reactions, c.diarioDesde], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(M.modoActual(c), "compraventa");
  await Modo.run(aca, { client: conexion.client, text: "cualquiera" });
  assert.match(ultimo(), /Modos disponibles/);
  // a single switch flipped from .config leaves it "mixto"
  await Config.run(aca, { client: conexion.client, command: "charla", isOwner: false, isAdmin: true, chat: F.getChat(chat), botSettings: {} });
  assert.match(ultimo(), /Opción: `charla`\n• Estado: Activado/);
  assert.equal(F.getChat(chat).charla, 1);
  assert.equal(M.modoActual(F.getChat(chat)), "mixto");
  await Modo.run(aca, { client: conexion.client, text: "amigos" });
  c = F.getChat(chat);
  assert.deepEqual([c.games, c.diversion, c.convertidores, c.charla, c.saludos, c.saludoCumple, c.monedas, c.ascensos, c.recapSemanal], [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  // What comes off unless a group asks for it stays off: those are turned on one by one.
  assert.deepEqual([c.preguntaDia, c.triviaRelampago, c.iniciativa, c.reactions, c.diarioDesde], [0, 0, 0, 0, 0]);
});

test("modo: con la economía apagada nada reparte coins, pero lo social sigue", () => {
  const chat = "modo-sin-economia@g.us";
  F.initDataDB({ ...persona(111), chat });
  F.updateChat(chat, { monedas: 0, ascensos: 0 });
  assert.equal(U.monedasActivas(chat), false);
  assert.equal(U.monedasActivas("sinfila@g.us"), true, "sin fila se toma como prendida");
  U.otorgarPorReaccion(chat, "111@lid", "222@lid", "MSG1");
  assert.equal(F.getSaldoCoins(chat, "111@lid") + F.getSaldoCoins(chat, "222@lid"), 0, "las reacciones no dan coins");
  let r = null;
  for (let i = 0; i < 3; i++) r = A.registrarActividad(chat, "333@lid", "hola qué tal");
  assert.deepEqual(r, { dias: 1, premio: 0 }, "la racha se cuenta pero no paga");
  assert.equal(F.getSaldoCoins(chat, "333@lid"), 0);
  assert.equal(U.juegoTerminado(chat, "111@lid"), "", "ganar un juego no paga ni agrega texto");
  assert.equal(F.getSaldoCoins(chat, "111@lid"), 0);
  F.initDataDB({ ...persona(444), chat });
  F.updateUser("444@lid", { inGroup: JSON.stringify({ [chat]: { messageCount: 100, desde: Date.now() - 8 * 24 * 3600e3, rango: "nuevo" } }) });
  const aviso = R.chequearAscenso(chat, "444@lid", F.getUser("444@lid"), Date.now(), { pagar: false });
  assert.equal(aviso.texto, "🧉 @444 subió a *Habitué* (7 días en el grupo y 100 mensajes).", "el ascenso sale sin premio");
  assert.equal(F.getSaldoCoins(chat, "444@lid"), 0);
  assert.equal(F.getUser("444@lid").inGroup[chat].rango, "habitue");
  // switched back on, the same game pays
  F.updateChat(chat, { monedas: 1 });
  assert.match(U.juegoTerminado(chat, "111@lid"), /\+10 UruCoins por ganar/);
  assert.equal(F.getSaldoCoins(chat, "111@lid"), 10);
});

test("modo: el perfil esconde la economía cuando está apagada", () => {
  const chat = "modo-perfil@g.us";
  F.initDataDB({ ...persona(111), chat });
  fijarSaldo(F, chat, "111@lid", 50);
  assert.match(Pf.textoPerfil(chat, "111@lid", F.getUser("111@lid")).texto, /🪙 50 UruCoins · puesto 1 del grupo · apuesta máxima 100\n💼 Sin laburo/);
  F.updateChat(chat, { monedas: 0 });
  const t = Pf.textoPerfil(chat, "111@lid", F.getUser("111@lid")).texto;
  assert.doesNotMatch(t, /UruCoins|laburo|racha/i);
  assert.match(t, /🌱 Nuevo/);
});

test("config: on y off fijan el interruptor, sin nada lo invierte, y otra palabra no lo toca", async () => {
  // It used to flip whatever came after the command: ".casino on" with the casino on switched it off, and on/off is
  // how the README, Claudia's manual and handle-message's own notice say to use it.
  F.initDataDB(persona(111));
  const correr = (command, args) => Config.run(msg, { client: conexion.client, command, args, usedPrefix: ".", isOwner: false, isAdmin: true, chat: F.getChat(G), botSettings: {} });
  F.updateChat(G, { casino: 1 });
  await correr("casino", ["on"]);
  assert.equal(F.getChat(G).casino, 1, ".casino on con el casino prendido lo apagaba");
  assert.match(ultimo(), /Estado: Activado \(ya estaba así\)/);
  await correr("casino", ["off"]);
  assert.equal(F.getChat(G).casino, 0);
  await correr("casino", ["OFF"]);
  assert.equal(F.getChat(G).casino, 0, "off dos veces lo deja apagado");
  await correr("casino", ["on."]);
  assert.equal(F.getChat(G).casino, 1, "con un signo pegado al final, también");
  await correr("casino", ["Off!"]);
  assert.equal(F.getChat(G).casino, 0);
  await correr("casino", ["prender"]);
  assert.equal(F.getChat(G).casino, 1);
  await correr("casino", []);
  assert.equal(F.getChat(G).casino, 0, "sin nada, lo invierte como siempre");
  await correr("casino", ["mañana"]);
  assert.equal(F.getChat(G).casino, 0, "una palabra que no es on ni off no toca nada");
  assert.match(ultimo(), /Usá \.casino on o \.casino off/);
});

// .config showed each switch's state, but some fifteen without the command that changes it ("❌ Bot reacciona" was
// .reacciones, "❌ Alertas de grupo" .detect), and nothing said how: each ✅/❌ names its command now, the owner's two
// say they're his, and the line under the heading says it's with on and off.
test(".config: cada ✅ o ❌ dice con qué comando se cambia, y arriba, que es con on y off", async () => {
  const chat = "config-comandos@g.us";
  F.initDataDB({ ...persona(111), chat });
  const VerConfig = (await import("../plugins/grupo-config.js")).default;
  await VerConfig.run({ ...msg, chat }, { client: conexion.client, groupMetadata: { id: chat, subject: "Grupo" }, chat: F.getChat(chat) });
  const texto = ultimo();
  assert.match(texto, /\n\*Configuración de grupo:\*\n_Las de ✅ y ❌ se prenden con on y se apagan con off: \.charla on, \.charla off\._\n✅ Claudia prendida en el grupo; con off, un admin la apaga del todo \(\.claudia\)\n[✅❌] BanChat /);
  const lineas = texto.split("\n").filter((l) => /^[✅❌]/.test(l));
  assert.ok(lineas.length >= 35, `muy pocas líneas con ✅ o ❌ (${lineas.length})`);
  // The switches: plugins/config-on-off.js's, and those with a plugin of their own.
  const interruptores = new Set([...Config.cmd, "claudia", "iniciativa", "changas", "espias", "encargos", "pueblo"]);
  const comandoDe = (linea) => linea.match(/ \(\.(\w+)(?:, solo el owner)?\)$/)?.[1];
  assert.deepEqual(
    lineas.filter((l) => !interruptores.has(comandoDe(l))),
    [],
    "cada una termina con el comando que la cambia",
  );
  assert.deepEqual(
    lineas.filter((l) => l.endsWith(", solo el owner)")).map(comandoDe),
    ["bc", "menciones"],
  );
});

// .antiubicacion, with or without the accent, turns the deletion of live locations on and off for the group; it comes
// off, and .config says how it is.
test(".antiubicacion: apagada por defecto, se prende y se apaga, y .config la muestra", async () => {
  const chat = "antiubicacion@g.us";
  F.initDataDB({ chat, sender: "111@lid", senderJid: "111@s.whatsapp.net" });
  assert.equal(F.getChat(chat).antiLiveLocation, 0);
  const config = (command, args) => Config.run({ ...msg, chat }, { client: conexion.client, command, args, isOwner: false, isAdmin: true, chat: F.getChat(chat), botSettings: {} });
  await config("antiubicacion", ["on"]);
  assert.match(ultimo(), /Opción: `antiubicacion`\n• Estado: Activado/);
  assert.equal(F.getChat(chat).antiLiveLocation, 1);
  // ".antiubicación" reaches it as antiubicacion: the parser takes the accent out (lib/comandos.js)
  await config("antiubicacion", ["off"]);
  assert.equal(F.getChat(chat).antiLiveLocation, 0);
  const VerConfig = (await import("../plugins/grupo-config.js")).default;
  await VerConfig.run({ ...msg, chat }, { client: conexion.client, groupMetadata: { id: chat, subject: "Grupo" }, chat: F.getChat(chat) });
  assert.match(ultimo(), /\n❌ Anti ubicación en tiempo real \(\.antiubicacion\)\n❌ Anti mensajes de ver una vez \(\.antivistaunica\)\n/);
  // .antivistaunica, the same way, and by its other name
  assert.equal(F.getChat(chat).antiViewOnce, 0);
  await config("antivistaunica", ["on"]);
  assert.match(ultimo(), /Opción: `antivistaunica`\n• Estado: Activado/);
  assert.equal(F.getChat(chat).antiViewOnce, 1);
  await VerConfig.run({ ...msg, chat }, { client: conexion.client, groupMetadata: { id: chat, subject: "Grupo" }, chat: F.getChat(chat) });
  assert.match(ultimo(), /\n✅ Anti mensajes de ver una vez \(\.antivistaunica\)\n/);
  await config("avu", ["off"]);
  assert.match(ultimo(), /Opción: `antivistaunica`\n• Estado: Desactivado/);
  await config("avu", ["on"]);
  assert.equal(F.getChat(chat).antiViewOnce, 1);
  await config("antiviewonce", ["off"]);
  assert.match(ultimo(), /Opción: `antivistaunica`\n• Estado: Desactivado/);
  assert.equal(F.getChat(chat).antiViewOnce, 0);
  await VerConfig.run({ ...msg, chat }, { client: conexion.client, groupMetadata: { id: chat, subject: "Grupo" }, chat: F.getChat(chat) });
  // the switches that had no line: the status mentions, the stickers on her own, and how the voice is set
  assert.match(ultimo(), /\n❌ Anti menciones del grupo en estados \(\.antiestados\)\n✅ Stickers por su cuenta \(\.respuestastickers\)\n🎙️ Voz: apagada \(\.voz\)\n/);
  await config("antiestados", ["on"]);
  F.updateChat(chat, { voz: "aveces", stickersAuto: 0 });
  await VerConfig.run({ ...msg, chat }, { client: conexion.client, groupMetadata: { id: chat, subject: "Grupo" }, chat: F.getChat(chat) });
  assert.match(ultimo(), /\n✅ Anti menciones del grupo en estados \(\.antiestados\)\n❌ Stickers por su cuenta \(\.respuestastickers\)\n🎙️ Voz: a veces \(\.voz\)\n/);
});

// .antiflood, the same way: off unless the group turns it on, an admin's to turn and not a moderator's, and .config says
// how it is, with the limit, right under the view-once line (lib/antiflood.js, plugins/_antiflood.js).
test(".antiflood: apagada por defecto, la prende y la apaga un admin, y .config la muestra con su límite", async () => {
  const chat = "antiflood@g.us";
  F.initDataDB({ chat, sender: "111@lid", senderJid: "111@s.whatsapp.net" });
  assert.equal(F.getChat(chat).antiFlood, 0);
  assert.ok(Config.cmd.includes("antiflood"));
  const config = (args, quien = { isAdmin: true }) => Config.run({ ...msg, chat }, { client: conexion.client, command: "antiflood", args, isOwner: false, isAdmin: false, ...quien, chat: F.getChat(chat), botSettings: {} });
  const VerConfig = (await import("../plugins/grupo-config.js")).default;
  const panel = async () => {
    await VerConfig.run({ ...msg, chat }, { client: conexion.client, groupMetadata: { id: chat, subject: "Grupo" }, chat: F.getChat(chat) });
    return ultimo();
  };
  assert.match(await panel(), /\n❌ Anti mensajes de ver una vez \(\.antivistaunica\)\n❌ Anti flood: 8 mensajes en 10 segundos \(\.antiflood\)\n[✅❌] Uso de juegos \(\.juegos\)\n/);

  await config(["on"]);
  assert.match(ultimo(), /Opción: `antiflood`\n• Estado: Activado$/);
  assert.equal(F.getChat(chat).antiFlood, 1);
  assert.match(await panel(), /\n✅ Anti flood: 8 mensajes en 10 segundos \(\.antiflood\)\n/);
  await config(["on"]);
  assert.match(ultimo(), /Estado: Activado \(ya estaba así\)$/);

  // A moderator sees the option in the menu and doesn't get to turn it: what it gives ends in a removal.
  await config(["off"], { isAdmin: false, isMod: true });
  assert.equal(ultimo(), txt.onlyAdmin);
  assert.equal(F.getChat(chat).antiFlood, 1);

  // With nothing it flips, as every switch.
  await config([]);
  assert.match(ultimo(), /Opción: `antiflood`\n• Estado: Desactivado$/);
  assert.equal(F.getChat(chat).antiFlood, 0);
  await config(["cualquiera"]);
  assert.equal(ultimo(), "Usá .antiflood on o .antiflood off (sin nada, lo invierte).");
  assert.equal(F.getChat(chat).antiFlood, 0);
});

// .diversion: the fun commands (plugin.diversion), on unless the group turns them off, an admin's to turn and not a
// moderator's, as .juegos is; .config and .modo say how it is, and alone it leaves the group "mixto".
test(".diversion: prendida por defecto, la apaga y la prende un admin, y .config y .modo la muestran", async () => {
  const chat = "diversion@g.us";
  F.initDataDB({ chat, sender: "111@lid", senderJid: "111@s.whatsapp.net" });
  assert.equal(F.getChat(chat).diversion, 1);
  assert.ok(Config.cmd.includes("diversion"));
  // What a fun command answers in a group with it off (handle-message.js): who turns it back on, and with what.
  assert.equal(M.DIVERSION_APAGADA, "🎈 La diversión está apagada en este grupo. Un admin la prende con .diversion on");
  const config = (args, quien = { isAdmin: true }) => Config.run({ ...msg, chat }, { client: conexion.client, command: "diversion", args, isOwner: false, isAdmin: false, ...quien, chat: F.getChat(chat), botSettings: {} });
  const VerConfig = (await import("../plugins/grupo-config.js")).default;
  const panel = async () => {
    await VerConfig.run({ ...msg, chat }, { client: conexion.client, groupMetadata: { id: chat, subject: "Grupo" }, chat: F.getChat(chat) });
    return ultimo();
  };
  // Right under the casino, the other switch of what's played and laughed at.
  assert.match(await panel(), /\n✅ Casino y apuestas \(\.casino\)\n✅ Diversión: parejas, familias, frases, horóscopo, temáticas, ranking \(\.diversion\)\n✅ Stickers y convertidores: \.s, \.ttp, \.tts, \.qr, efectos de audio \(\.convertidores\)\n🎮 Juegos apagados de a uno/);

  await config(["off"]);
  assert.match(ultimo(), /Opción: `diversion`\n• Estado: Desactivado$/);
  assert.equal(F.getChat(chat).diversion, 0);
  assert.match(await panel(), /\n❌ Diversión: parejas, familias, frases, horóscopo, temáticas, ranking \(\.diversion\)\n✅ Stickers y convertidores/);
  // The birthdays' greeting goes with the automatic ones (lib/cumpleanos.js), and .config says so.
  assert.match(await panel(), /\n✅ Saludo automático \(\.saludos\)\n✅ Saludo de cumpleaños \(\.saludocumple\)\n/);
  await Modo.run({ ...msg, chat }, { client: conexion.client, text: "" });
  assert.match(ultimo(), /Modo actual: \*mixto\*\n✅ juegos · ❌ diversión · ✅ stickers y convertidores · ✅ charla de Claudia/);
  assert.match(ultimo(), /\nCada cosa suelta: \.juegos, \.diversion, \.convertidores, \.charla, \.saludos, \.saludocumple, \.monedas, \.ascensos y \.recapsemanal\.$/);

  await config(["on"], { isAdmin: false, isMod: true });
  assert.equal(ultimo(), txt.onlyAdmin, "un moderador no");
  assert.equal(F.getChat(chat).diversion, 0);
  await config(["on"]);
  assert.match(ultimo(), /Estado: Activado$/);
  assert.equal(M.modoActual(F.getChat(chat)), "amigos");
  await config([]);
  assert.equal(F.getChat(chat).diversion, 0, "sin nada la invierte");
  await config(["cualquiera"]);
  assert.equal(ultimo(), "Usá .diversion on o .diversion off (sin nada, lo invierte).");
  assert.equal(F.getChat(chat).diversion, 0);
});

// .convertidores: the stickers and converters (plugin.convertidores), the same way as .diversion.
test(".convertidores: prendidos por defecto, los apaga y los prende un admin, y .config y .modo los muestran", async () => {
  const chat = "convertidores@g.us";
  F.initDataDB({ chat, sender: "111@lid", senderJid: "111@s.whatsapp.net" });
  assert.equal(F.getChat(chat).convertidores, 1);
  assert.ok(Config.cmd.includes("convertidores"));
  assert.equal(M.CONVERTIDORES_APAGADOS, "🔄 Los stickers y convertidores están apagados en este grupo. Un admin los prende con .convertidores on");
  const config = (args, quien = { isAdmin: true }) => Config.run({ ...msg, chat }, { client: conexion.client, command: "convertidores", args, isOwner: false, isAdmin: false, ...quien, chat: F.getChat(chat), botSettings: {} });
  const VerConfig = (await import("../plugins/grupo-config.js")).default;
  const panel = async () => {
    await VerConfig.run({ ...msg, chat }, { client: conexion.client, groupMetadata: { id: chat, subject: "Grupo" }, chat: F.getChat(chat) });
    return ultimo();
  };

  await config(["off"]);
  assert.match(ultimo(), /Opción: `convertidores`\n• Estado: Desactivado$/);
  assert.equal(F.getChat(chat).convertidores, 0);
  assert.match(await panel(), /\n✅ Diversión: parejas, familias, frases, horóscopo, temáticas, ranking \(\.diversion\)\n❌ Stickers y convertidores: \.s, \.ttp, \.tts, \.qr, efectos de audio \(\.convertidores\)\n🎮 Juegos apagados de a uno/);
  await Modo.run({ ...msg, chat }, { client: conexion.client, text: "" });
  assert.match(ultimo(), /Modo actual: \*mixto\*\n✅ juegos · ✅ diversión · ❌ stickers y convertidores · ✅ charla de Claudia/);

  await config(["on"], { isAdmin: false, isMod: true });
  assert.equal(ultimo(), txt.onlyAdmin, "un moderador no");
  assert.equal(F.getChat(chat).convertidores, 0);
  await config(["on"]);
  assert.match(ultimo(), /Estado: Activado$/);
  assert.equal(M.modoActual(F.getChat(chat)), "amigos");
  await config(["cualquiera"]);
  assert.equal(ultimo(), "Usá .convertidores on o .convertidores off (sin nada, lo invierte).");
  assert.equal(F.getChat(chat).convertidores, 1);
});

// .saludocumple: the birthdays' greeting (lib/cumpleanos.js), a switch apart from .saludos, the answer to a "hola". On
// unless the group turns it off, an admin's to turn, and .config and .modo say how it is.
test(".saludocumple: prendido por defecto, lo apaga y lo prende un admin, aparte de .saludos, y .config y .modo lo muestran", async () => {
  const chat = "saludocumple@g.us";
  F.initDataDB({ chat, sender: "111@lid", senderJid: "111@s.whatsapp.net" });
  assert.equal(F.getChat(chat).saludoCumple, 1);
  assert.ok(Config.cmd.includes("saludocumple"));
  const config = (command, args, quien = { isAdmin: true }) => Config.run({ ...msg, chat }, { client: conexion.client, command, args, isOwner: false, isAdmin: false, ...quien, chat: F.getChat(chat), botSettings: {} });
  const VerConfig = (await import("../plugins/grupo-config.js")).default;
  const panel = async () => {
    await VerConfig.run({ ...msg, chat }, { client: conexion.client, groupMetadata: { id: chat, subject: "Grupo" }, chat: F.getChat(chat) });
    return ultimo();
  };

  // The "hola" off, the birthdays on: a buy-and-sell group's choice.
  await config("saludos", ["off"]);
  assert.deepEqual([F.getChat(chat).saludos, F.getChat(chat).saludoCumple], [0, 1]);
  assert.match(await panel(), /\n❌ Saludo automático \(\.saludos\)\n✅ Saludo de cumpleaños \(\.saludocumple\)\n/);
  await config("saludocumple", ["off"]);
  assert.match(ultimo(), /Opción: `saludocumple`\n• Estado: Desactivado$/);
  assert.deepEqual([F.getChat(chat).saludos, F.getChat(chat).saludoCumple], [0, 0]);
  assert.match(await panel(), /\n❌ Saludo automático \(\.saludos\)\n❌ Saludo de cumpleaños \(\.saludocumple\)\n/);
  await Modo.run({ ...msg, chat }, { client: conexion.client, text: "" });
  assert.match(ultimo(), / · ❌ saludo automático · ❌ saludo de cumpleaños · /);

  await config("saludocumple", ["on"], { isAdmin: false, isMod: true });
  assert.equal(ultimo(), txt.onlyAdmin, "un moderador no");
  assert.equal(F.getChat(chat).saludoCumple, 0);
  await config("saludocumple", ["on"]);
  assert.match(ultimo(), /Estado: Activado$/);
  assert.deepEqual([F.getChat(chat).saludos, F.getChat(chat).saludoCumple], [0, 1], "y .saludos sigue como estaba");
  await config("saludocumple", ["cualquiera"]);
  assert.equal(ultimo(), "Usá .saludocumple on o .saludocumple off (sin nada, lo invierte).");
});

// .anticall and .audios saved an option nothing ever read: they're gone, and so are their columns (database-schema.js).
test("config: .anticall y .audios, que no hacían nada, ya no son interruptores", () => {
  for (const cmd of ["anticall", "audios"]) assert.ok(!Config.cmd.includes(cmd), cmd);
  assert.ok(Config.cmd.includes("antiprivado") && Config.cmd.includes("autoread"), "los demás siguen");
});
