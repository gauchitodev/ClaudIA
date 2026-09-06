let plugin = (m) => m;
plugin.before = async function (m, { client }) {
  let ok;
  let isWin = false;
  let isTie = false;
  let isSurrender;
  client.game = client.game ? client.game : {};
  let room = Object.values(client.game).find((room) => room.id && room.game && room.state && room.id.startsWith("tictactoe") && [room.game.playerX, room.game.playerO].includes(m.sender) && room.state === "PLAYING");
  if (room) {
    if (!/^([1-9]|(me)?nyerah|\rendirse\|rendirse|RENDIRSE|SALIR|salir|Salir|out|OUT|Out|surr?ender)$/i.test(m.text)) return true;
    isSurrender = !/^[1-9]$/.test(m.text);
    if (m.sender !== room.game.currentTurn) {
      if (!isSurrender) return true;
    }

    if (!isSurrender && 1 > (ok = room.game.turn(m.sender === room.game.playerO, parseInt(m.text) - 1))) {
      await client.sendText(
        m.chat,
        {
          "-3": "El juego ha terminado",
          "-2": "Inválido",
          "-1": "Posición inválida",
          0: "Posición inválida",
        }[ok],
        m,
      );
      return true;
    }
    if (m.sender === room.game.winner) isWin = true;
    else if (room.game.board === 511) isTie = true;
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
    if (isSurrender) {
      room.game.oTurn = m.sender === room.game.playerX;
      isWin = true;
    }

    let str = `
🫂 𝙅𝙐𝙂𝘼𝘿𝙊𝙍𝙀𝙎 *:*
*┈┈┈┈┈┈┈┈┈*
❎ = @${room.game.playerX.split("@")[0]}
⭕ = @${room.game.playerO.split("@")[0]}
*┈┈┈┈┈┈┈┈┈*
     ${arr.slice(0, 3).join("")}
     ${arr.slice(3, 6).join("")}
     ${arr.slice(6).join("")}
*┈┈┈┈┈┈┈┈┈*
${isWin ? `@${(isSurrender ? room.game.currentTurn : room.game.winner).split("@")[0]} 😎🏆 *GANASTE!!*` : isTie ? `*EMPATE!!🙄🤨*` : `🪄 *TURNO DE* @${room.game.currentTurn.split("@")[0]}`}
`.trim();
    if ((room.game.oTurn ^ isSurrender ? room.x : room.o) !== m.chat) room[room.game.oTurn ^ isSurrender ? "x" : "o"] = m.chat;
    if (room.x !== room.o) await client.sendMessage(room.x, { text: str, mentions: client.parseMention(str) }, { quoted: m });
    await client.sendMessage(room.o, { text: str, mentions: client.parseMention(str) }, { quoted: m });

    if (isTie || isWin) {
      delete client.game[room.id];
    }
  }
  return;
};
export default plugin;
