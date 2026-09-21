import { estaEnListaNegra } from "../lib/lista-negra.js";
import { expulsar } from "../lib/identidad.js";

// Red de contención de la lista negra: si alguien anotado llegó a entrar igual, se lo saca apenas escribe. La
// expulsión al entrar la hace main.js con el evento de participantes; esta cubre a quien ya estaba adentro cuando lo
// anotaron y al que el bot no pudo reconocer en ese momento.
const plugin = (m) => m;
plugin.before = async (m, { client, participants, isBotAdmin, isRAdmin }) => {
  if (isRAdmin) return;
  if (!isBotAdmin) return;
  if (!m.isGroup) return;
  if (m.messageStubType) return;

  // Se busca por las dos identidades: el número con el que se lo anotó y el LID con el que escribe. Antes se miraba
  // solo el número, que en los grupos nuevos muchas veces no viene en el mensaje.
  const encontrado = estaEnListaNegra([m.senderJid, m.sender], m.chat, participants);
  if (!encontrado) return;

  // borrar el mensaje y eliminar al usuario.
  await m.delete();
  const { ok, status } = await expulsar(client, m.chat, encontrado.participante?.id || m.sender);
  if (!ok) {
    console.error("[lista negra] no se pudo expulsar de", m.chat, status);
    return true;
  }
  await client.sendText(m.chat, txt.blackList(m.senderJid || m.sender, encontrado.entrada.reason), null, { mentions: [m.sender] });
  return true;
};

export default plugin;
