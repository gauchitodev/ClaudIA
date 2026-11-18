import { animacion, luzVisible, BANDAS, SATELITE } from "../lib/satelite.js";
import { addExif } from "../lib/sticker.js";

// .satinf / .satvis: GOES-19's animation of the region's last hours, infrared or visible light, as a video.
// .ssatinf / .ssatvis: the same as a sticker, cut to a square around Uruguay.
const COMANDOS = {
  satinf: { banda: "infrarrojo", sticker: false },
  ssatinf: { banda: "infrarrojo", sticker: true },
  satvis: { banda: "visible", sticker: false },
  ssatvis: { banda: "visible", sticker: true },
};
const FUENTE = "_Fuente: NOAA/NESDIS/STAR._";

const plugin = {};
plugin.cmd = Object.keys(COMANDOS);
plugin.botAdmin = true;

plugin.run = async (m, { client, command, usedPrefix }) => {
  const { banda, sticker } = COMANDOS[command];
  const luz = banda === "visible" ? luzVisible() : "si";
  if (luz === "no") {
    return client.sendText(m.chat, `🌙 Es de noche hace rato y el canal visible sale todo negro: necesita la luz del sol. Probá con ${usedPrefix}${sticker ? "ssatinf" : "satinf"}, el infrarrojo, que se ve igual de noche.`, m);
  }

  m.react("⏳").catch(() => {});
  try {
    const archivo = await animacion(banda, sticker);
    if (sticker) return await client.sendFile(m.chat, await addExif(archivo), null, null, m);
    const deNoche = luz === "parcial" ? `\n🌙 Ya es de noche: el final sale oscuro. ${usedPrefix}satinf se ve igual.` : "";
    await client.sendFile(m.chat, archivo, "satelite.mp4", `🛰️ *GOES-19* · ${BANDAS[banda].nombre} · sur de Sudamérica, últimas ${SATELITE.HORAS} horas${deNoche}\n${FUENTE}`, m);
  } catch (e) {
    console.error(`[satelite] no pude armar .${command}:`, e?.message || e);
    return client.sendText(m.chat, "❌ No pude traer la imagen del satélite. Probá de nuevo en un rato.", m);
  }
};

export default plugin;
