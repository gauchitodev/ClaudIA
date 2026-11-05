import { responderBiblia } from "../lib/biblia.js";

// .versiculo: a verse of the Reina-Valera 1960 (lib/biblia.js, bolls.life): the one asked for (.versiculo Levítico
// 18:22, Juan 3:16-17, Salmos 23 for the chapter, Proverbios for one of its verses) or one at random with nothing.
// .salmo 23 is that psalm, .salmo alone one of the Psalms. They used to come from bible-api.deno.dev, which ceased to
// exist when Deno Deploy Classic shut down in July 2026.
const plugin = {};
plugin.cmd = ["versiculo", "versículo", "biblia", "salmo", "salmos"];
plugin.botAdmin = true;

plugin.run = async (m, { client, command, args = [], usedPrefix = "." }) => {
  let pedido = args.join(" ").trim();
  // .salmo 23 is Salmos 23; with a book written out (.salmo Juan 3:16), what's written goes.
  if (command.startsWith("salmo") && !/^\p{L}/u.test(pedido)) pedido = `Salmos ${pedido}`;
  return client.sendText(m.chat, await responderBiblia(pedido, { usedPrefix }), m);
};

export default plugin;
