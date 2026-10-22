import { metadataDe } from "../lib/cache-grupos.js";
import { anotarCierre } from "../lib/inactivos.js";

const plugin = {};
plugin.cmd = ["g"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, groupMetadata }) => {
  // The real state is queried: cached metadata may be stale and make .g repeat "close" instead of opening.
  const metadataFresca = await metadataDe(client, m.chat, { fresca: true });
  const isClosed = (metadataFresca || groupMetadata).announce;
  const newState = isClosed ? "not_announcement" : "announcement";
  const reaction = isClosed ? "🔓" : "🔒";
  setTimeout(() => {
    m.react(reaction);
  }, 500);
  await client.groupSettingUpdate(m.chat, newState);
  anotarCierre(m.chat, !isClosed); // the time it's closed doesn't count for .inactivos
};

export default plugin;
