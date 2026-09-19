import { exec } from "child_process";
import { promises } from "fs";
import { promisify } from "util";

const plugin = {};
plugin.cmd = ["toimg", "img", "jpg"];
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
  if (!m.quoted) return client.sendText(m.chat, txt.stickerToImgNull, m);

  const mime = m.quoted.mediaType || "";
  if (!/sticker/.test(mime)) return client.sendText(m.chat, txt.stickerToImgNull, m);

  try {
    const execAsync = promisify(exec);

    const media = await m.quoted.download();
    const timestamp = Date.now();
    const inputPath = `./temp_${timestamp}.webp`;
    const outputPath = `./temp_${timestamp}.jpg`;

    await promises.writeFile(inputPath, media);

    await execAsync(`ffmpeg -y -i "${inputPath}" "${outputPath}"`);
    await promises.unlink(inputPath);

    const jpgBuffer = await promises.readFile(outputPath);
    await promises.unlink(outputPath);
    await client.sendFile(m.chat, jpgBuffer, "sticker.jpg", null, m);
  } catch (e) {
    // El mismo mensaje tapaba dos causas muy distintas: la descarga vacía y el fallo de ffmpeg. Ahora el log las
    // separa, así una captura alcanza para saber cuál fue sin correr ningún comando.
    if (e?.code === "ERR_INVALID_ARG_TYPE") {
      console.error("[toimg] ❌ la descarga del sticker vino vacía: download() no devolvió bytes.");
      console.error("[toimg] ➜ CAUSA: no se pudo bajar el archivo de WhatsApp. NO es problema de ffmpeg.");
    } else if (/ffmpeg/i.test(e?.message || "")) {
      const dijo = String(e.stderr || "")
        .split("\n")
        .filter((l) => l.trim())
        .slice(-3)
        .join(" | ");
      console.error(`[toimg] ❌ ffmpeg falló pasando el webp a jpg: ${String(e.message).split("\n")[0]}`);
      if (dijo) console.error(`[toimg]    ffmpeg dijo: ${dijo}`);
      console.error("[toimg] ➜ CAUSA: ffmpeg está pero no pudo con el webp: build sin libwebp, o el archivo llegó corrupto.");
    } else {
      console.error("[toimg] ❌ fallo inesperado convirtiendo el sticker:", e);
    }
    return client.sendText(m.chat, "Error al convertir o enviar el sticker.", m);
  }
};

export default plugin;
