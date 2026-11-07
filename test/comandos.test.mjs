import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, clienteFalso, fijarSaldo } from "./helpers.mjs";

// What a command is, read from a message's text the same way everywhere (lib/comandos.js), and what the commands get:
// the text as typed for the ones that send or keep it, and amounts as people write them here ("1.000" is a thousand).

let F, C;
before(async () => {
  ({ F } = await prepararBase("comandos"));
  C = await import("../lib/comandos.js");
});

const PREFIJOS = [".", "/", "@"];

test("parsearComando: el prefijo con el nombre pegado, limpio, y el texto en una línea y como vino", () => {
  const casos = [
    [".menu", { prefijo: ".", comando: "menu", args: [], texto: "", textoCompleto: "" }],
    ["/menu", { prefijo: "/", comando: "menu", args: [], texto: "", textoCompleto: "" }],
    ["@resumen 2h", { prefijo: "@", comando: "resumen", args: ["2h"], texto: "2h", textoCompleto: "2h" }],
    // The punctuation glued at the end, the case, the invisibles and the accents aren't the name: the plugins declare
    // one form, without them.
    [".MENU?", { prefijo: ".", comando: "menu", args: [], texto: "", textoCompleto: "" }],
    [".ttt!", { prefijo: ".", comando: "ttt", args: [], texto: "", textoCompleto: "" }],
    [".me​nu", { prefijo: ".", comando: "menu", args: [], texto: "", textoCompleto: "" }],
    [".4enlínea", { prefijo: ".", comando: "4enlinea", args: [], texto: "", textoCompleto: "" }],
    [".4enlínea", { prefijo: ".", comando: "4enlinea", args: [], texto: "", textoCompleto: "" }],
    [".PÓKER?", { prefijo: ".", comando: "poker", args: [], texto: "", textoCompleto: "" }],
    [".cumpleaños", { prefijo: ".", comando: "cumpleanos", args: [], texto: "", textoCompleto: "" }],
    [".recordá que el asado es el sábado", { prefijo: ".", comando: "recorda", args: ["que", "el", "asado", "es", "el", "sábado"], texto: "que el asado es el sábado", textoCompleto: "que el asado es el sábado" }],
    // Names that aren't only letters still are names.
    [".18", { prefijo: ".", comando: "18", args: [], texto: "", textoCompleto: "" }],
    [".toppajer@s", { prefijo: ".", comando: "toppajer@s", args: [], texto: "", textoCompleto: "" }],
    // "texto" and "args" as the plugins always got them; "textoCompleto" with its line breaks, trimmed at the ends.
    [".reglas set 1. Sin spam\n2.  Respeto \n", { prefijo: ".", comando: "reglas", args: ["set", "1.", "Sin", "spam", "2.", "Respeto"], texto: "set 1. Sin spam 2. Respeto", textoCompleto: "set 1. Sin spam\n2.  Respeto" }],
    [".s\n\n  hola", { prefijo: ".", comando: "s", args: ["hola"], texto: "hola", textoCompleto: "hola" }],
    ["@59899000001 hola", { prefijo: "@", comando: "59899000001", args: ["hola"], texto: "hola", textoCompleto: "hola" }],
  ];
  for (const [texto, esperado] of casos) assert.deepEqual(C.parsearComando(texto, PREFIJOS), esperado, JSON.stringify(texto));

  // Someone talking: a space or a line break after the prefix, more prefixes, nothing after it, or no prefix first.
  for (const texto of ["...pero bueno", ". hola", ".\nhola", "...", ".", "", " .menu", "hola .menu", ".@ana", "@.menu", "/.", ".?", "¿.menu?"]) {
    assert.equal(C.parsearComando(texto, PREFIJOS), null, JSON.stringify(texto));
  }
});

