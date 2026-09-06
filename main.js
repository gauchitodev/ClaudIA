import "./globals.js";
const { DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = await import(baileys);
import { readdirSync, rmSync, mkdirSync } from "fs";
import { makeWASocket, serialize } from "./lib/wa-socket.js";
import pino from "pino";
import { installYtDlp, loadPlugins, watchPlugins } from "./load-functions.js";
import { loadDatabase, sumarInteraccion } from "./database-functions.js";
import { mesDe } from "./lib/hashtags.js";
import { otorgarPorReaccion } from "./lib/urucoins.js";
import { iniciarPendientes } from "./lib/pendientes.js";
import { iniciarTareasProgramadas } from "./lib/tareas-programadas.js";
import { avisarOwner } from "./lib/avisos.js";
import { limpiarRolesAlSalir } from "./lib/roles.js";
import { avisoReglasParaNuevos } from "./lib/reglas.js";
import qrcode from "qrcode-terminal";
const handler = await import("./handle-message.js");

serialize();

let intentosReconexion = 0;
const MAX_REINTENTOS = 5;
let reconectando = false;
let horaConexion = 0;

// Reacciones ya contadas (mensaje + quien reacciona), en RAM y con tope, para no contar dos veces la misma.
const reaccionesContadas = new Map();
const MAX_REACCIONES_RECORDADAS = 5000;
function marcarReaccionContada(messageId, reactorLid) {
  const clave = `${messageId}|${reactorLid}`;
  if (reaccionesContadas.has(clave)) return false;
  reaccionesContadas.set(clave, Date.now());
  if (reaccionesContadas.size > MAX_REACCIONES_RECORDADAS) reaccionesContadas.delete(reaccionesContadas.keys().next().value);
  return true;
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(authFile);

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`🔢 Usando versión de WhatsApp Web: ${version.join(".")}${isLatest ? " (Última versión)" : ""}`);

  const connectionOptions = {
    logger: pino({ level: "silent" }),
    version,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    getMessage: () => null,
  };

  globalThis.client = makeWASocket(connectionOptions);

  client.ev.on("creds.update", saveCreds);

  if (!client.authState.creds.registered && numberBot && numberBot !== "") {
    setTimeout(async () => {
      try {
        let pairingCode = await client.requestPairingCode(numberBot);
        pairingCode = pairingCode?.match(/.{1,4}/g)?.join("-");
        console.log(`\n🔑 CÓDIGO DE VINCULACIÓN: ${pairingCode}\n`);
      } catch (e) {
        console.log("⚠️ No se pudo generar el código (error de conexión o reintento necesario).", e?.message || e);
      }
    }, 3000);
  }

  client.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (connection === "close") {
      globalThis.botConectado = false;
      if (!globalThis.horaCaida) globalThis.horaCaida = Date.now();
    }

    if (!numberBot && qr) {
      qrcode.generate(qr, { small: true });
      console.log("📌 Tienes 45 SEGUNDOS para escanear este QR:");
    }

    if (connection === "close" && lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
      console.log('❌ La sesión fue cerrada desde WhatsApp. Se borrarán las credenciales.');
      rmSync(`./${globalThis.authFile}`, { recursive: true, force: true });
      setTimeout(() => process.exit(0), 2000);
      return;
    }

    if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
      if (reconectando) return;
      reconectando = true;
      intentosReconexion++;
      if (intentosReconexion > MAX_REINTENTOS) {
        console.log("❌ Reconexión falló varias veces. Frenando. Reiniciá con npm start.");
        setTimeout(() => process.exit(1), 2000);
        return;
      }
      const codigo = lastDisconnect?.error?.output?.statusCode || "desconocido";
      const espera = intentosReconexion * 5000;
      const duro = horaConexion ? Math.round((Date.now() - horaConexion) / 1000) : "?";
      console.log(`⚠️ Conexión cerrada (código ${codigo}). Aguantó ${duro}s conectado. Reconectando en ${espera / 1000}s (intento ${intentosReconexion}/${MAX_REINTENTOS})...`);
      setTimeout(() => { reconectando = false; startBot(); }, espera);
    } else if (connection === "open") {
      horaConexion = Date.now();
      globalThis.botConectado = true;
      console.log("🟢 Conexión exitosa a WhatsApp");
      intentosReconexion = 0;
      reconectando = false;
      loadPlugins();
      resolverCanal();
      globalThis.horaConexion = horaConexion;
      // Aviso al owner: al arrancar el proceso, y cuando vuelve después de una caída larga.
      if (!globalThis.avisoArranqueEnviado) {
        globalThis.avisoArranqueEnviado = true;
        avisarOwner(`Arranqué (${globalThis.botVersion}, Node ${process.version}). Si no me reiniciaste vos, me reinicié sola.`, "arranque");
      } else if (globalThis.horaCaida && Date.now() - globalThis.horaCaida > 5 * 60 * 1000) {
        avisarOwner(`Volví después de ${Math.round((Date.now() - globalThis.horaCaida) / 60000)} min sin conexión.`, "reconexion");
      }
      globalThis.horaCaida = 0;
      // El watcher se registra una sola vez: en cada reconexión se volvía a registrar y cada cambio de plugin se recargaba varias veces.
      if (!globalThis.watchPluginsIniciado) {
        watchPlugins();
        globalThis.watchPluginsIniciado = true;
      }
    }
  });

  client.handler = handler.handleMessage.bind(globalThis.client);

  // Se procesan TODOS los mensajes del lote (Baileys puede entregar varios juntos), no solo el último.
  // Van en orden y de a uno para no mezclar el orden de las respuestas dentro de un mismo chat.
  client.ev.on("messages.upsert", async (chatUpdate) => {
    if (!client.handler) return;
    for (const m of chatUpdate.messages || []) {
      try {
        // Los avisos de grupo (alguien entró, lo hicieron admin, pidió unirse, etc.) vienen sin "message" pero con
        // messageStubType, y los necesitan _detect-events, la lista negra y el refresco de metadatos del grupo.
        if (!m?.message && !m?.messageStubType) continue;
        if (m.message && Object.keys(m.message)[0] === "ephemeralMessage") m.message = m.message.ephemeralMessage.message;
        if (m.key && m.key.remoteJid === "status@broadcast") continue;
        // "notify" = llegó en vivo; "append" = vino del historial. handle-message lo usa para ignorar comandos viejos.
        m._upsertType = chatUpdate.type;
        await client.handler(m, chatUpdate);
      } catch (e) {
        console.error(e);
      }
    }
  });

  // Cuando cambian los participantes o admins de un grupo, refrescamos la metadata guardada.
  // Sin esto, la lista de admins queda como estaba al conectar, y el bot no se entera de que
  // lo hicieron (o le sacaron) admin hasta el próximo reinicio.
  client.ev.on("group-participants.update", async ({ id, participants, action }) => {
    try {
      if (!id?.endsWith("@g.us")) return;
      // El que sale del grupo (o lo sacan) pierde el rol del bot que tenía ahí.
      if (action === "remove") limpiarRolesAlSalir(id, participants);
      // Al que entra se le mandan las reglas del grupo, si un admin las cargó con .reglas set.
      if (action === "add") {
        const aviso = avisoReglasParaNuevos(id, participants);
        if (aviso) await client.sendMessage(id, { text: aviso.texto, mentions: aviso.mentions }).catch((e) => console.error("[reglas] no se pudieron mandar:", e.message));
      }
      const metadata = await client.groupMetadata(id).catch(() => null);
      if (!metadata) return;
      client.chats[id] = { ...(client.chats[id] || {}), id, subject: metadata.subject, isChats: true, metadata };
    } catch (e) {
      console.error("[grupos] error refrescando metadata:", e);
    }
  });

  // Puntos por reacciones: suma "recibidas" a quien escribió el mensaje, "emitidas" a quien reacciona.
  client.ev.on("messages.reaction", (reactions) => {
    for (const { key, reaction } of reactions) {
      try {
        if (!key?.remoteJid?.endsWith("@g.us")) continue;
        if (!reaction?.text) continue;

        const autorLid = key.participant;
        const reactorLid = reaction.key?.participant;
        if (!autorLid || !reactorLid) continue;
        if (autorLid === reactorLid) continue;
        // Las reacciones del propio bot (🕐 en descargas, 🔥 de racha, 🪙 de la pregunta del día) no reparten coins ni ranking.
        if (reaction.key?.fromMe || reactorLid === client.user?.lid) continue;
        // Sacar y volver a poner la reacción (o cambiar el emoji) dispara el evento de nuevo: sin esto sumaba
        // ranking, UruCoins y votos de hashtags sin límite.
        if (!marcarReaccionContada(key.id, reactorLid)) continue;

        const mes = mesDe();
        sumarInteraccion(mes, key.remoteJid, autorLid, "recibidas");
        sumarInteraccion(mes, key.remoteJid, reactorLid, "emitidas");
        otorgarPorReaccion(key.remoteJid, autorLid, reactorLid, key.id);
      } catch (e) {
        console.error("[ranking] error procesando reacción:", e);
      }
    }
  });

  // Cuando cambia la configuración del grupo (abierto/cerrado, nombre, etc.), se descarta el caché de metadatos para
  // que se vuelva a leer fresco en el próximo mensaje. Los cambios de participantes los refresca el handler de arriba.
  client.ev.on("groups.update", (cambios) => {
    for (const cambio of cambios || []) {
      if (cambio?.id && client.chats?.[cambio.id]) delete client.chats[cambio.id].metadata;
    }
  });

  return client;
}

