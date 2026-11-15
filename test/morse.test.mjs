import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";
import { RITMO } from "../lib/ritmo.js";
import { parsearComando } from "../lib/comandos.js";

// .morse and .tmorse (plugins/tools-morse.js): a text in Morse code and back, the one typed or the one of the message
// it answers. The table against Recommendation ITU-R M.1677-1, and what each command answers as the bot hands it the
// text (lib/comandos.js) and sends the answer (lib/wa-socket.js, whose sendText turns "@<digits>" into mentions).
const G = "120363000000000139@g.us";
const ANA = "300000000000141@lid";
const BETO = "300000000000142@lid";

let Plugin, aMorse, deMorse, client;
// Every send waits its turn in the chat (lib/ritmo.js), a second and a half after the one before: here they go at once.
const pausaReal = RITMO.MIN_ENTRE_MENSAJES_MS;
after(() => (RITMO.MIN_ENTRE_MENSAJES_MS = pausaReal));
before(async () => {
  RITMO.MIN_ENTRE_MENSAJES_MS = 0;
  const { F } = await prepararBase("morse");
  ({ default: Plugin, aMorse, deMorse } = await import("../plugins/tools-morse.js"));
  // The bot's wrapper (lib/wa-socket.js) around a socket that never connects: its sendText, and the parseMention that
  // turns an answer's "@<digits>" into mentions.
  const WS = await import("../lib/wa-socket.js");
  const crearReal = WS._dep.crearSocket;
  const user = { lid: "200000000000139@lid", jid: "59800000139@s.whatsapp.net", id: "59800000139:7@s.whatsapp.net", name: "Claudia" };
  WS._dep.crearSocket = () => ({ ...clienteFalso(), user, ev: { emit() {}, on() {} } });
  try {
    client = WS.makeWASocket({});
  } finally {
    WS._dep.crearSocket = crearReal;
  }
  F.initDataDB({ chat: G, sender: BETO, senderJid: "59899000142@s.whatsapp.net", pushName: "Beto" });
});

// A command as someone in the group types it: the bot reads it (lib/comandos.js) and hands the plugin its text both
// ways, its words joined by single spaces and as it was typed (handle-message.js). What Claudia answered, and whom the
// answer tags.
async function pedir(mensaje, extra = {}) {
  globalThis.enviados = [];
  const { prefijo, comando, texto, textoCompleto } = parsearComando(mensaje);
  const m = { chat: G, sender: ANA, isGroup: true, mentionedJid: [], quoted: null, ...extra };
  await Plugin.run(m, { client, text: texto, textoCompleto, usedPrefix: prefijo, command: comando });
  assert.equal(globalThis.enviados.length, 1, "una respuesta por pedido");
  const { msg } = globalThis.enviados[0];
  return { texto: msg.text, menciones: msg.contextInfo.mentionedJid };
}
const respondiendo = (mensaje, citado, mencionados = []) => pedir(mensaje, { quoted: { text: citado, contextInfo: { mentionedJid: mencionados } } });

// Recommendation ITU-R M.1677-1 (10/2009), Annex 1, 1.1.1 to 1.1.3: every letter, figure and sign it gives, but the
// accented e (accents go) and the multiplication sign (an X, as its 3.2.1 says). The Ñ, "!", "&", ";", "_" and "$"
// aren't in it: as Wikipedia's "Morse code" gives them.
const UIT = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
  N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.", 0: "-----",
  ".": ".-.-.-", ",": "--..--", ":": "---...", "?": "..--..", "'": ".----.", "-": "-....-", "/": "-..-.", "(": "-.--.",
  ")": "-.--.-", '"': ".-..-.", "=": "-...-", "+": ".-.-.", "@": ".--.-.",
};
const EXTENSIONES = { Ñ: "--.--", "!": "-.-.--", "&": ".-...", ";": "-.-.-.", _: "..--.-", $: "...-..-" };

