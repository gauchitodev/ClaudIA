import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { calificar, textoReputacion } from "../lib/reputacion.js";

let plugin = {};
plugin.cmd = ["calificar", "reputacion", "reputación"];
plugin.onlyGroup = true;

// .calificar @persona 5 <comentario> (o respondiendo a un mensaje suyo) · .reputacion [@persona]
plugin.run = async (m, { client, command, args, text }) => {
  const lid = lidMencionado(m, text);

  if (command !== "calificar") {
    const objetivo = lid || m.sender;
    const r = textoReputacion(objetivo, objetivo === m.sender);
    return client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
  }

  if (lid && !getUser(lid)) return client.sendText(m.chat, "❌ No conozco a esa persona todavía.", m);
  const sinMencion = args.filter((a) => !a.startsWith("@"));
  const puntos = parseInt(sinMencion.find((a) => /^[1-5]$/.test(a)), 10);
  const comentario = sinMencion.filter((a) => !/^[1-5]$/.test(a)).join(" ");
  const r = calificar(m.chat, m.sender, lid, puntos, comentario);
  if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
  await client.sendMessage(m.chat, { text: r.mensaje, mentions: r.mentions }, { quoted: m });
};

export default plugin;
