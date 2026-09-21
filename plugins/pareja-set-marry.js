import { setTimeout as esperar } from "node:timers/promises";
import { fijarCasamiento, dosPersonas, tiempoIndicado, AVISO_DOS_PERSONAS } from "../lib/parejas.js";

// .setmarry @a @b [| 3 días]: the owner marries a couple, with however long they've been married.
const plugin = {};
plugin.cmd = ["setmarry"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text }) => {
  const personas = dosPersonas(m, text);
  if (!personas) return client.sendText(m.chat, AVISO_DOS_PERSONAS, m);
  const tiempo = tiempoIndicado(text);
  if (tiempo === null) return client.sendText(m.chat, "Formato de tiempo incorrecto. Asegúrate de usar días, horas o minutos válidos.", m);

  const [a, b] = personas;
  const r = fijarCasamiento(a, b, Date.now() - tiempo);
  if (!r.ok) return client.sendText(m.chat, "💍 *Antes de casarse, primero deben ser pareja!*\nUsa: `.setpareja @user1 @user2`", m);

  const kz = await client.sendText(m.chat, txt.parejaCasamientoSuccess(a, b), m);
  await esperar(700);
  for (const emoji of ["💗", "❤️‍🔥", "🩵", "💚", "💛", "🩷", "❤️"]) {
    await client.sendMessage(m.chat, { react: { text: emoji, key: kz.key } });
    await esperar(700);
  }
};

export default plugin;