test("morse: cada letra, número y signo como lo da la recomendación UIT-R M.1677-1, y de vuelta", () => {
  for (const [letra, codigo] of Object.entries({ ...UIT, ...EXTENSIONES })) {
    assert.deepEqual(aMorse(letra), { morse: codigo, sinCodigo: [] }, letra);
    assert.deepEqual(deMorse(codigo), { texto: letra, invalidos: [], reconocidos: 1 }, codigo);
  }
  assert.equal(aMorse("sos").morse, "... --- ...", "en minúscula, igual");
  // SOS as it's keyed: one sign, with no gaps between its letters.
  assert.deepEqual(deMorse("...---..."), { texto: "SOS", invalidos: [], reconocidos: 1 });
});

test("morse: sin tildes salvo la de la ñ, escrita como una letra o como una n y su tilde; ¿ y ¡ se van sin aviso", () => {
  const nandu = "--.-- .- -. -.. ..-";
  assert.deepEqual(aMorse("Ñandú"), { morse: nandu, sinCodigo: [] });
  assert.deepEqual(aMorse("n\u0303andu\u0301"), { morse: nandu, sinCodigo: [] }, "la ñ y la ú con la tilde aparte");
  // No source gives them a code, and other readers wouldn't know the ones they had: the closing signs say it.
  assert.deepEqual(aMorse("¿Qué? ¡Ah!"), { morse: "--.- ..- . ..--.. / .- .... -.-.--", sinCodigo: [] });
  // The Ñ was set aside as this character while the accents went: a text with one had an Ñ there.
  assert.deepEqual(aMorse("a\u0001b"), { morse: ".- -...", sinCodigo: [] });
});

test("morse: lo que no tiene código va en el aviso como se ve, un emoji entero, y lo invisible no va", () => {
  assert.deepEqual(aMorse("hola 👨‍👩‍👧 🇺🇾 👍🏽 ❤️ #"), { morse: ".... --- .-.. .-", sinCodigo: ["👨‍👩‍👧", "🇺🇾", "👍🏽", "❤️", "#"] });
  // A zero-width space and a direction mark, which can't be seen; a keycap is its figure.
  assert.deepEqual(aMorse("ho\u200Bla\u200E 1️⃣"), { morse: ".... --- .-.. .- / .----", sinCodigo: [] });
});

test("morse: las comillas, los apóstrofos, las rayas y el × de un celular son los signos de la tabla", () => {
  // The ITU's table gives the quotes curly and the hyphen as a dash, and its 3.2.1 says to send an X for the ×.
  assert.deepEqual(aMorse("“sí” ‘no’ «tal» 2×3 – 1 — 2"), aMorse(`"si" 'no' "tal" 2X3 - 1 - 2`));
  assert.equal(aMorse("’").morse, ".----.");
});

test("morse: de vuelta, las palabras van con / o | o dos espacios, y los renglones siguen siendo renglones", () => {
  const [hola, mundo] = [".... --- .-.. .-", "-- ..- -. -.. ---"];
  for (const codigo of [`${hola} / ${mundo}`, `${hola}/${mundo}`, `${hola} | ${mundo}`, `${hola}  ${mundo}`, `/ ${hola} / ${mundo} /`, `${hola}  /  ${mundo}`]) {
    assert.equal(deMorse(codigo).texto, "HOLA MUNDO", codigo);
  }
  // With slashes between the words, more spaces are only spaces.
  assert.equal(deMorse(".... ---  .-.. .- / -- ..-").texto, "HOLA MU");
  assert.equal(deMorse(`${hola}\n${mundo}`).texto, "HOLA\nMUNDO");
  assert.equal(aMorse("hola\n\nmundo").morse, `${hola}\n${mundo}`, "sin renglones vacíos");
});

test("morse: los puntos y las rayas de otros teclados y páginas, y los tres puntos de un solo carácter", () => {
  assert.equal(deMorse("··· −−− ···").texto, "SOS");
  assert.equal(deMorse("•–• ∙—∙ ⋅‒⋅").texto, "RRR");
  assert.equal(deMorse("..._ ___").texto, "VO");
  assert.equal(deMorse("… --- …").texto, "SOS");
  assert.equal(deMorse("…. ..").texto, "HI");
});

