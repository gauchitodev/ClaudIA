import TicTacToe from "../lib/ttt.js";

let plugin = {};
plugin.cmd = ["ttt"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, chat }) => {
  if (!chat.games) return client.sendText(m.chat, txt.disabledGames, m);

  if (text) return client.sendText(m.chat, "[❗] NO ES NECESARIO PONER NOMBRE A LA SALA.\n\nSOLAMENTE PONER:\n* .ttt", m);

  client.game = client.game ? client.game : {};
  if (Object.values(client.game).find((room) => room.id.startsWith("tictactoe") && [room.game.playerX, room.game.playerO].includes(m.sender))) return client.sendText(m.chat, txt.tttSalaExistente, m);
  // Solo se une a salas en espera de ESTE chat: antes alguien de otro grupo podía meterse en la partida.
  let room = Object.values(client.game).find((room) => room.state === "WAITING" && room.x === m.chat);
  if (room) {
    room.o = m.chat;
    room.game.playerO = m.sender;
    room.state = "PLAYING";
    let arr = room.game.render().map((v) => {
      return {
        X: "❎",
        O: "⭕",
        1: "1️⃣",
        2: "2️⃣",
        3: "3️⃣",
        4: "4️⃣",
        5: "5️⃣",
        6: "6️⃣",
        7: "7️⃣",
        8: "8️⃣",
        9: "9️⃣",
      }[v];
    });

    let str = `❌ 𝙅𝙐𝙀𝙂𝙊 𝙏𝙍𝙀𝙎 𝙀𝙉 𝙍𝘼𝙔𝘼 ⭕
🫂 𝙅𝙐𝙂𝘼𝘿𝙊𝙍𝙀𝙎 *:*
*┈┈┈┈┈┈┈┈┈*
❎ = @${room.game.playerX.split("@")[0]}
⭕ = @${room.game.playerO.split("@")[0]}
*┈┈┈┈┈┈┈┈┈*
     ${arr.slice(0, 3).join("")}
     ${arr.slice(3, 6).join("")}
     ${arr.slice(6).join("")}
*┈┈┈┈┈┈┈┈┈*
𝙏𝙐𝙍𝙉𝙊 𝘿𝙀 *:* 
@${room.game.currentTurn.split("@")[0]}
`.trim();
    if (room.x !== room.o) await client.sendMessage(room.x, { text: str, mentions: client.parseMention(str) }, { quoted: fkontak });
    await client.sendMessage(room.o, { text: str, mentions: client.parseMention(str) }, { quoted: fkontak });
  } else {
    room = {
      id: "tictactoe-" + +new Date(),
      x: m.chat,
      o: "",
      game: new TicTacToe(m.sender, "o"),
      state: "WAITING",
    };
    if (text) room.name = text;
    let caption = `❌ 𝙅𝙐𝙀𝙂𝙊 𝙏𝙍𝙀𝙎 𝙀𝙉 𝙍𝘼𝙔𝘼 ⭕
🕹️Para ser segundo jugador, ponga .ttt

                ✅2️⃣⭕
                4️⃣⭕6️⃣
                ⭕8️⃣✅

[ ⌛ ] 𝙴𝚂𝙿𝙴𝚁𝙰𝙽𝙳𝙾 𝙰𝙻 𝚂𝙴𝙶𝚄𝙽𝙳𝙾 𝙹𝚄𝙶𝙰𝙳𝙾𝚁.

🕹️Para ser segundo jugador, ponga .ttt

❌Para eliminar la sala ponga .delttt
`;
    await client.sendText(m.chat, caption, m);
  }
  client.game[room.id] = room;
};

export default plugin;
