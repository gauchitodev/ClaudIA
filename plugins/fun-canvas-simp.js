import bajarFondo from "../lib/fondo-remoto.js";
import Jimp from "jimp-legacy";
import { unlinkSync } from "fs";
import { obtenerFotoPerfil } from "../lib/foto-perfil.js";

let plugin = {};
plugin.cmd = ["simp"];
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

    const ppSimp = "https://na.wargaming.net/clans/media/clans/emblems/cl_960/1000001960/emblem_195x195.png";

    const foto1 = await Jimp.read(pp);
    const foto2 = await Jimp.read(await bajarFondo(ppSimp));

    foto2.resize(foto1.getWidth(), foto1.getHeight());
    foto2.opacity(0.8);
    foto1.composite(foto2, 0, 0, { mode: Jimp.BLEND_SOURCE_OVER });

    await foto1.writeAsync(outputPath);

    await client.sendFile(m.chat, outputPath, `${randomName}.jpg`, "SSSSSIMPPPPPP", m);
    unlinkSync(outputPath);
  } catch (err) {
    console.error("[canvas]", err);
    await client.sendText(m.chat, "❌ No pude armar la imagen: el servicio de donde saco el fondo no está respondiendo. Probá más tarde.", m);
  }
};

export default plugin;
