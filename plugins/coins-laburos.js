import { textoLaburos, buscarOficio, tomarLaburo, renunciar } from "../lib/laburos.js";
import { cobrarConEscena, anotarMensajeDeEscena, elegirEnEscena } from "../lib/escenas.js";
import { marcarMensajeDeJuego } from "../lib/mensajes-de-juego.js";
import { jornadaDelPatron, cobrarComoEmpleado, yaCobroComoEmpleado, renunciarAlPuesto } from "../lib/empresas.js";

const plugin = {};
plugin.cmd = ["laburos", "laburo", "trabajo", "trabajos", "cobrar", "renunciar", "elegir"];
plugin.economia = true;
plugin.onlyGroup = true;

plugin.run = async (m, { client, command, args }) => {
  const cmd = command.toLowerCase();

  // .elegir 2: the answer to the scene a payday came with, for whoever would rather not send a bare number.
  if (cmd === "elegir") {
    const r = elegirEnEscena(m.chat, m.sender, Number(args[0]));
    if (!r) return client.sendText(m.chat, "No tenés ninguna escena para resolver. Aparecen a veces al cobrar el sueldo (.cobrar).", m);
    return client.sendText(m.chat, r.ok ? r.texto : `❌ ${r.error}`, m);
  }

  if (cmd === "cobrar") {
    // Whoever works in a company (lib/empresas.js) is paid by it, from its cash box, and their shift bills for it.
    // With no money there for the wage, they collect their trade's wage as always, after the notice to the owner.
    const empleado = cobrarComoEmpleado(m.chat, m.sender);
    if (empleado && !empleado.sinCaja) return client.sendText(m.chat, empleado.ok ? empleado.mensaje : `❌ ${empleado.error}`, m, empleado.mentions ? { mentions: empleado.mentions } : {});
    // One pay a day: paid as an employee and then out of the company (they quit, or were fired), the trade's waits.
    if (!empleado && yaCobroComoEmpleado(m.chat, m.sender)) return client.sendText(m.chat, "❌ Ya cobraste hoy. El sueldo es una vez por día.", m);
    // The trade's own payday: the day's event or, some days, a scene to answer (lib/escenas.js).
    const r = cobrarConEscena(m.chat, m.sender);
    const propio = r.ok ? r.mensaje : `❌ ${r.error}`;
    let texto = propio;
    if (empleado) texto = `${empleado.aviso}\n\n${propio}`;
    else {
      // A company owner (lib/empresas.js) also works their day's shift for it, with or without a wage of their own.
      const jornada = jornadaDelPatron(m.chat, m.sender);
      if (jornada?.ok) texto = `${r.ok ? `${r.mensaje}\n\n` : ""}${jornada.mensaje}`;
    }
    const enviado = await client.sendText(m.chat, texto, m, empleado ? { mentions: empleado.mentions } : {});
    // The message a scene went out as is noted: a number quoting it answers it, whatever else is being played.
    if (r.escena) {
      anotarMensajeDeEscena(m.chat, m.sender, enviado?.key?.id);
      marcarMensajeDeJuego(enviado?.key?.id, null, { juego: "escena" });
    }
    return;
  }

  if (cmd === "renunciar") {
    // With a post in a company, that's what they leave: the trade stays, and a second .renunciar leaves it.
    const puesto = renunciarAlPuesto(m.chat, m.sender);
    if (puesto) return client.sendText(m.chat, puesto.mensaje, m, { mentions: puesto.mentions });
    const r = renunciar(m.chat, m.sender);
    return client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
  }

  // .laburos / .laburo with no name → the list; .laburo <name> → take it
  const clave = buscarOficio(args.join(" "));
  if (!clave) {
    if (args.length > 0) return client.sendText(m.chat, "Ese laburo no existe. Mirá la lista con .laburos", m);
    return client.sendText(m.chat, textoLaburos(m.chat, m.sender), m);
  }
  const r = tomarLaburo(m.chat, m.sender, clave);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
