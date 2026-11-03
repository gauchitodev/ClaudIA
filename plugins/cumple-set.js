import { anotarCumpleDe } from "../lib/cumpleanos.js";
import { lidMencionadoActual, filaDe, esElBot } from "../lib/identidad.js";

// .setcumple @persona 14/03/1995, or replying to one of their messages: an admin notes someone's birthday, or changes
// it, with .cumple's checks (lib/cumpleanos.js) · .setcumple @persona borrar deletes it. The person is who .perfil
// reads them as, so the profile, .cumples and the greeting go by what's noted here.
const plugin = {};
plugin.cmd = ["setcumple"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, participants }) => {
  const usuario = await lidMencionadoActual(client, m, text, participants);
  if (!usuario) return client.sendText(m.chat, "❌ ¿De quién? Mencioná a la persona (elegila de la lista que aparece al escribir @) o respondé un mensaje suyo: .setcumple @persona 14/03/1995", m);
  // Replying to one of her own messages names her.
  if (esElBot([usuario], client)) return client.sendText(m.chat, "❌ Esa soy yo: mencioná a la persona, o respondé un mensaje suyo.", m);
  // Only someone the bot knows, as .perfil and .regalar: an "@" with digits typed by hand that match nobody makes up an
  // id (lidDeDigitos), and a birthday under it would greet no one.
  if (!filaDe(usuario, participants)) return client.sendText(m.chat, "❌ No tengo datos de esa persona todavía: cuando escriba algo en el grupo, se lo podés anotar.", m);

  // The date is what's left once the mentions are stripped, as .adv's reason, so it goes before or after them.
  const r = anotarCumpleDe(m.chat, usuario, String(text || "").replace(/@\d{3,}/g, ""));
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m, r.mentions ? { mentions: r.mentions } : undefined);
};

export default plugin;
