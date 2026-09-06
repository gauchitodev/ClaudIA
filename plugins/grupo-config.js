import { rolesGrupo } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["config"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, groupMetadata, chat }) => {
  const { isBanned, adminMode, adultMode, antiGroups, antiChannels, allAntiLinks, antiInstagram, antiTiktok, antiTelegram, games, welcome, detect, antiDelete: del, reactions, mentions, preguntaDia, triviaRelampago, recapSemanal, horarioJuegos, charla, saludos, monedas, ascensos, horarioGrupo, reglas } = chat;
  const roles = rolesGrupo(m.chat);
  const admins = roles.filter((r) => r.rol === "admin").map((r) => `@${r.usuario.split("@")[0]}`);
  const mods = roles.filter((r) => r.rol === "mod").map((r) => `@${r.usuario.split("@")[0]}`);

  const text = `
[⚙️] 𝙲𝙾𝙽𝙵𝙸𝙶 𝙳𝙴 𝙶𝚁𝚄𝙿𝙾 [⚙️]
  
*Nombre:* ${groupMetadata.subject}
  
${groupMetadata.id}
  
*Configuración de grupo:*
${isBanned ? "✅" : "❌"} BanChat
${adminMode ? "✅" : "❌"} Solo admins
${adultMode ? "✅" : "❌"} Modo adulto
${antiGroups ? "✅" : "❌"} AntiLinks grupos WhatsApp
${antiChannels ? "✅" : "❌"} AntiLinks canales WhatsApp
${allAntiLinks ? "✅" : "❌"} Anti cualquier link
${antiInstagram ? "✅" : "❌"} Anti links Instagram
${antiTiktok ? "✅" : "❌"} Anti links TikTok
${antiTelegram ? "✅" : "❌"} Anti links Telegram
${games ? "✅" : "❌"} Uso de juegos
🕒 Horario de juegos: ${horarioJuegos ? horarioJuegos.replace("-", " a ") : "sin horario (.horariojuegos)"}
🌙 Horario del grupo: ${horarioGrupo ? `${horarioGrupo.replace("-", " a ")} (se cierra solo fuera de eso)` : "sin horario (.horariogrupo)"}
📋 Reglas: ${reglas ? "cargadas (.reglas)" : "sin cargar (.reglas set <texto>)"}
${welcome ? "✅" : "❌"} Welcome - Bye
${detect ? "✅" : "❌"} Alertas de grupo
${mentions ? "✅" : "❌"} Uso de .tagall y ht
${del ? "✅" : "❌"} Anti Eliminar Mensajes
${reactions ? "✅" : "❌"} Bot reacciona
${preguntaDia ? "✅" : "❌"} Pregunta del día (.preguntadeldia)
${triviaRelampago ? "✅" : "❌"} Trivia relámpago (.triviarelampago)
${recapSemanal ? "✅" : "❌"} Recap semanal (.recapsemanal)
${charla ? "✅" : "❌"} Charla automática de Claudia (.charla)
${saludos ? "✅" : "❌"} Saludo automático (.saludos)
${monedas ? "✅" : "❌"} Economía de UruCoins (.monedas)
${ascensos ? "✅" : "❌"} Avisos de ascenso de rango (.ascensos)
🛡️ Admins del bot: ${admins.join(", ") || "nadie"} (.adminbot)
🧹 Moderadores: ${mods.join(", ") || "nadie"} (.moderador)`.trim();

  await client.sendText(m.chat, text, m, { mentions: roles.map((r) => r.usuario) });
};

export default plugin;
