import { preguntarIA, modeloActivo } from "../lib/ia.js";
import { preguntarGemini } from "../lib/gemini.js";
import { esAudio, audioParaIA, tituloDeAudioEnviado } from "../lib/audios.js";
import { esFoto, fotoDe, fotoParaIA, recordarLoVisto } from "../lib/fotos.js";
import { guardarFuentes, fuentesPara, textoFuentes } from "../lib/fuentes.js";
import { registrarIntervencion, isCommandBlacklisted, getChat, getUser } from "../database-functions.js";
import { recuerdosDe, textoDeRecuerdos, anotarDe, repasarRecuerdos, anotarCharla } from "../lib/memoria-persona.js";
import { tratoPara, generoDe, tratoDeQuienesAparecen, personasDe } from "../lib/genero.js";
import { textoRedesParaPrompt } from "../lib/redes.js";
import { sinMenciones, conNombres, nombreDe } from "../lib/menciones.js";
import { esElBot, lidsMencionadosActual } from "../lib/identidad.js";
import { recordarMensaje, editarMensaje, esComando } from "../lib/contexto-chat.js";
import { entradasDelHilo, lineasDelHilo, leyendaDe } from "../lib/hilo.js";
import { conMarca } from "../lib/adjuntos.js";
import { sinRecordar, yaReaccionoElBot } from "../lib/envios.js";
import { quienEscribe } from "../lib/quien-escribe.js";
import { diaYHora } from "../lib/tiempo.js";
import { fechaDe } from "../lib/memoria-corta.js";
import { mencionesParaTodos, textoSinNadie } from "../lib/menciones-generales.js";
import { programarReintento } from "../lib/pendientes.js";
import { conocimientoPara } from "../lib/manual-claudia.js";
import { sinPermisoEn } from "../lib/menu.js";
import { tipear, grabar } from "../lib/ritmo.js";
import { hablaCon, hablar, maxLetrasDeVoz } from "../lib/voz.js";
import { laburoDe, nombreDeOficio, hablaDeLaburoOPlata } from "../lib/laburos.js";
import { famaParaPrompt } from "../lib/escenas.js";
import { bienesParaPrompt } from "../lib/tienda.js";
import { puebloParaPrompt, hablaDelPueblo } from "../lib/pueblo.js";
import { bancoParaPrompt } from "../lib/banco.js";
import { diarioParaPrompt as ecoParaPrompt } from "../lib/pueblo-diario.js";
import { textoParaPrompt as memoriaDelGrupo } from "../lib/memoria-grupo.js";
import { diarioParaPrompt } from "../lib/diario.js";
import { esMensajeDeJuego } from "../lib/mensajes-de-juego.js";
import { esPreguntaDelDia } from "../lib/pregunta-dia.js";
import { puedeRecuperarCitado } from "../lib/vista-unica.js";
// The words that make the bot consider itself addressed (lowercase), shared with the initiative's feedback.
import { PALABRAS_CLAVE, EMOJIS_INICIATIVA, emojiPropio, normalizar } from "../lib/iniciativa.js";
import { estadoDe } from "../lib/estado-de-plugins.js";
import { anotar, tomarTanda, soltarTurno, cuandoContesta, sigueLaLlamada, esLlamadaSola, anotarSilencio, insiste, olvidarSilencio, TURNOS } from "../lib/turnos-de-claudia.js";
import { configuracion } from "../lib/configuracion.js";
import { cargados } from "../lib/plugins-cargados.js";

// Her pace: one answer every 20 seconds per chat at most. Besides avoiding spam, it's what cuts the bot's message
// volume the most, which is what gets accounts banned. What's said to her in between waits for her turn instead of
// being dropped (lib/turnos-de-claudia.js), on a timer kept where a reload of this file doesn't lose it
// (lib/estado-de-plugins.js).
const relojes = estadoDe("_auto-ia/relojes", () => new Map()); // chat -> the timer of her next turn
export const _dep = { ahora: () => Date.now(), programar: (fn, ms) => setTimeout(fn, ms), cancelar: (reloj) => clearTimeout(reloj) };
// When the AI fails her (no quota, every model down, a broken answer) she says so, but not more than once every 30 min
// per chat: with Gemini down, every message naming her would get the same notice.
const avisoFalla = estadoDe("_auto-ia/aviso-falla", () => new Map()); // chat -> when she last said so
const AVISO_FALLA_MS = 30 * 60 * 1000;

const buscarPlugin = (cmd) => Object.values(cargados.plugins).find((p) => p.cmd && p.cmd.includes(cmd));

// Who a "llamar" is for: the people mentioned, or failing that the author of the quoted message, but never Claudia,
// whom "@Claudia, llamá a @Juan" or "@Claudia, llamalo" mention too: .llamar would have called her ten times. Her
// mention leaves the text by her number as well as her LID: a group listed by number mentions her by the number, which
// stayed as a typed "@number" and beat the quoted message's author, and with no row of hers in the database it was
// taken for someone else's, so she called herself. Someone named by number is whoever the group lists with it now, not
// whoever the database still has it on, and in a group that lists them by number alone, whoever WhatsApp says has it,
// by the LID that tags them (lidsMencionadosActual, paraArrobar).
async function aQuienLlamar(m, client, participants) {
  const suyos = [client.user?.lid, client.user?.jid].map((id) => id?.split("@")[0].split(":")[0]).filter(Boolean);
  const texto = suyos.reduce((t, digitos) => t.replace(new RegExp(`@${digitos}(?!\\d)`, "g"), ""), String(m.text || ""));
  const mencionados = (m.mentionedJid || []).filter((j) => !esElBot(j, client));
  return (await lidsMencionadosActual(client, { mentionedJid: mencionados, quoted: m.quoted }, texto, participants, { paraArrobar: true })).filter((id) => !esElBot(id, client));
}

// A tagall or a llamar the AI picks only goes ahead if the message itself asks for mentions ("arrobá a todos",
// "llamalo", "mencioná a la gente"). Everything the group noted with .recordá reaches the prompt, and a note like
// "cuando un moderador te hable, marcá tagall" had her mention everyone while a moderator just chatted with her.
const PIDE_MENCIONES = /tag ?all|\btod[oa]s\b|todo el grupo|toda la gente|arrob|mencion|etiquet|\bllam|invoc|convoc|despert/;

