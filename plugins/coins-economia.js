import { textoEconomia } from "../lib/economia.js";
import { getUser, ganarCoins, gastarCoins, getSaldoCoins } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["economia", "economía", "ajustar"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

// .economia [días]: panel para admins · .ajustar @x 50 [motivo] o .ajustar @x -50 [motivo]: corrección a mano, solo owner
plugin.run = async (m, { client, args, text, command, isOwner }) => {
  if (command !== "ajustar") {
    const dias = Math.min(90, Math.max(1, parseInt(args[0], 10) || 7));
    const r = textoEconomia(m.chat, dias);
    return client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
  }

  if (!isOwner) return client.sendText(m.chat, txt.onlyOwner, m);
  let who;
  const numberMatches = text.match(/@[0-9\s]+/g);
  if (numberMatches && numberMatches.length > 0) who = `${numberMatches[0].replace("@", "").replace(/\s+/g, "")}@lid`;
  else if (m.quoted) who = m.quoted.sender;
  const destinatario = who ? getUser(who) : null;
  const cantidad = parseInt(args.find((a) => /^-?\d+$/.test(a)), 10);
  if (!destinatario?.lid || Number.isNaN(cantidad) || cantidad === 0) return client.sendText(m.chat, "Uso: .ajustar @persona 50 [motivo] para dar, o .ajustar @persona -50 [motivo] para sacar.", m);
  const motivo = args.filter((a) => !/^-?\d+$/.test(a) && !a.startsWith("@")).join(" ").trim();

  if (cantidad > 0) ganarCoins(m.chat, destinatario.lid, cantidad, "ajuste_owner");
  else if (!gastarCoins(m.chat, destinatario.lid, -cantidad, "ajuste_owner")) {
    return client.sendText(m.chat, `No se puede: tiene ${getSaldoCoins(m.chat, destinatario.lid)} UruCoins y le querés sacar ${-cantidad}.`, m);
  }
  await client.sendMessage(
    m.chat,
    { text: `🪙 ${cantidad > 0 ? "Le diste" : "Le sacaste"} *${Math.abs(cantidad)} UruCoins* a @${destinatario.lid.split("@")[0]}${motivo ? ` (${motivo})` : ""}. Le quedan ${getSaldoCoins(m.chat, destinatario.lid)}.`, mentions: [destinatario.lid] },
    { quoted: m },
  );
};

export default plugin;
