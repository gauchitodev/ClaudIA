import { textoReglas, textoPlantilla, fijarReglas, fijarPlantilla } from "../lib/reglas.js";

const plugin = {};
plugin.cmd = ["reglas", "plantilla"];
plugin.onlyGroup = true;

// .reglas / .plantilla show them (anyone) · .reglas set <text>, .reglas borrar (admins) · same for .plantilla
plugin.run = async (m, { client, command, args, text, isAdmin }) => {
  const esReglas = command === "reglas";
  if (!args.length) return client.sendText(m.chat, esReglas ? textoReglas(m.chat) : textoPlantilla(m.chat), m);
  if (!isAdmin) return client.sendText(m.chat, txt.onlyAdmin, m);
  const cuerpo = /^(set|poner|cargar)$/i.test(args[0]) ? text.slice(args[0].length).trim() : text;
  const r = esReglas ? fijarReglas(m.chat, cuerpo) : fijarPlantilla(m.chat, cuerpo);
  return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
