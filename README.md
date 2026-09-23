# ClaudIA 🇺🇾

[![CI](https://github.com/gauchitodev/ClaudIA/actions/workflows/ci.yml/badge.svg)](https://github.com/gauchitodev/ClaudIA/actions/workflows/ci.yml)

Bot de WhatsApp con personalidad propia, hecho a mano para un grupo de amigos uruguayo. Es mi primer proyecto de programación — arrancó como una copia de [SawBot-MD](https://github.com/martinezanthony/SawBot-MD) y se fue transformando con el tiempo hasta quedar irreconocible.

Corre 24/7 en una tablet Samsung Galaxy Tab A9, vía Termux.

## ¿Qué hace?

- **Personalidad propia**: Claudia habla en rioplatense, con "vos", sin caricaturizar el acento — calibrada a pulso con feedback del grupo real.
- **Charla con IA**: responde cuando la mencionan o le contestan, en cascada entre varios modelos de Gemini y con respaldo en Groq si se queda sin cuota. Clasifica pedidos (música, mencionar al grupo, etc.) con salida JSON estructurada, no adivinando texto libre.
- **Memoria por persona**: recuerda gustos y datos chicos de cada uno entre charlas, sin gastar consultas extra a la IA.
- **Música y video**: descarga de YouTube (con cookies + reintentos + varios candidatos) y cae a SoundCloud si todo lo demás falla.
- **Temáticas semanales**: hashtags como `#historiasrandom`, `#quejadelunes` y `#recomendado`, con listas automáticas por semana.
- **Ranking mensual**: puntos por reaccionar y por recibir reacciones — quién es más votado, quién es más activo.
- **Administración de grupo**: comandos con permisos reales (admin/owner), no solo declarados.

## Stack

Node.js 22 o más nuevo · [Baileys](https://github.com/WhiskeySockets/Baileys) · better-sqlite3 · Gemini + Groq · yt-dlp

## Configuración

Copiá `config.example.toml` como `config.toml` y completá el número del bot, los owners y las API keys. `config.toml` está en `.gitignore` y nunca se sube.

## Termux (Android)

better-sqlite3 no trae binario precompilado para Android, así que npm lo compila al instalar, y node-gyp necesita el toolchain y una variable que Termux no define. Antes del `npm ci`:

```sh
pkg install python build-essential
export GYP_DEFINES="android_ndk_path=''"
npm ci
```

Sin eso la instalación corta con un error de `android_ndk_path`. Por lo mismo better-sqlite3 se queda en la 12: la 13 no compiló en la tablet. Si algún día se sube, probar primero en Termux con esta receta.

## Tests y lint

`npm test` corre la suite con el test runner de Node contra una base SQLite temporal, y `npm run lint` corre ESLint. Las dos cosas corren solas en GitHub Actions, en Node 22, 24 y 26, en cada push a `main` y en cada pull request.

## Nota

Proyecto personal, sin pretensión de ser un template genérico — está hecho a medida de un grupo puntual. Si estás mirando el código, bienvenido/a, cualquier sugerencia es bienvenida.
