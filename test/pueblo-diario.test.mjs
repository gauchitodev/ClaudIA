import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, fijarSaldo } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";
import { configuracion } from "../lib/configuracion.js";

// The Sunday paper (lib/pueblo-diario.js, lib/tapa.js, plugins/pueblo-eco.js): the week's headlines out of what the
// town registered and the timba, the quiet week that fills itself, the edition kept for Claudia to quote, the front
// page drawn by code, Gemini's optional picture (off unless asked, with its cap, and the drawn one when it fails), and
// the recap it goes out with.
let F, P, D, T, R, A, Eco, client;
const ANA = "300000000000071@lid";
const BETO = "300000000000072@lid";
const CARLA = "300000000000073@lid";
const DIA = 24 * 60 * 60 * 1000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

before(async () => {
  ({ F } = await prepararBase("pueblo-diario"));
  P = await import("../lib/pueblo.js");
  D = await import("../lib/pueblo-diario.js");
  T = await import("../lib/tapa.js");
  R = await import("../lib/recap.js");
  A = await import("../lib/actividad.js");
  Eco = (await import("../plugins/pueblo-eco.js")).default;
});
beforeEach(() => {
  client = clienteFalso();
  conexion.client = client;
  P._dep.azar = () => 0;
  D._dep.azar = () => 0;
  configuracion.geminiApiKey = "";
  configuracion.pueblo = {};
  D._dep.fetch = async () => {
    throw new Error("sin red en las pruebas");
  };
});

function grupo(chat, { conPueblo = true } = {}) {
  for (const [quien, nombre] of [[ANA, "Ana"], [BETO, "Beto"], [CARLA, "Carla"]]) F.initDataDB({ chat, sender: quien, senderJid: "", pushName: nombre });
  if (conPueblo) {
    P.nacer(chat, "Villa Prueba");
    F.updateChat(chat, { pueblo: 1 });
  }
}
const dimensiones = (png) => ({ ancho: png.readUInt32BE(16), alto: png.readUInt32BE(20) });

test("eco: sin pueblo no hay diario", () => {
  const chat = "sin@g.us";
  grupo(chat, { conPueblo: false });
  assert.equal(D.armarDiario(chat), null);
});

test("eco: los titulares salen de lo que pasó, lo más jugoso primero y uno de cada cosa", () => {
  const chat = "titulares@g.us";
  grupo(chat);
  P.registrarHecho(chat, "coima", { usuario: BETO });
  P.registrarHecho(chat, "coima", { usuario: CARLA });
  P.registrarHecho(chat, "apodo", { usuario: CARLA, apodo: "el Coimero de la Ruta 5" });
  P.registrarHecho(chat, "empresa_fundada", { usuario: ANA, nombre: "Fletes Ana", tipo: "camionero" });
  P.registrarHecho(chat, "espia_descubierto", { usuario: BETO, emoji: "🦊", denunciante: CARLA });
  const d = D.armarDiario(chat);
  assert.equal(d.nombre, "El Eco de Villa Prueba");
  assert.deepEqual(d.titulares.map((t) => t.tipo), ["empresa_fundada", "espia_descubierto", "apodo", "coima"]);
  assert.equal(d.titulares[0].titulo, "Abre Fletes Ana: Ana ya tiene empresa propia");
  assert.equal(d.titulares[0].caption.titulo, "Abre Fletes Ana: @300000000000071 ya tiene empresa propia");
  assert.match(d.titulares[3].titulo, /Ola de coimas en el pueblo: 2 en la semana/);
  assert.deepEqual(new Set(d.mentions), new Set([ANA, BETO, CARLA]));
  const texto = D.textoDelDiario(d);
  assert.match(texto, /^📰 \*EL ECO DE VILLA PRUEBA\* · N\.º 1/);
  assert.match(texto, /Cae un espía \(🦊\): era @300000000000072/);
  assert.match(texto, /💬 «/);
  // What's older than the week isn't news.
  assert.equal(D.noticiasDeLaSemana(chat, Date.now() + 1000).length, 0);
});

