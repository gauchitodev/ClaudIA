import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, ultimoEnviado } from "./helpers.mjs";
import { configuracion } from "../lib/configuracion.js";
import { cargados } from "../lib/plugins-cargados.js";

// .resumen (lib/resumen.js): how far back it goes (15 minutes unless asked, 6 hours at most), a header that only
// promises what it really covers, the same summary again within 5 minutes, one new summary a minute, a long while in
// parts, a message that starts by mentioning someone is chat (not a command), and a failed AI call leaves nothing
// behind.
// Gemini is swapped for a fake.

let Resumen, CC, R, Pausas, Gemini;
let fallaSi = () => false; // which prompts Gemini answers 500 to
let pedidos = []; // the prompts Gemini got and answered
let cuerpos = []; // and the whole request of each
let llamadas = 0; // every request made to it, answered or not
let frenar = null; // what its answers wait for: a summary that takes its time
let esperas = []; // the waits before asking again (lib/pausas.js), which pass at once here
const fetchReal = globalThis.fetch;
const errorReal = console.error;
const C = "resumen@g.us";
const MIN = 60 * 1000;
const HORA = 60 * MIN;

before(async () => {
  await prepararBase("resumen");
  configuracion.geminiApiKey = "clave";
  console.error = () => {};
  globalThis.fetch = async (url, opciones = {}) => {
    const body = JSON.parse(opciones.body);
    const texto = body.contents?.[0]?.parts?.[0]?.text || "";
    llamadas++;
    if (frenar) await frenar;
    if (fallaSi(texto)) return { ok: false, status: 500, text: async () => "" };
    pedidos.push(texto);
    cuerpos.push(body);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Se habló del asado." }] } }] }) };
  };
  Resumen = (await import("../plugins/resumen.js")).default;
  CC = await import("../lib/contexto-chat.js");
  R = await import("../lib/resumen.js");
  Pausas = await import("../lib/pausas.js");
  Gemini = await import("../lib/gemini.js");
  Pausas._dep.esperar = async (ms) => void esperas.push(ms);
  CC.reiniciarMemoria(Date.now() - 48 * HORA); // the memory has been up for two days
  cargados.plugins = { "resumen.js": Resumen };
});
after(() => {
  globalThis.fetch = fetchReal;
  console.error = errorReal;
});
beforeEach(() => {
  CC.contextoChat.delete(C);
  CC.contextoChatRecorte.delete(C);
  R.resumenesGuardados.delete(C);
  R.ultimoResumen.delete(C);
  R.resumenesEnCurso?.delete(C);
  fallaSi = () => false;
  pedidos = [];
  cuerpos = [];
  llamadas = 0;
  frenar = null;
  esperas = [];
});

async function pedir(args = [], sender = "555@lid") {
  const client = { ...clienteFalso(), sendPresenceUpdate: async () => {} };
  await Resumen.run({ chat: C, isGroup: true, sender }, { client, args });
  return ultimoEnviado().msg.text;
}
const unMinutoDespues = () => R.ultimoResumen.set(C, Date.now() - 61 * 1000);
const llenar = (n, cada, { desde = Date.now(), prefijo = "mensaje" } = {}) => {
  for (let i = n; i > 0; i--) CC.recordarMensaje(C, "Ana", `${prefijo} ${i}`, false, { fecha: desde - i * cada });
};
// 60 long messages, one every 2 minutes, all inside the last 2 hours.
const largos = () => {
  for (let i = 60; i > 0; i--) CC.recordarMensaje(C, "Ana", `mensaje ${i} ${"bla ".repeat(20)}`, false, { fecha: Date.now() - i * 2 * MIN + 30 * 1000 });
};
// Below the cap again whatever happens.
async function conTope(tope, fn) {
  const real = CC.MEMORIA_CORTA.TOPE;
  CC.MEMORIA_CORTA.TOPE = tope;
  try {
    await fn();
  } finally {
    CC.MEMORIA_CORTA.TOPE = real;
  }
}
async function conPartes({ caracteres, partes = R.RESUMENES.MAX_PARTES }, fn) {
  const real = { ...R.RESUMENES };
  R.RESUMENES.MAX_CARACTERES = caracteres;
  R.RESUMENES.MAX_PARTES = partes;
  try {
    await fn();
  } finally {
    Object.assign(R.RESUMENES, real);
  }
}

