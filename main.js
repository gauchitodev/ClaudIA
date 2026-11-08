import "./globals.js";
import { DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { configuracion } from "./lib/configuracion.js";
import { rmSync, mkdirSync } from "fs";
import { makeWASocket, serialize } from "./lib/wa-socket.js";
import pino from "pino";
import { installYtDlp, loadPlugins, watchPlugins } from "./load-functions.js";
import { loadDatabase } from "./database-functions.js";
import { contarReaccion } from "./lib/reacciones.js";
import { iniciarPendientes } from "./lib/pendientes.js";
import { iniciarTareasProgramadas } from "./lib/tareas-programadas.js";
import { avisarOwner } from "./lib/avisos.js";
import { limpiarTmp } from "./lib/limpieza-tmp.js";
import { instalarDevolucionAlCerrar } from "./lib/cierre.js";
import { metadataDe, aplicarCambioDeGrupo, aplicarCambioDeChat, vaciar } from "./lib/cache-grupos.js";
import { procesarTanda } from "./lib/tandas.js";
import { confirmarOwnersCadaTanto } from "./lib/identidad.js";
import { alCambiarParticipantes } from "./lib/participantes.js";
import { recuperarMemoria } from "./lib/relevo-memoria.js";
import qrcode from "qrcode-terminal";
import txt from "./lib/strings.js";
import { conexion } from "./lib/conexion.js";
const handler = await import("./handle-message.js");

serialize();

// The folder WhatsApp's session is kept in, so that the bot doesn't pair again on each start (README); deleted when the
// session is closed from the phone. It was a global (authFile) that only this file read.
const CARPETA_DE_SESION = "botSession";

let intentosReconexion = 0;
const MAX_REINTENTOS = 5;
let reconectando = false;
let yaConectoAlgunaVez = false;
// Once per process, however many times a reconnect runs startBot again: the owner's startup notice, and the plugins'
// watcher. They were globals: main.js runs once per process (start-process.js forks it), so its own variables last
// as long.
let avisoArranqueEnviado = false;
let watchPluginsIniciado = false;
let horaConexion = 0;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(CARPETA_DE_SESION);

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
    // No link previews, so no generateHighQualityLinkPreview either: Baileys builds them with link-preview-js, left out
    // on purpose, since with it the tablet would fetch every link the bot sends, outside lib/descarga-segura.js.
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    getMessage: () => null,
    // Without this, Baileys asks WhatsApp for the group's participant list on EVERY message the bot sends there,
    // which is how accounts get rate-limited. See lib/cache-grupos.js. It runs on the send path, so it never
    // throws: if the cache can't answer, Baileys asks on its own, exactly like it did before.
    cachedGroupMetadata: (jid) => metadataDe(conexion.client, jid),
  };

  conexion.client = makeWASocket(connectionOptions);

  conexion.client.ev.on("creds.update", saveCreds);

  if (!conexion.client.authState.creds.registered && configuracion.numberBot) {
    setTimeout(async () => {
      try {
        let pairingCode = await conexion.client.requestPairingCode(configuracion.numberBot);
        pairingCode = pairingCode?.match(/.{1,4}/g)?.join("-");
        console.log(`\n🔑 CÓDIGO DE VINCULACIÓN: ${pairingCode}\n`);
      } catch (e) {
        console.log("⚠️ No se pudo generar el código (error de conexión o reintento necesario).", e?.message || e);
      }
    }, 3000);
  }

  conexion.client.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (connection === "close") {
      conexion.botConectado = false;
      if (!conexion.horaCaida) conexion.horaCaida = Date.now();
    }

    if (!configuracion.numberBot && qr) {
      qrcode.generate(qr, { small: true });
      console.log("📌 Escaneá este QR antes de que cambie: el primero dura un minuto y los siguientes, 20 segundos.");
    }

    if (connection === "close" && lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
      console.log('❌ La sesión fue cerrada desde WhatsApp. Se borrarán las credenciales.');
      rmSync(`./${CARPETA_DE_SESION}`, { recursive: true, force: true });
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
      conexion.botConectado = true;
      console.log("🟢 Conexión exitosa a WhatsApp");
      intentosReconexion = 0;
      reconectando = false;
      resolverCanal();
      // Who the owners are by LID, as WhatsApp says (lib/identidad.js), and again every so often.
      confirmarOwnersCadaTanto();
      conexion.horaConexion = horaConexion;
      // Coming back from a disconnection, the cached group metadata is dropped: promotes, joins and leaves that
      // happened while the bot was down never arrived as events, so the admin lists can't be trusted any more. The
      // last copy of each group stays, for who is who alone (ultimaCopia, lib/cache-grupos.js). On the first
      // connection there is nothing to drop.
      if (yaConectoAlgunaVez) vaciar();
      yaConectoAlgunaVez = true;
      // Notify the owner: on process start, and when coming back from a long outage.
      if (!avisoArranqueEnviado) {
        avisoArranqueEnviado = true;
        avisarOwner(`Arranqué (${configuracion.botVersion}, Node ${process.version}). Si no me reiniciaste vos, me reinicié sola.`, "arranque");
      } else if (conexion.horaCaida && Date.now() - conexion.horaCaida > 5 * 60 * 1000) {
        avisarOwner(`Volví después de ${Math.round((Date.now() - conexion.horaCaida) / 60000)} min sin conexión.`, "reconexion");
      }
      conexion.horaCaida = 0;
      // The watcher is registered once: it used to re-register on every reconnect,
      // so each plugin change reloaded several times.
      if (!watchPluginsIniciado) {
        watchPlugins();
        watchPluginsIniciado = true;
      }
    }
  });

  conexion.client.handler = handler.handleMessage.bind(conexion.client);

  // ALL messages in the batch are processed (Baileys may deliver several at once), not just the last one: in order
  // within each chat, so replies there don't get interleaved, and the chats side by side (lib/tandas.js).
  conexion.client.ev.on("messages.upsert", async (chatUpdate) => {
    if (!conexion.client.handler) return;
    // When the batch arrived: handle-message measures each message's age against this, not against the moment it
    // gets to it, which in a busy batch can be much later (see atrasoDeLlegada in lib/tiempo.js).
    const llegada = Date.now();
    await procesarTanda(chatUpdate.messages, async (m) => {
      // Group notices (someone joined, was promoted, requested to join, etc.) arrive without "message" but with
      // messageStubType, and _detect-events, the blacklist and the group metadata refresh all need them.
      if (!m?.message && !m?.messageStubType) return;
      if (m.message && Object.keys(m.message)[0] === "ephemeralMessage") m.message = m.message.ephemeralMessage.message;
      if (m.key && m.key.remoteJid === "status@broadcast") return;
      // "notify" = arrived live; "append" = came from history. handle-message uses it to ignore stale commands.
      m._upsertType = chatUpdate.type;
      m._llegada = llegada;
      await conexion.client.handler(m, chatUpdate);
    });
  });

  // Someone came into a group, left it, or was promoted or demoted: the group's metadata is asked for again, and what
  // changes for the bot (roles, posts, .inactivos, the blacklist, the rules) is in lib/participantes.js.
  conexion.client.ev.on("group-participants.update", (evento) => alCambiarParticipantes(conexion.client, evento));

  // Reaction points: "received" for whoever wrote the message, "given" for whoever reacted (lib/reacciones.js).
  conexion.client.ev.on("messages.reaction", (reactions) => {
    for (const r of reactions) {
      try {
        contarReaccion(conexion.client, r);
      } catch (e) {
        console.error("[ranking] error procesando reacción:", e);
      }
    }
  });

  // Whole metadata is kept, a settings change invalidates: see aplicarCambioDeGrupo in lib/cache-grupos.js.
  // Participant changes are refreshed by lib/participantes.js.
  conexion.client.ev.on("groups.update", (cambios) => {
    for (const cambio of cambios || []) aplicarCambioDeGrupo(conexion.client, cambio);
  });

  // Disappearing messages turned on or off in a group arrive here, not as a group event: see aplicarCambioDeChat.
  conexion.client.ev.on("chats.update", (cambios) => {
    for (const cambio of cambios || []) aplicarCambioDeChat(conexion.client, cambio);
  });

  return conexion.client;
}

