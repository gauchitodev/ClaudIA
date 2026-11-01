import { numeroActual, numeroSinConfirmar, lidSegunWhatsApp } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["bloquear", "desbloquear"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // The number as they have it now (numeroActual): a LID is what it used to be handed, of someone with no number known.
  const { numero, mencionado, porQue, segunWhatsApp } = await numeroActual(client, m, text, participants);
  if (!mencionado) return;
  if (porQue) return client.sendText(m.chat, numeroSinConfirmar(porQue, `${usedPrefix}${command}`), m);
  if (!numero) return client.sendText(m.chat, "No sé el número de esa persona, así que no la puedo bloquear.", m);

  // What WhatsApp blocks is a LID: handed the number, Baileys takes the one its own store has for it, which may be
  // whoever had the number before, and asks WhatsApp only when it has none (updateBlockStatus, Socket/chats.js). The
  // one WhatsApp says has it now goes in that store first (lidMapping), and without an answer nobody is blocked: the
  // store's would be a guess.
  const accion = command === "bloquear" ? "block" : "unblock";
  const lid = (segunWhatsApp?.numero === numero && segunWhatsApp.lid) || (await lidSegunWhatsApp(client, numero));
  if (!lid) return client.sendText(m.chat, `No pude confirmar con WhatsApp de quién es ese número ahora, así que no lo ${accion === "block" ? "bloqueo" : "desbloqueo"}. Probá de nuevo en un rato.`, m);
  try {
    await client.signalRepository?.lidMapping?.storeLIDPNMappings?.([{ lid, pn: numero }]);
    await client.updateBlockStatus(numero, accion);
    m.react("☑️");
  } catch (e) {
    client.sendText(m.chat, `No pude ${command}: ${e?.message || "error"}`, m);
  }
};

export default plugin;
