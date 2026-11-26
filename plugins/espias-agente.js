import { ESPIA, agentesDeQuien, anotarAgente, borrarAgente, abrirSobres, misionAbierta, normalizar } from "../lib/espias.js";
import { chatsConOpcion } from "../database-functions.js";
import { idsDe, buscarEnGrupo, identidadDelGrupo } from "../lib/identidad.js";
import { metadataDe, nombreDeGrupo } from "../lib/cache-grupos.js";
import { leerEntero } from "../lib/comandos.js";

// The secret missions, in private (lib/espias.js), as poker's .cartas: the person writes first, and everything here
// answers them in that same chat. Claudia never opens a private chat for this.
// .espia: where you're signed up, your secret emoji in each group, and the groups you can sign up in · .espia 2 (or
// .espia <part of the group's name>): sign up · .espia salir [2]: sign out · .sobre: the mission of an envelope that
// came for your emoji. In a group they all refuse and point to private, so nothing of who plays is ever shown there.
const plugin = {};
plugin.cmd = ["espia", "sobre"];

// The groups this person can play in: the ones with the game on that they're a member of, and any they're still
// signed up in (to sign out, even with the game off there). In a fixed order, so a number means the same group from
// one command to the next.
async function gruposDe(client, ids) {
  const lid = ids.find((id) => id.endsWith("@lid")) || null;
  const jid = ids.find((id) => id.endsWith("@s.whatsapp.net")) || null;
  const suyos = new Map(agentesDeQuien(ids).map((a) => [a.chat, a]));
  const prendidos = new Set(chatsConOpcion("espias"));
  const grupos = [];
  for (const chat of [...new Set([...prendidos, ...suyos.keys()])].sort()) {
    const participante = buscarEnGrupo((await metadataDe(client, chat))?.participants, { lid, jid });
    const agente = suyos.get(chat) || null;
    if (!participante && !agente) continue;
    grupos.push({ chat, nombre: await nombreDeGrupo(client, chat), participante, agente, prendido: prendidos.has(chat) });
  }
  return grupos;
}

// One of those groups, by its number in the list or by a piece of its name. Returns { grupo } or { error }.
function elegir(grupos, pedido) {
  const n = leerEntero(pedido);
  if (n !== null) return n >= 1 && n <= grupos.length ? { grupo: grupos[n - 1] } : { error: `No tengo ningún grupo con el número ${n}. Mirá la lista con .espia` };
  const buscado = normalizar(pedido).trim();
  const coinciden = grupos.filter((g) => normalizar(g.nombre).includes(buscado));
  if (coinciden.length === 1) return { grupo: coinciden[0] };
  return { error: coinciden.length ? `Hay ${coinciden.length} grupos que se llaman parecido a eso: decime el número de la lista de .espia` : "No encontré ningún grupo con ese nombre donde se juegue y estés vos. Mirá la lista con .espia" };
}

function textoEstado(grupos) {
  if (!grupos.length) return "🕵️ No estás en ningún grupo donde se juegue a la misión secreta. Un admin la prende en el grupo con .espias on, y después me escribís .espia por acá.";
  const lineas = grupos.map((g, i) => {
    if (!g.agente) return `${i + 1}. *${g.nombre}*: no estás anotado. Te anotás con .espia ${i + 1}`;
    const mision = misionAbierta(g.chat);
    const sobre = mision && mision.emoji === g.agente.emoji && mision.agente === g.agente.usuario ? " 📩 *Tenés un sobre esperando:* .sobre" : "";
    return `${i + 1}. *${g.nombre}*: sos ${g.agente.emoji}${g.prendido ? "" : " (ahí el juego está apagado)"}.${sobre}`;
  });
  return `🕵️ *MISIÓN SECRETA*\n\n${lineas.join("\n")}\n\nCuando en el grupo yo diga «📩 Llegó un sobre para» y tu emoji, escribime .sobre por acá y te paso la misión. Yo no te voy a escribir primero nunca: si no me preguntás, no te enterás.\nTu emoji no se lo digas a nadie: si te denuncian y aciertan, pagás ${ESPIA.MULTA} UruCoins. Para salir: .espia salir`;
}

