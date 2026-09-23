import { preguntarIA } from "../lib/ia.js";
import { updateUser } from "../database-functions.js";
import { recordarMensaje, textoContexto } from "../lib/contexto-chat.js";
import { programarReintento } from "../lib/pendientes.js";
import { conocimientoPara } from "../lib/manual-claudia.js";
import { tipear } from "../lib/ritmo.js";
import { laburoDe } from "../lib/laburos.js";
import { textoParaPrompt as memoriaDelGrupo } from "../lib/memoria-grupo.js";
import { esMensajeDeJuego } from "../lib/mensajes-de-juego.js";
import { esPreguntaDelDia } from "../lib/pregunta-dia.js";

// The words that make the bot consider itself addressed (lowercase).
const PALABRAS_CLAVE = ["bot", "claudia", "tabbot"];

// Throttle: minimum time between automatic replies per chat (keeps spam down and the number off WhatsApp's radar).
// Minimum wait between two conversational replies in the same group. Raised to 20 s: besides avoiding spam, it's
// what cuts the bot's message volume the most, which is what gets accounts banned.
const COOLDOWN_MS = 20000; // 20 seconds

if (!globalThis.autoIaCooldown) globalThis.autoIaCooldown = new Map();
if (!globalThis.autoIaSinCuotaAviso) globalThis.autoIaSinCuotaAviso = new Map();
const AVISO_SIN_CUOTA_MS = 30 * 60 * 1000; // don't repeat the "out of quota" notice more than once every 30 min per chat

const buscarPlugin = (cmd) => Object.values(globalThis.plugins).find((p) => p.cmd && p.cmd.includes(cmd));

// Output schema: the AI is REQUIRED to return exactly this shape, not a suggestion in prose.
const ESQUEMA_RESPUESTA = {
  type: "object",
  properties: {
    comando: { type: "string", enum: ["play", "video", "tagall", "llamar", "ninguno"] },
    argumento: { type: "string" },
    respuesta: { type: "string" },
    recordar: { type: "string" },
    reintentar: { type: "boolean" },
  },
  required: ["comando", "respuesta"],
};

const plugin = (m) => m;

