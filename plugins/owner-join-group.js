import { pausa } from "../lib/pausas.js";
import txt from "../lib/strings.js";

const linkRegex = /chat.whatsapp.com\/([0-9A-Za-z]{20,24})/i;

const plugin = {};
plugin.cmd = ["join"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text }) => {
  const link = (m.quoted ? (m.quoted.text ? m.quoted.text : text) : text) || text;
  const [_, code] = link.match(linkRegex) || [];
  if (!code) return client.sendText(m.chat, txt.joinGroupNull, m);
  client.sendText(m.chat, txt.joinGroupSuccess, m);
  await pausa(5000);
  await client.groupAcceptInvite(code);
};

export default plugin;
