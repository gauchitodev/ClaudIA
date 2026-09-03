import { crearRecordatorio, textoRecordatorios, olvidarRecordatorio } from "../lib/recordatorios.js";

let plugin = {};
plugin.cmd = ["recordame", "recordar", "recordatorio", "recordatorios", "olvidar"];

plugin.run = async (m, { client, args, command }) => {
  if (command === "recordatorios") return client.sendText(m.chat, textoRecordatorios(m.sender), m);
  if (command === "olvidar") {
    const r = olvidarRecordatorio(m.sender, parseInt(args[0], 10));
    return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
  }
  const r = crearRecordatorio(m.chat, m.sender, args);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
