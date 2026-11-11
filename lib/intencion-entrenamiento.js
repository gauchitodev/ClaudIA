// How the weights of lib/intencion.js are made and measured (scripts/entrenar-intencion.mjs runs it). The bot never
// loads this: it's for whoever trains, on a computer, from messages labelled by hand:
// [{ texto, clase: "vender" | "comprar" | "nada", autor, fecha }], autor being anything that tells one person from
// another (a number will do) and fecha anything that sorts by time.
// No random numbers anywhere: the same messages give the same weights.
import { CLASES, rasgos, puntuar, INTENCION } from "./intencion.js";

export const ENTRENAMIENTO = {
  // Slots for the weights. A message's features are hashed into them, and two that land on the same one share its
  // weight: with fewer slots the file is smaller and more of them collide. With 870 messages it did the same from
  // 4.096 slots to 65.536: few features carry the answer. This many leave room for more messages, in 49 KB.
  CUBETAS: 1 << 14,
  EPOCAS: 250,
  PASO: 0.05,
  L2: 3e-6,
  // A feature only one person wrote gets no weight: sellers repeat their ads, and what only theirs have (a brand, a
  // name, a turn of phrase) says who wrote the message, not what it's for. It also keeps what a single person wrote
  // out of the file.
  MIN_AUTORES: 2,
};

const autorDe = (e, i) => e.autor ?? `fila ${i}`;

// The weights for those messages: a softmax regression trained with every message at each step (Adam), each class
// weighing the same however many messages it has (there are fifteen "nada" for each "comprar"), and then brought to
// one byte per weight. Returns the model as lib/intencion.js reads it.
export function entrenar(ejemplos, opciones = {}) {
  const { cubetas, epocas, paso, l2, minAutores } = { cubetas: ENTRENAMIENTO.CUBETAS, epocas: ENTRENAMIENTO.EPOCAS, paso: ENTRENAMIENTO.PASO, l2: ENTRENAMIENTO.L2, minAutores: ENTRENAMIENTO.MIN_AUTORES, ...opciones };
  const n = ejemplos.length;
  const y = ejemplos.map((e) => {
    const c = CLASES.indexOf(e.clase);
    if (c < 0) throw new Error(`clase desconocida: ${e.clase}`);
    return c;
  });
  const todos = ejemplos.map((e) => rasgos(e.texto, cubetas));
  const quienes = new Map();
  todos.forEach((slots, i) => {
    for (const s of slots) {
      if (!quienes.has(s)) quienes.set(s, new Set());
      quienes.get(s).add(autorDe(ejemplos[i], i));
    }
  });
  // A message weighs by all its slots, with or without a weight: that's how it will be read (puntuar).
  const slotsDe = todos.map((slots) => slots.filter((s) => quienes.get(s).size >= minAutores));
  const valor = todos.map((slots) => 1 / Math.sqrt(slots.length));
  const porClase = [0, 0, 0];
  for (const c of y) porClase[c]++;
  const peso = y.map((c) => 1 / (porClase[c] * porClase.filter(Boolean).length));

  const W = new Float64Array(cubetas * 3);
  const b = new Float64Array(3);
  const [mW, vW, gW] = [new Float64Array(W.length), new Float64Array(W.length), new Float64Array(W.length)];
  const [mb, vb, gb] = [new Float64Array(3), new Float64Array(3), new Float64Array(3)];
  const g = new Float64Array(3);
  for (let t = 1; t <= epocas; t++) {
    gW.fill(0);
    gb.fill(0);
    for (let i = 0; i < n; i++) {
      const slots = slotsDe[i];
      const v = valor[i];
      let [z0, z1, z2] = b;
      for (const s of slots) {
        z0 += W[s * 3] * v;
        z1 += W[s * 3 + 1] * v;
        z2 += W[s * 3 + 2] * v;
      }
      const tope = Math.max(z0, z1, z2);
      const [e0, e1, e2] = [Math.exp(z0 - tope), Math.exp(z1 - tope), Math.exp(z2 - tope)];
      const total = e0 + e1 + e2;
      g[0] = (e0 / total - (y[i] === 0)) * peso[i];
      g[1] = (e1 / total - (y[i] === 1)) * peso[i];
      g[2] = (e2 / total - (y[i] === 2)) * peso[i];
      for (let c = 0; c < 3; c++) gb[c] += g[c];
      for (const s of slots) for (let c = 0; c < 3; c++) gW[s * 3 + c] += g[c] * v;
    }
    const [c1, c2] = [1 - 0.9 ** t, 1 - 0.999 ** t];
    const paso1 = (x, m, v2, grad, o) => {
      m[o] = 0.9 * m[o] + 0.1 * grad;
      v2[o] = 0.999 * v2[o] + 0.001 * grad * grad;
      x[o] -= (paso * (m[o] / c1)) / (Math.sqrt(v2[o] / c2) + 1e-8);
    };
    // A slot nobody trained on has no gradient and stays at zero: nothing to step.
    for (let o = 0; o < W.length; o++) if (gW[o] !== 0 || W[o] !== 0) paso1(W, mW, vW, gW[o] + l2 * W[o], o);
    for (let c = 0; c < 3; c++) paso1(b, mb, vb, gb[c], c);
  }
  let mayor = 0;
  for (const w of W) mayor = Math.max(mayor, Math.abs(w));
  const escala = mayor / 127 || 1;
  return { cubetas, escala, sesgo: [...b], pesos: Int8Array.from(W, (w) => Math.round(w / escala)) };
}

