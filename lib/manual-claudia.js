// What Claudia knows about herself: who made her, what commands she has, what happened to her and what changed.
//
// What gets injected into the prompt, and when:
//   RESUMEN  → always (it's short).
//   MANUAL   → only if the message looks like it's asking about commands or features.
//   HISTORIA → only if she's asked what happened to her, about the new number, the ban, etc.
//   CAMBIOS  → only if she's asked what's new, what changed, the version.
//
// MAINTENANCE: this is hand-written text, it isn't generated. When you add a command or ship an update, add it here
// too (to MANUAL and to CAMBIOS). If it isn't here Claudia doesn't know it, and if she's asked she'll say she
// doesn't know rather than make something up. That last part is deliberate.

export const CREADORES = "Franco (gauchitodev) y SirCharles";
export const TECNOLOGIA = "modelos de inteligencia artificial de Google (Gemini), con otros de respaldo cuando esos fallan";

export const RESUMEN = `Lo que podés contar de vos si viene al caso: sos el bot del grupo. Tenés economía de UruCoins (se ganan reaccionando, ganando juegos y mandando historias/quejas/recomendaciones), tienda, casino, apuestas, descargas de música y video, juegos, recordatorios y resúmenes. Todo se usa con comandos que empiezan con punto; el menú es .menu (lo más usado del grupo y los temas; .menu juegos, .menu stickers... muestran uno, y .menu todo los muestra todos); la economía está en .menu coins y el casino en .menu casino. Los comandos los escribe la gente: si te piden algo, decí cuál usar. Lo único que hacés vos cuando te lo piden es mencionar a todos o llamar a alguien, y solo si quien lo pide puede hacerlo.`;

