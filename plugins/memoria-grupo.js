import { recordar, textoMemoria, borrar, limpiar, leible } from "../lib/memoria-grupo.js";
import { memoriaDe, olvidarDe } from "../lib/memoria-persona.js";
import { conNombres } from "../lib/menciones.js";

const plugin = {};
plugin.cmd = ["recorda", "recordá", "memoria"];
plugin.onlyGroup = true;

// .recordá que <something> records it · .memoria lists · .memoria borrar <n> · .memoria limpiar (admin)
// .memoria yo: what she learned of you in this group while chatting · .memoria olvidame: she forgets it
plugin.run = async (m, { client, text, args, command, isAdmin, isOwner }) => {
  if (command !== "memoria") {
    // With its mentions as names ("@Ana"): the note goes into every prompt of her chat and her glances, and a mention
    // travels as the digits of a LID, which only the admins get to see (.id), and she'd repeat them to the group.
    const r = recordar(m.chat, m.sender, conNombres(text, m.mentionedJid));
    return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
  }
  const accion = (args[0] || "").toLowerCase();
  if (accion === "yo" || accion === "mia" || accion === "mía") {
    // As the group's notes are shown (leible): what she noted while chatting may hold the digits of a LID she was told
    // about, which sendText turned into a mention of that person.
    const memoria = memoriaDe(m.sender, m.chat);
    return client.sendText(m.chat, memoria ? `🧠 Lo que sé de vos en este grupo: ${leible(memoria.split(" | ").join(" · "))}\nPara que me lo olvide: .memoria olvidame` : "🧠 No tengo nada anotado de vos en este grupo.", m);
  }
  if (accion === "olvidame") {
    return client.sendText(m.chat, olvidarDe(m.sender, m.chat) ? "🧠 Listo, me olvidé de lo que sabía de vos en este grupo." : "🧠 No tenía nada anotado de vos en este grupo.", m);
  }
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