test("sin nada son los últimos 15 minutos, y lo de antes no entra", async () => {
  llenar(3, MIN, { desde: Date.now() - 20 * MIN, prefijo: "de antes" });
  llenar(10, MIN);
  assert.match(await pedir(), /^📝 \*Resumen de los últimos 15 min\* \(10 mensajes\)\n\nSe habló del asado\.$/);
  assert.match(pedidos[0], /mensajes del grupo de los últimos 15 min/);
  assert.doesNotMatch(pedidos[0], /de antes/);
});

test("con pocos mensajes el encabezado dice el tiempo pedido", async () => {
  llenar(10, 10 * MIN);
  assert.match(await pedir(["6"]), /^📝 \*Resumen de las últimas 6 h\* \(10 mensajes\)/);
});

test("en un grupo movido cubre las 6 horas enteras", async () => {
  for (let i = 359; i > 0; i--) CC.recordarMensaje(C, "Ana", `mensaje ${i}`, false, { fecha: Date.now() - i * MIN + 30 * 1000 });
  assert.match(await pedir(["6h"]), /^📝 \*Resumen de las últimas 6 h\* \(359 mensajes\)/);
});

test("si no tiene guardado todo lo pedido, dice lo que de verdad cubre", async () => {
  await conTope(200, async () => {
    llenar(360, MIN);
    const texto = await pedir(["6"]);
    assert.match(texto, /^📝 \*Resumen de las últimas 3 h 20 min\* \(200 mensajes; pediste 6 h, pero no tengo guardado más atrás\)/);
    assert.match(pedidos[0], /de las últimas 3 h 20 min/);
  });
});

test("si el recorte quedó antes de la ventana, la ventana está completa", async () => {
  await conTope(200, async () => {
    llenar(360, MIN);
    assert.match(await pedir(["2"]), /^📝 \*Resumen de las últimas 2 h\* \(\d+ mensajes\)/);
  });
});

test("si la memoria arrancó después de lo pedido, lo dice", async () => {
  try {
    CC.reiniciarMemoria(Date.now() - 2 * HORA);
    llenar(10, 10 * MIN);
    assert.match(await pedir(["6h"]), /^📝 \*Resumen de las últimas 2 h\* \(10 mensajes; pediste 6 h, pero no tengo guardado más atrás\)/);
    R.ultimoResumen.delete(C);
    CC.contextoChat.delete(C);
    llenar(2, MIN);
    assert.equal(await pedir(["5h"]), "Casi no hubo mensajes en las últimas 5 h. Ojo que no tengo guardado de antes de hace 2 h.");
  } finally {
    CC.reiniciarMemoria(Date.now() - 48 * HORA);
  }
});

test("pedir más de 6 horas hace 6 y lo dice", async () => {
  llenar(10, MIN);
  assert.match(await pedir(["8h"]), /^📝 \*Resumen de las últimas 6 h\* \(10 mensajes; lo máximo son 6 h\)/);
});

test("duracionPedida: los tiempos que entiende", () => {
  const casos = [
    [[], 15],
    [["2"], 120],
    [["6"], 360],
    [["7"], 7],
    [["30"], 30],
    [["30m"], 30],
    [["30", "min"], 30],
    [["15", "minutos"], 15],
    [["2h"], 120],
    [["2hs"], 120],
    [["2", "Horas"], 120],
    [["2", "horas", "porfa"], 120],
    [["1h30"], 90],
    [["1H30M"], 90],
    [["1", "hora", "y", "30"], 90],
    [["1,5", "h"], 90],
    [["1.5"], 90],
    [["90m"], 90],
    [["0"], 1],
    [["hola"], 15],
  ];
  for (const [args, minutos] of casos) assert.deepEqual(R.duracionPedida(args), { minutos, acotada: false }, args.join(" "));
  for (const args of [["8h"], ["500"], ["7", "horas"]]) assert.deepEqual(R.duracionPedida(args), { minutos: 360, acotada: true }, args.join(" "));
});

