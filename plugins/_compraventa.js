import { detectarPublicacion, publicar, anunciarPublicacion } from "../lib/compraventa.js";

// #vendo / #compro (and #busco, #venta, #necesito) in a group message record the post with a number.
const plugin = (m) => m;
plugin.before = async (m, { client }) => {
  try {
    if (!m.isGroup || !m.text || m.fromMe || m.isBaileys) return;
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return;
    const d = detectarPublicacion(m.text);
    if (!d) return;
    const r = publicar(m.chat, m.sender, d.tipo, d.texto, m.key?.id || null);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    // The same announcement .vendo makes, so a post created by hashtag can be closed by replying to it too.
    await anunciarPublicacion(client, m, r);
  } catch (e) {
    console.error("[compraventa] ERROR:", e);
  }
};

export default plugin;
