import { preguntarIA } from "../lib/ia.js";
import { preguntarGemini } from "../lib/gemini.js";
import { esAudio, audioParaIA, tituloDeAudioEnviado } from "../lib/audios.js";
import { guardarFuentes, fuentesPara, textoFuentes } from "../lib/fuentes.js";
import { registrarIntervencion, isCommandBlacklisted, getChat, getUser } from "../database-functions.js";
import { memoriaDe, anotarDe } from "../lib/memoria-persona.js";
import { sinMenciones, lidsMencionados } from "../lib/menciones.js";
import { recordarMensaje, textoContexto, esComando } from "../lib/contexto-chat.js";
import { mencionesParaTodos, textoSinNadie } from "../lib/menciones-generales.js";
import { programarReintento } from "../lib/pendientes.js";
import { conocimientoPara } from "../lib/manual-claudia.js";
import { tipear } from "../lib/ritmo.js";
import { laburoDe } from "../lib/laburos.js";
import { textoParaPrompt as memoriaDelGrupo } from "../lib/memoria-grupo.js";
import { esMensajeDeJuego } from "../lib/mensajes-de-juego.js";
import { esPreguntaDelDia } from "../lib/pregunta-dia.js";
import { puedeRecuperarCitado } from "../lib/vista-unica.js";
// The words that make the bot consider itself addressed (lowercase), shared with the initiative's feedback.
import { PALABRAS_CLAVE, normalizar } from "../lib/iniciativa.js";

// Throttle: minimum time between automatic replies per chat (keeps spam down and the number off WhatsApp's radar).
// Minimum wait between two conversational replies in the same group. Raised to 20 s: besides avoiding spam, it's
// what cuts the bot's message volume the most, which is what gets accounts banned.
const COOLDOWN_MS = 20000; // 20 seconds

if (!globalThis.autoIaCooldown) globalThis.autoIaCooldown = new Map();
// When the AI fails her (no quota, every model down, a broken answer) she says so, but not more than once every 30 min
// per chat: with Gemini down, every message naming her would get the same notice.
if (!globalThis.autoIaAvisoFalla) globalThis.autoIaAvisoFalla = new Map();
const AVISO_FALLA_MS = 30 * 60 * 1000;

const buscarPlugin = (cmd) => Object.values(globalThis.plugins).find((p) => p.cmd && p.cmd.includes(cmd));

// Whether an id (a mention, the quoted message's author) is Claudia herself.
const esClaudia = (client, id) => Boolean(id) && (id === client.user?.lid || id === client.user?.jid);