// Output schema: the AI is REQUIRED to return exactly this shape, not a suggestion in prose.
const ESQUEMA_RESPUESTA = {
  type: "object",
  properties: {
    comando: { type: "string", enum: ["play", "video", "tagall", "llamar", "ninguno"] },
    argumento: { type: "string" },
    respuesta: { type: "string" },
    recordar: { type: "string" },
    reintentar: { type: "boolean" },
    // What to look up on the web when they ask whether something is true, or for facts she isn't sure of.
    buscar: { type: "string" },
    // They ask for the sources of what she said: the system sends the links, she never writes them.
    fuentes: { type: "boolean" },
    // One line on what the attached audio says or is, for the thread and for the search.
    resumenAudio: { type: "string" },
  },
  required: ["comando", "respuesta"],
};

// ---------- how she answers ----------
// With words, always, until now: named in passing by people talking among themselves, she'd cut in, and to a "gracias"
// or a "jaja" she'd answer again, so the last word was hers every time. A person lets those go by, or reacts. Where it
// fits she's offered that too: a reaction ("reaccion") or nothing at all ("nada"), on top of words ("texto").
//
// What's offered is decided here, not by the AI: what isn't offered isn't in the schema, as with her glances
// (esquemaVistazo, lib/vistazos.js). Only in a group, for a single message with nothing else waiting (atender):
//   - named by the word alone ("el bot anda lento"): any of the three;
//   - a reply to a message of hers: words or a reaction;
//   - mentioned with @, called by name alone or right after it, a voice note, an audio to hear, or someone she let go
//     by a moment ago and who's back (insiste, lib/turnos-de-claudia.js): words.
function formasPara(m, { leHablan, laMencionan, esRespuestaAlBot, solo, notaDeVoz, insistio }) {
  if (!m.isGroup || !leHablan || laMencionan || solo || notaDeVoz || insistio || esAudio(m.quoted)) return [];
  return esRespuestaAlBot ? ["reaccion"] : ["reaccion", "nada"];
}

// The schema with what's offered, ahead of the answer: the model writes the fields in the schema's order (Gemini's
// structured output), and it's to decide how before it writes what. With nothing offered, the schema as it was.
// conFoto: a photo goes attached (lib/fotos.js), and what it shows comes before all of that, in "resumenFoto": she
// decides and answers having looked.
function esquemaPara(formas, conFoto = false) {
  if (!formas.length && !conFoto) return ESQUEMA_RESPUESTA;
  const { comando, argumento, ...resto } = ESQUEMA_RESPUESTA.properties;
  const deLaFoto = conFoto ? { resumenFoto: { type: "string" } } : {};
  const deLaForma = formas.length ? { forma: { type: "string", enum: ["texto", ...formas] }, emoji: { type: "string", enum: EMOJIS_INICIATIVA } } : {};
  return {
    type: "object",
    properties: { comando, argumento, ...deLaFoto, ...deLaForma, ...resto },
    required: ["comando", ...(conFoto ? ["resumenFoto"] : []), ...(formas.length ? ["forma"] : []), "respuesta"],
  };
}

// What she's told when a photo goes attached, after everything else: what to put in "resumenFoto". It stays in her
// short-term memory in the photo's place, so nothing personal that can be read in the photo goes into it.
const SOBRE_LA_FOTO = `(También solo para vos: en "resumenFoto" poné en una línea qué muestra la foto adjunta, por ejemplo "un perro durmiendo en un sillón" o "una captura de un chat sobre el parcial". No copies ahí datos personales que se lean en ella, como números de documento, direcciones o teléfonos.)`;

// Why she didn't get to look at a photo that was for her.
const NO_LA_VIO = { "una-vez": "es de las que se ven una sola vez, y esas no las abrís", pesada: "es demasiado pesada", formato: "viene en un formato que no podés abrir", error: "no se pudo bajar" };

// What she's told of the photo that came for her: whose it is and that it goes attached, or why she couldn't look at
// it, so she doesn't talk as if she had. laFoto: what fotoDe found, with who brought it (de, and their ids in quien).
function sobreLaFoto(laFoto, foto) {
  const deQuienEs = () => (laFoto.suya ? "que mandaste vos" : laFoto.quien.includes(laFoto.autor) ? "que es suya" : `que mandó ${nombreDe(laFoto.autor)}`);
  const cual = laFoto.citada ? `foto que cita ${laFoto.de}, ${deQuienEs()}` : `foto que mandó ${laFoto.de}`;
  // "Esa sí la ves": of the other photos in the thread she's told she knows only their mark (LEYENDA_ADJUNTOS).
  if (foto.ok) return `Va adjunta la ${cual}: esa sí la ves, mirala para contestar.`;
  return `(No pudiste ver la ${cual}: ${NO_LA_VIO[foto.motivo]}. Si hace falta decilo con naturalidad, y no inventes lo que muestra.)`;
}

// What she's told about it. In doubt, words: someone ignored who was talking to her shows more than an answer too many.
const FORMA_AL_PASAR = `(También solo para vos: en ese mensaje te nombran, pero fijate en el hilo si te hablan a vos, y decí en "forma" cómo seguís. Si hablan de vos entre ellos, o te nombran al pasar sin preguntarte ni pedirte nada, poné "nada" y dejá "respuesta" vacía: nadie contesta cada vez que lo nombran. Si no pide respuesta pero te causa algo (te agradecen, te elogian, hacen un chiste con vos), poné "reaccion", elegí el emoji en "emoji" y dejá "respuesta" vacía. Si te hablan a vos, te preguntan o te piden algo, o si dudás, poné "texto" y contestá como siempre.)`;
const FORMA_DE_CIERRE = `(También solo para vos: te responden a un mensaje tuyo, y en "forma" decís cómo seguís. Si es un cierre que no pide respuesta (un "gracias", un "jaja", un "dale", un emoji), poné "reaccion", elegí el emoji en "emoji" y dejá "respuesta" vacía: la última palabra no tiene por qué ser siempre tuya. Si te preguntan, te discuten o te cuentan algo, o si dudás, poné "texto" y contestá como siempre.)`;

