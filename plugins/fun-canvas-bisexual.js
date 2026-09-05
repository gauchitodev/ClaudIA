import Jimp from "jimp-legacy";
import { unlinkSync } from "fs";
import { obtenerFotoPerfil } from "../lib/foto-perfil.js";

let plugin = {};
plugin.cmd = ["bisexual", "bi"];
plugin.juego = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, chat }) => {
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  const numberMatchesPlus = text.match(/\+[0-9\s]+/g);
  if (numberMatchesPlus && numberMatchesPlus.length > 0) {
    who = numberMatchesPlus[0].replace(/[+\s]/g, "") + "@s.whatsapp.net";
  } else if (numberMatches && numberMatches.length > 0) {
    who = numberMatches[0].replace("@", "").replace(/\s+/g, "") + "@lid";
  } else if (m.quoted) {
    who = m.quoted.sender;
  }
  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  const pp = await obtenerFotoPerfil(client, who);
  m.react("⏳");

  try {
    const randomName = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const outputPath = `./tmp/${randomName}.jpg`;

    const ppBi = "https://openclipart.org/image/800px/344896";

    const foto1 = await Jimp.read(pp);
    const foto2 = await Jimp.read(ppBi);

    const scaleFactor = 1.05;
    const newWidth = Math.round(foto1.getWidth() * scaleFactor);
    const newHeight = Math.round(foto1.getHeight() * scaleFactor);

    foto2.resize(newWidth, newHeight);
    foto2.opacity(0.9);

    // Calcular el desplazamiento para centrar foto2 sobre foto1
    const xOffset = Math.round((foto1.getWidth() - newWidth) / 2);
    const yOffset = Math.round((foto1.getHeight() - newHeight) / 2);

    foto1.composite(foto2, xOffset, yOffset, { mode: Jimp.BLEND_SOURCE_OVER });

    await foto1.writeAsync(outputPath);

    await client.sendFile(m.chat, outputPath, `${randomName}.jpg`, "🌈🏳️‍🌈", m);
    unlinkSync(outputPath);
  } catch (err) {
    console.error(err);
  }
};

export default plugin;
