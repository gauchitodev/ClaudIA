# ClaudIA 🇺🇾

![Bender entrando por una puerta, con el texto «ClaudIA llegando al grupo»](assets/banner.jpg)

[![CI](https://github.com/gauchitodev/ClaudIA/actions/workflows/ci.yml/badge.svg)](https://github.com/gauchitodev/ClaudIA/actions/workflows/ci.yml)

Bot de WhatsApp con personalidad propia, desarrollado a medida para un grupo de amigos de Uruguay. Es mi primer proyecto de programación ([@gauchitodev](https://github.com/gauchitodev)), en el cual me ayudaron [@carlosplanchon](https://github.com/carlosplanchon) y [@nicolasgutierrezdev](https://github.com/nicolasgutierrezdev). Tome como punto de partida [SawBot-MD](https://github.com/martinezanthony/SawBot-MD), de [@martinezanthony](https://github.com/martinezanthony) (quien también ayudó).

A su vez, [SawBot-MD](https://github.com/martinezanthony/SawBot-MD) está basado en [GataBot-MD](https://github.com/GataNina-Li/GataBot-MD).

## ¿Qué hace?

- **Personalidad propia**: Claudia habla en rioplatense, con "vos", sin caricaturizar el acento, calibrada a pulso con feedback del grupo real.
- **Charla con IA**: responde cuando la nombran, la arroban o le contestan, siguiendo la charla del grupo, con varios modelos de Gemini en cascada y, si se quedan sin cuota, con respaldo en Groq, OpenRouter, NVIDIA y Cerebras. Clasifica pedidos (música, mencionar al grupo, etc.) con salida JSON estructurada, no adivinando texto libre, y antes de anunciar algo chequea que vaya a pasar. No se mete en las respuestas a los juegos.
- **Audios**: escucha solo los audios que son para ella: una nota de voz que le responde un mensaje, o un audio que alguien cita nombrándola ("claudia, ¿qué pensás de esto?"). Los demás audios del grupo no los baja. Si citan un tema que mandó ella con `.play`, ya sabe cuál es y no lo vuelve a escuchar. Los escucha Gemini: si responde un respaldo, avisa que no pudo escucharlo en vez de inventar.
- **¿Es verdad?**: si le preguntan si algo es cierto o le piden un dato que se puede verificar (una noticia, de dónde es una banda, quién escribió un tema), lo busca en Google con Gemini y contesta con su onda, sin links. Los bolazos y los chismes del grupo no los busca. Las fuentes las pasa solo si se las piden, aunque sea un rato después. La búsqueda necesita el plan pago de Gemini: en el gratis, los modelos 3 no la traen, y Claudia contesta con lo que sabe, sin afirmar lo que no.
- **Iniciativa**: en los grupos que la prenden (`.iniciativa on`), unas pocas veces por día mira el grupo por su cuenta, lee lo que se perdió y, si viene al caso, reacciona, cita algo de hace un rato o comenta. Las reglas de tacto van en código, antes de consultar a la IA: no mira de noche, no se mete en temas serios, juegos abiertos ni charlas mano a mano, no insiste si la ignoran dos veces seguidas y no habla más del doble que el promedio del grupo. Hace una sola consulta por vistazo, solo a Gemini, con topes fijos por día.
- **Memoria**: lo que va aprendiendo de cada uno charlando (gustos, datos chicos, jodas internas) queda en el grupo donde lo aprendió, sin gastar consultas extra a la IA: nada de lo que le cuentan por privado ni en otro grupo. Cada uno ve lo suyo con `.memoria yo` y se lo hace olvidar con `.memoria olvidame`. Y recuerda lo que el grupo le pide con `.recordá`.
- **Música y video**: descarga de YouTube (con cookies + reintentos + varios candidatos) y, si ninguno se puede bajar, prueba el mismo tema en SoundCloud. Si igual no sale, se puede volver a pedir con `.reintentar`. Si la búsqueda en YouTube no trae nada (o no anda), avisa y no prueba SoundCloud ni deja `.reintentar`. También baja videos de TikTok e Instagram.
- **Economía (UruCoins)**: monedas por reaccionar, por participar y por poner música con `.play` en el grupo (hasta 5 temas por día), laburos con sueldo diario y niveles, rangos por antigüedad y mensajes, racha diaria, pregunta del día y una tienda (escudo, racha doble, voto doble, apodo).
- **Juegos**: trivia (y trivias relámpago que salen solas), acertijos, banderas, ordenar palabras, ahorcado y ta-te-ti. Todos menos el ta-te-ti tienen premio para el que gana: hasta 20 premios por día por persona en cada juego (en el ahorcado, 5; la trivia relámpago paga aparte).
- **Casino**: ruleta europea, tragamonedas, blackjack, mines, carrera de caballos, duelos y peleas por turnos, lotería semanal y mercados de apuestas sobre eventos reales. Tiene topes por jugada, se apaga por grupo con `.casino off` y, si el bot se apaga o se reinicia, devuelve lo que estaba en juego (salvo que Android lo mate de golpe: ahí no llega a correr nada). La idea inicial fue de [@libeelula](https://github.com/libeelula).
- **Temáticas semanales**: hashtags como `#historiasrandom`, `#quejadelunes` y `#recomendado`, con listas automáticas por semana.
- **Ranking mensual**: puntos por reaccionar y por recibir reacciones (quién es más votado, quién es más activo).
- **Compraventa**: un modo para grupos de compra y venta, con publicaciones por `#vendo` o `#compro`, catálogo, búsqueda, avisos, reputación y calificaciones. A quien busca algo le recuerda quién lo vende, y al que vende le cuenta quién lo buscaba; `.sigue` renueva una publicación, y las de quien se va del grupo se dan de baja.
- **Parejas y familia**: parejas, casamientos y adopciones dentro del grupo; `.parentesco` dice qué es alguien tuyo y `.familias` muestra cada familia con su árbol.
- **Aviación**: METAR, TAF y SIGMET decodificados en español, los claros horarios de Inumet, viento cruzado, hora Zulu y más.
- **Herramientas**: clima, traductor, RAE, texto a voz, stickers, recordatorios, resumen del grupo con IA (a quien recién entra, solo lo de desde que entró) y versículos de la Biblia.
- **Menú a medida**: `.menu` muestra arriba lo más usado en ese grupo, sin ofrecer lo que ahí no anda (los juegos donde están apagados, lo que necesita que Claudia sea admin), y después los temas (`.menu juegos`, `.menu todo`), con todo lo que cada uno puede usar según su rol. Los moderadores ven qué se usa con `.usos`.
- **Administración de grupo**: comandos con permisos reales, no solo declarados. Además de los admins de WhatsApp hay roles del bot por grupo (`.adminbot`, `.moderador`), y se modera solo hacia abajo. Inactivos: `.inactivos [días]` etiqueta a los que no escriben hace 15 días (sin contar admins, roles ni recién llegados) y les da 3 días para volver; el que vuelve cobra 10 UruCoins y `.k inactivos` (solo admins, con confirmación) saca a los que siguieron callados. Advertencias (a la tercera, afuera), lista negra por grupo y global, silenciados, mensajes fijados con `.pin`, horario del grupo y bienvenida con las reglas. Lo que borra la moderación (un link prohibido, alguien de la lista negra) Claudia no lo contesta ni lo guarda, no corre como comando y no cuenta en los juegos ni en los contadores de mensajes.
- **Llamados a todos**: `.tagall`, `.ht` y el aviso de las encuestas arroban a todos menos a quien pidió `.notagall` en ese grupo (`.sitagall` para volver). Las menciones a alguien en particular llegan igual, y un admin puede forzar un aviso con `.tagall -f`.
- **Ritmo humano**: WhatsApp ya bloqueó el número una vez por volumen, así que en cada chat deja al menos un segundo y medio entre un mensaje y el siguiente (las reacciones van en una fila aparte y los borrados de la moderación no esperan), la charla muestra "escribiendo…" y contesta como mucho una vez cada 20 segundos por grupo. Los avisos a todos los grupos (`.avisartodos`) salen de a uno, cada 20 a 40 segundos, y se pueden cortar a mitad de camino con `.avisartodos cancelar`. `.enviados` muestra cuánto manda, por hora y por grupo.

## Privacidad

Claudia lee los grupos donde está, así que conviene saber qué hace con lo que lee.

- **Qué le llega a la IA**: cuando le hablan, el mensaje, los últimos 14 del chat, lo que sabe de esa persona en ese grupo y las notas de `.recordá`, más el audio si es para ella. También lo hablado en las horas que pide `.resumen`, hasta 150 mensajes de la semana para el recap del domingo, el nombre y lo que sabe de alguien para saludarlo en su cumpleaños y, en los grupos que prendieron la iniciativa, lo reciente del grupo unas pocas veces por día. La trivia y la pregunta del día no llevan nada del grupo.
- **A qué proveedor**: todo va primero a Gemini y, si falla, a los respaldos que tengan key (Groq, OpenRouter, NVIDIA, Cerebras), salvo los audios, la búsqueda de «¿Es verdad?», la iniciativa y `.ia`, que son solo de Gemini. Cada proveedor tiene sus condiciones. En el plan gratis de Gemini, Google usa lo que se le manda para mejorar sus productos, y en el pago no ([precios de la API](https://ai.google.dev/gemini-api/docs/pricing)). En OpenRouter, la configuración de privacidad de la cuenta permite no mandar nada a proveedores que entrenan con los datos, con un ajuste para los modelos gratis y otro para los pagos; si un modelo se queda sin proveedor, el respaldo sigue con el siguiente.
- **Otros servicios**: algunos comandos le mandan a un servicio de afuera lo que se les pide. `.qc` manda el texto, el nombre y la foto de perfil a bot.lyo.su, que dibuja la cita; `.tourl` sube el archivo a tmpfiles.org, con un link que puede abrir cualquiera que lo tenga; `.traducir` y `.tts` mandan el texto a Google. Los que buscan algo (`.play`, `.clima`, `.metar`, `.rae` y otros) mandan solo lo que se busca.
- **Qué queda en memoria**: los últimos 200 mensajes de cada chat quedan solo en memoria, nunca en el disco, y se pierden al reiniciar. Ahí, lo que alguien borra se olvida (en los grupos con el anti-borrado prendido, el bot lo vuelve a mostrar) y lo que edita queda como lo dejó.
- **Qué va a la base**: lo que aprende de cada uno (por grupo, y se borra con `.memoria olvidame`); lo que se manda a propósito (las notas de `.recordá`, los recordatorios, las entradas de los hashtags, las publicaciones de compraventa y las calificaciones), que se queda aunque después se borre el mensaje; y, durante 90 días, lo que dice Claudia en cada grupo: sus respuestas y lo que hace por iniciativa, con a quién le reaccionó o respondió y el motivo que dio la IA, que puede resumir lo que se habló. La base pisa con ceros lo que se borra, así que no queda escondido en el archivo. El motivo de cada vistazo de la iniciativa también va al log (`~/claudia.log`, si se arranca como dice abajo).
- **Backups**: todos los días, después de las 4, el bot guarda una copia de la base en `database/backups/` (quedan las últimas 7), y una vez por semana se la manda al owner por privado. Tienen todo lo de arriba, y lo que se borra de la base sigue en las copias de los días anteriores hasta que se borran a los 7 días (y en la que le llegó al owner, mientras la guarde): cuidalas como a `botSession/`.

## Stack

Node.js 22 o más nuevo · [Baileys](https://github.com/WhiskeySockets/Baileys) · better-sqlite3 · Gemini, con respaldo en Groq, OpenRouter, NVIDIA y Cerebras · yt-dlp · ffmpeg

## Instalación

### Qué hace falta

- **Node.js 22 o más nuevo** y npm.
- **git**, para clonar y para actualizar.
- **Python 3**: lo usa yt-dlp, y en Termux también hace falta para compilar better-sqlite3.
- **ffmpeg**: stickers, efectos de audio, `.toimg` y la conversión de la música.
- Un **número de WhatsApp para el bot**. Conviene que sea uno aparte y no el personal: si WhatsApp lo bloquea, se pierde ese número.
- Una **API key de Gemini** (gratis en [Google AI Studio](https://aistudio.google.com/apikey)). Sin ella el bot anda, pero no charla. Con la gratis anda todo menos la búsqueda de «¿Es verdad?», y Google usa lo que se le manda para mejorar sus productos (ver [Privacidad](#privacidad)).

yt-dlp no se instala a mano: el bot lo baja solo a `bin/` la primera vez que arranca y lo actualiza todos los días a las 5 de la mañana.

### 1. Paquetes del sistema

En Termux (Android):

```sh
pkg update && pkg upgrade
pkg install nodejs git python build-essential ffmpeg
```

En Linux (Arch, por ejemplo):

```sh
sudo pacman -S nodejs npm git python ffmpeg
```

### 2. Clonar e instalar dependencias

```sh
git clone https://github.com/gauchitodev/ClaudIA.git
cd ClaudIA
```

En Termux, better-sqlite3 no trae binario precompilado para Android, así que npm lo compila al instalar, y node-gyp necesita una variable que Termux no define:

```sh
export GYP_DEFINES="android_ndk_path=''"
npm ci
```

Sin esa variable la instalación corta con un error de `android_ndk_path`. En Linux alcanza con `npm ci`. La compilación en Termux tarda unos minutos.

Por lo mismo better-sqlite3 se queda en la 12: la 13 no compiló en la tablet. Si algún día se sube, probar primero en Termux con esta receta.

### 3. Configuración

```sh
cp config.example.toml config.toml
nano config.toml
```

Lo mínimo:

- `numberBot`: el número del bot con código de país, sin `+`, espacios ni guiones (por ejemplo `598991234567`). Si lo dejás vacío, el bot vincula con QR en vez de con código.
- `owners`: tu número (y el de quien quieras), en el mismo formato. Los owners tienen todos los permisos.
- `geminiApiKey`: la key de Gemini, que es la que usa la charla.

Las de Groq, OpenRouter, NVIDIA y Cerebras son el respaldo de la IA, y cada proveedor se usa solo si tiene su key. El resto es opcional y está explicado en el mismo archivo. `config.toml` está en `.gitignore` y nunca se sube.

Los horarios del bot (la trivia, la pregunta del día, los cumpleaños, los cierres) van con la hora de Uruguay (`America/Montevideo`). Para usar otra zona, definí `TZ` en el entorno antes de arrancarlo; `.estado` muestra la que está usando.

### 4. Primer arranque y vinculación

```sh
npm start
```

- **Con `numberBot` completo**, a los pocos segundos aparece `🔑 CÓDIGO DE VINCULACIÓN: XXXX-XXXX`. En el teléfono del bot: WhatsApp → Dispositivos vinculados → Vincular un dispositivo → *Vincular con el número de teléfono* y escribís el código.
- **Con `numberBot` vacío**, aparece un QR en la terminal y se escanea desde el mismo menú. El primero dura un minuto y después va cambiando cada 20 segundos: se escanea el que esté en pantalla.

La sesión queda guardada en `botSession/` y no hay que volver a vincular. Si se cierra la sesión desde el teléfono, el bot borra esa carpeta y en el próximo arranque pide vincular de nuevo. **`botSession/` da acceso completo a la cuenta de WhatsApp: no la compartas ni la subas.**

La base de datos se crea sola en `database/database.db`.

### 5. Cookies de YouTube (opcional, pero recomendado)

YouTube suele bloquear las descargas de servidores y teléfonos sin sesión. Con un `cookies.txt` de una cuenta real en la raíz del proyecto, `.play`, `.video` e Instagram andan mucho mejor. Se exporta desde el navegador con una extensión tipo *Get cookies.txt LOCALLY*, en formato Netscape, estando logueado en YouTube (y en Instagram, si se quiere). Mejor usar una cuenta secundaria: esas cookies equivalen a la contraseña de la sesión. Está en `.gitignore`.

### 6. Dejarlo andando en segundo plano (Termux)

Android duerme a Termux si no se le avisa. Lo que usamos en la tablet:

1. `termux-wake-lock` para que no lo duerma, y en los ajustes de Android sacar a Termux de la optimización de batería.
2. Arrancarlo con `nohup` para que siga aunque se cierre la sesión:

   ```sh
   nohup npm start >> ~/claudia.log 2>&1 &
   ```

3. Para que arranque solo al prender el teléfono, instalar la app **Termux:Boot** (de F-Droid, igual que Termux), abrirla una vez y crear `~/.termux/boot/arrancar`:

   ```sh
   #!/data/data/com.termux/files/usr/bin/sh
   termux-wake-lock
   sleep 60   # que se conecte el wifi antes que WhatsApp
   cd ~/ClaudIA && nohup npm start >> ~/claudia.log 2>&1 &
   ```

   y darle permiso de ejecución con `chmod +x ~/.termux/boot/arrancar`.

4. Opcional, para ver la batería con `.bat` y en `.estado`, y para que el bot te avise por privado cuando le queda menos del 10 % sin cargar, o cargando pero bajando igual porque el cargador no da abasto (y de nuevo con menos del 5 %): `pkg install termux-api` y la app **Termux:API**, también de F-Droid (cada fuente firma sus versiones distinto, así que tiene que venir del mismo lugar que Termux).

`npm start` corre `start-process.js`, que relanza el bot solo si se cae. Si se cae apenas arranca (por ejemplo, con better-sqlite3 compilado para otra versión de Node después de un `pkg upgrade`), espera cada vez más entre intentos, hasta 5 minutos, para no llenar el log. Ojo con el log: tiene volcados de las claves de la sesión de Baileys, así que no lo compartas entero.

### Actualizar

```sh
cd ~/ClaudIA
git pull --ff-only
npm ci   # solo si cambió package-lock.json (en Termux, con el GYP_DEFINES de arriba)
```

y reiniciar el bot: cortar el proceso de `main.js` alcanza, `start-process.js` lo vuelve a levantar con el código nuevo.

## Tests y lint

`npm test` corre la suite con el test runner de Node contra una base SQLite temporal, y `npm run lint` corre ESLint. Las dos cosas corren solas en GitHub Actions, en Node 22, 24 y 26, en cada push a `main` y en cada pull request.

## Claudia:

<p align="center">
  <img src="assets/claudia-solaire.jpg" height="250" alt="Bender como Solaire de Dark Souls, con los brazos en alto al sol">
  <img src="assets/claudia-leyendo.jpg" height="250" alt="Bender leyendo un papel frente a una multitud">
  <img src="assets/claudia-sagrado-corazon.jpg" height="250" alt="Bender como la estampa del Sagrado Corazón">
</p>

<p align="center"><sub>Imágenes por <a href="https://github.com/TheShrekMaster">@TheShrekMaster</a>.</sub></p>

Esta es la foto de perfil que usamos para Claudia en WhatsApp:

<p align="center">
  <img src="assets/profile_picture_claudia.jpg" height="250" alt="Retrato de una mujer de pelo corto hecha de código verde brillante, estilo Matrix, dentro de un círculo sobre un fondo de caracteres que caen">
</p>

## Related Projects

- [ClaudIA-CS1.6](https://github.com/NicolasBentancur/ClaudIA-CS1.6), de [@NicolasBentancur](https://github.com/NicolasBentancur): plugin de Counter-Strike 1.6 (AMX Mod X) basado conceptualmente en este proyecto. Lleva a Claudia al chat del juego, con IA, economía en URU Coins, casino y ajedrez en la ventana MOTD.
- [ClaudIA-Minecraft](https://github.com/gauchitodev/ClaudIA-Minecraft), de [@gauchitodev](https://github.com/gauchitodev): plugin de Paper más un servicio en Node que importa la personalidad, la IA, la trivia, el clima y la RAE de este repo. Lleva a Claudia al chat de un server de Minecraft Java, con música de YouTube que suena para todos sin mods, UruCoins propias y un lobby para elegir mapas.

## Nota

Es un proyecto personal, hecho a medida de un grupo en particular, así que no pretende ser una plantilla genérica. Si llegaste hasta el código, bienvenido/a: cualquier sugerencia suma.

Las imágenes de `assets/` en las que aparece Bender, de *Futurama*, incluido el banner, las hizo [@TheShrekMaster](https://github.com/TheShrekMaster). No están cubiertas por la licencia MIT del código: los derechos de las imágenes son de su autor y los del personaje, de sus respectivos propietarios.
