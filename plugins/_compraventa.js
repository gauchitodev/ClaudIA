import { detectarPublicacion, publicar } from "../lib/compraventa.js";

// #vendo / #compro (y #busco, #venta, #necesito) en un mensaje de grupo registran la publicación con un número.
let plugin = (m) => m;
plugin.before = async function (m, { client }) {
  try {
    if (!m.isGroup || !m.text || m.fromMe || m.isBaileys) return;
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return;
    const d = detectarPublicacion(m.text);
    if (!d) return;
    const r = publicar(m.chat, m.sender, d.tipo, d.texto, m.key?.id || null);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    await client.sendText(m.chat, r.mensaje, m);
    if (r.avisos) await client.sendMessage(m.chat, { text: r.avisos.texto, mentions: r.avisos.mentions });
  } catch (e) {
    console.error("[compraventa] ERROR:", e);
  }
};

export default plugin;
