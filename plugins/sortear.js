import { elegirAlAzar } from "../lib/azar.js";

const plugin = {};
plugin.cmd = ["sortear", "sortear1", "sortear2", "sortear3", "sortear4", "sortear5", "sortear6", "sortear7", "sortear8", "sortear9", "sortear10"];
plugin.juego = true;
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, groupMetadata, command, text, chat }) => {
  if (!text) return client.sendText(m.chat, txt.sortearText, m);

  const user = (a) => `@${a.split("@")[0]}`;
  const ps = groupMetadata.participants.map((v) => v.id);
  const [a, b, c, d, e, f, g, h, i, j] = Array.from({ length: 10 }, () => elegirAlAzar(ps));

  if (command === "sortear") {
    const top = `*🏆 GANADOR ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command === "sortear1") {
    const top = `*🏆 GANADOR ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command === "sortear2") {
    const top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command === "sortear3") {
    const top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command === "sortear4") {
    const top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*
*_4.- ${user(d)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command === "sortear5") {
    const top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*
*_4.- ${user(d)}_*
*_5.- ${user(e)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command === "sortear6") {
    const top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*
*_4.- ${user(d)}_*
*_5.- ${user(e)}_*
*_6.- ${user(f)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command === "sortear7") {
    const top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*
*_4.- ${user(d)}_*
*_5.- ${user(e)}_*
*_6.- ${user(f)}_*
*_7.- ${user(g)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command === "sortear8") {
    const top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*
*_4.- ${user(d)}_*
*_5.- ${user(e)}_*
*_6.- ${user(f)}_*
*_7.- ${user(g)}_*
*_8.- ${user(h)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command === "sortear9") {
    const top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*
*_4.- ${user(d)}_*
*_5.- ${user(e)}_*
*_6.- ${user(f)}_*
*_7.- ${user(g)}_*
*_8.- ${user(h)}_*
*_9.- ${user(i)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command === "sortear10") {
    const top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*
*_4.- ${user(d)}_*
*_5.- ${user(e)}_*
*_6.- ${user(f)}_*
*_7.- ${user(g)}_*
*_8.- ${user(h)}_*
*_9.- ${user(i)}_*
*_10.- ${user(j)}_*`;
    return client.sendText(m.chat, top, m);
  }
};

export default plugin;
