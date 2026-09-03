// Mapa de secciones del menú a los comandos reales que incluye cada una.
// Se usa en la whitelist: cuando el owner escribe "+nombreSeccion", se permiten/quitan todos estos comandos de una.
// Las claves (nombres de sección) van SIEMPRE en minúscula y sin el "+".

export const secciones = {
  juegos: ["ttt", "delttt", "ahorcado", "acertijo", "acertijos", "trivia", "ordenapalabra", "ordenarpalabra", "ordenar", "adivinabandera", "bandera", "banderas", "topgays", "topsucios", "topotakus", "toppajer@s", "toplindos", "toplind@s", "topput@s", "topchupadores", "topmamadores", "topchupapijas", "topchupavergas", "topparejas", "top5parejas", "formarpareja", "siono", "kiss", "beso", "besar"],

  casino: ["ruleta", "tragamonedas", "slot", "slots", "loteria", "lotería", "boleto", "boletos", "evento", "jugar", "mercados", "mercado", "resolver"],

  convertidores: ["s", "sticker", "stiker", "ttp", "ttp2", "attp2", "qc", "wm", "tourl", "upload", "emojimix", "tts", "vn", "ptt"],

  canvas: ["gay", "trans", "transexual", "bisexual", "bi", "simp", "hornycard", "licenciahot", "hotlicense", "hotlicencia", "carcel", "cárcel", "preso", "presa"],

  descargas: ["play", "audio", "video", "vídeo", "tt", "tiktok", "dltiktok", "instagram", "igdl", "imagen", "foto", "imágen", "ss"],

  ia: ["gemini", "ia", "bot"],

  pareja: ["pareja", "aceptar", "rechazar", "mipareja", "terminar", "ex", "miex", "exs", "casarse", "casarme", "boda", "matrimonio", "casar", "si", "no"],

  audio: ["bass", "blown", "deep", "earrape", "fast", "fat", "nightcore", "reverse", "robot", "slow", "smooth", "tupai"],

  biblia: ["versiculo", "versículo", "biblia", "salmo", "salmos"],

  extras: ["say", "decir", "sortear", "res", "clima", "tiempo", "traducir", "translate", "horoscopo", "horóscopo", "ig", "rae", "definición", "definicion", "afk", "links", "discord", "faggi", "recordame", "recordar", "recordatorio", "recordatorios", "olvidar", "cumple", "cumples", "cumpleanos", "cumpleaños", "resumen", "quemeperdi"],
};

// Devuelve la lista de comandos de una sección, o null si la sección no existe.
export function getComandosDeSeccion(nombre) {
  const clave = nombre.toLowerCase().trim();
  return secciones[clave] || null;
}

// Devuelve los nombres de todas las secciones disponibles.
export function getNombresSecciones() {
  return Object.keys(secciones);
}
