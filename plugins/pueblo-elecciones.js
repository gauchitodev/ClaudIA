import { textoElecciones, anotarCandidato, bajarCandidato, votar, boleta, prometer, denunciarCoima, firmarJuicio, eleccionEnCurso, faseDe, cuando } from "../lib/elecciones.js";
import { puebloActivo } from "../lib/pueblo.js";
import { chatsConOpcion, getChat } from "../database-functions.js";
import { idsDe, buscarEnGrupo, identidadDelGrupo, lidMencionadoActual } from "../lib/identidad.js";
import { metadataDe, nombreDeGrupo } from "../lib/cache-grupos.js";
import { juegosAbiertos, horarioDe, textoHorario } from "../lib/horario-juegos.js";
import { leerEntero } from "../lib/comandos.js";

// The town's elections (lib/elecciones.js). .elecciones: the board · .candidato [slogan] / .candidato baja: a político
// runs, or stands down · .votar: in private, the secret vote (in the group it only shows the ballot, and a vote said
// there isn't counted) · .prometer @persona 50: a candidate buys a vote · .denunciarcoima [@candidato]: the one who
// was promised reports it · .juiciopolitico: opens or signs one against the intendente.
// In the group they go in the game hours (plugin.conHorario); in private, .votar checks that group's hours itself.
// Claudia never writes first in private: .votar there only answers.
const plugin = {};
plugin.cmd = ["elecciones", "candidato", "votar", "prometer", "denunciarcoima", "juiciopolitico"];
plugin.economia = true;
plugin.conHorario = true;

const responder = (client, m, r) => client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m, r.mentions?.length ? { mentions: r.mentions } : {});

// The groups where this person can vote now: a town with its voting open, where they're a member. In a fixed order,
// so a number means the same group from one command to the next.
async function urnasDe(client, ids) {
  const lid = ids.find((id) => id.endsWith("@lid")) || null;
  const jid = ids.find((id) => id.endsWith("@s.whatsapp.net")) || null;
  const urnas = [];
  for (const chat of [...chatsConOpcion("pueblo")].sort()) {
    if (!puebloActivo(chat)) continue;
    const el = eleccionEnCurso(chat);
    if (!el || faseDe(el) !== "votacion") continue;
    const participante = buscarEnGrupo((await metadataDe(client, chat))?.participants, { lid, jid });
    if (!participante) continue;
    // Under the id the group knows them by: its LID when it gives one, which is where their trade is.
    const delGrupo = identidadDelGrupo(participante);
    const usuario = delGrupo.lid || lid || participante.id;
    urnas.push({ chat, el, usuario, nombre: await nombreDeGrupo(client, chat) });
  }
  return urnas;
}

async function votarEnPrivado(m, client, args) {
  const ids = idsDe([m.sender, m.senderJid].filter(Boolean), { conSuNumero: true });
  const urnas = await urnasDe(client, ids);
  if (!urnas.length) return client.sendText(m.chat, "🗳️ No hay ninguna votación abierta en tus grupos. Cuando la haya, lo aviso en el grupo y me escribís .votar por acá.", m);
  const numeros = args.map((a) => leerEntero(a)).filter((n) => n !== null);
  if (!numeros.length) {
    const partes = urnas.map((u, i) => `${urnas.length > 1 ? `*${i + 1}. ${u.nombre}*` : `*${u.nombre}*`} (cierra ${cuando(u.el.cierra_votacion)})\n${boleta(u.el).join("\n")}`);
    const como = urnas.length > 1 ? `Votás con el número del grupo y el de la lista: .votar 1 2 (grupo 1, lista 2).` : `Votás con el número de la lista: .votar ${boleta(urnas[0].el).length ? "1" : ""}`.trim();
    return client.sendText(m.chat, `🗳️ *TU BOLETA*\n\n${partes.join("\n\n")}\n\n${como}\nEs secreto: yo anoto que votaste, no a quién.`, m);
  }
  let urna = urnas[0];
  let lista = numeros[0];
  if (urnas.length > 1) {
    if (numeros.length < 2) return client.sendText(m.chat, `Votás en ${urnas.length} grupos: decime el del grupo y el de la lista, .votar 1 ${numeros[0]} (escribí .votar para ver los números).`, m);
    urna = urnas[numeros[0] - 1];
    lista = numeros[1];
    if (!urna) return client.sendText(m.chat, `❌ No tengo ningún grupo con el número ${numeros[0]}. Mirá la lista con .votar`, m);
  }
  const fila = getChat(urna.chat);
  if (horarioDe(fila) && !juegosAbiertos(fila)) return client.sendText(m.chat, `🕒 En *${urna.nombre}* se juega ${textoHorario(horarioDe(fila))}, y la urna abre en ese horario. Volvé a escribirme entonces.`, m);
  const r = votar(urna.chat, urna.usuario, lista);
  return client.sendText(m.chat, r.ok ? `${r.mensaje}${urnas.length > 1 ? ` (en *${urna.nombre}*)` : ""}` : `❌ ${r.error}`, m);
}

