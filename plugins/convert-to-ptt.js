import { toPTT } from "../lib/ffmpeg.js";
import { puedeRecuperarCitado } from "../lib/vista-unica.js";

const plugin = {};
plugin.cmd = ["vn", "ptt"];
plugin.botAdmin = true;

plugin.run = async (m, { client, isAdmin, isOwner }) => {
  // Converting someone else's view-once would hand it back to the group (see lib/vista-unica.js).
  if (!puedeRecuperarCitado(m, { isAdmin, isOwner })) return client.sendText(m.chat, txt.recoveryOnceRestrict, m);
  if (!m.quoted) return client.sendText(m.chat, txt.toPTTNull, m);
  const mime = m.quoted.mimetype || "";
  if (!/video|audio/.test(mime)) return;
  const media = await m.quoted.download?.();
  if (!media && !/video/.test(mime)) return;
  if (!media && !/audio/.test(mime)) return;
  const audio = await toPTT(media, "mp4");
  if (!audio.data && !/audio/.test(mime)) return;
  if (!audio.data && !/video/.test(mime)) return;
  await client.sendFile(m.chat, audio.data, `toPTT.mp3`, null, m, true); // Baileys measures the duration
};

export default plugin;