plugin.run = async (m, { client, command, args = [] }) => {
  try {
    if (m.isGroup) return client.sendText(m.chat, `🕵️ Eso es entre vos y yo: escribime .${command.toLowerCase()} por privado, no acá.`, m);
    const ids = idsDe([m.sender, m.senderJid].filter(Boolean), { conSuNumero: true });

    if (command.toLowerCase() === "sobre") {
      const sobres = abrirSobres(ids);
      if (!sobres.length) return client.sendText(m.chat, "📭 No hay ningún sobre para vos ahora. Cuando llegue uno lo aviso en el grupo, con tu emoji.", m);
      const partes = [];
      for (const s of sobres) partes.push(s.texto(await nombreDeGrupo(client, s.mision.chat)));
      return client.sendText(m.chat, partes.join("\n\n"), m);
    }

    const grupos = await gruposDe(client, ids);
    if (!args.length) return client.sendText(m.chat, textoEstado(grupos), m);

    if (normalizar(args[0]) === "salir") {
      const anotados = grupos.filter((g) => g.agente);
      if (!anotados.length) return client.sendText(m.chat, "No estás anotado en ningún grupo: no hay de dónde salir.", m);
      let grupo = anotados[0];
      if (args.length > 1 || anotados.length > 1) {
        if (args.length === 1) return client.sendText(m.chat, `Estás anotado en ${anotados.length} grupos: decime de cuál salís, con el número de la lista de .espia (por ejemplo .espia salir ${grupos.indexOf(anotados[0]) + 1}).`, m);
        const r = elegir(grupos, args.slice(1).join(" "));
        if (r.error) return client.sendText(m.chat, `❌ ${r.error}`, m);
        if (!r.grupo.agente) return client.sendText(m.chat, `En *${r.grupo.nombre}* no estás anotado.`, m);
        grupo = r.grupo;
      }
      const r = borrarAgente(grupo.chat, ids);
      // What the group is told of a void envelope goes to the group, and never says who it was.
      if (r.aviso) client.sendMessage(grupo.chat, { text: r.aviso }).catch((e) => console.error("[espias] ERROR:", e));
      return client.sendText(m.chat, `🧥 Listo, colgaste la gabardina en *${grupo.nombre}*: ya no sos ${grupo.agente.emoji} ni te llegan sobres ahí.${r.aviso ? " Tu sobre abierto quedó sin efecto." : ""}`, m);
    }

    const r = elegir(grupos, args.join(" "));
    if (r.error) return client.sendText(m.chat, `❌ ${r.error}`, m);
    const { grupo } = r;
    if (!grupo.prendido) return client.sendText(m.chat, `En *${grupo.nombre}* la misión secreta está apagada: un admin la prende ahí con .espias on.`, m);
    if (!grupo.participante) return client.sendText(m.chat, `No te encuentro en *${grupo.nombre}*: para espiar ahí hay que estar adentro.`, m);
    // Under the id the group knows them by: its LID when it gives one, which is where their UruCoins are.
    const delGrupo = identidadDelGrupo(grupo.participante);
    const usuario = delGrupo.lid || ids.find((id) => id.endsWith("@lid")) || grupo.participante.id;
    const jid = delGrupo.jid || ids.find((id) => id.endsWith("@s.whatsapp.net")) || "";
    const alta = anotarAgente(grupo.chat, { usuario, jid });
    if (!alta.ok) return client.sendText(m.chat, `❌ ${alta.error}`, m);
    if (!alta.nuevo) return client.sendText(m.chat, `Ya estabas anotado en *${grupo.nombre}*: sos ${alta.emoji}.`, m);
    return client.sendText(m.chat, `🕵️ Listo: sos agente en *${grupo.nombre}* y tu emoji secreto es ${alta.emoji}. No se lo digas a nadie.\n\nCuando en el grupo yo diga «📩 Llegó un sobre para ${alta.emoji}», escribime .sobre por acá y te paso la misión: casi siempre es lograr que alguien del grupo diga una palabra antes de cierta hora, sin decírsela. Si te sale cobrás ${ESPIA.PREMIO} UruCoins; si te denuncian y aciertan, pagás ${ESPIA.MULTA}.\n\nYo no te voy a escribir primero nunca. Para salir: .espia salir`, m);
  } catch (e) {
    console.error("[espias] ERROR:", e);
  }
};

export default plugin;