test("eco: una semana tranquila se llena sola, y el que se fundió en la timba es noticia", () => {
  const chat = "tranquilo@g.us";
  grupo(chat);
  const d = D.armarDiario(chat);
  assert.equal(d.titulares.length, D.DIARIO.TITULARES_MIN);
  assert.ok(d.titulares.every((t) => t.tipo === "relleno"));
  fijarSaldo(F, chat, BETO, 1000);
  F.moverCoins(chat, BETO, -600, "casino_ruleta");
  F.moverCoins(chat, BETO, 50, "casino_ruleta_premio");
  const con = D.armarDiario(chat);
  assert.equal(con.titulares[0].tipo, "fundido");
  assert.equal(con.titulares[0].titulo, "Beto se fundió en la timba: perdió 550 UruCoins");
});

test("eco: la tapa se dibuja por código, en PNG y del tamaño de siempre, aunque los textos traigan emojis o sean largos", async () => {
  const chat = "tapa@g.us";
  grupo(chat);
  P.registrarHecho(chat, "evento", { clave: "temporal", nombre: "Temporal", emoji: "⛈️" });
  for (const tipo of ["robo_empresa", "obra", "changa_vacia"]) P.registrarHecho(chat, tipo, { usuario: ANA, nombre: "Una empresa con un nombre larguísimo que no entra 🚛🚛", monto: 100, que: "puso luminarias", costo: 400, titulo: "Mudanza" });
  const r = await D.publicarDiario(chat, Date.now(), { conIlustracion: false });
  assert.deepEqual(r.imagen.subarray(0, 4), PNG);
  assert.deepEqual(dimensiones(r.imagen), { ancho: T.TAPA.ANCHO, alto: T.TAPA.ALTO });
  assert.equal(r.ilustrada, false);
  // What the font can't draw is left out of the page.
  const { loadFont } = await import("jimp");
  const font = await loadFont(`${import.meta.dirname}/../resources/tapa/serif-30.fnt`);
  assert.equal(T.paraLaFuente("Cae un espía (🦊): era Beto 🚛", font), "Cae un espía: era Beto");
  assert.equal(T.paraLaFuente("Ñandú, «año» — 1.500 €", font), "Ñandú, «año» — 1.500 €");
});

test("eco: cada semana se guarda una vez, y Claudia se acuerda de los titulares", async () => {
  const chat = "guardado@g.us";
  grupo(chat);
  assert.equal(D.diarioParaPrompt(chat), "");
  P.registrarHecho(chat, "empresa_fundada", { usuario: ANA, nombre: "Tambo La Porfiada", tipo: "tambero" });
  const r = await D.publicarDiario(chat, Date.now(), { semana: "2026-11-23", conIlustracion: false });
  assert.equal(r.diario.numero, 1);
  const otra = await D.publicarDiario(chat, Date.now(), { semana: "2026-11-23", conIlustracion: false });
  assert.equal(otra.diario.numero, 1, "rehecha, es el mismo número");
  assert.equal(D.edicionesDe(chat).length, 1);
  assert.match(D.diarioParaPrompt(chat), /El Eco de Villa Prueba.*«Abre Tambo La Porfiada: Ana ya tiene empresa propia»/);
  const siguiente = await D.publicarDiario(chat, Date.now() + 7 * DIA, { semana: "2026-11-30", conIlustracion: false });
  assert.equal(siguiente.diario.numero, 2);
});

