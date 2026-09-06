import { fijarPareja, dosPersonas, tiempoIndicado, AVISO_DOS_PERSONAS } from "../lib/parejas.js";

// .setpareja @a @b [| 3 días]: el owner arma una pareja de una, con el tiempo que lleven.
const plugin = {};
plugin.cmd = ["setpareja"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text }) => {
  const personas = dosPersonas(m, text);
  if (!personas) return client.sendText(m.chat, AVISO_DOS_PERSONAS, m);
  const tiempo = tiempoIndicado(text);
  if (tiempo === null) return client.sendText(m.chat, "Formato de tiempo incorrecto. Asegúrate de usar días, horas o minutos válidos.", m);

  const [a, b] = personas;
  fijarPareja(a, b, Date.now() - tiempo);
  const kz = await client.sendText(m.chat, txt.parejaAccept(a, b), m);
  client.sendMessage(m.chat, { react: { text: "❤️", key: kz.key } });
};

export default plugin;
