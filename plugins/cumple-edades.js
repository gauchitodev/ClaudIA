import { textoEdades, EDADES } from "../lib/cumpleanos.js";
import { estaEnGrupo, conIndice } from "../lib/identidad.js";
import { leerEntero } from "../lib/comandos.js";

// .agedist (or .distedad, .edades): how the group's ages spread, from the birthdays noted with .cumple, in bands of 5
// years, and by generation (lib/cumpleanos.js). .agedist 2 makes the bands of 2 years, from 1 to EDADES.ANCHO_MAX.
// Whoever isn't in the group anymore doesn't count, as in .cumples; with no list of the group at hand, everyone does.
const plugin = {};
plugin.cmd = ["agedist", "distedad", "edades"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, text, usedPrefix = ".", participants }) => {
  const pedido = String(text || "").trim();
  const ancho = pedido ? leerEntero(pedido) : EDADES.ANCHO;
  if (!(ancho >= 1 && ancho <= EDADES.ANCHO_MAX)) {
    return client.sendText(m.chat, `Para tramos de otro tamaño: ${usedPrefix}agedist 2 (de 1 a ${EDADES.ANCHO_MAX} años por tramo). Solo, en tramos de ${EDADES.ANCHO}.`, m);
  }
  const { texto } = textoEdades(m.chat, { enElGrupo: participants?.length ? estaEnGrupo(conIndice(participants)) : null, ancho });
  await client.sendText(m.chat, texto, m);
};

export default plugin;
