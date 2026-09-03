// Casino de UruCoins: ruleta y tragamonedas. Se juega contra la banca, con esperanza un poco menor a 1
// (la banca gana a la larga, así no infla la economía) y tope diario por persona para que nadie se funda.
// Ni la racha doble ni el escudo de la tienda aplican acá: harían que la esperanza pase de 1.
import { randomInt } from "crypto";
import { gastarCoins, ganarCoins, getSaldoCoins, coinsGastadasHoy } from "../database-functions.js";
import { COINS } from "./urucoins.js";

// Valida la cantidad, controla el tope diario y cobra. Devuelve { ok: true } o { ok: false, error }.
function cobrarApuesta(chat, usuario, cantidad, motivo) {
  if (!Number.isInteger(cantidad) || cantidad < COINS.APUESTA_MIN) return { ok: false, error: `La apuesta mínima es ${COINS.APUESTA_MIN} UruCoins.` };
  if (cantidad > COINS.CASINO_APUESTA_MAX) return { ok: false, error: `La apuesta máxima en el casino es ${COINS.CASINO_APUESTA_MAX} UruCoins.` };
  const apostadoHoy = coinsGastadasHoy(chat, usuario, "casino_");
  if (apostadoHoy + cantidad > COINS.CASINO_TOPE_DIA) {
    const resto = Math.max(0, COINS.CASINO_TOPE_DIA - apostadoHoy);
    return {
      ok: false,
      error: resto > 0 ? `Por hoy te quedan ${resto} UruCoins para apostar en el casino (tope diario ${COINS.CASINO_TOPE_DIA}).` : `Por hoy ya apostaste el máximo en el casino (${COINS.CASINO_TOPE_DIA} UruCoins). Mañana de nuevo.`,
    };
  }
  if (!gastarCoins(chat, usuario, cantidad, motivo)) return { ok: false, error: `No te alcanza: tenés ${getSaldoCoins(chat, usuario)} UruCoins.` };
  return { ok: true };
}

// ---------- Ruleta (europea: 0 al 36, un solo cero) ----------
const ROJOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorDe = (n) => (n === 0 ? "verde" : ROJOS.has(n) ? "rojo" : "negro");

// Interpreta lo apostado: color, par/impar, docena o número. Devuelve { nombre, gana(n), paga } o null.
export function interpretarApuestaRuleta(texto) {
  const t = String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!t) return null;
  if (["rojo", "roja", "red"].includes(t)) return { nombre: "rojo", gana: (n) => colorDe(n) === "rojo", paga: 2 };
  if (["negro", "negra", "black"].includes(t)) return { nombre: "negro", gana: (n) => colorDe(n) === "negro", paga: 2 };
  if (t === "par") return { nombre: "par", gana: (n) => n !== 0 && n % 2 === 0, paga: 2 };
  if (t === "impar") return { nombre: "impar", gana: (n) => n % 2 === 1, paga: 2 };
  if (/^(1-12|13-24|25-36)$/.test(t)) {
    const [a, b] = t.split("-").map(Number);
    return { nombre: `la docena ${t}`, gana: (n) => n >= a && n <= b, paga: 3 };
  }
  if (/^\d{1,2}$/.test(t) && Number(t) <= 36) {
    const num = Number(t);
    return { nombre: `el ${num}`, gana: (n) => n === num, paga: 36 };
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
  if (!apuesta) return { ok: false, error: "¿A qué apostás? rojo, negro, par, impar, 1-12, 13-24, 25-36 o un número del 0 al 36. Ej: .ruleta 20 rojo" };
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
  const numero = randomInt(0, 37);
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
    lineas.push(`${gano ? "✅" : "❌"} ${mencion(a.usuario)} ${a.cantidad} ${aQue(a.apuesta)}${gano ? ` → cobra ${premio}` : ""}`);
    mentions.push(a.usuario);
  }
  const cierre = pagado > 0 ? `La mesa pagó ${pagado} UruCoins.` : "La banca se quedó con todo.";
  return { numero, texto: `🎡 *¡No va más!* Salió *${numero} ${color}*.\n${lineas.join("\n")}\n${cierre}`, mentions: [...new Set(mentions)] };
}

