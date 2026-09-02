import "./globals.js";
const { DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = await import(baileys);
import { readdirSync, rmSync } from "fs";
import { makeWASocket, protoType, serialize } from "./lib/wa-socket.js";
import pino from "pino";
import { installYtDlp, loadPlugins, watchPlugins } from "./load-functions.js";
import { loadDatabase, getChat, getBotSettings, isBlacklisted, sumarInteraccion } from "./database-functions.js";
import { otorgarPorReaccion } from "./lib/urucoins.js";
import qrcode from "qrcode-terminal";
let handler = await import("./handle-message.js");

protoType();
serialize();

let intentosReconexion = 0;
const MAX_REINTENTOS = 5;
let reconectando = false;
let horaConexion = 0;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(authFile);

  let { version, isLatest } = await fetchLatestBaileysVersion();
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

  global.client = makeWASocket(connectionOptions);

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
      console.log("🟢 Conexión exitosa a WhatsApp");
      intentosReconexion = 0;
      reconectando = false;
      loadPlugins();
      watchPlugins();
    }
  });

  client.handler = handler.handleMessage.bind(global.client);

  client.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      let m = chatUpdate.messages[chatUpdate.messages.length - 1];
      if (!m.message) return;
      m.message = Object.keys(m.message)[0] === "ephemeralMessage" ? m.message.ephemeralMessage.message : m.message;
      if (m.key && m.key.remoteJid === "status@broadcast") return;
      if (!client.handler) return;
      await client.handler(m, chatUpdate);
    } catch (e) {
      console.error(e);
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

        const mes = new Date().toISOString().slice(0, 7);
        sumarInteraccion(mes, key.remoteJid, autorLid, "recibidas");
        sumarInteraccion(mes, key.remoteJid, reactorLid, "emitidas");
        otorgarPorReaccion(key.remoteJid, autorLid, reactorLid, key.id);
      } catch (e) {
        console.error("[ranking] error procesando reacción:", e);
      }
    }
  });

  return client;
}

global.db = loadDatabase();

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
  if (!global.client || !global.client.user) return;
  const borrados = clearTmp();
  if (borrados > 0) console.log(txt?.clearTmp || "🧹 Carpeta tmp limpia.");
}, 1000 * 60 * 30);

startBot();
