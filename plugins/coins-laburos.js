import { textoLaburos, buscarOficio, tomarLaburo, cobrar, renunciar } from "../lib/laburos.js";

const plugin = {};
plugin.cmd = ["laburos", "laburo", "trabajo", "trabajos", "cobrar", "renunciar"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, command, args }) => {
  const cmd = command.toLowerCase();

  if (cmd === "cobrar") {
    const r = cobrar(m.chat, m.sender);
    return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
  }

  if (cmd === "renunciar") {
    const r = renunciar(m.chat, m.sender);
    return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
  }

  // .laburos / .laburo with no name → the list; .laburo <name> → take it
  const clave = buscarOficio(args.join(" "));
  if (!clave) {
    if (args.length > 0) return client.sendText(m.chat, "Ese laburo no existe. Mirá la lista con .laburos", m);
    return client.sendText(m.chat, textoLaburos(m.chat, m.sender), m);
  }
  const r = tomarLaburo(m.chat, m.sender, clave);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