test("el tiempo, con el artículo que corresponde", () => {
  assert.equal(R.ultimos(MIN), "del último minuto");
  assert.equal(R.ultimos(MIN, "en"), "en el último minuto");
  assert.equal(R.ultimos(15 * MIN), "de los últimos 15 min");
  assert.equal(R.ultimos(15 * MIN, "en"), "en los últimos 15 min");
  assert.equal(R.ultimos(HORA), "de la última hora");
  assert.equal(R.ultimos(80 * MIN), "de la última hora y 20 min");
  assert.equal(R.ultimos(2 * HORA), "de las últimas 2 h");
  assert.equal(R.ultimos(200 * MIN, "en"), "en las últimas 3 h 20 min");
  assert.equal(R.textoDuracion(60), "1 h");
  assert.equal(R.textoDuracion(90), "1 h 30 min");
  assert.equal(R.aLas(new Date(2026, 10, 3, 1, 5).getTime()), "a la 1:05");
  assert.equal(R.aLas(new Date(2026, 10, 3, 14, 30).getTime()), "a las 14:30");
});

test("un mensaje que arranca con una mención entra; un comando no", async () => {
  const ahora = Date.now();
  for (let i = 5; i > 0; i--) CC.recordarMensaje(C, "Ana", `charla ${i}`, false, { fecha: ahora - i * MIN });
  CC.recordarMensaje(C, "Beto", "@59899123456 vení que te cuento", false, { fecha: ahora });
  CC.recordarMensaje(C, "Beto", ".resumen 3", false, { fecha: ahora });
  CC.recordarMensaje(C, "Beto", "@resumen", false, { fecha: ahora });
  await pedir();
  assert.match(pedidos[0], /Beto: @59899123456 vení que te cuento/);
  assert.doesNotMatch(pedidos[0], /\.resumen 3|Beto: @resumen/);
  assert.equal(CC.esComando("@59899123456 hola"), false);
  assert.equal(CC.esComando("@resumen"), true);
  assert.equal(CC.esComando(".cualquiercosa"), true);
});

// The mark is looked at again when someone edits: a message edited into a command leaves .resumen, as it did when the
// text was all there was to go by.
test("una edición vuelve a mirar si el mensaje es un comando", async () => {
  const MemoriaCorta = (await import("../plugins/_memoria-corta.js")).default;
  const base = { chat: C, isGroup: true, sender: "555@lid", pushName: "Ana", mentionedJid: [] };
  await MemoriaCorta.before({ ...base, text: "hola gente", key: { id: "ED1", participant: "555@lid" } }, { user: {} });
  const entrada = () => CC.contextoChat.get(C).find((e) => e.id === "ED1");
  assert.equal(CC.fueComando(entrada()), false);
  await MemoriaCorta.before({ ...base, text: "", message: { protocolMessage: { type: 14, key: { id: "ED1" }, editedMessage: { conversation: ".menu" } } }, key: { id: "ED2", participant: "555@lid" } }, { user: {} });
  assert.equal(CC.fueComando(entrada()), true);
});

// The memory keeps the mentions as names, and "@Sol ¿venís…?" read as "@" and the command .sol: what someone said to
// Sol dropped out of .resumen and the glances. Whether a message is a command is told by its text as it came.
test("lo que le dicen a alguien que se llama como un comando entra", async () => {
  const F = await import("../database-functions.js");
  const MemoriaCorta = (await import("../plugins/_memoria-corta.js")).default;
  const SOL = "300000000000005@lid";
  F.initDataDB({ chat: C, sender: SOL, senderJid: "", pushName: "Sol" });
  cargados.plugins["aero.js"] = { cmd: ["sol"] };
  const decir = (id, text, mentionedJid = []) => MemoriaCorta.before({ chat: C, isGroup: true, sender: "555@lid", pushName: "Ana", text, mentionedJid, key: { id } }, { user: {} });
  try {
    const ahora = Date.now();
    for (let i = 5; i > 0; i--) CC.recordarMensaje(C, "Beto", `charla ${i}`, false, { fecha: ahora - i * MIN });
    await decir("SOL1", "@300000000000005 ¿venís al cumple el sábado?", [SOL]);
    await decir("SOL2", ".sol montevideo");
    await pedir();
    assert.match(pedidos[0], /Ana: @Sol ¿venís al cumple el sábado\?/);
    assert.doesNotMatch(pedidos[0], /\.sol montevideo/, "el comando sigue afuera");
  } finally {
    delete cargados.plugins["aero.js"];
  }
});