// ---------- Tragamonedas ----------
// Tres rodillos, tres filas visibles y tres líneas de pago. Con estos pesos y pagos la banca se queda con un 7 % a la larga.
const SIMBOLOS = [
  { emoji: "🍒", peso: 5, triple: 5 },
  { emoji: "🍋", peso: 4, triple: 8 },
  { emoji: "🍊", peso: 3, triple: 15 },
  { emoji: "🔔", peso: 2, triple: 40 },
  { emoji: "⭐", peso: 1, triple: 100 },
  { emoji: "💎", peso: 1, triple: 200 },
];
const PAGA_DOS_CEREZAS = 2;
const PESO_TOTAL = SIMBOLOS.reduce((s, x) => s + x.peso, 0);

function girarRodillo() {
  let r = randomInt(0, PESO_TOTAL);
  for (const s of SIMBOLOS) {
    if (r < s.peso) return s;
    r -= s.peso;
  }
  return SIMBOLOS[0];
}

// Evalúa una línea (tres símbolos): tres iguales pagan según la tabla, dos cerezas pagan PAGA_DOS_CEREZAS.
function evaluarLinea(simbolos) {
  const emojis = simbolos.map((s) => s.emoji);
  if (emojis.every((e) => e === emojis[0])) return { multiplicador: simbolos[0].triple, detalle: `¡tres ${emojis[0]}! x${simbolos[0].triple}` };
  if (emojis.filter((e) => e === "🍒").length === 2) return { multiplicador: PAGA_DOS_CEREZAS, detalle: `dos cerezas x${PAGA_DOS_CEREZAS}` };
  return { multiplicador: 0, detalle: "" };
}

// Ventana de 3 rodillos x 3 filas, con tres líneas de pago horizontales. La apuesta se reparte en partes iguales
// entre las tres líneas y cada una paga por su cuenta: premio = apuesta x (suma de multiplicadores) / 3.
export function jugarTragamonedas(chat, usuario, cantidad) {
  const cobro = cobrarApuesta(chat, usuario, cantidad, "casino_tragamonedas");
  if (!cobro.ok) return cobro;

  const columnas = [0, 1, 2].map(() => [girarRodillo(), girarRodillo(), girarRodillo()]);
  const lineas = [0, 1, 2].map((fila) => columnas.map((c) => c[fila]));
  const resultados = lineas.map((simbolos, i) => ({ fila: i + 1, ...evaluarLinea(simbolos) }));
  const sumaMultiplicadores = resultados.reduce((s, r) => s + r.multiplicador, 0);
  const premio = Math.floor((cantidad * sumaMultiplicadores) / 3);
  if (premio > 0) ganarCoins(chat, usuario, premio, "casino_tragamonedas_premio");
  const saldo = getSaldoCoins(chat, usuario);

  const ventana = lineas.map((simbolos, i) => `${resultados[i].multiplicador ? "▶ " : "   "}${simbolos.map((s) => s.emoji).join(" | ")}${resultados[i].multiplicador ? " ◀" : ""}`).join("\n");
  const ganadoras = resultados.filter((r) => r.multiplicador).map((r) => `Línea ${r.fila}: ${r.detalle}`).join(" · ");
  const resultado = ganadoras ? `${ganadoras}\nCobrás *${premio}* UruCoins.` : "Ninguna línea pagó esta vez.";
  return { ok: true, mensaje: `🎰 *TRAGAMONEDAS* — ${cantidad} UruCoins en 3 líneas\n${ventana}\n\n${resultado} Te quedan ${saldo}.` };
}

export function textoPagosTragamonedas() {
  return `Por línea: ${SIMBOLOS.map((s) => `${s.emoji}${s.emoji}${s.emoji} x${s.triple}`).join(" · ")} · 🍒🍒 x${PAGA_DOS_CEREZAS}. La apuesta se reparte entre las 3 líneas (las tres filas).`;
}
