import { lidMencionadoActual, esElBot, lidDe } from "../lib/identidad.js";
import { generoDe, concordar } from "../lib/genero.js";

const plugin = {};
plugin.cmd = ["love", "gay2", "lesbiana", "zorra", "zorro", "pajero", "pajera", "puto", "puta", "infiel", "cornudo", "cornuda"];
plugin.juego = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, command, text, chat, participants }) => {
  // With nobody mentioned, the game is about whoever wrote it.
  const who = await lidMencionadoActual(client, m, text, participants) || m.sender;
  if (command !== "love" && esElBot(who, client)) return client.sendText(m.chat, `Yo no soy ${command} como vos🤨🤨🤨`, m);
  // The "saint" is the second configured owner; their @lid is resolved, by the group and failing that the database,
  // because mentions arrive as @lid.
  const numeroSanto = owners[1] ? String(owners[1]).replace(/[^0-9]/g, "") : "";
  const santoJid = numeroSanto ? `${numeroSanto}@s.whatsapp.net` : null;
  const santoLid = santoJid ? lidDe(santoJid, participants, { oElMismo: false }) : null;
  if (command !== "love" && santoJid && [santoJid, santoLid].includes(who)) return client.sendText(m.chat, concordar(`0% @${who.split("@")[0]} es un santo 😇`, generoDe(who)), m, { mentions: [who] });

  const porcentaje = Math.floor(Math.random() * 101);
  // With the mention: of someone the bot knows by their number alone, the "@" in the text tagged nobody (sendText).
  const decir = (juego) => client.sendText(m.chat, juego, m, { mentions: [who] });

  if (command === "gay2") {
    const juego = `_*@${who.split("@")[0]}* *ES* *${porcentaje}%* *GAY*_ 🏳️‍🌈`.trim();
    const kz = await decir(juego);
    client.sendMessage(m.chat, { react: { text: "🏳️‍🌈", key: kz.key } });
  }

  if (command === "zorro") {
    const veces = porcentaje <= 30 ? "🙄" : "ES UN FÁCIL🤨🦊";
    const zorro = porcentaje <= 30 ? "ZORRO." : "ZORRO😈";
    const juego = `*🤨𝙼𝙴𝙳𝙸𝙳𝙾𝚁 𝙳𝙴 𝚉𝙾𝚁𝚁𝙴𝚁𝙸́𝙰🦊*\n\n*@${who.split("@")[0]}* ES *${porcentaje}%* ${zorro}\n\n${veces}`.trim();
    const kz = await decir(juego);
    client.sendMessage(m.chat, { react: { text: "🦊", key: kz.key } });
  }

  if (command === "zorra") {
    const veces = porcentaje <= 30 ? "🙄" : "ES UNA FÁCIL🤨🦊";
    const zorra = porcentaje <= 30 ? "ZORRA." : "ZORRA😈";
    const juego = `*🤨𝙼𝙴𝙳𝙸𝙳𝙾𝚁 𝙳𝙴 𝚉𝙾𝚁𝚁𝙴𝚁𝙸́𝙰🦊*\n\n*@${who.split("@")[0]}* ES *${porcentaje}%* ${zorra}\n\n${veces}`.trim();
    const kz = await decir(juego);
    client.sendMessage(m.chat, { react: { text: "🦊", key: kz.key } });
  }

  if (command === "lesbiana") {
    const juego = `_*@${who.split("@")[0]}* *ES* *${porcentaje}%* *${command.replace("how", "").toUpperCase()}*_ 🏳️‍🌈`.trim();
    await decir(juego);
  }

  if (command === "pajero") {
    const juego = `_*@${who.split("@")[0]}* *ES* *${porcentaje}%* *${command.replace("how", "").toUpperCase()}*_ 😏💦`.trim();
    const kz = await decir(juego);
    client.sendMessage(m.chat, { react: { text: "💦", key: kz.key } });
  }

  if (command === "pajera") {
    const juego = `_*@${who.split("@")[0]}* *ES* *${porcentaje}%* *${command.replace("how", "").toUpperCase()}*_ 😏💦`.trim();
    const kz = await decir(juego);
    client.sendMessage(m.chat, { react: { text: "💦", key: kz.key } });
  }

  if (command === "puto") {
    const juego = `_*@${who.split("@")[0]}* *ES* *${porcentaje}%* *${command.replace("how", "").toUpperCase()},* *MÁS INFORMACIÓN A SU PRIVADO 🔥🥵*_`.trim();
    await decir(juego);
  }

  if (command === "puta") {
    const juego = `_*@${who.split("@")[0]}* *ES* *${porcentaje}%* *${command.replace("how", "").toUpperCase()},* *MÁS INFORMACIÓN A SU PRIVADO 🔥🥵*_`.trim();
    await decir(juego);
  }

  if (command === "infiel") {
    const veces = porcentaje === 0 ? "ES UN ANGEL😇" : porcentaje <= 30 ? "🙄" : "🦊🦊🦊🦊🦊🦊🦊🦊";
    const infiel = porcentaje === 0 ? "INFIEL." : "INFIEL😈";
    const juego = `*@${who.split("@")[0]}* ES *${porcentaje}%* ${infiel}\n\n${veces}`.trim();
    const kz = await decir(juego);
    let react;
    if (juego.includes("ANGEL")) {
      react = "😇";
    } else if (juego.includes("TENTACIONES")) {
      react = "🤨";
    } else {
      react = "😮";
    }
    client.sendMessage(m.chat, { react: { text: react, key: kz.key } });
  }

  if (command === "cornuda") {
    const getR = Math.floor(Math.random() * 11);
    const pregunta = getR <= 4 ? "Podría haber sido peor😐" : "POBRE CORNUDA😔";
    const veces = getR === 1 ? "VEZ" : "VECES";
    const juego = `*A @${who.split("@")[0]} LE METIERON LOS CUERNOS ${getR} ${veces}*\n\n*_${pregunta}_*`.trim();
    const kz = await decir(juego);
    client.sendMessage(m.chat, { react: { text: "🫎", key: kz.key } });
  }

  if (command === "cornudo") {
    const getR = Math.floor(Math.random() * 11);
    const pregunta = getR <= 4 ? "Podría haber sido peor😐" : "POBRE CORNUDO😔";
    const veces = getR === 1 ? "VEZ" : "VECES";
    const juego = `*A @${who.split("@")[0]} LE METIERON LOS CUERNOS ${getR} ${veces}*\n\n*_${pregunta}_*`.trim();
    const kz = await decir(juego);
    client.sendMessage(m.chat, { react: { text: "🫎", key: kz.key } });
  }

  if (command === "love") {
    const getR = Math.floor(Math.random() * 101);
    // "novia" or "novio" by the gender of whoever it's about, when set (.genero, lib/genero.js).
    const pregunta = getR <= 50 ? "Resultado un poco bajo😔" : concordar("¿Deberías pedirle que sea tu novia/o?😍", generoDe(who));
    const juego = `*❤️MEDIDOR DE AMOR❤️*\n\n*_El amor de @${who.split("@")[0]} ES DE ${getR}%_*\n\n*_${pregunta}_*`.trim();
    const kz = await decir(juego);
    client.sendMessage(m.chat, { react: { text: "❤️", key: kz.key } });
  }
};

export default plugin;
