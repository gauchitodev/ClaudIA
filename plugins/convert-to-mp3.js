import { toAudio } from "../lib/ffmpeg.js";

const plugin = {};
plugin.cmd = ["tomp3", "toaudio", "mp3"];
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
  const q = m.quoted ? m.quoted : m;
  const mime = (m.quoted ? m.quoted : m.msg).mimetype || "";
  if (!/video|audio/.test(mime)) return client.sendText(m.chat, txt.convertToMp3Null);
  await client.sendPresenceUpdate("recording", m.chat);
  const media = await q.download?.();
  const audio = await toAudio(media, "mp4");
  client.sendFile(m.chat, audio.data, "error.mp3", "", m, null, { mimetype: "audio/mp4" });
};

export default plugin;
