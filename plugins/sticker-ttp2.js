import { cuadrosArcoiris } from "../lib/canvas.js";
import { sticker } from "../lib/sticker.js";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

const plugin = {};
plugin.cmd = ["ttp2", "attp2"];
plugin.botAdmin = true;

// Animated sticker: the text in 16 rainbow colours, one frame every 100 ms, assembled with ffmpeg.
plugin.run = async (m, { client, text }) => {
  if (!text && !m.quoted) return client.sendText(m.chat, "Ingresa un texto.", m);
  m.react("⏳");

  const coloresUnicos = 16;
  const cuadrosPorSegundo = 10;
  const tmp = "./tmp";
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp);
  const base = `${tmp}/rgb_${Date.now()}`;
  const salida = `${base}.webp`;

  try {
    const cuadros = await cuadrosArcoiris(text || m.quoted?.text || "", coloresUnicos);
    cuadros.forEach((png, i) => fs.writeFileSync(`${base}_${String(i).padStart(3, "0")}.png`, png));
    await execFileAsync("ffmpeg", ["-y", "-r", String(cuadrosPorSegundo), "-i", `${base}_%03d.png`, "-vf", `fps=${cuadrosPorSegundo}`, "-c:v", "libwebp", "-lossless", "0", "-quality", "85", "-loop", "0", "-preset", "picture", "-an", salida]);
    const stiker = await sticker(fs.readFileSync(salida));
    await client.sendFile(m.chat, stiker, null, null, m);
  } catch (err) {
    console.error("Error ttp2:", err);
    await client.sendText(m.chat, "Error creando sticker RGB", m);
  } finally {
    for (let i = 0; i < coloresUnicos; i++) fs.rmSync(`${base}_${String(i).padStart(3, "0")}.png`, { force: true });
    fs.rmSync(salida, { force: true });
  }
};

export default plugin;
