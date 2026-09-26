import { unlinkSync, readFileSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { puedeRecuperarCitado } from "../lib/vista-unica.js";

const execAsync = promisify(exec);

const plugin = {};
plugin.cmd = ["bass", "blown", "deep", "earrape", "fast", "fat", "nightcore", "reverse", "robot", "slow", "smooth", "tupai"];
plugin.botAdmin = true;

plugin.run = async (m, { client, command, isAdmin, isOwner }) => {
  // An effect on someone else's view-once would hand it back to the group (see lib/vista-unica.js).
  if (!puedeRecuperarCitado(m, { isAdmin, isOwner })) return client.sendText(m.chat, txt.recoveryOnceRestrict, m);
  const q = m.quoted ? m.quoted : m;
  const mime = (m.quoted ? m.quoted : m.msg).mimetype || "";
  let set;
  if (/bass/.test(command)) set = "-af equalizer=f=94:width_type=o:width=2:g=30";
  if (/blown/.test(command)) set = "-af acrusher=.1:1:64:0:log";
  if (/deep/.test(command)) set = "-af atempo=4/4,asetrate=44500*2/3";
  if (/earrape/.test(command)) set = "-af volume=12";
  if (/fast/.test(command)) set = '-filter:a "atempo=2.20,asetrate=44100"';
  if (/fat/.test(command)) set = '-filter:a "atempo=1.6,asetrate=22100"';
  if (/nightcore/.test(command)) set = "-filter:a atempo=1.06,asetrate=44100*1.25";
  if (/reverse/.test(command)) set = '-filter_complex "areverse"';
  if (/robot/.test(command)) set = "-filter_complex \"afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75\"";
  if (/slow/.test(command)) set = '-filter:a "atempo=0.7,asetrate=44100"';
  if (/smooth/.test(command)) set = "-filter:v \"minterpolate='mi_mode=mci:mc_mode=aobmc:vsbmc=1:fps=120'\"";
  if (/tupai/.test(command)) set = '-filter:a "atempo=0.5,asetrate=65100"';

  if (!/audio/.test(mime)) return client.sendText(m.chat, txt.audioEffects, m);

  const filename = `./tmp/${getRandom(".mp3")}`;
  const media = await q.download(true);
  try {
    await execAsync(`ffmpeg -i "${media}" ${set} "${filename}"`);
    const buff = readFileSync(filename);
    await client.sendFile(m.chat, buff, `audioEffects.mp3`, null, m, true); // Baileys measures the duration
  } catch (e) {
    // An ffmpeg error used to leave the user with no answer, and a failed readFileSync took the process down.
    console.error("[audio-effects]", e.message);
    await client.sendText(m.chat, "No pude procesar ese audio, probá con otro.", m);
  } finally {
    for (const archivo of [media, filename]) {
      try {
        unlinkSync(archivo);
      } catch {}
    }
  }
};

export default plugin;

const getRandom = (ext) => {
  return `${Math.floor(Math.random() * 10000)}${ext}`;
};
