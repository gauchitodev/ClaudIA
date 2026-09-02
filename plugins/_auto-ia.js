import { preguntarIA } from "../lib/ia.js";
import { updateUser } from "../database-functions.js";

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
  },
  required: ["comando", "respuesta"],
};

let plugin = (m) => m;

plugin.before = async function (m, { client, participants, isAdmin, isBotAdmin, isOwner, user, chat }) {
  try {
    if (!globalThis.geminiApiKey) return;
    if (m.fromMe || m.isBaileys) return;
    if (!m.text) return;

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

    // armar el texto para la IA, con contexto si es respuesta a un mensaje suyo
    let consulta = m.text;
    if (esRespuestaAlBot && m.quoted.text) {
      consulta = `En el grupo vos (Claudia) habías dicho: "${m.quoted.text}". Ahora te responden: "${m.text}". Contestá siguiendo la charla, con tu onda.`;
    }

    if (user?.memoria) {
      consulta = `Lo que ya sabés de ${user.pushName || "esta persona"} por charlas anteriores: ${user.memoria}\n\n${consulta}`;
    }

    // apodo comprado en la tienda: Claudia le habla así
    if (user?.apodo) {
      consulta = `Esta persona te pidió que le digas "${user.apodo}" — usá ese apodo cuando le hables.\n\n${consulta}`;
    }

    consulta += `\n\n(Instrucción para vos, no la muestres en tu respuesta: clasificá el pedido en el campo "comando" - usá "play" si piden bajar audio de YouTube, "video" si piden bajar video, "tagall" si piden mencionar a todo el grupo, "llamar" si piden mencionar varias veces a alguien, o "ninguno" si no corresponde nada de eso. Si es "play" o "video", poné en "argumento" el tema o título pedido; dejalo vacío en los demás casos. En "respuesta" escribí tu respuesta de charla normal, con tu onda de siempre. IMPORTANTE: si el pedido es "play" o "video", NO digas que ya se lo mandaste ni que estás por hacerlo - vos no ejecutás nada ahí, el sistema le va a indicar el comando exacto para pedirlo directamente. Si en cambio activás "tagall" o "llamar", esas sí van a pasar apenas las marques - así que tu respuesta tiene que acompañar eso, no contradecirlo ni bromear como si no lo fueras a hacer. Si te enterás de algo nuevo que valga la pena recordar de la persona (un gusto, una manía, un dato personal chico, una joda interna), ponelo corto en "recordar"; si no hay nada nuevo, dejalo vacío. Nunca inventes datos falsos, y nunca guardes cosas sensibles como salud, plata, contraseñas o dirección.)`;

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
    let respuesta = (datos.respuesta || "").trim();
    const nuevoRecuerdo = datos.recordar ? String(datos.recordar).trim() : null;

    if (nuevoRecuerdo && user) {
      const datosPrevios = user.memoria ? user.memoria.split(" | ") : [];
      datosPrevios.push(nuevoRecuerdo);
      const memoriaNueva = datosPrevios.slice(-6).join(" | ").slice(-600);
      updateUser(m.sender, { memoria: memoriaNueva });
    }

    if (!comando || comando === "ninguno") {
      if (respuesta) await client.sendText(m.chat, respuesta, null);
      return;
    }

    // play y video: la IA ya no ejecuta la descarga, solo indica el comando exacto para pedirla.
    if (comando === "play" || comando === "video") {
      const comandoSugerido = comando === "play" ? ".play" : ".video";
      const ejemplo = argumento ? ` ${argumento}` : " nombre de la canción";
      await client.sendText(m.chat, `Para eso pedímelo directo con el comando: ${comandoSugerido}${ejemplo}`, m);
      return;
    }

    // tagall y llamar: solo en grupo, y solo si quien pide es admin
    if (comando === "tagall" || comando === "llamar") {
      if (!m.isGroup) {
        if (respuesta) await client.sendText(m.chat, respuesta, null);
        return;
      }
      if (!isAdmin && !isOwner) {
        await client.sendText(m.chat, "Che, eso lo puede pedir solo un admin del grupo.", m);
        return;
      }
    }

    if (respuesta) await client.sendText(m.chat, respuesta, null);

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
