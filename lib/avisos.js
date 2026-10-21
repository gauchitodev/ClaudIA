// Private notices to the bot's owner: startup, reconnecting after a long outage, the AI out of quota, a failed
// backup. Each kind of notice has a throttle so it doesn't repeat (for instance, "AI out of quota" at most every
// 6 hours).
if (!globalThis.ultimoAvisoOwner) globalThis.ultimoAvisoOwner = new Map();

// The first owner with a number: a config edited by hand can start with an empty entry (config.example.toml comes with
// owners = [""]), and looking only at the first one, nobody would get the notices nor the weekly backup.
export function jidOwner() {
  const numero = (globalThis.owners || []).map((owner) => String(owner || "").replace(/[^0-9]/g, "")).find(Boolean);
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