plugin.before = async (m, { client, participants, isAdmin, isMod, isBotAdmin, isOwner, user, chat }) => {
  try {
    if (m.fromMe || m.isBaileys) return;
    if (!m.text) return;

    // Short-term memory: every group message (commands included) stays in the recent context.
    const nombre = user?.apodo || m.pushName || user?.pushName || m.sender.split("@")[0];
    recordarMensaje(m.chat, nombre, m.text, false);

    // Automatic chat off in this group (.charla / .modo compraventa): Claudia only answers commands.
    if (chat?.charla === 0) return;

    if (!globalThis.geminiApiKey) return;

    // if the message is a command (starts with a prefix), the normal system handles it
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return;

    const textoLower = m.text.toLowerCase();

    // is the message a reply to one of the bot's own messages?
    const esRespuestaAlBot = m.quoted && m.quoted.fromMe;
    // A reply to a game's message (a trivia question, a riddle, the hangman's board, today's question) is an answer to
    // it, not a message for Claudia, even if it names her: she used to chat back to every answer, and sometimes gave
    // the right one away. See lib/mensajes-de-juego.js.
    if (esRespuestaAlBot && (esMensajeDeJuego(m.quoted.id) || esPreguntaDelDia(m.chat, m.quoted.id))) return;

    // does the message mention any of the keywords?
    const mencionaPalabra = PALABRAS_CLAVE.some((palabra) => {
      const regex = new RegExp(`\\b${palabra}\\b`, "i");
      return regex.test(textoLower);
    });

    // she answers if she's named OR if someone replies to a message of hers
    if (!esRespuestaAlBot && !mencionaPalabra) return;

    // THROTTLE: per-chat cooldown
    const ahora = Date.now();
    const ultimaVez = globalThis.autoIaCooldown.get(m.chat) || 0;
    if (ahora - ultimaVez < COOLDOWN_MS) return;
    globalThis.autoIaCooldown.set(m.chat, ahora);

    // ---------- build the prompt ----------
    const partes = [];

    // what Claudia knows about herself and the bot (the full manual only if the message asks about features)
    partes.push(conocimientoPara(m.text));

    const contexto = textoContexto(m.chat, true);
    if (contexto) {
      partes.push(`Últimos mensajes del grupo, del más viejo al más nuevo (es contexto para seguir el hilo, no lo repitas):\n${contexto}`);
    }

    if (user?.memoria) {
      partes.push(`Lo que ya sabés de ${nombre} por charlas anteriores: ${user.memoria}`);
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

    if (esRespuestaAlBot && m.quoted.text) {
      partes.push(`${nombre} responde a este mensaje tuyo: "${m.quoted.text}"\n\nSu mensaje: "${m.text}"\n\nContestá siguiendo la charla, con tu onda.`);
    } else {
      partes.push(`Mensaje de ${nombre}: "${m.text}"`);
    }

    partes.push(
      `(Instrucción para vos, no la muestres en tu respuesta: clasificá el pedido en el campo "comando" - usá "play" si piden bajar audio de YouTube, "video" si piden bajar video, "tagall" si piden mencionar a todo el grupo, "llamar" si piden mencionar varias veces a alguien, o "ninguno" si no corresponde nada de eso. Si es "play" o "video", poné en "argumento" el tema o título pedido; dejalo vacío en los demás casos. En "respuesta" escribí tu respuesta de charla normal, con tu onda de siempre. IMPORTANTE: si el pedido es "play" o "video", NO digas que ya se lo mandaste ni que estás por hacerlo - vos no ejecutás nada ahí, el sistema le va a indicar el comando exacto para pedirlo directamente. Si en cambio activás "tagall" o "llamar", esas sí van a pasar apenas las marques - así que tu respuesta tiene que acompañar eso, no contradecirlo ni bromear como si no lo fueras a hacer. REGLA DE ORO: vos existís solo mientras escribís este mensaje. Nunca prometas hacer algo después ("déjame ver", "te aviso", "lo pruebo más tarde", "me fijo y te digo"): no podés, sería mentir. Si no podés hacer algo, decilo claro y sin vueltas. Única excepción: si la persona te pide que vuelvas a intentar más tarde una descarga que le falló, poné "reintentar" en true y en "respuesta" decí solo que lo dejás anotado, sin decir cuándo - el sistema le confirma la hora, o le avisa si no había nada para reintentar. Si te enterás de algo nuevo que valga la pena recordar de la persona (un gusto, una manía, un dato personal chico, una joda interna), ponelo corto en "recordar"; si no hay nada nuevo, dejalo vacío. Nunca inventes datos falsos, y nunca guardes cosas sensibles como salud, plata, contraseñas o dirección.)`,
    );

    const consulta = partes.join("\n\n");

    // the 'typing...' starts before asking the AI, the way a person would
    await client.sendPresenceUpdate("composing", m.chat).catch(() => {});

    const resultado = await preguntarIA(consulta, { schema: ESQUEMA_RESPUESTA });

    if (!resultado.ok) {
      if (resultado.sinCuota) {
        const ultimoAviso = globalThis.autoIaSinCuotaAviso.get(m.chat) || 0;
        if (Date.now() - ultimoAviso > AVISO_SIN_CUOTA_MS) {
          globalThis.autoIaSinCuotaAviso.set(m.chat, Date.now());
          await client.sendText(m.chat, "Se me acabó la cuota gratis de la IA por hoy, mañana temprano ya debería volver a andar 😅", null);
        }
      }
      return;
    }

    let datos;
    try {
      datos = JSON.parse(resultado.texto);
    } catch (e) {
      console.error("[auto-ia] La IA no devolvió JSON válido:", e.message, "-- texto recibido:", resultado.texto);
      await client.sendText(m.chat, "Uy, se me trabó la respuesta a mitad de camino, repetime el pedido porfa 😅", null);
      return;
    }

    const comando = (datos.comando || "ninguno").toLowerCase();
    const argumento = (datos.argumento || "").trim();
    const respuesta = (datos.respuesta || "").trim();
    const nuevoRecuerdo = datos.recordar ? String(datos.recordar).trim() : null;
    const quiereReintentar = datos.reintentar === true;

    if (nuevoRecuerdo && user) {
      const datosPrevios = user.memoria ? user.memoria.split(" | ") : [];
      datosPrevios.push(nuevoRecuerdo);
      const memoriaNueva = datosPrevios.slice(-6).join(" | ").slice(-600);
      updateUser(m.sender, { memoria: memoriaNueva });
    }

    // what Claudia says also goes into the short-term memory
    // Only the first message carries the typing delay: if Claudia sends two in a row, the second follows right after.
    let yaTipeo = false;
    const decir = async (texto, quoted = null) => {
      if (!texto) return;
      if (!yaTipeo) {
        yaTipeo = true;
        await tipear(client, m.chat, texto);
      }
      recordarMensaje(m.chat, "Claudia", texto, true);
      await client.sendText(m.chat, texto, quoted);
    };

    // Download retry: the AI only flags it; the system decides whether it applies and confirms.
    if (quiereReintentar) {
      await decir(respuesta);
      const r = programarReintento(m.chat, m.sender);
      await decir(r.ok ? r.mensaje : r.error, m);
      return;
    }

    if (!comando || comando === "ninguno") {
      await decir(respuesta);
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
      const soloAdmins = Boolean(buscarPlugin(comando)?.onlyAdmin);
      if (!isOwner && !(soloAdmins ? isAdmin : isMod)) {
        await decir(soloAdmins ? "Che, eso lo puede pedir solo un admin del grupo." : "Che, eso lo puede pedir solo un admin o moderador del grupo.", m);
        return;
      }
    }

    await decir(respuesta);

    if (comando === "tagall") {
      const pl = buscarPlugin("tagall");
      if (pl) await pl.run(m, { client, isOwner, text: m.text, participants, chat });
    } else if (comando === "llamar") {
      const pl = buscarPlugin("llamar");
      if (pl) await pl.run(m, { client, text: m.text, command: "llamar" });
    }
  } catch (e) {
    console.error("[auto-ia] ERROR:", e);
  }
  return;
};

export default plugin;
