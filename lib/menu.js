// The bot's menu. .menu alone is a short index that fits on one screen: what this group uses most (counted, see
// lib/usos.js), the topics and the other menus. .menu <tema> shows one topic, and .menu todo all of them. It used to be
// a single message of 233 lines and 179 commands, with some 70 lines of marketplace, admin and settings before anything
// a member could use.
//
// Format: each topic's lines are one template string with a "▸" line per main command, written right against the ▸:
// that's the command the blacklist mode's 🔒 marks, and test/menus.test.mjs checks that every command named on a "▸"
// line exists. Keep them that way: as separate array elements each line would start with a backtick, and the test would
// stop seeing them without failing.
import { getTotalUsers, usosPorComando } from "../database-functions.js";
import { ultimosDias } from "./actividad.js";
import { USOS } from "./usos.js";

export const MENU = {
  MAS_USADOS: 6,
  MINIMO_GRUPO: 20, // countable uses a group needs over the window for its own ranking
  MINIMO_GENERAL: 50, // the same, for every group together
  POR_DEFECTO: ["audio", "s", "trivia", "bal", "clima", "recordame"], // while there's no data yet
  TEMAS_POR_FILA: 4,
};

// Counted aliases with no line of their own in a plugin that has more than one line: dl-youtube's .vídeo would otherwise
// land on its first line, .audio, and .mifamilia on whichever of .familia and .familias came first.
export const ALIAS_DE_LINEA = { play: "audio", playya: "audio", vídeo: "video", videoya: "video", mifamilia: "familia" };

const SEPARADOR = "┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈";
const TITULO_RANKING = { grupo: "Lo más usado en este grupo", general: "Lo más usado", fijo: "Para arrancar" };

