import { getUser } from "../database-functions.js";
import { lidMencionado } from "../lib/menciones.js";
import { calificar, textoReputacion, textoCalificaciones, borrarCalificacion, editarCalificacion } from "../lib/reputacion.js";

const plugin = {};
plugin.cmd = ["calificar", "reputacion", "reputación", "calificaciones"];
plugin.onlyGroup = true;

// .calificar @persona 5 <comentario> (o respondiendo a un mensaje suyo) · .reputacion [@persona] ·
// .calificaciones [@person] lists them numbered · .calificaciones borrar N · .calificaciones editar N <stars> [comment]
// (deleting and editing: admins of the group it was made in, the owner, and deleting also whoever made it)
plugin.run = async (m, { client, command, args, text, isAdmin, isOwner }) => {
  const enviar = (r) => client.sendMessage(m.chat, { text: r.ok === false ? `❌ ${r.error}` : r.texto ?? r.mensaje, mentions: r.mentions || [] }, { quoted: m });
  const lid = lidMencionado(m, text);

  if (command === "calificaciones") {
    const sub = (args[0] || "").toLowerCase();
    const quien = { lid: m.sender, chat: m.chat, isAdmin, isOwner };
    if (/^(borrar|quitar|sacar)$/.test(sub)) return enviar(borrarCalificacion(parseInt(args[1], 10), quien));
    if (/^(editar|cambiar|corregir)$/.test(sub)) return enviar(editarCalificacion(parseInt(args[1], 10), parseInt(args[2], 10), args.slice(3).join(" "), quien));
    const objetivo = lid || m.sender;
    return enviar(textoCalificaciones(objetivo, m.chat, objetivo === m.sender));
  }

  if (command !== "calificar") {
    const objetivo = lid || m.sender;
    return enviar(textoReputacion(objetivo, objetivo === m.sender));
  }

  if (lid && !getUser(lid)) return client.sendText(m.chat, "❌ No conozco a esa persona todavía.", m);
  const sinMencion = args.filter((a) => !a.startsWith("@"));
  const puntos = parseInt(sinMencion.find((a) => /^[1-5]$/.test(a)), 10);
  const comentario = sinMencion.filter((a) => !/^[1-5]$/.test(a)).join(" ");
  return enviar(calificar(m.chat, m.sender, lid, puntos, comentario));
};

export default plugin;
