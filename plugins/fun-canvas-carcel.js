import { superponer } from "../lib/canvas.js";
import { obtenerFotoPerfil } from "../lib/foto-perfil.js";
import { elegirAlAzar } from "../lib/azar.js";

let plugin = {};
plugin.cmd = ["carcel", "cárcel", "preso", "presa"];
plugin.juego = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  const numberMatchesPlus = text.match(/\+[0-9\s]+/g);
  if (numberMatchesPlus && numberMatchesPlus.length > 0) {
    who = numberMatchesPlus[0].replace(/[+\s]/g, "") + "@s.whatsapp.net";
  } else if (numberMatches && numberMatches.length > 0) {
    who = numberMatches[0].replace("@", "").replace(/\s+/g, "") + "@lid";
  } else if (m.quoted) {
    who = m.quoted.sender;
  }
  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  const pp = await obtenerFotoPerfil(client, who);
  m.react("⏳");
  try {
    const years = elegirAlAzar(["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"]);
    const razon = elegirAlAzar(["SER TAN PUTA", "SER TAN LIND@😍", "SER TAN IMBECIL🙄", "SER TAN PAJER@🤣", "ACOSADOR🤢", "INFIEL", "GAY🏳️‍🌈🌈", "TROLA", "CARGAR TANTA BELLEZA😍", "SER TAN FE@🤮", "COMER TANTAS VERGAS🍆"]);
    const imagen = await superponer(pp, "https://i.ibb.co/1tKmnxRy/5856a83e4f6ae202fedf276d.png", { opacidad: 0.8 });
    await client.sendFile(m.chat, imagen, `${Date.now()}.jpg`, txt.carcelMsg(years, razon), m);
  } catch (err) {
    console.error(err);
  }
};

export default plugin;