test("el mismo pedido en los 5 minutos siguientes es el mismo resumen; otro tiempo hace uno nuevo, uno por minuto", async () => {
  llenar(10, MIN);
  const primero = await pedir();
  assert.match(primero, /^📝 \*Resumen de los últimos 15 min\* \(10 mensajes\)/);
  assert.match(await pedir(["15m"]), /^📝 \*Resumen de los últimos 15 min\* \(10 mensajes; lo hice recién\)\n\nSe habló del asado\.$/);
  assert.equal(pedidos.length, 1, "no volvió a preguntarle a la IA");
  assert.match(await pedir(["30m"]), /^Recién hice un resumen; esperá (\d+ s|1 min) para pedir otro\.$/);
  assert.equal(pedidos.length, 1);

  unMinutoDespues();
  assert.match(await pedir(["30m"]), /^📝 \*Resumen de los últimos 30 min\*/);
  assert.equal(pedidos.length, 2);

  R.resumenesGuardados.get(C).get(15).creado -= 3 * MIN;
  assert.match(await pedir(), /\(10 mensajes; lo hice hace 3 min\)/);
  R.resumenesGuardados.get(C).get(15).creado -= 2 * MIN;
  unMinutoDespues();
  assert.doesNotMatch(await pedir(), /lo hice/, "a los 5 minutos se hace de nuevo");
  assert.equal(pedidos.length, 3);
});

test("si la IA falla, no queda nada guardado ni hay que esperar", async () => {
  llenar(10, MIN);
  fallaSi = () => true;
  assert.match(await pedir(), /Se me trabó el resumen/);
  assert.equal(R.resumenesGuardados.has(C), false);
  assert.equal(R.ultimoResumen.has(C), false);
  fallaSi = () => false;
  assert.match(await pedir(), /^📝 \*Resumen/);
});

test("un borrado o una edición descartan lo guardado", async () => {
  for (let i = 10; i > 0; i--) CC.recordarMensaje(C, "Ana", `mensaje ${i}`, false, { id: `B${i}`, usuario: "1@lid", fecha: Date.now() - i * MIN });
  await pedir();
  CC.olvidarMensaje(C, "B3");
  unMinutoDespues();
  assert.doesNotMatch(await pedir(), /lo hice/);
  assert.equal(pedidos.length, 2);
  CC.editarMensaje(C, "B4", "otra cosa", ["1@lid"]);
  unMinutoDespues();
  assert.doesNotMatch(await pedir(), /lo hice/);
  assert.equal(pedidos.length, 3);
  assert.doesNotMatch(pedidos[2], /mensaje 3$|mensaje 4$/m);
});

// A newcomer got told what was said before they came in. main.js notes when each one joins (recordarIngreso).
test("a quien recién entró le resume solo lo de desde que entró", async () => {
  const ahora = Date.now();
  const antes = () => {
    for (let i = 10; i > 0; i--) CC.recordarMensaje(C, "Ana", `antes ${i}`, false, { fecha: ahora - (45 + i) * MIN });
  };
  antes();
  CC.recordarIngreso(C, ["555@lid"], ahora - 45 * MIN);
  try {
    for (let i = 6; i > 0; i--) CC.recordarMensaje(C, "Beto", `después ${i}`, false, { fecha: ahora - i * MIN });
    assert.match(await pedir(["6"]), /^📝 \*Resumen de los últimos 45 min\* \(6 mensajes; desde que entraste\)/);
    assert.doesNotMatch(pedidos[0], /antes/);
    assert.match(pedidos[0], /Beto: después 1/);

    CC.contextoChat.delete(C);
    R.ultimoResumen.delete(C);
    antes();
    assert.equal(await pedir(["6"]), "Desde que entraste casi no hubo mensajes, y de lo de antes no te cuento 🤐");
  } finally {
    CC.ingresosGrupo.clear();
  }
});

test("lo guardado no se le da a quien entró después de lo que cubre, y lo de un recién llegado no se guarda", async () => {
  llenar(10, MIN);
  const ahora = Date.now();
  try {
    await pedir();
    // Made 4 minutes ago, it covers from 19 minutes ago: someone who came in 17 minutes ago wasn't there for all of it.
    const hecho = R.resumenesGuardados.get(C).get(15);
    hecho.creado -= 4 * MIN;
    hecho.desde -= 4 * MIN;
    CC.recordarIngreso(C, ["777@lid"], ahora - 17 * MIN);
    unMinutoDespues();
    assert.doesNotMatch(await pedir([], "777@lid"), /lo hice/);
    assert.equal(pedidos.length, 2);

    // A newcomer's own, from when they came in, isn't kept for anybody.
    CC.recordarIngreso(C, ["888@lid"], ahora - 12 * MIN);
    R.resumenesGuardados.delete(C);
    unMinutoDespues();
    assert.match(await pedir([], "888@lid"), /desde que entraste/);
    assert.equal(R.resumenesGuardados.has(C), false);
  } finally {
    CC.ingresosGrupo.clear();
  }
});

