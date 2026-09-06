import { getAllUsers } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["listaadv", "listaadvertidos", "advertidos"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, isOwner }) => {
  // obtener usuarios con advertencias
  const users = getAllUsers().filter((u) => u.warn > 0);

  const caption = `⚠️ \`USUARIOS ADVERTIDOS\` ⚠️

│ *Total : ${users.length} Usuarios* ${
    users.length
      ? `\n${users
          .map((u) =>
            `
│ ${isOwner ? `@${u.lid.split("@")[0]}` : u.lid} *(${u.warn}/3)*
│ - - - - - - - - -`.trim()
          )
          .join("\n")}`
      : ""
  }`;

  await client.sendText(m.chat, caption, m);
};

export default plugin;
