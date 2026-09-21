import { translate } from "@vitalets/google-translate-api";

const plugin = {};
plugin.cmd = ["traducir", "translate"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  // With no text but replying to a message, the quoted message is translated (this order used to be reversed).
  if (!text && m.quoted && m.quoted.text) text = m.quoted.text;
  if (!text) return client.sendText(m.chat, txt.translateNull, m);
  try {
    const result = await translate(`${text}`, { to: "es", fetchOptions: { signal: AbortSignal.timeout(15000) } });
    await client.sendText(m.chat, result.text, m);
  } catch (e) {
    console.log(e);
  }
};

export default plugin;
