import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

let A, P;
before(async () => {
  await prepararBase("aero");
  A = await import("../lib/aero.js");
  P = (await import("../plugins/aero.js")).default;
});

// respuesta real de la API de la NOAA para Carrasco (6/9/2026 02:00Z)
const SUMU = { icaoId: "SUMU", reportTime: "2026-09-06T02:00:00.000Z", temp: 7, dewp: 3, wdir: 190, wspd: 19, visib: "6+", altim: 1028, rawOb: "METAR SUMU 060200Z 19019KT 9999 FEW012 BKN033 OVC060 07/03 Q1028 TEMPO 5000 SHRA", name: "Carrasco Intl, CA, UY", clouds: [{ cover: "FEW", base: 1200 }, { cover: "BKN", base: 3300 }, { cover: "OVC", base: 6000 }], fltCat: "VFR" };
const SULS = { icaoId: "SULS", reportTime: "2026-09-06T02:00:00.000Z", temp: 8, dewp: 1, wdir: 200, wspd: 13, wgst: 23, visib: "6+", altim: 1026, rawOb: "METAR SULS 060200Z 20013G23KT 9999 SCT030 08/01 Q1026", name: "Laguna del Sauce, MA, UY", clouds: [{ cover: "SCT", base: 3000 }], fltCat: "VFR" };
const AHORA = Date.parse("2026-09-06T02:21:00.000Z");
const respuesta = (status, cuerpo) => ({ status, ok: status >= 200 && status < 300, json: async () => cuerpo, text: async () => cuerpo });

test("aero: resuelve códigos ICAO y nombres, con tope y sin repetidos", () => {
  assert.deepEqual(A.resolverEstaciones(""), { icaos: ["SUMU"], invalidas: [] });
  assert.deepEqual(A.resolverEstaciones("suls"), { icaos: ["SULS"], invalidas: [] });
  assert.deepEqual(A.resolverEstaciones("Carrasco, punta Paysandú"), { icaos: ["SUMU", "SULS", "SUPU"], invalidas: [] });
  assert.deepEqual(A.resolverEstaciones("sumu SUMU carrasco"), { icaos: ["SUMU"], invalidas: [] });
  assert.deepEqual(A.resolverEstaciones("xx sumu ezeiza"), { icaos: ["SUMU", "SAEZ"], invalidas: ["xx"] });
  assert.equal(A.resolverEstaciones("sumu suls saez sabe sbpa").icaos.length, A.AERO.MAX_ESTACIONES);
});

test("aero: decodifica un METAR real en español", () => {
  const t = A.decodificarMetar(SUMU, AHORA);
  assert.equal(
    t,
    [
      "✈️ *SUMU* Carrasco Intl · 02:00Z (hace 21 min)",
      "🌬️ Viento 190° 19 kt",
      "👁️ Visibilidad 10 km o más",
      "☁️ Nubes: FEW pocas a 1200 ft, BKN quebradas a 3300 ft, OVC cubierto a 6000 ft",
      "🌡️ 7 °C · rocío 3 °C · QNH 1028 hPa",
      "🛫 Categoría 🟢 VFR",
      "🔜 Tendencia: TEMPO 5000 SHRA",
      "`METAR SUMU 060200Z 19019KT 9999 FEW012 BKN033 OVC060 07/03 Q1028 TEMPO 5000 SHRA`",
    ].join("\n"),
  );
  const s = A.decodificarMetar(SULS, AHORA);
  assert.match(s, /🌬️ Viento 200° 13 kt \(ráfagas 23\)/);
  assert.match(s, /☁️ Nubes: SCT dispersas a 3000 ft/);
  assert.doesNotMatch(s, /Tendencia/);
  const niebla = A.decodificarMetar({ icaoId: "SUAA", rawOb: "METAR SUAA 060900Z 00000KT 0400 FG VV002 12/12 Q1020", wdir: 0, wspd: 0, visib: 0.25, temp: 12, dewp: 12, altim: 1020, fltCat: "LIFR", clouds: [{ cover: "OVX", base: 200 }] }, AHORA);
  assert.match(niebla, /🌬️ Viento calma\n👁️ Visibilidad 400 m\n🌧️ niebla\n☁️ Nubes: OVX oscurecido a 200 ft/);
  assert.match(niebla, /🛫 Categoría 🟣 LIFR/);
  const despejado = A.decodificarMetar({ icaoId: "SUSO", rawOb: "METAR SUSO 061200Z 09008KT CAVOK 15/06 Q1022", wdir: 90, wspd: 8, temp: 15, dewp: 6, altim: 1022, clouds: [{ cover: "CAVOK" }] }, AHORA);
  assert.match(despejado, /👁️ Visibilidad 10 km o más \(CAVOK\)\n☁️ Cielo despejado/);
  const chubascos = A.decodificarMetar({ icaoId: "SAEZ", rawOb: "METAR SAEZ 060300Z 15012KT 3000 -SHRA BR BKN008 OVC020 14/13 Q1015", wdir: 150, wspd: 12, visib: 1.86, temp: 14, dewp: 13, altim: 1015, clouds: [{ cover: "BKN", base: 800 }] }, AHORA);
  assert.match(chubascos, /👁️ Visibilidad 3 km\n🌧️ débil chubascos de lluvia, neblina/);
});