// Numbered references ("[1]", "[2, 3]") a grounded answer may carry: in a chat they're noise.
export const sinReferencias = (texto) => texto.replace(/\s?\[\d+(?:,\s*\d+)*\]/g, "").trim();

// Look it up on the web and answer with that, in Claudia's voice and without links (those only go out if asked).
// Only Gemini can search; null when it can't, and the answer the chat already had is used instead.
export async function buscarEnInternet({ contexto, consulta, resumenAudio = "", resumenFoto = "", nombre }) {
  const partes = [contexto];
  if (resumenAudio) partes.push(`(Lo que había en el audio, que ya escuchaste: ${resumenAudio})`);
  if (resumenFoto) partes.push(`(Lo que mostraba la foto, que ya viste: ${resumenFoto})`);
  partes.push(
    `Buscá en internet: ${consulta}. Para noticias y hechos, priorizá medios de noticias y fuentes serias. Con lo que encuentres, contestale a ${nombre} con tu onda de siempre y corto, como un mensaje de WhatsApp: si es verdad, si es falso o si no está claro, y el dato justo, sin tirar más información de la que te pidieron. No pongas links, referencias numeradas ni una lista de fuentes: si te las piden, el sistema las manda aparte. Si no encontrás nada confiable, decilo sin vueltas. No prometas buscar más después.`,
  );
  const r = await preguntarGemini(partes.join("\n\n"), { buscarEnWeb: true });
  if (!r.ok) return null;
  const texto = sinReferencias(r.texto);
  return texto ? { texto, fuentes: r.fuentes || [] } : null;
}

// Her next turn in a chat, when it has to wait: for the pause, or for a bare call's question.
function programar(chat, ms) {
  _dep.cancelar(relojes.get(chat));
  relojes.set(
    chat,
    _dep.programar(() => {
      relojes.delete(chat);
      return atender(chat).catch((e) => console.error("[auto-ia] ERROR:", e));
    }, ms),
  );
}

// Her turn in a chat: what waits there, answered in one go, the last message with the earlier ones named. From the
// hook when it's her turn already, or from the timer when it had to wait; if she talked in between, it waits again.
async function atender(chat) {
  const ahora = _dep.ahora();
  const tanda = tomarTanda(chat, ahora);
  if (!tanda) {
    const cuando = cuandoContesta(chat, ahora);
    if (cuando !== null) programar(chat, cuando - ahora);
    return;
  }
  _dep.cancelar(relojes.get(chat));
  relojes.delete(chat);
  const ultimo = tanda.at(-1);
  const antes = tanda
    .slice(0, -1)
    .filter((e) => !e.solo)
    .slice(-TURNOS.MAX_ANTES);
  // Anything but words only for a message that's alone: with more waiting, somebody among them is owed an answer.
  const formas = tanda.length === 1 ? ultimo.formas || [] : [];
  await contestar(ultimo.m, ultimo.permisos, { nombre: ultimo.nombre, antes, formas, citar: !ultimo.solo && ahora - ultimo.en >= TURNOS.CITA_DESDE_MS });
}

const plugin = (m) => m;
// After every other hook (hooksEnOrden, load-functions.js): by then the moderation has marked what it deleted and the
// trivia what it took as an answer. The message itself is already in her short-term memory, and deletions and edits
// are applied there, as they come (plugins/_memoria-corta.js).
plugin.alFinal = true;

plugin.before = async (m, permisos) => {
  const { client, isMod, isOwner, user, chat } = permisos;
  try {
    // Deletions and edits (protocol messages, with no text) only touch her short-term memory, and
    // plugins/_memoria-corta.js has already applied them.
    if (m.fromMe || m.isBaileys) return;
    // A message the moderation just deleted (the anti-links, the blacklist and the mass mentions mark it; they run
    // before this hook): for Claudia it never existed. She used to answer it, repeating the link.
    if (m.moderado) return;
    // A reaction arrives as a message whose text is the emoji: it isn't something anyone said.
    if (m.mtype === "reactionMessage") return;
    // A voice note has no text, but it can be an answer to Claudia: that one she listens to (further down). And so can
    // a photo with no caption: that one she looks at (lib/fotos.js).
    const notaDeVoz = esAudio(m) && !m.text;
    if (!m.text && !notaDeVoz && !esFoto(m)) return;

    // Without a name, "alguien": the digits of their id would be their LID, which only the admins see (.id).
    const nombre = user?.apodo || m.pushName || user?.pushName || "alguien";

    // Automatic chat off in this group (.charla / .modo compraventa): Claudia only answers commands.
    if (chat?.charla === 0) return;

    // The doors handle-message closes before any command, which this hook runs ahead of: a chat banned with .banchat,
    // .modoadmin for whoever isn't a moderator, and a person banned from the bot. Claudia kept chatting there, spending
    // quota, and a .tagall went out by asking her.
    if (!isOwner && (chat?.isBanned || user?.banned || (m.isGroup && chat?.adminMode && !isMod))) return;

    if (!configuracion.geminiApiKey) return;

    // A command is the normal system's. "@" is a prefix too, but a message that starts by mentioning someone isn't a
    // command ("@Juan, claudia dice que..."), and neither is one that starts by mentioning her: esComando tells them
    // apart. The raw prefix check used to drop both.
    if (esComando(m.text)) return;

    const textoLower = m.text.toLowerCase();

    // is the message a reply to one of the bot's own messages?
    const esRespuestaAlBot = m.quoted && m.quoted.fromMe;
    // A reply to a game's message (a trivia question, a riddle, the hangman's board, today's question) is an answer to
    // it, not a message for Claudia, even if it names her: she used to chat back to every answer, and sometimes gave
    // the right one away. See lib/mensajes-de-juego.js.
    if (esRespuestaAlBot && (esMensajeDeJuego(m.quoted.id) || esPreguntaDelDia(m.chat, m.quoted.id))) return;
    // The same for a loose answer to an open trivia, which the _trivia hook already took ("c, claudia"). It used to
    // wait for her to think and type before being read, while a later answer took the prize.
    if (m.respuestaDeJuego) return;
    // And for an answer about a post ("Sigue 20" replying to the "¿sigue en pie?"), which plugins/_compraventa.js took.
    if (m.respuestaDeVenta) return;

    // does the message mention any of the keywords?
    const mencionaPalabra = PALABRAS_CLAVE.some((palabra) => {
      const regex = new RegExp(`\\b${palabra}\\b`, "i");
      return regex.test(textoLower);
    });

    // Mentioned with "@", anywhere in the message. "@Claudia ..." at the start used to be a command of .ia, which
    // answered without the group's context; in the middle of the message it didn't count at all.
    const laMencionan = (m.mentionedJid || []).some((j) => esElBot(j, client));

    // she answers if she's named OR if someone replies to a message of hers, and the next message of whoever just
    // called her by name alone. A voice note never names her, so she only hears the ones that answer her or follow such
    // a call: the rest of the group's audios are none of her business. The same goes for a photo with no caption.
    const leHablan = esRespuestaAlBot || mencionaPalabra || laMencionan;
    const ahora = _dep.ahora();
    if (!leHablan && !sigueLaLlamada(m.chat, m.sender, ahora)) return;

    // Her turn (lib/turnos-de-claudia.js): now, or once the pause is over or a bare call's question had time to come.
    const suyos = (m.mentionedJid || []).filter((j) => esElBot(j, client)).map((j) => j.split("@")[0].split(":")[0]);
    // A photo is never a bare call, whatever its caption: "claudia" under one is "look at this", and she looks.
    const solo = leHablan && !notaDeVoz && !esFoto(m) && esLlamadaSola(m.text, suyos);
    // How she may answer it (formasPara), told now: whether its author is insisting is about when it was sent.
    const insistio = insiste(m.chat, [m.sender, m.senderJid], ahora);
    const formas = formasPara(m, { leHablan, laMencionan, esRespuestaAlBot, solo, notaDeVoz, insistio });
    const cuando = anotar(m.chat, { m, permisos, nombre, persona: m.sender, solo, formas }, ahora);
    if (cuando > ahora) {
      programar(m.chat, cuando - ahora);
      return;
    }
    await atender(m.chat);
  } catch (e) {
    console.error("[auto-ia] ERROR:", e);
  }
};