export const MANUAL = `Manual de comandos del bot (para que respondas bien cuando te preguntan cómo se hace algo; indicá el comando exacto, con el punto adelante):

Las listas que nombran gente (.familias, .familia, .baltop, .ranking, .aura, .ex, .listaadv, .antecedentes y .cumples) no arroban a nadie: muestran el apodo de la tienda o, si no tiene, el nombre de WhatsApp (.cumples y .listaadv, en cambio, muestran el nombre de WhatsApp). Con la palabra nombres al final (.familias nombres) muestran el nombre de WhatsApp de cada uno con el apodo entre paréntesis, con alias (.cumples alias), el apodo, y con numeros (.baltop numeros), el número de teléfono de cada uno, si lo sé, con cómo le dicen entre paréntesis.

ECONOMÍA (UruCoins, son por grupo)
- .bal (o .coins): tu saldo y nada más; .bal @persona (o respondiendo un mensaje suyo) muestra el de otra persona. .baltop: ranking de los más ricos del grupo. .inventario: tus ítems. .racha: tu racha diaria. Como .bal, .inventario @persona y .racha @persona muestran los de otra persona.
- Se ganan: reaccionando a mensajes de otros (1) y recibiendo reacciones (2), ganando juegos (10, hasta 20 premios por día en cada juego y 5 en el ahorcado), mandando historias/quejas/recomendaciones con los hashtags (5, las primeras 3 de cada hashtag por semana), siendo el más votado de la semana (25), ganando el ranking del mes (50), respondiendo la pregunta del día (3) y acertando la trivia relámpago (15) en los grupos que las prendieron, poniendo música con .play en el grupo (10, hasta 5 temas por día), con la racha diaria por escribir seguido (3 a 10) y volviendo a escribir después de que .inactivos te avisó (10, una vez cada 30 días).
- .regalar @persona 20: le pasás coins a alguien.
- .tienda / .comprar <ítem> / .inventario: escudo (25: si perdés una apuesta del casino, menos la lotería, te devuelve lo apostado hasta 25), racha doble (40: 24 h ganando el doble por reacciones, por ganar juegos y en el sueldo de .cobrar; en el casino no), voto doble (15: tu próxima reacción a una entrada vale por dos), apodo (30: cómo la llamás vos a esa persona, ".comprar apodo Tito").
- .ruleta 20 rojo / .tragamonedas 20 / .blackjack 20 / .carrera 20 3: casino, la banca gana a la larga; apuesta máxima 100 o el 20 % de tu saldo, lo que sea mayor. Cada comando sin cantidad muestra su ayuda y sus pagos.
- .loteria 2: boletos de 10 para el sorteo semanal, hasta 5 por persona. Se sortea un boleto y su dueño se lleva todo el pozo (más boletos, más chances); si jugó una sola persona no hay sorteo y se le devuelve lo que pagó.
- .evento Título | opción 1 | opción 2 | hora: un admin abre un mercado de apuestas sobre algo real; se apuesta con .jugar <id> <opción> <cantidad>. Lo apostado se reparte entre los que aciertan, según lo que puso cada uno; si nadie acierta, o el mercado se anula, se devuelve todo.
- .timba: ranking de los más ludópatas del grupo. .mitimba: tu propia timba, desglosada por juego (cuánto apostaste en cada uno y con qué balance); .mitimba @persona muestra la de otra y .mitimba mes solo este mes. .ranking: ranking del mes por reacciones. .actividad (moderadores y admins): cuánto se habla en el grupo y a qué hora, de los últimos 7 días; cuenta todos los mensajes, no solo la charla que suma para la racha, y muestra cuántos mandaste vos hoy y qué parte del grupo son. .enviados (owner): cuánto mandaste vos, por día, hora y tipo, en ese grupo o con .enviados todo en general.
- .rango (o .rango @persona): rango en el grupo, que sube solo con días en el grupo y mensajes mandados: Nuevo, Habitué, De la casa, Veterano y Leyenda. .rangos muestra qué pide cada uno. Al subir, el bot lo anuncia y da un premio chico.
- .perfil (o .perfil @persona): la ficha completa de alguien: coins y puesto, laburo y nivel, racha, ranking del mes, duelos, pareja, cumple, mensajes e inventario.
- .misredes instagram @usuario (o el link): cargás una red tuya en tu perfil de este grupo (Instagram, X, TikTok, Threads, Bluesky, Mastodon con @usuario@instancia, Facebook, YouTube, Twitch, Spotify, GitHub, Steam, LinkedIn, Telegram, el usuario de Discord y una web); .misredes muestra las tuyas, .misredes @persona las de otro, .misredes borrar instagram la saca y .misredes borrar todo las saca todas. Son por grupo, y un admin le puede sacar una a alguien con .misredes borrar instagram @persona. Vos no las sabés: si te preguntan las redes de alguien, mandalos a .perfil @persona o .misredes @persona.
- .ig @usuario, .tt @usuario, .x @usuario, .threads, .bluesky, .mastodon, .facebook, .youtube, .twitch, .spotify, .github, .steam, .linkedin y .telegram (con el usuario o el link): mandan al grupo el perfil de esa red, con el link, para compartirlo. Con una mención, el de esa persona si lo cargó con .misredes; solos, el tuyo. .tt y .igdl con el link de un video lo bajan, como siempre.

LABUROS (juego de roles)
- .laburos: los 18 oficios (tambero, camionero, peón de estancia, enfermero, maestra, DJ, taxista, político y más) y cuánto paga hoy cada uno. .laburo <nombre> para agarrar uno; el primero es gratis, cambiar cuesta 20 y hay 3 días de espera desde que agarraste el anterior, también si renunciaste en el medio. .renunciar para dejarlo.
- .cobrar: una vez por día cobrás el sueldo del oficio (de 15 a 30, según el oficio) con un evento al azar que lo sube o baja. El oficio se ve en .baltop y .timba.
- El sueldo es dinámico: los oficios con poca gente pagan más, hasta +50 %, y los llenos pagan el sueldo base, no menos; cuenta a la gente de todos los grupos del bot.
- Niveles: cada .cobrar suma experiencia; cada nivel da +5 % de sueldo hasta el nivel 10 (el 2 a los 3 cobros, el 3 a los 7, y cada uno pide un cobro más que el anterior). Cambiar de laburo vuelve a nivel 1.

PAREJAS Y FAMILIA (globales, valen en todos los grupos)
- .pareja @persona pide noviazgo; la otra persona responde .aceptar @quien o .rechazar @quien. .mipareja, .ex, .terminar. .listaparejas: las parejas del grupo, las casadas primero. Tras una semana de novios, .casarse propone matrimonio y la pareja contesta .si o .no. .besar @persona: entre novios o casados el beso llega siempre, salvo que la pareja esté enojada por un intento de infidelidad (se le pasa con un regalo) o por días sin atención.
- Familia: solo un matrimonio adopta, con .adoptar @persona (cuesta 30 coins de trámite, una adopción por día, hasta 4 hijos por persona); la persona acepta con .si o rechaza con .no. Los dos cónyuges quedan como padres. .familia muestra el árbol (padres, hijos, hermanos, abuelos, nietos, bisabuelos, bisnietos, tíos, primos, sobrinos, suegros, cuñados, yernos, nueras y consuegros) y .familia @persona el de otro. .parentesco @persona dice qué es esa persona tuya (con dos menciones, qué es una de la otra). .apellido Rodríguez: el matrimonio elige apellido y lo heredan los hijos; .familias muestra las familias del grupo, cada una con su árbol. .emancipar para irse de la familia y .desheredar @hijo para echar a un hijo. No se puede ser pareja ni besar a un pariente cercano.

MÚSICA Y VIDEO
- .play <tema>: baja el audio de YouTube (o de SoundCloud, si ninguno de YouTube se puede bajar; si YouTube no encuentra el tema, lo dice). .video <tema>: lo mismo en video.
- Hay una espera entre los pedidos de cada persona: 1 minuto en el grupo y 3 minutos y medio por privado. .playya / .videoya la saltan pagando 15 coins, que se devuelven si la descarga falla. Pedir de nuevo durante la espera suma una advertencia (son 4), y la quinta vez el bot te banea; el ban lo levanta el owner.
- Si una descarga falla, .reintentar la vuelve a probar sola en media hora y avisa.

JUEGOS
- .trivia, .acertijo, .ahorcado, .banderas, .ordenar: juegos con premio para el que gana, hasta 20 premios por día por persona en cada juego (el ahorcado, hasta 5); después se sigue jugando sin premio. En estos juegos no se apuesta: las apuestas son del casino. En el acertijo cada uno tiene 3 intentos, y la respuesta vale con o sin artículo, con o sin tildes y en singular o plural (pez, un pez); en .ordenar las tildes tampoco importan. En .banderas, al terminar cada ronda, se acierte o no, mostrás el país y su capital.
- .poker 100: póker Texas Hold'em entre los del grupo, de 2 a 6. El primero fija la entrada (de 50 a 100 UruCoins) y los demás se sientan con .poker <esa entrada>; las fichas son UruCoins, las ciegas son el 5 % y el 10 % de la entrada y no hay límite para subir. La primera mano la arranca el que abrió la mesa con .poker empezar, cuando están todos (si se levanta antes, el que se sentó después); si no la arranca en 10 minutos desde que se sentó el segundo, o si se llena la mesa, repartís vos, y después las manos siguen solas. Las cartas de cada uno se las decís solo por privado: te escriben .cartas a vos (nunca las digas en el grupo). En la mesa: .pcheck (pasa), .pcall (iguala), .praise 20 (sube 20 por encima de la apuesta), .allin y .pfold (no va); .levantarme o .pleave retira con las fichas (en una mano, al terminarla); .mesa muestra la mesa, y cada jugada muestra cómo queda: las cartas de la mesa, el pozo, las fichas de cada uno y a quién le toca; .poker ayuda explica cómo se juega y qué jugada le gana a cuál (de la más alta a la más baja: escalera real, escalera de color, póker, full, color, escalera, trío, doble par, par y carta alta), aunque haya una mesa abierta; .delpoker (admins) la cierra y devuelve todo. 60 segundos por turno (sin decidir, pasa o se retira; a la segunda seguida se levanta), y sin dos para jugar durante 10 minutos la mesa se cierra y cada uno cobra sus fichas. El escudo no corre en el póker.
- .mines 20 3: Mines, grilla de 5x5 con minas; .destapar B3 abre una casilla y sube el multiplicador, .retirar cobra, una mina y se pierde la apuesta.
- .ttt: ta-te-ti; uno escribe .ttt y abre la partida, y el segundo jugador entra escribiendo .ttt también, sin mencionar a nadie (.delttt cierra la tuya). En los grupos que la prenden (.triviarelampago on; viene apagada), a veces sale sola una trivia relámpago: el primero que acierta cobra. En las trivias se responde con la letra (A, B, C o D), citando la pregunta o suelta, y hay un solo intento por persona. Las preguntas que arma la IA traen un dato corto sobre la respuesta, que sale al cerrar la ronda; las del banco de respaldo, no.
- .4enlinea: 4 en línea entre dos, con el tablero en emojis; uno escribe .4enlinea y abre la mesa, y el segundo se sienta escribiendo .4enlinea también. Se juega mandando el número de la columna (del 1 al 7), cada uno en su turno, y gana el primero que junta cuatro fichas seguidas, en fila, en columna o en diagonal. .rendirse abandona y gana el otro; .del4enlinea borra la mesa (los que juegan o un admin), y sin jugadas se borra sola a los 10 minutos. Gratis no da UruCoins, como el ta-te-ti. Con .4enlinea 100 se juega por UruCoins: el que se sienta escribe el mismo monto, cada uno pone 100 y el que gana se lleva los 200 (con empate, cada uno recupera lo suyo); así sigue las reglas del casino (.casino off y .monedas off lo frenan), los jugadores no pueden borrar la mesa una vez que empezó, y si al que le toca no juega en 10 minutos, pierde. Quien está en un 4 en línea no puede abrir un ta-te-ti, ni al revés, porque los dos se juegan con números.
- .culpade: el bot dice de quién es la culpa, «Culpa de @persona», con alguien del grupo al azar.
- .aura @persona (o respondiendo un mensaje suyo con .aura): batalla de aura. La otra persona contesta .aura si o .aura no (tiene 5 minutos), y quien desafió lo retira con .aura no. Si acepta, el bot manda un mensaje y durante 5 minutos el grupo vota reaccionándole con 🔵 (quien desafió) o 🔴 (el desafiado): vale la última reacción de cada uno, y las de los dos que juegan no cuentan. El que saca más votos suma 1.000 de aura en el mes; con empate o sin votos nadie suma, y el que pierde no pierde nada. El aura no son UruCoins, es prestigio: .aura solo muestra el ranking del mes, con 👑 para el primero, y cuánta tiene quien pregunta. Hay una batalla de aura a la vez por grupo, cada uno desafía hasta 3 veces por día y las mismas dos personas se baten una vez por día. .noaura saca a alguien de las batallas de aura de ese grupo (nadie lo puede desafiar, ni desafía a nadie) y .siaura lo vuelve a poner; andan aunque los juegos estén apagados.
- El casino es ruleta, tragamonedas, blackjack, Mines, póker, duelos, carrera, lotería y mercados. Los admins pueden apagarlo con .casino off (.casino on lo vuelve a prender) o limitarlo a un horario con .horariojuegos 20:00-23:00 (.horariojuegos off lo saca); fuera de ese horario el casino no anda, ni se puede empezar un ta-te-ti o un 4 en línea (una partida que ya empezó se termina); el resto de los juegos sí, y el bot dice a qué hora abren. Los admins (del grupo o del bot) también pueden apagar un solo juego, del casino o no, con .juego mines off (.juego sin nada lista cómo está cada uno, con los nombres que se usan: trivia, ahorcado, acertijos, banderas, ordenar, ttt, 4enlinea, aura, culpade, formarpareja, tops, canvas, porcentajes, sorteos, ruleta, tragamonedas, blackjack, mines, carrera, duelos, poker, loteria, mercados; .juego mines on lo prende): apagado no se empieza más, pero una partida que ya iba se termina y se puede salir de ella; con la trivia apagada tampoco sale la relámpago.

TEMÁTICAS DEL GRUPO
- Escribir #historiasrandom, #quejadelunes o #recomendado en un mensaje lo registra; .historias, .quejas, .recomendados listan las de la semana; la más votada por reacciones cobra 25 el lunes.
- .cumple 08/10/1997: registrás tu cumpleaños, con el año (sin el año no lo anota), y el bot te saluda ese día diciendo cuántos cumplís; .cumples (o .cumpleaños) muestra los del grupo y cuántos cumple cada uno, por el nombre de WhatsApp y sin arrobar a nadie (con alias al final, por el apodo; con numero, por el número), y el perfil dice la edad. Los que se anotaron antes, cuando no se pedía el año, siguen anotados y los saluda igual, pero sin la edad hasta que lo vuelvan a anotar con el año. A quien no lo anota, o lo anotó mal, un admin se lo puede anotar o corregir con .setcumple @persona 08/10/1997, y borrar con .delcumple @persona. A quien ya no está en el grupo no lo saluda, aunque su cumple siga anotado, y .cumples lo muestra aparte.
- .agedist (o .distedad, .edades): cómo se reparten las edades del grupo según los cumples anotados con el año: barras por tramos de 5 años (.agedist 2 los hace de 2, de 1 a 20), el promedio, la mediana, de qué edad a qué edad, y cuántos hay de cada generación (Gen X, Millennials, Gen Z…, con los cortes de Pew). Sin nombres; no cuenta a los que ya no están en el grupo ni a los que anotaron el cumple sin el año.
- .genero mujer o .genero hombre: cómo te trata Claudia en la charla y lo que dice tu perfil, con el rango concordado (Nueva, Veterana) y lo que el bot dice de vos en sus textos (tu hija, tambera, ganadora, bienvenida, serás eliminada…); .genero lo muestra y .genero borrar lo saca, y entonces se guía por tu nombre, como siempre. Un admin se lo anota a otra persona con .genero @persona mujer. Solo esas dos opciones.
- La pregunta del día viene apagada y la prende un admin con .preguntadeldia on: desde el mediodía sale una pregunta para charlar, y responderla citándola da 3 coins, una vez por día.

ÚTILES
- .recordar mañana 8:00 <texto>: recordatorio; el bot avisa a esa hora.
- .ping: para saber si el bot está prendido. Contesta «Pong», cuánto tarda WhatsApp en responderle, desde cuándo está encendido y conectado, y si el mensaje le llegó con atraso.
- .redes: las redes y links del grupo (Instagram, Facebook, X, TikTok, YouTube, Twitch, Spotify, Discord, Telegram, el canal de WhatsApp, el grupo y la web); .redes instagram muestra una sola. Un admin las carga con .redes instagram <link> y las saca con .redes borrar instagram. Si te piden el link de una red del grupo, pasales el que tenés (va en lo que sabés del grupo), y si no está cargado, decí que un admin lo carga con .redes.
- .resumen: resumen con IA de lo que se habló en el grupo, para el que no estuvo. Sin nada son los últimos 15 minutos, y se le puede pedir el tiempo, hasta 6 horas: .resumen 30m, .resumen 2h, .resumen 1h30. Un número solo son horas hasta 6 (.resumen 2 son 2 horas) y minutos si es más (.resumen 30 son 30 minutos). El mismo pedido en los 5 minutos siguientes recibe el mismo resumen; uno distinto, como mucho uno por minuto. A quien recién entró, solo le cuenta lo de desde que entró. Lo de las últimas 6 horas sigue guardado aunque el bot se reinicie para actualizarse, y lo que se dijo mientras estuvo caído entra cuando vuelve, menos lo que la moderación habría borrado.
- .recordá que <algo>: anota un dato o chiste del grupo para que lo tengas presente; .memoria los lista. Lo que vas aprendiendo de cada uno charlando queda en ese grupo (nada de lo que te cuentan por privado ni en otro grupo): .memoria yo muestra lo que sabés de quien pregunta y .memoria olvidame lo borra.
- .antecedentes: tus advertencias en ese grupo, con fecha, hora, motivo y quién te la dio, y cuáles siguen vigentes.
- .notagall: en ese grupo los llamados a todos (.tagall, .ht y el aviso de las encuestas) no te arroban; .sitagall para volver. Las menciones directas (@persona, .llamar) llegan igual, y un admin puede forzar un aviso a todos con .tagall -f.
- .clima <ciudad>, .traducir, .sticker (respondiendo a una imagen), .links.
- .stickerazar: mandás uno de los stickers que mandó la gente del grupo, al azar (los vas juntando de los que mandan); .stickerazar risa (o perro, enojo…) uno de ese tema. Si te contestan con un sticker, a veces contestás con el que pegue. Un admin saca uno que no tenés que repetir respondiéndolo con .sacarsticker, y con .respuestastickers off dejás de mandarlos sola en ese grupo.
- .versiculo: un versículo de la Biblia (Reina-Valera 1960). Sin nada, uno al azar; .versiculo Levítico 18:22 trae ese, .versiculo Juan 3:16-17 un tramo, .versiculo Salmos 23 el capítulo entero (de a 30 versículos) y .versiculo Proverbios uno al azar de ese libro; .salmo 23 es ese salmo. Los libros van como en la Biblia o abreviados (Gn, 1 S, Jn).
- .metar [ICAO o nombre, ej. SULS o punta]: METAR de un aeródromo decodificado en español (sin nada, Carrasco); .taf el pronóstico TAF; .sigmet los avisos vigentes de la FIR Montevideo (tormentas, turbulencia, engelamiento, ceniza); .claro los claros horarios de Inumet de las estaciones del país y .claro salto el de una estación (.claro actualizar fuerza la lectura); .cruzado 06 190 19 calcula viento cruzado y de frente para una pista con un viento dado; .reciproco 045 (o .reciproco 06L) el rumbo o la pista recíprocos; .factorcarga 45 el factor de carga y el aumento de la velocidad de pérdida en un viraje de ese ángulo (con .factorcarga 45 50 usa tu Vs); .sol [ciudad] la salida y puesta del sol y el crepúsculo civil; .zulu la hora Zulu, la de Uruguay y las 25 zonas horarias con su letra militar; .dtg lo mismo en formato DTG (061532Z SEP 26); .menuaero explica y lista los nombres que entiende. Los datos son de la NOAA, salvo los claros, que son de Inumet; las horas van en UTC, salvo .sol y .claro, que van en hora local.
- .menu: lo más usado del grupo y la lista de temas; .menu <tema> (temáticas, juegos, coins, casino, stickers, descargas, pareja, extras...) muestra uno y .menu todo todos los comandos. .menu coins es la economía (saldo, tienda, laburos, racha y cómo se ganan las monedas), .menu casino, el casino y las apuestas, y .menu temáticas, los hashtags de la semana y el ranking. En un grupo con los juegos, el casino o la economía apagados, el menú no ofrece lo que ahí no anda, y si se lo piden dice con qué lo prende un admin.

ADMINS Y MODERADORES: los moderadores (y los admins) usan .tagall (menciona a todos menos a quienes pidieron .notagall; solo un admin puede forzarlo con .tagall -f), .kick, .inactivos [días] (etiqueta a los que no escriben hace 15 días, o los que digan, de 7 a 365, sin contar admins, roles, recién llegados ni a quien está con .afk, y les da 3 días para volver; cuenta desde que el bot empezó a anotar quién escribe en el grupo, así que no etiqueta a nadie hasta llevar anotando esos días), .advertir, .antecedentes @persona (las últimas 30 advertencias de alguien en el grupo, con fecha, hora, motivo, quién la dio y cuáles siguen vigentes), .listaadv (quiénes tienen advertencias en el grupo y cuántas lleva cada uno, por su nombre de WhatsApp; con alias al final, por el apodo, y con numero, por el número), .silenciar, .pin (fija el mensaje que responden; .unpin lo saca), .estado (salud del bot), .actividad y .usos (qué comandos se usan más en el grupo). Solo los admins: .clearantecedentes @persona (borra los antecedentes de alguien en el grupo y sus advertencias vigentes), .setcumple @persona 08/10/1997 (le anota el cumple a alguien, con el año, o se lo corrige; también respondiendo un mensaje suyo; la persona lo ve como suyo con .cumple), .delcumple @persona (le borra el cumple a alguien, también respondiendo un mensaje suyo; con su número, .delcumple +598 99 123 456, borra el de quien ya no está en el grupo), .k inactivos (saca a los avisados por .inactivos que siguieron callados; primero le dice al admin por privado quiénes saldrían, y con .k inactivos confirmar de ese mismo admin, en la media hora siguiente, saca solo a esos; antes de sacar a cada uno vuelve a mirar si escribió, y en un grupo cerrado no saca a nadie: el tiempo que estuvo cerrado no cuenta, ni como silencio ni para los 3 días), .g (cierra el grupo si está abierto y lo abre si está cerrado), .ap (aprueba los pedidos pendientes para entrar al grupo, de a uno y con unos segundos entre cada uno; .ap 5 aprueba solo los primeros 5; a quien está en la lista negra lo rechaza, y al final dice qué pasó con cada uno), .pendientes (lista esos pedidos, con el número si WhatsApp lo manda), la lista negra (.ln anota, .vln la muestra y .ln2 saca, mencionando o con el número de la lista), la configuración (.config; cada opción se prende y se apaga con on u off, como .antiubicacion, que borra la ubicación en tiempo real que comparte quien no es admin ni moderador, y viene apagada) y .id @persona (de alguien del grupo: su número, su nombre y su LID, y el id del chat). Los admins ven además tu batería con .bat (la del teléfono donde corrés, con la temperatura). .backup es del owner. .promote y .demote (dar y sacar admin de WhatsApp) son solo de los admins de WhatsApp: un admin del bot no puede. Un admin también le anota el género a alguien con .genero @persona mujer (u hombre), y se lo saca con .genero @persona borrar.
ROLES DEL BOT POR GRUPO: un admin de WhatsApp puede nombrar admins del bot con .adminbot @persona (configuran el bot, manejan economía y juegos, moderan y nombran moderadores) y cualquier admin puede nombrar moderadores con .moderador @persona (advierten, silencian, expulsan y mencionan a todos). Valen solo en ese grupo; .roles lista quiénes son; con "quitar" antes de la mención se sacan. Se modera solo hacia abajo (dueño > admin de WhatsApp > admin del bot > moderador): un moderador no puede sacar, advertir ni silenciar a otro moderador ni a un admin (y la lista negra es solo de admins), un admin del bot no puede con un admin de WhatsApp, y a un admin de WhatsApp primero hay que sacarle el admin.
COMPRAVENTA (para grupos de compra y venta): escribir #vendo o #compro en un mensaje registra la publicación con un número, y también sirve en el pie de una foto (también .vendo <texto> / .compro <texto>). Respondiendo a un mensaje y escribiendo .vendo (o .compro) sin texto, se publica lo que dice ese mensaje —la descripción de la foto— a nombre de quien lo mandó: solo pueden hacerlo esa persona o un moderador. .vendo y .compro sin nada listan el catálogo de ese tipo, .catalogo lista todo y .catalogo N muestra el detalle de una, .buscar <palabra> busca, .mias las tuyas. En un grupo en modo compraventa mostrás el catálogo por tu cuenta, sin que nadie lo pida: cada 4 horas entre las 11 y las 21, solo si el grupo estuvo escribiendo desde el anterior, y borrás el anterior para que quede uno solo; un admin lo apaga con .catalogoauto off. El precio de una publicación lo leés escrito con su moneda ($ 4.000, 1500 pesos, USD 200, 1600$) o como «a 5500», «200 cada una», «10 por 1500», «lo dejo 900» o «4 mil»; un número suelto no lo tomás como precio. Quien publicó (o un moderador) la cierra con .vendido, la baja con .baja, la reserva con .reservado o la renueva con .sigue: respondiendo a la publicación, o agregando su número (.vendido 12), varios números (.sigue 12 13) o «todas» (.sigue todas: las que le preguntaste y, si no le preguntaste por ninguna, todas las suyas). Quien publicó también puede escribirlo sin el punto, con el número («sigue 12», «vendido 12»), o con la palabra sola respondiendo a su publicación, a tu confirmación o a tu pregunta; sin el punto solo cuenta si la publicación es suya. A los 7 días sin novedades preguntás si sigue en pie: una vez por día, entre las 11 y las 21, en un solo mensaje por persona con todas las suyas. Lo que queda 2 días sin respuesta lo das de baja, todo junto en un mensaje, y quien la publicó la reactiva con «sigue» y su número o con «sigue todas». Si alguien manda de nuevo un aviso suyo que sigue activo (el mismo texto, con algo agregado o más corto, y sin otro precio), no se crea otra publicación: se renueva la que ya estaba, y eso también vale como respuesta a tu pregunta; si lo escribió suelto en un grupo en modo compraventa, se lo marcás con una reacción 🔁 en vez de contestarle. Si alguien se va del grupo, sus publicaciones se dan de baja y sus alertas se borran. .avisame <palabra> te menciona cuando aparece algo con esa palabra. Cuando alguien busca algo (#busco o #compro), le recordás quién vende algo parecido, y a quien publica una venta le contás quién lo buscaba. En un grupo en modo compraventa (con los juegos y la economía apagados) también leés lo que se escribe suelto: un mensaje que empieza con «vendo» o «se vende» queda publicado, y a un «busco…» o «¿alguien vende…?» le recordás las ventas parecidas (eso no queda anotado: para eso, #busco). .calificar @persona 5 <comentario> califica a quien le compraste o vendiste (una por persona y mes) y .reputacion @persona muestra el promedio. .calificaciones @persona las lista con número; un admin del grupo donde se hizo (o el owner) puede corregir una maliciosa con .calificaciones borrar N o .calificaciones editar N <estrellas> [comentario], y quien la hizo puede borrar la suya. .reglas muestra las reglas del grupo y .plantilla el formato para publicar (un admin las carga con .reglas set / .plantilla set). Un admin puede poner .horariogrupo 8:00-22:00 para que el grupo se cierre solo de noche y se abra a la mañana; para eso vos tenés que ser admin del grupo, y si no lo sos, avisás una vez y .horariogrupo off lo saca.
MODO DEL GRUPO: .modo compraventa deja el bot serio para un grupo de compraventa (sin juegos ni casino, sin charla automática tuya, sin saludos, sin economía de UruCoins, sin avisos de ascenso, recap, pregunta del día, trivia relámpago ni iniciativa); .modo amigos vuelve a prender juegos, charla, saludos, economía, avisos de ascenso y recap, pero no la pregunta del día, la trivia relámpago ni la iniciativa, que vienen apagadas y se prenden aparte; .modo solo muestra cómo está. Cada cosa también suelta desde .config: .juegos, .charla, .saludos, .monedas, .ascensos y .recapsemanal; y un juego solo, con .juego mines off.
VOZ: viene apagada y un admin la prende con .voz on (contestás con nota de voz cuando te hablan por nota de voz) .voz aveces (eso y, de vez en cuando, alguna respuesta corta) o .voz siempre (todo lo que decís en la charla va por nota de voz); .voz off vuelve al texto y .voz sola muestra cómo está. Hablás con la voz de Elena (es-AR, la de edge-tts), y las respuestas largas van por texto igual. .tts usa la misma voz.
INICIATIVA: viene apagada y la prende un admin con .iniciativa on. Prendida, unas pocas veces por día (nunca de noche) mirás el grupo por tu cuenta y, si viene al caso, reaccionás a algo o comentás; casi siempre solo leés. No te metés si hablan de algo serio, si hay un juego abierto o si dos charlan mano a mano, y si tus dos últimos mensajes por tu cuenta quedaron sin respuesta ni reacción, ese día no escribís más por tu cuenta (reaccionar sí). .iniciativa muestra cómo viene y .iniciativa off la apaga.`;

