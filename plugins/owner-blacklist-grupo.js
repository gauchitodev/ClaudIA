import { updateChat, addManyToChatBlacklist, removeManyFromChatBlacklist, getChatBlacklist, getChat } from "../database-functions.js";
import { getComandosDeSeccion, getNombresSecciones } from "../lib/secciones.js";

let plugin = {};
plugin.cmd = ["blgrupos", "blsecciones", "blon", "bloff", "bladd", "bldel", "bllist"];
plugin.onlyOwner = true;

// Mapa temporal en memoria: guarda la última lista numerada de grupos que vio cada owner.
if (!globalThis.blGroupListCache) globalThis.blGroupListCache = new Map();

plugin.run = async (m, { client, text, chat, usedPrefix, command }) => {
  // blsecciones: mostrar la lista de secciones disponibles
  if (command === "blsecciones") {
    const nombres = getNombresSecciones();
    const lista = nombres.map((n, i) => `${i + 1}. +${n}`).join("\n");
    return client.sendText(m.chat, `*Secciones disponibles:*\n${lista}\n\nPara bloquear una sección entera, usá el "+" adelante.\nEjemplo: ${usedPrefix}bladd 1 +juegos`, m);
  }

  // blgrupos: listar todos los grupos donde está el bot, numerados
  if (command === "blgrupos") {
    await client.insertAllGroup();
    const groupIds = Object.keys(client.chats).filter((id) => id.endsWith("@g.us"));

    if (groupIds.length === 0) return client.sendText(m.chat, "El bot no está en ningún grupo todavía.", m);

    const lista = groupIds.map((id) => ({ id, subject: client.chats[id]?.subject || client.chats[id]?.metadata?.subject || id }));
    globalThis.blGroupListCache.set(m.senderJid, lista);

    const texto = lista.map((g, i) => `${i + 1}. ${g.subject}`).join("\n");
    return client.sendText(m.chat, `*Grupos donde está el bot:*\n${texto}\n\nUsá el número junto al comando. Ejemplo: ${usedPrefix}blon 1`, m);
  }

  // Para el resto: si es en grupo, ese es el objetivo. Si es privado, el primer argumento es el número.
  let targetChat = m.chat;
  let restText = text;

  if (!m.isGroup) {
    const args = text.trim().split(/\s+/);
    const num = parseInt(args[0], 10);
    const lista = globalThis.blGroupListCache.get(m.senderJid);

    if (!lista) return client.sendText(m.chat, `Primero pedí la lista de grupos con *${usedPrefix}blgrupos*.`, m);
    if (!num || !lista[num - 1]) return client.sendText(m.chat, `Número de grupo inválido. Pedí la lista de nuevo con *${usedPrefix}blgrupos*.`, m);

    targetChat = lista[num - 1].id;
    restText = args.slice(1).join(" ");
  }

  const targetChatData = m.isGroup ? chat : getChat(targetChat);
  const nombreGrupo = client.chats[targetChat]?.subject || targetChat;

  switch (command) {
    case "blon": {
      updateChat(targetChat, { blacklistMode: true });
      return client.sendText(m.chat, `✅ Modo blacklist activado en *${nombreGrupo}*. Se bloquearán los comandos que agregues con *${usedPrefix}bladd*. Todo lo demás funciona normal.`, m);
    }

    case "bloff": {
      updateChat(targetChat, { blacklistMode: false });
      return client.sendText(m.chat, `☑️ Modo blacklist desactivado en *${nombreGrupo}*. Todos los comandos vuelven a funcionar.`, m);
    }

    case "bladd": {
      const entrada = restText?.trim().toLowerCase();
      if (!entrada) return client.sendText(m.chat, `Indicá qué bloquear. Para un comando: ${usedPrefix}bladd${m.isGroup ? "" : " 1"} sticker\nPara una sección: ${usedPrefix}bladd${m.isGroup ? "" : " 1"} +juegos\nVarios a la vez: ${usedPrefix}bladd${m.isGroup ? "" : " 1"} +juegos +canvas sticker`, m);

      const partes = entrada.split(/\s+/);
      const aBloquear = new Set();
      const seccionesOk = [];
      const seccionesMal = [];

      for (const parte of partes) {
        if (parte.startsWith("+")) {
          const nombreSeccion = parte.slice(1);
          const comandos = getComandosDeSeccion(nombreSeccion);
          if (!comandos) {
            seccionesMal.push(nombreSeccion);
            continue;
          }
          comandos.forEach((c) => aBloquear.add(c));
          seccionesOk.push(nombreSeccion);
        } else {
          aBloquear.add(parte.replace(/^[./!#]/, ""));
        }
      }

      if (aBloquear.size === 0) {
        return client.sendText(m.chat, `No se pudo bloquear nada.${seccionesMal.length ? ` Secciones inexistentes: ${seccionesMal.join(", ")}. Mirá las disponibles con ${usedPrefix}blsecciones.` : ""}`, m);
      }

      addManyToChatBlacklist(targetChat, [...aBloquear]);

      let msg = `🚫 Bloqueado en *${nombreGrupo}* (${aBloquear.size} comandos en total).`;
      if (seccionesOk.length) msg += `\nSecciones: ${seccionesOk.map((s) => "+" + s).join(", ")}`;
      if (seccionesMal.length) msg += `\n⚠️ No existen: ${seccionesMal.join(", ")}`;
      return client.sendText(m.chat, msg, m);
    }

    case "bldel": {
      const entrada = restText?.trim().toLowerCase();
      if (!entrada) return client.sendText(m.chat, `Indicá qué desbloquear. Para un comando: ${usedPrefix}bldel${m.isGroup ? "" : " 1"} sticker\nPara una sección: ${usedPrefix}bldel${m.isGroup ? "" : " 1"} +juegos\nVarios a la vez: ${usedPrefix}bldel${m.isGroup ? "" : " 1"} +juegos +canvas sticker`, m);

      const partes = entrada.split(/\s+/);
      const aDesbloquear = new Set();
      const seccionesOk = [];
      const seccionesMal = [];

      for (const parte of partes) {
        if (parte.startsWith("+")) {
          const nombreSeccion = parte.slice(1);
          const comandos = getComandosDeSeccion(nombreSeccion);
          if (!comandos) {
            seccionesMal.push(nombreSeccion);
            continue;
          }
          comandos.forEach((c) => aDesbloquear.add(c));
          seccionesOk.push(nombreSeccion);
        } else {
          aDesbloquear.add(parte.replace(/^[./!#]/, ""));
        }
      }

      if (aDesbloquear.size === 0) {
        return client.sendText(m.chat, `No se pudo desbloquear nada.${seccionesMal.length ? ` Secciones inexistentes: ${seccionesMal.join(", ")}. Mirá las disponibles con ${usedPrefix}blsecciones.` : ""}`, m);
      }

      removeManyFromChatBlacklist(targetChat, [...aDesbloquear]);

      let msg = `✅ Desbloqueado en *${nombreGrupo}*.`;
      if (seccionesOk.length) msg += `\nSecciones: ${seccionesOk.map((s) => "+" + s).join(", ")}`;
      if (seccionesMal.length) msg += `\n⚠️ No existen: ${seccionesMal.join(", ")}`;
      return client.sendText(m.chat, msg, m);
    }

    case "bllist": {
      const list = getChatBlacklist(targetChat);
      const estado = targetChatData?.blacklistMode ? "🟢 Activado" : "🔴 Desactivado";

      if (list.length === 0) {
        return client.sendText(m.chat, `*Grupo:* ${nombreGrupo}\n*Modo blacklist:* ${estado}\n\nNo hay comandos bloqueados. Agregá con *${usedPrefix}bladd${m.isGroup ? "" : " <número>"} <comando o +sección>*.`, m);
      }

      const lista = list.map((c, i) => `${i + 1}. ${c}`).join("\n");
      return client.sendText(m.chat, `*Grupo:* ${nombreGrupo}\n*Modo blacklist:* ${estado}\n\n*Comandos bloqueados (${list.length}):*\n${lista}`, m);
    }
  }
};

export default plugin;
