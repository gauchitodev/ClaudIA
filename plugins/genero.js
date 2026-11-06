import { lidMencionadoActual, filaDe, esElBot, mismaPersona } from "../lib/identidad.js";
import { leerGenero, generoDe, ponerGenero } from "../lib/genero.js";

// .genero mujer / .genero hombre: how Claudia addresses you in the chat, what .perfil says and how your rank reads
// (lib/genero.js). .genero shows it and .genero borrar takes it out: then she goes by the name, as always. An admin
// sets someone else's with .genero @persona mujer, as .setcumple does with the birthday. Only those two, as asked.
const plugin = {};
plugin.cmd = ["genero"];
plugin.onlyGroup = true;

const TRATO = { mujer: "en femenino", hombre: "en masculino" };

plugin.run = async (m, { client, text, participants, isAdmin, isOwner }) => {
  const mencionado = await lidMencionadoActual(client, m, text, participants);
  const otro = mencionado && !mismaPersona([m.sender, m.senderJid].filter(Boolean), [mencionado]) ? mencionado : null;
  // The word is what's left once the mentions are stripped, so it goes before or after them.
  const palabra = String(text || "").replace(/@\d{3,}/g, "").trim();
  const pedido = leerGenero(palabra); // "hombre", "mujer", "" to take it out, or undefined

  if (otro) {
    // Replying to one of her own messages names her.
    if (esElBot([otro], client)) return client.sendText(m.chat, "❌ Esa soy yo: mencioná a la persona, o respondé un mensaje suyo.", m);
    if (!isAdmin && !isOwner) return client.sendText(m.chat, "❌ El género de otra persona se lo anota un admin. El tuyo lo ponés vos: .genero mujer o .genero hombre.", m);
    // Only someone the bot knows, as .setcumple: an "@" with digits typed by hand that match nobody makes up an id.
    if (!filaDe(otro, participants)) return client.sendText(m.chat, "❌ No tengo datos de esa persona todavía: cuando escriba algo en el grupo, se lo podés anotar.", m);
    const arroba = `@${otro.split("@")[0]}`;
    const opciones = { mentions: [otro] };
    if (!palabra) {
      const genero = generoDe(otro);
      const texto = genero
        ? `🚻 ${arroba} tiene anotado: ${genero}. Con .genero ${arroba} ${genero === "mujer" ? "hombre" : "mujer"} se lo cambiás y con .genero ${arroba} borrar se lo sacás.`
        : `🚻 ${arroba} no tiene el género anotado: me guío por su nombre. Se lo anotás con .genero ${arroba} mujer o .genero ${arroba} hombre.`;
      return client.sendText(m.chat, texto, m, opciones);
    }
    if (pedido === undefined) return client.sendText(m.chat, `❌ Decime hombre o mujer: .genero ${arroba} mujer (o borrar, para sacárselo).`, m, opciones);
    if (!ponerGenero(otro, pedido)) return client.sendText(m.chat, "❌ No pude guardarlo, probá de nuevo en un rato.", m);
    const listo = pedido ? `✅ Listo: a ${arroba} ${pedido === "mujer" ? "la" : "lo"} trato ${TRATO[pedido]}, y su perfil lo dice.` : `✅ Listo: le saqué el género a ${arroba}; me guío por su nombre, como siempre.`;
    return client.sendText(m.chat, listo, m, opciones);
  }

  if (!palabra) {
    const genero = generoDe(m.sender);
    return client.sendText(m.chat, genero ? `🚻 Tenés anotado: ${genero}. Con .genero ${genero === "mujer" ? "hombre" : "mujer"} lo cambiás y con .genero borrar lo sacás.` : "🚻 No tenés el género anotado: me guío por tu nombre. Ponelo con .genero mujer o .genero hombre.", m);
  }
  if (pedido === undefined) return client.sendText(m.chat, "❌ Decime hombre o mujer: .genero mujer o .genero hombre (.genero borrar lo saca).", m);
  if (!ponerGenero(m.sender, pedido)) return client.sendText(m.chat, "❌ No pude guardarlo, probá de nuevo en un rato.", m);
  return client.sendText(m.chat, pedido ? `✅ Listo: te trato ${TRATO[pedido]}, y tu perfil lo dice.` : "✅ Listo: te saqué el género; me guío por tu nombre, como siempre.", m);
};

export default plugin;
