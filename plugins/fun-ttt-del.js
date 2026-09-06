const plugin = {};
plugin.cmd = ["delttt"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, usedPrefix }) => {
  const room = Object.values(client.game).find((room) => room.id.startsWith("tictactoe") && [room.game.playerX, room.game.playerO].includes(m.sender));
  if (!room) return client.sendText(m.chat, txt.tttDelNull(usedPrefix), m);
  delete client.game[room.id];
  await client.sendText(m.chat, txt.tttDelSuccess, m);
};

export default plugin;