test("aero: pide a la NOAA con caché, y arma los textos de .metar y .taf", async () => {
  const llamadas = [];
  A._dep.fetch = async (url) => {
    llamadas.push(url);
    if (url.includes("/metar?ids=SUMU%2CSULS&")) return respuesta(200, [SUMU, SULS]);
    if (url.includes("/metar?ids=SUMU&")) return respuesta(200, [SUMU]);
    if (url.includes("/metar?ids=ZZZZ&")) return respuesta(204, "");
    if (url.includes("/taf?ids=SUMU&")) return respuesta(200, "TAF SUMU 052330Z 0600/0624 20018KT 9999 BKN026\n  TEMPO 0600/0610 20018G28KT 5000 SHRA BKN023\n");
    if (url.includes("/taf?ids=SUMO&")) return respuesta(204, "");
    if (url.includes("/metar?ids=SUMO&")) return respuesta(500, "error");
    throw new Error("url inesperada " + url);
  };
  let t = await A.textoMetar("", AHORA);
  assert.match(t, /^✈️ \*SUMU\* Carrasco Intl · 02:00Z/);
  await A.textoMetar("carrasco", AHORA);
  assert.equal(llamadas.length, 1, "la segunda consulta sale del caché");
  t = await A.textoMetar("sumu punta", AHORA);
  assert.match(t, /\*SUMU\*[\s\S]*\n\n✈️ \*SULS\* Laguna del Sauce/);
  t = await A.textoMetar("zzzz", AHORA);
  assert.match(t, /\*ZZZZ\*: sin METAR reciente/);
  t = await A.textoMetar("sumu x", AHORA);
  assert.match(t, /No entendí "x": usá el código ICAO/);
  t = await A.textoMetar("melo", AHORA);
  assert.match(t, /No pude consultar la NOAA ahora \(la NOAA respondió 500\)/);
  t = await A.textoTaf("", AHORA);
  assert.match(t, /📋 \*TAF\* SUMU \(horas en UTC\)\n```TAF SUMU 052330Z[\s\S]*SHRA BKN023```/);
  t = await A.textoTaf("melo", AHORA);
  assert.match(t, /Sin TAF para SUMO/);
  assert.match(A.textoMenuAero(), /✈️ \*MENÚ AERO\*[\s\S]*carrasco → SUMU/);
  // el plugin
  const cliente = globalThis.client;
  await P.run({ chat: G, sender: "111@lid" }, { client: cliente, command: "metar", text: "" });
  assert.match(ultimoEnviado().msg.text, /Carrasco Intl/);
  await P.run({ chat: G, sender: "111@lid" }, { client: cliente, command: "menuaero", text: "" });
  assert.match(ultimoEnviado().msg.text, /MENÚ AERO/);
});