// para: who sees the topic. "todos"; "mods" (moderators, bot admins, WhatsApp admins and the owner); "owner".
export function seccionesDelMenu(usedPrefix = ".") {
  return [
    {
      clave: "grupo",
      alias: ["tematicas", "ranking", "coins", "urucoins", "economia", "casino", "uru"],
      emoji: "🇺🇾",
      titulo: "Temáticas, ranking y UruCoins",
      para: "todos",
      nota: `_Cómo se ganan UruCoins, la tienda, el casino y las apuestas: ${usedPrefix}menuuru_`,
      lineas: `
▸ #quejadelunes 😤 – \`Registra tu queja de la semana.\`
▸ #historiasrandom 🎲 – \`Registra una historia random.\`
▸ #recomendado ⭐ – \`Registra una recomendación.\`
▸ ${usedPrefix}quejas 😤 – \`Lista de quejas de la semana.\`
▸ ${usedPrefix}historias 🎲 – \`Lista de historias random de la semana.\`
▸ ${usedPrefix}recomendados ⭐ – \`Lista de recomendaciones de la semana.\`
▸ ${usedPrefix}ranking 🏆 – \`Ranking del mes por reacciones.\`
▸ ${usedPrefix}bal [@mención] 🪙 – \`Tu saldo de UruCoins, o el de otra persona; .baltop, los más ricos del grupo.\`
`,
    },
    {
      clave: "descargas",
      alias: ["descarga", "musica", "videos"],
      emoji: "🎧",
      titulo: "Descargas",
      para: "todos",
      nota: "",
      lineas: `
▸ ${usedPrefix}audio <artista y título> 🎵 – \`Reproduce música de YouTube.\`
▸ ${usedPrefix}video <nombre> 🎥 – \`Busca un video de YouTube.\`
▸ ${usedPrefix}imagen <texto> 📷 – \`Busca una imagen en Google.\`
▸ ${usedPrefix}tt <link de un video de TikTok> 📷 – \`Descarga el video.\`
▸ ${usedPrefix}igdl <enlace de Instagram> 📷 – \`Descarga la foto o el video.\`
`,
    },
    {
      clave: "ia",
      alias: ["inteligencia"],
      emoji: "🤖",
      titulo: "Hablar con la IA",
      para: "todos",
      nota: `_O nombrame en el chat: "claudia, …"_`,
      lineas: `
▸ ${usedPrefix}ia <texto> 🤖 – \`Pregunta a la IA (también .gemini).\`
`,
    },
    {
      clave: "convertidores",
      alias: ["stickers", "sticker", "convertir"],
      emoji: "🔄",
      titulo: "Stickers y convertidores",
      para: "todos",
      nota: "",
      lineas: `
▸ ${usedPrefix}s 🃏 – \`Convierte una imagen o video en sticker.\`
▸ ${usedPrefix}ttp <texto> ✏️ – \`Convierte texto en sticker.\`
▸ ${usedPrefix}ttp2 <texto> 🔖 – \`Convierte texto en sticker RGB.\`
▸ ${usedPrefix}qc <texto> 🐦 – \`Crea un sticker tipo tweet.\`
▸ ${usedPrefix}wm – \`Cambia el autor de un sticker.\`
▸ ${usedPrefix}img – \`Convierte un sticker en imagen.\`
▸ ${usedPrefix}emojimix <🤣+😍> – \`Fusiona dos emojis en un sticker.\`
▸ ${usedPrefix}tts <texto> 🔖 – \`Convierte texto a audio.\`
▸ ${usedPrefix}tomp3 🔖 – \`Convierte un video o nota de voz a audio MP3.\`
`,
    },
    {
      clave: "canvas",
      alias: ["fotos"],
      emoji: "🖼️",
      titulo: "Canvas con fotos",
      para: "todos",
      nota: "",
      lineas: `
▸ ${usedPrefix}gay @mención 🌈 – \`Su foto de perfil con un filtro. También .trans, .bi, .simp, .licenciahot y .cárcel.\`
`,
    },
    {
      clave: "juegos",
      alias: ["juego"],
      emoji: "🎮",
      titulo: "Juegos",
      para: "todos",
      nota: "",
      lineas: `
▸ ${usedPrefix}trivia ❔ – \`Pregunta con cuatro opciones; respondé con la letra.\`
▸ ${usedPrefix}ahorcado 💬 – \`Adivina la palabra en 9 intentos.\`
▸ ${usedPrefix}acertijo ❔ – \`Un acertijo y 30 segundos para resolverlo.\`
▸ ${usedPrefix}ordenar 🔠 – \`Ordená la palabra.\`
▸ ${usedPrefix}bandera 🌍 – \`¿De qué país es la bandera?\`
▸ ${usedPrefix}ttt 🕹️ – \`TaTeTi; .delttt borra la sala.\`
▸ ${usedPrefix}formarpareja 👩‍❤️‍💋‍👨 – \`Forma pareja al azar entre dos participantes.\`
▸ ${usedPrefix}besar @mención 💋 – \`Un beso para alguien del grupo.\`
▸ ${usedPrefix}siono <pregunta> – \`✅ o ❌.\`
▸ ${usedPrefix}topgays 🌈 – \`Un top al azar del grupo.\`
`,
    },
    {
      clave: "pareja",
      alias: ["parejas", "casamiento", "novios"],
      emoji: "💞",
      titulo: "Pareja y casamiento",
      para: "todos",
      nota: "",
      lineas: `
▸ ${usedPrefix}pareja @mención ❤‍🔥 – \`Pedile a alguien que sea tu pareja en el grupo.\`
▸ ${usedPrefix}aceptar @mención ✅ – \`Acepta la petición si te la enviaron.\`
▸ ${usedPrefix}rechazar @mención ❌ – \`Rechaza la petición si te la enviaron.\`
▸ ${usedPrefix}mipareja 👩‍❤️‍💋‍👨 – \`Mira el estado de tu pareja actual.\`
▸ ${usedPrefix}casarse 💍 – \`Pedile casamiento a tu pareja, que responde con .si o .no.\`
▸ ${usedPrefix}terminar 😔 – \`Termina con tu pareja actual.\`
▸ ${usedPrefix}ex 🔙 – \`Mira tus parejas anteriores.\`
▸ ${usedPrefix}listaparejas 💑 – \`Las parejas del grupo, las casadas primero.\`
`,
    },
    {
      clave: "familia",
      alias: ["familias", "parentesco", "parientes", "arbol"],
      emoji: "👨‍👩‍👧",
      titulo: "Familia",
      para: "todos",
      nota: "_Los pedidos de adopción y de casamiento se responden con .si o .no._",
      lineas: `
▸ ${usedPrefix}familia [@mención] 🌳 – \`El árbol: padres, hijos, hermanos, abuelos, tíos, primos, suegros…\`
▸ ${usedPrefix}parentesco @mención 🧬 – \`Qué es esa persona tuya; con dos menciones, qué es una de la otra.\`
▸ ${usedPrefix}familias 🏠 – \`Las familias del grupo, cada una con su árbol.\`
▸ ${usedPrefix}adoptar @mención 🍼 – \`Un matrimonio adopta a alguien, que responde con .si o .no.\`
▸ ${usedPrefix}apellido <apellido> 📜 – \`El matrimonio elige apellido y los hijos lo heredan.\`
▸ ${usedPrefix}emancipar 🧳 – \`Te vas de tu familia; .desheredar @mención saca a un hijo.\`
`,
    },
    {
      clave: "audio",
      alias: ["efectos", "audios"],
      emoji: "🎚️",
      titulo: "Efectos de audio",
      para: "todos",
      nota: "_Respondé a un audio o nota de voz con el efecto._",
      lineas: `
▸ ${usedPrefix}robot 🤖 – \`Voz de robot. Y también .tupai .slow .smooth .bass .blown\`
▸ ${usedPrefix}deep 🎚️ – \`Voz grave. Y también .earrape .fast .fat .nightcore .reverse\`
`,
    },
    {
      clave: "biblia",
      alias: ["versiculo"],
      emoji: "🙏",
      titulo: "Biblia",
      para: "todos",
      nota: "`Acá seguimos al señor` 🙇‍♂️",
      lineas: `
▸ ${usedPrefix}versiculo 📖 – \`Un versículo al azar; .salmos, uno de los Salmos.\`
`,
    },
    {
      clave: "extras",
      alias: ["varios", "herramientas"],
      emoji: "✨",
      titulo: "Extras",
      para: "todos",
      nota: "",
      lineas: `
▸ ${usedPrefix}clima [ciudad] 🌦️ – \`Clima de ahora y de mañana; sin ciudad, Montevideo.\`
▸ ${usedPrefix}recordame <cuándo> <texto> ⏰ – \`Ej: .recordame en 2h sacar la pizza · .recordatorios · .olvidar <n>\`
▸ ${usedPrefix}cumple 14/03 🎂 – \`Anotá tu cumple; con .cumples ves los del grupo.\`
▸ ${usedPrefix}resumen [horas] 📝 – \`Resumen con IA de lo que se habló.\`
▸ ${usedPrefix}perfil @mención 👤 – \`Ficha: coins, laburo, racha, ranking, duelos, pareja y cumple.\`
▸ ${usedPrefix}rango 🎖️ – \`Tu rango por antigüedad y actividad; .rangos muestra la escalera.\`
▸ ${usedPrefix}recordá que <algo> 🧠 – \`Anotale a Claudia un dato o chiste del grupo; .memoria los lista y .memoria yo, lo que sabe de vos.\`
▸ ${usedPrefix}traducir <texto> 🌐 – \`Lo traduce al castellano (o respondé a un mensaje).\`
▸ ${usedPrefix}rae <palabra> 📚 – \`Definición de la RAE (ej: .rae mal de ojo).\`
▸ ${usedPrefix}horoscopo <signo> 🔮 – \`Tu horóscopo del día.\`
▸ ${usedPrefix}afk <motivo> 💤 – \`Avisás que vas a estar inactivo.\`
▸ ${usedPrefix}notagall 🔕 – \`Los .tagall y .ht no te arroban en este grupo; .sitagall para volver.\`
▸ ${usedPrefix}ig <usuario> 🤳 – \`Compartí tu Instagram con el grupo.\`
▸ ${usedPrefix}sortear <premio> 🏆 – \`Sortea el premio entre los del grupo.\`
▸ ${usedPrefix}orsi 🎙️ – \`Una respuesta al estilo Orsi.\`
▸ ${usedPrefix}reglas 📋 – \`Reglas del grupo; .plantilla, el formato para publicar.\`
▸ ${usedPrefix}reportar 🛑 – \`Respondé al mensaje que querés reportar a los admins.\`
▸ ${usedPrefix}links 🔗 – \`Links del grupo, el canal y el Discord (.discord, solo el Discord).\`
`,
    },
    {
      clave: "admins",
      alias: ["admin", "moderacion", "mods", "moderadores"],
      emoji: "🛡️",
      titulo: "Admins y moderadores",
      para: "mods",
      nota: "",
      lineas: `
▸ ${usedPrefix}g 🚪 – \`Abre o cierra el chat del grupo.\`
▸ ${usedPrefix}kick @mención ❌ – \`Expulsa a un participante. También .k y .rifle\`
▸ ${usedPrefix}inactivos [días] 💤 – \`Etiqueta a los que no escriben hace 15 días (o los que digas, de 7 a 365) y les da 3 para volver.\`
▸ ${usedPrefix}k inactivos ☠️ – \`Solo admins: saca a los avisados que siguieron callados. Primero te dice por privado quiénes, y con tu confirmación saca solo a esos.\`
▸ ${usedPrefix}p @mención 🎫 – \`Dar admin al participante.\`
▸ ${usedPrefix}d @mención 🎫 – \`Quitar admin al participante.\`
▸ ${usedPrefix}del 🗑️ – \`Elimina un mensaje.\`
▸ ${usedPrefix}pin [24h|7d|30d] 📌 – \`Respondiendo a un mensaje, lo fija para todos (7 días si no decís). .unpin lo saca.\`
▸ ${usedPrefix}tagall 👈 – \`Mención a todos, menos a quienes usaron .notagall. Con -f (solo admins) les llega igual.\`
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
▸ ${usedPrefix}id @mención 🆔 – \`Número, nombre y LID de alguien del grupo, y el id del chat.\`
▸ ${usedPrefix}llamar @mención 🤚 – \`Menciona 10 veces a un usuario\`
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
▸ ${usedPrefix}actividad 📊 – \`Cuánto se habla en el grupo y a qué hora, de los últimos 7 días.\`
▸ ${usedPrefix}usos 📈 – \`Qué comandos se usan más en el grupo, en los últimos 30 días.\`
▸ ${usedPrefix}estado 🤖 – \`Estado del bot: conexión, IA, descargas, backups, batería.\`
▸ ${usedPrefix}economia [días] 🪙 – \`Panel de UruCoins: circulación, entradas y salidas por rubro.\`
▸ ${usedPrefix}ln @mención <motivo> 🚫 – \`Lista negra del grupo: no puede entrar acá (a admins no).\`
▸ ${usedPrefix}ln2 @mención ☑️ – \`Sacar de la lista negra del grupo (o .ln2 y su número en .vln).\`
▸ ${usedPrefix}vln 📋 – \`Ver la lista negra del grupo.\`
▸ ${usedPrefix}admins <mensaje> 🪧 – \`Llama a los admins con un mensaje.\`
▸ ${usedPrefix}say <texto> 🗣️ – \`El bot lo repite como propio.\`
`,
    },
    {
      clave: "config",
      alias: ["configuracion", "ajustes"],
      emoji: "⚙️",
      titulo: "Configuración",
      para: "mods",
      nota: "_Cada opción con on u off; sin nada, la invierte._",
      lineas: `
▸ ${usedPrefix}modoadmin 🛡️ – \`Bot unicamente para admins.\`
▸ ${usedPrefix}antigrupos 🔗 – \`Elimina links de grupos de WhatsApp.\`
▸ ${usedPrefix}anticanales 🔗 – \`Elimina links de canales de WhatsApp.\`
▸ ${usedPrefix}antilink2 🔗 – \`Elimina todos los links que envian al chat.\`
▸ ${usedPrefix}antitiktok 🔗 – \`Elimina links de TikTok.\`
▸ ${usedPrefix}antiinstagram 🔗 – \`Elimina links de Instagram.\`
▸ ${usedPrefix}antitelegram 🔗 – \`Elimina links de Telegram.\`
▸ ${usedPrefix}antiubicacion 📍 – \`Borra la ubicación en tiempo real que comparte quien no es admin ni moderador.\`
▸ ${usedPrefix}welcome 👋 – \`Da la bienvenida a nuevos participantes.\`
▸ ${usedPrefix}detect 👀 – \`Avisa cuando hay nuevos admins, o se hacen cambios en el grupo.\`
▸ ${usedPrefix}antieliminar 🗑️ – \`Reenvía mensajes eliminados en el chat.\`
▸ ${usedPrefix}18 🔞 – \`Busquedas +18 en comandos.\`
▸ ${usedPrefix}juegos 🎮 – \`Uso de juegos.\`
▸ ${usedPrefix}casino 🎰 – \`El casino y las apuestas, aparte del resto de los juegos.\`
▸ ${usedPrefix}horariojuegos 20:00-23:00 🕒 – \`Juegos solo en ese horario (por grupo). Con "off" se saca.\`
▸ ${usedPrefix}charla 💬 – \`Charla automática de Claudia cuando la nombran.\`
▸ ${usedPrefix}iniciativa on|off 🙋 – \`Claudia participa sola de vez en cuando (reacciona o comenta). Sin nada, muestra cómo viene.\`
▸ ${usedPrefix}vistazo [prueba] 👀 – \`Claudia mira el grupo ya y te cuenta por privado qué decidió; con "prueba" no hace nada.\`
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
`,
    },
    {
      clave: "owner",
      alias: ["dueño", "dueno"],
      emoji: "🥷",
      titulo: "Solo el owner",
      para: "owner",
      nota: "",
      lineas: `
▸ ${usedPrefix}banuser 🚫 – \`Banea al participante, no podrá usar el bot.\`
▸ ${usedPrefix}unbanuser ☑️ – \`Desbanea al participante, podrá usar el bot.\`
▸ ${usedPrefix}rd @mención 🔄 – \`Resetea datos de participante.\`
▸ ${usedPrefix}setppbot 📷 – \`Establece foto de perfil al bot.\`
▸ ${usedPrefix}setbotname ✏️ – \`Establece nombre al bot [no funciona con WhatsApp Business]\`
▸ ${usedPrefix}backup 🗄️ – \`Copia de la base y te la manda por privado.\`
▸ ${usedPrefix}enviados 🤖 – \`Cuánto mandé, por día, hora y tipo: en un grupo, ese grupo; con todo, el general.\`
▸ ${usedPrefix}podar 🗑️ – \`Borra el detalle de más de 90 días (actividad por hora, envíos del bot y usos de comandos).\`
▸ ${usedPrefix}bat 🔋 – \`Batería del teléfono o la tablet donde corre el bot (necesita Termux:API).\`
▸ ${usedPrefix}ajustar @mención 50 🪙 – \`Corrección de UruCoins a mano (negativo para sacar).\`
▸ ${usedPrefix}setpareja @a @b 💞 – \`Los pone de pareja de una; con "| 3 días", desde hace cuánto.\`
▸ ${usedPrefix}setmarry @a @b 💍 – \`Casa a una pareja de una; con "| 3 días", desde hace cuánto.\`
▸ ${usedPrefix}leave 👋🏻 – \`El bot se saldrá del grupo.\`
`,
    },
    {
      // The other menus: the index's footer, not one more topic in its list.
      clave: "menus",
      alias: ["menu", "otros", "compraventa", "ventas", "aero"],
      emoji: "📂",
      titulo: "Otros menús",
      para: "todos",
      nota: "",
      lineas: `
▸ ${usedPrefix}menuuru 🇺🇾 – \`Juegos del grupo, UruCoins, tienda, casino y apuestas.\`
▸ ${usedPrefix}menuventas 🛒 – \`Compraventa: publicar, buscar, alertas y calificaciones.\`
▸ ${usedPrefix}menuaero ✈️ – \`Meteorología aeronáutica y reloj Zulu.\`
▸ ${usedPrefix}info 💻 – \`Sobre el bot: su código es abierto, y dónde está.\`
`,
    },
  ];
}

