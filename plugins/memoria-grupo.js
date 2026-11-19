import { recordar, textoMemoria, borrar, limpiar, leible } from "../lib/memoria-grupo.js";
import { recuerdosDe, olvidarDe, olvidarUno } from "../lib/memoria-persona.js";
import { haceCuanto } from "../lib/tiempo.js";
import { conNombres } from "../lib/menciones.js";
import txt from "../lib/strings.js";

const plugin = {};
plugin.cmd = ["nota", "notas", "recorda"];
plugin.onlyGroup = true;

// What .nota takes that is .notas' written in the singular: nothing, one of its words alone ("limpiar", "yo",
// "olvidame"), "borrar", "olvidar" or "olvidame" and a number, or "olvidame todo". Anything else is a note to keep,
// "borrar la carpeta vieja" included: nobody means to keep "borrar 3" or "olvidame" as one.
const esDeLaLista = (args) =>
  args.length === 0 || (args.length === 1 && /^(limpiar|yo|m[ií]a|olvidame)$/i.test(args[0])) || (args.length === 2 && /^((borrar|olvidar|olvidame) \d+|olvidame todo)$/i.test(args.join(" ")));

// What Claudia has noted down in a group, all under one name:
// - the group's notes: .nota <something> (or .recordá que <something>) keeps one · .notas lists them · .notas borrar
//   <n> · .notas limpiar (admin);
// - what she noted of each person while chatting: .notas yo shows yours in this group, each thing with when she
//   learned it · .notas olvidame (or olvidame todo) makes her forget it all · .notas olvidame <n>, one thing.
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
    const recuerdos = recuerdosDe(m.sender, m.chat);
    if (!recuerdos.length) return client.sendText(m.chat, "🧠 No tengo nada anotado de vos en este grupo.", m);
    // Numbered, to have her forget one, and with when she learned each: what was kept before the dates has none.
    const lineas = recuerdos.map((r, i) => `${i + 1}. ${leible(r.dato)}${r.fecha ? ` (${haceCuanto(r.fecha)})` : ""}`);
    return client.sendText(m.chat, `🧠 Lo que sé de vos en este grupo:\n${lineas.join("\n")}\nPara que me olvide de una: .notas olvidame <número> · de todo: .notas olvidame`, m);
  }
  if (accion === "olvidame") {
    // Alone, or with "todo", it's all of it. With a number, that one. With anything else, nothing: whatever came after
    // "olvidame" was ignored, and "olvidame la 2" would have wiped everything she knew.
    const resto = args.slice(1).join(" ").toLowerCase();
    if (/^\d+$/.test(resto)) {
      const olvidado = olvidarUno(m.sender, m.chat, parseInt(resto, 10));
      return client.sendText(m.chat, olvidado ? `🧠 Listo, me olvidé de eso: ${leible(olvidado.dato)}` : `❌ No tengo nada tuyo con el número ${resto}: mirá qué hay con .notas yo`, m);
    }
    if (resto && resto !== "todo") {
      return client.sendText(m.chat, "❌ Para que me olvide de una sola cosa pasame su número, por ejemplo: .notas olvidame 2 (los números salen en .notas yo). Para que me olvide de todo: .notas olvidame todo", m);
    }
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
