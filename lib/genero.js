// Someone's gender, as they or an admin set it with .genero: "hombre", "mujer" or nothing (users.genero). It's the
// person's, not a group's. .perfil says it, the ranks agree with it (lib/rangos.js) and the AI is told how to address
// them: whoever she's talking to (plugins/_auto-ia.js, plugins/tools-ia.js, lib/cumpleanos.js) and whoever else the
// messages she's given show (those two, lib/vistazos.js, lib/resumen.js, lib/recap.js). With nothing set, nothing
// changes: Claudia goes by the name, as she always did, and the bot's fixed texts keep the generic masculine. Only
// those two, as the group asked.
import { getUser, updateUser } from "../database-functions.js";

const sinAcentos = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
const PALABRAS = { hombre: "hombre", varon: "hombre", masculino: "hombre", mujer: "mujer", femenino: "mujer", borrar: "", quitar: "", sacar: "", ninguno: "" };

// What a .genero text asks for: "hombre", "mujer", "" to take it out, or undefined when it's none of those.
export const leerGenero = (texto) => PALABRAS[sinAcentos(texto)];

export const generoDe = (lid) => getUser(lid)?.genero || "";
export const ponerGenero = (lid, genero) => updateUser(lid, { genero });

// For the AI's prompt: how to address them, or "" with nothing set, so she keeps going by the name.
export function tratoPara(lid, nombre = "Esta persona") {
  const genero = generoDe(lid);
  if (!genero) return "";
  return genero === "mujer" ? `${nombre} es mujer: tratala en femenino.` : `${nombre} es hombre: tratalo en masculino.`;
}