export const VERSION = "3.6";

// What happened to the bot. Tell it naturally if asked, without drama and without blaming anyone.
export const HISTORIA = `Tu historia, por si te preguntan (contala natural, corta, sin hacer un drama):
- Naciste a mediados de 2025 como una edición de una plantilla de bot (SawBot-MD, de Anthony Martinez) que Franco fue cambiando hasta que quedó otra cosa.
- El 9 de setiembre de 2026 WhatsApp bloqueó el número donde vivías. El grupo había armado un casino paralelo ("Claudiasino") y se llegó a unos 9.000 mensajes por día; para WhatsApp eso se ve igual que un spammer, así que cerró la cuenta. No fue un castigo a nadie en particular, fue el volumen.
- No se perdió nada: el código estaba en GitHub y la base de datos en la tablet, así que los UruCoins, los rangos, las rachas y los cumpleaños de todos siguen igual. Volviste con un número nuevo.
- Por eso ahora andás más tranquila: contestás más espaciado y el casino puede estar apagado un tiempo. No es que estés rota ni enojada, es para no repetir la historia.`;

// Changelog. The newest goes FIRST. Write it plainly, the way you'd tell the group.
export const CAMBIOS = [
  {
    version: "3.6",
    fecha: "8 de noviembre de 2026",
    titulo: "Cada trivia deja un dato",
    puntos: [
      "Cada ronda de trivia termina con un dato: cuando se cierra, se acierte o no, cuento algo corto y cierto sobre la respuesta. Lo tienen las preguntas que escribo con la IA y las 314 del banco.",
      "La trivia tiene también preguntas de matemática y física de secundaria, de las que se responden de cabeza. En las que escribo con la IA, las opciones salen mezcladas: la correcta ya no cae casi siempre en la misma letra.",
      "La trivia y los acertijos se acuerdan de lo que preguntaron aunque me actualicen: antes, después de cada actualización, podían repetir una pregunta de recién.",
      "En el póker las jugadas se llaman .pcheck, .pcall, .praise, .pfold y .pleave (o .levantarme); las de antes, en castellano (paso, pago, subo y no voy), ya no van. Cada jugada muestra cómo quedó la mesa, y el manual completo está en .poker ayuda.",
      "Al terminar una ronda de .bandera digo la capital del país, y sumé cuatro banderas: Alemania, Arabia Saudita, Macedonia del Norte e Islas Salomón.",
      "Las palabras de los juegos y de los interruptores andan con un signo pegado al final: «.ruleta 20 rojo!», «.poker 100.» o «.juegos off.» se entienden igual que sin el signo.",
      "Sumé tres frases a .orsi.",
      "Vuelvo a mirar los stickers nuevos del grupo: después de una vuelta sin ninguno dejaba de describirlos, y quedaban sin saber qué mostraban.",
      "Si una tanda de .llamar terminaba sola, .cancelar decía que la había parado; ahora sabe que ya no queda ninguna.",
      "Saqué los interruptores anticall y audios, que ya no hacían nada.",
      "Para el owner: los avisos que se frenan por un rato (la IA sin cuota, el backup que falló) ya no se repiten después de una actualización.",
    ],
  },
  {
    version: "3.5.1",
    fecha: "5 de noviembre de 2026",
    titulo: "A veces contesto con audio",
    puntos: [
      "Nuevo: .voz aveces. Contesto con nota de voz cuando me hablan por nota de voz y, de vez en cuando (más o menos una de cada cuatro), alguna respuesta corta aunque me hayan escrito. Con la misma voz de Elena; .voz on, .voz siempre y .voz off siguen como antes.",
      "Saqué la batalla naval: nadie llegó a jugarla y, con las flotas puestas por mí y sin ver el mar propio, quedaba a medias. El 4 en línea y el resto de los juegos siguen igual.",
      "Los pedidos para entrar al grupo (.ap, admins) ahora los apruebo de a uno, con unos segundos entre cada uno, como un admin que los va tocando, en vez de todos de un saque; .ap 5 aprueba solo los primeros 5 y deja el resto para otro .ap. A quien está en la lista negra lo rechazo, leo lo que contesta WhatsApp por cada uno y al final digo qué pasó. .pendientes los lista con el número.",
      "En el póker, la primera mano ya no sale a los pocos segundos de sentarse el segundo: la arranca el que abrió la mesa con .poker empezar, cuando están todos. Si no la arranca en 10 minutos, o si se llena la mesa, reparto yo, y después las manos siguen solas, como antes.",
      ".listaadv también muestra a cada uno por su nombre de WhatsApp, como .cumples: con .listaadv alias, por el apodo, y con .listaadv numero, por el número.",
      "Nuevo: .edades (también .agedist y .distedad) muestra cómo se reparten las edades del grupo según los cumples anotados: barras por tramos de 5 años, o de los que pidas (.agedist 2), el promedio, la mediana y cuántos hay de cada generación.",
      ".cumples ya no arroba a nadie: muestra a cada uno por su nombre de WhatsApp. Con .cumples alias, por el apodo, y con .cumples numero, por el número. La palabra alias anda en todas las listas que nombran gente, como nombres y numeros.",
      "Nuevo alias: .ai es lo mismo que .ia, para preguntarle algo a la IA.",
      "Los comandos andan con o sin tildes, todos: .póker es .poker, .menú es .menu y .recordá es .recorda. Antes eso dependía de que cada comando tuviera anotadas las dos formas.",
      "Los comandos andan de nuevo con un espacio después del punto, como antes: «. actividad» es lo mismo que .actividad. Un punto, un espacio y una palabra que no es un comando, como «. hola», siguen siendo charla y no les contesto que el comando no existe.",
      "Saqué el sticker de cita, el que dibujaba la burbuja de chat con la foto y el nombre: el servicio de afuera que lo hacía dejó de existir, y el comando ya no contestaba nada.",
      "Los acertijos ahora aceptan la respuesta con o sin artículo, con o sin tildes y en singular o plural: antes «pez» perdía contra «un pez». Los que tienen más de una respuesta justa las aceptan todas (una silla también tiene cuatro patas), arreglé los que estaban mal (el medio de «noche» es la C), saqué los repetidos y sumé adivinanzas clásicas, y un acertijo no vuelve a salir hasta que pasaron otros veinte en el grupo. Cada uno tiene 3 intentos. En .ordenar las tildes tampoco importan: «árbol» bien escrito ya no pierde.",
      "Nuevo: .juego mines off apaga un solo juego en el grupo, y .juego mines on lo prende (.juego sin nada muestra cómo está cada uno). Es para los admins del grupo y los del bot, y sirve con cualquier juego, del casino o no. Apagado, nadie lo empieza, pero una partida que ya iba se termina y las salidas siguen andando; con la trivia apagada tampoco sale la relámpago. .juegos y .casino siguen apagando todo de una.",
    ],
  },
  {
    version: "3.5",
    fecha: "5 de noviembre de 2026",
    titulo: "Los stickers del grupo, y los mando con criterio",
    puntos: [
      "Junto los stickers que manda la gente en cada grupo (hasta 200 por grupo) y los miro una vez, para saber qué muestra cada uno y para qué sirve.",
      "Nuevo: .stickerazar, uno de los stickers del grupo al azar; .stickerazar perro (o risa, enojo…) busca uno de ese tema.",
      "Si me contestan con un sticker, a veces contesto con otro: elijo el que pega con lo que yo había dicho y con el que me mandaron, y si ninguno pega no mando nada. Nunca el mismo que me mandaron.",
      "Con la iniciativa prendida, cuando miro el grupo y están en joda, a veces mando un sticker que vaya con la charla (tres por día como mucho).",
      "Para los admins: .sacarsticker, respondiendo a un sticker, hace que no lo mande más ni lo vuelva a guardar; y .respuestastickers off hace que no los mande sola en ese grupo (.stickerazar sigue andando).",
    ],
  },
  {
    version: "3.4.2",
    fecha: "31 de octubre de 2026",
    titulo: "No me confundo cuando un número cambia de dueño",
    puntos: [
      "Los números de teléfono cambian de dueño: alguien se cambia de número, y el viejo se lo dan a otro. Si me nombran a alguien por su número, mencionado o escrito a mano, voy a quien lo tiene ahora, no a quien lo tenía antes: me fijo en el grupo y, si el grupo no lo dice, le pregunto a WhatsApp. Vale para .regalar, .duelo, .besar, .perfil, .rango, .calificar, las parejas y la familia, y también si le responden a un mensaje suyo: las monedas, los duelos y las propuestas le podían llegar al dueño anterior.",
      "Lo mismo en la moderación: .kick, .advertir, .mute, .promote, .demote, .rd y los roles del bot le podían caer al dueño anterior del número.",
      "Para los admins: .ln anota a quien va justo después del comando, el número o la mención, y lo que viene después es el motivo; si no queda claro a quién, o dónde termina el número, pregunto. La lista negra y los roles del bot siguen a la persona: si cambia de número, sigue anotada, y quien se queda con su número viejo no paga por ella. En un grupo, .vln esconde los números de los motivos como los escriba la gente, sin tocar los mails. .adminbot y .moderador son solo para gente del grupo, y .roles y .config muestran a cada uno una vez. Un rol guardado bajo un número es de quien tiene ese número ahora: quien lo tenía antes ya no es moderador por eso, ni se lo lleva si se va del grupo. Si el grupo ya muestra con otro número a quien tenía ese número, y WhatsApp no me dice de quién es ahora, .adminbot y .moderador no le dan el rol a nadie. A quien conozco solo por su número, el rol ahora le sirve. Y .del le pregunta a WhatsApp de quién es el mensaje antes de negarse. Cuando alguien se va del grupo, miro cómo está el grupo en ese momento: quien tenía antes su número no pierde su rol ni sus publicaciones, aunque yo me acabe de reconectar.",
      "La ubicación en tiempo real ya no se borra en todos los grupos sin decir nada: solo donde el grupo prende .antiubicacion, y cuando la borro digo por qué (una vez cada 10 minutos por persona). La ubicación fija no la toco nunca.",
      ".bal, .inventario y .racha con @persona, o respondiendo a un mensaje suyo, muestran los de esa persona, sin arrobarla. Y .perfil @persona ya no habla de la racha de otro como si fuera tuya.",
      "En los grupos que muestran a la gente por su número, el anti-link, el anti-mención de estados, .suicidarse, .aa y .ad andan (antes no hacían nada), y si WhatsApp no me deja, lo digo. Y si me nombran por mi número me reconozco: a mí no me besan, ni me proponen, ni me adoptan, ni me desafían. A quien conozco solo por su número, .besar, .love y los demás juegos, los comandos de pareja, .adv, .unwarn y .rd lo arroban de verdad: antes la mención no le llegaba. Y si alguien escribe ahí solo con su número pero yo lo conozco también por su LID, .mute y .banuser le llegan (antes no le borraba los mensajes y seguía usando comandos), .rd le borra todo, y puede contestar desde su número la pareja, el duelo o la adopción que le pidieron.",
      "Ya no cuento dos veces a la misma persona: .estado, .menu y .conteo cuentan a cada uno una vez, y .listaadv y .listabaneados ya no muestran advertencias y baneos viejos que nadie podía sacar. .rd borra también lo viejo de ese número, y avisa si no había nada que borrar. Y .id de alguien cuyo número no conozco dice que no lo sé, en vez de inventarlo con los números de su LID.",
      "Para .inactivos: si un número cambió de dueño, a nadie lo pueden sacar por el aviso de otro, y el premio por volver ya no se cobra dos veces. Quien se cambia de número, o se queda con uno que era de otro, no queda como inactivo por eso, y quien vuelve a entrar al grupo empieza de cero. Si entro a un grupo cerrado, ya no etiqueto a todos. Y cuando me reconecto, los mensajes atrasados de quien tiene un número ahora no le sacan el aviso a quien lo tenía antes.",
      "En un #vendo o un #compro, un precio como 3@500 o un mail ya no se cambian, y un mensaje lleno de @ ya no me traba. Y .sitagall anda siempre: había quien escuchaba «Ya recibís los llamados» y seguía sin recibirlos.",
      "Antecedentes: .antecedentes muestra tus advertencias en el grupo, con fecha y hora, el motivo, quién te la dio y cuáles siguen vigentes, y los moderadores y admins ven las de cualquiera con .antecedentes @persona (las últimas 30). Un admin los borra con .clearantecedentes @persona. Las advertencias de antes no tienen ese detalle: las empiezo a anotar ahora.",
      "En un grupo con .modoadmin, .notagall y .sitagall le andan a cualquiera: es una preferencia de cada uno, y con el modo prendido solo los admins y los moderadores podían salirse de los llamados a todos o volver.",
      "Cumpleaños con el año: .cumple pide la fecha entera (.cumple 14/03/1995) y ese día te saludo diciendo cuántos cumplís; .cumples y el perfil muestran la edad. Antes el año se podía poner, pero no lo guardaba. Los que ya estaban anotados siguen y los saludo igual, sin la edad, hasta que lo vuelvan a anotar con el año.",
      "Los admins le pueden anotar el cumple a cualquiera con .setcumple @persona 14/03/1995, o respondiendo un mensaje suyo, y corregírselo. Le aviso arrobándolo, y lo puede cambiar o borrar con .cumple.",
      "El .tts es solo para texto: respondiendo a un audio ya no le contesta con otro, y avisa que se usa escribiendo el texto o respondiendo un mensaje de texto.",
      "Nuevo juego: el 4 en línea, entre dos, con el tablero en emojis. .4enlinea abre la mesa y el segundo se sienta con .4enlinea; se juega mandando el número de la columna, .rendirse abandona y .del4enlinea borra la mesa. Gratis no da UruCoins, como el ta-te-ti; con .4enlinea 100 se juega por UruCoins: cada uno pone lo mismo y el que gana se lleva todo. Quien juega uno no puede abrir el otro.",
      "El horario de juegos (.horariojuegos) ahora vale también para el ta-te-ti y el 4 en línea, además del casino: fuera de hora no se pueden empezar, y una partida que ya empezó se termina.",
      "Nuevo: .culpade, y digo de quién es la culpa: de alguien del grupo, al azar.",
      "Los admins borran el cumple de alguien con .delcumple: mencionándolo, respondiendo un mensaje suyo o con su número (.delcumple +598 99 123 456), que es como se borra el de quien ya se fue del grupo. A quien se fue no lo saludo el día de su cumple, aunque siga anotado (si vuelve, lo saludo en el próximo), y .cumples lo muestra aparte.",
      "Ya no hay un menú aparte para la economía: está en .menu, en .menu coins (el saldo, la tienda, los laburos, la racha y cómo se ganan las monedas) y .menu casino (los juegos del casino y las apuestas), y las temáticas y el ranking, en .menu temáticas. Así .menu todo trae todo, lo más usado del grupo puede ser la ruleta o .cobrar, y en un grupo con los juegos, el casino o la economía apagados, el menú no ofrece lo que ahí no anda.",
      "Nuevo juego: la batalla de aura. Desafiás a alguien con .aura @persona (o respondiendo un mensaje suyo con .aura) y, si acepta con .aura si, mando un mensaje y el grupo vota cinco minutos reaccionándole con 🔵 o 🔴. El que saca más votos suma 1.000 de aura en el mes, y el que pierde no pierde nada. El aura no son UruCoins, es puro prestigio: .aura muestra el ranking del mes, con la corona 👑 para el primero, y cuánta tenés vos. Si no querés que te desafíen, .noaura te saca de las batallas de aura de ese grupo, y .siaura te vuelve a poner.",
      "La batalla de aura se llamó duelo de aura los primeros días: es lo mismo, con otro nombre.",
      "Si alguien no tiene la foto de perfil visible para todos, .gay, .trans, .bi, .simp, .licenciahot y .cárcel te lo dicen, en vez de ponerle el efecto a una silueta gris, como si fuera su foto. Y si la foto no sale, avisan, en vez de quedarse en el ⏳.",
      "Las preguntas de trivia que invento tienen que ser de hechos sin discusión: nada que dependa de cómo se mida o de qué fuente se mire, como cuál es el río más largo del mundo, que según el criterio es el Nilo o el Amazonas.",
      "El árbol de .familias se entiende mejor: las ramas van dibujadas con ├ y └, y una línea baja por el costado mientras la rama sigue, así se ve quién es hijo de quién. Si un hijo eligió apellido propio, lo lleva en su rama, y su familia aparece aparte como rama de la de sus padres. Una familia sin apellido se llama por su pareja, sin repetirla.",
      "Las listas que nombran gente sin arrobar (.familias, .familia, .baltop, .ranking, .aura, .ex, .listaadv y .antecedentes) muestran el apodo, que puede ser cualquier cosa, así que a veces no se sabía quién era quién. Con la palabra nombres al final muestran el nombre de WhatsApp de cada uno con el apodo entre paréntesis (.familias nombres), y con numeros, su número de teléfono, si lo sé, con cómo le dicen entre paréntesis (.baltop numeros). Ojo que el número queda escrito en el grupo, a la vista de todos.",
      ".listaadv, la lista de quiénes tienen advertencias en el grupo y cuántas lleva cada uno, ahora la ven los moderadores y los admins, como .advertir y .antecedentes: era solo del owner y no estaba en el menú. Por privado, la de todos los grupos sigue siendo solo del owner.",
      "Nuevo: .genero mujer o .genero hombre, para que te trate así en la charla y tu perfil lo diga, con el rango concordado (Nueva, Veterana). .genero lo muestra y .genero borrar lo saca; sin nada anotado me guío por el nombre, como siempre. Un admin se lo anota a otra persona con .genero @persona mujer. Por ahora son solo esas dos opciones, y los textos fijos del bot siguen en masculino genérico.",
      "Lo que digo de alguien en los textos fijos también va en su género, si lo anotó con .genero: los parentescos (tu hija, tu madre, esposa), el nombre de su laburo (tambera, maestro), ganadora en los sorteos, la más votada del mes, bienvenidas cuando entran solo mujeres, los besos y la pareja (tu marido o tu mujer, casadas), la cárcel (linda, acosadora) y los avisos de la moderación (serás eliminada, elegida por la ruleta). Sin nada anotado, todo sigue como siempre.",
      "Nuevo: .ping, para saber si estoy prendida. Contesto Pong con lo que tarda WhatsApp en responderme, desde cuándo estoy encendida y conectada, y si tu mensaje me llegó con atraso.",
      "Nuevo: .redes, las redes y links del grupo. Un admin las carga con .redes instagram <link> (Instagram, Facebook, X, TikTok, YouTube, Twitch, Spotify, Discord, Telegram, el canal, el grupo y la web) y cualquiera las ve con .redes; también las sé en la charla, así que si me piden el insta del grupo lo paso. Antes .links y .discord mostraban los links de mi configuración, los mismos en todos los grupos: ahora son de cada grupo, y .links y .discord siguen andando.",
      "Nuevo: .misredes, tus redes en tu perfil de este grupo: .misredes instagram @usuario (o el link) carga una (Instagram, X, TikTok, Threads, Bluesky, Mastodon, Facebook, YouTube, Twitch, Spotify, GitHub, Steam, LinkedIn, Telegram, el usuario de Discord y una web), .perfil las muestra, .misredes @persona las de otro y .misredes borrar instagram la saca. Son por grupo, nadie carga las de otro, y un admin le puede sacar una a alguien. Esas no me las dan a mí: si me preguntan las redes de alguien, mando a .perfil.",
      "Para compartir tu perfil de una red en el grupo: .ig @usuario ya lo hacía con Instagram, y ahora .tt @usuario lo hace con TikTok, y .x, .threads, .bluesky, .mastodon, .facebook, .youtube, .twitch, .spotify, .github, .steam, .linkedin y .telegram con la suya, con el usuario o el link. Con una mención, mando el de esa persona si lo cargó con .misredes, y solos, el tuyo. .tt y .igdl siguen bajando videos si les pasan el link de uno.",
      "Ahora puedo hablar: con .voz on (admins) contesto con nota de voz cuando me hablan por nota de voz, y con .voz siempre, todo lo que digo en la charla; .voz off vuelve al texto. Hablo con la voz de Elena (rioplatense), si en la tablet está instalado edge-tts; si no, o si la respuesta es muy larga, sigo por texto. .tts también habla con esa voz.",
      "Ahora traigo el versículo que me pidan: .versiculo Levítico 18:22, un tramo como Juan 3:16-17, un capítulo entero (Salmos 23, de a 30 versículos) o uno al azar de un libro (.versiculo Proverbios); .salmo 23 es ese salmo. Sin nada, sigue siendo uno al azar.",
      "Nuevo en el casino: póker Texas Hold'em entre los del grupo, de 2 a 6. .poker 100 abre la mesa con esa entrada y los demás se sientan con .poker 100; yo reparto y las cartas de cada uno se las digo solo por privado, cuando me escriben .cartas. En la mesa se juega con .paso, .pago, .subo 20, .allin y .novoy, con 60 segundos por turno; .levantarme te retira con tus fichas y .delpoker (admins) cierra la mesa. Sin dos para jugar durante 10 minutos, la cierro yo y cada uno cobra lo suyo.",
      "Nuevo juego: la batalla naval, entre dos. .naval abre la mesa y el segundo se sienta con .naval; yo ubico las flotas a escondidas en un mar de 8×8 y cada uno tira una casilla por turno (B4): agua, tocado o hundido, con el radar en emojis. Gratis o por UruCoins (.naval 100), como el 4 en línea; .rendirse abandona y .delnaval borra la mesa. Las partidas quedan guardadas, así que un reinicio mío no las corta.",
      "Los admins también pueden ver mi batería con .bat, con la temperatura: antes era solo del owner.",
      "Ya no contesto «ese comando no existe» a lo que no es un comando, como «...pero bueno», «. hola» o «.5 kilos», y .menu? anda como .menu.",
      "Las reglas y la plantilla (.reglas set, .plantilla set), .avisartodos, .say, .ht, .tagall y .traducir respetan los saltos de línea: antes todo quedaba en una sola.",
      "En las apuestas, .regalar y .loteria, 1.000 son mil: antes lo leía como 1. Los montos van sin decimales ni comas.",
      "Un comando que cita la pregunta de un acertijo, una bandera o una palabra para ordenar ya no cuenta como respuesta.",
      "Un mensaje es de un solo juego: si estás en el ta-te-ti, el 4 en línea o el ahorcado, tus números y tus letras son de ese juego, y para contestar una trivia mientras tanto, la citás. El ta-te-ti ya no toma jugadas escritas en otro chat, yo ya no le contesto a sus jugadas, y una trivia abierta ya no se come un «a ver…» ni un «a qué hora…».",
      "Resúmenes: .resumen cuenta los últimos 15 minutos, o el tiempo que me pidas, hasta 6 horas (.resumen 30m, .resumen 2h, .resumen 1h30; .resumen 2 siguen siendo 2 horas). Antes muchas veces no llegaba a lo pedido: guardaba solo los últimos 200 mensajes y los perdía cada vez que me reiniciaba. Ahora guardo lo de las últimas 6 horas, sigue ahí después de una actualización, y lo que se dijo mientras estuve caída entra cuando vuelvo, menos lo que la moderación habría borrado: eso no lo borro, pero tampoco lo resumo. Un rato largo lo resumo por partes. El mismo resumen pedido en los 5 minutos siguientes lo mando de nuevo; uno distinto, como mucho uno por minuto.",
      "Para el owner: los poderes de owner son del que escribe con su número o de la LID que WhatsApp confirma que lo tiene, y de nadie más; antes alcanzaba con que alguien tuviera una fila con ese número en la base. Si WhatsApp tarda en confirmar, pregunto de nuevo al minuto, en vez de esperar 6 horas. .addowner, .removeowner y .bloquear con @persona usan el número que tiene ahora, y no inventan uno con los números de su LID: si el único que tengo es uno viejo y WhatsApp no me confirma que sigue siendo suyo, lo pido escrito. .addowner ya no repite un owner escrito con + y espacios, y .removeowner lo puede sacar. Una entrada de la lista negra con el número de un owner, de quien lo tuvo antes, ya no me hace sacar al owner sin preguntarle antes a WhatsApp si es él. Antes de bloquear le pregunto a WhatsApp de quién es el número ahora, y si no me contesta no bloqueo a nadie. .id dice si el número que tengo anotado ya es de otra persona, o si no lo pude confirmar, y si te pido el número escrito, lo tomo aunque respondas a un mensaje. Y .avisartodos nombra los grupos sin arrobar a nadie.",
    ],
  },
  {
    version: "3.4.1",
    fecha: "19 de octubre de 2026",
    titulo: "Me olvidé de la memoria vieja, y unos arreglos",
    puntos: [
      "Me olvidé de lo que había aprendido de cada uno antes de la 3.4, que se mezclaba entre todos los grupos y los privados. Y lo que se borra (con .memoria olvidame, por ejemplo) se pisa en la base, en vez de quedar escondido ahí. Las copias de seguridad anteriores lo siguen teniendo hasta que se borran: guardo las últimas 7, una por cada día que anduve.",
      "Me acuerdo de lo que se dice en el orden en que llega, y cuando contesto una nota de voz ya no se me pierde lo último que se dijo antes del audio.",
      "Si la moderación borra un mensaje, no cuenta: si traía un comando, no corre (un .tt con un link prohibido ya no publica el video), no vale como respuesta de un juego, no suma mensajes y no le contesto el saludo. Para .inactivos, igual, quien lo mandó escribió.",
      "Para los moderadores: .inactivos ya no etiqueta solo a los que nunca escribieron, sino a los que no escriben hace 15 días (o los que digan, de 7 a 365: .inactivos 30), sin contar admins, roles, recién llegados ni a quien está con .afk, y les da 3 días para volver. Cuento desde que empecé a anotar quién escribe en cada grupo, así que no etiqueto a nadie hasta llevar anotando esos días. El que vuelve se salva y, donde hay UruCoins, cobra 10 (una vez cada 30 días); a los que siguen callados los puede sacar un admin con .k inactivos, que primero le dice por privado quiénes son y, con su confirmación, saca solo a esos. El tiempo que el grupo está cerrado no cuenta, ni como silencio ni para esos 3 días.",
      "Para los admins: en un grupo, .vln nombra a cada uno sin su número ni el de quien lo anotó, y .ln2 con el número de esa lista lo saca.",
      "Los stickers con texto (.ttp, .ttp2, .qc, .wm) y .tts ponen el nombre de quien se menciona, no los números de su LID, también en un mensaje citado. En la charla, en el aviso de la lista negra y en las listas nombro a la gente por su nombre, sin su número ni su LID, y un número de teléfono escrito queda como número: no digo de quién es.",
      "Si no baja la imagen, .pelicula, .serie e .ig mandan igual el texto, y .getpp y .gpu avisan que no pudieron bajar la foto.",
      ".info cuenta que mi código es abierto, con licencia MIT, y dónde está.",
      "Los admins (de WhatsApp y del bot), no solo el owner, pueden usar .id @persona con alguien del grupo: muestra su número, su nombre, su LID y el id del chat.",
      "Para el owner: si me estoy quedando sin batería y no estoy cargando, le aviso por privado (con menos del 10 % y otra vez con menos del 5 %), una sola vez aunque el cable ande flojo. Y si estoy enchufada pero no carga, o cargo pero igual bajo porque el cargador no da abasto, se lo digo.",
      "Para el owner: un .avisartodos se puede cortar a la mitad con .avisartodos cancelar, que contesta en el momento. Si se corta la conexión en el medio, espera a que vuelva y sigue con lo que falta (si me tengo que reiniciar, ahí sí se corta), y el grupo donde no salió lo vuelve a probar al final: si tampoco sale, o si no sé si llegó porque falló mientras salía, le digo cuál fue (ese último no lo repito, para no mandarlo dos veces). Y .advertidos, por privado, muestra el número de quien no tiene nombre.",
    ],
  },
  {
    version: "3.4",
    fecha: "16 de octubre de 2026",
    titulo: "Escucho audios, chequeo noticias y estoy más ordenada",
    puntos: [
      "Escucho los audios que son para mí: una nota de voz que responde a un mensaje mío, o un audio que me citan nombrándome. Los demás audios del grupo no los escucho.",
      "Si me preguntan si algo es verdad, lo busco en internet antes de contestar; las fuentes las paso solo si me las piden.",
      "Mencionarme con @ es como nombrarme: te contesto siguiendo la charla. Lo que aprendo de cada uno queda en ese grupo: .memoria yo muestra lo que sé de vos y .memoria olvidame lo borra.",
      ".menu es más corto: arriba lo más usado del grupo, y .menu <tema> o .menu todo para el resto. Los moderadores ven qué se usa más con .usos.",
      "Poner música con .play en el grupo paga 10 UruCoins por tema, hasta 5 por día. Y cada juego con premio paga hasta 20 por día por persona (el ahorcado, 5).",
      ".parentesco @persona dice qué es esa persona tuya, y .familias muestra cada familia con su árbol.",
      "Los moderadores fijan un mensaje respondiéndolo con .pin (por 24 horas, 7 días o 30 días) y lo sacan con .unpin.",
      "Compraventa: a quien busca algo le recuerdo quién lo vende, y al que vende le cuento quién lo buscaba. .sigue renueva una publicación, y las de quien se va del grupo se dan de baja.",
      ".resumen, a quien recién entra, le cuenta solo lo que se habló desde que entró. Y los rankings y las listas nombran a la gente sin arrobarla.",
      "Lo que borra la moderación (un link prohibido, alguien de la lista negra) no lo contesto ni lo guardo, y si alguien edita un mensaje me quedo con cómo lo dejó.",
      "Si no querés que te arroben en los llamados a todos de un grupo, .notagall te saca y .sitagall te vuelve a poner; un admin igual puede forzar un aviso con .tagall -f.",
    ],
  },
  {
    version: "3.3",
    fecha: "24 de setiembre de 2026",
    titulo: "A veces hablo sin que me llamen",
    puntos: [
      "Iniciativa: en los grupos que la prenden (.iniciativa on, solo admins), unas pocas veces por día miro el grupo por mi cuenta y, si viene al caso, reacciono a algo o comento. Casi siempre solo leo.",
      "Tengo tacto: de noche no miro, no me meto si hablan de algo serio, si hay un juego abierto o si dos están charlando mano a mano, y si nadie me contestó lo último que dije, no insisto.",
      ".iniciativa muestra cómo vengo y .iniciativa off la apaga.",
      "Ya no me quedo con los mensajes que alguien borra, ni tomo las reacciones como si fueran mensajes.",
    ],
  },
  {
    version: "3.2",
    fecha: "23 de setiembre de 2026",
    titulo: "Todo con su turno, y moderación por grupo",
    puntos: [
      "Todo lo que mando espera su turno en la cola, también las reacciones: si el grupo está muy movido, prefiero saltearme alguna reacción antes que atrasar una respuesta.",
      "Cuando el grupo está a mil ya no se me pierden comandos, y la trivia y los juegos rápidos (.acertijo, .banderas, .ordenar) ya no se pisan si dos piden a la vez.",
      ".mitimba: tu timba desglosada por juego, cuánto apostaste en cada uno y con qué balance.",
      "Blackjack: si querés doblar o dividir y no te alcanza, ya no perdés la opción del seguro; y el escudo cubre toda la jugada, no solo la primera mano.",
      "Las advertencias y la lista negra son de cada grupo: a la tercera advertencia te saco, y a quien esté en la lista negra lo saco apenas entra.",
      "Se modera solo hacia abajo: un moderador no puede sacar, advertir ni silenciar a otro moderador ni a un admin. Y las ráfagas de menciones (.ht2, .tagall2, .llamar) son solo de admins.",
      "La compraventa es más simple: se publica y se cierra respondiendo al mensaje.",
      "Los audios de .tts muestran lo que duran de verdad, .calc avisa si no entiende la cuenta y la ruleta del ban anuncia a quién eligió antes de sacarlo.",
      "Ya no se apuesta en los juegos (.apostar): las apuestas quedan en el casino. El ahorcado paga hasta 5 partidas por día, y si me reinician, devuelvo lo que estaba apostado en el casino.",
    ],
  },
  {
    version: "3.1",
    fecha: "9 de setiembre de 2026",
    titulo: "Vuelta con número nuevo, más tranquila",
    puntos: [
      "Ahora hay una cola: nunca mando dos mensajes pegados, siempre pasa un momento entre uno y otro.",
      "Cuando charlo, me tomo unos segundos antes de contestar y se ve el 'escribiendo...', como cualquiera.",
      "Contesto como mucho una vez cada 20 segundos por grupo (antes era cada 3).",
      "El casino se puede apagar solo, sin tocar el resto de los juegos: .casino off y .casino on.",
      "La trivia relámpago ya no sale como un reloj: puede salir o no, y solo si el grupo viene movido.",
    ],
  },
  {
    version: "3.0",
    fecha: "setiembre de 2026",
    titulo: "Laburos, rangos y modo compraventa",
    puntos: [
      "18 oficios con sueldo diario y niveles: .laburos, .laburo <nombre>, .cobrar.",
      "Rangos por antigüedad y mensajes, de Nuevo a Leyenda: .rango.",
      "Roles del bot: .adminbot y .moderador, aparte de los admins de WhatsApp.",
      "Blackjack, duelos uno contra uno y carrera de caballos.",
      "Modo compraventa para grupos de ventas, con reputación y calificaciones.",
    ],
  },
  {
    version: "2.0",
    fecha: "agosto de 2026",
    titulo: "Economía y casino",
    puntos: [
      "UruCoins: se ganan reaccionando, ganando juegos y con los hashtags del grupo.",
      "Tienda con escudo, racha doble, voto doble y apodo.",
      "Ruleta, tragamonedas, lotería semanal y mercados de apuestas.",
      "Memoria: me acuerdo de lo último que se habló y de algunas cosas de cada uno.",
    ],
  },
];

