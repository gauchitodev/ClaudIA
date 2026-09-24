# ClaudIA 🇺🇾

![Bender entrando por una puerta, con el texto «ClaudIA llegando al grupo»](assets/banner.jpg)

[![CI](https://github.com/gauchitodev/ClaudIA/actions/workflows/ci.yml/badge.svg)](https://github.com/gauchitodev/ClaudIA/actions/workflows/ci.yml)

Bot de WhatsApp con personalidad propia, desarrollado a medida para un grupo de amigos de Uruguay. Es mi primer proyecto de programación ([@gauchitodev](https://github.com/gauchitodev)), en el cual me ayudaron [@carlosplanchon](https://github.com/carlosplanchon) y [@nicolasgutierrezdev](https://github.com/nicolasgutierrezdev). Tome como punto de partida [SawBot-MD](https://github.com/martinezanthony/SawBot-MD), de [@martinezanthony](https://github.com/martinezanthony) (quien también ayudó).

A su vez, [SawBot-MD](https://github.com/martinezanthony/SawBot-MD) está basado en [GataBot-MD](https://github.com/GataNina-Li/GataBot-MD).

## ¿Qué hace?

- **Personalidad propia**: Claudia habla en rioplatense, con "vos", sin caricaturizar el acento, calibrada a pulso con feedback del grupo real.
- **Charla con IA**: responde cuando la mencionan o le contestan, con varios modelos de Gemini en cascada y, si se quedan sin cuota, con respaldo en Groq, OpenRouter, NVIDIA y Cerebras. Clasifica pedidos (música, mencionar al grupo, etc.) con salida JSON estructurada, no adivinando texto libre. No se mete en las respuestas a los juegos.
- **Audios**: escucha solo los audios que son para ella: una nota de voz que le responde un mensaje, o un audio que alguien cita nombrándola ("claudia, ¿qué pensás de esto?"). Los demás audios del grupo no los baja. Si citan un tema que mandó ella con `.play`, ya sabe cuál es y no lo vuelve a escuchar. Los escucha Gemini: si responde un respaldo, avisa que no pudo escucharlo en vez de inventar.
- **¿Es verdad?**: si le preguntan si algo es cierto o le piden un dato que se puede verificar (una noticia, de dónde es una banda, quién escribió un tema), lo busca en Google con Gemini y contesta con su onda, sin links. Los bolazos y los chismes del grupo no los busca. Las fuentes las pasa solo si se las piden, aunque sea un rato después.
- **Iniciativa**: en los grupos que la prenden (`.iniciativa on`), unas pocas veces por día mira el grupo por su cuenta, lee lo que se perdió y, si viene al caso, reacciona, cita algo de hace un rato o comenta. Las reglas de tacto van en código, antes de consultar a la IA: no mira de noche, no se mete en temas serios, juegos abiertos ni charlas mano a mano, no insiste si la ignoran y no habla más que el promedio del grupo. Hace una sola consulta por vistazo, solo a Gemini, con topes fijos por día.
- **Memoria**: recuerda gustos y datos chicos de cada uno entre charlas, sin gastar consultas extra a la IA, y lo que el grupo le pide que recuerde con `.recordá`.
- **Música y video**: descarga de YouTube (con cookies + reintentos + varios candidatos) y cae a SoundCloud si todo lo demás falla. Si igual no sale, se puede volver a pedir con `.reintentar`. También baja videos de TikTok e Instagram.
- **Economía (UruCoins)**: monedas por reaccionar y por participar, laburos con sueldo diario y niveles, rangos por antigüedad y mensajes, racha diaria, pregunta del día y una tienda (escudo, racha doble, voto doble, apodo).
- **Juegos**: trivia (y trivias relámpago que salen solas), acertijos, banderas, ordenar palabras, ahorcado y ta-te-ti, con premio para el que gana.
- **Casino**: ruleta europea, tragamonedas, blackjack, mines, carrera de caballos, duelos y peleas por turnos, lotería semanal y mercados de apuestas sobre eventos reales. Tiene topes por jugada, se apaga por grupo con `.casino off` y, si el bot se apaga o se reinicia, devuelve lo que estaba en juego.
- **Temáticas semanales**: hashtags como `#historiasrandom`, `#quejadelunes` y `#recomendado`, con listas automáticas por semana.
- **Ranking mensual**: puntos por reaccionar y por recibir reacciones (quién es más votado, quién es más activo).
- **Compraventa**: un modo para grupos de compra y venta, con publicaciones por `#vendo` o `#compro`, catálogo, búsqueda, avisos, reputación y calificaciones.
- **Parejas y familia**: parejas, casamientos y adopciones dentro del grupo.
- **Aviación**: METAR, TAF y SIGMET decodificados en español, los claros horarios de Inumet, viento cruzado, hora Zulu y más.
- **Herramientas**: clima, traductor, RAE, texto a voz, stickers, recordatorios, resumen del grupo con IA y versículos de la Biblia.
- **Administración de grupo**: comandos con permisos reales, no solo declarados. Además de los admins de WhatsApp hay roles del bot por grupo (`.adminbot`, `.moderador`), y se modera solo hacia abajo. Advertencias (a la tercera, afuera), lista negra por grupo y global, silenciados, horario del grupo y bienvenida con las reglas.
- **Ritmo humano**: WhatsApp ya bloqueó el número una vez por volumen, así que todo lo que manda pasa por una cola con al menos un segundo y medio entre mensajes, la charla muestra "escribiendo…" y contesta como mucho una vez cada 20 segundos por grupo. `.enviados` muestra cuánto manda, por hora y por grupo.

## Stack

Node.js 22 o más nuevo · [Baileys](https://github.com/WhiskeySockets/Baileys) · better-sqlite3 · Gemini, con respaldo en Groq, OpenRouter, NVIDIA y Cerebras · yt-dlp · ffmpeg

## Configuración

Copiá `config.example.toml` como `config.toml` y completá el número del bot, los owners y las API keys. La de Gemini es la que usa la charla. Las de Groq, OpenRouter, NVIDIA y Cerebras son el respaldo, y cada proveedor se usa solo si tiene su key. `config.toml` está en `.gitignore` y nunca se sube.

## Termux (Android)

better-sqlite3 no trae binario precompilado para Android, así que npm lo compila al instalar, y node-gyp necesita el toolchain y una variable que Termux no define. Antes del `npm ci`:

```sh
pkg install python build-essential
export GYP_DEFINES="android_ndk_path=''"
npm ci
```

Sin eso la instalación corta con un error de `android_ndk_path`. Por lo mismo better-sqlite3 se queda en la 12: la 13 no compiló en la tablet. Si algún día se sube, probar primero en Termux con esta receta.

Los stickers, los efectos de audio y `.toimg` usan ffmpeg, que también se instala con pkg: `pkg install ffmpeg`.

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

## Nota

Es un proyecto personal, hecho a medida de un grupo en particular, así que no pretende ser una plantilla genérica. Si llegaste hasta el código, bienvenido/a: cualquier sugerencia suma.

Las imágenes de `assets/` en las que aparece Bender, de *Futurama*, incluido el banner, las hizo [@TheShrekMaster](https://github.com/TheShrekMaster). No están cubiertas por la licencia MIT del código: los derechos de las imágenes son de su autor y los del personaje, de sus respectivos propietarios.
