import { redimensionar } from "../lib/canvas.js";

const plugin = {};
plugin.cmd = ["res"];
plugin.botAdmin = true;

// .res 500 (height, keeping the aspect ratio) or .res 300x600, replying to an image
plugin.run = async (m, { client, text, usedPrefix, command }) => {
  const q = m.quoted ? m.quoted : m;
  const mime = (q.msg || q).mimetype || "";
  if (!/image\/(png|jpe?g)/.test(mime)) return client.sendText(m.chat, txt.defaultImage, m);

  const media = await q.download();
  const { Jimp } = await import("jimp");
  const original = await Jimp.read(media);

  let newWidth, newHeight;
  if (!text.includes("x")) {
    newHeight = parseInt(text);
    if (isNaN(newHeight)) return client.sendText(m.chat, txt.changeResolutionNumbers(usedPrefix, command), m);
    newWidth = Math.round(original.width * (newHeight / original.height));
  } else {
    [newWidth, newHeight] = text.split("x").map((v) => parseInt(v));
    if (isNaN(newWidth) || isNaN(newHeight)) return client.sendText(m.chat, txt.changeResolutionNumbers(usedPrefix, command), m);
  }

  // Size cap: without it ".res 20000x20000" reserves gigabytes of RAM and takes the tablet down.
  const MAX_LADO = 4096;
  if (newWidth < 1 || newHeight < 1 || newWidth > MAX_LADO || newHeight > MAX_LADO) return client.sendText(m.chat, `Tamaño inválido: cada lado tiene que estar entre 1 y ${MAX_LADO} píxeles.`, m);

  const buffer = await redimensionar(media, newWidth, newHeight);
  const caption = `_*NUEVA RESOLUCIÓN :*_ ${newWidth} x ${newHeight}
> Ancho : ${newWidth}
> Altura : ${newHeight}`;
  await client.sendFile(m.chat, buffer, null, caption, m);
};

export default plugin;
