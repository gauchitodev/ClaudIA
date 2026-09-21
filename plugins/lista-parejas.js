import { listaParejas } from "../lib/parejas.js";
import { duracionLarga } from "../lib/tiempo.js";

// .listaparejas: every couple the bot knows, oldest first.
const plugin = {};
plugin.cmd = ["listaparejas", "listadeparejas"];
plugin.botAdmin = true;

plugin.run = async (m, { client }) => {
  const parejas = listaParejas();
  const ahora = Date.now();
  const bloques = parejas.map((p) => {
    const casados = p.casadosDesde > 0 ? `*Casados:* Sí 💍\n*Tiempo casados:* ${duracionLarga(ahora - p.casadosDesde)}` : "*Casados:* No ❌";
    return `\n│ @${p.a.split("@")[0]} 💞 @${p.b.split("@")[0]}\n⏳ ${p.desde > 0 ? duracionLarga(ahora - p.desde) : "recién"}\n${casados}\n│━━━━━━━━━━━━━━━━━━━━━`;
  });
  const caption = `❤️ 𝙇𝙄𝙎𝙏𝘼 𝘿𝙀 𝙋𝘼𝙍𝙀𝙅𝘼𝙎 ❤️
╭•·━━━━━━━━━━━━━━━━━━━━
│ *Total: ${parejas.length} Pareja${parejas.length !== 1 ? "s" : ""}* ${parejas.length ? `\n│━━━━━━━━━━━━━━━━━━━━━\n${bloques.join("\n")}` : ""}
╰•·━━━━━━━━━━━━━━━━━━━━`;

  await client.sendMessage(m.chat, { text: caption, mentions: parejas.flatMap((p) => [p.a, p.b]) }, { quoted: m });
};

export default plugin;