// Whole authors to each of k parts, the busiest first to the emptiest part: nobody's messages on both sides.
export function partesPorAutor(ejemplos, k = 5) {
  const deCada = new Map();
  ejemplos.forEach((e, i) => {
    const a = autorDe(e, i);
    if (!deCada.has(a)) deCada.set(a, []);
    deCada.get(a).push(i);
  });
  const cargas = new Array(k).fill(0);
  const parte = new Array(ejemplos.length);
  for (const filas of [...deCada.values()].sort((x, z) => z.length - x.length)) {
    const j = cargas.indexOf(Math.min(...cargas));
    cargas[j] += filas.length;
    for (const i of filas) parte[i] = j;
  }
  return parte;
}

// What a message is taken for: what the rules say when they say something (reglaDe gives "vender", "comprar" or
// null), and where they don't, the model, that sure.
function lectura(modelo, texto, umbral, reglaDe) {
  const regla = reglaDe(texto);
  if (regla || !modelo) return regla;
  const p = puntuar(modelo, texto);
  const clase = p[1] >= p[2] ? 1 : 2;
  return p[clase] >= umbral ? CLASES[clase] : null;
}

// For "vender" and "comprar": how many there are, how many were read as that, and how many that weren't were.
function cuenta(ejemplos, lecturas) {
  const r = {};
  for (const clase of ["vender", "comprar"]) {
    r[clase] = { hay: 0, aciertos: 0, deMas: 0 };
    ejemplos.forEach((e, i) => {
      if (e.clase === clase) r[clase].hay++;
      if (lecturas[i] === clase) r[clase][e.clase === clase ? "aciertos" : "deMas"]++;
    });
  }
  return r;
}

// How the rules do alone and with a model behind them, on messages the model wasn't trained with, two ways:
// - porAutor: five times, each with a fifth of the people left out and read afterwards. People it never saw, which is
//   what a new member of the group is.
// - alFinal: trained with the first two thirds of the messages by date and read on the last. What it would have done
//   from a given day on, with the sellers it already knew (it needs fecha in every message, or it's null).
// Each is { reglas, conModelo, lecturas }: cuenta's numbers for the rules alone and with the model, and what each
// message was read as with it, by its place in ejemplos (the ones a way didn't read have none).
export function medir(ejemplos, { umbral = INTENCION.UMBRAL, reglaDe = () => null, ...opciones } = {}) {
  const leer = (modelo, filas) => filas.map((i) => lectura(modelo, ejemplos[i].texto, umbral, reglaDe));
  const todas = ejemplos.map((_, i) => i);
  const reglas = leer(null, todas);
  const medida = (filas, lecturas) => {
    const estas = filas.map((i) => ejemplos[i]);
    return { reglas: cuenta(estas, filas.map((i) => reglas[i])), conModelo: cuenta(estas, filas.map((i) => lecturas[i])), lecturas };
  };

  const parte = partesPorAutor(ejemplos);
  const fuera = new Array(ejemplos.length);
  for (let j = 0; j < 5; j++) {
    const dentro = todas.filter((i) => parte[i] !== j);
    const afuera = todas.filter((i) => parte[i] === j);
    if (!afuera.length || !dentro.length) continue;
    const modelo = entrenar(dentro.map((i) => ejemplos[i]), opciones);
    leer(modelo, afuera).forEach((que, k) => (fuera[afuera[k]] = que));
  }
  const porAutor = medida(todas, fuera);

  let alFinal = null;
  if (ejemplos.every((e) => e.fecha)) {
    const enOrden = [...todas].sort((a, z) => (ejemplos[a].fecha < ejemplos[z].fecha ? -1 : ejemplos[a].fecha > ejemplos[z].fecha ? 1 : a - z));
    const corte = Math.floor(enOrden.length * 0.67);
    const despues = enOrden.slice(corte);
    const modelo = entrenar(enOrden.slice(0, corte).map((i) => ejemplos[i]), opciones);
    const tarde = new Array(ejemplos.length);
    leer(modelo, despues).forEach((que, k) => (tarde[despues[k]] = que));
    alFinal = medida(despues, tarde);
  }
  return { porAutor, alFinal };
}