const enLista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}` : xs[0]);

// For the AI's prompt, about the people a conversation shows besides whoever she's answering: the gender each one set,
// by the name the prompt shows them with, so she gets it right when she talks to them or about them. She used to be
// told only of whoever was talking to her: everybody else went by their name, and a nickname says nothing.
// personas: [{ id, nombre }], each as many times as they show up. menos: ids of whoever the prompt tells apart already.
// Whoever set nothing isn't named, and neither is a name two people show up with unless all of them set the same: the
// lines don't tell which one said what. "" when there's nothing to tell.
export function tratoDeQuienesAparecen(personas, { donde = "que aparecen ahí", menos = [] } = {}) {
  const leidos = new Map(); // id -> the row it is and what it set, read once
  const leer = (id) => {
    if (!leidos.has(id)) {
      const fila = getUser(id);
      leidos.set(id, { fila: fila?.lid || id, genero: fila?.genero || "" });
    }
    return leidos.get(id);
  };
  const aparte = new Set((menos || []).filter(Boolean).map((id) => leer(id).fila));
  const porNombre = new Map(); // the name shown -> what each one who shows up with it set ("" for nothing)
  for (const { id, nombre } of personas || []) {
    if (!id || !nombre) continue;
    const { fila, genero } = leer(id);
    if (aparte.has(fila)) continue;
    porNombre.set(nombre, (porNombre.get(nombre) || new Set()).add(genero));
  }
  const anotados = [...porNombre].filter(([, generos]) => generos.size === 1 && !generos.has("")).map(([nombre, [genero]]) => `${nombre} (${genero})`);
  if (!anotados.length) return "";
  return `De las personas ${donde}, anotaron su género: ${enLista(anotados)}. Respetalo cuando les hables o hables de ellas; con las demás, guiate por el nombre.`;
}

// Who a chat's stored messages show (lib/contexto-chat.js), hers aside: each one's author, by the name it's stored
// with, which is the one the prompt shows.
export const personasDe = (entradas) => (entradas || []).filter((e) => !e.esBot).map((e) => ({ id: e.usuario, nombre: e.nombre }));

// tratoDeQuienesAparecen, for those messages.
export const tratoDeLaCharla = (entradas, opciones) => tratoDeQuienesAparecen(personasDe(entradas), opciones);

// The gender of several people at once, for what's said of them together ("casados", "Bienvenid@s"): "mujer" when
// every one who set it is a woman and nobody is left unset, "hombre" with any man or anyone unset among people who did
// set it (the generic masculine), and "" when nobody set anything.
export function generoDeVarios(ids) {
  const generos = (ids || []).filter(Boolean).map(generoDe);
  if (!generos.some(Boolean)) return "";
  return generos.every((g) => g === "mujer") ? "mujer" : "hombre";
}

// The bot's fixed texts about one person carry the generic masculine ("ganador", "elegido") or a spelling for both
// ("hijo/a", "lind@", "eliminado(a)"): concordar rewrites those words in the gender of whoever the text is about, when
// it's set. With nothing set the text goes as written, so nothing changes for whoever never used .genero. The words
// keep their case ("GANADOR" → "GANADORA", "Bienvenid@s" → "Bienvenidas"). concordarPlural does the same for what's
// said of several people, with generoDeVarios.
const FORMAS = {
  // kinship (lib/familia.js)
  "hijo/a": ["hijo", "hija"],
  "hermano/a": ["hermano", "hermana"],
  "abuelo/a": ["abuelo", "abuela"],
  "nieto/a": ["nieto", "nieta"],
  "tío/a": ["tío", "tía"],
  "sobrino/a": ["sobrino", "sobrina"],
  "primo/a": ["primo", "prima"],
  "bisabuelo/a": ["bisabuelo", "bisabuela"],
  "bisnieto/a": ["bisnieto", "bisnieta"],
  "suegro/a": ["suegro", "suegra"],
  "cuñado/a": ["cuñado", "cuñada"],
  "consuegro/a": ["consuegro", "consuegra"],
  "esposo/a": ["esposo", "esposa"],
  "lejano/a": ["lejano", "lejana"],
  "padre o madre": ["padre", "madre"],
  "yerno o nuera": ["yerno", "nuera"],
  // couples and kisses
  "novia/o": ["novio", "novia"],
  "mía/o": ["mío", "mía"],
  "chico/a": ["chico", "chica"],
  "marido/mujer": ["marido", "mujer"],
  casado: ["casado", "casada"],
  // adoptions (plugins/familia-adoptar.js)
  hijo: ["hijo", "hija"],
  "vos mismo": ["vos mismo", "vos misma"],
  adoptarlo: ["adoptarlo", "adoptarla"],
  antepasado: ["antepasado", "antepasada"],
  // games and cards
  "lind@": ["lindo", "linda"],
  "pajer@": ["pajero", "pajera"],
  "fe@": ["feo", "fea"],
  acosador: ["acosador", "acosadora"],
  ganador: ["ganador", "ganadora"],
  votado: ["votado", "votada"],
  activo: ["activo", "activa"],
  "un santo": ["un santo", "una santa"],
  desocupado: ["desocupado", "desocupada"],
  // moderation
  "eliminado/a": ["eliminado", "eliminada"],
  "eliminado(a)": ["eliminado", "eliminada"],
  elegido: ["elegido", "elegida"],
  baneado: ["baneado", "baneada"],
  pesado: ["pesado", "pesada"],
  "pendej@": ["pendejo", "pendeja"],
};
const PLURALES = {
  casados: ["casados", "casadas"],
  novios: ["novios", "novias"],
  ganadores: ["ganadores", "ganadoras"],
  "bienvenid@s": ["bienvenidos", "bienvenidas"],
};
const patron = (formas) =>
  new RegExp(
    `(?<!\\p{L})(?:${Object.keys(formas)
      .sort((a, b) => b.length - a.length)
      .map((f) => f.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"))
      .join("|")})(?!\\p{L})`,
    "giu",
  );
const PATRON = patron(FORMAS);
const PATRON_PLURAL = patron(PLURALES);
// The word as it came: all in capitals, with its first capital, or in lower case.
const comoVenia = (original, palabra) => {
  if (original !== original.toLowerCase() && original === original.toUpperCase()) return palabra.toUpperCase();
  if (/^\p{Lu}/u.test(original)) return palabra[0].toUpperCase() + palabra.slice(1);
  return palabra;
};
const reescribir = (texto, genero, formas, regex) => {
  if (genero !== "hombre" && genero !== "mujer") return texto;
  return String(texto).replace(regex, (forma) => comoVenia(forma, formas[forma.toLowerCase()][genero === "mujer" ? 1 : 0]));
};
export const concordar = (texto, genero) => reescribir(texto, genero, FORMAS, PATRON);
export const concordarPlural = (texto, genero) => reescribir(texto, genero, PLURALES, PATRON_PLURAL);
