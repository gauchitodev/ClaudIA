import { test } from "node:test";
import assert from "node:assert/strict";
import { _dep, parsearViento, parsearClaros, leerClaros, msHastaLectura, buscarEstacion, textoClaro } from "../lib/claros.js";

// a real excerpt from Inumet's page (2026-09-06), with a gust and a windless station added for testing
const fila = (nombre, viento, vis, tp, tpDesc, cielo, nubes, t, td, hr, pnm, pest) => `<tr class='listBackG'><td style="text-align: left;">${nombre}</td><td>${viento}</td><td>${vis}</td><td><span title="${tpDesc}">${tp}</span></td><td><span class="cielo" title="${nubes}">${cielo}</span></td><td>${nubes}</td><td>${t}</td><td>${td}</td><td>${hr}</td><td>${pnm}</td><td>${pest}</td></tr>`;
const HTML = `<html><body><div id="div_claros" style="display: none;" class="aero"><p>Fecha: 06/09/2026</p><p>Observaciones realizadas a la hora 14:00</p><div class="contTablaEstCli"><table><thead><tr><th>Estación Meteorológica</th></tr></thead><tbody>
${fila("Artigas", "160 / 10 / 20", "18", "02", "Nuboso", "Nuboso", "5Cu500", "12.0", "2.3", "52", "1029.10", "1014.40")}
${fila("Carrasco - Aeropuerto Internacional Gral. Cesáreo L. Berisso", "190 / 11", "15", "03", "Nuboso", "Nuboso", "6CuSc900", "8.7", "3.4", "69", "1031.20", "1027.20")}
${fila("Laguna del Sauce - Aeropuerto Internacional C/C Carlos A. Curbelo", "190 / 11", "15", "03", "Nuboso", "Nuboso", "4CuSc900 1Sc1400", "9.6", "0.4", "53", "1030.50", "1027.00")}
${fila("Treinta y Tres *", "-", "15", "02", "Nuboso", "Nuboso", "7sc600", "11.0", "2.5", "56", "1029.3", "1023.70")}
${fila("Mercedes", "000 / 0", "20", "03", "Algo Nuboso", "Algo Nuboso", "3Cu700", "11.1", "-0.8", "44", "1031.4", "1029.40")}
</tbody></table></div><p>Referencias:</p><p>* Dato obtenido de estación automática</p></div></body></html>`;

const T0 = Date.UTC(2026, 8, 6, 17, 15); // 14:15 hora local

test("claros: parsea la tabla de Inumet", () => {
  assert.deepEqual(parsearViento("160 / 10"), { dir: 160, vel: 10, rafaga: null });
  assert.deepEqual(parsearViento("160 / 10 / 20"), { dir: 160, vel: 10, rafaga: 20 });
  assert.equal(parsearViento("-"), null);
  const d = parsearClaros(HTML);
  assert.equal(d.fecha, "06/09/2026");
  assert.equal(d.hora, "14:00");
  assert.equal(d.estaciones.length, 5);
  const carrasco = d.estaciones[1];
  assert.equal(carrasco.ciudad, "Carrasco");
  assert.equal(carrasco.detalle, "Aeropuerto Internacional Gral. Cesáreo L. Berisso");
  assert.deepEqual(carrasco.viento, { dir: 190, vel: 11, rafaga: null });
  assert.deepEqual([carrasco.visibilidad, carrasco.tiempo, carrasco.cielo, carrasco.nubes, carrasco.temp, carrasco.rocio, carrasco.hr, carrasco.pnm, carrasco.pest], [15, { codigo: "03", descripcion: "Nuboso" }, "Nuboso", "6CuSc900", 8.7, 3.4, 69, 1031.2, 1027.2]);
  const tyt = d.estaciones[3];
  assert.equal(tyt.ciudad, "Treinta y Tres");
  assert.equal(tyt.automatica, true);
  assert.equal(tyt.viento, null);
  assert.throws(() => parsearClaros("<html><body>nada</body></html>"), /no trae la tabla/);
});

