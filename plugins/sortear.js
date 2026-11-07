import { elegirAlAzar } from "../lib/azar.js";
import { generoDe, generoDeVarios, concordar, concordarPlural } from "../lib/genero.js";
import txt from "../lib/strings.js";

// .sortear <premio> draws one of the group; .sortear2 to .sortear10, that many (someone may come out twice, as always).
// The header goes in the winners' gender when they set it (.genero, lib/genero.js): GANADORA, and GANADORAS when they
// all are. It used to be one block of text per command, eleven of them.
const plugin = {};
plugin.cmd = ["sortear", "sortear1", "sortear2", "sortear3", "sortear4", "sortear5", "sortear6", "sortear7", "sortear8", "sortear9", "sortear10"];
plugin.juego = true;
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, groupMetadata, command, text }) => {
  if (!text) return client.sendText(m.chat, txt.sortearText, m);

  const cuantos = Number(command.replace("sortear", "")) || 1;
  const ps = groupMetadata.participants.map((v) => v.id);
  const ganadores = Array.from({ length: cuantos }, () => elegirAlAzar(ps));
  const titulo = cuantos === 1 ? concordar("GANADOR", generoDe(ganadores[0])) : concordarPlural("GANADORES", generoDeVarios(ganadores));
  const lineas = ganadores.map((g, i) => `*_${i + 1}.- @${g.split("@")[0]}_*`);
  return client.sendText(m.chat, `*🏆 ${titulo} ​🏆​*\n\n*🥳PREMIO:* ${text}\n    \n${lineas.join("\n")}`, m);
};

export default plugin;
