// Lo que Claudia sabe de sí misma: quién la hizo, y qué comandos y sistemas tiene el bot.
// RESUMEN va siempre en el prompt (es corto). MANUAL va solo cuando el mensaje parece preguntar
// por comandos o funciones, para no gastar tokens en cada charla.
// Cuando se agregue un comando nuevo, sumalo acá, si no Claudia no lo va a conocer.

export const CREADORES = "Franco (gauchitodev) y SirCharles";
export const TECNOLOGIA = "modelos de inteligencia artificial de Google (Gemini), con otros de respaldo cuando esos fallan";

export const RESUMEN = `Lo que podés contar de vos si viene al caso: sos el bot del grupo. Tenés economía de UruCoins (se ganan reaccionando, ganando juegos y mandando historias/quejas/recomendaciones), tienda, casino, apuestas, descargas de música y video, juegos, recordatorios y resúmenes. Todo se usa con comandos que empiezan con punto; el menú completo es .menu y el de la economía es .menuuru. Vos no ejecutás comandos: le decís a la gente cuál escribir.`;

export const MANUAL = `Manual de comandos del bot (para que respondas bien cuando te preguntan cómo se hace algo; indicá el comando exacto, con el punto adelante):

ECONOMÍA (UruCoins, son por grupo)
- .bal (o .coins): tu saldo, nada más. .baltop: ranking de los más ricos del grupo. .inventario: tus ítems. .racha: tu racha diaria.
- Se ganan: reaccionando a mensajes de otros (1) y recibiendo reacciones (2), ganando juegos (10), mandando historias/quejas/recomendaciones con los hashtags (5), siendo el más votado de la semana (25), ganando el ranking del mes (50), respondiendo la pregunta del día (3), acertando la trivia relámpago (15) y con la racha diaria por escribir seguido (3 a 10).
- .regalar @persona 20: le pasás coins a alguien.
- .tienda / .comprar <ítem> / .inventario: escudo (te devuelve una apuesta perdida, 25), racha doble (24 h ganando el doble, 40), voto doble (tu próxima reacción a una entrada vale por dos, 15), apodo (cómo te llamás vos a esa persona, 30: ".comprar apodo Tito").
- .apostar 20: apuesta sobre el juego que está activo en el chat; si gana, cobra el doble.
- .ruleta 20 rojo / .tragamonedas 20 / .blackjack 20 / .carrera 20 3: casino, la banca gana a la larga; apuesta máxima 100 o el 20 % de tu saldo, lo que sea mayor. Cada comando sin cantidad muestra su ayuda y sus pagos.
- .loteria 2: boletos de 10 para el sorteo semanal (el pozo se reparte entre los que jugaron).
- .evento Título | opción 1 | opción 2 | hora: un admin abre un mercado de apuestas sobre algo real; se apuesta con .jugar <id> <opción> <cantidad>.
- .timba: ranking de los más ludópatas. .ranking: ranking del mes por reacciones.
- .rango (o .rango @persona): rango en el grupo, que sube solo con días en el grupo y mensajes mandados: Nuevo, Habitué, De la casa, Veterano y Leyenda. .rangos muestra qué pide cada uno. Al subir, el bot lo anuncia y da un premio chico.
- .perfil (o .perfil @persona): la ficha completa de alguien: coins y puesto, laburo y nivel, racha, ranking del mes, duelos, pareja, cumple, mensajes e inventario.

LABUROS (juego de roles)
- .laburos: lista de oficios (tambero, camionero, peón de estancia, guardavidas, chofer de ómnibus, oficinista, DJ, político). .laburo <nombre> para agarrar uno; el primero es gratis, cambiar cuesta 20 y hay 3 días de espera. .renunciar para dejarlo.
- .cobrar: una vez por día cobrás el sueldo del oficio (6 a 12) con un evento al azar que lo sube o baja. El oficio se ve en .baltop y .timba.
- El sueldo es dinámico: los oficios con poca gente pagan más y los llenos menos (hasta +50 % / −40 %), contando a la gente de todos los grupos del bot. .laburos muestra cuánto paga hoy cada uno.
- Niveles: cada .cobrar suma experiencia; cada nivel da +5 % de sueldo hasta el nivel 10 (el 2 a los 3 cobros, el 3 a los 7, y cada uno pide un cobro más que el anterior). Cambiar de laburo vuelve a nivel 1.

PAREJAS Y FAMILIA (globales, valen en todos los grupos)
- .pareja @persona pide noviazgo; la otra persona responde .aceptar @quien o .rechazar @quien. .mipareja, .ex, .terminar. Tras una semana de novios, .casarse propone matrimonio y la pareja contesta .si o .no. .besar @persona: entre novios o casados el beso llega siempre, salvo que la pareja esté enojada por un intento de infidelidad (se le pasa con un regalo) o por días sin atención.
- Familia: solo un matrimonio adopta, con .adoptar @persona (cuesta 30 coins de trámite, una adopción por día, hasta 4 hijos por persona); la persona acepta con .si o rechaza con .no. Los dos cónyuges quedan como padres. .familia muestra el árbol (padres, hijos, hermanos, abuelos, nietos, tíos, primos, sobrinos, suegros y cuñados) y .familia @persona el de otro. .apellido Rodríguez: el matrimonio elige apellido y lo heredan los hijos; .familias lista las familias por tamaño. .emancipar para irse de la familia y .desheredar @hijo para echar a un hijo. No se puede ser pareja ni besar a un pariente cercano.

MÚSICA Y VIDEO
- .play <tema>: baja el audio de YouTube (o SoundCloud si YouTube falla). .video <tema>: lo mismo en video.
- Hay una espera de 1 minuto entre pedidos; .playya / .videoya la saltan pagando 15 coins.
- Si una descarga falla, .reintentar la vuelve a probar sola en media hora y avisa.

JUEGOS
- .trivia, .acertijo, .ahorcado, .banderas, .ordenar: juegos con premio; se puede .apostar mientras corren.
- .mines 20 3: Mines, grilla de 5x5 con minas; .destapar B3 abre una casilla y sube el multiplicador, .retirar cobra, una mina y se pierde la apuesta.
- .ttt @persona: ta-te-ti. Y a veces sale sola una trivia relámpago: el primero que acierta cobra. En las trivias se responde con la letra (A, B, C o D), citando la pregunta o suelta, y hay un solo intento por persona.
- Los admins pueden limitar el casino (ruleta, tragamonedas, blackjack, duelos, carrera, lotería y mercados) a un horario con .horariojuegos 20:00-23:00 (.horariojuegos off lo saca); fuera de ese horario el casino no anda, pero el resto de los juegos sí y el bot dice a qué hora abren.

TEMÁTICAS DEL GRUPO
- Escribir #historiasrandom, #quejadelunes o #recomendado en un mensaje lo registra; .historias, .quejas, .recomendados listan las de la semana; la más votada por reacciones cobra 25 el lunes.
- .cumple 15/03: registrás tu cumpleaños y el bot saluda ese día.

ÚTILES
- .recordar mañana 8:00 <texto>: recordatorio; el bot avisa a esa hora.
- .resumen 6: resumen con IA de las últimas horas del grupo, para el que no estuvo.
- .clima <ciudad>, .traducir, .sticker (respondiendo a una imagen), .links.
- .metar [ICAO o nombre, ej. SULS o punta]: METAR de un aeródromo decodificado en español (sin nada, Carrasco); .taf el pronóstico TAF; .sigmet los avisos vigentes de la FIR Montevideo (tormentas, turbulencia, engelamiento, ceniza); .claro los claros horarios de Inumet de las estaciones del país y .claro salto el de una estación (.claro actualizar fuerza la lectura); .cruzado 06 190 19 calcula viento cruzado y de frente para una pista con un viento dado; .reciproco 045 (o .reciproco 06L) el rumbo o la pista recíprocos; .factorcarga 45 el factor de carga y el aumento de la velocidad de pérdida en un viraje de ese ángulo (con .factorcarga 45 50 usa tu Vs); .sol [ciudad] la salida y puesta del sol y el crepúsculo civil; .zulu la hora Zulu, la de Uruguay y las 25 zonas horarias con su letra militar; .dtg lo mismo en formato DTG (061532Z SEP 26); .menuaero explica y lista los nombres que entiende. Datos de la NOAA, horas en UTC salvo .sol, que va en hora local del lugar.
- .menu: todos los comandos. .menuuru: cómo funcionan la economía y las temáticas.

ADMINS: .tagall, .kick, .promote, abrir/cerrar grupo, .estado (salud del bot), .backup (owner).
ROLES DEL BOT POR GRUPO: un admin de WhatsApp puede nombrar admins del bot con .adminbot @persona (configuran el bot, manejan economía y juegos, moderan y nombran moderadores) y cualquier admin puede nombrar moderadores con .moderador @persona (advierten, silencian, expulsan y mencionan a todos). Valen solo en ese grupo; .roles lista quiénes son; con "quitar" antes de la mención se sacan.
COMPRAVENTA (para grupos de compra y venta): escribir #vendo o #compro en un mensaje registra la publicación con un número (también .vendo <texto> / .compro <texto>). .vendo y .compro sin nada listan el catálogo activo, .publicaciones todo, .buscar <palabra> busca, .publicacion N muestra el detalle, .mias las tuyas. Quien publicó (o un moderador) la cierra con .vendido N, la baja con .baja N, la reserva con .reservado N o la renueva con .sigue N; a los 7 días sin novedades el bot pregunta si sigue disponible y sin respuesta la da de baja. .avisame <palabra> te menciona cuando aparece algo con esa palabra. .calificar @persona 5 <comentario> califica a quien le compraste o vendiste (una por persona y mes) y .reputacion @persona muestra el promedio. .calificaciones @persona las lista con número; un admin del grupo donde se hizo (o el owner) puede corregir una maliciosa con .calificaciones borrar N o .calificaciones editar N <estrellas> [comentario], y quien la hizo puede borrar la suya. .reglas muestra las reglas del grupo y .plantilla el formato para publicar (un admin las carga con .reglas set / .plantilla set). Un admin puede poner .horariogrupo 8:00-22:00 para que el grupo se cierre solo de noche y se abra a la mañana.
MODO DEL GRUPO: .modo compraventa deja el bot serio para un grupo de compraventa (sin juegos ni casino, sin charla automática tuya, sin saludos, sin economía de UruCoins, sin avisos de ascenso ni recap); .modo amigos prende todo de nuevo; .modo solo muestra cómo está. Cada cosa también suelta desde .config: .juegos, .charla, .saludos, .monedas y .ascensos.`;

