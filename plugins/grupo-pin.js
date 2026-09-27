const plugin = {};
plugin.cmd = ["pin", "fijar", "destacar", "unpin", "desfijar"];
plugin.onlyGroup = true;
plugin.onlyMod = true;
plugin.botAdmin = true;

// The only durations WhatsApp offers for a pin, in seconds. With none, 7 days, like WhatsApp itself.
const DURACIONES = [
  { segundos: 86400, claves: ["24h", "24", "1d", "1", "dia", "día"] },
  { segundos: 604800, claves: ["7d", "7", "semana"] },
  { segundos: 2592000, claves: ["30d", "30", "mes"] },
];
const POR_DEFECTO = DURACIONES[1];
const QUITAR = /^(quitar|sacar|off)$/i;
// proto.PinInChat.Type in the installed Baileys: 1 pins for everyone, 2 unpins (0 is UNKNOWN_TYPE, not "unpin").
const FIJAR = 1;
const DESFIJAR = 2;

// Answering a message: .pin [24h|7d|30d] pins it for everyone · .unpin (or .pin quitar) takes it off. Moderators and
// admins; the bot has to be a group admin for WhatsApp to take it.
plugin.run = async (m, { client, command, args }) => {
  const opcion = (args[0] || "").toLowerCase();
  const desfijar = command === "unpin" || command === "desfijar" || QUITAR.test(opcion);
  if (!m.quoted?.id) {
    const aviso = desfijar ? "Respondé al mensaje fijado con .unpin para sacarlo." : "Respondé al mensaje que querés fijar con .pin (dura 7 días; también .pin 24h o .pin 30d).";
    return client.sendText(m.chat, aviso, m);
  }

  const duracion = desfijar || !opcion ? POR_DEFECTO : DURACIONES.find((d) => d.claves.includes(opcion));
  if (!duracion) return client.sendText(m.chat, "WhatsApp solo deja fijar por 24h, 7d o 30d. Por ejemplo: .pin 24h", m);

  const key = { remoteJid: m.chat, fromMe: m.quoted.fromMe, id: m.quoted.id, participant: m.quoted.sender };
  // WhatsApp itself tells the group who pinned what and for how long; the reaction only confirms the command.
  await client.sendMessage(m.chat, desfijar ? { pin: key, type: DESFIJAR } : { pin: key, type: FIJAR, time: duracion.segundos });
  await m.react(desfijar ? "✔️" : "📌");
};

export default plugin;
