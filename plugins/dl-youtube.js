// Probado en Linux, Windows, y Termux Android. Usa cookies.txt (cuenta real de YouTube) para
// evitar los bloqueos anti-bot. Si YouTube falla en todos los candidatos, cae a SoundCloud
// como segunda fuente antes de rendirse. Si aun así falla, la persona puede pedir un reintento
// con .reintentar (o pidiéndoselo a Claudia), y el bot lo vuelve a probar solo más tarde.
import { exec, execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync, promises } from "fs";
import { updateUser } from "../database-functions.js";
import { encolarDescarga } from "../lib/cola-descargas.js";
import { gastarCoins, getSaldoCoins } from "../database-functions.js";
import { COINS } from "../lib/urucoins.js";
import { registrarFalloDescarga } from "../lib/pendientes.js";
import { RUTA_YT_DLP } from "../load-functions.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const ytDlpPath = path.resolve(RUTA_YT_DLP);
const cookiesPath = path.resolve("cookies.txt");
const cookiesArgs = existsSync(cookiesPath) ? ["--cookies", cookiesPath] : [];
const cookiesFlagStr = existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : "";

const plugin = {};
plugin.cmd = ["play", "audio", "video", "vídeo", "playya", "videoya"];
plugin.botAdmin = true;

plugin.run = async (m, { client, args, text, isOwner, command, user }) => {
  // .playya / .videoya: igual que .play / .video, pero si hay espera la salta pagando UruCoins.
  const saltarCooldown = /ya$/i.test(command);
  const cmdBase = command.toLowerCase().replace(/ya$/, "");

  // Sin título no hay nada que bajar: se chequea antes de cobrar UruCoins o de contar el intento como spam.
  if (!text) return client.sendText(m.chat, txt.ingresarTitulo, m);

  const waitTime = m.isGroup ? 60000 : 210000;
  const time = user.lastmining + waitTime;
  const remainingTime = Math.ceil((time - new Date()) / 1000);
  const minutes = Math.floor(remainingTime / 60);
  const seconds = remainingTime % 60;
  const formattedTime = minutes > 0 ? `${minutes} min ${seconds} segundos` : `${seconds} segundos`;

  if (Date.now() - user.lastmining < waitTime && !isOwner) {
    if (saltarCooldown) {
      if (!gastarCoins(m.chat, m.sender, COINS.SALTAR_COOLDOWN, "saltar_cooldown")) {
        return client.sendText(m.chat, `Saltar la espera cuesta *${COINS.SALTAR_COOLDOWN} UruCoins* y tenés ${getSaldoCoins(m.chat, m.sender)}. Esperá ${formattedTime} o juntá más.`, m);
      }
      // pagó: sigue como si no hubiera espera
    } else {
      updateUser(m.sender, { commandAttempts: user.commandAttempts + 1 });
      const newAttempts = user.commandAttempts + 1;
      if (newAttempts > 4) {
        updateUser(m.sender, { banned: true });
        return client.sendText(m.chat, txt.banSpam, m);
      }
      return client.sendText(m.chat, `${txt.advSpam(formattedTime, newAttempts)}\n\n🪙 O saltá la espera por ${COINS.SALTAR_COOLDOWN} UruCoins con .${cmdBase}ya`, m);
    }
  }

  updateUser(m.sender, { lastmining: Date.now(), commandAttempts: 0 });
  m.react("🕐");

  const adelante = encolarDescarga(() =>
    descargarMultimedia({
      client,
      chat: m.chat,
      usuario: m.sender,
      texto: args.join(" "),
      tipo: cmdBase === "play" || cmdBase === "audio" ? "audio" : "video",
      quoted: m,
      isOwner,
      esReintento: false,
    }),
  );

  if (adelante > 0) {
    await client.sendText(m.chat, `⏳ Tu descarga está en la cola. Hay ${adelante} antes que la tuya, ya te la mando bo.`, m);
  }
};

export default plugin;

