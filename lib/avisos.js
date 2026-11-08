import { configuracion } from "./configuracion.js";
import { conexion } from "./conexion.js";
import { ultimoAvisoOwner as ultimoEnLaBase, anotarAvisoOwner } from "../database-functions.js";

// Private notices to the bot's owner: startup, reconnecting after a long outage, the AI out of quota, a failed
// backup. Each kind of notice has a throttle so it doesn't repeat (for instance, "AI out of quota" at most every
// 6 hours).
//
// When each one last went out is in the database, so an update (which restarts main.js) doesn't forget it: in memory,
// a notice held back for six hours could come again right after one. Kept here too, as it always was, for a database
// that can't be read or written: the notice of a failed backup may be about the database itself, and goes out all the
// same.
const ultimoAvisoOwner = new Map();
function ultimoDe(clave) {
  let enLaBase = 0;
  try {
    enLaBase = ultimoEnLaBase(clave);
  } catch (e) {
    console.error("[avisos] no pude leer el último aviso:", e.message);
  }
  return Math.max(ultimoAvisoOwner.get(clave) || 0, enLaBase);
}
function anotar(clave, momento) {
  ultimoAvisoOwner.set(clave, momento);
  try {
    anotarAvisoOwner(clave, momento);
  } catch (e) {
    console.error("[avisos] no pude guardar el aviso:", e.message);
  }
}

// The first owner with a number: a config edited by hand can start with an empty entry (config.example.toml comes with
// owners = [""]), and looking only at the first one, nobody would get the notices nor the weekly backup.
export function jidOwner() {
  const numero = (configuracion.owners || []).map((owner) => String(owner || "").replace(/[^0-9]/g, "")).find(Boolean);
  return numero ? `${numero}@s.whatsapp.net` : null;
}

export async function avisarOwner(texto, clave = texto, minIntervaloMs = 0) {
  const jid = jidOwner();
  const client = conexion.client;
  if (!jid || !client?.user || !conexion.botConectado) return false;
  if (minIntervaloMs > 0 && Date.now() - ultimoDe(clave) < minIntervaloMs) return false;
  anotar(clave, Date.now());
  try {
    await client.sendMessage(jid, { text: `🤖 ${texto}` });
    return true;
  } catch (e) {
    console.error("[avisos] no se pudo avisar al owner:", e.message);
    return false;
  }
}