// Who a "llamar" is for: the people mentioned, or failing that the author of the quoted message, but never Claudia,
// whom "@Claudia, llamá a @Juan" or "@Claudia, llamalo" mention too: .llamar would have called her ten times.
function aQuienLlamar(m, client) {
  const numero = client.user?.lid?.split("@")[0];
  const texto = numero ? String(m.text).replaceAll(`@${numero}`, "") : m.text;
  const mencionados = (m.mentionedJid || []).filter((j) => !esClaudia(client, j));
  return lidsMencionados({ mentionedJid: mencionados, quoted: m.quoted }, texto).filter((id) => !esClaudia(client, id));
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

// Numbered references ("[1]", "[2, 3]") a grounded answer may carry: in a chat they're noise.
export const sinReferencias = (texto) => texto.replace(/\s?\[\d+(?:,\s*\d+)*\]/g, "").trim();

// Look it up on the web and answer with that, in Claudia's voice and without links (those only go out if asked).
// Only Gemini can search; null when it can't, and the answer the chat already had is used instead.
export async function buscarEnInternet({ contexto, consulta, resumenAudio = "", nombre }) {
  const partes = [contexto];
  if (resumenAudio) partes.push(`(Lo que había en el audio, que ya escuchaste: ${resumenAudio})`);
  partes.push(
    `Buscá en internet: ${consulta}. Para noticias y hechos, priorizá medios de noticias y fuentes serias. Con lo que encuentres, contestale a ${nombre} con tu onda de siempre y corto, como un mensaje de WhatsApp: si es verdad, si es falso o si no está claro, y el dato justo, sin tirar más información de la que te pidieron. No pongas links, referencias numeradas ni una lista de fuentes: si te las piden, el sistema las manda aparte. Si no encontrás nada confiable, decilo sin vueltas. No prometas buscar más después.`,
  );
  const r = await preguntarGemini(partes.join("\n\n"), { buscarEnWeb: true });
  if (!r.ok) return null;
  const texto = sinReferencias(r.texto);
  return texto ? { texto, fuentes: r.fuentes || [] } : null;
}

const plugin = (m) => m;
// After every other hook (hooksEnOrden, load-functions.js): by then the moderation has marked what it deleted and the
// trivia what it took as an answer. The message itself is already in her short-term memory, and deletions and edits
// are applied there, as they come (plugins/_memoria-corta.js).
plugin.alFinal = true;

plugin.before = async (m, { client, participants, isAdmin, isMod, isBotAdmin, isOwner, user, chat }) => {
  try {
    // Deletions and edits (protocol messages, with no text) only touch her short-term memory, and
    // plugins/_memoria-corta.js has already applied them.
    if (m.fromMe || m.isBaileys) return;
    // A message the moderation just deleted (the anti-links, the blacklist and the mass mentions mark it; they run
    // before this hook): for Claudia it never existed. She used to answer it, repeating the link.
    if (m.moderado) return;
    // A reaction arrives as a message whose text is the emoji: it isn't something anyone said.
    if (m.mtype === "reactionMessage") return;
    // A voice note has no text, but it can be an answer to Claudia: that one she listens to (further down).
    const notaDeVoz = esAudio(m) && !m.text;
    if (!m.text && !notaDeVoz) return;

    const nombre = user?.apodo || m.pushName || user?.pushName || m.sender.split("@")[0];

    // Automatic chat off in this group (.charla / .modo compraventa): Claudia only answers commands.
    if (chat?.charla === 0) return;

    // The doors handle-message closes before any command, which this hook runs ahead of: a chat banned with .banchat,
    // .modoadmin for whoever isn't a moderator, and a person banned from the bot. Claudia kept chatting there, spending
    // quota, and a .tagall went out by asking her.
    if (!isOwner && (chat?.isBanned || user?.banned || (m.isGroup && chat?.adminMode && !isMod))) return;

    if (!globalThis.geminiApiKey) return;

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

    // does the message mention any of the keywords?
    const mencionaPalabra = PALABRAS_CLAVE.some((palabra) => {
      const regex = new RegExp(`\\b${palabra}\\b`, "i");
      return regex.test(textoLower);
    });

    // Mentioned with "@", anywhere in the message. "@Claudia ..." at the start used to be a command of .ia, which
    // answered without the group's context; in the middle of the message it didn't count at all.
    const laMencionan = (m.mentionedJid || []).some((j) => esClaudia(client, j));

    // she answers if she's named OR if someone replies to a message of hers. A voice note never names her, so she only
    // hears the ones that answer her: the rest of the group's audios are none of her business.
    if (!esRespuestaAlBot && !mencionaPalabra && !laMencionan) return;

    // THROTTLE: per-chat cooldown
    const ahora = Date.now();
    const ultimaVez = globalThis.autoIaCooldown.get(m.chat) || 0;
    if (ahora - ultimaVez < COOLDOWN_MS) return;
    globalThis.autoIaCooldown.set(m.chat, ahora);

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
    const adjuntos = audio?.ok ? [audio.adjunto] : [];

    // ---------- build the prompt ----------
    const partes = [];

    // what Claudia knows about herself and the bot (the full manual only if the message asks about features)
    partes.push(conocimientoPara(m.text));

    // What came before this message: it goes separately, and others may have come in after it while the hooks ran.
    const contexto = textoContexto(m.chat, m.id ?? m.key?.id);
    if (contexto) {
      partes.push(`Últimos mensajes del grupo, del más viejo al más nuevo (es contexto para seguir el hilo, no lo repitas):\n${contexto}`);
    }

    // What she learned of this person in this group (lib/memoria-persona.js): never what they said in private or elsewhere.
    const memoria = m.isGroup ? memoriaDe(m.sender, m.chat) : "";
    if (memoria) {
      partes.push(`Lo que ya sabés de ${nombre} por charlas anteriores en este grupo: ${memoria}`);
    }

    // group memory (.recordá que ...): inside jokes and facts the group noted down for her
    if (m.isGroup) {
      const hechos = memoriaDelGrupo(m.chat);
      if (hechos) partes.push(hechos);
    }

    // their role-play job: Claudia knows it and can tease them about it
    const laburo = laburoDe(m.chat, m.sender);
    if (laburo) {
      partes.push(`En el juego de roles del grupo, ${nombre} trabaja de ${laburo.oficio.nombre.toLowerCase()} (${laburo.oficio.desc}). Podés usarlo para chicanear o hacer referencia si viene al caso, sin forzarlo.`);
    }

    // nickname bought in the shop: Claudia addresses them that way
    if (user?.apodo) {
      partes.push(`Esta persona te pidió que le digas "${user.apodo}" — usá ese apodo cuando le hables.`);
    }

    const sinEscuchar = audio && !audio.ok ? ` (Ese audio no lo pudiste escuchar: ${audio.motivo === "largo" ? "es demasiado largo" : "no se pudo bajar"}. Si hace falta decilo con naturalidad, y no inventes lo que dice.)` : "";
    if (notaDeVoz) {
      const aQue = m.quoted?.text ? ` a este mensaje tuyo: "${m.quoted.text}"` : "";
      partes.push(`${nombre} te responde con un audio${aQue}. El audio va adjunto: escuchalo y contestá a lo que dice, siguiendo la charla, con tu onda.${sinEscuchar}`);
    } else if (temaEnviado) {
      partes.push(`${nombre} cita el tema "${temaEnviado}", que mandaste vos al grupo cuando te lo pidieron con .play, y te dice: "${m.text}"`);
    } else if (citaAudio) {
      const deQuien = m.quoted.fromMe ? "tuyo" : "que mandó alguien del grupo";
      partes.push(`${nombre} cita un audio ${deQuien} y te dice: "${m.text}". El audio va adjunto: escuchalo para contestar (puede ser alguien hablando o un tema de música).${sinEscuchar}`);
    } else if (esRespuestaAlBot && m.quoted.text) {
      partes.push(`${nombre} responde a este mensaje tuyo: "${m.quoted.text}"\n\nSu mensaje: "${m.text}"\n\nContestá siguiendo la charla, con tu onda.`);
    } else {
      partes.push(`Mensaje de ${nombre}: "${m.text}"`);
    }

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
      `(Instrucción para vos, no la muestres en tu respuesta: clasificá el pedido en el campo "comando" - usá "play" si piden bajar audio de YouTube, "video" si piden bajar video, "tagall" si piden mencionar a todo el grupo, "llamar" si piden mencionar varias veces a alguien, o "ninguno" si no corresponde nada de eso. Si es "play" o "video", poné en "argumento" el tema o título pedido; dejalo vacío en los demás casos. En "respuesta" escribí tu respuesta de charla normal, con tu onda de siempre. IMPORTANTE: si el pedido es "play" o "video", NO digas que ya se lo mandaste ni que estás por hacerlo - vos no ejecutás nada ahí, el sistema le va a indicar el comando exacto para pedirlo directamente. Si en cambio activás "tagall" o "llamar", esas sí van a pasar apenas las marques - así que tu respuesta tiene que acompañar eso, no contradecirlo ni bromear como si no lo fueras a hacer. REGLA DE ORO: vos existís solo mientras escribís este mensaje. Nunca prometas hacer algo después ("déjame ver", "te aviso", "lo pruebo más tarde", "me fijo y te digo"): no podés, sería mentir. Si no podés hacer algo, decilo claro y sin vueltas. Única excepción: si la persona te pide que vuelvas a intentar más tarde una descarga que le falló, poné "reintentar" en true y en "respuesta" decí solo que lo dejás anotado, sin decir cuándo - el sistema le confirma la hora, o le avisa si no había nada para reintentar. BÚSQUEDAS: si te preguntan si algo es verdad, o te piden un dato del mundo real que se pueda verificar (una noticia, algo que pasó, un dato de un tema de música o de una banda que no tengas claro, como quién lo escribió o de dónde es), poné en "buscar" una consulta corta para buscar en internet: el sistema la busca y te deja contestar con lo que encuentre. En ese caso, en "respuesta" poné algo corto que sirva por si la búsqueda falla, sin afirmar nada que no sepas. Si es un bolazo, una joda o un chisme del grupo, una opinión o algo que sabés de sobra, NO busques: contestá como siempre y dejá "buscar" vacío. FUENTES: poné "fuentes" en true solo si te piden las fuentes, los links o de dónde sacaste algo; el sistema manda los links que tenga, vos nunca escribas links. AUDIOS: si hay un audio adjunto, en "resumenAudio" poné en una línea qué dice o qué es (por ejemplo "cuenta que se le rompió el auto" o "un tema de rock en inglés"); si no hay audio, dejalo vacío. Si te enterás de algo nuevo que valga la pena recordar de la persona (un gusto, una manía, un dato personal chico, una joda interna), ponelo corto en "recordar"; si no hay nada nuevo, dejalo vacío. Nunca inventes datos falsos, y nunca guardes cosas sensibles como salud, plata, contraseñas o dirección.)`,
    );

    const consulta = partes.join("\n\n");

    // the 'typing...' starts before asking the AI, the way a person would
    await client.sendPresenceUpdate("composing", m.chat).catch(() => {});

    const resultado = await preguntarIA(consulta, { schema: ESQUEMA_RESPUESTA, adjuntos });

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
      if (Date.now() - (globalThis.autoIaAvisoFalla.get(m.chat) || 0) < AVISO_FALLA_MS || !puedeHablar()) return;
      globalThis.autoIaAvisoFalla.set(m.chat, Date.now());
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
      console.error("[auto-ia] La IA no devolvió JSON válido:", e.message, "-- texto recibido:", resultado.texto);
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
    const resumenAudio = typeof datos.resumenAudio === "string" ? datos.resumenAudio.trim().slice(0, 200) : "";

    // A voice note enters the thread as what it said, so a later "¿y vos qué opinás?" has something to go on.
    if (notaDeVoz && resumenAudio) {
      recordarMensaje(m.chat, nombre, `🎤 (audio) ${resumenAudio}`, false, { id: m.id ?? m.key?.id, usuario: m.sender, participant: m.key?.participant, esAudio: true });
    }

    if (nuevoRecuerdo) anotarDe(m.sender, m.chat, nuevoRecuerdo);

    // what Claudia says also goes into the short-term memory
    // Only the first message carries the typing delay: if Claudia sends two in a row, the second follows right after.
    let yaTipeo = false;
    const decir = async (crudo, quoted = null) => {
      const texto = sinMenciones(crudo);
      if (!texto || !puedeHablar()) return;
      if (!yaTipeo) {
        yaTipeo = true;
        await tipear(client, m.chat, texto);
        if (!puedeHablar()) return; // the typing takes a few seconds too
      }
      const enviado = await client.sendText(m.chat, texto, quoted);
      recordarMensaje(m.chat, "Claudia", texto, true, { id: enviado?.key?.id });
      // Answering when named counts as talking too: the initiative's "no more than the average" rule looks at it.
      if (m.isGroup) registrarIntervencion({ chat: m.chat, tipo: "charla", mensajeId: enviado?.key?.id || null, texto });
      return enviado;
    };

    // Download retry: the AI only flags it; the system decides whether it applies, and only then does she say she noted
    // it down. She used to say it first, and then the system said there was nothing to retry.
    if (quiereReintentar) {
      if (!puedeHablar()) return;
      const r = programarReintento(m.chat, m.sender);
      if (r.ok) await decir(respuesta);
      await decir(r.ok ? r.mensaje : r.error, m);
      return;
    }

    if (!comando || comando === "ninguno") {
      // Something to check: a second query, this one with Google Search. If it fails, the first answer stands.
      let texto = respuesta;
      let fuentesNuevas = [];
      if (aBuscar && puedeHablar()) {
        const busqueda = await buscarEnInternet({ contexto: contextoBusqueda, consulta: aBuscar, resumenAudio, nombre });
        if (busqueda) ({ texto, fuentes: fuentesNuevas } = busqueda);
      }
      const enviado = await decir(texto);
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
    if (comando === "tagall" || comando === "llamar") {
      if (!m.isGroup) {
        await decir(respuesta);
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
      if (comando === "llamar" && !aQuienLlamar(m, client).length) {
        await decir("¿A quién llamo? Arrobalo en el mensaje.", m);
        return;
      }
    }

    await decir(respuesta);
    if (!puedeHablar()) return;

    if (comando === "tagall") {
      const pl = buscarPlugin("tagall");
      // desdeClaudia: what she was told is never read as a .tagall -f, which only an admin can send typing it.
      if (pl) await pl.run(m, { client, isOwner, text: m.text, participants, chat, desdeClaudia: true });
    } else if (comando === "llamar") {
      // .llamar gets only the people to call as the message's mentions: never Claudia herself.
      const pl = buscarPlugin("llamar");
      if (pl) await pl.run(Object.create(m, { mentionedJid: { value: aQuienLlamar(m, client) } }), { client, text: m.text, command: "llamar" });
    }
  } catch (e) {
    console.error("[auto-ia] ERROR:", e);
  }
  return;
};

export default plugin;
