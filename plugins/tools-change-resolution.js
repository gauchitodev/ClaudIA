import { redimensionar, dimensionesImagen } from "../lib/canvas.js";
import { puedeRecuperarCitado } from "../lib/vista-unica.js";
import { excedeTope, TOPES_MEDIA } from "../lib/tamano-media.js";

// jimp works synchronously, with the whole bot waiting. So both the picture that comes in (a file of a few KB can be a
// PNG thousands of pixels a side) and the one that goes out (4096 a side held it for 7 s) have a ceiling.
const MAX_MEGAPIXELES = 25;
const MAX_LADO = 2048;

const plugin = {};
plugin.cmd = ["res"];
plugin.botAdmin = true;

// .res 500 (height, keeping the aspect ratio) or .res 300x600, replying to an image
plugin.run = async (m, { client, text, usedPrefix, command, isAdmin, isOwner }) => {
  // Resizing someone else's view-once would hand it back to the group (see lib/vista-unica.js).
  if (!puedeRecuperarCitado(m, { isAdmin, isOwner })) return client.sendText(m.chat, txt.recoveryOnceRestrict, m);
  const q = m.quoted ? m.quoted : m;
  const mime = (q.msg || q).mimetype || "";
  if (!/image\/(png|jpe?g)/.test(mime)) return client.sendText(m.chat, txt.defaultImage, m);
  const tope = excedeTope(q, TOPES_MEDIA.imagen);
  if (tope) return client.sendText(m.chat, tope, m);

  const media = await q.download();
  const dimensiones = dimensionesImagen(media);
  if (!dimensiones) return client.sendText(m.chat, "No pude leer esa imagen.", m);
  if (dimensiones.ancho * dimensiones.alto > MAX_MEGAPIXELES * 1e6) return client.sendText(m.chat, `Esa imagen es de ${dimensiones.ancho} x ${dimensiones.alto}: como mucho ${MAX_MEGAPIXELES} megapíxeles.`, m);
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
  if (newWidth < 1 || newHeight < 1 || newWidth > MAX_LADO || newHeight > MAX_LADO) return client.sendText(m.chat, `Tamaño inválido: cada lado tiene que estar entre 1 y ${MAX_LADO} píxeles.`, m);

  const buffer = await redimensionar(media, newWidth, newHeight);
  const caption = `_*NUEVA RESOLUCIÓN :*_ ${newWidth} x ${newHeight}
> Ancho : ${newWidth}
> Altura : ${newHeight}`;
  await client.sendFile(m.chat, buffer, null, caption, m);
};

export default plugin;
