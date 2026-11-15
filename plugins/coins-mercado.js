import { jugar, buscarOpcion, textoListaApuestas, enviarTarjetaMercado } from "../lib/mercados.js";
import { textoPartidos } from "../lib/partidos.js";
import { getMercado, mercadosDeChat, mercadoDelMensaje } from "../database-functions.js";
import { leerEntero } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["apostar", "apuestas", "jugar", "mercados", "mercado", "partidos"];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true; // .casino off stops these
plugin.aCualquierHora = true; // and the .horariojuegos schedule doesn't, unless .horariojuegos mercados on (handle-message.js)
plugin.onlyGroup = true;

const numeroDe = (texto) => /^\d+$/.test(texto || "") && Number.isSafeInteger(Number(texto)) && Number(texto) > 0 ? Number(texto) : null;

plugin.run = async (m, { client, args = [], command, chat }) => {

  // .partidos [competition]: the matches of the next week, with the number an admin opens their markets with.
  if (command === "partidos") return client.sendText(m.chat, textoPartidos(m.chat, args.join(" "), { fila: chat }), m);

  if (["apuestas", "mercados", "mercado"].includes(command)) {
    if (!args.length && command !== "mercado") {
      const lista = mercadosDeChat(m.chat);
      if (lista.length === 1) return enviarTarjetaMercado(client, lista[0], { quoted: m });
      return client.sendText(m.chat, textoListaApuestas(m.chat, lista), m);
    }
    const id = numeroDe(args[0]);
    const mercado = id ? getMercado(id) : null;
    if (!mercado || mercado.chat !== m.chat) return client.sendText(m.chat, "No encuentro esa apuesta en este grupo. Escribí .apuestas para ver las disponibles.", m);
    return enviarTarjetaMercado(client, mercado, { quoted: m });
  }

  // A reply is bound by the id we recorded when sending its card, never by numbers in quoted text. Each card is one
  // market, so the result at 90 minutes can't be confused with who qualifies. Cross-chat quotes don't choose a market.
  const citado = m.quoted && (!m.quoted.chat || m.quoted.chat === m.chat) ? mercadoDelMensaje(m.chat, m.quoted.id) : null;
  const opcionCorta = args.slice(0, -1).join(" ");
  // A numeric option name ("2 goles") in a reply takes precedence over interpreting its first word as a market id.
  const completo = command === "jugar" || (args.length >= 3 && numeroDe(args[0]) !== null && (!citado || (numeroDe(args[0]) === citado.id && buscarOpcion(citado, opcionCorta) === -1)));
  const id = completo ? numeroDe(args[0]) : citado?.id;
  // The amount as people write it here (lib/comandos.js): "1.000" is a thousand, and parseInt read it as 1.
  const cantidad = leerEntero(args[args.length - 1]);
  const opcion = completo ? args.slice(1, -1).join(" ") : opcionCorta;
  if (!id || cantidad === null || !opcion || args.length < (completo ? 3 : 2)) {
    return client.sendText(m.chat, "Para apostar, respondé a la tarjeta con .apostar Nacional 20 (o el equipo u opción que elijas).\n.apuestas muestra las disponibles.\nSin responder a una tarjeta: .apostar 7 Nacional 20, usando el número de la apuesta.", m);
  }
  const r = jugar(m.chat, m.sender, id, opcion, cantidad);
  await client.sendText(m.chat, r.ok ? r.mensaje : `❌ ${r.error}`, m);
};

export default plugin;
