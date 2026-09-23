import "./globals.js";
const { DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = await import(baileys);
import { rmSync, mkdirSync } from "fs";
import { makeWASocket, serialize } from "./lib/wa-socket.js";
import pino from "pino";
import { installYtDlp, loadPlugins, watchPlugins } from "./load-functions.js";
import { loadDatabase, sumarInteraccion } from "./database-functions.js";
import { mesDe } from "./lib/hashtags.js";
import { otorgarPorReaccion } from "./lib/urucoins.js";
import { iniciarPendientes } from "./lib/pendientes.js";
import { iniciarTareasProgramadas } from "./lib/tareas-programadas.js";
import { avisarOwner } from "./lib/avisos.js";
import { limpiarTmp } from "./lib/limpieza-tmp.js";
import { limpiarRolesAlSalir } from "./lib/roles.js";
import { recibirNuevos } from "./lib/bienvenida.js";
import { instalarDevolucionAlCerrar } from "./lib/cierre.js";
import { metadataDe, aplicarCambioDeGrupo, aplicarCambioDeChat, vaciar } from "./lib/cache-grupos.js";
import qrcode from "qrcode-terminal";
const handler = await import("./handle-message.js");

serialize();

let intentosReconexion = 0;
const MAX_REINTENTOS = 5;
let reconectando = false;
let yaConectoAlgunaVez = false;
let horaConexion = 0;

// Reactions already counted (message + who reacted), in RAM and capped, so the same one is never counted twice.
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
    // Without this, Baileys asks WhatsApp for the group's participant list on EVERY message the bot sends there,
    // which is how accounts get rate-limited. See lib/cache-grupos.js. It runs on the send path, so it never
    // throws: if the cache can't answer, Baileys asks on its own, exactly like it did before.
    cachedGroupMetadata: (jid) => metadataDe(globalThis.client, jid),
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
      resolverCanal();
      globalThis.horaConexion = horaConexion;
      // Coming back from a disconnection, the cached group metadata is dropped: promotes, joins and leaves that
      // happened while the bot was down never arrived as events, so the admin lists can't be trusted any more.
      // On the first connection there is nothing to drop.
      if (yaConectoAlgunaVez) vaciar();
      yaConectoAlgunaVez = true;
      // Notify the owner: on process start, and when coming back from a long outage.
      if (!globalThis.avisoArranqueEnviado) {
        globalThis.avisoArranqueEnviado = true;
        avisarOwner(`Arranqué (${globalThis.botVersion}, Node ${process.version}). Si no me reiniciaste vos, me reinicié sola.`, "arranque");
      } else if (globalThis.horaCaida && Date.now() - globalThis.horaCaida > 5 * 60 * 1000) {
        avisarOwner(`Volví después de ${Math.round((Date.now() - globalThis.horaCaida) / 60000)} min sin conexión.`, "reconexion");
      }
      globalThis.horaCaida = 0;
      // The watcher is registered once: it used to re-register on every reconnect, so each plugin change reloaded several times.
      if (!globalThis.watchPluginsIniciado) {
        watchPlugins();
        globalThis.watchPluginsIniciado = true;
      }
    }
  });

  client.handler = handler.handleMessage.bind(globalThis.client);

  // ALL messages in the batch are processed (Baileys may deliver several at once), not just the last one.
  // They go in order and one at a time, so replies within a chat don't get interleaved.
  client.ev.on("messages.upsert", async (chatUpdate) => {
    if (!client.handler) return;
    // When the batch arrived: handle-message measures each message's age against this, not against the moment it
    // gets to it, which in a busy batch can be much later (see atrasoDeLlegada in lib/tiempo.js).
    const llegada = Date.now();
    for (const m of chatUpdate.messages || []) {
      try {
        // Group notices (someone joined, was promoted, requested to join, etc.) arrive without "message" but with
        // messageStubType, and _detect-events, the blacklist and the group metadata refresh all need them.
        if (!m?.message && !m?.messageStubType) continue;
        if (m.message && Object.keys(m.message)[0] === "ephemeralMessage") m.message = m.message.ephemeralMessage.message;
        if (m.key && m.key.remoteJid === "status@broadcast") continue;
        // "notify" = arrived live; "append" = came from history. handle-message uses it to ignore stale commands.
        m._upsertType = chatUpdate.type;
        m._llegada = llegada;
        await client.handler(m, chatUpdate);
      } catch (e) {
        console.error(e);
      }
    }
  });

  // When a group's participants or admins change, the stored metadata is refreshed.
  // Without this the admin list stays as it was on connect, and the bot doesn't find out it was
  // given (or stripped of) admin until the next restart.
  client.ev.on("group-participants.update", async ({ id, participants, action }) => {
    try {
      if (!id?.endsWith("@g.us")) return;
      // Whoever leaves the group (or is removed) loses the bot role they had there.
      if (action === "remove") limpiarRolesAlSalir(id, participants);

      // Metadata is refreshed first: the blacklist needs to know which id the group lists each person under.
      // If it couldn't be fetched, carry on anyway: the group rules still get sent. The same join also reaches
      // processMessageStubType, and the cache collapses both into a single query.
      const metadata = await metadataDe(client, id, { fresca: true });

      // Whoever joins: the blacklisted are removed on the spot, everyone else gets the group rules.
      if (action === "add") await recibirNuevos(client, id, participants, metadata);
    } catch (e) {
      console.error("[grupos] error refrescando metadata:", e);
    }
  });

  // Reaction points: adds "received" to whoever wrote the message, "given" to whoever reacted.
  client.ev.on("messages.reaction", (reactions) => {
    for (const { key, reaction } of reactions) {
      try {
        if (!key?.remoteJid?.endsWith("@g.us")) continue;
        if (!reaction?.text) continue;

        const autorLid = key.participant;
        const reactorLid = reaction.key?.participant;
        if (!autorLid || !reactorLid) continue;
        if (autorLid === reactorLid) continue;
        // The bot's own reactions (🕐 on downloads, 🔥 for streaks, 🪙 for the daily question) hand out no coins or ranking.
        if (reaction.key?.fromMe || reactorLid === client.user?.lid) continue;
        // Removing and re-adding a reaction (or changing the emoji) fires the event again: without this it piled up
        // ranking, UruCoins and hashtag votes without limit.
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

  // Whole metadata is kept, a settings change invalidates: see aplicarCambioDeGrupo in lib/cache-grupos.js.
  // Participant changes are refreshed by the handler above.
  client.ev.on("groups.update", (cambios) => {
    for (const cambio of cambios || []) aplicarCambioDeGrupo(client, cambio);
  });

  // Disappearing messages turned on or off in a group arrive here, not as a group event: see aplicarCambioDeChat.
  client.ev.on("chats.update", (cambios) => {
    for (const cambio of cambios || []) aplicarCambioDeChat(client, cambio);
  });

  return client;
}

// Resolves the internal ID of the channel configured under [canal] in config.toml from its invite link.
// Done once per process; if it fails, files go out without the channel tag.
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
  if (!globalThis.client || !globalThis.client.user) return;
  const borrados = limpiarTmp();
  if (borrados > 0) console.log(txt?.clearTmp || "🧹 Carpeta tmp limpia.");
}, 1000 * 60 * 30);

// Plugins are loaded once, before connecting. Loading them when the connection opened left a window where
// globalThis.plugins was empty and a command arriving right then matched no plugin; on top of that they were
// re-imported on every reconnect. Hot changes are still picked up by watchPlugins().
await loadPlugins();

startBot();
