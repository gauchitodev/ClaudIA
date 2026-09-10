// Carrera de caballos con UruCoins: la primera apuesta abre la carrera del grupo, durante CARRERA_SEGUNDOS apuestan
// todos (a distintos caballos si quieren), y al cerrar se corre: tres "cuadros" de la pista y el resultado con los
// pagos. Cada carrera sortea la fuerza de los caballos, así los favoritos y las cuotas cambian; la cuota ya incluye
// el margen de la banca (esperanza ~0.93, como el resto del casino). Apuestas con los mismos topes del casino.
import { randomInt as randomIntCrypto } from "crypto";

// Fuente de azar reemplazable: las pruebas la fijan para tener resultados previsibles.
export const _rng = { randomInt: randomIntCrypto };
import { ganarCoins } from "../database-functions.js";
import { protegerApuesta } from "./tienda.js";
import { cobrarApuesta } from "./casino.js";

export const CARRERA = { SEGUNDOS: 45, MAX_APUESTAS_POR_PERSONA: 3, LARGO_PISTA: 12, MARGEN: 0.93 };
if (!globalThis.carreras) globalThis.carreras = new Map(); // chat -> carrera abierta

const CABALLOS = [
  { emoji: "🏇", nombre: "Relámpago" },
  { emoji: "🐎", nombre: "Tormenta" },
  { emoji: "🐴", nombre: "Charrúa" },
  { emoji: "🫏", nombre: "Burrito" },
  { emoji: "🦄", nombre: "Unicornio" },
];
const mencion = (lid) => `@${lid.split("@")[0]}`;
const normalizar = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

// Sortea la fuerza de cada caballo y calcula probabilidad y cuota (con el margen de la banca).
function armarCaballos() {
  const fuerzas = CABALLOS.map(() => _rng.randomInt(10, 41));
  const total = fuerzas.reduce((s, f) => s + f, 0);
  return CABALLOS.map((c, i) => {
    const prob = fuerzas[i] / total;
    return { ...c, numero: i + 1, prob, cuota: Math.max(1.2, Math.floor((CARRERA.MARGEN / prob) * 10) / 10) };
  });
}

function buscarCaballo(carrera, texto) {
  const t = normalizar(texto);
  if (/^[1-5]$/.test(t)) return carrera.caballos[Number(t) - 1];
  return carrera.caballos.find((c) => normalizar(c.nombre) === t) || carrera.caballos.find((c) => normalizar(c.nombre).startsWith(t)) || null;
}

const lineaCuotas = (carrera) => carrera.caballos.map((c) => `${c.numero}. ${c.emoji} ${c.nombre} x${c.cuota}`).join("\n");

// Registra una apuesta; si no hay carrera abierta la abre. "alLargar({ cuadros, resultado })" se llama al cerrar.
export function apostarCarrera(chat, usuario, cantidad, textoCaballo, alLargar) {
  let carrera = globalThis.carreras.get(chat);
  const abre = !carrera;
  if (abre) carrera = { chat, caballos: armarCaballos(), apuestas: [], cierraEn: Date.now() + CARRERA.SEGUNDOS * 1000, timeout: null };
  const caballo = buscarCaballo(carrera, textoCaballo);
  if (!caballo) return { ok: false, error: `¿A qué caballo? Por número o nombre:\n${lineaCuotas(carrera)}\nEj: .carrera 20 3` };
  if (carrera.apuestas.filter((a) => a.usuario === usuario).length >= CARRERA.MAX_APUESTAS_POR_PERSONA) {
    return { ok: false, error: `Máximo ${CARRERA.MAX_APUESTAS_POR_PERSONA} apuestas por persona en cada carrera.` };
  }
  const cobro = cobrarApuesta(chat, usuario, cantidad, "casino_carrera");
  if (!cobro.ok) return cobro;

  if (abre) {
    carrera.timeout = setTimeout(() => {
      if (globalThis.carreras.get(chat) !== carrera) return;
      globalThis.carreras.delete(chat);
      try {
        Promise.resolve(alLargar(correr(carrera))).catch((e) => console.error("[carrera] no se pudo narrar:", e.message));
      } catch (e) {
        console.error("[carrera] error al correr:", e);
      }
    }, CARRERA.SEGUNDOS * 1000);
    globalThis.carreras.set(chat, carrera);
  }
  carrera.apuestas.push({ usuario, cantidad, caballo });

  const segundos = Math.max(1, Math.round((carrera.cierraEn - Date.now()) / 1000));
  const mensaje = abre
    ? `🏇 *Se abre la carrera.* ${mencion(usuario)} apostó ${cantidad} a ${caballo.nombre} (x${caballo.cuota}).\n\n${lineaCuotas(carrera)}\n\nApuesten con .carrera <cantidad> <número o nombre>: largan en ${segundos} segundos.`
    : `🏇 ${mencion(usuario)} apostó ${cantidad} a ${caballo.nombre} (x${caballo.cuota}). Largan en ${segundos} s · ${carrera.apuestas.length} apuestas.`;
  return { ok: true, abre, mensaje, mentions: [usuario] };
}