// Resolves the internal ID of the channel configured under [canal] in config.toml from its invite link.
// Done once per process; if it fails, files go out without the channel tag.
async function resolverCanal() {
  const enlace = configuracion.canalConfig?.enlace;
  if (!enlace || conexion.canal) return;
  const codigo = enlace.split("/channel/")[1]?.split(/[/?#]/)[0];
  if (!codigo) return console.error("[canal] el enlace del config no parece un link de canal (whatsapp.com/channel/...)");
  try {
    const meta = await conexion.client.newsletterMetadata("invite", codigo);
    if (!meta?.id) throw new Error("WhatsApp no devolvió el ID del canal");
    const nombreReal = meta.name || meta.thread_metadata?.name?.text || "";
    conexion.canal = { jid: meta.id, nombre: configuracion.canalConfig.nombre || nombreReal };
    console.log(`📣 Canal para la etiqueta de los archivos: ${conexion.canal.nombre} (${meta.id})`);
  } catch (e) {
    console.error("[canal] no se pudo resolver el link del canal:", e.message);
  }
}

// Claudia's short-term memory, back from start-process.js's copy when this is a restart (lib/relevo-memoria.js). Before
// anything that writes to it: the database, the timers, the plugins and the connection.
const memoria = await recuperarMemoria();
if (memoria.restaurada) console.log(`🧠 Memoria de los chats recuperada: ${memoria.mensajes} mensajes.`);

// database-functions.js keeps the connection, and whatever else needs it imports it from there.
loadDatabase();

// Temp folder for downloads, stickers and canvas (it's in .gitignore, so a fresh clone won't have it).
mkdirSync("./tmp", { recursive: true });

// Safety net: an unhandled promise rejection (say, a send that fails with the connection down inside a
// setTimeout) must not take the whole process down.
process.on("unhandledRejection", (error) => {
  console.error("[unhandledRejection]", error);
});

// On the way out (a restart to update, Ctrl+C, a crash), whatever is at stake in the casino's games goes back to its
// owners: those games live in memory, and a restart used to swallow the coins. See lib/cierre.js.
instalarDevolucionAlCerrar();

// Pending items (download retries): checks every minute whether there's anything to run.
iniciarPendientes();
iniciarTareasProgramadas();

await installYtDlp();

setInterval(() => {
  if (!conexion.client || !conexion.client.user) return;
  const borrados = limpiarTmp();
  if (borrados > 0) console.log(txt?.clearTmp || "🧹 Carpeta tmp limpia.");
}, 1000 * 60 * 30);

// Plugins are loaded once, before connecting. Loading them when the connection opened left a window with no plugins
// loaded yet, and a command arriving right then matched none; on top of that they were re-imported on every reconnect.
// Hot changes are still picked up by watchPlugins().
await loadPlugins();

startBot();
