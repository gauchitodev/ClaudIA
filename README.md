# ClaudIA 🇺🇾

![Bender entrando por una puerta, con el texto «ClaudIA llegando al grupo»](assets/banner.jpg)

[![CI](https://github.com/gauchitodev/ClaudIA/actions/workflows/ci.yml/badge.svg)](https://github.com/gauchitodev/ClaudIA/actions/workflows/ci.yml)

Bot de WhatsApp con personalidad propia, desarrollado a medida para un grupo de amigos de Uruguay. Es mi primer proyecto de programación ([@gauchitodev](https://github.com/gauchitodev)), en el cual me ayudaron [@carlosplanchon](https://github.com/carlosplanchon) y [@nicolasgutierrezdev](https://github.com/nicolasgutierrezdev). Tomé como punto de partida [SawBot-MD](https://github.com/martinezanthony/SawBot-MD), de [@martinezanthony](https://github.com/martinezanthony) (quien también ayudó).

A su vez, [SawBot-MD](https://github.com/martinezanthony/SawBot-MD) está basado en [GataBot-MD](https://github.com/GataNina-Li/GataBot-MD).

## ¿Qué hace?

La lista completa de comandos, con lo que hace cada uno, está en [docs/comandos.md](docs/comandos.md): se genera desde el menú del bot, así que es la misma que muestra `.menu`. En resumen:

**Charla**

- **Personalidad propia**: habla en rioplatense, con «vos», sin caricaturizar el acento, calibrada a pulso con el feedback de un grupo real.
- **Contesta con IA** cuando la nombran, la arroban o le responden, siguiendo la charla del grupo, con varios modelos de Gemini en cascada y respaldo en Groq, OpenRouter, NVIDIA y Cerebras. Los pedidos (música, arrobar al grupo) van por salida JSON, no adivinando texto libre, y no se mete en las respuestas a los juegos.
- **Escucha** solo los audios que son para ella (una nota de voz que le responde, o un audio citado nombrándola) y **verifica** con búsqueda de Google lo que le preguntan si es cierto, con las fuentes si se las piden; los chismes del grupo no los busca. La búsqueda necesita el plan pago de Gemini.
- **Iniciativa** (`.iniciativa on`): unas pocas veces por día mira el grupo por su cuenta y, si viene al caso, reacciona o comenta. Las reglas de tacto van en código: nunca de noche, ni en temas serios, juegos abiertos o charlas mano a mano, y no insiste si la ignoran.
- **Memoria** por grupo de lo que aprende de cada uno charlando (`.notas yo` lo muestra, `.notas olvidame` lo borra), sin nada de lo que le cuentan por privado ni en otro grupo; notas del grupo con `.nota` (se ven con `.notas`) y resumen del grupo con IA (`.resumen`, hasta 6 horas).
- **Voz**: con `.voz` contesta con notas de voz (edge-tts, voz rioplatense) y `.tts` lee un texto.

**Juegos y casino**

- **Juegos**: trivia (y trivias relámpago que salen solas), acertijos, banderas, ordenar palabras, ahorcado, ta-te-ti, 4 en línea (aporte de [@gabriel10lg200](https://github.com/gabriel10lg200)) y la batalla de aura (`.aura @persona`: el grupo vota cinco minutos y el que gana suma aura del mes, que no son UruCoins). Los de ingenio dan premio en UruCoins, con tope por día.
- **Casino** con UruCoins: ruleta europea, tragamonedas, blackjack, mines, póker Texas Hold'em entre los del grupo (las cartas se piden por privado con `.cartas`), carrera de caballos, duelos y peleas por turnos, lotería semanal y mercados de apuestas sobre eventos reales. Topes por jugada, y si el bot se apaga o se reinicia devuelve lo que estaba en juego (salvo que Android lo mate de golpe). La idea inicial fue de [@libeelula](https://github.com/libeelula).
- **Interruptores por grupo**: `.juegos` y `.casino` apagan todo, `.horariojuegos` les pone horario (también al ta-te-ti y al 4 en línea), y `.juego mines off` apaga un juego solo sin cortar las partidas en curso.

**Economía (UruCoins)**

- Monedas por reaccionar, participar y poner música (`.play`, hasta 5 temas por día), laburos con sueldo diario y niveles, rangos por antigüedad y mensajes, racha diaria, pregunta del día y una tienda (escudo, racha doble, voto doble, apodo). `.mitimba` y `.timba` cuentan cómo le fue a cada uno en el casino.

**Grupo y moderación**

- **Permisos reales**, no solo declarados: además de los admins de WhatsApp hay roles del bot por grupo (`.adminbot`, `.moderador`), y se modera solo hacia abajo.
- **Advertencias** con antecedentes (`.antecedentes`; a la tercera, afuera; un admin los borra con `.clearantecedentes`), lista negra por grupo y global, silenciados, mensajes fijados con `.pin`, horario del grupo, bienvenida con las reglas, anti-links y `.antiubicacion`. Lo que borra la moderación no se contesta, no se guarda y no cuenta para nada.
- **Inactivos**: `.inactivos [días]` etiqueta a los que no escriben hace 15 días (o los que se digan, de 7 a 365, sin contar admins, roles, recién llegados ni a quien está con `.afk`) y les da 3 días para volver; `.k inactivos` saca a los que siguieron callados, con confirmación del admin por privado. En un grupo cerrado no etiqueta ni saca a nadie, y ese tiempo no cuenta como silencio.
- **Pedidos para entrar**: `.ap` los aprueba de a uno, con unos segundos entre cada uno; `.ap 5` aprueba solo los primeros 5, y a quien está en la lista negra lo rechaza. `.pendientes` los lista.
- **Llamados y listas**: `.tagall` y `.ht` arroban a todos menos a quien pidió `.notagall` (`.sitagall` para volver). Las listas (`.familias`, `.baltop`, `.ranking`, `.aura`, `.listaadv`, `.antecedentes`, `.cumples`…) nombran a la gente sin arrobarla, y con `nombres`, `alias` o `numeros` al final, por su nombre de WhatsApp, por su apodo o por su número.
- **Los números cambian de dueño**: cuando se nombra a alguien por su número, los comandos van a quien el grupo muestra con ese número y, si el grupo no lo dice, le preguntan a WhatsApp; la lista negra y los roles del bot siguen a la persona.

**Herramientas y más**

- **Música y video**: descarga de YouTube (con cookies, reintentos y varios candidatos; si ninguno sale, prueba SoundCloud y deja `.reintentar`), TikTok e Instagram.
- **Útiles**: clima, traductor, RAE, stickers (y los del grupo: los junta, los mira una vez y los manda con criterio, con `.stickerazar` o contestando), recordatorios, versículos de la Biblia (`.versiculo Levítico 18:22`), `.ping` para saber si está prendida, y la batería del teléfono con `.bat`, con aviso al owner por privado cuando se queda sin carga (aporte de [@Daniel-Nalerio](https://github.com/Daniel-Nalerio); necesita Termux:API).
- **Aviación**: METAR, TAF y SIGMET decodificados en español, los claros horarios de Inumet, viento cruzado y hora Zulu.
- **Temáticas y ranking**: hashtags semanales (`#historiasrandom`, `#quejadelunes`, `#recomendado`) con sus listas, y el ranking mensual por reacciones, con el aura de las batallas y la corona 👑 para el primero.
- **Parejas y familia**: parejas, casamientos y adopciones dentro del grupo; `.parentesco` dice qué es alguien tuyo y `.familias` muestra cada familia con su árbol. **Redes**: las del grupo (`.redes`, que Claudia también pasa en la charla) y las de cada uno en su perfil (`.misredes`).
- **Compraventa**: un modo para grupos de compra y venta, con publicaciones por `#vendo` o `#compro`, catálogo, búsqueda, avisos, reputación y calificaciones (`.menuventas`).

**Cómo se cuida**

- **Ritmo humano**: WhatsApp ya bloqueó el número una vez por volumen, así que deja al menos un segundo y medio entre mensajes en cada chat, muestra «escribiendo…» y charla como mucho una vez cada 20 segundos por grupo; `.avisartodos` sale de a un grupo por vez y se puede cortar. `.enviados` muestra cuánto manda.
- **Menú a medida**: `.menu` muestra arriba lo más usado en ese grupo y ofrece solo lo que ahí anda y lo que cada rol puede usar; los moderadores ven qué se usa con `.usos`.

## Privacidad

Claudia lee los grupos donde está, así que conviene saber qué hace con lo que lee.

- **Qué le llega a la IA**: cuando le hablan, el mensaje, los últimos 14 del chat, lo que sabe de esa persona en ese grupo, su género si lo anotó con `.genero`, las notas de `.nota` y las redes del grupo (`.redes`), más el audio si es para ella. Con los mensajes de otros que le llegan (en la charla, en `.ia`, en `.resumen`, en el recap y en la iniciativa) va también el género de quienes aparecen en ellos y lo anotaron, para que los trate bien. También lo hablado en el tiempo que pide `.resumen` (hasta 6 horas), hasta 150 mensajes de la semana para el recap del domingo, el nombre, los años que cumple y lo que sabe de alguien para saludarlo en su cumpleaños y, en los grupos que prendieron la iniciativa, lo reciente del grupo unas pocas veces por día. La trivia y la pregunta del día no llevan nada del grupo.
- **A qué proveedor**: todo va primero a Gemini y, si falla, a los respaldos que tengan key (Groq, OpenRouter, NVIDIA, Cerebras), salvo los audios, la búsqueda de «¿Es verdad?», la iniciativa y `.ia`, que son solo de Gemini. Cada proveedor tiene sus condiciones. En el plan gratis de Gemini, Google usa lo que se le manda para mejorar sus productos, y en el pago no ([precios de la API](https://ai.google.dev/gemini-api/docs/pricing)). En OpenRouter, la configuración de privacidad de la cuenta permite no mandar nada a proveedores que entrenan con los datos, con un ajuste para los modelos gratis y otro para los pagos; si un modelo se queda sin proveedor, el respaldo sigue con el siguiente.
- **Otros servicios**: algunos comandos le mandan a un servicio de afuera lo que se les pide. `.tourl` sube el archivo a tmpfiles.org, con un link que puede abrir cualquiera que lo tenga; `.traducir` manda el texto a Google, y `.tts` y las notas de voz de `.voz` le mandan el texto a Microsoft (edge-tts) para sintetizarlo; sin edge-tts, `.tts` sigue con Google. Los que buscan algo (`.play`, `.clima`, `.metar`, `.rae` y otros) mandan solo lo que se busca.
- **Qué queda en memoria**: lo de las últimas 6 horas de cada chat, y al menos sus últimos 200 mensajes, queda solo en memoria, nunca en el disco: en la del bot y en la de `start-process.js`, que lo relanza. Así no se pierde al actualizar (cortar `main.js`), solo si se reinicia la tablet o Termux, o se vuelve a correr `npm start`. Lo que se dice en un grupo mientras el bot está caído entra cuando vuelve, menos lo que la moderación habría borrado (que no se borra, pero tampoco queda). Ahí, lo que alguien borra se olvida, también en la copia (en los grupos con el anti-borrado prendido, el bot lo vuelve a mostrar), y lo que edita queda como lo dejó.
- **Qué va a la base**: lo que aprende de cada uno (por grupo, y se borra con `.notas olvidame`); lo que se manda a propósito (las notas de `.nota`, las redes del grupo de `.redes` y las que cada uno carga en su perfil con `.misredes` (por grupo), los recordatorios, el cumpleaños de `.cumple` (con el año, o el que le anota un admin con `.setcumple`; un admin lo borra con `.delcumple`), el apodo que se compra en la tienda, el género de `.genero`, el apellido de `.apellido`, las entradas de los hashtags, las publicaciones de compraventa y las calificaciones), que se queda aunque después se borre el mensaje; por grupo, cuántos mensajes manda cada uno, qué días charla y, para `.inactivos`, cuándo entró, cuándo escribió por última vez y si lo avisó, que tampoco se borra; por grupo y por mes, el aura que gana cada uno en las batallas de aura y cuántos ganó y perdió (los votos no se guardan, solo el resultado), y quién pidió `.noaura`; y, durante 90 días, lo que dice Claudia en cada grupo: sus respuestas y lo que hace por iniciativa, con a quién le reaccionó o respondió y el motivo que dio la IA, que puede resumir lo que se habló. La base pisa con ceros lo que se borra, así que no queda escondido en el archivo. El motivo de cada vistazo de la iniciativa también va al log (`~/claudia.log`, si se arranca como dice abajo).
- **Backups**: todos los días, después de las 4, el bot guarda una copia de la base en `database/backups/` (quedan las últimas 7), y una vez por semana se la manda al owner por privado. Tienen todo lo de arriba, y lo que se borra de la base sigue en las copias anteriores hasta que se borra la última que lo tiene: quedan 7 copias, no 7 días, así que si algún día el bot no anduvo, dura más (y en la que le llegó al owner, mientras la guarde). Cuidalas como a `botSession/`.

## Stack

Node.js 22 o más nuevo · [Baileys](https://github.com/WhiskeySockets/Baileys) · better-sqlite3 · Gemini, con respaldo en Groq, OpenRouter, NVIDIA y Cerebras · yt-dlp · ffmpeg

## Instalación

### Qué hace falta

- **Node.js 22 o más nuevo** y npm.
- **git**, para clonar y para actualizar.
- **Python 3**: lo usa yt-dlp, y en Termux también hace falta para compilar better-sqlite3.
- **edge-tts** (opcional): la voz de Claudia para `.voz` y `.tts` (es-AR-ElenaNeural). Sin él, `.tts` usa Google y `.voz` queda en texto.
- **ffmpeg**: stickers, efectos de audio, `.toimg` y la conversión de la música.
- Un **número de WhatsApp para el bot**. Conviene que sea uno aparte y no el personal: si WhatsApp lo bloquea, se pierde ese número.
- Una **API key de Gemini** (gratis en [Google AI Studio](https://aistudio.google.com/apikey)). Sin ella el bot anda, pero no charla. Con la gratis anda todo menos la búsqueda de «¿Es verdad?», y Google usa lo que se le manda para mejorar sus productos (ver [Privacidad](#privacidad)).

yt-dlp no se instala a mano: el bot lo baja solo a `bin/` la primera vez que arranca y lo actualiza todos los días a las 5 de la mañana.

### 1. Paquetes del sistema

En Termux (Android):

```sh
pkg update && pkg upgrade
pkg install nodejs git python build-essential ffmpeg
pip install edge-tts   # opcional: la voz de Claudia (.voz y .tts)
```

En Linux (Arch, por ejemplo):

```sh
sudo pacman -S nodejs npm git python ffmpeg
pipx install edge-tts   # opcional: la voz de Claudia (.voz y .tts)
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
- `owners`: tu número (y el de quien quieras), en el mismo formato. Los owners tienen todos los permisos. El bot los reconoce por ese número: cuando un mensaje llega sin él, solo con la LID (el id con el que WhatsApp nombra a cada uno sin mostrar su número), los poderes van a la LID que WhatsApp confirma que tiene el número. Se lo pregunta al conectarse y cada 6 horas.
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

`npm run comandos` vuelve a generar [docs/comandos.md](docs/comandos.md) desde el menú del bot (`lib/menu.js` y `lib/menu-ventas.js`). Si se toca una línea del menú y no se regenera la guía, un test lo avisa.

## Entrenar el detector de intención

En un grupo en modo compraventa, lo que las reglas no leen como un aviso ni como un pedido lo mira un clasificador chico (`lib/intencion.js`): una sola capa sobre las palabras y los pedazos de palabras del mensaje, que dice si parece una venta, un pedido o nada. Corre en JavaScript puro, sin dependencias, y sus pesos son `lib/intencion-modelo.json` (64 KB). No publica nada: cuando está seguro (0,9 o más), el bot le cuenta a quien escribió cómo publicarlo o cómo dejarlo anotado, una sola vez por persona.

Para volver a entrenarlo hacen falta mensajes etiquetados a mano, en un JSON así:

```json
[{ "texto": "$ 300", "clase": "vender", "autor": 12, "fecha": "2026-10-03T22:30:00" }]
```

- `clase`: `vender` (ofrece algo concreto, o es el precio de lo que muestra una foto), `comprar` (pregunta quién vende, tiene o hace algo, o dice que lo busca) o `nada` (todo lo demás: las condiciones de una venta sin la cosa, una pregunta a un vendedor, una respuesta a alguien, la charla).
- `autor`: cualquier cosa que distinga a una persona de otra (un número alcanza). Sirve para medir con gente que el modelo no vio, y para no darle peso a lo que escribió una sola persona.
- `fecha`: opcional. Con ella también mide sobre el último tercio de los mensajes, entrenando con los anteriores.

```bash
npm run intencion -- ruta/mensajes.json           # mide, entrena con todos y escribe los pesos
npm run intencion -- ruta/mensajes.json --medir   # solo mide
```

Ese archivo de mensajes no va al repo: es lo que escribió la gente de un grupo. Al repo van solo los pesos. Después de entrenar, `npm test` avisa si el modelo nuevo dejó de leer lo más claro (`test/intencion.test.mjs`), y hay que reiniciar el bot, que lee los pesos una sola vez.

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
