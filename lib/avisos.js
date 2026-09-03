// Avisos al dueño del bot por privado: arranque, reconexión tras una caída larga, IA sin cuota, backup fallido.
// Cada tipo de aviso tiene un freno para no repetirse (por ejemplo, "IA sin cuota" como mucho cada 6 horas).
if (!globalThis.ultimoAvisoOwner) globalThis.ultimoAvisoOwner = new Map();

export function jidOwner() {
  const numero = String((globalThis.owners || [])[0] || "").replace(/[^0-9]/g, "");
  return numero ? `${numero}@s.whatsapp.net` : null;
}

export async function avisarOwner(texto, clave = texto, minIntervaloMs = 0) {
  const jid = jidOwner();
  const client = globalThis.client;
  if (!jid || !client?.user || !globalThis.botConectado) return false;
  const ultimo = globalThis.ultimoAvisoOwner.get(clave) || 0;
  if (minIntervaloMs > 0 && Date.now() - ultimo < minIntervaloMs) return false;
  globalThis.ultimoAvisoOwner.set(clave, Date.now());
  try {
    await client.sendMessage(jid, { text: `🤖 ${texto}` });
    return true;
  } catch (e) {
    console.error("[avisos] no se pudo avisar al owner:", e.message);
    return false;
  }
}