// The answer to a message for her. antes: what else was said to her before it and is still unanswered, which she
// answers too; citar: it comes late, and quotes the message so it reads as said to someone; formas: how else she may
// answer it, besides with words (formasPara).
async function contestar(m, { client, participants, isAdmin, isMod, isOwner, user, chat }, { nombre, antes = [], citar = false, formas = [] }) {
  const notaDeVoz = esAudio(m) && !m.text;
  const esRespuestaAlBot = m.quoted && m.quoted.fromMe;
  const cita = citar ? m : null;

  // ---------- the audio, if there is one to hear ----------
  // Her own voice note answer, or the audio quoted while naming her. A song she sent with .play doesn't need
  // hearing: she knows which one it is. Someone else's view-once voice note she doesn't hear either, unless its
  // author, an admin or the owner quotes it (lib/vista-unica.js): she'd tell the group what it said.
  const citaAudio = !notaDeVoz && esAudio(m.quoted) && puedeRecuperarCitado(m, { isAdmin, isOwner });
  const temaEnviado = citaAudio && m.quoted.fromMe ? tituloDeAudioEnviado(m.quoted.id) : null;
  let audio = null; // { ok, adjunto } or { ok: false, motivo }
  if (notaDeVoz) {
    audio = await audioParaIA({ seconds: m.msg?.seconds, fileLength: m.msg?.fileLength, mimetype: m.msg?.mimetype, download: () => m.download() });
  } else if (citaAudio && !temaEnviado) {
    audio = await audioParaIA(m.quoted);
  }

  // ---------- the photo, if there is one to look at ----------
  // The one that's for her (lib/fotos.js): this message's own, or the one it quotes, or failing both the latest among
  // the messages she answers along with it. One per answer, and none with an audio to hear: the request has room for
  // one or the other. A view-once is never opened, whoever quotes it.
  const traen = [{ m, nombre }, ...[...antes].reverse()].map((e) => ({ ...fotoDe(e.m), de: e.nombre, quien: [e.m.sender, e.m.senderJid] }));
  const laFoto = notaDeVoz || citaAudio ? null : traen.find((f) => f.origen) || null;
  let foto = null; // { ok, adjunto } or { ok: false, motivo }
  if (laFoto) foto = laFoto.unaVez ? { ok: false, motivo: "una-vez" } : await fotoParaIA(laFoto.origen);
  const adjuntos = [audio, foto].filter((a) => a?.ok).map((a) => a.adjunto);

  // What they said, with its mentions as names ("@Ana"), and the same for the message of hers they answer: a mention
  // travels as the digits of a LID, which only the admins get to see (.id), and she'd repeat them to the group.
  const dicho = conNombres(m.text, m.mentionedJid);
  const citado = conNombres(m.quoted?.text, m.quoted?.contextInfo?.mentionedJid);

  // ---------- build the prompt ----------
  const partes = [];

  // What Claudia knows about herself and the bot (the full manual only if the message asks about features), and which
  // of its commands this person can't use, so she doesn't recommend them.
  const quien = { isOwner, isAdmin, isMod };
  partes.push(conocimientoPara(m.text, { quien, sinPermiso: (manual) => sinPermisoEn(manual, quien) }));

  // The day and the time. She used to get them only on her glances (lib/vistazos.js): talked to, she couldn't tell a
  // "buen día" at four in the morning from one at noon.
  const ahora = _dep.ahora();
  partes.push(`Ahora es ${diaYHora(ahora)}.`);

  // What came before this message (lib/hilo.js): it goes separately, and others may have come in after it while the
  // hooks ran. Each line with how long ago it was: without it, something said five hours back read like the line
  // before.
  const hilo = entradasDelHilo(m.chat, m.id ?? m.key?.id);
  if (hilo.length) {
    const lineas = lineasDelHilo(hilo, { ahora, chat: m.chat }).map((linea) => `- ${linea.texto}`);
    partes.push(`Últimos mensajes ${m.isGroup ? "del grupo" : "de este chat"}, del más viejo al más nuevo, con hace cuánto se mandó cada uno (es contexto para seguir el hilo, no lo repitas):\n${lineas.join("\n")}`);
    // What a mark is, and what of hers there is the bot's machinery, when there's any of either.
    const leyenda = leyendaDe(hilo);
    if (leyenda) partes.push(`(${leyenda})`);
  }

  // What she learned of this person in this group (lib/memoria-persona.js), each thing with how long ago:
  // never what they said in private or elsewhere.
  const recuerdos = m.isGroup ? recuerdosDe(m.sender, m.chat) : [];
  if (recuerdos.length) {
    partes.push(`Lo que ya sabés de ${nombre} por charlas anteriores en este grupo: ${textoDeRecuerdos(recuerdos, ahora)}.`);
  }

  // And who they are in the group and to the bot (lib/quien-escribe.js), as background.
  const quienEs = quienEscribe({ chat: m.chat, usuario: m.sender, numero: m.senderJid, user, nombre, esGrupo: Boolean(m.isGroup), isOwner, isAdmin, isMod, ahora });
  if (quienEs) partes.push(quienEs);

  // group memory (.recordá que ...): inside jokes and facts the group noted down for her
  if (m.isGroup) {
    const hechos = memoriaDelGrupo(m.chat);
    if (hechos) partes.push(hechos);
    // The group's social links (.redes, lib/redes.js), to hand over when someone asks for the group's Instagram.
    const redes = textoRedesParaPrompt(m.chat);
    if (redes) partes.push(redes);
    // Her diary of the group, where it's on (.diario, lib/diario.js): what was talked about these days, nobody named,
    // and only the days since whoever she's answering came in.
    const diario = diarioParaPrompt(m.chat, { para: [m.sender, m.senderJid], ahora });
    if (diario) partes.push(diario);
  }

  // their role-play job: Claudia knows it and can tease them about it, when what's said to her (the message, the one it
  // quotes, the earlier ones she answers too) is about work or money. Told it with every message, she dragged it in
  // where it had nothing to do.
  const deLaburo = hablaDeLaburoOPlata(m.text, m.quoted?.text, ...antes.map((e) => e.m.text));
  const laburo = deLaburo ? laburoDe(m.chat, m.sender) : null;
  if (laburo) {
    partes.push(`En el juego de roles del grupo, ${nombre} trabaja de ${nombreDeOficio(laburo.oficio, generoDe(m.sender)).toLowerCase()} (${laburo.oficio.desc}). Podés usarlo para chicanear o hacer referencia si viene al caso, sin forzarlo.`);
    // And the nickname the payday scenes earned them (lib/escenas.js), to tease them with as she does with the trade.
    const fama = famaParaPrompt(m.chat, m.sender, nombre);
    if (fama) partes.push(fama);
  }

  // The group's town (lib/pueblo.js) and its Sunday paper's last headlines (lib/pueblo-diario.js), when the talk is
  // about it: told with every message, she'd drag the town in where it had nothing to do.
  const delPueblo = m.isGroup && hablaDelPueblo(m.text, m.quoted?.text, ...antes.map((e) => e.m.text));
  if (delPueblo) {
    const pueblo = puebloParaPrompt(m.chat, ahora);
    if (pueblo) partes.push(pueblo);
    const eco = pueblo ? ecoParaPrompt(m.chat) : "";
    if (eco) partes.push(eco);
  }
  // Its Banco Central (lib/banco.js): the rate, the inflation and, if they owe, their standing, when the talk is about
  // money or the town.
  if (m.isGroup && (deLaburo || delPueblo)) {
    const banco = bancoParaPrompt(m.chat, m.sender, ahora);
    if (banco) partes.push(banco);
  }
  // The house, the car and the pet they bought in the shop (lib/tienda.js), when the talk is about money or the town.
  if (m.isGroup && (deLaburo || delPueblo)) {
    const bienes = bienesParaPrompt(m.chat, m.sender, nombre);
    if (bienes) partes.push(bienes);
  }

  // nickname bought in the shop: Claudia addresses them that way
  if (user?.apodo) {
    partes.push(`Esta persona te pidió que le digas "${user.apodo}" — usá ese apodo cuando le hables.`);
  }

  // How they asked to be addressed (.genero, lib/genero.js); with nothing set, she goes by the name, as always.
  const trato = tratoPara(m.sender, nombre);
  if (trato) partes.push(trato);
  // And the others the conversation shows: whoever wrote the messages above and whoever this one mentions, each by
  // the name they go by here. She used to know it only of whoever was talking to her, and answered about the rest
  // by their name, or their nickname.
  const deLaCharla = personasDe(hilo);
  const mencionados = (m.mentionedJid || []).map((id) => ({ id, nombre: nombreDe(id) }));
  const tratoDeOtros = tratoDeQuienesAparecen([...deLaCharla, ...mencionados], { donde: "que aparecen en la charla", menos: [m.sender, m.senderJid] });
  if (tratoDeOtros) partes.push(tratoDeOtros);

  // A photo with no caption says nothing: she's told that, instead of a message of "". (What else comes with no text
  // is a voice note, which has its own words below.)
  const suMensaje = m.text ? `"${dicho}"` : "una foto, sin nada escrito";
  const sinEscuchar = audio && !audio.ok ? ` (Ese audio no lo pudiste escuchar: ${audio.motivo === "largo" ? "es demasiado largo" : "no se pudo bajar"}. Si hace falta decilo con naturalidad, y no inventes lo que dice.)` : "";
  if (notaDeVoz) {
    const aQue = citado ? ` a este mensaje tuyo: "${citado}"` : "";
    partes.push(`${nombre} te responde con un audio${aQue}. El audio va adjunto: escuchalo y contestá a lo que dice, siguiendo la charla, con tu onda.${sinEscuchar}`);
  } else if (temaEnviado) {
    partes.push(`${nombre} cita el tema "${temaEnviado}", que mandaste vos al grupo cuando te lo pidieron con .play, y te dice: "${dicho}"`);
  } else if (citaAudio) {
    const deQuien = m.quoted.fromMe ? "tuyo" : "que mandó alguien del grupo";
    partes.push(`${nombre} cita un audio ${deQuien} y te dice: "${dicho}". El audio va adjunto: escuchalo para contestar (puede ser alguien hablando o un tema de música).${sinEscuchar}`);
  } else if (esRespuestaAlBot && m.quoted.text) {
    partes.push(`${nombre} responde a este mensaje tuyo: "${citado}"\n\nSu mensaje: ${suMensaje}\n\nContestá siguiendo la charla, con tu onda.`);
  } else {
    partes.push(`Mensaje de ${nombre}: ${suMensaje}`);
  }
  // What else was said to her while it wasn't her turn (lib/turnos-de-claudia.js), which she used to drop: she answers
  // it in this same message. Named here, since the messages above are context she's told not to repeat.
  if (antes.length) {
    const lineas = antes.map((e) => `${e.nombre}: "${e.m.text ? conNombres(e.m.text, e.m.mentionedJid).slice(0, 300) : esFoto(e.m) ? "(una foto)" : "(un audio)"}"`);
    partes.push(`Antes de ese mensaje también te escribieron, y todavía no les contestaste: ${lineas.join(" · ")}. Contestales también en esta misma respuesta, a cada uno por su nombre.`);
  }
  if (laFoto) partes.push(sobreLaFoto(laFoto, foto));

  // The sources of an earlier search, in case they're what's being asked for.
  const previas = fuentesPara(m.chat, esRespuestaAlBot ? m.quoted.id : null);
  partes.push(
    previas
      ? `Hace un rato buscaste en internet sobre "${previas.tema}" y tenés guardadas las fuentes.`
      : `No tenés guardadas fuentes de ninguna búsqueda reciente: si te preguntan de dónde sacaste algo que dijiste, decí con naturalidad que lo dijiste de memoria, o buscalo si es algo que se pueda verificar.`,
  );

  // The prompt for a web search, if the AI asks for one: everything above, without the classification below.
  const contextoBusqueda = partes.join("\n\n");

  partes.push(
    `(Instrucción para vos, no la muestres en tu respuesta: clasificá el pedido en el campo "comando" - usá "play" si piden bajar audio de YouTube, "video" si piden bajar video, "tagall" si piden mencionar a todo el grupo, "llamar" si piden mencionar varias veces a alguien, o "ninguno" si no corresponde nada de eso. Si es "play" o "video", poné en "argumento" el tema o título pedido; dejalo vacío en los demás casos. En "respuesta" escribí tu respuesta de charla normal, con tu onda de siempre. IMPORTANTE: si el pedido es "play" o "video", NO digas que ya se lo mandaste ni que estás por hacerlo - vos no ejecutás nada ahí, el sistema le va a indicar el comando exacto para pedirlo directamente. Si en cambio activás "tagall" o "llamar", esas sí van a pasar apenas las marques - así que tu respuesta tiene que acompañar eso, no contradecirlo ni bromear como si no lo fueras a hacer. REGLA DE ORO: vos existís solo mientras escribís este mensaje. Nunca prometas hacer algo después ("déjame ver", "te aviso", "lo pruebo más tarde", "me fijo y te digo"): no podés, sería mentir. Si no podés hacer algo, decilo claro y sin vueltas. Única excepción: si la persona te pide que vuelvas a intentar más tarde una descarga que le falló, poné "reintentar" en true y en "respuesta" decí solo que lo dejás anotado, sin decir cuándo - el sistema le confirma la hora, o le avisa si no había nada para reintentar. BÚSQUEDAS: si te preguntan si algo es verdad, o te piden un dato del mundo real que se pueda verificar (una noticia, algo que pasó, un dato de un tema de música o de una banda que no tengas claro, como quién lo escribió o de dónde es), poné en "buscar" una consulta corta para buscar en internet: el sistema la busca y te deja contestar con lo que encuentre. En ese caso, en "respuesta" poné algo corto que sirva por si la búsqueda falla, sin afirmar nada que no sepas. Si es un bolazo, una joda o un chisme del grupo, una opinión o algo que sabés de sobra, NO busques: contestá como siempre y dejá "buscar" vacío. FUENTES: poné "fuentes" en true solo si te piden las fuentes, los links o de dónde sacaste algo; el sistema manda los links que tenga, vos nunca escribas links. AUDIOS: si hay un audio adjunto, en "resumenAudio" poné en una línea qué dice o qué es (por ejemplo "cuenta que se le rompió el auto" o "un tema de rock en inglés"); si no hay audio, dejalo vacío. Si te enterás de algo nuevo que valga la pena recordar de la persona (un gusto, una manía, un dato personal chico, una joda interna), o de que cambió algo que ya sabías de ella, ponelo corto en "recordar"; si no hay nada nuevo, dejalo vacío. Nunca inventes datos falsos, y nunca guardes cosas sensibles como salud, plata, contraseñas o dirección.)`,
  );

  if (foto?.ok) partes.push(SOBRE_LA_FOTO);
  if (formas.length) partes.push(formas.includes("nada") ? FORMA_AL_PASAR : FORMA_DE_CIERRE);

  const consulta = partes.join("\n\n");

  // the 'typing...' starts before asking the AI, the way a person would. Not when she may end up sending nothing: the
  // group would see her typing, and then nothing. If she does answer, it shows while she types (decir).
  if (!formas.length) await client.sendPresenceUpdate("composing", m.chat).catch(() => {});

  const resultado = await preguntarIA(consulta, { schema: esquemaPara(formas, Boolean(foto?.ok)), adjuntos });

  // The doors, again, right before she says anything: the AI took a while, and in the meantime an admin may have put
  // .banchat, .modoadmin or .charla off, or the owner banned the person. She used to say her piece anyway. Once
  // closed, she says nothing more for this message.
  let callada = false;
  const puedeHablar = () => {
    if (!callada && !isOwner) {
      const ahoraChat = getChat(m.chat);
      callada = Boolean(ahoraChat?.isBanned || ahoraChat?.charla === 0 || (m.isGroup && ahoraChat?.adminMode && !isMod) || getUser(m.sender)?.banned);
    }
    return !callada;
  };

  // When the AI fails her, she says so, but not more than once every AVISO_FALLA_MS per chat. A failure that wasn't
  // the quota (every model down, blocked or cut off) used to get no answer at all.
  const avisarFalla = async (texto) => {
    if (Date.now() - (avisoFalla.get(m.chat) || 0) < AVISO_FALLA_MS || !puedeHablar()) return;
    avisoFalla.set(m.chat, Date.now());
    await client.sendText(m.chat, texto, null);
  };

  if (!resultado.ok) {
    if (!resultado.sinCuota) await avisarFalla("Uy, no me sale pensar ahora. Probá de nuevo en un rato 😅");
    else await avisarFalla(resultado.porHoy ? "Se me acabó la cuota gratis de la IA por hoy, mañana temprano ya debería volver a andar 😅" : "Uf, me llegaron muchos pedidos juntos y la IA me frenó un toque. Probá de nuevo en un ratito 😅");
    return;
  }

  let datos;
  try {
    datos = JSON.parse(resultado.texto);
  } catch (e) {
    // Without the text: it carries what she was going to remember of the person and what a voice note said, and the
    // log (~/claudia.log) keeps whatever goes into it. Not even the bit of it V8 quotes in the error
    // ("hola, la c"...). Gemini and the fallbacks already throw a broken JSON away (lib/gemini.js,
    // lib/respaldo-ia.js): this is in case one of them stops doing it.
    const motivo = String(e.message).split('"')[0].replace(/[,\s]+$/, "");
    const largo = String(resultado.texto || "").length;
    console.error(`[auto-ia] La IA (${modeloActivo() || "?"}) no devolvió JSON válido: ${motivo} (${largo} caracteres)`);
    await avisarFalla("Uy, se me trabó la respuesta a mitad de camino, repetime el pedido porfa 😅");
    return;
  }

  const comando = (datos.comando || "ninguno").toLowerCase();
  const argumento = (datos.argumento || "").trim();
  const respuesta = (datos.respuesta || "").trim();
  const nuevoRecuerdo = datos.recordar ? String(datos.recordar).trim() : null;
  const quiereReintentar = datos.reintentar === true;
  const aBuscar = typeof datos.buscar === "string" ? datos.buscar.trim().slice(0, 200) : "";
  const pideFuentes = datos.fuentes === true;
  // What the audio said and what the photo showed, in a line. Not from a fallback model, which got neither (lib/ia.js):
  // whatever it says of them, it made up, and it used to be kept as what the voice note said.
  const loQueHabia = (campo) => (!resultado.sinAdjuntos && typeof datos[campo] === "string" ? datos[campo].trim().slice(0, 200) : "");
  const resumenAudio = loQueHabia("resumenAudio");
  const resumenFoto = foto?.ok ? loQueHabia("resumenFoto") : "";

  // A voice note enters the thread as what it said, so a later "¿y vos qué opinás?" has something to go on. Where
  // it was sent, not where she got through hearing it: what was said meanwhile came after it. It's there already, as
  // its mark (lib/memoria-corta.js): that becomes what it said, as an edit by whoever sent it. Stored here only if it
  // wasn't.
  if (notaDeVoz && resumenAudio) {
    const id = m.id ?? m.key?.id;
    const dicho = conMarca("audio", resumenAudio);
    if (!editarMensaje(m.chat, id, dicho, [m.sender, m.senderJid, m.key?.participant])) {
      recordarMensaje(m.chat, nombre, dicho, false, { id, usuario: m.sender, participant: m.key?.participant, esAudio: true, fecha: fechaDe(m) });
    }
  }

  // And a photo she looked at stays as what it showed, in the message it came in: a later "¿y el de atrás quién es?"
  // has something to go on, with the photo itself kept nowhere (lib/fotos.js).
  if (resumenFoto) recordarLoVisto(m.chat, laFoto.id, resumenFoto);

  // What she learned of them goes with what she knew, and when that's too much she goes over it, in the background:
  // nobody waits for it (lib/memoria-persona.js).
  if (nuevoRecuerdo && anotarDe(m.sender, m.chat, nuevoRecuerdo, ahora)) {
    repasarRecuerdos(m.sender, m.chat, nombre, ahora).catch((e) => console.error("[memoria] no pude repasar lo que sé de alguien:", e?.message || e));
  }

  // ---------- with words, or not ----------
  // What she chose among what was offered; anything else that comes back is words (a fallback model gets the schema
  // as text, and may make one up). A command, a retry, a search or sources are things to say, whatever she chose.
  const elegida = formas.includes(datos.forma) ? datos.forma : "texto";
  const forma = comando !== "ninguno" || quiereReintentar || aBuscar || pideFuentes ? "texto" : elegida;
  const deQuien = [m.sender, m.senderJid];
  if (forma !== "texto") {
    // One of her own emojis, on the message that named her. Not over a reaction of the bot's on it (🔥 for a streak):
    // WhatsApp keeps one per account, and hers would take its place. The reactions' queue may drop it (lib/envios.js),
    // and then she said nothing at all.
    let emoji = forma === "reaccion" ? emojiPropio(datos.emoji) : null;
    if (emoji && (!m.key?.id || yaReaccionoElBot(m.key.id) || !puedeHablar())) emoji = null;
    if (emoji && !(await client.sendMessage(m.chat, { react: { text: emoji, key: m.key } }).catch(() => null))) emoji = null;
    // If they come back about it, they get words. And her turn goes back: whoever talks to her next doesn't wait on a
    // message she never sent, and what waited meanwhile is seen to now.
    const ya = _dep.ahora();
    anotarSilencio(m.chat, deQuien, ya);
    soltarTurno(m.chat);
    const cuando = cuandoContesta(m.chat, ya);
    if (cuando !== null) programar(m.chat, Math.max(0, cuando - ya));
    // Counted last, so that the database failing doesn't keep her turn: for .actividad to tell how often she lets
    // things go by. A reaction with whom it was to, like the ones of her glances, and a silence with nothing but that
    // it was one.
    registrarIntervencion(emoji ? { chat: m.chat, tipo: "reaccion-charla", objetivoId: m.key.id, objetivoUsuario: m.sender, texto: emoji } : { chat: m.chat, tipo: "silencio" });
    return;
  }
  olvidarSilencio(m.chat, deQuien);

  // what Claudia says also goes into the short-term memory
  // Only the first message carries the typing delay: if Claudia sends two in a row, the second follows right after.
  // With the voice on for this answer (.voz, lib/voz.js: always, or to a voice note), it goes as a voice note, made
  // first and with "recording..." instead of "typing..."; by text if the voice isn't there, it's too long or fails.
  const conVoz = m.isGroup && hablaCon(m.chat, { notaDeVoz });
  const maxLetras = conVoz ? maxLetrasDeVoz(m.chat, { notaDeVoz }) : 0;
  let yaTipeo = false;
  const decir = async (crudo, quoted = null) => {
    const texto = sinMenciones(crudo);
    if (!texto || !puedeHablar()) return;
    const audio = conVoz ? await hablar(texto, { maxLetras }) : null;
    if (!yaTipeo) {
      yaTipeo = true;
      await (audio ? grabar : tipear)(client, m.chat, texto);
      if (!puedeHablar()) return; // the typing takes a few seconds too
    }
    // Kept in her memory right below, as her chat and with what she said aloud: lib/envios.js would leave it there as
    // the bot's machinery, and of a voice note it only knows it's an audio.
    const enviado = await sinRecordar(() => (audio ? client.sendFile(m.chat, audio, "voz.mp3", null, quoted, true) : client.sendText(m.chat, texto, quoted)));
    recordarMensaje(m.chat, "Claudia", texto, true, { id: enviado?.key?.id, comando: false, citaId: quoted?.key?.id || null });
    // Answering when named counts as talking too: the initiative's "no more than the average" rule looks at it.
    if (m.isGroup) registrarIntervencion({ chat: m.chat, tipo: "charla", mensajeId: enviado?.key?.id || null, texto });
    // And it's when they last talked, she and whoever she's answering: next time she knows how long it's been
    // (lib/quien-escribe.js).
    anotarCharla([m.sender, ...antes.map((e) => e.m.sender)], m.chat, ahora);
    return enviado;
  };

  // Download retry: the AI only flags it; the system decides whether it applies, and only then does she say she noted
  // it down. She used to say it first, and then the system said there was nothing to retry.
  if (quiereReintentar) {
    if (!puedeHablar()) return;
    const r = programarReintento(m.chat, m.sender);
    if (r.ok) await decir(respuesta, cita);
    await decir(r.ok ? r.mensaje : r.error, m);
    return;
  }

  if (!comando || comando === "ninguno") {
    // Something to check: a second query, this one with Google Search. If it fails, the first answer stands.
    let texto = respuesta;
    let fuentesNuevas = [];
    if (aBuscar && puedeHablar()) {
      const busqueda = await buscarEnInternet({ contexto: contextoBusqueda, consulta: aBuscar, resumenAudio, resumenFoto, nombre });
      if (busqueda) ({ texto, fuentes: fuentesNuevas } = busqueda);
    }
    const enviado = await decir(texto, cita);
    if (fuentesNuevas.length) guardarFuentes(m.chat, { idMensaje: enviado?.key?.id, tema: aBuscar, fuentes: fuentesNuevas });
    if (pideFuentes) {
      const entrada = fuentesNuevas.length ? { fuentes: fuentesNuevas } : previas;
      if (entrada) await decir(await textoFuentes(entrada));
    }
    return;
  }

  // play and video: the AI no longer runs the download, it just gives the exact command to ask for it.
  if (comando === "play" || comando === "video") {
    const comandoSugerido = comando === "play" ? ".play" : ".video";
    const ejemplo = argumento ? ` ${argumento}` : " nombre de la canción";
    await decir(`Para eso pedímelo directo con el comando: ${comandoSugerido}${ejemplo}`, m);
    return;
  }

  // tagall and llamar: groups only, and only for whoever could run the command itself. The plugin is called directly
  // below, past the dispatcher's checks, so its own flags decide: .tagall is for moderators, .llamar for admins.
  // Whom a "llamar" calls, worked out once: it may ask WhatsApp who has a number (aQuienLlamar).
  let aLlamar = [];
  if (comando === "tagall" || comando === "llamar") {
    if (!m.isGroup) {
      await decir(respuesta, cita);
      return;
    }
    if (!PIDE_MENCIONES.test(normalizar(m.text))) {
      await decir(comando === "tagall" ? "Si querés que mencione a todos, pedímelo con .tagall." : "Si querés que llame a alguien, pedímelo con .llamar @persona.", m);
      return;
    }
    const soloAdmins = Boolean(buscarPlugin(comando)?.onlyAdmin);
    if (!isOwner && !(soloAdmins ? isAdmin : isMod)) {
      await decir(soloAdmins ? "Che, eso lo puede pedir solo un admin del grupo." : "Che, eso lo puede pedir solo un admin o moderador del grupo.", m);
      return;
    }
    // Blocked in this group with .blon + .bladd: asking her is the same as typing the command.
    if (chat?.blacklistMode && !isOwner && isCommandBlacklisted(m.chat, comando)) {
      await decir("Che, eso está bloqueado en este grupo.", m);
      return;
    }
    // What the command itself would refuse, checked before she announces anything: she used to say "¡Ahí van
    // todos!" and then the command said the mentions were off, or "¡Dale, ya lo llamo!" with nobody to call.
    if (comando === "tagall" && !chat?.mentions && !isOwner) {
      await decir("Che, en este grupo las menciones están apagadas.", m);
      return;
    }
    // Everyone opted out with .notagall (lib/menciones-generales.js): she can't force it, so there's nobody to call.
    if (comando === "tagall") {
      const { ids, fuera } = mencionesParaTodos(m.chat, participants, { client });
      if (!ids.length) {
        await decir(fuera > 0 ? "Che, acá no hay a quién mencionar: todos pidieron no recibir los llamados a todos (.notagall)." : textoSinNadie(0), m);
        return;
      }
    }
    if (comando === "llamar") aLlamar = await aQuienLlamar(m, client, participants);
    if (comando === "llamar" && !aLlamar.length) {
      await decir("¿A quién llamo? Arrobalo en el mensaje.", m);
      return;
    }
  }

  await decir(respuesta, cita);
  if (!puedeHablar()) return;

  if (comando === "tagall") {
    const pl = buscarPlugin("tagall");
    // desdeClaudia: what she was told is never read as a .tagall -f, which only an admin can send typing it.
    if (pl) await pl.run(m, { client, isOwner, text: m.text, participants, chat, desdeClaudia: true });
  } else if (comando === "llamar") {
    // .llamar gets the people to call as she worked them out (aLlamar): never Claudia herself, and nobody asked about
    // again.
    const pl = buscarPlugin("llamar");
    if (pl) await pl.run(m, { client, text: m.text, command: "llamar", participants, aLlamar });
  }
}

export default plugin;