// Resuelve el ID interno del canal configurado en [canal] de config.toml a partir de su link de invitación.
// Se hace una sola vez por proceso; si falla, los archivos salen sin la etiqueta de canal.
async function resolverCanal() {
  const enlace = globalThis.canalConfig?.enlace;
  if (!enlace || globalThis.canal) return;
  const codigo = enlace.split("/channel/")[1]?.split(/[/?#]/)[0];
  if (!codigo) return console.error("[canal] el enlace del config no parece un link de canal (whatsapp.com/channel/...)");
  try {
    const meta = await client.newsletterMetadata("invite", codigo);
    if (!meta?.id) throw new Error("WhatsApp no devolvió el ID del canal");
    const nombreReal = meta.name || meta.thread_metadata?.name?.text || "";
    globalThis.canal = { jid: meta.id, nombre: globalThis.canalConfig.nombre || nombreReal };
    console.log(`📣 Canal para la etiqueta de los archivos: ${globalThis.canal.nombre} (${meta.id})`);
  } catch (e) {
    console.error("[canal] no se pudo resolver el link del canal:", e.message);
  }
}

globalThis.db = loadDatabase();

// Carpeta temporal para descargas, stickers y canvas (está en .gitignore, así que en un clon nuevo no existe).
mkdirSync("./tmp", { recursive: true });

// Red de contención: una promesa rechazada sin manejar (por ejemplo un envío que falla con la conexión caída
// dentro de un setTimeout) no debe tumbar el proceso entero.
process.on("unhandledRejection", (error) => {
  console.error("[unhandledRejection]", error);
});

// Pendientes (reintentos de descargas): revisa cada un minuto si hay algo que ejecutar.
iniciarPendientes();
iniciarTareasProgramadas();

await installYtDlp();

function clearTmp() {
  const tmpDir = "./tmp";
  let borrados = 0;
  try {
    const filenames = readdirSync(tmpDir);
    filenames.forEach((file) => {
      try {
        rmSync(`${tmpDir}/${file}`, { recursive: true, force: true });
        borrados++;
      } catch (e) {}
    });
  } catch (e) {}
  return borrados;
}
setInterval(() => {
  if (!globalThis.client || !globalThis.client.user) return;
  const borrados = clearTmp();
  if (borrados > 0) console.log(txt?.clearTmp || "🧹 Carpeta tmp limpia.");
}, 1000 * 60 * 30);

startBot();