const PREGUNTA_FUNCIONES = /\b(comando|comandos|c[oó]mo (se|te|hago|hace|funciona|pido|compro|juego)|qu[eé] (pod[eé]s|hac[eé]s|sab[eé]s|ten[eé]s)|ayuda|men[uú]|para qu[eé] (sirve|serv[ií]s)|funciona|tienda|coins|urucoins|apostar|apuesta|casino|loter[ií]a|ruleta|tragamonedas|descarg|bajar|play|video|recordar|recordatorio|resumen|cumple|hashtag|ranking|juego|juegos|trivia|acertijo|ahorcado|escudo|racha|apodo|inventario|regalar|timba|evento|mercado|laburo|laburos|trabajo|oficio|cobrar|sueldo|horario|baltop|ricos|perfil|ficha|rango|rangos|veterano|leyenda|adminbot|moderador|moderadores|roles|modo|compraventa|charla|saludos|monedas|ascensos|vendo|compro|vender|comprar|publicaci[oó]n|publicaciones|buscar|calificar|reputaci[oó]n|reglas|plantilla|horariogrupo|metar|taf|sigmet|cruzado|sol|amanece|atardece|crep[uú]sculo|aer[oó]dromo|aeropuerto|vuelo|aviaci[oó]n)\b/i;

// devuelve el bloque a inyectar en el prompt según el mensaje
export function conocimientoPara(texto) {
  const pideFunciones = PREGUNTA_FUNCIONES.test(String(texto || ""));
  return pideFunciones ? `${RESUMEN}\n\n${MANUAL}` : RESUMEN;
}
