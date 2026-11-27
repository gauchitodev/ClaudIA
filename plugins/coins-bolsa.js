import { textoGente, anotarDisponible, quitarDisponible, ofrecerChanga, anotarMensaje, agarrarChanga, textoChangasDelDia } from "../lib/bolsa.js";
import { leerEntero } from "../lib/comandos.js";
import { modoDeNombre, nombrandoPor } from "../lib/menciones.js";

// The job board (lib/bolsa.js). .gente: the group's people with their trade, level and how they stand (looking for
// work, free, working and where, or a boss); .gente nombres or numeros names them that way · .disponible [what you're
// after] / .nodisponible: down as looking for work, or off · .ofrecerchanga 50 [bolsillo] Descargar el camión: a boss
// posts a one-day job, paid from the caja (or the pocket) · .agarrar (answering it, or .agarrar 2): the first one
// takes it and is paid.
const plugin = {};
plugin.cmd = ["gente", "disponible", "nodisponible", "ofrecerchanga", "agarrar"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, command, args = [], text, participants }) => {
  const cmd = command.toLowerCase();
  const responder = (r) => client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m, r.mentions?.length ? { mentions: r.mentions } : {});

  if (cmd === "gente") {
    const { modo } = modoDeNombre(text);
    return client.sendText(m.chat, nombrandoPor(modo, () => textoGente(m.chat, participants)), m);
  }
  if (cmd === "disponible") return responder(anotarDisponible(m.chat, m.sender, args.join(" ")));
  if (cmd === "nodisponible") return responder(quitarDisponible(m.chat, m.sender));

  if (cmd === "ofrecerchanga") {
    if (!args.length) return client.sendText(m.chat, textoChangasDelDia(m.chat), m);
    const r = ofrecerChanga(m.chat, m.sender, args, Date.now(), participants);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    const enviado = await client.sendText(m.chat, r.texto, m, { mentions: r.mentions });
    return anotarMensaje(r.id, enviado?.key?.id);
  }

  // .agarrar: the one the message answers, or the number.
  return responder(agarrarChanga(m.chat, m.sender, { citado: m.quoted?.id || null, numero: leerEntero(args[0]) }));
};

export default plugin;