test("morse: lo que no conoce sale como ? y va en la lista; un ? de verdad es un ?", () => {
  assert.deepEqual(deMorse("... * --- ........ *"), { texto: "S?O??", invalidos: ["*", "........"], reconocidos: 2 });
  assert.deepEqual(deMorse("..--.."), { texto: "?", invalidos: [], reconocidos: 1 });
});

// ---------- the commands ----------

test(".morse: pasa el texto a morse, y lo que ya es morse a texto; .tmorse y .traducirmorse solo leen", async () => {
  assert.deepEqual(await pedir(".morse hola mundo"), { texto: "📡 .... --- .-.. .- / -- ..- -. -.. ---", menciones: [] });
  assert.equal((await pedir(".morse ... --- ...")).texto, "🔤 SOS");
  assert.equal((await respondiendo(".morse", "... --- ...")).texto, "🔤 SOS", "respondiendo a un mensaje en morse");
  assert.equal((await respondiendo(".morse sos", "otra cosa")).texto, "📡 ... --- ...", "con un texto suyo, ese");
  assert.equal((await pedir(".traducirmorse ... --- ...")).texto, "🔤 SOS");
  assert.equal((await pedir(".tmorse hola")).texto, "Eso no parece morse: tiene que tener solo puntos, rayas y espacios (y / entre palabras).");
});

// The plugins get "text" with its spaces joined into one: two spaces between the words, or a word per line, ran them
// together, and "HOLAMUNDO" was all it said.
test(".tmorse: lee el código como se escribió, con dos espacios o un renglón entre las palabras", async () => {
  assert.equal((await pedir(".tmorse .... --- .-.. .-  -- ..- -. -.. ---")).texto, "🔤 HOLA MUNDO");
  assert.equal((await pedir(".tmorse .... --- .-.. .-\n-- ..- -. -.. ---")).texto, "🔤 HOLA\nMUNDO");
  assert.equal((await pedir(".morse hola\nmundo")).texto, "📡 .... --- .-.. .-\n-- ..- -. -.. ---");
});

// Its 📡 was a code it didn't know, the words of a notice made the code "not Morse", and .morse put the 🔤 on its own.
test(".morse y .tmorse: leen sus propias respuestas, sin la marca ni los avisos", async () => {
  const codigo = await pedir(".morse hola 😀 mundo");
  assert.equal(codigo.texto, "📡 .... --- .-.. .- / -- ..- -. -.. ---\n\n⚠️ Sin código en morse, los salteé: 😀");
  for (const comando of [".tmorse", ".morse"]) assert.equal((await respondiendo(comando, codigo.texto)).texto, "🔤 HOLA MUNDO", comando);
  assert.equal((await pedir(`.tmorse ${codigo.texto}`)).texto, "🔤 HOLA MUNDO", "pegada después del comando");
  const texto = await pedir(".tmorse ... --- ... / *");
  assert.equal(texto.texto, "🔤 SOS ?\n\n⚠️ Códigos que no conozco (puestos como ?): *");
  assert.equal((await respondiendo(".morse", texto.texto)).texto, "📡 ... --- ... / ..--..");
});

test(".morse y .tmorse: el texto llega hasta 500 caracteres como se ven, y el código, hasta lo que .morse hace de ellos", async () => {
  const muyLargo = (n) => `Es muy largo: hasta 500 caracteres (el tuyo tiene ${n}).`;
  assert.equal((await pedir(`.morse ${"a".repeat(501)}`)).texto, muyLargo(501));
  assert.equal((await pedir(`.morse ${"🧉".repeat(501)}`)).texto, muyLargo(501), "un emoji es un carácter");
  // The longest code is the "$"'s: 500 of them make the longest .morse sends, and .tmorse reads it back.
  const pesos = await pedir(`.morse ${"$".repeat(500)}`);
  assert.equal(pesos.texto, `📡 ${Array(500).fill("...-..-").join(" ")}`);
  assert.equal((await respondiendo(".tmorse", pesos.texto)).texto, `🔤 ${"$".repeat(500)}`);
  assert.equal((await pedir(`.tmorse ${". ".repeat(1999)}..`)).texto, `🔤 ${"E".repeat(1999)}I`, "4000 caracteres entran");
  assert.equal((await pedir(`.tmorse ${". ".repeat(2001).trim()}`)).texto, "Es muy largo: hasta 4000 caracteres de código (el tuyo tiene 4001).");
});

