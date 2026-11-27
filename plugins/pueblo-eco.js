import { puebloActivo, nombreDelPueblo } from "../lib/pueblo.js";
import { publicarDiario, edicionesDe } from "../lib/pueblo-diario.js";

// .eco: the town's Sunday paper (lib/pueblo-diario.js). The real one goes out on Sunday with the recap; this shows how
// the week's front page is coming along (drawn, never Gemini's, and not kept as an edition) and the last edition's
// headlines. Once every ESPERA_MS per group: drawing a page takes the bot a second.
const plugin = {};
plugin.cmd = ["eco", "diariodelpueblo"];
plugin.economia = true;
plugin.onlyGroup = true;

export const ESPERA_MS = 10 * 60 * 1000;
const ultimaVez = new Map();
const fechaCorta = (ms) => new Date(ms).toLocaleDateString("es-UY", { day: "numeric", month: "numeric" });

plugin.run = async (m, { client }) => {
  try {
    if (!puebloActivo(m.chat)) return client.sendText(m.chat, `📰 Sin pueblo no hay diario. Un admin lo funda con .pueblo on, y los domingos sale El Eco${nombreDelPueblo(m.chat) ? ` de ${nombreDelPueblo(m.chat)}` : ""} con la recap.`, m);
    const [ultima] = edicionesDe(m.chat, 1);
    const anterior = ultima ? `\n\n🗞️ El último número (N.º ${ultima.numero}, del ${fechaCorta(ultima.fecha)}): ${ultima.titulares.map((t) => `«${t.titulo}»`).join(" · ")}` : "";
    const espera = (ultimaVez.get(m.chat) || 0) + ESPERA_MS - Date.now();
    if (espera > 0) return client.sendText(m.chat, `📰 La imprenta está caliente: la tapa se vuelve a imprimir en ${Math.ceil(espera / 60000)} min.${anterior}`, m);
    ultimaVez.set(m.chat, Date.now());
    const r = await publicarDiario(m.chat, Date.now(), { conIlustracion: false });
    if (!r) return;
    await client.sendMessage(m.chat, { image: r.imagen, caption: `${r.texto}\n\n_Así viene la tapa de esta semana: el número de verdad sale el domingo con la recap._${anterior}`, mentions: r.mentions });
  } catch (e) {
    console.error("[eco] ERROR:", e);
  }
};

export default plugin;
