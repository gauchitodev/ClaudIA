# ClaudIA 🇺🇾

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

Node.js · [Baileys](https://github.com/WhiskeySockets/Baileys) · better-sqlite3 · Gemini + Groq · yt-dlp

## Configuración

Copiá `config.example.toml` como `config.toml` y completá el número del bot, los owners y las API keys. `config.toml` está en `.gitignore` y nunca se sube.

## Nota

Proyecto personal, sin pretensión de ser un template genérico — está hecho a medida de un grupo puntual. Si estás mirando el código, bienvenido/a, cualquier sugerencia es bienvenida.
