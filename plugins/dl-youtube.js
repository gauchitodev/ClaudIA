// Probado en Linux, Windows, y Termux Android. Usa cookies.txt (cuenta real de YouTube) para
// evitar los bloqueos anti-bot. Si YouTube falla en todos los candidatos, cae a SoundCloud
// como segunda fuente antes de rendirse.
import { exec, execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { existsSync, promises } from "fs";
import { updateUser } from "../database-functions.js";
import { encolarDescarga } from "../lib/cola-descargas.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const ytDlpPath = path.resolve("node_modules", "gs", "ygs");
const cookiesPath = path.resolve("cookies.txt");
const cookiesArgs = existsSync(cookiesPath) ? ["--cookies", cookiesPath] : [];
const cookiesFlagStr = existsSync(cookiesPath) ? `--cookies "${cookiesPath}"` : "";

let plugin = {};
plugin.cmd = ["play", "audio", "video", "video"];
plugin.botAdmin = true;

plugin.run = async (m, { client, args, text, isOwner, command, user }) => {
  const waitTime = m.isGroup ? 60000 : 210000;
  let time = user.lastmining + waitTime;
  let remainingTime = Math.ceil((time - new Date()) / 1000);

  if (new Date() - user.lastmining < waitTime && !isOwner) {
    updateUser(m.sender, { commandAttempts: user.commandAttempts + 1 });
    const newAttempts = user.commandAttempts + 1;
    if (newAttempts > 4) {
      updateUser(m.sender, { banned: true });
      return client.sendText(m.chat, txt.banSpam, m);
    }
    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    const formattedTime = minutes > 0 ? `${minutes} min ${seconds} segundos` : `${seconds} segundos`;
    return client.sendText(m.chat, txt.advSpam(formattedTime, newAttempts), m);
  }

  if (!text) return client.sendText(m.chat, txt.ingresarTitulo, m);

  updateUser(m.sender, { lastmining: new Date() * 1, commandAttempts: 0 });
  m.react("🕐");

  const adelante = encolarDescarga(async () => {
    const isAudio = command.toLowerCase() === "play" || command.toLowerCase() === "audio";
    const prohibido = ["anuel"];

    const intentarCandidato = async (candidato) => {
      try {
        const format = isAudio ? "bestaudio/18/best" : "worst/18";
        const postProcess = isAudio ? "--extract-audio --audio-format m4a" : "";
        const messageType = isAudio ? "audio" : "video";
        const mimeType = isAudio ? "audio/mp4" : undefined;
        const randomFileName = Math.random().toString(36).substring(2, 15);
        const outputTemplate = path.join("./tmp", `${randomFileName}.%(ext)s`);

        const commandStr = `${ytDlpPath} -f "${format}" ${postProcess} ${cookiesFlagStr} --no-warnings -o "${outputTemplate}" ${candidato.url}`;
        const { stdout, stderr } = await execAsync(commandStr).catch((error) => ({
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
        await client.sendMessage(m.chat, { [messageType]: mediaBuffer, mimetype: mimeType }, { quoted: m });
        await promises.unlink(finalPath).catch(() => {});
        await client.sendText(m.chat, `✅ Ahí tenés, bo. *${candidato.title}*`, m);
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
          m.react("🟠");
          continue;
        }

        if (!miniaturaEnviadaRef.enviada && candidato.thumbnail) {
          await client.sendFile(m.chat, candidato.thumbnail, null, txt.sendPreview(isAudio, candidato.title), fkontak);
          miniaturaEnviadaRef.enviada = true;
        }

        const exito = await intentarCandidato(candidato);
        if (exito) return true;
      }
      return false;
    };

    try {
      const candidatosYoutube = await buscarYoutube(args.join(" "));
      if (!candidatosYoutube || candidatosYoutube.length === 0) {
        await client.sendText(m.chat, "❌ No encontré resultados para eso en YouTube. Probá con otro título.", m);
        m.react("❌");
        return;
      }

      const referencia = candidatosYoutube[0];
      const UMBRAL_SIMILITUD = 0.45;
      const filtrados = candidatosYoutube.filter((c, i) => i === 0 || (typeof c.title === "string" && similitudTitulos(referencia.title, c.title) >= UMBRAL_SIMILITUD));

      const miniaturaRef = { enviada: false };

      if (await probarLista(filtrados, miniaturaRef)) return;

      const candidatosSoundcloud = await buscarSoundcloud(args.join(" "));
      const filtradosSC = candidatosSoundcloud.filter((c) => typeof c.title === "string" && similitudTitulos(referencia.title, c.title) >= UMBRAL_SIMILITUD);

      if (filtradosSC.length > 0 && (await probarLista(filtradosSC, miniaturaRef))) return;

      await client.sendText(m.chat, "❌ Probé varias opciones en YouTube y SoundCloud y ninguna se pudo descargar. Probá con otro título o de nuevo más tarde.", m);
      m.react("❌");
    } catch (error) {
      console.log(`Error en plugin de youtube:`, error.message);
      await client.sendText(m.chat, "❌ Ocurrió un error interno al procesar el pedido. Probá de nuevo más tarde.", m);
      m.react("❌");
    }
  });

  if (adelante > 0) {
    await client.sendText(m.chat, `⏳ Tu descarga está en la cola. Hay ${adelante} antes que la tuya, ya te la mando bo.`, m);
  }
};

export default plugin;

async function buscarYoutube(query) {
  try {
    const { stdout } = await execFileAsync(ytDlpPath, ["ytsearch3:" + query, ...cookiesArgs, "--print", "%(title)s", "--print", "%(webpage_url)s", "--print", "%(thumbnail)s", "--skip-download", "--no-warnings"]);
    return parsearResultados(stdout, "youtube");
  } catch (error) {
    console.error(`[dl-youtube] búsqueda en YouTube falló: ${error.message}`);
    return [];
  }
}

async function buscarSoundcloud(query) {
  try {
    const { stdout } = await execFileAsync(ytDlpPath, ["scsearch5:" + query, "--print", "%(title)s", "--print", "%(webpage_url)s", "--print", "%(thumbnail)s", "--skip-download", "--no-warnings"]);
    return parsearResultados(stdout, "soundcloud");
  } catch (error) {
    console.error(`[dl-youtube] búsqueda en SoundCloud falló: ${error.message}`);
    return [];
  }
}

function parsearResultados(stdout, fuente) {
  const lineas = stdout.trim().split("\n").filter(Boolean);
  const resultados = [];
  for (let i = 0; i < lineas.length; i += 3) {
    const title = lineas[i];
    const url = lineas[i + 1];
    const thumbnail = lineas[i + 2];
    if (title && url) resultados.push({ title, url, thumbnail: thumbnail || "", fuente });
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
