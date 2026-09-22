// .mitimba: tu timba en este grupo, desglosada por juego — cuánto pusiste en cada uno y cómo te fue.
// .mitimba mes → solo este mes · .mitimba @persona (o respondiendo a un mensaje suyo) → la de esa persona.
// El ranking del grupo es .timba; los dos leen el mismo catálogo de lib/timba.js.

import { textoTimbaPersonal, inicioDeMes } from "../lib/timba.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["mitimba"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, args, text, participants }) => {
  const soloMes = /^mes$/i.test(args[0] || "");
  const { quien } = destinatario(m, text, participants);
  const objetivo = quien || m.sender;

  const r = textoTimbaPersonal(m.chat, objetivo, { desde: soloMes ? inicioDeMes() : 0, esPropio: objetivo === m.sender, soloMes });
  await client.sendText(m.chat, r.texto, m);
};

export default plugin;
