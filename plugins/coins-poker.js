import { CMD, POKER, EMPEZAR, mesaDe, abrirOSentarse, arrancar, levantarse, cancelar, textoMesa } from "../lib/poker.js";
import { leerEntero, limpiarNombre } from "../lib/comandos.js";
import { marcarMensajeDeJuego } from "../lib/mensajes-de-juego.js";

// .poker: Texas Hold'em among the group (lib/poker.js has the table, the hands and the chips).
//   .poker            the table if there is one, or how it's played
//   .poker 100        opens the table with that buy-in (50 to 100), or sits you down at the one open (same buy-in)
//   .poker empezar    the opener deals the first hand, with two or more seated (.poker arrancar too; lib/poker.js)
//   .poker salir      stands you up with your chips (.levantarme and .pleave do the same; plugins/coins-poker-mesa.js)
//   .poker cancelar   an admin closes the table (.delpoker does the same)
// Money comes in here, so it carries the casino's flags like the blackjack: the casino switch, the game hours and the
// coins switch stop it. The actions and leaving live in coins-poker-mesa.js, without the casino flag, so a hand that
// started before closing time is played out and chips can always leave the table.
const plugin = {};
plugin.cmd = [...CMD.poker];
plugin.economia = true;
plugin.juego = true;
plugin.casino = true;
plugin.onlyGroup = true;

const AYUDA = `🃏 *Póker (Texas Hold'em)* — uso: .${CMD.poker[0]} <entrada>

Una mesa por grupo, de 2 a ${POKER.ASIENTOS_MAX}. El primero fija la entrada (de ${POKER.ENTRADA_MIN} a ${POKER.ENTRADA_MAX} UruCoins) y los demás se sientan con .${CMD.poker[0]} <esa entrada>. Cuando están todos, el que abrió la mesa la arranca con .${CMD.poker[0]} ${EMPEZAR[0]}; si no, reparto yo a los ${Math.round(POKER.ARRANQUE_MS / 60_000)} minutos de sentarse el segundo, o apenas se llena. Las fichas son tus UruCoins: las ciegas son el 5 % y el 10 % de la entrada, y no hay límite para subir.
Las cartas te las digo por privado: en cada mano, escribime .${CMD.cartas[0]} a mí.

▸ .${CMD.paso[0]} pasás · .${CMD.pago[0]} igualás · .${CMD.subo[0]} 20 subís 20 por encima de la apuesta · .${CMD.allin[0]} vas con todo · .${CMD.novoy[0]} no vas
▸ .${CMD.levantarme[0]} o .${CMD.levantarme[1]} te retira con tus fichas (si estás en una mano, al terminarla) · .${CMD.mesa[0]} muestra la mesa · .${CMD.cancelar[0]} (admins) la cierra

Tenés ${Math.round(POKER.TURNO_MS / 1000)} segundos por turno: si no decidís, pasás o te retirás, y a la segunda seguida te levanto de la mesa. Sin dos para jugar durante 10 minutos, la mesa se cierra y cada uno cobra sus fichas. La entrada cuenta para el tope diario del casino; el escudo acá no corre.
Ej: .${CMD.poker[0]} ${POKER.ENTRADA_MAX}`;

// Every message of the game goes out as a game message (lib/mensajes-de-juego.js): a reply to it is about the game,
// not for Claudia.
async function mandar(client, m, texto, mentions = []) {
  const enviado = await client.sendMessage(m.chat, { text: texto, mentions }, { quoted: m });
  marcarMensajeDeJuego(enviado?.key?.id, m.chat, { juego: "poker" });
}

plugin.run = async (m, { client, args = [], isAdmin, botSettings }) => {
  try {
    const palabra = (args[0] || "").toLowerCase();
    if (palabra === "salir" || palabra === "levantarme") {
      const r = levantarse(m.chat, m.sender);
      return r.ok ? mandar(client, m, r.texto, r.mentions) : client.sendText(m.chat, r.error, m);
    }
    if (palabra === "cancelar" || palabra === "cerrar") {
      const r = cancelar(m.chat, m.sender, isAdmin);
      return r.ok ? mandar(client, m, r.texto, r.mentions) : client.sendText(m.chat, r.error, m);
    }
    if (EMPEZAR.includes(limpiarNombre(palabra))) {
      const r = arrancar(m.chat, m.sender);
      return r.ok ? mandar(client, m, r.texto, r.mentions) : client.sendText(m.chat, r.error, m);
    }
    const mesa = mesaDe(m.chat);
    if (!palabra) {
      if (mesa) {
        const r = textoMesa(mesa);
        return mandar(client, m, r.texto, r.mentions);
      }
      // without private chats there's no way to see one's cards: said up front, so nobody buys in for nothing
      const sinPrivados = botSettings?.antiPrivate ? "\n\n⚠️ Ojo: los privados están cerrados (.antiprivado), y las cartas van por privado: así no se puede jugar." : "";
      return client.sendText(m.chat, AYUDA + sinPrivados, m);
    }
    const entrada = leerEntero(palabra);
    if (entrada === null) return client.sendText(m.chat, AYUDA, m);
    const r = abrirOSentarse(m.chat, m.sender, m.senderJid, entrada);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    return mandar(client, m, r.texto, r.mentions);
  } catch (e) {
    console.error("[poker] ERROR:", e);
  }
};

export default plugin;