test("si es mucho texto, lo resume por partes y después las junta", async () => {
  await conPartes({ caracteres: 2000 }, async () => {
    largos();
    const texto = await pedir(["2h"]);
    assert.match(texto, /^📝 \*Resumen de las últimas 2 h\* \(60 mensajes\)/);
    const partes = pedidos.filter((p) => /, parte \d de \d \(/.test(p));
    assert.ok(partes.length >= 2 && partes.length <= 4, `${partes.length} partes`);
    assert.equal(pedidos.length, partes.length + 1, "una por parte y una que las junta");
    assert.match(partes[0], new RegExp(`parte 1 de ${partes.length} \\(de las? \\d+:\\d{2} a las? \\d+:\\d{2}\\)`));
    assert.match(partes[0], /\n— \d+:\d{2} —\n/, "con las marcas de hora");
    const junta = pedidos.at(-1);
    assert.match(junta, /los resúmenes de las partes de lo que habló el grupo de las últimas 2 h/);
    assert.equal(junta.match(/Se habló del asado\./g)?.length, partes.length);
    assert.match(junta, /de 6 a 10 líneas/);
  });
});

test("si ni por partes entra todo, resume lo más nuevo y dice desde qué hora", async () => {
  await conPartes({ caracteres: 1000, partes: 2 }, async () => {
    largos();
    const texto = await pedir(["2h"]);
    assert.match(texto, /; era demasiado: arranqué a las? \d+:\d{2}\)/);
    assert.equal(pedidos.length, 3);
    assert.ok(pedidos.some((p) => p.includes("mensaje 1 ")), "lo último está");
    assert.ok(!pedidos.some((p) => p.includes("mensaje 60 ")), "lo más viejo quedó afuera");
  });
});

test("si falla una parte, no queda nada guardado ni hay que esperar", async () => {
  await conPartes({ caracteres: 2000 }, async () => {
    largos();
    fallaSi = (texto) => texto.includes(", parte 2 de ");
    assert.match(await pedir(["2h"]), /Se me trabó el resumen/);
    assert.equal(R.resumenesGuardados.has(C), false);
    assert.equal(R.ultimoResumen.has(C), false);
  });
});

test("cuanto más largo el rato, más líneas pide, y con una hora o más lleva las marcas de hora", async () => {
  llenar(300, MIN);
  const casos = [
    [["15m"], "de 4 a 8", false],
    [["2h"], "de 6 a 10", true],
    [["5h"], "de 8 a 12", true],
  ];
  for (const [args, largo, marcas] of casos) {
    unMinutoDespues();
    pedidos = [];
    await pedir(args);
    assert.match(pedidos[0], new RegExp(`${largo} líneas`), args.join(" "));
    assert.match(pedidos[0], /Cubrí todo el período, no solo lo último/);
    assert.equal(/\n— \d+:\d{2} —\n/.test(pedidos[0]), marcas, `${args.join(" ")}: marcas`);
  }
});

test("si el «escribiendo…» falla, el resumen sale igual", async () => {
  llenar(10, MIN);
  const client = {
    ...clienteFalso(),
    sendPresenceUpdate: async () => {
      throw new Error("Connection Closed");
    },
  };
  await Resumen.run({ chat: C, isGroup: true, sender: "555@lid" }, { client, args: [] });
  assert.match(ultimoEnviado().msg.text, /^📝 \*Resumen/);
});

test("el aviso de esperar redondea para arriba: nunca «0 s», y en el mismo momento, 1 minuto", async () => {
  llenar(10, MIN);
  const ahora = Date.now();
  await R.pedirResumen(C, "555@lid", ["15m"], { ahora });
  const espera = async (despues) => (await R.pedirResumen(C, "555@lid", ["30m"], { ahora: ahora + despues })).texto;
  assert.equal(await espera(0), "Recién hice un resumen; esperá 1 min para pedir otro.");
  assert.equal(await espera(30_000), "Recién hice un resumen; esperá 30 s para pedir otro.");
  assert.equal(await espera(59_500), "Recién hice un resumen; esperá 1 s para pedir otro.");
});