// ". actividad" was a command until the parser became one (bfc57f5): the dispatcher trimmed what followed the prefix.
// It is again, read exactly as the command against the prefix, but only for a command that exists: with a space,
// ". hola" is still someone talking. A command that is also a word counts all the same (". no sé" is .no).
test("parsearComando: con espacios después del prefijo, un comando que existe se lee igual que pegado; lo demás es charla", () => {
  const antes = globalThis.plugins;
  globalThis.plugins = { p: { cmd: ["actividad", "menu", "no", "s", "4enlinea", "resumen"] } };
  try {
    for (const [conEspacio, pegado] of [
      [". actividad", ".actividad"],
      [".   actividad 7 días", ".actividad 7 días"],
      [".\tmenu", ".menu"],
      [". menu", ".menu"],
      ["/ menu", "/menu"],
      ["@ resumen 2h", "@resumen 2h"],
      [". MENU?", ".MENU?"],
      [". 4enlínea", ".4enlínea"],
      [". menú", ".menu"],
      [". s\n\n  hola", ".s\n\n  hola"],
      [". no sé", ".no sé"],
    ]) {
      assert.ok(C.parsearComando(pegado, PREFIJOS), pegado);
      assert.deepEqual(C.parsearComando(conEspacio, PREFIJOS), C.parsearComando(pegado, PREFIJOS), JSON.stringify(conEspacio));
    }
    for (const texto of [". hola", ". hola menu", ".\nactividad", ". \nactividad", ". . menu", ".  ", "@ ana", "@ 59899000001 hola", ". actividades"]) {
      assert.equal(C.parsearComando(texto, PREFIJOS), null, JSON.stringify(texto));
    }
    assert.deepEqual([". actividad", "@ menu", ". hola", ". hola que tal", "@ ana"].map((t) => C.esComando(t)), [true, true, false, false, false]);
  } finally {
    globalThis.plugins = antes;
  }
  // without the plugins loaded (start-process.js reads chat with this too), nothing after a space is a command
  assert.equal(C.parsearComando(". actividad", PREFIJOS), null);
});

test("pareceComando: letras, números o «@», y alguna letra", () => {
  for (const nombre of ["menu", "4enlinea", "4enlínea", "toppajer@s", "ñandú"]) assert.equal(C.pareceComando(nombre), true, nombre);
  for (const nombre of ["5", "18", "1.000", "foo_bar", "jaja😂", "@", ""]) assert.equal(C.pareceComando(nombre), false, nombre);
});

test("esComando: lo que declara un plugin, o tras «.» o «/» un nombre que lo parece; con «@», solo lo declarado", () => {
  const antes = globalThis.plugins;
  globalThis.plugins = { menu: { cmd: ["menu", "18"] } };
  try {
    for (const texto of [".menu", "@menu", ".18", "@18", ".cualquiercosa", "/cualquiercosa"]) assert.equal(C.esComando(texto), true, texto);
    for (const texto of ["...pero bueno", ". hola", ".5 kilos", "@59899000001 hola", "@cualquiercosa", ".foo_bar", "hola", ""]) assert.equal(C.esComando(texto), false, texto);
  } finally {
    globalThis.plugins = antes;
  }
});

test("leerEntero: «1.000» es mil; un decimal, una coma, letras o un punto fuera de lugar no son un monto", () => {
  for (const [texto, n] of [["1000", 1000], ["1.000", 1000], ["10.000.000", 10_000_000], [" 25 ", 25], ["007", 7], ["0", 0]]) assert.equal(C.leerEntero(texto), n, texto);
  for (const texto of ["1,000", "2.5", "2,5", "1.0000", "1000.000", ".5", "100coins", "1k", "-5", "1. 000", "", "abc", undefined, null]) {
    assert.equal(C.leerEntero(texto), null, String(texto));
  }
  assert.equal(C.leerEntero("-5", { negativos: true }), -5);
  assert.equal(C.leerEntero("-1.000", { negativos: true }), -1000);
  assert.equal(C.leerEntero("--5", { negativos: true }), null);
});

// The word of every switch, read as a command's name is: ".juegos off." and ".iniciativa Sí!" said nothing they knew.
// It used to live in lib/juegos-apagados.js, and .juegos and .iniciativa each kept their own copy of the words.
test("leerInterruptor: on, off o nada, también con un signo pegado, con tilde o en mayúsculas", () => {
  for (const [palabra, valor] of [
    ["on", true],
    ["Prender", true],
    ["sí", true],
    ["Sí!", true],
    ["ON.", true],
    ["off", false],
    ["apagar", false],
    ["no", false],
    ["off.", false],
    ["NO!", false],
    ["xyz", null],
    ["", null],
    [undefined, null],
  ]) assert.equal(C.leerInterruptor(palabra), valor, String(palabra));
});

