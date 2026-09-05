import Jimp from "jimp-legacy";
import { unlinkSync } from "fs";
import { obtenerFotoPerfil } from "../lib/foto-perfil.js";

let plugin = {};
plugin.cmd = ["trans", "transexual"];
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
    const outputPath = `./tmp/${randomName}.png`;

    const ppTrans = "https://openclipart.org/image/800px/345534";

    const foto1 = await Jimp.read(pp);
    const foto2 = await Jimp.read(ppTrans);

    const size = Math.min(foto2.getWidth(), foto2.getHeight());
    foto1.resize(size, size);

    const mask = new Jimp(size, size, 0x00000000);
    mask.scan(0, 0, size, size, function (x, y, idx) {
      const centerX = size / 2;
      const centerY = size / 2;
      const radius = size / 2;
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

      if (distance < radius) {
        mask.bitmap.data[idx] = 255;
        mask.bitmap.data[idx + 1] = 255;
        mask.bitmap.data[idx + 2] = 255;
        mask.bitmap.data[idx + 3] = 255;
      } else {
        mask.bitmap.data[idx + 3] = 0;
      }
    });

    foto1.mask(mask, 0, 0);
    const fondo = new Jimp(size, size, 0x00000000);
    fondo.composite(foto1, 0, 0);
    fondo.composite(foto2, 0, 0, { mode: Jimp.BLEND_SOURCE_OVER });
    await fondo.writeAsync(outputPath);

    await client.sendFile(m.chat, outputPath, `${randomName}.png`, "🏳️‍⚧️", m);
    unlinkSync(outputPath);
  } catch (e) {
    console.error(e);
  }
};

export default plugin;
