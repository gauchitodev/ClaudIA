import { detectarPublicacion, publicar, anunciarPublicacion } from "../lib/compraventa.js";

// #vendo / #compro (y #busco, #venta, #necesito) en un mensaje de grupo registran la publicación con un número.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.isGroup || !m.text || m.fromMe || m.isBaileys) return;
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return;
    const d = detectarPublicacion(m.text);
    if (!d) return;
    const r = publicar(m.chat, m.sender, d.tipo, d.texto, m.key?.id || null);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    // Mismo anuncio que el de .vendo, así una publicación hecha por hashtag también se puede cerrar respondiéndola.
    await anunciarPublicacion(client, m, r);
  } catch (e) {
    console.error("[compraventa] ERROR:", e);
  }
};

export default plugin;