// What comes after a command is read as its name is: ".ruleta 20." asked how much, and ".poker salir!" showed the help.
test("un signo pegado al final no cambia un monto ni una palabra, como no cambia el nombre del comando", () => {
  for (const [texto, n] of [["20.", 20], ["20!", 20], ["1.000.", 1000], ["5,", 5], ["100?!", 100], ["\u200b30\u200b", 30]]) assert.equal(C.leerEntero(texto), n, texto);
  assert.equal(C.leerEntero("-5.", { negativos: true }), -5);
  for (const texto of ["2.5.", "1,000!", ".", "!", "¿20", "1. 000"]) assert.equal(C.leerEntero(texto), null, texto);
  for (const [texto, palabra] of [["Rojo!", "rojo"], ["  Peñarol.  ", "penarol"], ["Arrancá", "arranca"], ["columna 1.", "columna 1"], ["17-18?", "17-18"], ["!", ""], [undefined, ""]]) {
    assert.equal(C.limpiarPalabra(texto), palabra, String(texto));
  }
});

test("normalizarComando: como el despachador limpia uno escrito, con o sin su prefijo", () => {
  for (const [texto, nombre] of [[".menu", "menu"], ["menu", "menu"], ["@Sticker", "sticker"], ["/TTT!", "ttt"], [".menu?", "menu"], ["4enlínea", "4enlinea"], ["recordá", "recorda"], [".MENÚ", "menu"]]) {
    assert.equal(C.normalizarComando(texto), nombre, texto);
  }
});

// ---------- what the commands get ----------

// The commands that send or keep free text take it as it was typed (textoCompleto): it went out in a single line.
test("los comandos de texto libre mandan el texto como se escribió, con sus saltos de línea", async (t) => {
  const COMPLETO = "Primera línea\nSegunda   línea";
  const UNA = "Primera línea Segunda línea";
  const participants = [{ id: "300000000000031@lid", admin: null }, { id: "300000000000032@lid", admin: null }];
  const m = { chat: G, sender: "300000000000031@lid", isGroup: true, react: async () => {} };
  const textosDe = async (archivo) => {
    const client = clienteFalso();
    const plugin = (await import(`../plugins/${archivo}.js`)).default;
    await plugin.run(m, { client, text: UNA, textoCompleto: COMPLETO, participants, isAdmin: true, isOwner: true, chat: {} });
    return globalThis.enviados.map((e) => e.msg?.text ?? "");
  };
  assert.deepEqual(await textosDe("fun-say"), [COMPLETO]);
  assert.deepEqual(await textosDe("grupo-hidetag"), [COMPLETO]);
  assert.ok((await textosDe("grupo-tagall")).some((texto) => texto.includes(COMPLETO)), ".tagall");
  // .ht2 and .tagall2 send their bursts on timers.
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  try {
    for (const archivo of ["grupo-hidetag2", "grupo-tagall2"]) {
      await textosDe(archivo); // it schedules the burst and returns
      t.mock.timers.tick(10 * 1000);
      const textos = globalThis.enviados.map((e) => e.msg?.text ?? "");
      assert.ok(textos.length > 0 && textos.every((texto) => texto.includes(COMPLETO)), archivo);
    }
  } finally {
    t.mock.timers.reset();
  }
});

test("montos: «1.000» es mil en la ruleta, .regalar, .4enlinea y .loteria; «2.5» o «1,000» no son un monto", async (t) => {
  const Casino = await import("../lib/casino.js");
  const C4 = await import("../lib/cuatro-en-linea.js");
  t.after(() => {
    Casino.devolverMesasRuleta();
    C4.devolverCuatroEnLinea();
  });
  const [ANA, BETO] = ["300000000000041@lid", "300000000000042@lid"];
  for (const [quien, nombre] of [[ANA, "Ana"], [BETO, "Beto"]]) F.initDataDB({ chat: G, sender: quien, senderJid: "", pushName: nombre });
  fijarSaldo(F, G, ANA, 10_000);
  fijarSaldo(F, G, BETO, 500);
  const client = clienteFalso();
  const plugin = async (archivo) => (await import(`../plugins/${archivo}.js`)).default;
  const m = (sender, text, extra = {}) => ({ chat: G, sender, isGroup: true, text, mentionedJid: [], react: async () => {}, ...extra });
  const argsDe = (texto) => texto.split(/\s+/).slice(1);

  const Ruleta = await plugin("coins-ruleta");
  await Ruleta.run(m(ANA, ".ruleta 1.000 rojo"), { client, args: ["1.000", "rojo"], chat: {} });
  assert.equal(F.getSaldoCoins(G, ANA), 9000, "la ruleta apostó mil, no 1");
  for (const monto of ["2.5", "1,000"]) {
    await Ruleta.run(m(BETO, `.ruleta ${monto} rojo`), { client, args: [monto, "rojo"], chat: {} });
    assert.equal(F.getSaldoCoins(G, BETO), 500, `«${monto}» no es un monto: no apostó 2 ni 1`);
  }

  const Regalar = await plugin("coins-regalar");
  const regalo = `.regalar @${BETO.split("@")[0]} 1.000 por 2 cafés`;
  await Regalar.run(m(ANA, regalo, { mentionedJid: [BETO] }), { client, text: argsDe(regalo).join(" "), args: argsDe(regalo), participants: [{ id: ANA, admin: null }, { id: BETO, admin: null }] });
  assert.deepEqual([F.getSaldoCoins(G, ANA), F.getSaldoCoins(G, BETO)], [8000, 1500], ".regalar dio mil, no los 2 de los cafés");

  const CuatroEnLinea = await plugin("fun-4enlinea");
  await CuatroEnLinea.run(m(ANA, ".4enlinea 1.000"), { client, text: "1.000", chat: { games: 1 } });
  assert.equal(C4.salas.get(G)?.apuesta, 1000, "la mesa es por mil");

  const Loteria = await plugin("coins-loteria");
  const antes = F.getSaldoCoins(G, BETO);
  await Loteria.run(m(BETO, ".loteria 1.000"), { client, args: ["1.000"], command: "loteria", chat: {} });
  assert.match(globalThis.enviados.at(-1).msg.text, /^❌/);
  assert.equal(F.getSaldoCoins(G, BETO), antes, "mil boletos chocan con el tope, en vez de comprar uno");
});

