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
    console.error(e);
    return client.sendText(m.chat, "Error al convertir o enviar el sticker.", m);
  }
};

export default plugin;