// A mention travels in the text as the digits of a LID, which only the admins get to see (.id): in the code anyone
// could read them. And sendText turns an answer's "@<digits>" into a mention: the code of an "@" and someone's LID
// had Claudia tag them.
test(".morse: una mención va con el nombre y no con los dígitos de su LID; lo que lee .tmorse no arroba a nadie", async () => {
  const escrita = await pedir(".morse @300000000000142 te espera", { mentionedJid: [BETO] });
  assert.equal(escrita.texto, `📡 ${aMorse("@Beto te espera").morse}`);
  const citada = await respondiendo(".morse", "hola @300000000000142", [BETO]);
  assert.equal(citada.texto, `📡 ${aMorse("hola @Beto").morse}`, "las menciones del mensaje citado, también");
  // A LID the bot knows goes as the name; other digits, without the "@".
  assert.deepEqual(await pedir(`.tmorse ${aMorse("hola @300000000000142").morse}`), { texto: "🔤 HOLA Beto", menciones: [] });
  assert.deepEqual(await pedir(`.tmorse ${aMorse("@300000000000999 y @300000000000998").morse}`), { texto: "🔤 300000000000999 Y 300000000000998", menciones: [] });
});

// On an iPhone the keyboard can turn two or three hyphens in a row into one "—" (Smart Punctuation): how many they
// were is lost, and the answer says what to type instead. A "_" is a dash too.
test(".tmorse: con rayas largas avisa lo del iPhone y que las rayas van con _; sin ellas, no", async () => {
  const iphone = "⚠️ Si lo escribiste en un iPhone: el teclado puede cambiar dos o tres guiones seguidos por una raya larga (—), y no sé cuántos eran. Escribí las rayas con _ (guion bajo).";
  assert.equal((await pedir(".tmorse ... — ...")).texto, `🔤 STS\n\n${iphone}`);
  assert.equal((await pedir(".tmorse .– –...")).texto, `🔤 AB\n\n${iphone}`);
  assert.equal((await pedir(".tmorse ... ___ ...")).texto, "🔤 SOS");
});

test(".morse y .tmorse: sin texto explican cómo se usan; sin nada que pasar, lo dicen; un ? solo se entiende", async () => {
  assert.equal((await pedir(".morse")).texto, "Escribí el texto: .morse hola mundo\nO respondé a un mensaje con .morse; si está en morse, te lo paso a texto.");
  const ayuda = "Pegá el código morse: .tmorse ... --- ...\nLas letras van separadas por espacios y las palabras por « / ». También podés responder a un mensaje.";
  assert.equal((await pedir(".tmorse")).texto, ayuda);
  assert.equal((await respondiendo(".tmorse", "")).texto, ayuda, "una foto sin texto");
  assert.equal((await pedir(".morse 😀 #")).texto, "No encontré nada que se pueda pasar a morse (solo letras, números y algunos signos).");
  assert.equal((await pedir(".tmorse * ........")).texto, "No pude entender ese código. Revisá que sean solo puntos y rayas separados por espacios.");
  assert.equal((await pedir(".tmorse ..--..")).texto, "🔤 ?");
});

test(".morse: solo donde Claudia es admin, como las otras herramientas; está en el menú y en la sección de los convertidores", async () => {
  assert.deepEqual([Plugin.cmd, Plugin.botAdmin], [["morse", "tmorse", "traducirmorse"], true]);
  const { seccionesDelMenu } = await import("../lib/menu.js");
  const { getComandosDeSeccion } = await import("../lib/secciones.js");
  assert.match(seccionesDelMenu(".").find((s) => s.clave === "convertidores").lineas, /^▸ \.morse </m);
  for (const cmd of Plugin.cmd) assert.ok(getComandosDeSeccion("convertidores").includes(cmd), cmd);
});
