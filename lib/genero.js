// Someone's gender, as they or an admin set it with .genero: "hombre", "mujer" or nothing (users.genero). It's the
// person's, not a group's. .perfil says it, the ranks agree with it (lib/rangos.js) and the AI is told how to address
// them (plugins/_auto-ia.js, lib/cumpleanos.js). With nothing set, nothing changes: Claudia goes by the name, as she
// always did, and the bot's fixed texts keep the generic masculine. Only those two, as the group asked.
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