test("eco: la ilustración de Gemini viene apagada; prendida, respeta el tope del mes y si falla sale la dibujada", async () => {
  const chat = "gemini@g.us";
  grupo(chat);
  const tapaChica = await T.dibujarTapa(D.armarDiario(chat));
  let pedidos = 0;
  let cuerpo = null;
  D._dep.fetch = async (url, opciones) => {
    pedidos++;
    cuerpo = JSON.parse(opciones.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "listo" }, { inlineData: { mimeType: "image/png", data: tapaChica.toString("base64") } }] } }] }) };
  };
  // Off by default, even with a key.
  configuracion.geminiApiKey = "clave";
  assert.equal(await D.ilustrar({ titulo: "Algo", bajada: "Pasó" }, "Villa Prueba"), null);
  assert.equal(pedidos, 0);
  // On: it asks for an image, and what comes counts towards the month.
  configuracion.pueblo = { ilustraciones: true, ilustraciones_mes: 1 };
  const r = await D.publicarDiario(chat, Date.now(), { conIlustracion: true });
  assert.equal(r.ilustrada, true);
  assert.equal(pedidos, 1);
  assert.deepEqual(cuerpo.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
  assert.equal(D.ilustracionesDelMes(), 1);
  // The month's cap is used up: no more asking, and the page is the drawn one.
  const otra = await D.publicarDiario(chat, Date.now(), { conIlustracion: true });
  assert.equal(otra.ilustrada, false);
  assert.equal(pedidos, 1);
  // A failure is the drawn page too.
  configuracion.pueblo.ilustraciones_mes = 10;
  D._dep.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const fallida = await D.publicarDiario(chat, Date.now(), { conIlustracion: true });
  assert.equal(fallida.ilustrada, false);
  assert.deepEqual(fallida.imagen.subarray(0, 4), PNG);
});

test("eco: el domingo sale con la recap, en un solo mensaje con la tapa", async () => {
  const chat = "recap@g.us";
  grupo(chat);
  F.updateChat(chat, { recapSemanal: 1 });
  const otro = "recapsinpueblo@g.us";
  grupo(otro, { conPueblo: false });
  F.updateChat(otro, { recapSemanal: 1 });
  for (const c of [chat, otro]) for (const quien of [ANA, BETO]) F.sumarMensajeDiario(c, quien, A.claveDia(new Date()));
  P.registrarHecho(chat, "apodo", { usuario: BETO, apodo: "la Leyenda del Tambo" });
  A.ACTIVIDAD.DIA_RECAP = new Date().getDay();
  A.ACTIVIDAD.HORA_RECAP = 0;
  await R.chequearRecapSemanal();
  const aca = globalThis.enviados.filter((e) => e.chat === chat);
  assert.equal(aca.length, 1, "un solo mensaje");
  assert.deepEqual(aca[0].msg.image.subarray(0, 4), PNG);
  assert.match(aca[0].msg.caption, /^📰 \*EL ECO DE VILLA PRUEBA\*/);
  assert.match(aca[0].msg.caption, /RECAP DE LA SEMANA/);
  assert.ok(aca[0].msg.mentions.includes(BETO));
  assert.equal(D.edicionesDe(chat).length, 1);
  // Without a town, the recap as always.
  const alla = globalThis.enviados.filter((e) => e.chat === otro);
  assert.equal(alla.length, 1);
  assert.match(alla[0].msg.text, /^📅 \*RECAP DE LA SEMANA\*/);
});

test("eco: .eco muestra la tapa de la semana y no se puede pedir de nuevo enseguida", async () => {
  const chat = "comando@g.us";
  grupo(chat);
  const m = { chat, sender: ANA, senderJid: "", text: ".eco", isGroup: true, message: {} };
  await Eco.run(m, { client, command: "eco", args: [] });
  const enviado = globalThis.enviados.at(-1);
  assert.deepEqual(enviado.msg.image.subarray(0, 4), PNG);
  assert.match(enviado.msg.caption, /el número de verdad sale el domingo/);
  assert.equal(D.edicionesDe(chat).length, 0, "la vista previa no es un número");
  await Eco.run(m, { client, command: "eco", args: [] });
  assert.match(globalThis.enviados.at(-1).msg.text, /La imprenta está caliente/);
  const sin = "ecosinpueblo@g.us";
  grupo(sin, { conPueblo: false });
  await Eco.run({ ...m, chat: sin }, { client, command: "eco", args: [] });
  assert.match(globalThis.enviados.at(-1).msg.text, /Sin pueblo no hay diario/);
});

test("eco: cada tipo de hecho que es noticia tiene su titular", () => {
  for (const [tipo, def] of Object.entries(P.HECHOS)) {
    const peso = typeof def.titular === "function" ? 1 : def.titular;
    if (peso > 0) assert.ok(D.TITULARES[tipo], tipo);
  }
  for (const clave of Object.keys(P.EVENTOS)) assert.ok(D.TITULARES.evento({ clave }, (u) => u, P.estadoDe("titulares@g.us")).titulo, clave);
});
