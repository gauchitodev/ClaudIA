import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

let A, P, Cc;
before(async () => {
  await prepararBase("aero");
  A = await import("../lib/aero.js");
  Cc = await import("../lib/aero-calculos.js");
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
    throw new Error(`url inesperada ${url}`);
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

// ---------- SIGMET, viento cruzado y sol ----------
const SIGMET_SUEO = { icaoId: "SUMU", firId: "SUEO", firName: "SUEO MONTEVIDEO", validTimeFrom: 1788658200, validTimeTo: 1788672600, seriesId: "1", hazard: "ICE", qualifier: "SEV", base: 3000, top: 8000, dir: "E", spd: "05", chng: "NC", rawSigmet: "WSUY31 SUMU 060125\nSUEO SIGMET 1 VALID 060130/060530 SUMU-\nSUEO MONTEVIDEO FIR SEV ICE FCST WI S3259W05805 S3239W05310 FL030/080 MOV E 05KT NC=" };
const SIGMET_SBCW = { icaoId: "SBGL", firId: "SBCW", firName: "SBCW CURITIBA", validTimeFrom: 1788651000, validTimeTo: 1788665400, seriesId: "96", hazard: "TS", qualifier: "EMBD", base: null, top: 45000, dir: "-", spd: "0", chng: "NC", rawSigmet: "WSBZ23 SBGL 052325\nSBCW SIGMET 96 VALID 052330/060330 SBCW - SBCW CURITIBA FIR EMBD TS FCST" };
const SIGMET_VIEJO = { ...SIGMET_SUEO, seriesId: "0", validTimeFrom: 1788600000, validTimeTo: 1788610000 };

test("aero: SIGMET de la FIR Montevideo, filtrado y descrito", async () => {
  const ahora = 1788663480000; // 2026-09-06 02:58Z, dentro de la vigencia del SIGMET 1
  A._dep.fetch = async (url) => (url.includes("/isigmet?format=json") ? respuesta(200, [SIGMET_SBCW, SIGMET_VIEJO, SIGMET_SUEO]) : respuesta(500, "x"));
  const t = await A.textoSigmet(ahora);
  assert.equal(
    t,
    [
      "⚠️ *SIGMET · FIR Montevideo (SUEO)* · consultado 02:58Z",
      "",
      "*SIGMET 1* · engelamiento severo",
      "⏱️ 01:30Z a 05:30Z (quedan 2 h 32 min)",
      "📏 FL030 a FL080 · se mueve al E a 5 kt · sin cambios",
      "`WSUY31 SUMU 060125 SUEO SIGMET 1 VALID 060130/060530 SUMU- SUEO MONTEVIDEO FIR SEV ICE FCST WI S3259W05805 S3239W05310 FL030/080 MOV E 05KT NC=`\n\n_Fuente: NOAA, Aviation Weather Center._",
    ].join("\n"),
  );
  assert.match(A.describirSigmet(SIGMET_SBCW, ahora), /\*SIGMET 96\* · tormentas embebidas\n⏱️ 23:30Z a 03:30Z \(quedan 32 min\)\n📏 hasta FL450 · estacionario · sin cambios/);
  assert.match(A.describirSigmet({ ...SIGMET_SBCW, hazard: "VA", qualifier: "ETNA", chng: "INTSF", dir: "NE", spd: "15" }, ahora), /ceniza volcánica del volcán ETNA[\s\S]*se mueve al NE a 15 kt · intensificándose/);
  const sin = await A.textoSigmet(ahora + 4 * 3600e3 + 60e3); // ya venció el 1 (y el caché sigue vigente 5 min, así que no vuelve a pedir)
  assert.match(sin, /✅ Sin SIGMET vigente/);
});

test("aero: viento cruzado con los parámetros indicados", () => {
  const C = Cc;
  const r = C.vientoCruzado(60, 190, 19);
  assert.equal(Math.round(r.actual.frente), -12);
  assert.equal(Math.round(r.actual.cruzada), 15);
  assert.equal(r.actual.lado, "derecha");
  assert.deepEqual([r.opuesta.rumbo, Math.round(r.opuesta.frente), r.opuesta.lado], [240, 12, "izquierda"]);
  assert.deepEqual([C.rumboDePista("06"), C.rumboDePista("6"), C.rumboDePista("060"), C.rumboDePista("24L"), C.rumboDePista("36"), C.rumboDePista("x")], [60, 60, 60, 240, 360, null]);
  assert.deepEqual(C.parsearCruzado("06 19019G25KT"), { rumbo: 60, pista: "06", dir: 190, vel: 19, rafaga: 25 });
  assert.deepEqual(C.parsearCruzado("24 190/19"), { rumbo: 240, pista: "24", dir: 190, vel: 19, rafaga: null });
  assert.deepEqual(C.parsearCruzado("060 190 19 G 25"), { rumbo: 60, pista: "060", dir: 190, vel: 19, rafaga: 25 });
  assert.match(C.parsearCruzado("06").error, /Uso: \.cruzado/);
  assert.match(C.parsearCruzado("06 VRB05KT").error, /viento variable/);
  assert.match(C.parsearCruzado("06 abc").error, /No entendí el viento/);
  const t = C.textoCruzado("06 190 19G25");
  assert.equal(
    t,
    [
      "✈️ *Viento cruzado* · pista 06 (060°) · viento 190° 19 kt con ráfagas de 25",
      "🟡 Cruzada: 15 kt desde la derecha",
      "🔴 De cola: 12 kt",
      "💨 Con la ráfaga: cruzada 19 kt, de cola 16 kt",
      "↩️ Pista 24 (240°): 12 kt de frente, cruzada 15 kt desde la izquierda. Conviene la 24.",
    ].join("\n"),
  );
  assert.match(C.textoCruzado("19 190 10"), /🟢 Sin cruzada\n🟢 De frente: 10 kt\n↩️ Pista 01 \(010°\): 10 kt de cola\./);
  assert.match(C.textoCruzado("36 090 20"), /🔴 Cruzada: 20 kt desde la derecha\n⚪ Sin componente de frente ni de cola/);
});

test("aero: salida y puesta del sol contra referencias de Open-Meteo, y el comando por ciudad", async () => {
  const C = Cc;
  const minutosLocal = (ms, tz) => { const [h, m] = C.horaEn(ms, tz).split(":").map(Number); return h * 60 + m; };
  const cerca = (ms, tz, esperado, etiqueta) => { const [h, m] = esperado.split(":").map(Number); assert.ok(Math.abs(minutosLocal(ms, tz) - (h * 60 + m)) <= 2, `${etiqueta}: ${C.horaEn(ms, tz)} vs ${esperado}`); };
  let ev = C.eventosSolares(-34.9033, -56.1882, 2026, 9, 6);
  cerca(ev.salida, "America/Montevideo", "06:56", "Montevideo sale");
  cerca(ev.puesta, "America/Montevideo", "18:29", "Montevideo se pone");
  assert.ok(ev.crepusculoInicio < ev.salida && ev.crepusculoFin > ev.puesta);
  ev = C.eventosSolares(-54.8019, -68.303, 2026, 6, 21);
  cerca(ev.salida, "America/Argentina/Ushuaia", "09:58", "Ushuaia sale");
  cerca(ev.puesta, "America/Argentina/Ushuaia", "17:11", "Ushuaia se pone");
  ev = C.eventosSolares(60.1699, 24.9384, 2026, 6, 21);
  cerca(ev.salida, "Europe/Helsinki", "03:54", "Helsinki sale");
  cerca(ev.puesta, "Europe/Helsinki", "22:49", "Helsinki se pone");
  assert.equal(C.eventosSolares(78.22, 15.63, 2026, 6, 21).polar, "dia", "Longyearbyen en junio: sol de medianoche");
  assert.equal(C.eventosSolares(78.22, 15.63, 2026, 12, 21).polar, "noche");
  // el comando: geocodifica con Open-Meteo (inyectado) y arma el texto en hora local
  A._dep.fetch = async (url) => {
    if (url.includes("search?name=Montevideo")) return respuesta(200, { results: [{ name: "Montevideo", country: "Uruguay", admin1: "Departamento de Montevideo", latitude: -34.90328, longitude: -56.18816, timezone: "America/Montevideo" }] });
    if (url.includes("search?name=Xyzzy")) return respuesta(200, {});
    throw new Error(`url inesperada ${url}`);
  };
  const ahora = Date.parse("2026-09-06T15:00:00Z"); // 12:00 en Montevideo
  let t = await A.textoSolDe("", ahora);
  assert.match(t, /^☀️ \*Montevideo, Uruguay\* · 06\/09 · hora local\n🌅 Sale 06:5\d · 🌇 se pone 18:(29|3\d|28) · día de 11 h 3\d min\n🌆 Crepúsculo civil: de 06:\d\d a 06:5\d y de 18:\d\d a 18:5\d\nAhora: el sol está arriba\.\n_Fuente: ubicación de Open-Meteo; los horarios son cálculo propio\._$/);
  t = await A.textoSolDe("montevideo", Date.parse("2026-09-06T23:00:00Z"));
  assert.match(t, /Ahora: ya es de noche\./);
  assert.match(await A.textoSolDe("Xyzzy", ahora), /No encontré "Xyzzy"/);
  const cliente = globalThis.client;
  await P.run({ chat: G, sender: "111@lid" }, { client: cliente, command: "cruzado", text: "06 190 19" });
  assert.match(ultimoEnviado().msg.text, /Viento cruzado/);
  await P.run({ chat: G, sender: "111@lid" }, { client: cliente, command: "sol", text: "Montevideo" });
  assert.match(ultimoEnviado().msg.text, /☀️ \*Montevideo, Uruguay\*/);
});

test("aero: rumbo recíproco de rumbos y de pistas", () => {
  assert.equal(Cc.reciproco(45), 225);
  assert.equal(Cc.reciproco(270), 90);
  assert.equal(Cc.reciproco(180), 360);
  assert.equal(Cc.reciproco(360), 180);
  assert.deepEqual(Cc.parsearRumbo("06L"), { tipo: "pista", pista: "06L", lado: "L", rumbo: 60 });
  assert.deepEqual(Cc.parsearRumbo("18"), { tipo: "pista", pista: "18", lado: "", rumbo: 180 }, "dos cifras hasta 36 es pista");
  assert.deepEqual(Cc.parsearRumbo("018"), { tipo: "rumbo", rumbo: 18 }, "tres cifras es rumbo");
  assert.deepEqual(Cc.parsearRumbo("0"), { tipo: "rumbo", rumbo: 360 });
  assert.equal(Cc.parsearRumbo("361"), null);
  assert.equal(Cc.parsearRumbo("norte"), null);
  assert.equal(Cc.textoReciproco("045 270 18 06L 24R 09C 360 x"), ["✈️ *Rumbo recíproco*", "🧭 045° ↔ 225°", "🧭 270° ↔ 090°", "🛬 Pista 18 ↔ 36 (180° ↔ 360°)", "🛬 Pista 06L ↔ 24R (060° ↔ 240°)", "🛬 Pista 24R ↔ 06L (240° ↔ 060°)", "🛬 Pista 09C ↔ 27C (090° ↔ 270°)", "🧭 360° ↔ 180°", '❌ "x": poné un rumbo de 0 a 360 o una pista como 06 o 24L.'].join("\n"));
  assert.match(Cc.textoReciproco(""), /^Uso: \.reciproco/);
});

test("aero: factor de carga según el ángulo de viraje", () => {
  assert.ok(Math.abs(Cc.factorDeCarga(60) - 2) < 1e-9);
  assert.ok(Math.abs(Cc.factorDeCarga(45) - Math.SQRT2) < 1e-9);
  assert.equal(Cc.factorDeCarga(0), 1);
  assert.equal(Cc.textoFactorCarga("45"), "✈️ *Factor de carga* · viraje nivelado de 45°\n⚖️ n = 1,41 G (1 / cos 45°)\n📈 Velocidad de pérdida: ×1,19, un 19 % más");
  assert.equal(Cc.textoFactorCarga("60 50"), "✈️ *Factor de carga* · viraje nivelado de 60°\n⚖️ n = 2,00 G (1 / cos 60°)\n📈 Velocidad de pérdida: ×1,41, un 41 % más → 71 kt con una Vs de 50 kt\n🟡 Ya vas a 2 G o más: ojo con la velocidad y la pérdida acelerada.");
  assert.match(Cc.textoFactorCarga("80"), /n = 5,76 G[\s\S]*🔴 Supera el límite de la categoría normal \(3,8 G\)/);
  assert.match(Cc.textoFactorCarga("90"), /tiende a infinito/);
  assert.match(Cc.textoFactorCarga("mucho"), /Poné el ángulo/);
  assert.match(Cc.textoFactorCarga("45 rapido"), /La velocidad de pérdida va en nudos/);
  const tabla = Cc.textoFactorCarga("");
  assert.match(tabla, /^✈️ \*Factor de carga en viraje nivelado\*\n15° → 1,04 G · Vs ×1,02\n30° → 1,15 G · Vs ×1,07\n45° → 1,41 G · Vs ×1,19\n60° → 2,00 G · Vs ×1,41 🟡\n75° → 3,86 G · Vs ×1,97 🔴\n\nUso: /);
});
