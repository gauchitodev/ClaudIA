import { recordar, textoMemoria, borrar, limpiar, leible } from "../lib/memoria-grupo.js";
import { memoriaDe, olvidarDe } from "../lib/memoria-persona.js";
import { conNombres } from "../lib/menciones.js";
import txt from "../lib/strings.js";

const plugin = {};
plugin.cmd = ["nota", "notas", "recorda"];
plugin.onlyGroup = true;

// What .nota takes that is .notas' written in the singular: nothing, one of its words alone ("limpiar", "yo",
// "olvidame"), or "borrar" and a number. Anything else is a note to keep, "borrar la carpeta vieja" included: nobody
// means to keep "borrar 3" or "olvidame" as one.
const esDeLaLista = (args) =>
  args.length === 0 || (args.length === 1 && /^(limpiar|yo|m[ií]a|olvidame)$/i.test(args[0])) || (args.length === 2 && /^(borrar|olvidar)$/i.test(args[0]) && /^\d+$/.test(args[1]));

// What Claudia has noted down in a group, all under one name:
// - the group's notes: .nota <something> (or .recordá que <something>) keeps one · .notas lists them · .notas borrar
//   <n> · .notas limpiar (admin);
// - what she noted of each person while chatting: .notas yo shows yours in this group · .notas olvidame makes her
//   forget it.
// It all was .memoria's, which is gone: a numbered list that people write isn't something she remembers, and two names
// for the same notes were one too many.
plugin.run = async (m, { client, text, args = [], command, isAdmin, isOwner }) => {
  const deLaLista = command === "notas" || (command === "nota" && esDeLaLista(args));
  if (!deLaLista) {
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
    return client.sendText(m.chat, memoria ? `🧠 Lo que sé de vos en este grupo: ${leible(memoria.split(" | ").join(" · "))}\nPara que me lo olvide: .notas olvidame` : "🧠 No tengo nada anotado de vos en este grupo.", m);
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