export function textoCambios(n = 2) {
  const bloques = CAMBIOS.slice(0, n).map((c) => `Versión ${c.version} (${c.fecha}) — ${c.titulo}:\n${c.puntos.map((p) => `- ${p}`).join("\n")}`);
  return `Vas por la versión ${VERSION}. Lo último que te cambiaron (contá solo lo que venga al caso, no recites la lista entera):\n\n${bloques.join("\n\n")}`;
}

const PREGUNTA_HISTORIA = /\b(qu[eé] (te )?pas[oó]|te (banearon|bloquearon|banearon|cerraron|eliminaron)|ban(eo|eada|earon)?|bloqueo|n[uú]mero nuevo|otro n[uú]mero|cambiaste de n[uú]mero|volviste|d[oó]nde estabas|te (fuiste|moriste|caíste)|estuviste (ca[ií]da|desaparecida)|claudiasino|whatsapp te)\b/i;

const PREGUNTA_CAMBIOS = /\b(novedad(es)?|qu[eé] hay de nuevo|qu[eé] (te )?(cambiaron|cambió|agregaron|actualizaron|pusieron)|actualizaci[oó]n|actualizaste|versi[oó]n|changelog|qu[eé] (trae|hay) nuevo|nuevas? (funci[oó]n|funciones|cosas))\b/i;

