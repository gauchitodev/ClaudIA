import { getUser } from "../database-functions.js";
import { numeroActual } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["id"];
// Every admin: the group's WhatsApp admins, the bot's (lib/roles.js) and the owner; not the moderators. It shows the
// number the bot knows, even in a group that hides it, and posts it in the chat. Only the owner can ask about anyone
// the bot knows. An admin asks about the people in that group: otherwise, in a group of their own with the bot, they'd
// get the number behind a LID from any other group, or whose a number is.
plugin.onlyAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants, isOwner }) => {
  const { quien, lid, jid, mencionado, participante, numero, porQue } = await numeroActual(client, m, text, participants);
  if (!mencionado) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  // The same answer whether the bot knows that person or not, so it doesn't tell.
  if (!isOwner && !participante) return client.sendText(m.chat, participants?.length ? "🆔 Solo puedo mostrarte el id de alguien de este grupo." : "No pude ver la lista de miembros del grupo; probá de nuevo en un rato.", m);

  const whoData = quien ? getUser(quien) : null;
  // The number as they have it now (numeroActual): the one the message names, or the group lists them with, or
  // WhatsApp gave, ahead of the one their row has, which stays until a message brings another, and that one only if
  // WhatsApp says it's still theirs. ".id +598…" of whoever has the number now showed the one their row still had,
  // someone else's by then, and so did ".id @persona": with it, ".bloquear +598…" blocked that someone. And only a LID
  // as the LID: the row of someone the bot knows by their number alone is under the number.
  const whoJid = numero || (porQue ? "" : whoData?.jid || "");
  const usuario = whoJid ? `+${whoJid.split("@")[0]}` : porQue === "deOtro" ? "número desconocido: el que tenía anotado ya es de otra persona" : porQue === "sinRespuesta" ? `+${jid.split("@")[0]}, sin confirmar: WhatsApp no me contestó, y puede ser viejo` : "número desconocido";
  const whoLid = [lid, whoData?.lid].find((id) => id?.endsWith("@lid")) || "";

  // Careful: don't name this variable "txt", it shadows the texts global and breaks txt.defaultWho above.
  const info = `Usuario: ${usuario}\n\nNombre actual: ${whoData?.pushName || "—"}\n\nLid: ${whoLid || "—"}\n\nEn la base: ${whoData ? "sí" : "no, todavía no escribió"}\n\nChat actual: ${m.chat}`;
  client.sendText(m.chat, info, m);
};

export default plugin;