// La descarga en sí, separada del comando para poder llamarla también desde los reintentos.
// quoted: el mensaje original (para responderle y reaccionar) o null si es un reintento automático.
export async function descargarMultimedia({ client, chat, usuario, texto, tipo, quoted = null, isOwner = false, esReintento = false }) {
  const isAudio = tipo === "audio";
  const prohibido = ["anuel"];
  const reaccionar = (emoji) => quoted?.react?.(emoji);
  const opcionesEnvio = quoted ? { quoted } : {};

  const intentarCandidato = async (candidato) => {
    try {
      const format = isAudio ? "bestaudio/18/best" : "worst/18";
      const postProcess = isAudio ? "--extract-audio --audio-format m4a" : "";
      const messageType = isAudio ? "audio" : "video";
      const mimeType = isAudio ? "audio/mp4" : undefined;
      const randomFileName = Math.random().toString(36).substring(2, 15);
      const outputTemplate = path.join("./tmp", `${randomFileName}.%(ext)s`);

      const commandStr = `${ytDlpPath} -f "${format}" ${postProcess} ${cookiesFlagStr} --no-warnings -o "${outputTemplate}" "${candidato.url}"`;
      // Con timeout: una descarga colgada bloqueaba la cola entera hasta reiniciar el bot.
      const { stderr } = await execAsync(commandStr, { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }).catch((error) => ({
        stdout: error.stdout || "",
        stderr: error.stderr || error.message || "",
      }));

      const lower = stderr.toLowerCase();
      const esWarning = lower.includes("warning:") || lower.includes("sabr streaming") || lower.includes("some_web_safaris");
      if (!esWarning && stderr) {
        console.error(`[dl-youtube] falló "${candidato.title}" (${candidato.fuente}): ${stderr}`);
        return false;
      }

      const tmpFiles = await promises.readdir("./tmp");
      const foundFile = tmpFiles.find((f) => f.startsWith(randomFileName));

      if (!foundFile) {
        console.error(`[dl-youtube] archivo de "${candidato.title}" (${candidato.fuente}) no se encontró tras descargar.`);
        return false;
      }

      const finalPath = path.join("./tmp", foundFile);

      const mediaBuffer = await promises.readFile(finalPath);
      await client.sendMessage(chat, { [messageType]: mediaBuffer, mimetype: mimeType }, opcionesEnvio);
      await promises.unlink(finalPath).catch(() => {});
      await client.sendText(chat, `✅ Ahí tenés, bo. *${candidato.title}*`, quoted);
      return true;
    } catch (error) {
      console.error(`[dl-youtube] excepción con "${candidato.title}" (${candidato.fuente}): ${error.message}`);
      return false;
    }
  };

  const probarLista = async (candidatos, miniaturaEnviadaRef) => {
    for (const candidato of candidatos) {
      if (typeof candidato.title !== "string") continue;
      if (prohibido.some((palabra) => candidato.title.toLowerCase().includes(palabra.toLowerCase())) && !isOwner) {
        reaccionar("🟠");
        continue;
      }

      if (!miniaturaEnviadaRef.enviada) {
        // Aviso de "enviando" citando el pedido (antes citaba un contacto falso que se veía como "WhatsApp · Status").
        // En los reintentos automáticos no hay pedido que citar y va sin cita.
        const aviso = txt.sendPreview(isAudio, candidato.title);
        if (candidato.thumbnail) {
          await client.sendFile(chat, candidato.thumbnail, null, aviso, quoted).catch(() => client.sendText(chat, aviso, quoted));
        } else {
          await client.sendText(chat, aviso, quoted);
        }
        miniaturaEnviadaRef.enviada = true;
      }

      const exito = await intentarCandidato(candidato);
      if (exito) return true;
    }
    return false;
  };

  // Al fallar: guarda el fallo para poder reintentarlo y avisa cómo pedirlo (solo la primera vez).
  const fallar = async (mensaje) => {
    reaccionar("❌");
    if (esReintento) {
      await client.sendText(chat, `${mensaje}\n\nEse fue el reintento; si querés, más tarde pedila de nuevo con .${isAudio ? "play" : "video"}.`, quoted);
      return;
    }
    registrarFalloDescarga(chat, usuario, texto, tipo);
    await client.sendText(chat, `${mensaje}\n\n🔁 Si querés, mandá .reintentar y la vuelvo a probar sola en media hora.`, quoted);
  };

  try {
    const candidatosYoutube = await buscarYoutube(texto);
    if (!candidatosYoutube || candidatosYoutube.length === 0) {
      await client.sendText(chat, "❌ No encontré resultados para eso en YouTube. Probá con otro título.", quoted);
      reaccionar("❌");
      return false;
    }

    const referencia = candidatosYoutube[0];
    const UMBRAL_SIMILITUD = 0.45;
    const filtrados = candidatosYoutube.filter((c, i) => i === 0 || (typeof c.title === "string" && similitudTitulos(referencia.title, c.title) >= UMBRAL_SIMILITUD));

    const miniaturaRef = { enviada: false };

    if (await probarLista(filtrados, miniaturaRef)) return true;

    const candidatosSoundcloud = await buscarSoundcloud(texto);
    const filtradosSC = candidatosSoundcloud.filter((c) => typeof c.title === "string" && similitudTitulos(referencia.title, c.title) >= UMBRAL_SIMILITUD);

    if (filtradosSC.length > 0 && (await probarLista(filtradosSC, miniaturaRef))) return true;

    await fallar("❌ Probé varias opciones en YouTube y SoundCloud y ninguna se pudo descargar. Probá con otro título o de nuevo más tarde.");
    return false;
  } catch (error) {
    console.log(`Error en plugin de youtube:`, error.message);
    await fallar("❌ Ocurrió un error interno al procesar el pedido. Probá de nuevo más tarde.");
    return false;
  }
}

