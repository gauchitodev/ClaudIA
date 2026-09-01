import Jimp from "jimp-legacy";
import { unlinkSync } from "fs";
import { obtenerFotoPerfil } from "../lib/foto-perfil.js";

let plugin = {};
plugin.cmd = ["gay"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, chat }) => {
  if (!chat.games) return client.sendText(m.chat, txt.disabledGames, m);
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

    const ppColors = "https://vectorflags.s3.amazonaws.com/flags/org-lgbt-square-01.png";

    const foto1 = await Jimp.read(pp);
    const foto2 = await Jimp.read(ppColors);

    foto2.resize(foto1.getWidth(), foto1.getHeight());
    foto2.opacity(0.3);
    foto1.composite(foto2, 0, 0, { mode: Jimp.BLEND_SOURCE_OVER });

    await foto1.writeAsync(outputPath);

    await client.sendFile(m.chat, outputPath, `${randomName}.jpg`, "🌈🏳️‍🌈", m);
    unlinkSync(outputPath);
  } catch (err) {
    console.error(err);
  }
};

export default plugin;