// ---------- the hooks ----------

test("un comando no es la respuesta de un juego, ni una entrada, ni charla para la racha", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.after(() => t.mock.timers.reset());
  const ANA = "300000000000051@lid";
  F.initDataDB({ chat: G, sender: ANA, senderJid: "", pushName: "Ana" });
  const client = clienteFalso();

  // A riddle's question, quoted: ".un piano" won it, and ran as the command .un.
  const Acertijo = (await import("../plugins/fun-acertijos.js")).default;
  await Acertijo.run({ chat: G, sender: ANA, isGroup: true }, { client, chat: {} });
  const pregunta = `MSG${globalThis.enviados.length}`;
  const reacciones = [];
  const responder = (text) => Acertijo.before({ chat: G, sender: ANA, isGroup: true, text, quoted: { id: pregunta }, react: async (e) => reacciones.push(e) }, { client });
  await responder(".un piano");
  assert.deepEqual(reacciones, [], "un comando que cita la pregunta no es una respuesta");
  await responder("una respuesta que no es");
  assert.deepEqual(reacciones, ["❌"], "una respuesta equivocada, sí");
  t.mock.timers.tick(5 * 60 * 1000); // and the riddle runs out

  const Hashtags = (await import("../plugins/_hashtags.js")).default;
  const { semanaDe } = await import("../lib/hashtags.js");
  const entradas = () => F.contarEntradasUsuarioSemana(G, "historiasrandom", ANA, semanaDe(Date.now()));
  await Hashtags.before({ chat: G, sender: ANA, isGroup: true, text: ".s #historiasrandom me pasó algo", key: { id: "H1" } }, { client });
  assert.equal(entradas(), 0, "un comando con el hashtag no es una entrada");
  await Hashtags.before({ chat: G, sender: ANA, isGroup: true, text: "#historiasrandom me pasó algo", key: { id: "H2" } }, { client });
  assert.equal(entradas(), 1);

  // The streak counts what people say: a command no, "...pero bueno" yes (it was a command for this hook).
  const Actividad = (await import("../plugins/_actividad.js")).default;
  const mensajes = () => db.prepare("SELECT COALESCE(SUM(mensajes), 0) AS n FROM actividad_diaria WHERE chat = ? AND usuario = ?").get(G, ANA).n;
  const antes = mensajes();
  const escribir = (text) => Actividad.before({ chat: G, sender: ANA, isGroup: true, message: {}, text, react: async () => {} }, { client });
  await escribir(".menu de juegos");
  assert.equal(mensajes(), antes, "un comando no es charla");
  await escribir("...pero bueno, qué se le va a hacer");
  assert.equal(mensajes(), antes + 1, "«...pero bueno» sí");
});

test(".bladd guarda los comandos limpios, como los compara el despachador", async () => {
  const Bl = (await import("../plugins/owner-blacklist-grupo.js")).default;
  const chat = "bladd@g.us";
  await Bl.run({ chat, sender: "300000000000061@lid", isGroup: true }, { client: clienteFalso(), text: "@Sticker .menu? !casino", chat: {}, usedPrefix: ".", command: "bladd" });
  assert.deepEqual(F.getChatBlacklist(chat).sort(), ["casino", "menu", "sticker"]);
});
