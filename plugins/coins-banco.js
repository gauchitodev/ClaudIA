import { textoBanco, textoClearing, textoCondiciones, textoRemates, hacerPlazoFijo, romperPlazoFijo, pedirPrestamo, pagarPrestamo, pagarAPersona, ofrecerPrestamo, firmarPrestamo, rechazarPrestamo, ofertar, presionarTasa, tasaDe } from "../lib/banco.js";
import { puebloActivo } from "../lib/pueblo.js";
import { lidMencionadoActual } from "../lib/identidad.js";
import { leerEntero } from "../lib/comandos.js";

// The Banco Central of the town (lib/banco.js). .banco: the board · .plazofijo 500 90 / .romperplazo 1 · .prestamo
// (what it lends you) / .prestamo 500 4 [caja] · .pagar [monto|todo] to the bank, .pagar @persona [monto] to a
// neighbour · .prestar @persona 200 10 14, answered with .firmarprestamo or .rechazarprestamo · .clearing · .remate
// and .ofertar 300 · .tasa baja|sube (the intendente).
const plugin = {};
plugin.cmd = ["banco", "plazofijo", "romperplazo", "prestamo", "pagar", "prestar", "firmarprestamo", "rechazarprestamo", "clearing", "remate", "ofertar", "tasa"];
plugin.economia = true;
plugin.onlyGroup = true;

// The amounts written after the command, as people write them ("1.000" is a thousand), leaving out a mention.
const numeros = (args) => args.filter((a) => !String(a).startsWith("@")).map((a) => leerEntero(String(a).replace("%", ""))).filter((n) => n !== null);

plugin.run = async (m, { client, command, args = [], text, participants }) => {
  const cmd = command.toLowerCase();
  const quien = m.sender;
  const mandar = (texto, mentions = []) => client.sendText(m.chat, texto, m, mentions.length ? { mentions } : {});
  const responder = (r) => mandar(r.ok ? r.mensaje : `❌ ${r.error}`, r.mentions || []);
  const nums = numeros(args);
  const palabras = args.map((a) => String(a).toLowerCase());

  if (cmd === "banco") {
    const r = textoBanco(m.chat, quien);
    return mandar(r.texto, r.mentions);
  }
  if (cmd === "clearing") return mandar(textoClearing(m.chat).texto);
  if (cmd === "remate") return mandar(textoRemates(m.chat));
  if (cmd === "plazofijo") return responder(hacerPlazoFijo(m.chat, quien, nums[0] ?? NaN, nums[1] ?? NaN));
  if (cmd === "romperplazo") return responder(romperPlazoFijo(m.chat, quien, nums[0] ?? null));
  if (cmd === "prestamo") {
    if (!nums.length) return mandar(textoCondiciones(m.chat, quien));
    return responder(pedirPrestamo(m.chat, quien, nums[0], nums[1] ?? NaN, palabras.includes("caja") || palabras.includes("empresa") ? "caja" : "bolsillo"));
  }
  if (cmd === "ofertar") return responder(nums.length > 1 ? ofertar(m.chat, quien, nums[1], nums[0]) : ofertar(m.chat, quien, nums[0] ?? NaN));
  if (cmd === "tasa") {
    if (!args.length) {
      if (!puebloActivo(m.chat)) return responder(presionarTasa(m.chat, quien, ""));
      return mandar(`📈 La tasa de referencia está en *${tasaDe(m.chat)} % anual*: .banco muestra todo. El intendente la aprieta con .tasa baja o .tasa sube.`);
    }
    return responder(presionarTasa(m.chat, [m.sender, m.senderJid], palabras[0]));
  }

  // The rest name someone: a mention or a reply to one of their messages.
  const otro = ["pagar", "prestar", "firmarprestamo", "rechazarprestamo"].includes(cmd) ? await lidMencionadoActual(client, m, text, participants) : null;
  if (cmd === "pagar") {
    const monto = palabras.includes("todo") ? null : (nums[0] ?? null);
    return responder(otro && otro !== quien ? pagarAPersona(m.chat, quien, otro, monto) : pagarPrestamo(m.chat, quien, monto));
  }
  if (cmd === "prestar") return responder(ofrecerPrestamo(m.chat, quien, otro, nums[0] ?? NaN, nums[1] ?? NaN, nums[2] ?? NaN));
  if (cmd === "firmarprestamo") return responder(firmarPrestamo(m.chat, quien, otro));
  if (cmd === "rechazarprestamo") return responder(rechazarPrestamo(m.chat, quien, otro));
};

export default plugin;
