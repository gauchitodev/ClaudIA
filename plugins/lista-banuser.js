import { getAllUsers } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["listabanuser", "listabaneados"];
plugin.botAdmin = true;
plugin.onlyOwner = true;

plugin.run = async (m, { client, isOwner }) => {
  // fetch every user
  const users = getAllUsers().filter((u) => u.banned);

  const caption = `❌ \`USUARIOS BANEADOS\` ❌

│ *Total : ${users.length} Usuarios* ${
    users.length
      ? `\n${users
          .map((u) =>
            `
│ ${isOwner ? `@${u.lid.split("@")[0]}` : u.lid}
│ - - - - - - - - -`.trim()
          )
          .join("\n")}`
      : ""
  }
*Estos usuarios no pueden usar el bot*`.trim();

  await client.sendText(m.chat, caption, m);
};

export default plugin;
