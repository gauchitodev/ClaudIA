// How much what someone typed looks like a name or a text: for finding commands (.buscarcomando, .menu <palabra> when
// it isn't a topic, and the answer to a command that doesn't exist; lib/menu.js), and the edits between two words for
// the riddles' answers too (lib/acertijos.js). Everything is compared without accents or capitals, word by word.

// Edits between two words (Levenshtein): a letter put in, taken out or changed counts one. With transposiciones, two
// letters side by side swapped ("stikcer", "clmia") count one too, as the one slip they are: plain, they were two.
export function distancia(a, b, { transposiciones = false } = {}) {
  let dosAtras = null;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(anterior[j] + 1, fila[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (transposiciones && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, dosAtras[j - 2] + 1);
      fila.push(d);
    }
    dosAtras = anterior;
    anterior = fila;
  }
  return anterior[b.length];
}

// Lowercase and without accents, the ñ's too, as the commands are declared (limpiarNombre, lib/comandos.js).
export const sinTildes = (texto) =>
  String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

// A text's words, without accents: its runs of letters and digits.
export const palabrasDe = (texto) => sinTildes(texto).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// How much a typed word looks like a command's name, from 0 to 1: 1 the same; its beginning ("stick" for .sticker), when
// it's half the name at least, a little less, the less the more is missing ("lista" isn't .listaparejas); otherwise by
// the edits between them, two swapped letters as one. Two letters or fewer count only whole: .s and .tt are names of
// their own, and ".sx" isn't a slip of either. Without comienzo, a beginning is only as near as its edits make it.
export function parecidoDeNombre(tecleado, nombre, { comienzo = true } = {}) {
  const a = sinTildes(tecleado);
  const b = sinTildes(nombre);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length <= 2) return 0;
  if (comienzo && b.startsWith(a) && a.length * 2 >= b.length) return 0.8 + (0.2 * a.length) / b.length;
  return Math.max(0, 1 - distancia(a, b, { transposiciones: true }) / Math.max(a.length, b.length));
}

// The letters two words share from their beginning.
function comienzoComun(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// How well a typed word turns up among a text's words, from 0 to 1: 1 the same word; 0.9 when they begin alike, four
// letters at least and most of the longer one, as the forms of a word do ("descargar" and "descarga", "sorteo" and
// "sortear", "video" and "videos"; not "trans" and "transferir"); otherwise, from seven letters, a word one slip away
// (two from ten), counting less: people search by what a command does in words they know how to write, and among short
// words one letter makes another ("plata", "playa", "plaza").
export function hallada(palabra, palabras) {
  let mejor = 0;
  const margen = palabra.length < 7 ? 0 : palabra.length < 10 ? 1 : 2;
  for (const p of palabras) {
    if (p === palabra) return 1;
    const comun = comienzoComun(p, palabra);
    if (comun >= 4 && comun >= 0.6 * Math.max(p.length, palabra.length)) {
      mejor = Math.max(mejor, 0.9);
    } else if (margen && Math.abs(p.length - palabra.length) <= margen) {
      const d = distancia(palabra, p, { transposiciones: true });
      if (d <= margen) mejor = Math.max(mejor, 0.7 * (1 - d / Math.max(p.length, palabra.length)));
    }
  }
  return mejor;
}

// Words that say nothing of what someone is looking for: "cómo hago un sticker" looks for "sticker". A search of only
// these keeps them.
const VACIAS = new Set(
  "a al algo algun alguno como con cual de del donde el en es esa ese esta este hace hacer hago hay la las le lo los me mi o para por puedo que quiero se si sirve su te tu un una uno unos unas ver y comando comandos".split(" "),
);

// A word found in this many candidates or fewer counts whole; the more of them it's in, the less: "grupo" is in most of
// the menu's lines, and alone it found any of them.
const RARA = 5;

// The candidates that look like what was typed, the most alike first, each as { candidato, puntos, nombre, texto }.
// Each candidate brings the names it answers to (nombres) and its words, in groups with what they weigh (textos:
// [{ palabras, peso }], the same groups in the same order for all of them): what a command does weighs more than the
// examples of how it's written or its topic's name. "nombre" is how much the typed text looks like one of its names,
// all together or a word of it; "texto" how much its words turn up among the candidate's, each by how rare it is, and
// less in a group of words much longer than the others' (a word turns up in a long text more easily). A candidate
// comes out when either reaches its minimum, so a search like "asdsadsa" finds nothing instead of the five least
// unlike; a name asks for more, since one or two edits make a long name into another (.destapar is three from
// "descargar"). A name typed whole comes first: .ln2's line tells about .vln, and came before .vln's own. Ties keep the
// candidates' order.
export function ordenarPorParecido(consulta, candidatos, { minimoNombre = 0.75, minimoTexto = 0.6 } = {}) {
  const todas = palabrasDe(consulta);
  const utiles = todas.filter((p) => !VACIAS.has(p));
  const palabras = utiles.length ? utiles : todas;
  if (!palabras.length || !candidatos.length) return [];
  // A name comes typed all together, or as one word among others: that one, whole or misspelled, but not as a name's
  // beginning, or "lista negra" was .listaadv's.
  const junto = palabras.join("");
  const sueltas = palabras.length > 1 ? palabras : [];
  const comoNombre = (n) => Math.max(parecidoDeNombre(junto, n), ...sueltas.map((p) => parecidoDeNombre(p, n, { comienzo: false })));
  const largoMedio = candidatos[0].textos.map((_, g) => candidatos.reduce((suma, c) => suma + c.textos[g].palabras.length, 0) / candidatos.length);
  const porLargo = (t, g) => Math.min(1, Math.sqrt(largoMedio[g] / Math.max(1, t.palabras.length)));
  const hallazgos = candidatos.map((c) => palabras.map((p) => Math.max(0, ...c.textos.map((t, g) => t.peso * porLargo(t, g) * hallada(p, t.palabras)))));
  // Among RARA candidates or fewer, every word found is rare. One found in none is rarest of all: it still weighs on what
  // the rest found, or "echar a alguien" found every line that says "alguien".
  const tope = Math.log(candidatos.length / RARA);
  const rareza = palabras.map((_, i) => {
    const en = hallazgos.filter((h) => h[i] > 0).length;
    return en && tope > 0 ? Math.min(1, Math.log(candidatos.length / en) / tope) : 1;
  });
  const pesoTotal = Math.max(1, rareza.reduce((a, b) => a + b, 0));
  return candidatos
    .map((candidato, k) => {
      const nombre = Math.max(0, ...candidato.nombres.map(comoNombre));
      const texto = hallazgos[k].reduce((suma, h, i) => suma + h * rareza[i], 0) / pesoTotal;
      // A name counts a little over the words: "tiktk" is .tt's name misspelled before it's .antitiktok's TikTok.
      return { candidato, puntos: Math.max(nombre, 0.9 * texto) + 0.1 * Math.min(nombre, texto), nombre, texto };
    })
    .filter((r) => r.nombre >= minimoNombre || r.texto >= minimoTexto)
    .sort((a, b) => (b.nombre === 1) - (a.nombre === 1) || b.puntos - a.puntos);
}
