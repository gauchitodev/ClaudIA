import fetch from "node-fetch";

let plugin = {};
plugin.cmd = ["ss"];
plugin.botAdmin = true;

plugin.run = async (m, { client, args }) => {
  if (!args[0]) return client.sendText(m.chat, txt.sswebNull, m);
  try {
    const ss = await (await fetch(`https://image.thum.io/get/fullpage/${args[0]}`)).buffer();
    await client.sendFile(m.chat, ss, "", "", m);
  } catch (e) {
    console.log("[ss]", e.message);
    await client.sendText(m.chat, "No pude sacar la captura de esa página.", m);
  }
};

export default plugin;
