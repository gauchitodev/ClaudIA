// Per-group rules and posting template. An admin sets them; the rules are sent to newcomers (from main.js, on the
// participants event) and anyone can ask for them with .reglas; the template is the suggested posting format.
import { getChat, updateChat } from "../database-functions.js";

export const REGLAS = { MAX_LARGO: 1500 };
export const PLANTILLA_DEFAULT = "#vendo qué es · precio · zona · estado (nuevo / usado) · una foto\nEjemplo: #vendo bici rodado 26, $ 4.000, Pocitos, poco uso";

export const reglasDe = (chat) => getChat(chat)?.reglas || "";
export const plantillaDe = (chat) => getChat(chat)?.plantilla || PLANTILLA_DEFAULT;

export function textoReglas(chat) {
  const r = reglasDe(chat);
  return r ? `📋 *Reglas del grupo*\n\n${r}` : "📋 Este grupo no tiene reglas cargadas. Un admin las pone con .reglas set <texto>.";
}

export function textoPlantilla(chat) {
  return `📝 *Para publicar, este formato:*\n${plantillaDe(chat)}`;
}

function fijar(chat, columna, texto, nombre) {
  const t = String(texto || "").trim();
  if (/^(borrar|off|quitar|ninguna|ninguno)$/i.test(t)) {
    updateChat(chat, { [columna]: "" });
    return { ok: true, mensaje: `🗑️ Listo, ${nombre === "reglas" ? "borré las reglas" : "la plantilla vuelve a ser la de siempre"}.` };
  }
  if (t.length < 5) return { ok: false, error: `Poné el texto después de "set", por ejemplo: .${nombre} set <texto>` };
  if (t.length > REGLAS.MAX_LARGO) return { ok: false, error: `Muy largo: como mucho ${REGLAS.MAX_LARGO} caracteres.` };
  updateChat(chat, { [columna]: t });
  return { ok: true, mensaje: nombre === "reglas" ? "📋 Listo, reglas cargadas. Se las mando al que entra y cualquiera las ve con .reglas." : "📝 Listo, plantilla cargada. Se ve con .plantilla." };
}

export const fijarReglas = (chat, texto) => fijar(chat, "reglas", texto, "reglas");

const mencion = (id) => `@${id.split("@")[0]}`;

// Newcomers get the rules, if there are any. "participantes" comes from the Baileys event: bare ids or objects with an id.
export function avisoReglasParaNuevos(chat, participantes) {
  const r = reglasDe(chat);
  if (!r) return null;
  const ids = (participantes || []).map((p) => (typeof p === "string" ? p : p?.id || "")).filter(Boolean);
  if (!ids.length) return null;
  return { texto: `👋 Bienvenid@s ${ids.map(mencion).join(" ")}. Antes de publicar, las reglas del grupo:\n\n${r}\n\n(.reglas las muestra de nuevo · .plantilla el formato para publicar)`, mentions: ids };
}
export const fijarPlantilla = (chat, texto) => fijar(chat, "plantilla", texto, "plantilla");
