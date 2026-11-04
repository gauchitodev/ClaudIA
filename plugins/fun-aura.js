import { desafiarAura, aceptarAura, rechazarAura, retadoEn, textoAura } from "../lib/aura.js";
import { mencionadoActual, comoLoEsperan, esElBot } from "../lib/identidad.js";
import { marcarMensajeDeJuego } from "../lib/mensajes-de-juego.js";

// .aura @persona, or replying to their message: an aura duel (lib/aura.js) · .aura si / .aura no: the answer of whoever
// was challenged, and .aura no from whoever challenged takes it back · .aura alone, or replying to Claudia: the
// month's ranking.
const plugin = {};
plugin.cmd = ["aura"];
plugin.juego = true; // .juegos off and .modo compraventa stop it
plugin.onlyGroup = true;

const RESPUESTAS = { si: "si", sí: "si", no: "no" };

plugin.run = async (m, { client, text, args = [], participants }) => {
  // What goes out minutes later (the expiry, the result) goes through the socket of the moment: a reconnection in
  // between replaces the one this command came with.
  const socket = () => globalThis.client || client;
  const avisar = (r) => socket().sendMessage(m.chat, { text: r.texto, mentions: r.mentions || [] }, r.citar ? { quoted: r.citar } : undefined);
  const responder = (r) => (r.ok ? client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions || [] }, { quoted: m }) : client.sendText(m.chat, `❌ ${r.error}`, m));

  const respuesta = RESPUESTAS[String(args[0] || "").toLowerCase()];
  if (respuesta) {
    // Challenged by their LID, whoever writes from their number alone answers from it (lib/identidad.js).
    const como = await comoLoEsperan(client, m, participants, retadoEn(m.chat, m.sender));
    const quien = { quien: m.sender, quienJid: m.senderJid, como };
    if (respuesta === "no") return responder(rechazarAura(m.chat, quien));
    try {
      const r = await aceptarAura(m.chat, { ...quien, participants, enviar: (texto, mentions) => client.sendMessage(m.chat, { text: texto, mentions }), alCerrar: avisar });
      if (!r.ok) return responder(r);
    } catch (e) {
      console.error("[aura] no salió la votación:", e?.message || e);
      return client.sendText(m.chat, "❌ No pude abrir la votación, así que el duelo queda sin efecto. Probá de nuevo en un rato.", m);
    }
    return;
  }

  if (!String(text || "").trim() && (!m.quoted || esElBot(m.quoted.sender, client))) {
    return client.sendMessage(m.chat, { text: textoAura(m.chat, m.sender) }, { quoted: m });
  }

  const { lid, deWhatsApp } = await mencionadoActual(client, m, text, participants);
  const r = desafiarAura(m.chat, { retador: m.sender, retadorJid: m.senderJid, retado: lid, participants, deWhatsApp, alVencer: avisar });
  const enviado = await responder(r);
  // Replies to the challenge aren't things said to Claudia (plugins/_auto-ia.js).
  if (r.ok) marcarMensajeDeJuego(enviado?.key?.id, m.chat, { juego: "aura" });
};

export default plugin;