// ---------- a long while ----------
// A summary of 6 hours came back "se me trabó" where one of 2 worked: it's one much bigger request, or up to five of
// the biggest in a row, each with the time and the room of a chat reply, and one that failed threw it all away.

// Gemini fails the first n requests of the prompts that match: with 500, each model is asked twice (lib/gemini.js), so
// six failures are one whole try of the three models.
const UN_INTENTO = 6;
function fallaLasPrimeras(n, cuales = () => true) {
  let van = 0;
  fallaSi = (texto) => cuales(texto) && van++ < n;
}

test("cada pedido va como un texto largo: con más lugar para contestar que una respuesta de la charla", async () => {
  llenar(10, MIN);
  await pedir();
  assert.equal(cuerpos.length, 1);
  assert.equal(cuerpos[0].generationConfig.maxOutputTokens, Gemini.LIMITES.TOKENS_LARGO);
  assert.ok(Gemini.LIMITES.TOKENS_LARGO > Gemini.LIMITES.TOKENS && Gemini.LIMITES.TIMEOUT_LARGO_MS > Gemini.LIMITES.TIMEOUT_MS);
  // The parts and the one that joins them, too.
  unMinutoDespues();
  await conPartes({ caracteres: 2000 }, async () => {
    largos();
    await pedir(["2h"]);
    assert.ok(cuerpos.length >= 4);
    assert.ok(cuerpos.every((c) => c.generationConfig.maxOutputTokens === Gemini.LIMITES.TOKENS_LARGO));
  });
});

test("un pedido que falla se vuelve a hacer una vez, después de esperar", async () => {
  llenar(10, MIN);
  fallaLasPrimeras(UN_INTENTO);
  assert.match(await pedir(), /^📝 \*Resumen de los últimos 15 min\* \(10 mensajes\)\n\nSe habló del asado\.$/);
  assert.equal(llamadas, UN_INTENTO + 1);
  assert.deepEqual(esperas, [5000]);
  assert.deepEqual([R.RESUMENES.REINTENTOS, R.RESUMENES.ESPERA_REINTENTO_MS], [1, 5000]);

  // And when it goes well at once, nothing waits.
  unMinutoDespues();
  esperas = [];
  llenar(3, MIN, { prefijo: "otro" });
  await pedir(["20m"]);
  assert.deepEqual(esperas, []);
});

test("por partes: la que falla una vez no tira el resumen, y la que falla dos sí", async () => {
  await conPartes({ caracteres: 2000 }, async () => {
    largos();
    fallaLasPrimeras(UN_INTENTO, (texto) => texto.includes(", parte 2 de "));
    assert.match(await pedir(["2h"]), /^📝 \*Resumen de las últimas 2 h\* \(60 mensajes\)/);
    assert.equal(esperas.length, 1, "una sola espera: la de la parte que falló");
    assert.equal(pedidos.filter((p) => p.includes(", parte 2 de ")).length, 1);
    assert.match(pedidos.at(-1), /los resúmenes de las partes/);

    // Twice in a row, it's given up: the parts after it aren't asked, and neither is the one that joins them.
    unMinutoDespues();
    R.resumenesGuardados.delete(C);
    pedidos = [];
    esperas = [];
    fallaLasPrimeras(2 * UN_INTENTO, (texto) => texto.includes(", parte 2 de "));
    assert.match(await pedir(["2h"]), /Se me trabó el resumen/);
    assert.equal(esperas.length, 1);
    assert.deepEqual(pedidos.map((p) => p.match(/, parte (\d) de /)?.[1]), ["1"]);
    assert.equal(R.ultimoResumen.has(C), false);
  });
});

test("la que junta las partes también se vuelve a pedir", async () => {
  await conPartes({ caracteres: 2000 }, async () => {
    largos();
    fallaLasPrimeras(UN_INTENTO, (texto) => texto.includes("los resúmenes de las partes"));
    assert.match(await pedir(["2h"]), /^📝 \*Resumen de las últimas 2 h\*/);
    assert.equal(esperas.length, 1);
  });
});

