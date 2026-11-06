import { textoEconomia } from "../lib/economia.js";
import { getUser, ganarCoins, gastarCoins, getSaldoCoins } from "../database-functions.js";
import { lidMencionadoActual } from "../lib/identidad.js";
import { leerEntero } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["economia", "ajustar"];
plugin.onlyGroup = true;
plugin.onlyAdmin = true;

// .economia [days]: dashboard for admins · .ajustar @x 50 [reason] or .ajustar @x -50 [reason]:
// manual correction, owner only
plugin.run = async (m, { client, args, text, command, isOwner, participants }) => {
  if (command !== "ajustar") {
    const dias = Math.min(90, Math.max(1, parseInt(args[0], 10) || 7));
    const r = textoEconomia(m.chat, dias);
    return client.sendMessage(m.chat, { text: r.texto, mentions: r.mentions }, { quoted: m });
  }

  if (!isOwner) return client.sendText(m.chat, txt.onlyOwner, m);
  const who = await lidMencionadoActual(client, m, text, participants); // the old regex swallowed the amount that came after the mention
  const destinatario = who ? getUser(who) : null;
  // The first word that is an amount, a minus sign taking coins away (lib/comandos.js): "1.000" is a thousand.
  const cantidad = args.map((a) => leerEntero(a, { negativos: true })).find((n) => n !== null) ?? NaN;
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