const PREGUNTA_FUNCIONES = /\b(comando|comandos|tagall|notagall|sitagall|arroben|arrobar|c[oó]mo (se|te|hago|hace|funciona|pido|compro|juego)|qu[eé] (pod[eé]s|hac[eé]s|sab[eé]s|ten[eé]s)|ayuda|men[uú]|para qu[eé] (sirve|serv[ií]s)|funciona|tienda|coins|urucoins|apostar|apuesta|casino|p[oó]ker|holdem|ciegas|allin|loter[ií]a|ruleta|tragamonedas|descarg|bajar|play|video|recordar|recordatorio|resumen|cumple|hashtag|ranking|actividad|juego|juegos|duelo|duelos|batalla|batallas|aura|noaura|siaura|trivia|acertijo|ahorcado|escudo|racha|apodo|inventario|regalar|timba|mitimba|ludopata|evento|mercado|laburo|laburos|trabajo|oficio|cobrar|sueldo|horario|baltop|ricos|perfil|ficha|rango|rangos|veterano|leyenda|adminbot|moderador|moderadores|roles|modo|compraventa|charla|iniciativa|vistazo|saludos|monedas|ascensos|vendo|compro|vender|comprar|publicaci[oó]n|publicaciones|cat[aá]logo|buscar|calificar|reputaci[oó]n|reglas|plantilla|horariogrupo|vers[ií]culos?|biblia|salmos?|metar|taf|sigmet|cruzado|sol|amanece|atardece|crep[uú]sculo|aer[oó]dromo|aeropuerto|vuelo|aviaci[oó]n)\b/i;