test("sin cuota por hoy no insiste: lo dice y listo", async () => {
  llenar(10, MIN);
  const enPausa = new Map(Gemini.geminiEnPausa);
  for (const modelo of Gemini.MODELOS) Gemini.geminiEnPausa.set(modelo, { hasta: Date.now() + 6 * HORA, pausaMs: 4 * HORA });
  try {
    assert.match(await pedir(), /Se me acabó la cuota de la IA por hoy/);
    assert.equal(llamadas, 0);
    assert.deepEqual(esperas, []);
    assert.equal(R.ultimoResumen.has(C), false);
  } finally {
    Gemini.geminiEnPausa.clear();
    for (const [modelo, pausa] of enPausa) Gemini.geminiEnPausa.set(modelo, pausa);
  }
});

// A long one takes more than the minute between summaries: asked again meanwhile it said "recién hice un resumen"
// before having made any, and past the minute a second one started alongside, asking the same parts again.
test("mientras arma uno, el que pide otro se entera, y no arranca un segundo", async () => {
  llenar(10, MIN);
  let soltar;
  frenar = new Promise((resolve) => (soltar = resolve));
  const primero = pedir();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(llamadas, 1, "el primero ya le preguntó a la IA");
  assert.ok(R.resumenesEnCurso.has(C));
  const otro = (ahora) => R.pedirResumen(C, "777@lid", [], { ahora });
  assert.deepEqual(await otro(Date.now()), { texto: "Ya estoy armando un resumen; aguantá, que en un rato sale." });
  assert.deepEqual(await otro(Date.now() + 5 * MIN), { texto: "Ya estoy armando un resumen; aguantá, que en un rato sale." }, "ni pasado el minuto entre resúmenes");
  assert.equal(llamadas, 1, "y no se le preguntó nada más a la IA");
  // Asked for another while that isn't kept, either.
  assert.match((await R.pedirResumen(C, "777@lid", ["1h"], { ahora: Date.now() })).texto, /^Ya estoy armando un resumen/);
  // It's each chat's: another group's summary goes its way.
  const OTRO = "resumen-otro@g.us";
  for (let i = 10; i > 0; i--) CC.recordarMensaje(OTRO, "Beto", `otro grupo ${i}`, false, { fecha: Date.now() - i * MIN });
  const elDelOtro = R.pedirResumen(OTRO, "777@lid", [], {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(llamadas, 2, "el del otro grupo también le preguntó a la IA");
  soltar();
  assert.match(await primero, /^📝 \*Resumen de los últimos 15 min\*/);
  assert.match((await elDelOtro).texto, /^📝 \*Resumen de los últimos 15 min\* \(10 mensajes\)/);
  assert.equal(llamadas, 2);
  assert.equal(R.resumenesEnCurso.has(C), false);
  // Made, the same request gets it from what's kept; and one that fails leaves nothing in course.
  assert.match(await pedir(), /\(10 mensajes; lo hice recién\)/);
  assert.equal(llamadas, 2);
  unMinutoDespues();
  fallaSi = () => true;
  assert.match(await pedir(["30m"]), /Se me trabó el resumen/);
  assert.equal(R.resumenesEnCurso.has(C), false);
});

test("un resumen tiene un tiempo: pasado, no se empieza otra parte ni se vuelve a preguntar", async () => {
  const relojReal = R._dep.ahora;
  let ahora = Date.now();
  R._dep.ahora = () => ahora;
  try {
    await conPartes({ caracteres: 2000 }, async () => {
      largos();
      // The clock jumps past the limit while the first part is being answered.
      const fetchAntes = globalThis.fetch;
      globalThis.fetch = async (...args) => {
        ahora += R.RESUMENES.TIEMPO_MAX_MS;
        return fetchAntes(...args);
      };
      try {
        assert.match(await pedir(["2h"]), /Se me trabó el resumen/);
        assert.equal(pedidos.length, 1, "la primera parte y ninguna más");
        // And a request that fails once the time is up isn't asked again.
        unMinutoDespues();
        pedidos = [];
        llamadas = 0;
        fallaSi = () => true;
        assert.match(await pedir(["2h"]), /Se me trabó el resumen/);
        assert.equal(llamadas, UN_INTENTO);
        assert.deepEqual(esperas, []);
      } finally {
        globalThis.fetch = fetchAntes;
      }
    });
    assert.equal(R.RESUMENES.TIEMPO_MAX_MS, 3 * MIN);
  } finally {
    R._dep.ahora = relojReal;
  }
});
