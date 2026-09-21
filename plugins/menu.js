import { getTotalUsers, getChat, getChatBlacklist } from "../database-functions.js";

const plugin = {};
plugin.cmd = ["menu", "menú", "help", "comandos", "ayuda"];

// Formato: cada línea "▸" lleva UN comando principal pegado al ▸ — es el único que ve el parser de candados de más
// abajo. Los secundarios van en la descripción, y ahí no llevan candado. test/menus.test.mjs verifica que todo
// comando nombrado acá exista de verdad en algún plugin.
plugin.run = async (m, { client, usedPrefix }) => {
  const more = String.fromCharCode(8206);
  const readMore = more.repeat(4001);

  const menuText = `
👋 *Hola, ${m.pushName}* — soy Claudia.
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
ℹ *[ 𝙸𝙽𝙵𝙾 𝙳𝙴𝙻 𝙱𝙾𝚃 ]* ℹ
👤 *𝚄𝚂𝚄𝙰𝚁𝙸𝙾𝚂:* ${getTotalUsers()}
🆙 *𝚅𝙴𝚁𝚂𝙸𝙾́𝙽:* ${globalThis.botVersion}
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
📂 *𝙾𝚃𝚁𝙾𝚂 𝙼𝙴𝙽𝚄́𝚂*
▸ ${usedPrefix}menuuru 🇺🇾 – \`Juegos, temáticas, UruCoins, casino y actividad del grupo.\`
▸ ${usedPrefix}menuventas 🛒 – \`Compraventa: publicar, buscar, alertas y calificaciones.\`
▸ ${usedPrefix}menuaero ✈️ – \`Meteorología aeronáutica y reloj Zulu.\`
▸ ${usedPrefix}info 💻 – \`Cómo instalar el bot.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
📌 \`LISTA DE COMANDOS:\`
${readMore}

🇺🇾 *𝚃𝙴𝙼𝙰́𝚃𝙸𝙲𝙰𝚂 𝚈 𝚁𝙰𝙽𝙺𝙸𝙽𝙶 𝙳𝙴𝙻 𝙶𝚁𝚄𝙿𝙾*
▸ #quejadelunes 😤 – \`Registra tu queja de la semana.\`
▸ #historiasrandom 🎲 – \`Registra una historia random.\`
▸ #recomendado ⭐ – \`Registra una recomendación.\`
▸ ${usedPrefix}quejas 😤 – \`Lista de quejas de la semana.\`
▸ ${usedPrefix}historias 🎲 – \`Lista de historias random de la semana.\`
▸ ${usedPrefix}recomendados ⭐ – \`Lista de recomendaciones de la semana.\`
▸ ${usedPrefix}ranking 🏆 – \`Ranking del mes por reacciones.\`
▸ ${usedPrefix}menuuru 🇺🇾 – \`Cómo funcionan las temáticas del grupo.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🛒 *COMPRAVENTA*
▸ #vendo / #compro en un mensaje 🏷️ – \`Registra la publicación con un número. Sirve en el pie de una foto.\`
▸ ${usedPrefix}vendo <qué, precio, zona> 🏷️ – \`Publica. Sin texto muestra el catálogo; respondiendo a una foto, publica esa foto.\`
▸ ${usedPrefix}compro <qué buscás> 🔎 – \`Lo mismo, para lo que estás buscando.\`
▸ ${usedPrefix}catalogo 📋 – \`Todo lo activo del grupo. Con un número, el detalle de esa.\`
▸ ${usedPrefix}buscar <palabra> 🔎 – \`Busca en las publicaciones activas.\`
▸ ${usedPrefix}mias 🗂️ – \`Tus publicaciones activas, con su número.\`
▸ ${usedPrefix}vendido ✅ – \`Respondé a tu publicación cuando se concrete. También .baja, .reservado y .sigue.\`
▸ ${usedPrefix}avisame <palabra> 🔔 – \`Te menciono cuando aparezca algo con esa palabra.\`
▸ ${usedPrefix}calificar @mención 5 <comentario> ⭐ – \`Calificá a quien le compraste o vendiste.\`
▸ ${usedPrefix}reputacion @mención ⭐ – \`Promedio y últimas calificaciones.\`
▸ ${usedPrefix}reglas 📋 – \`Reglas del grupo. .plantilla muestra el formato para publicar.\`
▸ ${usedPrefix}menuventas 🛒 – \`Menú completo de compraventa.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🛡️ *𝚂𝙾𝙻𝙾 𝙰𝙳𝙼𝙸𝙽𝚂*
▸ ${usedPrefix}g 🔒 – \`Abre o cierra el chat del grupo.\`
▸ ${usedPrefix}kick @mención ❌ – \`Expulsa a un participante. También .k y .rifle\`
▸ ${usedPrefix}p @mención 🎫 – \`Dar admin al participante.\`
▸ ${usedPrefix}d @mención 🎫 – \`Quitar admin al participante.\`
▸ ${usedPrefix}del 🗑️ – \`Elimina un mensaje.\`
▸ ${usedPrefix}tagall 👈 – \`Mención a todos los participantes.\`
▸ ${usedPrefix}tagall2 👈 – \`Envía el tagall pero x10 veces seguidas.\`
▸ ${usedPrefix}ht 👈 – \`Mención oculta a todos los participantes.\`
▸ ${usedPrefix}ht2 👈 – \`Igual que ".ht" pero x10 veces seguidas.\`
▸ ${usedPrefix}silenciar @mención 🔇 – \`Silencia un participante. También .mute\`
▸ ${usedPrefix}desilenciar @mención 🔇 – \`Desilencia un participante. También .unmute\`
▸ ${usedPrefix}advertir @mención <motivo> 🤚 – \`Advertir a un participante.\`
▸ ${usedPrefix}unwarn @mención 🤚 – \`Quitar advertencia a un participante.\`
▸ ${usedPrefix}setpp 📸 – \`Cambia la foto del grupo.\`
▸ ${usedPrefix}setname <nombre> ✏️ – \`Cambia el nombre del grupo.\`
▸ ${usedPrefix}getpp 📸 – \`Obtiene la foto de perfil actual del grupo.\`
▸ ${usedPrefix}gpu 📸 – \`Obtiene la foto de perfil de un participante.\`
▸ ${usedPrefix}llamar @mención 🤚 – \`Menciona 20 veces a un usuario\`
▸ ${usedPrefix}rl ♻️ – \`Restaurar enlace del grupo.\`
▸ ${usedPrefix}ap ☑️ – \`Aprobar solicitudes pendientes para unirse.\`
▸ ${usedPrefix}ruletadelban ☠️ – \`Elimina un participante al azar.\`
▸ ${usedPrefix}config ⚙️ – \`Ver la configuración actual del bot en el grupo\`
▸ ${usedPrefix}adminbot @mención 🛡️ – \`Admin del bot solo en este grupo: configura, economía, juegos y modera. Con "quitar" se saca.\`
▸ ${usedPrefix}moderador @mención 🧹 – \`Moderador del bot en este grupo: advertir, silenciar, expulsar y tagall. Con "quitar" se saca.\`
▸ ${usedPrefix}roles 📋 – \`Quiénes tienen rol del bot en este grupo.\`
▸ ${usedPrefix}horariogrupo 8:00-22:00 🌙 – \`Cierra el grupo fuera de ese horario y lo abre solo. "off" lo saca.\`
▸ ${usedPrefix}reglas set <texto> 📋 – \`Carga las reglas del grupo; se mandan al que entra. .plantilla set <texto> hace lo mismo con el formato.\`
▸ ${usedPrefix}calificaciones @mención ⭐ – \`Lista numerada; con "borrar N" o "editar N 4 comentario" corregís una maliciosa.\`
▸ ${usedPrefix}conteo 🏆 – \`Ver los 10 que mas hablan en este grupo.\`
▸ ${usedPrefix}estado 🤖 – \`Estado del bot: conexión, IA, descargas, backups.\`
▸ ${usedPrefix}economia [días] 🪙 – \`Panel de UruCoins: circulación, entradas y salidas por rubro.\`
▸ ${usedPrefix}ln @mención <motivo> 🚫 – \`Lista negra del grupo: no puede entrar acá (a admins no).\`
▸ ${usedPrefix}ln2 @mención ☑️ – \`Sacar de la lista negra del grupo.\`
▸ ${usedPrefix}vln 📋 – \`Ver la lista negra del grupo.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
⚙️ *𝙲𝙾𝙽𝙵𝙸𝙶𝚄𝚁𝙰𝙲𝙸𝙾́𝙽*
*[ Si está activado, se desactiva, y viceversa ]*

▸ ${usedPrefix}modoadmin 🛡️ – \`Bot unicamente para admins.\`
▸ ${usedPrefix}antigrupos 🔗 – \`Elimina links de grupos de WhatsApp.\`
▸ ${usedPrefix}anticanales 🔗 – \`Elimina links de canales de WhatsApp.\`
▸ ${usedPrefix}antilink2 🔗 – \`Elimina todos los links que envian al chat.\`
▸ ${usedPrefix}antitiktok 🔗 – \`Elimina links de TikTok.\`
▸ ${usedPrefix}antiinstagram 🔗 – \`Elimina links de Instagram.\`
▸ ${usedPrefix}antitelegram 🔗 – \`Elimina links de Telegram.\`
▸ ${usedPrefix}welcome 👋 – \`Da la bienvenida a nuevos participantes.\`
▸ ${usedPrefix}detect 👀 – \`Avisa cuando hay nuevos admins, o se hacen cambios en el grupo.\`
▸ ${usedPrefix}antieliminar 🗑️ – \`Reenvía mensajes eliminados en el chat.\`
▸ ${usedPrefix}18 🔞 – \`Busquedas +18 en comandos.\`
▸ ${usedPrefix}juegos 🎮 – \`Uso de juegos.\`
▸ ${usedPrefix}horariojuegos 20:00-23:00 🕒 – \`Juegos solo en ese horario (por grupo). Con "off" se saca.\`
▸ ${usedPrefix}charla 💬 – \`Charla automática de Claudia cuando la nombran.\`
▸ ${usedPrefix}saludos 👋 – \`Saludo automático cuando alguien dice hola.\`
▸ ${usedPrefix}monedas 🪙 – \`Economía de UruCoins del grupo.\`
▸ ${usedPrefix}ascensos 🎖️ – \`Avisos de ascenso de rango.\`
▸ ${usedPrefix}modo compraventa|amigos ⚙️ – \`Apaga o prende todo eso de una, según el tipo de grupo.\`
▸ ${usedPrefix}menciones 👤 – \`Uso de .tagall y .hidetag.\`
▸ ${usedPrefix}audios 🔊 – \`El bot manda audios.\`
▸ ${usedPrefix}reacciones 💚 – \`El bot reacciona a mensajes.\`
▸ ${usedPrefix}preguntadeldia 💬 – \`Pregunta del día para arrancar charla.\`
▸ ${usedPrefix}triviarelampago ⚡ – \`Trivias sorpresa con premio.\`
▸ ${usedPrefix}recapsemanal 📅 – \`Resumen automático los domingos.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🚨 *𝚁𝙴𝙿𝙾𝚁𝚃𝙴𝚂 𝙰 𝙰𝙳𝙼𝙸𝙽𝚂*
▸ ${usedPrefix}reportar 🛑 [responde al mensaje que quiere reportar]
▸ ${usedPrefix}admins 🪧 <mensaje para los admins>
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🎧 *𝙳𝙴𝚂𝙲𝙰𝚁𝙶𝙰𝚂 𝙼𝚄𝙻𝚃𝙸𝙼𝙴𝙳𝙸𝙰*
▸ ${usedPrefix}audio <artista y título> 🎵 – \`Reproduce música de YouTube.\`
▸ ${usedPrefix}video <nombre> 🎥 – \`Busca un video de YouTube.\`
▸ ${usedPrefix}imagen <texto> 📷 – \`Busca una imagen en Google.\`
▸ ${usedPrefix}tt <enlaceTikTok> 📷 – \`Descarga video de TikTok.\`
▸ ${usedPrefix}igdl <enlaceInstagram> 📷 – \`Descarga imagen/video de Instagram.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🤖 *𝙷𝙰𝙱𝙻𝙰𝚁 𝙲𝙾𝙽 𝙸𝙰*
▸ @bot <texto> 🤖 – \`Habla con el bot.\`
▸ ${usedPrefix}gemini <texto> 🤖 – \`Pregunta a la IA.\`
▸ ${usedPrefix}ia <texto> 🤖 – \`Pregunta a la IA.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🔄 *𝙲𝙾𝙽𝚅𝙴𝚁𝚃𝙸𝙳𝙾𝚁𝙴𝚂*
▸ ${usedPrefix}s 🃏 – \`Convierte una imagen o vídeo en sticker.\`
▸ ${usedPrefix}ttp <texto> ✏️ – \`Convierte texto en sticker.\`
▸ ${usedPrefix}ttp2 <texto> 🔖 – \`Convierte texto en sticker RGB.\`
▸ ${usedPrefix}qc <texto> 🐦 – \`Crea un sticker tipo tweet.\`
▸ ${usedPrefix}wm – \`Cambia el autor de un sticker.\`
▸ ${usedPrefix}img – \`Convierte un sticker en imagen.\`
▸ ${usedPrefix}emojimix <🤣+😍> – \`Fusiona dos emojis y lo devuelve en sticker.\`
▸ ${usedPrefix}tts <texto> 🔖 – \`Convierte texto a audio.\`
▸ ${usedPrefix}tomp3 <texto> 🔖 – \`Convierte video o nota de voz a audio MP3.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🖼️ *𝙲𝙰𝙽𝚅𝙰𝚂 𝙲𝙾𝙽 𝙵𝙾𝚃𝙾𝚂*
▸ ${usedPrefix}gay 🌈
▸ ${usedPrefix}trans 🏳️‍⚧️
▸ ${usedPrefix}bi 🌈
▸ ${usedPrefix}simp 🙅🏻‍♂️
▸ ${usedPrefix}licenciahot 🔥
▸ ${usedPrefix}cárcel 🚓
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
💤 *𝙴𝚂𝚃𝙰𝙳𝙾 𝙰𝙵𝙺*
▸ ${usedPrefix}afk <motivo> 💤 – \`Establece un AFK indicando que estarás inactivo.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🔮 *𝙷𝙾𝚁𝙾́𝚂𝙲𝙾𝙿𝙾*
▸ ${usedPrefix}horoscopo <signo> 🔮 – \`Mira tu horoscopo del día.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
📸 *𝙲𝙾𝙼𝙿𝙰𝚁𝚃𝙴 𝚃𝚄 𝙸𝙽𝚂𝚃𝙰𝙶𝚁𝙰𝙼*
▸ ${usedPrefix}ig <tuUsuario> 🤳 – \`Comparte tu instagram con los participantes.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
💞 *𝙿𝙰𝚁𝙴𝙹𝙰, 𝙲𝙰𝚂𝙰𝙼𝙸𝙴𝙽𝚃𝙾 𝚈 𝙵𝙰𝙼𝙸𝙻𝙸𝙰*
▸ ${usedPrefix}pareja @mención ❤‍🔥 – \`Pídele a un participante que sea tu pareja en el grupo.\`
▸ ${usedPrefix}aceptar @mención ✅ – \`Acepta la petición si te la enviaron.\`
▸ ${usedPrefix}rechazar @mención ❌ – \`Rechaza la petición si te la enviaron.\`
▸ ${usedPrefix}mipareja @mención 👩‍❤️‍💋‍👨 – \`Mira el estado de tu pareja actual.\`
▸ ${usedPrefix}terminar 😔 – \`Termina con tu pareja actual.\`
▸ ${usedPrefix}ex 🔙 – \`Mira tus parejas anteriores.\`
▸ ${usedPrefix}casarse 💍 – \`Pídele a tu pareja para casarse.\`
▸ ${usedPrefix}si ✅ – \`Acepta la petición de casarse si te la enviaron.\`
▸ ${usedPrefix}no ❌ – \`Rechaza la petición de casarse si te la enviaron.\`
▸ ${usedPrefix}adoptar @mención 🍼 – \`Un matrimonio adopta a alguien, que responde con .si o .no.\`
▸ ${usedPrefix}familia 👨‍👩‍👧 – \`Tu árbol: padres, hijos, hermanos, abuelos, tíos, primos… (.familia @mención para otro).\`
▸ ${usedPrefix}apellido <apellido> 📜 – \`El matrimonio elige apellido y los hijos lo heredan. .familias las lista por tamaño.\`
▸ ${usedPrefix}emancipar 🧳 – \`Te vas de tu familia. .desheredar @mención saca a un hijo.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
📚 *𝙳𝙴𝙵𝙸𝙽𝙸𝙲𝙸𝙾𝙽𝙴𝚂 𝚁𝙰𝙴*
▸ ${usedPrefix}rae <palabra o expresión> 📚 – \`Definición en el diccionario de la RAE (ej: .rae mal de ojo)\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🎮 *𝙹𝚄𝙴𝙶𝙾𝚂 𝙴𝚇𝚃𝚁𝙰*
▸ ${usedPrefix}ttt 🕹️ – \`TaTeTi\`
▸ ${usedPrefix}delttt 🗑️ – \`Elimina sala creada de TaTeTi.\`
▸ ${usedPrefix}ahorcado 💬 – \`Adivina la palabra en 9 intentos.\`
▸ ${usedPrefix}acertijo ❔ – \`Un acertijo y 30 segundos para resolverlo.\`
▸ ${usedPrefix}trivia ❔ – \`Pregunta con cuatro opciones; respondé con la letra.\`
▸ ${usedPrefix}ordenar 🔠 – \`Ordenar la palabra.\`
▸ ${usedPrefix}bandera 🌍 – \`¿De que país es la bandera?\`
▸ ${usedPrefix}topgays 🌈
▸ ${usedPrefix}formarpareja 👩‍❤️‍💋‍👨 – \`Forma pareja al azar entre dos participantes.\`
▸ ${usedPrefix}siono <texto> – ✅ | ❌
▸ ${usedPrefix}besar @mención 💋
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🙏 *𝙱𝙸𝙱𝙻𝙸𝙰*
\`Acá seguimos al señor\` 🙇‍♂️
▸ ${usedPrefix}versiculo 📖
▸ ${usedPrefix}salmos 📖
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🎚️ *𝙴𝙵𝙴𝙲𝚃𝙾𝚂 𝙳𝙴 𝙰𝚄𝙳𝙸𝙾*
▸ ${usedPrefix}robot
▸ ${usedPrefix}tupai
▸ ${usedPrefix}slow
▸ ${usedPrefix}smooth
▸ ${usedPrefix}bass
▸ ${usedPrefix}blown
▸ ${usedPrefix}deep
▸ ${usedPrefix}earrape
▸ ${usedPrefix}fast
▸ ${usedPrefix}fat
▸ ${usedPrefix}nightcore
▸ ${usedPrefix}reverse
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
✨ *𝙴𝚇𝚃𝚁𝙰𝚂*
▸ ${usedPrefix}orsi 🎙️ – \`Una respuesta al estilo Orsi.\`
▸ ${usedPrefix}say 🗣️ <texto> – \`El bot lo repite como propio. Solo admins y mods.\`
▸ ${usedPrefix}sortear 🏆 <texto>
▸ ${usedPrefix}clima 🌦️ [ciudad] – \`Clima de ahora y de mañana; sin ciudad, Montevideo. Ej: .clima Salto, Argentina\`
▸ ${usedPrefix}traducir <texto>
▸ ${usedPrefix}links 🔗 – \`Links del grupo, el canal y el Discord.\`
▸ ${usedPrefix}discord 🎮 – \`Link del Discord.\`
▸ ${usedPrefix}recordame <cuándo> <texto> ⏰ – \`Ej: .recordame en 2h sacar la pizza · .recordatorios · .olvidar <n>\`
▸ ${usedPrefix}cumple 14/03 🎂 – \`Anotá tu cumple; con .cumples ves los del grupo.\`
▸ ${usedPrefix}resumen [horas] 📝 – \`Resumen con IA de lo que se habló.\`
▸ ${usedPrefix}menuaero ✈️ – \`Meteorología aeronáutica: .metar y .taf, decodificados.\`
▸ ${usedPrefix}perfil @mención 👤 – \`Ficha de una persona: coins, laburo, racha, ranking, duelos, pareja y cumple.\`
▸ ${usedPrefix}rango 🎖️ – \`Tu rango por antigüedad y actividad; .rangos muestra la escalera.\`
▸ ${usedPrefix}recordá que <algo> 🧠 – \`Anotale a Claudia un dato o chiste del grupo; .memoria los lista.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
🥷 *𝚂𝙾𝙻𝙾 𝙾𝚆𝙽𝙴𝚁 𝙳𝙴𝙻 𝙱𝙾𝚃*
▸ ${usedPrefix}banuser 🚫 – \`Banea al participante, no podrá usar el bot.\`
▸ ${usedPrefix}unbanuser ☑️ – \`Desbanea al participante, podrá usar el bot.\`
▸ ${usedPrefix}rd @mención 🔄 – \`Resetea datos de participante.\`
▸ ${usedPrefix}setppbot 📷 – \`Establece foto de perfil al bot.\`
▸ ${usedPrefix}setbotname ✏️ – \`Establece nombre al bot [no funciona con WhatsApp Business]\`
▸ ${usedPrefix}backup 🗄️ – \`Copia de la base y te la manda por privado.\`
▸ ${usedPrefix}ajustar @mención 50 🪙 – \`Corrección de UruCoins a mano (negativo para sacar).\`
▸ ${usedPrefix}leave 👋🏻 – \`El bot se saldrá del grupo.\`
┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈
💻 *¿Querés instalar el bot tu mismo?*
Ver mas información con el siguiente comando:
▸ ${usedPrefix}info
`.trim();

  // Agregar candado 🔒 a los comandos que estén bloqueados en este grupo (modo blacklist).
  let menuFinal = menuText;
  const datosChat = m.isGroup ? getChat(m.chat) : null;
  if (datosChat?.blacklistMode) {
    const bloqueados = new Set(getChatBlacklist(m.chat));
    if (bloqueados.size > 0) {
      const prefijoEscapado = usedPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      menuFinal = menuText
        .split("\n")
        .map((linea) => {
          const match = linea.match(new RegExp(`^▸\\s*${prefijoEscapado}([\\wáéíóúñ@]+)`, "i"));
          if (match) {
            const cmd = match[1].toLowerCase();
            if (bloqueados.has(cmd)) return `${linea} 🔒`;
          }
          return linea;
        })
        .join("\n");
    }
  }

  const kz = await client.sendMessage(m.chat, { text: menuFinal }, { quoted: m });

  client.sendMessage(m.chat, { react: { text: "📚", key: kz.key } });
};

export default plugin;
