import { fijarVoz, textoVoz, hayVoz, nombreDeLaVoz } from "../lib/voz.js";
import txt from "../lib/strings.js";

// .voz: whether Claudia answers with a voice note in this group (lib/voz.js). .voz on: when they talk to her by voice
// note; .voz aveces: that, and now and then a short answer; .voz siempre: everything she says in the chat; .voz off: text. Admins change it; .voz alone shows how it is.
// Like .iniciativa, it isn't one more switch of config-on-off.js: it has three states and a status to show.
const plugin = {};
plugin.cmd = ["voz", "voice"];
plugin.onlyGroup = true;

const OPCIONES = { on: "audios", prender: "audios", activar: "audios", audios: "audios", audio: "audios", siempre: "siempre", todo: "siempre", aveces: "aveces", "a veces": "aveces", "de vez en cuando": "aveces", off: "", apagar: "", desactivar: "", no: "" };

plugin.run = async (m, { client, args = [], isAdmin, isOwner }) => {
  const opcion = args.join(" ").toLowerCase().trim();
  if (!opcion) return client.sendText(m.chat, textoVoz(m.chat), m);
  if (!(opcion in OPCIONES)) return client.sendText(m.chat, "❌ Las opciones son .voz on (contesto con nota de voz cuando me hablan por nota de voz), .voz aveces (eso y, de vez en cuando, alguna respuesta corta), .voz siempre (todo por voz) y .voz off.", m);
  if (!isAdmin && !isOwner) return client.sendText(m.chat, txt.onlyAdmin, m);
  const modo = OPCIONES[opcion];
  if (!fijarVoz(m.chat, modo)) return client.sendText(m.chat, "❌ No pude guardarlo, probá de nuevo en un rato.", m);
  if (!modo) return client.sendText(m.chat, "⌨️ Listo: vuelvo a contestar por texto.", m);
  // Without the command on the tablet, the setting stays and she goes on by text: said, so nobody waits for a voice.
  const aviso = (await hayVoz()) ? "" : "\n⚠️ Ojo: donde corro todavía no está edge-tts (pip install edge-tts), así que mientras tanto sigo por texto.";
  const como = `con la voz de ${nombreDeLaVoz()}`;
  const texto =
    modo === "siempre"
      ? `🎙️ Listo: en este grupo contesto todo con nota de voz, ${como}. Con .voz on hablo solo cuando me hablan por nota de voz, y con .voz off vuelvo al texto.`
      : modo === "aveces"
        ? `🎙️ Listo: contesto con nota de voz cuando me hablan por nota de voz y, de vez en cuando, alguna respuesta corta, ${como}. Con .voz siempre hablo todo, y con .voz off vuelvo al texto.`
        : `🎙️ Listo: cuando me hablen por nota de voz, contesto con nota de voz, ${como}. Con .voz siempre hablo todo, y con .voz off vuelvo al texto.`;
  return client.sendText(m.chat, texto + aviso, m);
};

export default plugin;
