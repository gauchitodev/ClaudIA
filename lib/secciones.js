// Maps the menu sections to the actual commands each one covers.
// Used by the whitelist: when the owner writes "+sectionName", all of these commands are allowed/removed at once.
// The keys (section names) are ALWAYS lowercase and without the "+".

export const secciones = {
  juegos: ["ttt", "delttt", "ahorcado", "acertijo", "acertijos", "trivia", "ordenapalabra", "ordenarpalabra", "ordenar", "adivinabandera", "bandera", "banderas", "topgays", "topsucios", "topotakus", "toppajer@s", "toplindos", "toplind@s", "topput@s", "topchupadores", "topmamadores", "topchupapijas", "topchupavergas", "topparejas", "top5parejas", "formarpareja", "siono", "kiss", "beso", "besar"],

  casino: ["ruleta", "tragamonedas", "slot", "slots", "loteria", "lotería", "boleto", "boletos", "blackjack", "bj", "mines", "minas", "destapar", "abrir", "retirar", "pedir", "plantarse", "plantarme", "doblar", "dividir", "seguro", "rendirse", "rendirme", "carrera", "caballos", "duelo", "pelea", "acepto", "rechazo", "golpe", "patada", "cubrirse", "curar", "evento", "jugar", "mercados", "mercado", "resolver"],

  convertidores: ["s", "sticker", "stiker", "ttp", "ttp2", "attp2", "qc", "wm", "tourl", "upload", "emojimix", "tts", "vn", "ptt"],

  canvas: ["gay", "trans", "transexual", "bisexual", "bi", "simp", "hornycard", "licenciahot", "hotlicense", "hotlicencia", "carcel", "cárcel", "preso", "presa"],

  descargas: ["play", "audio", "video", "vídeo", "tt", "tiktok", "dltiktok", "instagram", "igdl", "imagen", "foto", "imágen", "ss"],

  ia: ["gemini", "ia", "bot", "iniciativa"],

  pareja: ["pareja", "aceptar", "rechazar", "mipareja", "terminar", "ex", "miex", "exs", "casarse", "casarme", "boda", "matrimonio", "casar", "si", "no", "adoptar", "familia", "mifamilia", "familias", "apellido", "emancipar", "emanciparse", "emanciparme", "desheredar"],

  audio: ["bass", "blown", "deep", "earrape", "fast", "fat", "nightcore", "reverse", "robot", "slow", "smooth", "tupai"],

  biblia: ["versiculo", "versículo", "biblia", "salmo", "salmos"],

  aero: ["metar", "taf", "sigmet", "claro", "claros", "cruzado", "reciproco", "recíproco", "opuesto", "factorcarga", "factordecarga", "sol", "zulu", "reloj", "utc", "dtg", "menuaero", "aero"],

  extras: ["orsi", "say", "decir", "sortear", "res", "clima", "tiempo", "traducir", "translate", "horoscopo", "horóscopo", "ig", "rae", "definición", "definicion", "afk", "links", "discord", "faggi", "recordame", "recordar", "recordatorio", "recordatorios", "olvidar", "cumple", "cumples", "cumpleanos", "cumpleaños", "resumen", "quemeperdi", "recap", "recorda", "recordá", "memoria"],
};

// Returns a section's list of commands, or null if the section doesn't exist.
export function getComandosDeSeccion(nombre) {
  const clave = nombre.toLowerCase().trim();
  return secciones[clave] || null;
}

// Returns the names of every available section.
export function getNombresSecciones() {
  return Object.keys(secciones);
}
