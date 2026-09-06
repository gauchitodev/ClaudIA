import { preguntarIA } from "../lib/ia.js";
import { updateUser } from "../database-functions.js";
import { recordarMensaje, textoContexto } from "../lib/contexto-chat.js";
import { programarReintento } from "../lib/pendientes.js";
import { conocimientoPara } from "../lib/manual-claudia.js";
import { laburoDe } from "../lib/laburos.js";
import { textoParaPrompt as memoriaDelGrupo } from "../lib/memoria-grupo.js";

// Palabras con las que el bot se da por aludido (en minúscula).
const PALABRAS_CLAVE = ["bot", "claudia", "tabbot"];

// Freno: tiempo mínimo entre respuestas automáticas por chat (evita spam y que WhatsApp marque el chip).
const COOLDOWN_MS = 3000; // 3 segundos

if (!globalThis.autoIaCooldown) globalThis.autoIaCooldown = new Map();
if (!globalThis.autoIaSinCuotaAviso) globalThis.autoIaSinCuotaAviso = new Map();
const AVISO_SIN_CUOTA_MS = 30 * 60 * 1000; // no repetir el aviso de "sin cuota" más de una vez cada 30 min por chat

const buscarPlugin = (cmd) => Object.values(globalThis.plugins).find((p) => p.cmd && p.cmd.includes(cmd));

// Esquema de salida: la IA está OBLIGADA a devolver exactamente esta forma, no una sugerencia de texto.
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

plugin.before = async (m, { client, participants, isMod, isBotAdmin, isOwner, user, chat }) => {
  try {
    if (m.fromMe || m.isBaileys) return;
    if (!m.text) return;

    // Memoria corta: todo mensaje del grupo (comandos incluidos) queda en el contexto reciente.
    const nombre = user?.apodo || m.pushName || user?.pushName || m.sender.split("@")[0];
    recordarMensaje(m.chat, nombre, m.text, false);

    // Charla automática apagada en este grupo (.charla / .modo compraventa): Claudia solo responde a comandos.
    if (chat?.charla === 0) return;

    if (!globalThis.geminiApiKey) return;

    // si el mensaje es un comando (empieza con prefijo), lo maneja el sistema normal
    if (globalThis.prefix.some((p) => m.text.startsWith(p))) return;

    const textoLower = m.text.toLowerCase();

    // ¿el mensaje es una respuesta a un mensaje del propio bot?
    const esRespuestaAlBot = m.quoted && m.quoted.fromMe;

    // ¿el mensaje menciona alguna palabra clave?
    const mencionaPalabra = PALABRAS_CLAVE.some((palabra) => {
      const regex = new RegExp(`\\b${palabra}\\b`, "i");
      return regex.test(textoLower);
    });

    // responde si la nombran O si le contestan un mensaje suyo
    if (!esRespuestaAlBot && !mencionaPalabra) return;

    // FRENO: cooldown por chat
    const ahora = Date.now();
    const ultimaVez = globalThis.autoIaCooldown.get(m.chat) || 0;
    if (ahora - ultimaVez < COOLDOWN_MS) return;
    globalThis.autoIaCooldown.set(m.chat, ahora);

    // ---------- armar el prompt ----------
    const partes = [];

    // lo que Claudia sabe de sí misma y del bot (el manual completo solo si el mensaje pregunta por funciones)
    partes.push(conocimientoPara(m.text));

    const contexto = textoContexto(m.chat, true);
    if (contexto) {
      partes.push(`Últimos mensajes del grupo, del más viejo al más nuevo (es contexto para seguir el hilo, no lo repitas):\n${contexto}`);
    }

    if (user?.memoria) {
      partes.push(`Lo que ya sabés de ${nombre} por charlas anteriores: ${user.memoria}`);
    }

    // memoria del grupo (.recordá que ...): chistes internos y datos que el grupo le anotó
    if (m.isGroup) {
      const hechos = memoriaDelGrupo(m.chat);
      if (hechos) partes.push(hechos);
    }

    // laburo del juego de roles: Claudia lo sabe y puede chicanear con eso
    const laburo = laburoDe(m.chat, m.sender);
    if (laburo) {
      partes.push(`En el juego de roles del grupo, ${nombre} trabaja de ${laburo.oficio.nombre.toLowerCase()} (${laburo.oficio.desc}). Podés usarlo para chicanear o hacer referencia si viene al caso, sin forzarlo.`);
    }

    // apodo comprado en la tienda: Claudia le habla así
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

    await client.sendPresenceUpdate("composing", m.chat);

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

    // lo que Claudia dice también entra en la memoria corta
    const decir = async (texto, quoted = null) => {
      if (!texto) return;
      recordarMensaje(m.chat, "Claudia", texto, true);
      await client.sendText(m.chat, texto, quoted);
    };

    // Reintento de descarga: la IA solo lo marca; el sistema decide si corresponde y confirma.
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

    // play y video: la IA ya no ejecuta la descarga, solo indica el comando exacto para pedirla.
    if (comando === "play" || comando === "video") {
      const comandoSugerido = comando === "play" ? ".play" : ".video";
      const ejemplo = argumento ? ` ${argumento}` : " nombre de la canción";
      await decir(`Para eso pedímelo directo con el comando: ${comandoSugerido}${ejemplo}`, m);
      return;
    }

    // tagall y llamar: solo en grupo, y solo si quien pide es admin
    if (comando === "tagall" || comando === "llamar") {
      if (!m.isGroup) {
        await decir(respuesta);
        return;
      }
      if (!isMod && !isOwner) {
        await decir("Che, eso lo puede pedir solo un admin o moderador del grupo.", m);
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