plugin.run = async (m, { client, command, args = [], text, participants, isBotAdmin, botSettings }) => {
  try {
    const cmd = command.toLowerCase();
    if (cmd === "votar" && !m.isGroup) return votarEnPrivado(m, client, args);
    if (!m.isGroup) return client.sendText(m.chat, "🗳️ Eso va en el grupo. Por privado solo se vota: .votar", m);

    if (cmd === "elecciones") {
      const r = textoElecciones(m.chat, m.sender);
      const aviso = botSettings?.antiPrivate ? "\n\n⚠️ Ojo: los privados están cerrados (.antiprivado), y se vota por privado: así no se puede votar." : "";
      return client.sendText(m.chat, r.texto + aviso, m, r.mentions.length ? { mentions: r.mentions } : {});
    }

    if (cmd === "votar") {
      if (args.length) {
        // A vote said in the group isn't secret: not counted, and the message goes if Claudia can take it down.
        if (isBotAdmin) {
          try {
            await m.delete?.();
          } catch {
            // it stays; it isn't counted either way
          }
        }
        return client.sendText(m.chat, "🤫 Acá no: el voto es secreto. Escribime *.votar* por privado y ahí votás. Este no lo cuento.", isBotAdmin ? undefined : m);
      }
      const el = eleccionEnCurso(m.chat);
      if (!el || faseDe(el) !== "votacion") return client.sendText(m.chat, `🗳️ Ahora no se vota. ${el ? `Las listas cierran ${cuando(el.cierra_inscripcion)}.` : ""} Mirá .elecciones`.replace(/\s+/g, " "), m);
      return client.sendText(m.chat, `🗳️ *LA BOLETA*\n${boleta(el).join("\n")}\n\nSe vota *por privado*: escribime .votar y te la paso. Cierra ${cuando(el.cierra_votacion)}.`, m);
    }

    if (cmd === "candidato") {
      // ".candidato baja" alone stands down; "baja" opening a slogan is a slogan.
      if (args.length === 1 && args[0].toLowerCase() === "baja") return responder(client, m, bajarCandidato(m.chat, m.sender));
      return responder(client, m, anotarCandidato(m.chat, m.sender, args.join(" ")));
    }

    if (cmd === "prometer") {
      const votante = await lidMencionadoActual(client, m, text, participants);
      const monto = args.map((a) => leerEntero(a)).find((n) => n !== null) ?? null;
      return responder(client, m, prometer(m.chat, m.sender, votante, monto, participants));
    }

    if (cmd === "denunciarcoima") {
      const candidato = m.mentionedJid?.length || args.length || m.quoted ? await lidMencionadoActual(client, m, text, participants) : null;
      return responder(client, m, denunciarCoima(m.chat, m.sender, candidato));
    }

    // .juiciopolitico
    return responder(client, m, firmarJuicio(m.chat, m.sender, participants));
  } catch (e) {
    console.error("[elecciones] ERROR:", e);
  }
};

export default plugin;