// ---------- reading the lines ----------

const lineasDe = (seccion) =>
  seccion.lineas
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

// Commands named in a line's text (".baltop", ".unpin"): the same shape test/menus.test.mjs looks for.
const NOMBRADOS = /(?:^|[\s·(/])\.([a-záéíóúñ][\wáéíóúñ]*)/g;

// The main command of a "▸" line, the one right against the ▸; null for the hashtag lines.
export function comandoDeLinea(linea, usedPrefix = ".") {
  const prefijo = usedPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = String(linea).match(new RegExp(`^▸\\s*${prefijo}([\\wáéíóúñ@]+)`, "i"));
  return m ? m[1].toLowerCase() : null;
}

// Every "▸" line with a main command: { seccion, linea, cmd, nombrados, orden }.
export function entradasDelMenu(usedPrefix = ".", secciones = seccionesDelMenu(usedPrefix)) {
  const entradas = [];
  for (const seccion of secciones) {
    for (const linea of lineasDe(seccion)) {
      const cmd = comandoDeLinea(linea, usedPrefix);
      if (cmd) entradas.push({ seccion, linea, cmd, nombrados: [...linea.matchAll(NOMBRADOS)].map((x) => x[1].toLowerCase()), orden: entradas.length });
    }
  }
  return entradas;
}

// Adds the 🔒 to the commands blocked in this group (blacklist mode, .bladd).
export function marcarBloqueados(texto, usedPrefix, bloqueados) {
  if (!bloqueados?.size) return texto;
  return texto
    .split("\n")
    .map((linea) => (bloqueados.has(comandoDeLinea(linea, usedPrefix)) ? `${linea} 🔒` : linea))
    .join("\n");
}

// ---------- who sees what, and what can run where ----------

export const puedeVer = (seccion, { isMod = false, isOwner = false } = {}) => seccion.para === "todos" || (seccion.para === "mods" && (isMod || isOwner)) || (seccion.para === "owner" && isOwner);

// The plugins that answer to a command, read on every call: hot reloading swaps the plugin objects.
const duenosDe = (cmd, plugins) => Object.values(plugins || {}).filter((p) => Array.isArray(p?.cmd) && p.cmd.includes(cmd));

// Whether the command would run here: the same flag checks handle-message.js makes before running a plugin (a test
// keeps the two in step). With no plugin (it didn't load) it can't. isBotAdmin: whether Claudia is admin in the group;
// without it, the index recommended commands the dispatcher then refused.
export function puedeCorrerAca(cmd, { isGroup = false, datosChat = null, isBotAdmin = true, plugins = globalThis.plugins } = {}) {
  return duenosDe(cmd, plugins).some(
    (p) =>
      !(p.onlyGroup && !isGroup) &&
      !(p.botAdmin && isGroup && !isBotAdmin) &&
      !(p.juego && datosChat && !datosChat.games) &&
      !(p.casino && isGroup && datosChat?.casino === 0) &&
      !(p.economia && isGroup && datosChat?.monedas === 0),
  );
}

// Commands only some people can run (.say, .admins): they don't go in a list for everyone.
const conPermiso = (cmd, plugins) => {
  const duenos = duenosDe(cmd, plugins);
  return duenos.length > 0 && duenos.every((p) => p.onlyOwner || p.onlyAdmin || p.onlyMod);
};

// ---------- "lo más usado" ----------

// Which menu line a counted command belongs to, so its aliases add up on one line (.s and .sticker). In order: its own
// line; ALIAS_DE_LINEA; a line that names it in its text (.baltop, .unpin); the first command of its plugin that has a
// line, or is named in one (the bot's number, which talks to the AI by mention, lands on .ia). Lines for everyone win,
// so .reglas goes to the members' line and not to .reglas set. null when nothing fits: .usos still shows it.
function indiceDeLineas(entradas, plugins) {
  const publicasPrimero = [...entradas].sort((a, b) => (a.seccion.para === "todos" ? 0 : 1) - (b.seccion.para === "todos" ? 0 : 1));
  const propia = new Map();
  const nombrada = new Map();
  for (const e of publicasPrimero) {
    if (!propia.has(e.cmd)) propia.set(e.cmd, e);
    for (const n of e.nombrados) if (!nombrada.has(n)) nombrada.set(n, e);
  }
  return (comando) => {
    const cmd = String(comando).toLowerCase();
    if (propia.has(cmd)) return propia.get(cmd);
    if (propia.has(ALIAS_DE_LINEA[cmd])) return propia.get(ALIAS_DE_LINEA[cmd]);
    if (nombrada.has(cmd)) return nombrada.get(cmd);
    const alias = duenosDe(cmd, plugins).flatMap((p) => p.cmd);
    for (const a of alias) if (propia.has(a)) return propia.get(a);
    for (const a of alias) if (nombrada.has(a)) return nombrada.get(a);
    return null;
  };
}

// Adds up a level's counts per line, among the lines that can be shown: { total, orden }, most used first and ties in
// menu order.
function rankingDe(filas, lineaDe, elegible) {
  const porLinea = new Map();
  for (const { comando, total } of filas) {
    const e = lineaDe(comando);
    if (e && elegible(e)) porLinea.set(e, (porLinea.get(e) || 0) + total);
  }
  const total = [...porLinea.values()].reduce((a, b) => a + b, 0);
  const orden = [...porLinea.entries()].sort((a, b) => b[1] - a[1] || a[0].orden - b[0].orden).map(([e]) => e);
  return { total, orden };
}

// The index's "lo más usado": the group's ranking over the last USOS.DIAS days when it has enough uses, then every group
// together, then MENU.POR_DEFECTO, filling the places left without repeats. Only lines for everyone that can run here:
// no menus, nothing that needs a rank, nothing switched off or blocked in this group. Returns { lineas, fuente }.
export function lineasMasUsadas({ usedPrefix = ".", chatId = null, isGroup = false, datosChat = null, isBotAdmin = true, bloqueados = new Set(), plugins = globalThis.plugins, ahora = new Date() } = {}) {
  const entradas = entradasDelMenu(usedPrefix);
  const lineaDe = indiceDeLineas(entradas, plugins);
  const elegible = (e) => e.seccion.para === "todos" && e.seccion.clave !== "menus" && !bloqueados.has(e.cmd) && !conPermiso(e.cmd, plugins) && puedeCorrerAca(e.cmd, { isGroup, datosChat, isBotAdmin, plugins });
  const dias = ultimosDias(ahora, USOS.DIAS);
  const niveles = [];
  if (isGroup && chatId) niveles.push({ fuente: "grupo", minimo: MENU.MINIMO_GRUPO, filas: usosPorComando(chatId, dias) });
  niveles.push({ fuente: "general", minimo: MENU.MINIMO_GENERAL, filas: usosPorComando(null, dias) });

  const elegidas = [];
  let fuente = null;
  const sumar = (lista) => {
    for (const e of lista) if (elegidas.length < MENU.MAS_USADOS && !elegidas.includes(e)) elegidas.push(e);
  };
  for (const nivel of niveles) {
    const { total, orden } = rankingDe(nivel.filas, lineaDe, elegible);
    if (total < nivel.minimo) continue;
    fuente ??= nivel.fuente;
    sumar(orden);
  }
  sumar(MENU.POR_DEFECTO.map((cmd) => entradas.find((e) => e.cmd === cmd && e.seccion.para === "todos")).filter((e) => e && elegible(e)));
  return { lineas: elegidas.map((e) => e.linea), fuente: fuente || "fijo" };
}

// ---------- the replies ----------

const normalizar = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/^[+.]+/, "");

