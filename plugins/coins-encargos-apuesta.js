import { apostarAlEncargo } from "../lib/encargos.js";
import { leerEntero, limpiarPalabra } from "../lib/comandos.js";

// .apuesto si 50 / .apuesto no 50: a bet on whether whoever has the group's urgent errand makes it (lib/encargos.js).
// It's a bet in a betting market (lib/mercados.js), so it keeps to the same switches as .apostar: .casino off stops
// it, .juegosoff mercados too (lib/juegos-apagados.js), and the games' hours only where the markets keep to them.
const plugin = {};
plugin.cmd = ["apuesto"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true;
plugin.aCualquierHora = true;
plugin.onlyGroup = true;

const SI = new Set(["si", "llega", "sillega"]);
const NO = new Set(["no", "nollega"]);

plugin.run = async (m, { client, args = [] }) => {
  const lado = limpiarPalabra(args.slice(0, -1).join(""));
  const cantidad = leerEntero(args.at(-1));
  if (args.length < 2 || cantidad === null || (!SI.has(lado) && !NO.has(lado))) return client.sendText(m.chat, "Se apuesta así: .apuesto si 50 (a que llega con el encargo) o .apuesto no 50 (a que no). El pozo se reparte entre los que acierten.", m);
  const r = apostarAlEncargo(m.chat, [m.sender, m.senderJid].filter(Boolean), SI.has(lado), cantidad);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
