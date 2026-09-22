// .mitimba: your gambling in this group, game by game — how much you put into each one and how it went.
// .mitimba mes → this month only · .mitimba @persona (or replying to one of their messages) → that person's.
// The group ranking is .timba; both read the same catalogue in lib/timba.js.

import { textoTimbaPersonal, inicioDeMes } from "../lib/timba.js";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["mitimba"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, args, text, participants }) => {
  const soloMes = /^mes$/i.test(args[0] || "");
  const { quien } = destinatario(m, text, participants);
  // Pointing at the bot (usually by replying to a casino result) means "mine": the bot never gambles.
  const esElBot = quien && (quien === client.user?.lid || quien === client.user?.jid);
  const objetivo = quien && !esElBot ? quien : m.sender;

  const r = textoTimbaPersonal(m.chat, objetivo, { desde: soloMes ? inicioDeMes() : 0, esPropio: objetivo === m.sender, soloMes });
  await client.sendText(m.chat, r.texto, m);
};

export default plugin;