const TODO = new Set(["todo", "todos", "completo", "all"]);

// The topic someone asked for, by its key or an alias: lowercase, accents and a leading "+" or "." don't matter.
export function buscarTema(pedido, secciones = seccionesDelMenu()) {
  const t = normalizar(pedido);
  if (!t) return null;
  return secciones.find((s) => normalizar(s.clave) === t || s.alias.some((a) => normalizar(a) === t)) || null;
}

const textoSeccion = (seccion) => [`${seccion.emoji} *${seccion.titulo}*`, seccion.nota, ...lineasDe(seccion)].filter(Boolean).join("\n");

const cabecera = (nombre) => `👋 *Hola${nombre ? `, ${nombre}` : ""}* — soy Claudia (${[globalThis.botVersion, `${getTotalUsers()} usuarios`].filter(Boolean).join(" · ")})`;

function filasDeTemas(temas) {
  const filas = [];
  for (let i = 0; i < temas.length; i += MENU.TEMAS_POR_FILA) {
    filas.push(
      temas
        .slice(i, i + MENU.TEMAS_POR_FILA)
        .map((s) => `${s.emoji} ${s.clave}`)
        .join(" · "),
    );
  }
  return filas;
}

// .menu: who, what's used most, the topics this person can see and the other menus, on one screen.
function indice({ secciones, usedPrefix, nombre, contexto, ranking }) {
  const temas = secciones.filter((s) => s.clave !== "menus" && puedeVer(s, contexto));
  const lineas = [cabecera(nombre), "", `⭐ *${TITULO_RANKING[ranking.fuente]}*`, ...ranking.lineas];
  if (globalThis.geminiApiKey && contexto.datosChat?.charla !== 0) lineas.push(`💬 Y a mí hablame nombrándome: "claudia, …"`);
  if (contexto.isGroup && !contexto.isBotAdmin) lineas.push("⚠️ Acá no soy admin: muchos comandos no andan hasta que me hagan admin del grupo.");
  lineas.push("", `📂 *Temas* — escribí ${usedPrefix}menu y el tema:`, ...filasDeTemas(temas), "", `📜 *Todo junto:* ${usedPrefix}menu todo`);
  // The other menus that work here: .menuuru and .menuventas only in groups.
  const menus = secciones.find((s) => s.clave === "menus");
  const otros = entradasDelMenu(usedPrefix, [menus])
    .map((e) => e.cmd)
    .filter((cmd) => puedeCorrerAca(cmd, contexto));
  if (otros.length) lineas.push(`🗂️ *Otros menús:* ${otros.map((cmd) => `${usedPrefix}${cmd}`).join(" · ")}`);
  return lineas.join("\n");
}

