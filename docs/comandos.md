# Comandos de Claudia

_Generado desde `lib/menu.js` y `lib/menu-ventas.js` con `npm run comandos`: no se edita a mano, y un test (`test/guia-comandos.test.mjs`) avisa si quedó viejo._

Los comandos van con un punto adelante (`.menu`), pegado o con un espacio (`. menu`), y con o sin tildes (`.menú`); también andan `/` y `@`. En un grupo, `.menu` muestra lo más usado ahí y los temas; `.menu <tema>` abre uno y `.menu todo` los trae todos. No se ofrece lo que el grupo tiene apagado (`.juegos`, `.casino`, `.monedas`, o un juego solo con `.juego`), lo que necesita que Claudia sea admin cuando no lo es, ni lo que el rol de quien pregunta no puede usar. En la charla, Claudia también explica sus comandos si se le pregunta.

## Temas

| Tema | Para quién |
|---|---|
| [🗳️ Temáticas y ranking](#tematicas) | para todos |
| [🪙 UruCoins](#coins) | para todos |
| [🎰 Casino y apuestas](#casino) | para todos |
| [🎧 Descargas](#descargas) | para todos |
| [🤖 Hablar con la IA](#ia) | para todos |
| [🔄 Stickers y convertidores](#convertidores) | para todos |
| [🖼️ Canvas con fotos](#canvas) | para todos |
| [🎮 Juegos](#juegos) | para todos |
| [💞 Pareja y casamiento](#pareja) | para todos |
| [👨‍👩‍👧 Familia](#familia) | para todos |
| [🎚️ Efectos de audio](#audio) | para todos |
| [🙏 Biblia](#biblia) | para todos |
| [✨ Extras](#extras) | para todos |
| [🛡️ Admins y moderadores](#admins) | para moderadores y admins |
| [⚙️ Configuración](#config) | para moderadores y admins |
| [🥷 Solo el owner](#owner) | solo para el owner del bot |
| [📂 Otros menús](#menus) | para todos |
| [🏷️ Modo compraventa](#compraventa) | para todos, con `.menuventas` |

<a id="tematicas"></a>
## 🗳️ Temáticas y ranking

_Para todos. Se abre con `.menu temáticas`, `.menu ranking`, `.menu grupo`._

| Comando | Qué hace |
|---|---|
| `#quejadelunes` 😤 | Registra tu queja de la semana. |
| `#historiasrandom` 🎲 | Registra una historia random. |
| `#recomendado` ⭐ | Registra una recomendación. |
| `.quejas` 😤 | Lista de quejas de la semana. |
| `.historias` 🎲 | Lista de historias random de la semana. |
| `.recomendados` ⭐ | Lista de recomendaciones de la semana. |
| `.ranking` 🏆 | Ranking del mes por reacciones. Con nombres o numeros al final, cada uno por su nombre de WhatsApp o por su número. |

<a id="coins"></a>
## 🪙 UruCoins

_Para todos. Se abre con `.menu coins`, `.menu urucoins`, `.menu monedas`, `.menu economia`, `.menu saldo`, `.menu tienda`, `.menu laburos`, `.menu laburo`._

> _Se ganan reaccionando (+1) y cuando te reaccionan (+2), ganando juegos (+10; hasta 20 premios por día en cada uno y 5 en el ahorcado), con las temáticas (+5, hasta 3 entradas por semana en cada una; la más votada de cada una, +25), ganando el ranking del mes (+50) y poniendo música con .play (+10, hasta 5 temas por día)._
> _También con la racha (+3 a +10), el sueldo de .cobrar, al subir de rango y, donde las prendieron, con la pregunta del día (+3) y la trivia relámpago (+15), y al volver a escribir después de un aviso de .inactivos (+10, una vez cada 30 días)._

| Comando | Qué hace |
|---|---|
| `.bal [@mención]` 🪙 | Tu saldo de UruCoins, o el de otra persona; .baltop, los más ricos del grupo (con nombres o numeros al final, por nombre de WhatsApp o por número). |
| `.regalar @mención 20` 🎁 | Le pasás coins a alguien. |
| `.tienda` 🛒 | Escudo, racha doble, voto doble y apodo: se compran con .comprar escudo, y .inventario [@mención] muestra lo tuyo o lo de otra persona. .playya y .videoya saltan la espera de la música por 15, que se devuelven si la descarga falla. |
| `.laburos` 💼 | Los oficios y cuánto paga hoy cada uno: .laburo &lt;oficio&gt; agarra uno, .cobrar cobra el sueldo del día y .renunciar lo deja. |
| `.racha [@mención]` 🔥 | Tu racha diaria: 3 mensajes de dos palabras o más por día, y el premio sube con los días seguidos. |
| `.mitimba [@mención]` 🎲 | Cuánto apostaste en cada juego y cómo te fue; .timba, los que más apuestan en el grupo. |

<a id="casino"></a>
## 🎰 Casino y apuestas

_Para todos. Se abre con `.menu casino`, `.menu apuestas`, `.menu apostar`, `.menu loteria`, `.menu mercados`, `.menu poker`, `.menu holdem`._

> _.ruleta, .tragamonedas, .blackjack, .mines, .carrera y .poker, escritos solos, explican cómo se juega y cuánto pagan (el póker, si hay mesa abierta, la muestra; .poker ayuda explica igual). Se apuesta de 5 a 100 UruCoins, o hasta el 20 % de tu saldo si es más; en el póker la entrada es fija, de 50 a 100._

| Comando | Qué hace |
|---|---|
| `.ruleta 20 rojo` 🎡 | La primera apuesta abre la mesa; apuestan todos y la bola sale una vez para todas. |
| `.tragamonedas 20` 🍒 | Tres rodillos y cinco líneas de pago. |
| `.blackjack 20` 🃏 | Contra la banca: .pedir, .plantarse, .doblar, .dividir, .seguro o .rendirse. |
| `.mines 20 3` 💣 | Grilla con minas: .destapar B3 sube el multiplicador y .retirar cobra; con una mina perdés. |
| `.poker 100` 🃏 | Texas Hold'em entre los del grupo, de 2 a 6, con las cartas por privado (.cartas): el que abre la mesa la arranca con .poker empezar; en la mesa, .pcheck, .pcall, .praise 20, .allin y .pfold; .levantarme o .pleave te retira con tus fichas; .poker ayuda, cómo se juega y qué jugada gana. |
| `.duelo @mención 20` ⚔️ | Uno contra uno, a dado, carta o pelea (.pelea @mención 20, con .golpe, .patada, .cubrirse y .curar); el otro responde .acepto o .rechazo. |
| `.carrera 20 3` 🏇 | La primera apuesta abre la carrera: cinco caballos, con cuotas que cambian en cada una. |
| `.loteria` 🎟️ | El pozo de la semana; .loteria 2 compra boletos (10 cada uno, hasta 5 por semana). Se sortea al empezar la semana. |
| `.mercados` 📊 | Apuestas sobre eventos reales que abre un admin (y yo, un día antes de cada partido de Peñarol o Nacional): .mercado 7 muestra uno y .jugar 7 Nacional 20 apuesta. Lo apostado se reparte entre los que aciertan, según lo que puso cada uno; si nadie acierta, se devuelve todo. |
| `.partidos` ⚽ | Los partidos de la semana del Uruguayo, la Libertadores, la Sudamericana y la selección, con el número para abrirles apuestas; .partidos libertadores (o uruguayo, sudamericana, seleccion) muestra todos los de esa. |

<a id="descargas"></a>
## 🎧 Descargas

_Para todos. Se abre con `.menu descargas`, `.menu descarga`, `.menu musica`, `.menu videos`._

| Comando | Qué hace |
|---|---|
| `.audio <artista y título>` 🎵 | Reproduce música de YouTube. |
| `.video <nombre>` 🎥 | Busca un video de YouTube. |
| `.imagen <texto>` 📷 | Busca una imagen en Google. |
| `.tt <link de un video de TikTok>` 📷 | Descarga el video. Con un usuario o el link de un perfil (.tt @usuario) manda ese perfil de TikTok al grupo; con @mención, el de esa persona si lo cargó con .misredes, y solo, el tuyo. |
| `.igdl <enlace de Instagram>` 📷 | Descarga la foto o el video. Con un usuario (.igdl @usuario), una @mención o solo, manda el perfil de Instagram, como .ig. |
| `.reintentar` 🔁 | Vuelve a intentar tu último .play o .video que no se pudo bajar. |

<a id="ia"></a>
## 🤖 Hablar con la IA

_Para todos. Se abre con `.menu ia`, `.menu inteligencia`._

> _O nombrame en el chat: "claudia, …"_

| Comando | Qué hace |
|---|---|
| `.ia <texto>` 🤖 | Pregunta a la IA (también .ai y .gemini). |

<a id="convertidores"></a>
## 🔄 Stickers y convertidores

_Para todos. Se abre con `.menu convertidores`, `.menu stickers`, `.menu sticker`, `.menu convertir`._

| Comando | Qué hace |
|---|---|
| `.s` 🃏 | Convierte una imagen o video en sticker. |
| `.ttp <texto>` ✏️ | Convierte texto en sticker. |
| `.ttp2 <texto>` 🔖 | Convierte texto en sticker RGB. |
| `.wm pack\|autor` 🏷️ | Cambia el nombre del pack y el autor del sticker que respondés. |
| `.img` | Convierte un sticker en imagen. |
| `.emojimix` <🤣+😍> | Fusiona dos emojis: hasta 3 stickers. |
| `.stickerazar [tema]` 🎲 | Uno de los stickers que mandó el grupo, al azar o de un tema (risa, perro, enojo). |
| `.sacarsticker` | (Admins) Respondiendo a un sticker: Claudia no lo manda más. |
| `.respuestastickers on/off` | (Admins) Que Claudia mande stickers sola (al contestar y cuando mira el grupo). |
| `.tts <texto>` 🔖 | Convierte texto a audio, con la voz de Claudia si está instalada (edge-tts); .tts -en para otro idioma. |
| `.tomp3` 🔖 | Convierte un video o nota de voz a audio MP3. |
| `.vn` 🎙️ | Convierte el audio o video que respondés en nota de voz. |
| `.res 500` 📐 | Cambia el tamaño de la imagen que respondés: .res 500 o .res 300x600. |
| `.tourl` 🔗 | Sube la imagen o el video que respondés a tmpfiles.org y devuelve el link (lo abre cualquiera que lo tenga). |
| `.r` 👁️ | Reenvía la foto o el video de ver una vez que respondés; los de otra persona, solo admins. |

<a id="canvas"></a>
## 🖼️ Canvas con fotos

_Para todos. Se abre con `.menu canvas`, `.menu fotos`._

| Comando | Qué hace |
|---|---|
| `.gay @mención` 🌈 | Su foto de perfil con un filtro. También .trans, .bi, .simp, .licenciahot y .cárcel. |

<a id="juegos"></a>
## 🎮 Juegos

_Para todos. Se abre con `.menu juegos`, `.menu juego`._

| Comando | Qué hace |
|---|---|
| `.trivia` ❔ | Pregunta con cuatro opciones; respondé con la letra. |
| `.ahorcado` 💬 | Adivina la palabra en 8 intentos. |
| `.acertijo` ❔ | Un acertijo, 30 segundos y 3 intentos cada uno; la respuesta vale con o sin artículo (pez o un pez). |
| `.ordenar` 🔠 | Ordená la palabra. |
| `.bandera` 🌍 | ¿De qué país es la bandera? Al terminar, también su capital. |
| `.ttt` 🕹️ | TaTeTi; .delttt borra la sala. |
| `.4enlinea` 🔴 | 4 en línea entre dos; se juega mandando el número de la columna. Con .4enlinea 100, por UruCoins. .rendirse abandona y .del4enlinea borra la mesa. |
| `.formarpareja` 👩‍❤️‍💋‍👨 | Forma pareja al azar entre dos participantes. |
| `.culpade` 🫵 | ¿De quién es la culpa? De alguien del grupo, al azar. |
| `.aura @mención` ✨ | Batalla de aura: si acepta (.aura si), el grupo vota con 🔵 o 🔴 y el que gana suma 1.000 de aura del mes. .aura sola muestra el ranking (con nombres o numeros al final, por nombre de WhatsApp o por número); .noaura te saca de las batallas y .siaura te vuelve a poner. |
| `.besar @mención` 💋 | Un beso para alguien del grupo. |
| `.siono <pregunta>` | ✅ o ❌. |
| `.topgays` 🌈 | Un top al azar del grupo. |
| `.love @mención` 💘 | Porcentajes en joda (.love, .gay2, .puto, .infiel y otros), de alguien mencionado o tuyos. |

<a id="pareja"></a>
## 💞 Pareja y casamiento

_Para todos. Se abre con `.menu pareja`, `.menu parejas`, `.menu casamiento`, `.menu novios`._

| Comando | Qué hace |
|---|---|
| `.pareja @mención` ❤‍🔥 | Pedile a alguien que sea tu pareja en el grupo. |
| `.aceptar @mención` ✅ | Acepta la petición si te la enviaron. |
| `.rechazar @mención` ❌ | Rechaza la petición si te la enviaron. |
| `.mipareja` 👩‍❤️‍💋‍👨 | Mira el estado de tu pareja actual. |
| `.casarse` 💍 | Pedile casamiento a tu pareja, que responde con .si o .no. |
| `.terminar` 😔 | Termina con tu pareja actual. |
| `.ex` 🔙 | Mira tus parejas anteriores. Con nombres o numeros al final, por nombre de WhatsApp o por número. |
| `.listaparejas` 💑 | Las parejas del grupo, las casadas primero. |

<a id="familia"></a>
## 👨‍👩‍👧 Familia

_Para todos. Se abre con `.menu familia`, `.menu familias`, `.menu parentesco`, `.menu parientes`, `.menu arbol`._

> _Los pedidos de adopción y de casamiento se responden con .si o .no._

| Comando | Qué hace |
|---|---|
| `.familia [@mención]` 🌳 | El árbol: padres, hijos, hermanos, abuelos, tíos, primos, suegros… Con nombres o numeros al final, por nombre de WhatsApp o por número. |
| `.parentesco @mención` 🧬 | Qué es esa persona tuya; con dos menciones, qué es una de la otra. |
| `.familias` 🏠 | Las familias del grupo, cada una con su árbol. Con nombres o numeros al final, por nombre de WhatsApp o por número. |
| `.adoptar @mención` 🍼 | Un matrimonio adopta a alguien, que responde con .si o .no. |
| `.apellido <apellido>` 📜 | El matrimonio elige apellido y los hijos lo heredan. |
| `.emancipar` 🧳 | Te vas de tu familia; .desheredar @mención saca a un hijo. |

<a id="audio"></a>
## 🎚️ Efectos de audio

_Para todos. Se abre con `.menu audio`, `.menu efectos`, `.menu audios`._

> _Respondé a un audio o nota de voz con el efecto._

| Comando | Qué hace |
|---|---|
| `.robot` 🤖 | Voz de robot. Y también .tupai .slow .smooth .bass .blown |
| `.deep` 🎚️ | Voz grave. Y también .earrape .fast .fat .nightcore .reverse |

<a id="biblia"></a>
## 🙏 Biblia

_Para todos. Se abre con `.menu biblia`, `.menu versiculo`._

> `Acá seguimos al señor` 🙇‍♂️

| Comando | Qué hace |
|---|---|
| `.versiculo [Libro cap:vers]` 📖 | Un versículo al azar, o el que pidas: .versiculo Levítico 18:22, Juan 3:16-17, Salmos 23 (el capítulo) o Proverbios (uno de ese libro). .salmo 23 es ese salmo; .salmos, uno al azar. |

<a id="extras"></a>
## ✨ Extras

_Para todos. Se abre con `.menu extras`, `.menu varios`, `.menu herramientas`._

| Comando | Qué hace |
|---|---|
| `.ping` 🏓 | ¿Está Claudia? Contesta Pong, lo que tarda WhatsApp en responderle y desde cuándo está prendida. |
| `.clima [ciudad]` 🌦️ | Clima de ahora y de mañana; sin ciudad, Montevideo. |
| `.recordame <cuándo> <texto>` ⏰ | Ej: .recordame en 2h sacar la pizza · .recordatorios · .olvidar &lt;n&gt; |
| `.cumple 08/10/1997` 🎂 | Anotá tu cumple, con el año; con .cumples (o .cumpleaños) ves los del grupo y cuántos cumple cada uno, por nombre de WhatsApp y sin arrobar; con alias o numero al final, por apodo o por número. |
| `.agedist [n]` 📊 | Cómo se reparten las edades del grupo según los cumples anotados, en tramos de 5 años (o de n: .agedist 2) y por generación. También .distedad y .edades. |
| `.genero mujer` 🚻 | Hombre o mujer, para que Claudia te trate así y tu perfil lo diga; .genero borrar lo saca. Un admin se lo pone a otro con .genero @mención mujer. |
| `.resumen [tiempo]` 📝 | Resumen con IA de lo que se habló: sin nada, los últimos 15 min; .resumen 2h o .resumen 30m, hasta 6 h. |
| `.recap` 📅 | Resumen de la semana en curso; el domingo a la noche sale solo, si el grupo no lo apagó. |
| `.perfil @mención` 👤 | Tu ficha en el grupo: rango y rol, antigüedad, coins, laburo, racha, ranking, duelos, pareja y familia, cumple, redes, reputación, publicaciones, ítems y apodo; con @mención, la de otra persona. |
| `.misredes instagram @usuario` 🔗 | Tus redes en tu perfil de este grupo (Instagram, X, TikTok, Threads, Bluesky, Mastodon, Discord…), por usuario o por link; .misredes las muestra, .misredes @mención las de otro y .misredes borrar instagram la saca. |
| `.rango` 🎖️ | Tu rango por antigüedad y actividad; .rangos muestra la escalera. |
| `.nota <algo>` 🧠 | Anotale a Claudia un dato o chiste del grupo (también .recordá que &lt;algo&gt;); .notas las lista y .notas borrar &lt;número&gt; saca una. |
| `.notas yo` 🧠 | Lo que Claudia anotó de vos charlando en este grupo; .notas olvidame lo borra. |
| `.traducir <texto>` 🌐 | Lo traduce al castellano (o respondé a un mensaje). |
| `.rae <palabra>` 📚 | Definición de la RAE (ej: .rae mal de ojo). |
| `.horoscopo <signo>` 🔮 | Tu horóscopo del día. |
| `.afk <motivo>` 💤 | Avisás que vas a estar inactivo. |
| `.notagall` 🔕 | Los .tagall y .ht no te arroban en este grupo; .sitagall para volver. |
| `.antecedentes` 📋 | Tus advertencias en este grupo, con fecha, hora, motivo y quién te la dio. Con nombres o numeros al final, por nombre de WhatsApp o por número. |
| `.ig @usuario` 🤳 | Compartí tu Instagram con el grupo, con el link; con @mención, el de esa persona si lo cargó con .misredes, y solo, el tuyo. |
| `.x @usuario` 🐦 | Lo mismo con X; y .threads, .bluesky, .mastodon, .facebook, .youtube, .twitch, .spotify, .github, .steam, .linkedin y .telegram, cada uno con su red. |
| `.sortear <premio>` 🏆 | Sortea el premio entre los del grupo. |
| `.orsi` 🎙️ | Una respuesta al estilo Orsi. |
| `.reglas` 📋 | Reglas del grupo; .plantilla, el formato para publicar. |
| `.reportar` 🛑 | Respondé al mensaje que querés reportar a los admins. |
| `.redes` 🔗 | Las redes y links del grupo (Instagram, Discord, el canal…); .redes instagram muestra una sola. .links y .discord siguen andando. |
| `.encuesta pregunta - opción - opción` 📊 | Arma una encuesta: la pregunta y de 2 a 12 opciones, separadas con guiones. |
| `.calc 2+2*3` 🧮 | Calculadora. |
| `.serie [género]` 🎬 | Recomienda una serie (o una película, con .pelicula) del género que digas, o una cualquiera con random. |
| `.ss <url>` 🖥️ | Captura de pantalla de una página web. |
| `.suicidarse` 💀 | Te expulsa del grupo a vos (sí, de verdad). |

<a id="admins"></a>
## 🛡️ Admins y moderadores

_Para moderadores y admins. Se abre con `.menu admins`, `.menu admin`, `.menu moderacion`, `.menu mods`, `.menu moderadores`._

| Comando | Qué hace |
|---|---|
| `.g` 🚪 | Abre o cierra el chat del grupo. |
| `.kick @mención` ❌ | Expulsa a un participante. También .k y .rifle |
| `.inactivos [días]` 💤 | Etiqueta a los que no escriben hace 15 días (o los que digas, de 7 a 365) y les da 3 para volver. |
| `.k inactivos` ☠️ | Solo admins: saca a los avisados que siguieron callados. Primero te dice por privado quiénes, y con tu confirmación saca solo a esos. |
| `.p @mención` 🎫 | Dar admin al participante. |
| `.d @mención` 🎫 | Quitar admin al participante. |
| `.del` 🗑️ | Elimina un mensaje. |
| `.pin [24h\|7d\|30d]` 📌 | Respondiendo a un mensaje, lo fija para todos (7 días si no decís). .unpin lo saca. |
| `.tagall` 👈 | Mención a todos, menos a quienes usaron .notagall. Con -f (solo admins) les llega igual. |
| `.tagall2` 👈 | Envía el tagall pero x10 veces seguidas. |
| `.ht` 👈 | Mención oculta a todos, menos a quienes usaron .notagall. |
| `.ht2` 👈 | Igual que ".ht" pero x10 veces seguidas. |
| `.silenciar @mención` 🔇 | Silencia un participante. También .mute |
| `.desilenciar @mención` 🔇 | Desilencia un participante. También .unmute |
| `.advertir @mención <motivo>` 🤚 | Advertir a un participante. |
| `.unwarn @mención` 🤚 | Quitar advertencia a un participante. |
| `.listaadv` 📋 | Quiénes tienen advertencias en el grupo y cuántas lleva cada uno, sin arrobar, por nombre de WhatsApp; con alias o numero al final, por apodo o por número. |
| `.antecedentes @mención` 📋 | Las últimas 30 advertencias de alguien acá: fecha y hora, motivo, quién la dio y cuáles siguen vigentes. Con nombres o numeros al final, por nombre de WhatsApp o por número. |
| `.clearantecedentes @mención` 🧹 | Solo admins: borra los antecedentes de alguien y sus advertencias vigentes. |
| `.setpp` 📸 | Cambia la foto del grupo. |
| `.setname <nombre>` ✏️ | Cambia el nombre del grupo. |
| `.getpp` 📸 | Obtiene la foto de perfil actual del grupo. |
| `.gpu` 📸 | Obtiene la foto de perfil de un participante. |
| `.id @mención` 🆔 | Número, nombre y LID de alguien del grupo, y el id del chat. |
| `.llamar @mención` 🤚 | Menciona 10 veces a un usuario |
| `.rl` ♻️ | Restaurar enlace del grupo. |
| `.ap` ☑️ | Aprueba los pedidos pendientes para entrar, de a uno; .ap 5 aprueba solo los primeros 5, y .pendientes los lista. |
| `.ruletadelban` ☠️ | Elimina un participante al azar. |
| `.config` ⚙️ | Ver la configuración actual del bot en el grupo |
| `.adminbot @mención` 🛡️ | Admin del bot solo en este grupo: configura, economía, juegos y modera. Con "quitar" se saca. |
| `.moderador @mención` 🧹 | Moderador del bot en este grupo: advertir, silenciar, expulsar, fijar, borrar mensajes, inactivos, antecedentes de otros, tagall y ht. Con "quitar" se saca. |
| `.roles` 📋 | Quiénes tienen rol del bot en este grupo. |
| `.horariogrupo 8:00-22:00` 🌙 | Cierra el grupo fuera de ese horario y lo abre solo. "off" lo saca. |
| `.reglas set <texto>` 📋 | Carga las reglas del grupo; se mandan al que entra. .plantilla set &lt;texto&gt; hace lo mismo con el formato. |
| `.redes instagram <link>` 🔗 | Solo admins: carga una red del grupo (instagram, facebook, x, tiktok, youtube, twitch, spotify, discord, telegram, canal, grupo, web); .redes borrar instagram la saca. |
| `.calificaciones @mención` ⭐ | Lista numerada; con "borrar N" o "editar N 4 comentario" corregís una maliciosa. |
| `.setcumple @mención 08/10/1997` 🎂 | Solo admins: anota o corrige el cumple de alguien, con el año. |
| `.delcumple @mención` 🗑️ | Solo admins: borra el cumple de alguien. Con su número (+598 99 123 456), el de quien ya no está. |
| `.conteo` 🏆 | Ver los 10 que mas hablan en este grupo. |
| `.actividad` 📊 | Cuánto se habla en el grupo y a qué hora, de los últimos 7 días. |
| `.usos` 📈 | Qué comandos se usan más en el grupo, en los últimos 30 días. |
| `.estado` 🤖 | Estado del bot: conexión, IA, descargas, backups, batería. |
| `.bat` 🔋 | Solo admins: batería del teléfono o la tablet donde corre el bot (necesita Termux:API). |
| `.economia [días]` 🪙 | Panel de UruCoins: circulación, entradas y salidas por rubro. |
| `.evento <título> \| <opciones> \| <cierre>` 📊 | Solo admins: abre un mercado de apuestas. Ej: .evento Peñarol vs Nacional \| Peñarol \| Empate \| Nacional \| 20:30. Para un partido de .partidos: .evento partido 12 (el resultado a los 90 minutos) o .evento partido 12 pasa (quién pasa de fase), y el resultado lo cargo yo. |
| `.resolver 7 Nacional` 📊 | Solo admins: carga el resultado de un mercado en el que no apostaste; con "anulado", devuelve todo. |
| `.ln @mención <motivo>` 🚫 | Lista negra del grupo: no puede entrar acá (a admins no). |
| `.ln2 @mención` ☑️ | Sacar de la lista negra del grupo (o .ln2 y su número en .vln). |
| `.vln` 📋 | Ver la lista negra del grupo. |
| `.admins <mensaje>` 🪧 | Llama a los admins con un mensaje. |
| `.say <texto>` 🗣️ | El bot lo repite como propio. |
| `.fr @mención <texto>` 💬 | Manda un mensaje citando uno inventado de esa persona; parece real, por eso es de moderadores. |
| `.link` 🔗 | Solo admins: el link de invitación del grupo. |
| `.ad` 🔽 | Te sacás a vos mismo el admin de WhatsApp. |

<a id="config"></a>
## ⚙️ Configuración

_Para moderadores y admins. Se abre con `.menu config`, `.menu configuracion`, `.menu ajustes`._

> _Las opciones de on u off, sin nada, se invierten; .juego, .iniciativa, .voz, .horariojuegos y .modo solos muestran cómo están._

| Comando | Qué hace |
|---|---|
| `.modoadmin` 🛡️ | Bot únicamente para admins y moderadores, menos .notagall, .sitagall, .noaura y .siaura. |
| `.antigrupos` 🔗 | Elimina links de grupos de WhatsApp. |
| `.anticanales` 🔗 | Elimina links de canales de WhatsApp. |
| `.antilink2` 🔗 | Elimina todos los links que envian al chat. |
| `.antitiktok` 🔗 | Elimina links de TikTok. |
| `.antiinstagram` 🔗 | Elimina links de Instagram. |
| `.antitelegram` 🔗 | Elimina links de Telegram. |
| `.antiubicacion` 📍 | Borra la ubicación en tiempo real que comparte quien no es admin ni moderador. |
| `.antiestados` 📵 | Avisa y expulsa a quien menciona al grupo en un estado (si Claudia es admin; a mods y admins no). |
| `.welcome` 👋 | Da la bienvenida a nuevos participantes. |
| `.detect` 👀 | Avisa cuando hay nuevos admins, o se hacen cambios en el grupo. |
| `.antieliminar` 🗑️ | Reenvía mensajes eliminados en el chat. |
| `.18` 🔞 | Búsquedas +18 en .imagen. |
| `.juegos` 🎮 | Uso de juegos. |
| `.juego mines off` ⛔ | Apaga un solo juego en el grupo (o lo prende con on); sin nada, cómo está cada uno. |
| `.casino` 🎰 | El casino y las apuestas, aparte del resto de los juegos. |
| `.horariojuegos 20:00-23:00` 🕒 | El casino, el ta-te-ti y el 4 en línea solo en ese horario (por grupo). Con "off" se saca. |
| `.charla` 💬 | Charla automática de Claudia cuando la nombran. |
| `.iniciativa on\|off` 🙋 | Claudia participa sola de vez en cuando (reacciona o comenta). Sin nada, muestra cómo viene. |
| `.voz on\|aveces\|siempre\|off` 🎙️ | Claudia contesta con nota de voz: on, cuando le hablan por nota de voz; aveces, eso y alguna respuesta corta de vez en cuando; siempre, todo lo que dice (las respuestas largas van por texto). Sin nada, muestra cómo viene. |
| `.vistazo [prueba]` 👀 | Claudia mira el grupo ya y te cuenta por privado qué decidió; con "prueba" no hace nada. |
| `.saludos` 👋 | Saludo automático cuando alguien dice hola. |
| `.monedas` 🪙 | Economía de UruCoins del grupo. |
| `.ascensos` 🎖️ | Avisos de ascenso de rango. |
| `.modo compraventa\|amigos` ⚙️ | Apaga o prende todo eso de una, según el tipo de grupo. |
| `.catalogoauto` 🛒 | En modo compraventa, el catálogo sale solo cada 4 horas, de 11 a 21, si el grupo estuvo escribiendo. |
| `.mercadosauto` ⚽ | Los mercados que abro sola un día antes de cada partido de Peñarol o Nacional. |
| `.reacciones` 💚 | El bot reacciona a mensajes. |
| `.preguntadeldia` 💬 | Pregunta del día para arrancar charla. |
| `.triviarelampago` ⚡ | Trivias sorpresa con premio. |
| `.recapsemanal` 📅 | Resumen automático los domingos. |

<a id="owner"></a>
## 🥷 Solo el owner

_Solo para el owner del bot. Se abre con `.menu owner`, `.menu dueno`._

| Comando | Qué hace |
|---|---|
| `.banuser` 🚫 | Banea al participante, no podrá usar el bot. |
| `.unbanuser` ☑️ | Desbanea al participante, podrá usar el bot. |
| `.rd @mención` 🔄 | Resetea datos de participante. |
| `.setppbot` 📷 | Establece foto de perfil al bot. |
| `.setbotname` ✏️ | Establece nombre al bot [no funciona con WhatsApp Business] |
| `.backup` 🗄️ | Copia de la base y te la manda por privado. |
| `.enviados` 🤖 | Cuánto mandé, por día, hora y tipo: en un grupo, ese grupo; con todo, el general. |
| `.podar` 🗑️ | Borra el detalle de más de 90 días (actividad por hora, envíos del bot y usos de comandos). |
| `.ajustar @mención 50` 🪙 | Corrección de UruCoins a mano (negativo para sacar). |
| `.setpareja @a @b` 💞 | Los pone de pareja de una; con "\| 3 días", desde hace cuánto. |
| `.setmarry @a @b` 💍 | Casa a una pareja de una; con "\| 3 días", desde hace cuánto. |
| `.leave` 👋🏻 | El bot se saldrá del grupo. |
| `.menciones` 👤 | Que en el grupo anden los arrobazos a todos (.tagall, .tagall2, .ht, .ht2, los de Claudia y los de las encuestas); apagados, solo los hace el owner. |
| `.avisartodos <texto>` 📣 | El mismo aviso a todos los grupos, de a uno y con pausa; .avisartodos cancelar lo corta. |
| `.join <link>` ➕ | Mete al bot en un grupo por su link de invitación. |
| `.bloquear @mención` 🚫 | Bloquea a esa persona en WhatsApp (o por su número); .desbloquear lo deshace. |
| `.addowner <número>` 🥷 | Suma un owner del bot (queda en config.toml); .removeowner lo saca. |
| `.bladd <comando>` 🔒 | Lista negra de comandos del grupo: .blon la activa y .bloff la apaga, .bladd mines bloquea uno (o una sección entera, .bladd +juegos; .blsecciones las lista), .bldel lo saca y .bllist la muestra. Desde privado, con el número del grupo en .blgrupos. |
| `.listabanuser` 📋 | Quiénes están baneados del bot. |
| `.antiprivado` 🚪 | El bot no atiende por privado a nadie más que al owner (ojo: las cartas del póker, .cartas, van por privado). |
| `.autoread` 👀 | Marca como leído lo que le llega. |
| `.bc` 🔇 | Banea el chat: el bot deja de atender ahí (a vos no). |
| `.aa` 🔼 | Te da admin de WhatsApp en el grupo. |

<a id="menus"></a>
## 📂 Otros menús

_Para todos. Se abre con `.menu menus`, `.menu menu`, `.menu otros`, `.menu compraventa`, `.menu ventas`, `.menu aero`._

| Comando | Qué hace |
|---|---|
| `.menuventas` 🛒 | Compraventa: publicar, buscar, alertas y calificaciones. |
| `.menuaero` ✈️ | Meteorología aeronáutica y reloj Zulu. |
| `.info` 💻 | Sobre el bot: su código es abierto, y dónde está. |

<a id="compraventa"></a>
## 🏷️ Modo compraventa

_Para todos. Es el menú de `.menuventas`, para los grupos de compra y venta (`.modo compraventa`)._

📢 **Publicar**
- .vendo &lt;qué, precio, zona&gt; — lo ponés a la venta. Ej: .vendo bici rodado 26, $ 4.500, Mercedes
- Una venta entra al catálogo si dice qué es y el precio: si le falta algo, te digo qué
- .compro &lt;qué buscás&gt; — publicás que lo estás buscando
- #vendo o #compro en un mensaje, o en el pie de una foto, hacen lo mismo
- .vendo respondiendo a una foto — la publica con la descripción que tenga (quien la mandó, o un moderador)
- En modo compraventa alcanza con escribir «vendo», qué es y el precio: le pongo 🏷️ al mensaje y queda en el catálogo
- Ahí, si al aviso le falta algo le pongo ❔. Cómo publicar te lo explico una sola vez, y con palabras te confirmo solo la primera
- Ahí también, si un mensaje parece un aviso o un pedido aunque no esté escrito así, te cuento cómo anotarlo, una sola vez
- Si editás el mensaje para completarlo o corregirlo, vale como escrito de nuevo
- Si mandás de nuevo un aviso tuyo que sigue activo, renuevo esa publicación en vez de hacer otra

🔎 **Ver y buscar**
- .catalogo — todo lo activo · .catalogo N — el detalle de la #N
- .catalogo numero — con el teléfono de quien publicó cada una, para escribirle sin arrobarlo (el detalle: .catalogo N numero)
- En modo compraventa lo muestro yo cada 4 horas, entre las 11 y las 21, si el grupo estuvo escribiendo, y borro el anterior
- .vendo o .compro sin texto — solo las de ese tipo
- .buscar &lt;palabra&gt; — filtra por palabra
- .mias — las tuyas, con su número
- .avisame &lt;palabra&gt; — te aviso acá cuando aparezca · sin nada las lista · .avisame quitar &lt;palabra&gt; la saca
- #busco — te recuerdo quién vende algo parecido, y a quien venda le cuento que lo buscabas. En modo compraventa también con «¿alguien vende…?»

✅ **Cerrar la tuya** — respondé a tu publicación y escribí el comando, o agregá el número
- .vendido — se concretó · .baja — la sacás de la lista
- .reservado — está señada · .sigue — vuelve a estar libre (y la renueva)
- Varias de una vez: .sigue 12 13, o .sigue todas (las que te pregunté; si no pregunté por ninguna, todas las tuyas)
- Si es tuya, también sin el punto y con su número («sigue 12», «vendido 12»), o la palabra sola respondiendo a mi pregunta
- A los 7 días sin novedades pregunto si sigue en pie: una vez por día, entre las 11 y las 21, por todas las tuyas juntas. Lo que queda 2 días sin respuesta lo doy de baja

✏️ **Corregir la tuya** — con su número, o respondiendo a tu publicación
- .precio 12 $ 3.500 — le cambiás el precio · respondiendo a la publicación: .precio $ 3.500
- .editar 12 &lt;texto nuevo&gt; — reescribís el aviso (también .corregir): tiene que decir qué es y el precio
- El precio de una tuya, también sin el punto: «precio 12 $ 3.500»
- Al corregirla se renueva, y vale como respuesta si te había preguntado si sigue en pie

⭐ **Confianza y grupo**
- .calificar @persona 5 buen vendedor — después de operar · .reputacion — la tuya
- .calificaciones @persona — el detalle, con números (los admins corrigen con borrar N o editar N)
- .perfil · .rango · .reglas · .plantilla

🛡️ **Admins**
- .modo compraventa — apaga juegos, economía, charla, saludos, ascensos, recap, pregunta del día, trivia relámpago e iniciativa (.modo amigos vuelve a prender juegos, economía, charla, saludos, ascensos y recap)
- .catalogoauto off — dejo de mostrar el catálogo por mi cuenta (on lo vuelve a prender)
- Los moderadores corrigen la publicación de cualquiera (.precio 12 $ 3.500 · .editar 12 &lt;texto&gt;), y le aviso a quien la publicó
- .baja 12 &lt;motivo&gt;, de un moderador sobre una ajena — la saco del catálogo y le aviso a quien la publicó, con el motivo. Solo un moderador la devuelve (.sigue 12), y ese mismo aviso no vuelve a entrar por 30 días
- .baja @persona &lt;motivo&gt; — saco todas las de esa persona (o .baja todas &lt;motivo&gt; respondiendo a un mensaje suyo)
- .roles · .adminbot @persona · .moderador @persona · .reglas set &lt;texto&gt; · .horario 8:00-22:00 · .config