test("claros: caché de una hora, lectura forzada con freno de un minuto y horario de lectura", async () => {
  let pedidos = 0;
  _dep.pedir = async () => {
    pedidos++;
    return HTML;
  };
  globalThis.clarosCache = { datos: null, leido: 0 };
  let r = await leerClaros({ ahora: T0 });
  assert.equal(r.deCache, false);
  r = await leerClaros({ ahora: T0 + 30 * 60000 });
  assert.equal(r.deCache, true, "a la media hora sigue en caché");
  r = await leerClaros({ ahora: T0 + 61 * 60000 });
  assert.equal(r.deCache, false, "pasada la hora vuelve a leer");
  assert.equal(pedidos, 2);
  r = await leerClaros({ forzar: true, ahora: T0 + 61 * 60000 + 30000 });
  assert.equal(r.reciente, true, "forzar dos veces en un minuto no golpea a Inumet");
  r = await leerClaros({ forzar: true, ahora: T0 + 63 * 60000 });
  assert.equal(r.deCache, false);
  assert.equal(pedidos, 3);

  // ten past each hour, in local time (UTC−3): at 14:15 that's 55 minutes away; at 14:05, five
  assert.equal(msHastaLectura(T0), 55 * 60000);
  assert.equal(msHastaLectura(Date.UTC(2026, 8, 6, 17, 5)), 5 * 60000);
  assert.equal(msHastaLectura(Date.UTC(2026, 8, 6, 17, 10)), 60 * 60000);
});

test("claros: búsqueda por ciudad, alias e ICAO, y los textos con la fuente", async () => {
  _dep.pedir = async () => HTML;
  globalThis.clarosCache = { datos: null, leido: 0 };
  const { datos } = await leerClaros({ ahora: T0 });
  assert.equal(buscarEstacion(datos, "salto"), null);
  assert.equal(buscarEstacion(datos, "Carrasco").ciudad, "Carrasco");
  assert.equal(buscarEstacion(datos, "SUMU").ciudad, "Carrasco");
  assert.equal(buscarEstacion(datos, "montevideo").ciudad, "Carrasco");
  assert.equal(buscarEstacion(datos, "punta").ciudad, "Laguna del Sauce");
  assert.equal(buscarEstacion(datos, "treinta").ciudad, "Treinta y Tres");
  assert.equal(buscarEstacion(datos, "33").ciudad, "Treinta y Tres");
  assert.equal(buscarEstacion(datos, "curbelo").ciudad, "Laguna del Sauce", "también por el nombre del aeropuerto");

  const detalle = await textoClaro("artigas", T0 + 3 * 60000);
  assert.equal(detalle, ["🌤️ *Claro Inumet · Artigas*", "🕒 Observación de las 14:00 (hora local) del 06/09/2026", "💨 Viento: 160° 10 kt, ráfagas de 20", "👁️ Visibilidad: 18 km", "🌦️ Tiempo presente: 02 (Nuboso)", "☁️ Cielo: Nuboso · 5Cu500", "🌡️ 12,0 °C · rocío 2,3 °C · HR 52 %", "🔽 Presión: 1029,1 hPa a nivel del mar · 1014,4 hPa en la estación", "_Fuente: Inumet. Leído hace 3 min; se lee a los 10 de cada hora. .claro actualizar fuerza una lectura._"].join("\n"));
  assert.match(await textoClaro("33", T0), /Treinta y Tres\* \(estación automática\)\n[\s\S]*💨 Viento: sin dato/);
  assert.match(await textoClaro("mercedes", T0), /💨 Viento: calma\n[\s\S]*rocío −0,8 °C/);
  const lista = await textoClaro("", T0);
  assert.match(lista, /^🌤️ \*Claros Inumet\* · observaciones de las 14:00 \(hora local\) del 06\/09\/2026\n• Artigas: 160° 10 kt, ráfagas de 20 · 18 km · Nuboso · 12,0 °C\n• Carrasco: 190° 11 kt · 15 km · Nuboso · 8,7 °C\n/);
  assert.match(lista, /\n\.claro <ciudad> para el detalle de una estación\.\n_Fuente: Inumet\./);
  assert.match(await textoClaro("marte", T0), /^No encontré la estación "marte"\. Las que hay: Artigas, Carrasco, Laguna del Sauce, Treinta y Tres, Mercedes\./);
  assert.match(await textoClaro("actualizar carrasco", T0 + 10000), /Claro Inumet · Carrasco[\s\S]*ℹ️ Ya se leyó recién; para no cansar a Inumet/);

  // if Inumet doesn't answer, it shows the last reading and says so
  _dep.pedir = async () => {
    throw new Error("Inumet respondió 503");
  };
  assert.match(await textoClaro("carrasco", T0 + 2 * 3600000), /Claro Inumet · Carrasco[\s\S]*⚠️ Inumet no respondió \(Inumet respondió 503\); te muestro la última lectura\./);
  globalThis.clarosCache = { datos: null, leido: 0 };
  assert.match(await textoClaro("", T0), /^No pude leer los claros de Inumet ahora \(Inumet respondió 503\)/);
});
