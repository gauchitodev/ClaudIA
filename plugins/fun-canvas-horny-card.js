import bajarFondo from "../lib/fondo-remoto.js";
import Jimp from "jimp-legacy";
import { unlinkSync } from "fs";
import { obtenerFotoPerfil } from "../lib/foto-perfil.js";

let plugin = {};
plugin.cmd = ["hornycard", "licenciahot", "hotlicense", "hotlicencia"];
plugin.juego = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, chat, usedPrefix, command }) => {
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

    const ppHorn = "https://i.ibb.co/CpqH6WpM/Untitled-21.jpg";

    const foto1 = await Jimp.read(pp);
    const foto2 = await Jimp.read(await bajarFondo(ppHorn));

    const newWidth = foto2.getWidth();
    const newHeight = foto2.getHeight();

    foto2.resize(newWidth, newHeight);

    // redimensionar foto1 al 50%
    foto1.resize(newWidth / 3, Jimp.AUTO);

    // rotar 10 grados hacia la izquierda
    foto1.rotate(+3);

    // calcular el centro de foto2
    const centerX = (newWidth - foto1.getWidth()) / 2; // centrado de foto1 sobre foto2

    // foto1 hacia la izquierda, ajustando el valor de X para mayor precisión
    const x = centerX - 200;

    // centrar foto1 verticalmente
    const y = (newHeight - foto1.getHeight()) / 2 + 10;

    // superponer foto1 sobre foto2
    foto2.composite(foto1, x, y, { mode: Jimp.BLEND_SOURCE_OVER });

    await foto2.writeAsync(outputPath);

    await client.sendFile(m.chat, outputPath, `${randomName}.jpg`, "horn", m);
    unlinkSync(outputPath);
  } catch (e) {
    console.error(e);
  }
};

export default plugin;