// What .menu answers: the index with nothing after it, one topic, or everything with "todo". The 🔒 marks go on any of
// them. "bloqueados" are the commands blocked in this group (empty outside blacklist mode).
export function textoMenu({ pedido = "", usedPrefix = ".", nombre = "", chatId = null, isGroup = false, datosChat = null, isBotAdmin = true, isMod = false, isOwner = false, bloqueados = new Set(), plugins = globalThis.plugins, ahora = new Date() } = {}) {
  const secciones = seccionesDelMenu(usedPrefix);
  const contexto = { isGroup, datosChat, isBotAdmin, isMod, isOwner, plugins };
  const tema = String(pedido || "").trim().split(/\s+/)[0];
  const visibles = secciones.filter((s) => puedeVer(s, contexto));
  const pie = `${SEPARADOR}\n${usedPrefix}menu para volver · ${usedPrefix}menu todo para verlo todo`;
  let texto;

  if (!normalizar(tema)) {
    const ranking = lineasMasUsadas({ usedPrefix, chatId, isGroup, datosChat, isBotAdmin, bloqueados, plugins, ahora });
    texto = indice({ secciones, usedPrefix, nombre, contexto, ranking });
  } else if (TODO.has(normalizar(tema))) {
    texto = [cabecera(nombre), ...visibles.map(textoSeccion)].join(`\n${SEPARADOR}\n`);
  } else {
    const seccion = buscarTema(tema, secciones);
    if (!seccion) {
      const temas = visibles.filter((s) => s.clave !== "menus");
      texto = `🤔 No tengo el tema *${tema.slice(0, 30)}*. Los temas son:\n${filasDeTemas(temas).join("\n")}\n\n${usedPrefix}menu todo para verlo todo.`;
    } else if (!puedeVer(seccion, contexto)) {
      texto = seccion.para === "owner" ? "🥷 Ese tema es solo del owner del bot." : "🛡️ Ese tema es para admins y moderadores del grupo.";
    } else {
      texto = `${textoSeccion(seccion)}\n${pie}`;
    }
  }
  return marcarBloqueados(texto, usedPrefix, bloqueados);
}
