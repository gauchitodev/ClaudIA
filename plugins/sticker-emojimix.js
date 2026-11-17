import { buscarMezcla, bajarMezcla } from "../lib/emojimix.js";
import { ffmpeg } from "../lib/ffmpeg.js";
import { addExif } from "../lib/sticker.js";

const segmentador = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const plugin = {};
plugin.cmd = ["emojimix"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix }) => {
  const texto = text?.trim() || m.quoted?.text || "";
  const emojis = [...segmentador.segment(texto)].map((parte) => parte.segment).filter((parte) => /\p{Extended_Pictographic}/u.test(parte));
  if (emojis.length !== 2) {
    return client.sendText(m.chat, `🧑‍🍳 Mandame exactamente dos emojis y los mezclo en un sticker: ${usedPrefix}emojimix 😎+🔥 (o respondé a un mensaje que tenga los dos).`, m);
  }

  const [primero, segundo] = emojis;
  const mezcla = await buscarMezcla(primero, segundo);
  if (mezcla.estado === "no_disponible") {
    return client.sendText(m.chat, "⏳ Todavía no tengo el catálogo de Emoji Kitchen: lo estoy bajando. Probá de nuevo en un rato.", m);
  }
  if (mezcla.estado === "no_soportado") {
    const { sinCatalogo } = mezcla;
    return client.sendText(m.chat, `❌ ${sinCatalogo.join(" ")} ${sinCatalogo.length === 1 ? "no está" : "no están"} en Emoji Kitchen: no todos los emojis se pueden mezclar.`, m);
  }
  if (mezcla.estado === "sin_combinacion") {
    return client.sendText(m.chat, `❌ ${primero} + ${segundo} no se pueden combinar. Probá con otros emojis.`, m);
  }

  m.react("⏳").catch(() => {});
  let webp;
  try {
    const png = await bajarMezcla(mezcla.url);
    // Emoji Kitchen's images are 534 px squares, and a sticker is 512.
    webp = await ffmpeg(png, ["-loglevel", "error", "-vf", "scale=512:512:flags=lanczos", "-vcodec", "libwebp", "-lossless", "1", "-compression_level", "6"], "png", "webp");
    await client.sendFile(m.chat, await addExif(webp.data), null, null, m);
  } catch (e) {
    console.error(`[emojimix] no pude armar ${primero} + ${segundo}:`, e?.message || e);
    return client.sendText(m.chat, "❌ No pude armar el sticker. Probá de nuevo en un rato.", m);
  } finally {
    webp?.delete().catch(() => {});
  }
};

export default plugin;
