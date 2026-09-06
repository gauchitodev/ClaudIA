import { obtenerFotoPerfil, AVATAR_DEFAULT } from "../lib/foto-perfil.js";

const plugin = {};
plugin.cmd = ["gpu", "getppuser"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyMod = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  const numberMatchesPlus = text.match(/\+\d[\d\s-]*/g);
  if (numberMatchesPlus && numberMatchesPlus.length > 0) {
    who = `${numberMatchesPlus[0].replace(/[^\d]/g, "")}@s.whatsapp.net`;
  } else if (numberMatches && numberMatches.length > 0) {
    who = `${numberMatches[0].replace("@", "").replace(/\s+/g, "")}@lid`;
  } else if (m.quoted) {
    who = m.quoted.sender;
  }
  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);

  // obtenerFotoPerfil traduce el @lid al número real; si devuelve el avatar genérico es que no hay foto visible.
  const pp = await obtenerFotoPerfil(client, who);
  if (!pp || pp === AVATAR_DEFAULT) return client.sendText(m.chat, txt.defaultNoPP, m);
  await client.sendFile(m.chat, pp, "pp.jpg", null, m);
};

export default plugin;
