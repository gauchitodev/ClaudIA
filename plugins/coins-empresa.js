import { empresaDe, fundar, textoFundar, textoEmpresa, textoEmpresas, textoBienes, service, depositar, retirar } from "../lib/empresas.js";
import { deQuienEsActual } from "../lib/identidad.js";
import { nombreDe } from "../lib/menciones.js";
import { leerEntero } from "../lib/comandos.js";

// "Modo patrón" (lib/empresas.js): .fundar <nombre> founds the company of your trade, .empresa is its board (or
// someone else's, with a mention), .empresas lists the group's, .bienes what it can buy (bought with .comprar,
// plugins/coins-comprar.js), .service fixes what's worn and .caja moves money between the pocket and the company.
const plugin = {};
plugin.cmd = ["empresa", "empresas", "fundar", "caja", "bienes", "service"];
plugin.economia = true;
plugin.onlyGroup = true;

const SIN_EMPRESA = "No tenés empresa. Se funda con .fundar <nombre>, siendo nivel 10 de tu oficio: mirá .fundar";

plugin.run = async (m, { client, command, args = [], text, participants }) => {
  const cmd = command.toLowerCase();
  const responder = (r) => client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m, r.mentions ? { mentions: r.mentions } : {});

  if (cmd === "empresas") return client.sendText(m.chat, textoEmpresas(m.chat), m);

  if (cmd === "fundar") {
    if (!args.length) return client.sendText(m.chat, textoFundar(), m);
    return responder(fundar(m.chat, m.sender, args.join(" ")));
  }

  if (cmd === "empresa") {
    const lid = (await deQuienEsActual(client, m, text, participants)) || m.sender;
    const e = empresaDe(m.chat, lid);
    if (!e) return client.sendText(m.chat, lid === m.sender ? `${SIN_EMPRESA}\nLas del grupo están en .empresas` : `${nombreDe(lid)} no tiene empresa. Las del grupo están en .empresas`, m);
    return client.sendText(m.chat, textoEmpresa(e, { propio: lid === m.sender }), m);
  }

  if (cmd === "bienes") {
    const e = empresaDe(m.chat, m.sender);
    return client.sendText(m.chat, e ? textoBienes(e) : SIN_EMPRESA, m);
  }

  if (cmd === "service") return responder(service(m.chat, m.sender, args.join(" ")));

  // .caja: the balance; .caja depositar 100 / .caja retirar 100
  const e = empresaDe(m.chat, m.sender);
  if (!e) return client.sendText(m.chat, SIN_EMPRESA, m);
  const accion = (args[0] || "").toLowerCase();
  const monto = leerEntero(args[1]);
  if (["depositar", "poner", "meter"].includes(accion)) return responder(depositar(m.chat, m.sender, monto));
  if (["retirar", "sacar"].includes(accion)) return responder(retirar(m.chat, m.sender, monto));
  await client.sendText(m.chat, `💰 En la caja de *${e.nombre}* hay ${e.caja} UruCoins.\n.caja depositar 100 pone plata de tu bolsillo y .caja retirar 100 la saca (la DGI se queda una parte).`, m);
};

export default plugin;
