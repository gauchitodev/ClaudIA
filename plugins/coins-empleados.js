import { ofrecer, contratarNPC, firmar, contraofertar, rechazarOferta, despedir, textoOfertas } from "../lib/empresas.js";
import { lidMencionadoActual, esElBot } from "../lib/identidad.js";
import { leerEntero } from "../lib/comandos.js";

// The staff of "modo patrón" (lib/empresas.js). An owner offers a post with .contratar @persona chofer 40 and the
// other one answers: .firmar takes it, .contraoferta 50 asks for another wage (the owner takes that with
// .firmar @persona) and .rechazaroferta turns it down. .contratar claudia chofer brings one of Claudia's own.
// .despedir @persona (or .despedir 2, the number on the board) fires with severance pay; .ofertas lists what's on
// the table. .aceptar and .rechazar are the couples'.
const plugin = {};
plugin.cmd = ["contratar", "despedir", "firmar", "contraoferta", "rechazaroferta", "ofertas"];
plugin.economia = true;
plugin.onlyGroup = true;

const DE_CLAUDIA = ["claudia", "npc", "bot"];
const sinAcentos = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

plugin.run = async (m, { client, command, args = [], text, participants }) => {
  const cmd = command.toLowerCase();
  const responder = (r) => client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m, r.mentions?.length ? { mentions: r.mentions } : {});
  if (cmd === "ofertas") return client.sendText(m.chat, textoOfertas(m.chat, m.sender), m);

  const who = await lidMencionadoActual(client, m, text, participants);
  // What's written besides the mention: the words (the post) and the first amount (the wage).
  const palabras = args.filter((a) => !a.startsWith("@"));
  const monto = palabras.map((a) => leerEntero(a)).find((n) => n !== null) ?? null;
  const letras = palabras.filter((a) => leerEntero(a) === null);

  if (cmd === "contratar") {
    // One of Claudia's own: by the word, or by naming her.
    const deClaudia = DE_CLAUDIA.includes(sinAcentos(letras[0])) || (who && esElBot(who, client));
    if (deClaudia) return responder(contratarNPC(m.chat, m.sender, letras.filter((a) => !DE_CLAUDIA.includes(sinAcentos(a))).join(" ")));
    if (!who) return client.sendText(m.chat, "Uso: .contratar @persona chofer 40 (puesto y sueldo por día), o .contratar claudia chofer para uno de los míos. Los puestos están en .puestos", m);
    return responder(ofrecer(m.chat, m.sender, who, letras.join(" "), monto));
  }

  if (cmd === "despedir") {
    // With a mention, that person; with a number alone, whoever has it on the board.
    return responder(despedir(m.chat, m.sender, who && !esElBot(who, client) ? { usuario: who } : { numero: monto }));
  }

  const otro = who && !esElBot(who, client) && who !== m.sender ? who : null;
  if (cmd === "firmar") return responder(firmar(m.chat, m.sender, otro));
  if (cmd === "contraoferta") return responder(contraofertar(m.chat, m.sender, monto, otro));
  return responder(rechazarOferta(m.chat, m.sender, otro));
};

export default plugin;
