import { rolesPorPersona } from "../lib/roles.js";
import { apagadosDe } from "../lib/juegos-apagados.js";
import { MODOS_VOZ } from "../lib/voz.js";

const plugin = {};
plugin.cmd = ["config"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

plugin.run = async (m, { client, groupMetadata, chat }) => {
  const { isBanned, adminMode, adultMode, antiGroups, antiChannels, allAntiLinks, antiInstagram, antiTiktok, antiTelegram, antiLiveLocation, games, welcome, detect, antiDelete: del, reactions, mentions, preguntaDia, triviaRelampago, recapSemanal, horarioJuegos, casino, charla, saludos, monedas, ascensos, horarioGrupo, horarioGrupoFalla, reglas, iniciativa, antiStatus, stickersAuto, voz, catalogoAuto, mercadosAuto, mercadosEnHorario } = chat;
  // Once per person, as .roles: someone with a role under each of their ids came out twice. And as the group lists
  // them: a role under a number that moved on named whoever had it before.
  const roles = rolesPorPersona(m.chat, groupMetadata?.participants);
  const conRol = (rol) => [...roles].filter(([, r]) => r === rol).map(([id]) => `@${id.split("@")[0]}`);
  const admins = conRol("admin");
  const mods = conRol("mod");

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
${antiLiveLocation ? "✅" : "❌"} Anti ubicación en tiempo real (.antiubicacion)
${games ? "✅" : "❌"} Uso de juegos
${casino ? "✅" : "❌"} Casino y apuestas (.casino)
🎮 Juegos apagados de a uno: ${apagadosDe(chat).join(", ") || "ninguno"} (.juego)
${antiStatus ? "✅" : "❌"} Anti menciones del grupo en estados (.antiestados)
${stickersAuto ? "✅" : "❌"} Stickers por su cuenta (.respuestastickers)
🎙️ Voz: ${MODOS_VOZ[voz || ""] || voz} (.voz)
🕒 Horario de juegos: ${horarioJuegos ? `${horarioJuegos.replace("-", " a ")}; los mercados, ${mercadosEnHorario ? "también (.horariojuegos mercados off)" : "a cualquier hora (.horariojuegos mercados on)"}` : "sin horario (.horariojuegos)"}
🌙 Horario del grupo: ${horarioGrupo ? `${horarioGrupo.replace("-", " a ")} (se cierra solo fuera de eso)${horarioGrupoFalla ? " ⚠️ no lo puedo cumplir: ¿sigo siendo admin?" : ""}` : "sin horario (.horariogrupo)"}
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
${iniciativa ? "✅" : "❌"} Iniciativa de Claudia (.iniciativa)
${saludos ? "✅" : "❌"} Saludo automático (.saludos)
${monedas ? "✅" : "❌"} Economía de UruCoins (.monedas)
${ascensos ? "✅" : "❌"} Avisos de ascenso de rango (.ascensos)
${catalogoAuto ? "✅" : "❌"} Catálogo cada tanto, en modo compraventa (.catalogoauto)
${mercadosAuto === 0 ? "❌" : "✅"} Mercados de los partidos de Peñarol y Nacional (.mercadosauto)
🛡️ Admins del bot: ${admins.join(", ") || "nadie"} (.adminbot)
🧹 Moderadores: ${mods.join(", ") || "nadie"} (.moderador)`.trim();

  await client.sendText(m.chat, text, m, { mentions: [...roles.keys()] });
};

export default plugin;