async function buscarYoutube(query) {
  try {
    const { stdout } = await execFileAsync(ytDlpPath, [`ytsearch3:${query}`, ...cookiesArgs, "--print", "%(title)s", "--print", "%(webpage_url)s", "--print", "%(thumbnail)s", "--print", "%(id)s", "--skip-download", "--no-warnings"], { timeout: 60 * 1000 });
    return parsearResultados(stdout, "youtube");
  } catch (error) {
    console.error(`[dl-youtube] búsqueda en YouTube falló: ${error.message}`);
    return [];
  }
}

async function buscarSoundcloud(query) {
  try {
    const { stdout } = await execFileAsync(ytDlpPath, [`scsearch5:${query}`, "--print", "%(title)s", "--print", "%(webpage_url)s", "--print", "%(thumbnail)s", "--print", "%(id)s", "--skip-download", "--no-warnings"], { timeout: 60 * 1000 });
    return parsearResultados(stdout, "soundcloud");
  } catch (error) {
    console.error(`[dl-youtube] búsqueda en SoundCloud falló: ${error.message}`);
    return [];
  }
}

function parsearResultados(stdout, fuente) {
  const lineas = stdout.trim().split("\n").filter(Boolean);
  const resultados = [];
  for (let i = 0; i < lineas.length; i += 4) {
    const title = lineas[i];
    const url = lineas[i + 1];
    let thumbnail = lineas[i + 2] || "";
    const id = lineas[i + 3] || "";
    // YouTube suele devolver la miniatura en .webp, y sendFile manda cualquier .webp como sticker (y pierde el texto).
    // La versión .jpg de la miniatura siempre existe a partir del ID del video.
    if (fuente === "youtube" && /^[\w-]{11}$/.test(id)) thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    else if (/\.webp(\?|$)/i.test(thumbnail)) thumbnail = "";
    if (title && url) resultados.push({ title, url, thumbnail, fuente });
  }
  return resultados;
}

function normalizarTitulo(titulo) {
  return titulo
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/official( music)? video|official audio|lyrics?|letra|video oficial|audio oficial|hd|4k|ft\.?|feat\.?/gi, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function similitudTitulos(tituloA, tituloB) {
  const palabrasA = new Set(normalizarTitulo(tituloA));
  const palabrasB = new Set(normalizarTitulo(tituloB));
  if (palabrasA.size === 0 || palabrasB.size === 0) return 0;
  const interseccion = [...palabrasA].filter((p) => palabrasB.has(p)).length;
  const union = new Set([...palabrasA, ...palabrasB]).size;
  return interseccion / union;
}