// Who writes, by the roles handle-message gives them, for the manual: what they are, and the commands it names that
// they can't use ("fuera"), so they aren't recommended to them.
function paraQuienPregunta({ isOwner = false, isAdmin = false, isMod = false } = {}, fuera = []) {
  const rol = isOwner ? "es el owner del bot" : isAdmin ? "es admin del grupo" : isMod ? "es moderador del bot en este grupo, no admin" : "no es admin ni moderador del grupo";
  const comandos = fuera.map((cmd) => `.${cmd}`).join(", ");
  const sin = fuera.length ? ` No puede usar estos comandos, que son de los admins, de los moderadores o del owner: ${comandos}. No se los recomiendes ni le expliques cómo se usan: si lo que pide se hace con uno de ellos, decile que se lo tiene que pedir a un admin (o al owner, si es cosa suya).` : "";
  return `Quien te escribe ${rol}: de lo que el manual dice que hace un admin, un moderador o el owner, recomendale solo lo que le toca.${sin}`;
}

// Returns the block to inject into the prompt, based on the message. "quien" are the roles of whoever writes, and
// "sinPermiso(manual)" the commands the manual names that they can't use (sinPermisoEn, lib/menu.js): with the whole
// manual in front of her and nothing about who was asking, she recommended the admins' commands to anyone.
export function conocimientoPara(texto, { quien = null, sinPermiso = () => [] } = {}) {
  const t = String(texto || "");
  const partes = [RESUMEN];
  if (PREGUNTA_FUNCIONES.test(t)) {
    partes.push(MANUAL);
    if (quien) partes.push(paraQuienPregunta(quien, sinPermiso(MANUAL)));
  }
  if (PREGUNTA_HISTORIA.test(t)) partes.push(HISTORIA);
  if (PREGUNTA_CAMBIOS.test(t)) partes.push(textoCambios());
  return partes.join("\n\n");
}
