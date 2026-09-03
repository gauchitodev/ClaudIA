import { recordar, textoMemoria, borrar, limpiar } from "../lib/memoria-grupo.js";

let plugin = {};
plugin.cmd = ["recorda", "recordá", "memoria"];
plugin.onlyGroup = true;

// .recordá que <algo> anota · .memoria lista · .memoria borrar <n> · .memoria limpiar (admin)
plugin.run = async (m, { client, text, args, command, isAdmin, isOwner }) => {
  if (command !== "memoria") {
    const r = recordar(m.chat, m.sender, text);
    return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
  }
  const accion = (args[0] || "").toLowerCase();
  if (accion === "borrar" || accion === "olvidar") {
    const r = borrar(m.chat, m.sender, parseInt(args[1], 10), isAdmin || isOwner);
    return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
  }
  if (accion === "limpiar") {
    if (!isAdmin && !isOwner) return client.sendText(m.chat, txt.onlyAdmin, m);
    return client.sendText(m.chat, limpiar(m.chat).mensaje, m);
  }
  await client.sendText(m.chat, textoMemoria(m.chat), m);
};

export default plugin;
