import { duracion } from "./tiempo.js";

export default {
  // Defaults
  defaultWho: (usedPrefix, command) => `*[❕]* 𝙼𝙴𝙽𝙲𝙸𝙾𝙽𝙰 𝙰 𝚄𝙽 𝙿𝙰𝚁𝚃𝙸𝙲𝙸𝙿𝙰𝙽𝚃𝙴\n< ${usedPrefix}${command} @0 >`,
  defaultText: "*[❕]* Ingrese un texto",
  defaultImage: "*[❕]* Responda a una imágen",
  defaultNoPP: "*[❗]* El usuario no tiene foto de perfil visible para todos",

  // Permisos
  onlyOwner: "*[☢️]* `NO TIENES PERMISOS SUFICIENTES`",
  onlyAdmin: "*[⛔]* `Este comando es solo para admins.`",
  onlyMod: "*[⛔]* `Este comando es solo para moderadores y admins.`",
  botAdmin: "*[🛡️]* `Necesito ser admin para que puedas ejecutar este comando.`",
  onlyGroup: "*[❌]* `Solo en grupos se puede ejecutar este comando.`",
  onlyPrivate: "*[❌]* `Solo en privado se puede ejecutar este comando.`",

  // main.js
  blackList: (user, reason) => `*[⚠️] EL USUARIO +${user.split("@")[0]} FUE ELIMINADO YA QUE ESTABA EN LISTA NEGRA.*\n\n*[❗] Razón:* ${reason}`,
  welcome: (user) => `*[🎉]* ¡Bienvenido @${user.split("@")[0]}!`,
  welcomeBye: (user) => `*[👋]* ¡Adios @${user.split("@")[0]}!`,
  antiCall: (user) => `*[❗] HOLA @${user.split("@")[0]} SOY UN BOT.*\n\n*LAS LLAMADAS ESTAN PROHIBIDAS.*\n\n*[⛔SERÁS BLOQUEADO⛔]*`,
  clearTmp: "\n🟢 TMP 🟢\nARCHIVOS DE LA CARPETA TMP ELIMINADAS",

  // handle-message.js
  noCommandMatch: (command) => `*[❌]* El comando "${command}" no existe.\nPuede ver el menú con .menu`,

  // <Plugins>

  // _detectEvents.js
  detectEventsResetLink: (user) => `*[🔗 ENLACE RESTABLECIDO 🔗]*\n*[❗]* \`Acción hecha por:\` @${user.split("@")[0]}`,
  detectEventsPromote: (user, user2) => `*[✅]* \`AHORA ES ADMIN:\` @${user.split("@")[0]}\n*[❗]* \`Acción hecha por:\` @${user2.split("@")[0]}`,
  detectEventsDemote: (user, user2) => `*[❌]* \`YA NO ES ADMIN:\` @${user.split("@")[0]}\n*[❗]* \`Acción hecha por:\` @${user2.split("@")[0]}`,
  detectEventsRemove: (user, user2) => `@${user.split("@")[0]} Fué eliminado por @${user2.split("@")[0]}`,
  demoteBot: "*[⚠️] El bot necesita administrador para poder funcionar, de lo contrario se saldrá del grupo en*\n* *60 segundos.*",

  // afk.js
  afk: `*[❕]* Ingrese motivo del AFK`,
  afkSuccess: (user, reason) => `*[ 💤   𝗔  𝗙  𝗞   💤 ]*\n\n*[❗] 𝙽𝙾 𝙴𝚃𝙸𝚀𝚄𝙴𝚃𝙰𝚁 𝙰 @${user.split("@")[0]}, 𝙴𝚂𝚃𝙰𝚁𝙰́ 𝙸𝙽𝙰𝙲𝚃𝙸𝚅𝙾(𝙰).*\n\n*[❕] 𝚁𝙰𝚉𝙾́𝙽:* ${reason}`,

  // _afk.js
  afkOff: (user, reason, time) => `*[ 💤   𝗔  𝗙  𝗞   💤 ]*\n\n@${user.split("@")[0]} *𝙳𝙴𝙹𝙰𝚂𝚃𝙴 𝙳𝙴 𝙴𝚂𝚃𝙰𝚁 𝙸𝙽𝙰𝙲𝚃𝙸𝚅𝙾(𝙰)*\n\n*[❕] 𝙻𝙰 𝚁𝙰𝚉𝙾́𝙽 𝙴𝚁𝙰:* ${reason}\n\n*[⏱] 𝚃𝙸𝙴𝙼𝙿𝙾 𝙸𝙽𝙰𝙲𝚃𝙸𝚅𝙾:*\n*${duracion(Date.now() - time)}*`,
  afkOn: (reason, time) => `*[💤 EL USUARIO ESTÁ INACTIVO 💤]*\n\n*[❕] RAZÓN:* ${reason}\n\n[⏳] TIEMPO INACTIVO:\n*${duracion(Date.now() - time)}*`,
  afkListNull: `*[❕]* No tienes afk activo en ningún grupo`,

  // _antiLinkGroupsChannel.js
  antiGroups: "> ⚠️ *ADVERTENCIA*\n\n*Se detectó un link de grupo. Debo de ser Admin para poder eliminarlo.*",
  antiGroupsDelete: "> ⚠️ *ADVERTENCIA*\n\n*Se detectó un link de grupo pero está el Anti-Eliminar activado. Desactivelo para protección de links de grupos o canales*",
  antiGroupsSuccess: (user) => `*[⚠️ANTI LINK DE GRUPOS⚠️]*\n* *Serás eliminado/a* @${user.split("@")[0]}`,
  antiChannel: "> ⚠️ *ADVERTENCIA*\n\n*Se detectó un link de canal. Debo de ser Admin para poder eliminarlo.*",
  antiChannelDelete: "> ⚠️ *ADVERTENCIA*\n\n*Se detectó un link de canal pero está el Anti-Eliminar activado. Desactivelo para protección de links de grupos o canales*",
  antiChannelSuccess: (user) => `@${user.split("@")[0]} *No enviar canales.*`,

  // _antiLinkSelected.js
  allAntiLinkDelete: `> ⚠️ *ADVERTENCIA*\n\n*Se detectó un link pero está el Anti-Eliminar activado. Desactivelo para protección de links*`,
  allAntiLinkTikTok: (user) => `> ⚠️ *¡No se permite enlace de TikTok!*\n*@${user.split("@")[0]}*`,
  allAntiLinkInstagram: (user) => `> ⚠️ *¡No se permite enlace de Instagram!*\n*@${user.split("@")[0]}*`,
  allAntiLinkTelegram: (user) => `> ⚠️ *¡No se permite enlace de Telegram!*\n*@${user.split("@")[0]}*`,

  // _allAntiLinks.js
  allAntiLinksDelete: `> ⚠️ *ADVERTENCIA*\n\n*Se detectó un link pero está el Anti-Eliminar activado. Desactivelo para protección de links*`,
  allAntiLinks: (user, link) => `*[❗ 𝗘𝗡𝗟𝗔𝗖𝗘 𝗗𝗘𝗧𝗘𝗖𝗧𝗔𝗗𝗢 ❗]*\n\n@${user.split("@")[0]}\n*[📎]Enlace de:* ${link}`,

  // dl-yt.js
  banSpam: `Has sido baneado por pesado y pendej@`,
  advSpam: (formattedTime, commandAttempts) => `Espera *${formattedTime}* para usar nuevamente🤨\n\nAdvertencias: ${commandAttempts}/4`,
  ingresarTitulo: "*[❕]* Ingrese un artista y título de una canción",
  sendPreview: (isAudio, title) => `${title}\n\n*[🟢ENVIANDO.. ${isAudio ? "🔊" : "🎬"}] ESPERE..⏳*\n\n*[❕]* 𝚁𝙴𝙲𝙾𝚁𝙳𝙰𝚁 𝙿𝙾𝙽𝙴𝚁 𝙽𝙾𝙼𝙱𝚁𝙴 𝙳𝙴𝙻 𝙰𝚁𝚃𝙸𝚂𝚃𝙰 𝚈 𝙲𝙰𝙽𝙲𝙸𝙾́𝙽 𝙿𝙰𝚁𝙰 𝙼𝙰́𝚂 𝙿𝚁𝙴𝙲𝙸𝚂𝙸𝙾́𝙽`,
  errorST: (messageType) => `*[❗]* Hubo un error al descargar el ${messageType}`,
  errorNoFile: (messageType) => `*[❗]* El archivo de ${messageType} no se encontró después de la descarga`,
  errorInterno: (command, error) => `Error en comando ${command}: ${error}`,

  // audioEffects.js
  audioEffects: `*[❕]* Responda a un audio`,

  // Couple and marriage plugins
  parejaDefaultWho: (usedPrefix, command) => `*[❕]* 𝙼𝙴𝙽𝙲𝙸𝙾𝙽𝙰 𝙰 𝚄𝙽 𝙿𝙰𝚁𝚃𝙸𝙲𝙸𝙿𝙰𝙽𝚃𝙴\n< ${usedPrefix}${command} @0 >\n\nPuede no haber registros del usuario mencionado.`,
  parejaWhoSender: `No puedes ser tu propia pareja🙄`,
  parejaWhoBot: `No puedo ser tu pareja🥹`,
  parejaInfiel: (pareja, who) => `😡𝙀𝙍𝙀𝙎 𝙄𝙉𝙁𝙄𝙀𝙇😡\n\n𝚈𝙰 𝙴𝚂𝚃𝙰́𝚂 𝙴𝙽 𝚄𝙽𝙰 𝚁𝙴𝙻𝙰𝙲𝙸𝙾́𝙽 𝙲𝙾𝙽 @${pareja.split("@")[0]}\n\n𝙿𝙰𝚁𝙰 𝚃𝙴𝚁𝙼𝙸𝙽𝙰𝚁 𝙲𝙾𝙽 𝚂𝚄 𝙿𝙰𝚁𝙴𝙹𝙰, 𝙴𝚂𝙲𝚁𝙸𝙱𝙰: *.terminar*\n\n𝚈 𝙿𝙾𝙳𝚁𝙰́ 𝚃𝙴𝙽𝙴𝚁 𝚄𝙽𝙰 𝚁𝙴𝙻𝙰𝙲𝙸𝙾́𝙽 𝙲𝙾𝙽 @${who.split("@")[0]}`,
  parejaAlready: (who) => `Ya estás en pareja con @${who.split("@")[0]}🥰`,
  parejaConfesionPendiente: `*[❗]* La persona ya tiene pareja o una confesión pendiente`,
  parejaPeticion: (random, sender, who) => `*_💌${random}_*\n\n*@${sender.split("@")[0]}* 𝙎𝙀 𝙀𝙎𝙏𝘼 𝘿𝙀𝘾𝙇𝘼𝙍𝘼𝙉𝘿𝙊😳\n\n𝙿𝙾𝚁 𝙵𝙰𝚅𝙾𝚁 *@${who.split("@")[0]}* 𝚁𝙴𝚂𝙿𝙾𝙽𝙳𝙴 𝙰 𝙻𝙰 𝙳𝙴𝙲𝙻𝙰𝚁𝙰𝙲𝙸𝙾́𝙽🥹\n\n*_❤️Para aceptar escriba:_*\n*.aceptar* @${sender.split("@")[0]}\n\n*_💔Para rechazar escriba:_*\n*.rechazar* @${sender.split("@")[0]}`,
  parejaNoTiene: (sender, totalParejas) => `@${sender.split("@")[0]} 𝙽𝙾 𝚃𝙸𝙴𝙽𝙴𝚂 𝙿𝙰𝚁𝙴𝙹𝙰\n\n*Parejas que has tenido: ${totalParejas}*`,
  parejaMiPareja: (sender, persona, time, marriedMessage, totalParejas) => `@${sender.split("@")[0]} 𝙴𝚂𝚃𝙰́𝚂 𝙴𝙽 𝚄𝙽𝙰 𝚁𝙴𝙻𝙰𝙲𝙸𝙾́𝙽 𝙲𝙾𝙽 @${persona.split("@")[0]} 😋\n\n───▄█▀█▄──▄███▄───\n──▐█░██████████▌──\n───██▒█████████───\n────▀████████▀────\n───────▀██▀───────\n❣️‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎😍 ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎‎ ❣️\n*⏳Tiempo de pareja:*\n${time}\n${marriedMessage}\n*Parejas anteriores: ${totalParejas}*`,
  parejaMiParejaSinRespuesta: (persona) => `*[❕]* Parece que @${persona.split("@")[0]} no ha aceptado ni rechazado tu propuesta de estar juntos en una relación 🥺\n> Se anulará la petición`,
  parejaWhoBotNull: (usedPrefix, command, who) => `*[❗]* Ponga ${usedPrefix}${command} @${who.split("@")[0]} pero sin responder mensajes del bot`,
  parejaNoAccept: (who) => `*[❗]* No puedes aceptar a @${who.split("@")[0]} si ninguno se ha declarado`,
  parejaNoReject: (who) => `*[❗]* No puedes rechazar a @${who.split("@")[0]} si ninguno se ha declarado`,
  parejaAccept: (sender, who) => `@${sender.split("@")[0]} ❤️ @${who.split("@")[0]}\n\n😍𝙁𝙀𝙇𝙄𝘾𝙄𝙏𝘼𝘾𝙄𝙊𝙉𝙀𝙎😍\n\n😊𝙳𝙴 𝙼𝙰𝙽𝙴𝚁𝙰 𝙾𝙵𝙸𝙲𝙸𝙰𝙻 𝙴𝚂𝚃𝙰́𝙽 𝙴𝙽 𝚄𝙽𝙰 𝚁𝙴𝙻𝙰𝙲𝙸𝙾́𝙽.\n\n𝚀𝚄𝙴 𝙳𝚄𝚁𝙴 𝙿𝙾𝚁 𝚂𝙸𝙴𝙼𝙿𝚁𝙴 𝚂𝚄 𝙰𝙼𝙾𝚁 𝚈 𝙵𝙴𝙻𝙸𝙲𝙸𝙳𝙰𝙳❤️`,
  parejaRechazar: (sender, who) => `🥺𝙻𝙰𝙼𝙴𝙽𝚃𝙰𝙱𝙻𝙴𝙼𝙴𝙽𝚃𝙴 @${sender.split("@")[0]} 𝚂𝙴 𝙷𝙰 𝙽𝙴𝙶𝙰𝙳𝙾 🚫 𝙰 𝙴𝚂𝚃𝙰𝚁 𝙴𝙽 𝚄𝙽𝙰 𝚁𝙴𝙻𝙰𝙲𝙸𝙾́𝙽 𝙲𝙾𝙽𝚃𝙸𝙶𝙾 @${who.split("@")[0]}\n\n𝙽𝙾 𝙴𝚂𝚃𝙴́𝚂 𝚃𝚁𝙸𝚂𝚃𝙴, 𝙰𝚄𝙽 𝚃𝙸𝙴𝙽𝙴𝚂 𝙼𝚄𝙲𝙷𝙰𝚂 𝙲𝙾𝚂𝙰𝚂 𝙿𝙾𝚁 𝙷𝙰𝙲𝙴𝚁🥹\n\n@${who.split("@")[0]} 💔 @${sender.split("@")[0]}`,
  parejaTerminarNull: (sender) => `Pero @${sender.split("@")[0]}, no tienes pareja`,
  parejaTerminarSuccess: (sender) => `💔@${sender.split("@")[0]} terminó con su pareja💔`,
  parejaCasamientoNull: "*[❕]* Primero debes tener pareja para poder casarte con ella.\n\nUtilice .pareja @<etiqueta> la persona que quiere que sea su pareja",
  parejaCasamientoNoTime: "*[❗]* Debes tener una semana de pareja para poder casarte.",
  parejaCasamientoAlready: "*[❕]* Ya están casados 🥰",
  parejaCasamientoSuccess: (sender, persona) => `💞 *¡Felicidades!* 💞\n\n*@${sender.split("@")[0]}* ha aceptado la propuesta de matrimonio de *@${persona.split("@")[0]}*.\n\n🎉 *¡Oficialmente están casados!* 🎉\n\nQue su amor siga creciendo y floreciendo cada día más. 🌸`,
  parejaCasamientoPropuesta: (sender, persona) => `*🪐¡Propuesta de Casamiento!🪐*\n\nDespues de estar un tiempo juntos,*💍@${sender.split("@")[0]}* decidió perdirle matrimonio a *@${persona.split("@")[0]}💐*\n\n𝚁𝙴𝚂𝙿𝙾𝙽𝙳𝙴 𝙰 𝙻𝙰 𝙳𝙴𝙲𝙻𝙰𝚁𝙰𝙲𝙸𝙾́𝙽 @${persona.split("@")[0]} 🥰\n\n.si [ Para Aceptar ]\n.no [ Para Rechazar ]`,
  parejaCasamientoRechazar: (sender, persona) => `💔 *@${sender.split("@")[0]}* ha decidido rechazar la propuesta de matrimonio de *@${persona.split("@")[0]}* por ahora.\n\n💖 Pero no se preocupen, ¡aún son pareja! Tómense su tiempo para decidir cuándo es el mejor momento para casarse.`,

  // JUEGOS:
  disabledGames: "*[❗]* Juegos deshabilitados",
  disabledEconomy: "*[❗]* La economía de UruCoins está apagada en este grupo.",
  tttSalaExistente: "[❌] Ya hay una sala creada, espere al segundo jugador",
  tttDelNull: (usedPrefix) => `*[❗]* No estás en ninguna partida\n\nIniciar partida:\n${usedPrefix}ttt`,
  tttDelSuccess: "*[❗]* Sala eliminada",
  ahorcadoLetra: "*[❗]* Debes poner de a una letra.",
  gameAlready: "*[❗]* Ya hay un juego activo.",
  gameSuccess: "*[🎉] RESPUESTA CORRECTA!*",

  // queVer-CineRandom.js
  queVerNull: (usedPrefix, command) => `[❗] Elige el género.\n\n\`Comandos disponibles:\`\n\n* 🍿${usedPrefix}${command} random\n* 🍿${usedPrefix}${command} acción\n* 🍿${usedPrefix}${command} comedia\n* 🍿${usedPrefix}${command} aventura\n* 🍿${usedPrefix}${command} animación\n* 🍿${usedPrefix}${command} ciencia ficción\n* 🍿${usedPrefix}${command} misterio\n* 🍿${usedPrefix}${command} terror\n* 🍿${usedPrefix}${command} drama\n* 🍿${usedPrefix}${command} romance\n* 🍿${usedPrefix}${command} bélica\n* 🍿${usedPrefix}${command} crimen\n* 🍿${usedPrefix}${command} familia\n* 🍿${usedPrefix}${command} suspenso\n* 🍿${usedPrefix}${command} documental\n* 🍿${usedPrefix}${command} historia\n* 🍿${usedPrefix}${command} horror`,

  // fun-siono.js
  sionoNull: "*[❗]* Ingrese una pregunta",

  // fun-formarPareja.js
  formarParejaMsg: (user, user2) => `*@${user.split("@")[0]}, 𝚈𝙰 𝙴𝚂 𝙷𝙾𝚁𝙰 𝙳𝙴 𝚀𝚄𝙴 𝚃𝙴 💍 𝙲𝙰𝚂𝙴𝚂 𝙲𝙾𝙽 @${user2.split("@")[0]}, 𝙻𝙸𝙽𝙳𝙰 𝙿𝙰𝚁𝙴𝙹𝙰💓*`,

  // fun-ruletaDelBan.js
  ruletaDelBan: (user) => `*@${user.split("@")[0]} ☠️ Has sido elegido por la ruleta de la muerte*`,

  // fun-canvasSmeme.js
  smemeNull: "*[❕]* Responde a una imagen con el comando .smeme <texto>",

  // setbotname.js
  setbotnameNull: "*[❕]* 𝙸𝙽𝙶𝚁𝙴𝚂𝙴 𝚄𝙽 𝙽𝙾𝙼𝙱𝚁𝙴",

  // owner-rd.js
  rdNullOwner: (user) => `*[❗]* No se puede reiniciar a @${user.split("@")[0]} porque es pareja de @${owners[0]}`,
  rdSuccess: (user) => `*[❗]* Se reinició a @${user.split("@")[0]}`,

  // owner-leaveGroup.js
  leaveGroup: "*❗SE DESPIDE EL BOT❗*",

  // owner-joinGroup.js
  joinGroupNull: "*[❕]* INGRESE EL ENLACE DEL GRUPO*",
  joinGroupSuccess: "*[⏳] Entrando al grupo..*",

  // owner-addBlackListAndReject.js
  defaultWhoBlackList: (usedPrefix, command) => `*[❕]* No hay registro del usuario mencionado. Pruebe respondiendo un mensaje del usuario o poniendo el numero de telefono directamente, por ejemplo: ${usedPrefix}${command} +598 99 999 999 <razón>`,
  blistRejectNullReason: "*[❕]* Ingrese una razón por la que estará en lista negra",

  // sticker-emojiMix.js
  emojiMixNull: (usedPrefix, command) => `*[❕]* 𝙳𝙴𝙱𝙴 𝚄𝚂𝙰𝚁 𝙳𝙾𝚂 𝙴𝙼𝙾𝙹𝙸𝚂 𝚈 𝙴𝙽 𝙴𝙻 𝙼𝙴𝙳𝙸𝙾 𝙿𝙾𝙽𝙴𝚁 "*+*"\n𝙴𝙹𝙴𝙼𝙿𝙻𝙾:\n*${usedPrefix + command}* 😭+😄`,

  // grupo-advertir.js
  advertirNoRazon: "*[❕]* Ingrese una razón",
  advertirSuccess: (who, txt, warn, max) => `⚠️ *@${who.split("@")[0]}* *RECIBIÓ UNA ADVERTENCIA EN ESTE GRUPO*\n\n👉 *${txt}*\n\n*ADVERTENCIA*\n⚠️ *${warn}/${max}*`,
  advertirKick: (who) => `*SE TE ADVIRTIÓ VARIAS VECES.*\n*@${who.split("@")[0]}* *SERÁS ELIMINADO(A)* 🙄`,

  // grupo-admins.js
  adminsReason: "*[❕]* Ingrese un mensaje por el cual necesita la presencia de los admins",

  // grupo-deleteMessage.js
  deleteMessageNull: "*[❕]* Responda al mensaje que quiere eliminar",
  deleteMessageOnlyMe: `\`Solo puedes eliminar mensajes propios\``,

  // grupo-hidetag.js & grupo-hidetag2.js & grupo-tagall.js
  mentionsDisabled: "*[❗]* Comandos de menciones deshabilitados",
  hidetagNull: "*[❕]* Ponga un texto o responda a un mensaje",

  // grupo-advertirDelete.js
  advertirDeleteSuccess: (who, warns, max) => `*@${who.split("@")[0]}*  *SE LE ELIMINÓ UNA ADVERTENCIA EN ESTE GRUPO.*\n\n*ADVERTENCIA*\n⚠️ *Antes: ${warns + 1}/${max}*\n⚠️ *Ahora: ${warns}/${max}*`,

  // grupo-reportar.js
  reportarNull: "*[❕]* Responda al mensaje que quiere reportar",

  // besar.js
  besarBot: "AY NO QUE ASCO, SALÍ DE ACÁ🤨",
  besarInfiel: (pasan) => `*SOS INFIEL!? @${pasan.split("@")[0]} MIRÁ..🤨*`,
  besarTienePareja: (who) => `*@${who.split("@")[0]} TIENE PAREJA, RESPETE..🤨*`,

  // recoveryOnce.js
  recoveryOnceRestrict: "*[❕]* Solo puedes recuperar contenido propio, no de otras personas",
  recoveryOnceNull: '*[❕]* Responda al mensaje de "ver una vez" que quiere recuperar',
  recoveryOnceSuccess: "*[✅ Contenido recuperado ✅]*",

  // dl-TikTokSearch.js
  titokSearch: "*[❕]* Ingrese una busqueda para tiktok",

  // dl-instagram.js
  dlInstaNull: "*[❕]* Ingrese un enlace de Instagram",
  dlInstaSuccess: "*[✅ Descarga finalizada ✅]*",

  // convert-toMp3.js
  convertToMp3Null: "*[❕]* Responda a un video o nota de voz para convertir en audio mp3",

  // convert-textToPTT.js
  textToPTTNull: "*[❕]* Ingrese un texto para convertir en audio",

  // convert-toPTT.js
  toPTTNull: "*[❕]* Responda a un video o audio",

  // gptAndSimi.js
  iaPeticion: "*[❕]* Ingresar una petición",

  // dl-imagen.js
  dlImagenNull: "*[❕]* Ingrese un texto para la busqueda",
  dlImagenSuccess: (text) => `*𝙍𝙚𝙨𝙪𝙡𝙩𝙖𝙙𝙤 𝙙𝙚: ${text}*`,

  //dl-imagenCarousel.js
  dlImagenCarousel: (text) => `*✅ Resultados de: ${text}*`,

  // grupo-kick.js
  kickOwner: (who) => `*[❌]* No puedo eliminar a @${who.split("@")[0]} ya que es el creador del grupo`,

  // grupo-pinMessage.js
  pinMessageNull: "*[❕]* Responde a un mensaje para fijarlo",

  // dl-tiktok.js
  tiktokNull: "*[❕]* Ingrese un enlace de tiktok",
  tiktokLinkNull: "*[❕]* Ingrese un enlace de tiktok válido",
  tiktokSuccess: "*[✅ Descarga finalizada ✅]*",

  // tools-translate.js
  translateNull: "*[❕]* Ingrese un texto para traducir",

  // tools-encuesta.js
  encuestaNull: (usedPrefix) => `[❕] Debes usar el comando de la siguiente manera:\n\n${usedPrefix}encuesta ¿Color favorito? - Azul - Negro - Rojo - etc...`,
  encuestaMax: "*[❗]* Máximo 12 opciones de votación.",
  encuestaMin: (usedPrefix) => `*[❗]* Tiene que haber minimo 2 opciones de votación.○\n\nEjemplo:\n${usedPrefix}encuesta ¿Color favorito? - Azul - Negro`,

  // tools-screenshotWeb.js
  sswebNull: "*[❕]* Ingrese un enlace",

  // tools-ofuscar.js
  ofuscarNull: "*[❕]* Ingrese un codigo JS para ofuscar",

  // tools-changeResolution.js
  changeResolutionNumbers: (usedPrefix, command) => `*[❕]* INGRESE UNA RESOLUCIÓN. EJEMPLOS DE USO:\n\n1: ${usedPrefix}${command} 500x500\n2: ${usedPrefix}${command} 500\n\nEl primer ejemplo no es proporcional, y el segundo ejemplo si.`,

  // tools-calcular.js
  calcNull: (usedPrefix, command) => `Por favor ingresa una operación válida. Ejemplo:\n${usedPrefix}${command} 4 + 3\n${usedPrefix}${command} 6 x 2`,
  calcCaracteresNull: "La operación contiene caracteres no válidos. Solo se permiten números y operadores (+, -, *, /)",
  calcSuccess: (text, result) => `Operación: ${text}\n\nResultado: ${result}`,

  // sticker.js
  sticker1: "*[❕] 𝚁𝙴𝚂𝙿𝙾𝙽𝙳𝙰 𝙰 𝚄𝙽𝙰*\n* 𝙸𝙼𝙰𝙶𝙴𝙽\n* 𝚅𝙸́𝙳𝙴𝙾\n* 𝙶𝙸𝙵",
  sticker2: "*[❗]* El video no puede durar más de 7 segundos",

  // sticker-ttp.js
  ttp: "*[❕]* Ingrese un texto para convertir en sticker",

  // fun-penetrar.js
  funPenetrarWhoBot: "NO ME VAS A HACER ESO A MI🤨",

  // sticker-qc.js
  stickerQcNull: "*[❕]* Ingrese un texto para hacer el sticker",
  stickerQcMaxLetters: "*[❗]* Máximo 50 letras",

  // sticker-wm.js
  wmNull: "*[❕]* Responda a un sticker junto con un texto",

  // convert-stickerToImg.js
  stickerToImgNull: "*[❕]* Responda a un sticker",

  // fun-canvasCarcel.js
  carcelMsg: (years, razon) => `*CUMPLIRÁ LA PENA DE ${years} AÑOS POR ${razon}*`,

  // say.js
  sayText: "*[❕]* Ingrese el texto",

  // sortear.js
  sortearText: "*[❕]* Ingresa el premio",

  // grupo-setname.js
  setNameNull: "*[❕]* Ingrese el nuevo nombre",

  // grupo-setpp.js
  setppNull: "*[❕]* Responde a una imagen para establecerla de perfil del grupo",

  // insta-usuario.js
  instaUsuarioNull: "*[❕]* Debes poner tu usuario de Instagram",
};
