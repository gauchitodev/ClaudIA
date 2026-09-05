import { aplicarModo, textoModo } from "../lib/modo.js";

let plugin = {};
plugin.cmd = ["modo"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

// .modo compraventa / .modo amigos cambian de una todos los interruptores "de grupo de amigos" · .modo muestra cómo está
plugin.run = async (m, { client, text }) => {
  if (!(text || "").trim()) return client.sendText(m.chat, textoModo(m.chat), m);
  const r = aplicarModo(m.chat, text);
  return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
