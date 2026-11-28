import { getChat, updateChat } from "../database-functions.js";
import { conPermisoDeEnvio } from "../lib/envios.js";
import { reanudarPlazos } from "../lib/apagado.js";
import { devolverLoQueEstaEnJuego } from "../lib/cierre.js";
import { metadataDe } from "../lib/cache-grupos.js";
import { expulsarDeListaNegra, estaEnListaNegra } from "../lib/lista-negra.js";
import { esElBot, idsDelGrupo } from "../lib/identidad.js";
import { leerInterruptor, limpiarPalabra } from "../lib/comandos.js";
import { nombreDe } from "../lib/menciones.js";
import { fechaYHora, duracion } from "../lib/tiempo.js";

// .claudia on|off: the bot's master switch in a group (lib/apagado.js). Switched off, it reads, answers, moderates and
// does nothing there, scheduled tasks and events included, but for .claudia on, .estado and .enviados. Only WhatsApp's
// admins and the bot's owner switch it: it takes away the moderation that protects the group, and a bot admin is below
// WhatsApp's. .claudia alone says how it stands.
const plugin = {};
plugin.cmd = ["claudia"];
plugin.onlyGroup = true;
plugin.conElBotApagado = true; // handle-message.js lets it through with the bot switched off

const LO_QUE_NO_HACE = "no leo ni contesto nada, no modero (la lista negra no saca a nadie, no borro links ni advierto a nadie) y no hago nada por mi cuenta";
const LOS_PLAZOS = "y los plazos (préstamos y cuotas del banco, elecciones, publicaciones, encargos, changas…) quedan quietos, para seguir desde donde estaban";

plugin.run = async (m, { client, args = [], usedPrefix = ".", isOwner, isWaAdmin }) => {
  const fila = getChat(m.chat) || {};
  const desde = Number(fila.apagadoDesde) || 0;
  const pedido = limpiarPalabra(args[0]);
  const prender = leerInterruptor(pedido);

  if (!pedido) return client.sendText(m.chat, textoEstado(fila, usedPrefix), m, { mentions: fila.apagadoPor ? [fila.apagadoPor] : [] });
  if (prender === null) return client.sendText(m.chat, `Usá ${usedPrefix}claudia on o ${usedPrefix}claudia off; solo, ${usedPrefix}claudia te dice cómo estoy.`, m);
  if (!isWaAdmin && !isOwner) return client.sendText(m.chat, "Prenderme y apagarme es de los admins del grupo y del dueño del bot.", m);

  if (!prender) {
    if (desde) return client.sendText(m.chat, "Ya estaba apagada en este grupo.", m);
    // What's in play goes back first: a game left going would settle by its own timers, with nobody to see it
    // (lib/cierre.js).
    const { apuestas, monedas } = devolverLoQueEstaEnJuego(m.chat);
    updateChat(m.chat, { apagadoDesde: Date.now(), apagadoPor: m.sender });
    const devueltas = apuestas ? ` Cancelé lo que estaba en juego y devolví ${apuestas === 1 ? "1 apuesta" : `${apuestas} apuestas`} (${monedas} UruCoins).` : "";
    // Switched off by now: the notice goes out with the permit the dispatcher only gives a group already switched off.
    return conPermisoDeEnvio(m.chat, () =>
      client.sendText(m.chat, `💤 Me apago en este grupo. Hasta que un admin mande ${usedPrefix}claudia on ${LO_QUE_NO_HACE}, ${LOS_PLAZOS}.${devueltas} Solo contesto ${usedPrefix}claudia on, ${usedPrefix}estado y ${usedPrefix}enviados.`, m),
    );
  }

  if (!desde) return client.sendText(m.chat, "Ya estaba prendida en este grupo.", m);
  // The deadlines go on from where they were, before anything can run again (lib/apagado.js).
  const { cancelados } = reanudarPlazos(m.chat, desde);
  updateChat(m.chat, { apagadoDesde: 0, apagadoPor: "" });
  const lineas = [`✅ Prendida de nuevo en este grupo, después de ${duracion(Date.now() - desde)}. Los plazos siguen desde donde estaban.`];
  if (cancelados) lineas.push("Lo que tocaba empezar mientras estaba apagada (trivias, changas, encargos…) no sale.");
  const barrido = await barrerListaNegra(client, m.chat);
  if (barrido) lineas.push(barrido);
  return client.sendText(m.chat, lineas.join("\n"), m);
};

function textoEstado(fila, usedPrefix) {
  const desde = Number(fila.apagadoDesde) || 0;
  if (!desde) {
    return `🤖 Estoy prendida en este grupo. Con ${usedPrefix}claudia off un admin del grupo me apaga del todo: ${LO_QUE_NO_HACE}, hasta ${usedPrefix}claudia on. Mientras tanto solo andan ${usedPrefix}claudia on, ${usedPrefix}estado y ${usedPrefix}enviados.`;
  }
  const quien = fila.apagadoPor ? ` (me apagó *@${fila.apagadoPor.split("@")[0]}*)` : "";
  return `💤 Estoy apagada en este grupo desde el ${fechaYHora(desde)}${quien}: ${LO_QUE_NO_HACE}, ${LOS_PLAZOS}. Un admin del grupo me prende con ${usedPrefix}claudia on.`;
}

// Whoever on the blacklist got in while the bot was off, out now: switching it off isn't a way in. With the group as
// WhatsApp has it, not the copy in memory. Where Claudia isn't admin she can't remove them, and says who they are.
// Null when nobody on the list is there.
async function barrerListaNegra(client, chat) {
  try {
    const metadata = await metadataDe(client, chat, { fresca: true });
    const miembros = metadata?.participants || [];
    const soyAdmin = miembros.find((p) => esElBot(p, client))?.admin;
    if (!soyAdmin) {
      // Without admin nobody can be removed: who they are, by name, so an admin removes them.
      const anotados = [];
      for (const p of miembros) {
        const encontrado = esElBot(p, client) ? null : await estaEnListaNegra(idsDelGrupo(p), chat, miembros);
        if (encontrado) anotados.push(nombreDe(encontrado.lid || encontrado.jid));
      }
      return anotados.length ? `🚫 Mientras estaba apagada entraron de la lista negra ${anotados.join(", ")}, y no los puedo sacar porque no soy admin: sacalos a mano.` : null;
    }
    const { expulsados, fallados } = await expulsarDeListaNegra(client, chat, miembros, miembros);
    const lineas = [];
    if (expulsados.length) lineas.push(`🚫 Saqué a ${expulsados.map((e) => nombreDe(e.entrada?.lid || e.entrada?.jid || e.id)).join(", ")}: entraron mientras estaba apagada y están en la lista negra.`);
    if (fallados.length) lineas.push(`⚠️ No pude sacar a ${fallados.map((e) => nombreDe(e.id)).join(", ")}, que están en la lista negra: sacalos a mano.`);
    return lineas.join("\n") || null;
  } catch (e) {
    console.error("[claudia on] no se pudo revisar la lista negra de", chat, e);
    return "⚠️ No pude revisar si entró alguien de la lista negra mientras estaba apagada: miralo con .vln.";
  }
}

export default plugin;