export function textoCarrera(chat) {
  const carrera = globalThis.carreras.get(chat);
  if (!carrera) return null;
  const segundos = Math.max(0, Math.round((carrera.cierraEn - Date.now()) / 1000));
  const apuestas = carrera.apuestas.map((a) => `• ${mencion(a.usuario)}: ${a.cantidad} a ${a.caballo.nombre} (x${a.caballo.cuota})`).join("\n");
  return { texto: `🏇 *Carrera abierta* · largan en ${segundos} s\n${lineaCuotas(carrera)}\n\n${apuestas}`, mentions: [...new Set(carrera.apuestas.map((a) => a.usuario))] };
}

function pista(caballos, posiciones) {
  const L = CARRERA.LARGO_PISTA;
  return caballos.map((c, i) => `${"═".repeat(posiciones[i])}${c.emoji}${"·".repeat(L - posiciones[i])}🏁 ${c.nombre}`).join("\n");
}

// Elige al ganador según las probabilidades, arma los tres cuadros de la pista y liquida las apuestas.
export function correr(carrera) {
  const { caballos, apuestas, chat } = carrera;
  const L = CARRERA.LARGO_PISTA;
  let r = _rng.randomInt(0, 1000000) / 1000000;
  let ganador = caballos[caballos.length - 1];
  for (const c of caballos) {
    if (r < c.prob) {
      ganador = c;
      break;
    }
    r -= c.prob;
  }
  const finales = caballos.map((c) => (c === ganador ? L : _rng.randomInt(Math.floor(L * 0.55), L)));
  const cuadro = (avance) => pista(caballos, finales.map((f) => Math.max(1, Math.min(L - 1, Math.round(f * avance) + _rng.randomInt(-1, 2)))));
  const cuadros = [`🏁 *¡Largaron!*\n${cuadro(0.35)}`, `🏇 *Última curva...*\n${cuadro(0.7)}`, `🏆 *Ganó ${ganador.emoji} ${ganador.nombre}* (x${ganador.cuota})\n${pista(caballos, finales)}`];

  const lineas = [];
  const mentions = [];
  let pagado = 0;
  for (const a of apuestas) {
    const gano = a.caballo === ganador;
    const premio = gano ? Math.floor(a.cantidad * a.caballo.cuota) : 0;
    if (premio > 0) {
      ganarCoins(chat, a.usuario, premio, "casino_carrera_premio");
      pagado += premio;
    }
    const devuelto = gano ? 0 : protegerApuesta(chat, a.usuario, a.cantidad);
    lineas.push(`${gano ? "✅" : devuelto ? "🛡️" : "❌"} ${mencion(a.usuario)} ${a.cantidad} a ${a.caballo.nombre}${gano ? ` → cobra ${premio}` : devuelto ? ` → su escudo le devuelve ${devuelto}` : ""}`);
    mentions.push(a.usuario);
  }
  const cierre = pagado > 0 ? `Se pagaron ${pagado} UruCoins.` : "Nadie le había apostado al ganador.";
  return { ganador, cuadros, resultado: { texto: `${lineas.join("\n")}\n${cierre}`, mentions: [...new Set(mentions)] } };
}
