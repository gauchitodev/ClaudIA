let plugin = {};
plugin.cmd = ["sortear", "sortear1", "sortear2", "sortear3", "sortear4", "sortear5", "sortear6", "sortear7", "sortear8", "sortear9", "sortear10"];
plugin.juego = true;
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, groupMetadata, command, text, chat }) => {
  if (!text) return client.sendText(m.chat, txt.sortearText, m);

  let user = (a) => "@" + a.split("@")[0];
  let ps = groupMetadata.participants.map((v) => v.id);
  let a = ps.getRandom();
  let b = ps.getRandom();
  let c = ps.getRandom();
  let d = ps.getRandom();
  let e = ps.getRandom();
  let f = ps.getRandom();
  let g = ps.getRandom();
  let h = ps.getRandom();
  let i = ps.getRandom();
  let j = ps.getRandom();

  if (command == "sortear") {
    let top = `*🏆 GANADOR ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command == "sortear1") {
    let top = `*🏆 GANADOR ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command == "sortear2") {
    let top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command == "sortear3") {
    let top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command == "sortear4") {
    let top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*
*_4.- ${user(d)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command == "sortear5") {
    let top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*
*_4.- ${user(d)}_*
*_5.- ${user(e)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command == "sortear6") {
    let top = `*🏆 GANADORES ​🏆​*

*🥳PREMIO:* ${text}
    
*_1.- ${user(a)}_*
*_2.- ${user(b)}_*
*_3.- ${user(c)}_*
*_4.- ${user(d)}_*
*_5.- ${user(e)}_*
*_6.- ${user(f)}_*`;
    return client.sendText(m.chat, top, m);
  }

  if (command == "sortear7") {
    let top = `*🏆 GANADORES ​🏆​*

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

  if (command == "sortear8") {
    let top = `*🏆 GANADORES ​🏆​*

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

  if (command == "sortear9") {
    let top = `*🏆 GANADORES ​🏆​*

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

  if (command == "sortear10") {
    let top = `*🏆 GANADORES ​🏆​*

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
