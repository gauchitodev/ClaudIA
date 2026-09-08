// Casino de UruCoins: ruleta y tragamonedas. Se juega contra la banca, con esperanza un poco menor a 1
// (la banca gana a la larga, así no infla la economía) y, si se configura, tope diario por persona para que nadie se
// funda. La racha doble no aplica acá, haría que la esperanza pase de 1; el escudo sí, pero devuelve como mucho lo que
// costó, así que apostar con escudo sigue siendo negocio para la banca.
import { randomInt as randomIntCrypto } from "crypto";

// Fuente de azar reemplazable: las pruebas la fijan para tener resultados previsibles.
export const _rng = { randomInt: randomIntCrypto };
import { gastarCoins, ganarCoins, getSaldoCoins, coinsGastadasHoy } from "../database-functions.js";
import { protegerApuesta, ITEMS } from "./tienda.js";
import { COINS, apuestaMaxima, textoApuestaMaxima } from "./urucoins.js";

// Valida la cantidad, controla el tope diario y cobra. Devuelve { ok: true } o { ok: false, error }.
// "minimo" se baja para cobros derivados de una apuesta ya hecha, como el seguro del blackjack, que vale la mitad.
export function cobrarApuesta(chat, usuario, cantidad, motivo, { minimo = COINS.APUESTA_MIN } = {}) {
  if (!Number.isInteger(cantidad) || cantidad < minimo) return { ok: false, error: `La apuesta mínima es ${minimo} UruCoins.` };
  const maximo = apuestaMaxima(chat, usuario, COINS.CASINO_APUESTA_MAX);
  if (cantidad > maximo) return { ok: false, error: `Tu apuesta máxima en el casino es ${maximo} UruCoins (${textoApuestaMaxima(COINS.CASINO_APUESTA_MAX)}).` };
  const apostadoHoy = coinsGastadasHoy(chat, usuario, "casino_");
  if (COINS.CASINO_TOPE_DIA > 0 && apostadoHoy + cantidad > COINS.CASINO_TOPE_DIA) {
    const resto = Math.max(0, COINS.CASINO_TOPE_DIA - apostadoHoy);
    return {
      ok: false,
      error: resto > 0 ? `Por hoy te quedan ${resto} UruCoins para apostar en el casino (tope diario ${COINS.CASINO_TOPE_DIA}).` : `Por hoy ya apostaste el máximo en el casino (${COINS.CASINO_TOPE_DIA} UruCoins). Mañana de nuevo.`,
    };
  }
  if (!gastarCoins(chat, usuario, cantidad, motivo)) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, usuario)} UruCoins.` };
  return { ok: true };
}

// Frase de límites para las ayudas de los juegos del casino. "unidad" es jugada, apuesta o mano.
export function textoLimitesCasino(unidad = "jugada") {
  const tope = COINS.CASINO_TOPE_DIA > 0 ? `, tope ${COINS.CASINO_TOPE_DIA} por día en el casino` : "";
  return `Mínimo ${COINS.APUESTA_MIN} por ${unidad}, máximo ${textoApuestaMaxima(COINS.CASINO_APUESTA_MAX)}${tope}. La racha doble no aplica en el casino; el escudo sí, te devuelve una apuesta perdida (hasta ${ITEMS.escudo.reintegro}).`;
}

// ---------- Ruleta (europea: 0 al 36, un solo cero) ----------
const ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorDe = (n) => (n === 0 ? "verde" : ROJOS.has(n) ? "rojo" : "negro");

// Apuestas interiores según el paño real (tres columnas de doce filas: la fila r tiene 3r+1, 3r+2 y 3r+3).
// Devuelve { nombre, paga } si los números forman una jugada válida, o null.
function clasificarInterior(nums) {
  const [a] = nums;
  const es = (...esperados) => nums.length === esperados.length && nums.every((n, i) => n === esperados[i]);
  if (nums.length === 2) {
    const [x, y] = nums;
    if (x === 0 && [1, 2, 3].includes(y)) return { nombre: "caballo", paga: 18 };
    if (x >= 1 && y === x + 1 && x % 3 !== 0) return { nombre: "caballo", paga: 18 }; // vecinos en la misma fila
    if (x >= 1 && y === x + 3) return { nombre: "caballo", paga: 18 }; // vecinos en la misma columna
    return null;
  }
  if (nums.length === 3) {
    if (es(0, 1, 2) || es(0, 2, 3)) return { nombre: "calle", paga: 12 };
    if (a >= 1 && a % 3 === 1 && es(a, a + 1, a + 2)) return { nombre: "calle", paga: 12 };
    return null;
  }
  if (nums.length === 4) {
    if (es(0, 1, 2, 3)) return { nombre: "cuadro", paga: 9 };
    if (a >= 1 && a % 3 !== 0 && a <= 32 && es(a, a + 1, a + 3, a + 4)) return { nombre: "cuadro", paga: 9 };
    return null;
  }
  if (nums.length === 6) {
    if (a >= 1 && a % 3 === 1 && a <= 31 && es(a, a + 1, a + 2, a + 3, a + 4, a + 5)) return { nombre: "seisena", paga: 6 };
    return null;
  }
  return null;
}

const AYUDA_INTERIORES = "Caballo: dos vecinos (17-18 o 17-20) · calle: tres seguidos (16-17-18) · cuadro: cuatro en cuadrado (17-18-20-21) · seisena: seis seguidos (16-17-18-19-20-21).";

// Interpreta lo apostado. Devuelve { nombre, gana(n), paga }, { error } si los números no van juntos en el paño, o null.
export function interpretarApuestaRuleta(texto) {
  const t = String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!t) return null;
  if (["rojo", "roja", "red"].includes(t)) return { nombre: "rojo", gana: (n) => colorDe(n) === "rojo", paga: 2 };
  if (["negro", "negra", "black"].includes(t)) return { nombre: "negro", gana: (n) => colorDe(n) === "negro", paga: 2 };
  // "verde" y "cero" son el 0: en la europea no hay apuesta al color verde, es un pleno al cero
  if (["verde", "green", "cero", "zero"].includes(t)) return { nombre: "el 0", gana: (n) => n === 0, paga: 36 };
  if (t === "par") return { nombre: "par", gana: (n) => n !== 0 && n % 2 === 0, paga: 2 };
  if (t === "impar") return { nombre: "impar", gana: (n) => n % 2 === 1, paga: 2 };
  if (["1-18", "falta", "bajos"].includes(t)) return { nombre: "1-18", gana: (n) => n >= 1 && n <= 18, paga: 2 };
  if (["19-36", "pasa", "altos"].includes(t)) return { nombre: "19-36", gana: (n) => n >= 19 && n <= 36, paga: 2 };
  if (/^(1-12|13-24|25-36)$/.test(t)) {
    const [a, b] = t.split("-").map(Number);
    return { nombre: `la docena ${t}`, gana: (n) => n >= a && n <= b, paga: 3 };
  }
  let m;
  if ((m = t.match(/^col(?:umna)? ?([123])$/))) {
    const k = Number(m[1]);
    return { nombre: `la columna ${k}`, gana: (n) => n >= 1 && (n - 1) % 3 === k - 1, paga: 3 };
  }
  if (/^\d{1,2}$/.test(t) && Number(t) <= 36) {
    const num = Number(t);
    return { nombre: `el ${num}`, gana: (n) => n === num, paga: 36 };
  }
  if (/^\d{1,2}([-,\s]+\d{1,2})+$/.test(t)) {
    const nums = [...new Set(t.split(/[-,\s]+/).map(Number))].sort((x, y) => x - y);
    if (nums.some((n) => n > 36)) return { error: "Los números van del 0 al 36." };
    const tipo = clasificarInterior(nums);
    if (!tipo) return { error: `Esos números no van juntos en el paño. ${AYUDA_INTERIORES}` };
    return { nombre: `${tipo.nombre} ${nums.join("-")}`, gana: (n) => nums.includes(n), paga: tipo.paga };
  }
  return null;
}

// Mesa de ruleta por grupo: la primera apuesta abre la mesa, durante RULETA_SEGUNDOS se aceptan apuestas de todos
// (varias por persona), y al cerrar la bola sale una sola vez y se liquidan todas juntas, como en una ruleta real.
// Cada apuesta se cobra al apostar (con los mismos topes del casino). La mesa vive en memoria: si el bot se reinicia
// en el medio de una ronda, esa ronda se pierde; por eso la ventana es corta.
export const CASINO = { RULETA_SEGUNDOS: 45, RULETA_MAX_APUESTAS_POR_PERSONA: 5 };
if (!globalThis.mesasRuleta) globalThis.mesasRuleta = new Map(); // chat -> { apuestas, cierraEn, timeout }

const mencion = (lid) => `@${lid.split("@")[0]}`;
// "a rojo", "a la docena 1-12", "al 17"
const aQue = (apuesta) => (apuesta.nombre.startsWith("el ") ? `al ${apuesta.nombre.slice(3)}` : `a ${apuesta.nombre}`);

// Registra una apuesta. Si no había mesa abierta, la abre y agenda el giro; "alCerrar({ texto, mentions })" se llama
// con el resultado cuando sale la bola. Devuelve { ok, mensaje, abrio } o { ok: false, error }.
export function apostarRuleta(chat, usuario, cantidad, textoApuesta, alCerrar) {
  const apuesta = interpretarApuestaRuleta(textoApuesta);
  if (!apuesta) return { ok: false, error: "¿A qué apostás? rojo, negro, par, impar, 1-18, 19-36, docenas (1-12, 13-24, 25-36), columna 1/2/3, un número, o números vecinos del paño (17-18, 16-17-18, 17-18-20-21). Ej: .ruleta 20 rojo" };
  if (apuesta.error) return { ok: false, error: apuesta.error };
  const mesa = globalThis.mesasRuleta.get(chat);
  if (mesa && mesa.apuestas.filter((a) => a.usuario === usuario).length >= CASINO.RULETA_MAX_APUESTAS_POR_PERSONA) {
    return { ok: false, error: `Máximo ${CASINO.RULETA_MAX_APUESTAS_POR_PERSONA} apuestas por persona en cada giro.` };
  }
  const cobro = cobrarApuesta(chat, usuario, cantidad, "casino_ruleta");
  if (!cobro.ok) return cobro;

  let abrio = false;
  let actual = mesa;
  if (!actual) {
    abrio = true;
    actual = { chat, apuestas: [], cierraEn: Date.now() + CASINO.RULETA_SEGUNDOS * 1000, timeout: null };
    actual.timeout = setTimeout(() => {
      if (globalThis.mesasRuleta.get(chat) !== actual) return;
      globalThis.mesasRuleta.delete(chat);
      try {
        Promise.resolve(alCerrar(girarMesa(actual))).catch((e) => console.error("[ruleta] no se pudo anunciar el giro:", e.message));
      } catch (e) {
        console.error("[ruleta] error al girar:", e);
      }
    }, CASINO.RULETA_SEGUNDOS * 1000);
    globalThis.mesasRuleta.set(chat, actual);
  }
  actual.apuestas.push({ chat, usuario, cantidad, apuesta });

  const segundos = Math.max(1, Math.round((actual.cierraEn - Date.now()) / 1000));
  const enMesa = actual.apuestas.reduce((s, a) => s + a.cantidad, 0);
  const mensaje = abrio
    ? `🎡 *Se abrió la mesa.* ${mencion(usuario)} apostó ${cantidad} ${aQue(apuesta)}.\nApuesten con .ruleta <cantidad> <apuesta>: la bola sale en ${segundos} segundos.`
    : `🎡 ${mencion(usuario)} apostó ${cantidad} ${aQue(apuesta)}. Quedan ${segundos} s · ${actual.apuestas.length} apuestas en mesa (${enMesa} UruCoins).`;
  return { ok: true, mensaje, abrio, mentions: [usuario] };
}

// Estado de la mesa abierta, o null si no hay.
export function textoMesaRuleta(chat) {
  const mesa = globalThis.mesasRuleta.get(chat);
  if (!mesa) return null;
  const segundos = Math.max(0, Math.round((mesa.cierraEn - Date.now()) / 1000));
  const lineas = mesa.apuestas.map((a) => `• ${mencion(a.usuario)}: ${a.cantidad} ${aQue(a.apuesta)}`);
  return { texto: `🎡 *Mesa abierta* · la bola sale en ${segundos} s\n${lineas.join("\n")}`, mentions: [...new Set(mesa.apuestas.map((a) => a.usuario))] };
}

// Gira la bola y liquida todas las apuestas de la mesa. Devuelve { texto, mentions, numero }.
export function girarMesa(mesa) {
  const chat = mesa.chat;
  const numero = _rng.randomInt(0, 37);
  const color = colorDe(numero);
  const lineas = [];
  const mentions = [];
  let pagado = 0;
  for (const a of mesa.apuestas) {
    const gano = a.apuesta.gana(numero);
    const premio = gano ? a.cantidad * a.apuesta.paga : 0;
    if (premio > 0) {
      ganarCoins(a.chat || chat, a.usuario, premio, "casino_ruleta_premio");
      pagado += premio;
    }
    const devuelto = gano ? 0 : protegerApuesta(a.chat || chat, a.usuario, a.cantidad);
    lineas.push(`${gano ? "✅" : devuelto ? "🛡️" : "❌"} ${mencion(a.usuario)} ${a.cantidad} ${aQue(a.apuesta)}${gano ? ` → cobra ${premio}` : devuelto ? ` → su escudo le devuelve ${devuelto}` : ""}`);
    mentions.push(a.usuario);
  }
  const cierre = pagado > 0 ? `La mesa pagó ${pagado} UruCoins.` : "La banca se quedó con todo.";
  return { numero, texto: `🎡 *¡No va más!* Salió *${numero} ${color}*.\n${lineas.join("\n")}\n${cierre}`, mentions: [...new Set(mentions)] };
}

// ---------- Tragamonedas ----------
// Tres rodillos, tres filas visibles y cinco líneas de pago (filas y diagonales). "paga" es cuánto cobra una línea
// de tres iguales, medido sobre la apuesta entera; los premios de las cinco líneas se suman. Con estos pesos y pagos
// el retorno es del 93 %: la banca se queda con un 7 % a la larga.
const SIMBOLOS = [
  { emoji: "🍒", peso: 5, paga: 1 },
  { emoji: "🍋", peso: 4, paga: 1.6 },
  { emoji: "🍊", peso: 3, paga: 3 },
  { emoji: "🔔", peso: 2, paga: 8 },
  { emoji: "⭐", peso: 1, paga: 20 },
  { emoji: "💎", peso: 1, paga: 40 },
];
const PAGA_DOS_CEREZAS = 0.4;
const multiplicador = (paga) => `x${String(paga).replace(".", ",")}`;
const PESO_TOTAL = SIMBOLOS.reduce((s, x) => s + x.peso, 0);

function girarRodillo() {
  let r = _rng.randomInt(0, PESO_TOTAL);
  for (const s of SIMBOLOS) {
    if (r < s.peso) return s;
    r -= s.peso;
  }
  return SIMBOLOS[0];
}

// Evalúa una línea (tres símbolos): tres iguales pagan según la tabla, dos cerezas pagan PAGA_DOS_CEREZAS.
function evaluarLinea(simbolos) {
  const emojis = simbolos.map((s) => s.emoji);
  if (emojis.every((e) => e === emojis[0])) return { paga: simbolos[0].paga, detalle: `¡tres ${emojis[0]}! ${multiplicador(simbolos[0].paga)}` };
  if (emojis.filter((e) => e === "🍒").length === 2) return { paga: PAGA_DOS_CEREZAS, detalle: `dos cerezas ${multiplicador(PAGA_DOS_CEREZAS)}` };
  return { paga: 0, detalle: "" };
}

// Ventana de 3 rodillos x 3 filas con CINCO líneas de pago: las tres filas y las dos diagonales. Cada línea paga
// sobre la apuesta entera y los premios se suman: premio = apuesta x (suma de pagas), redondeado al entero más
// cercano para que una apuesta que no es múltiplo de 5 no pierda por el truncado.
const LINEAS = [
  { nombre: "Fila 1", celdas: [[0, 0], [1, 0], [2, 0]] },
  { nombre: "Fila 2", celdas: [[0, 1], [1, 1], [2, 1]] },
  { nombre: "Fila 3", celdas: [[0, 2], [1, 2], [2, 2]] },
  { nombre: "Diagonal ↘", celdas: [[0, 0], [1, 1], [2, 2]] },
  { nombre: "Diagonal ↗", celdas: [[0, 2], [1, 1], [2, 0]] },
];

export function jugarTragamonedas(chat, usuario, cantidad) {
  const cobro = cobrarApuesta(chat, usuario, cantidad, "casino_tragamonedas");
  if (!cobro.ok) return cobro;

  const columnas = [0, 1, 2].map(() => [girarRodillo(), girarRodillo(), girarRodillo()]); // columnas[rodillo][fila]
  const resultados = LINEAS.map((l) => {
    const simbolos = l.celdas.map(([c, f]) => columnas[c][f]);
    return { nombre: l.nombre, simbolos, ...evaluarLinea(simbolos) };
  });
  const sumaPagas = resultados.reduce((s, r) => s + r.paga, 0);
  const premio = Math.round(cantidad * sumaPagas);
  if (premio > 0) ganarCoins(chat, usuario, premio, "casino_tragamonedas_premio");
  const devuelto = premio > 0 ? 0 : protegerApuesta(chat, usuario, cantidad);
  const saldo = getSaldoCoins(chat, usuario);

  // La grilla va limpia y cada línea que pagó se repite abajo con sus tres símbolos: marcar celdas o filas en la grilla
  // no alinea con la fuente proporcional del teléfono, y a las diagonales no había cómo marcarlas.
  const ventana = [0, 1, 2].map((f) => columnas.map((c) => c[f].emoji).join(" | ")).join("\n");
  const ganadoras = resultados
    .filter((r) => r.paga)
    .map((r) => `▸ ${r.nombre}: ${r.simbolos.map((s) => s.emoji).join(" ")} → ${r.detalle}`)
    .join("\n");
  // que quede claro cuando una línea paga menos de lo apostado: cobrar 20 habiendo puesto 50 es perder 30
  const neto = premio - cantidad;
  const balance = neto > 0 ? `ganás ${neto}` : neto < 0 ? `perdés ${-neto}` : "recuperás la apuesta";
  const resultado = ganadoras ? `${ganadoras}\nCobrás *${premio}* UruCoins: ${balance}.` : devuelto ? `Ninguna línea pagó, pero tu escudo te devolvió los ${devuelto}.` : "Ninguna línea pagó esta vez.";
  return { ok: true, mensaje: `🎰 *TRAGAMONEDAS* · ${cantidad} UruCoins\n${ventana}\n\n${resultado} Te quedan ${saldo}.` };
}

export function textoPagosTragamonedas() {
  return `Se juegan ${LINEAS.length} líneas a la vez, las tres filas y las dos diagonales, y cada una paga sobre la apuesta entera: ${SIMBOLOS.map((s) => `${s.emoji}${s.emoji}${s.emoji} ${multiplicador(s.paga)}`).join(" · ")} · 🍒🍒 ${multiplicador(PAGA_DOS_CEREZAS)}. Los premios de las líneas se suman.`;
}
