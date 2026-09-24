import { juegoTerminado } from "../lib/urucoins.js";
import { elegirAlAzar } from "../lib/azar.js";
import { marcarMensajeDeJuego } from "../lib/mensajes-de-juego.js";
const plugin = {};
plugin.cmd = ["ahorcado"];
plugin.juego = true;
plugin.botAdmin = true;

// Word list for hangman
const palabras = ["solido", "camino", "flores", "arboles", "ciudad", "puente", "montaña", "valle", "playas", "nubes", "viento", "lluvia", "trueno", "rayos", "nieve", "bosque", "selva", "desierto", "oasis", "lunas", "estrellas", "planeta", "galaxia", "cometa", "orbita", "satelite", "cohete", "avion", "barco", "trenes", "carros", "motos", "bicicleta", "camion", "ruedas", "motor", "frenos", "luces", "ventana", "puerta", "techo", "piso", "muros", "ladrillo", "cemento", "arena", "piedra", "madera", "vidrio", "metal", "plata", "oro", "bronce", "hierro", "acero", "cobre", "alambre", "clavos", "tornillo", "martillo", "sierra", "taladro", "pintura", "brocha", "lienzo", "cuadro", "pincel", "colores", "tinta", "papel", "libro", "hojas", "pluma", "lapiz", "borrador", "cuaderno", "escuela", "maestro", "alumnos", "clase", "leccion", "tarea", "examen", "nota", "grado", "titulo", "fiesta", "musica", "baile", "canto", "guitarra", "piano", "tambor", "flauta", "sonido", "ritmo", "melodia", "armonia", "silencio", "fuente", "laguna", "cascada", "cerros", "prados", "campos", "granja", "animal", "perros", "gatos", "peces", "tigre", "leones", "osos", "lobos", "zorros", "ciervo", "caballo", "burro", "vacas", "ovejas", "gallina", "patos", "cerdo", "conejo", "hormiga", "abeja", "mosca", "grillo", "saltamontes", "mariposa", "escarabajo", "araña", "serpiente", "lagarto", "rana", "sapo", "tortuga", "cocodrilo", "ballena", "pulpo", "medusa", "coral", "ostra", "cangrejo", "islas", "costas", "olas", "mareas", "arena", "roca", "faro", "puerto", "nave", "velero", "remo", "ancla", "buzos", "tesoro", "mapas", "reloj", "hora", "minuto", "semana", "meses", "año", "siglo", "pasado", "futuro", "ayer", "hoy", "mañana", "noche", "dawn", "tarde", "sol", "calor", "hielo", "fuego", "ceniza", "humo", "sombra", "luz", "rayo", "tormenta", "niebla", "charco", "pozo", "riego", "cosecha"];

const ahorcado = {};

plugin.run = async (m, { client, chat }) => {
  if (ahorcado[m.sender]) return client.sendText(m.chat, txt.gameAlready, m);

  const palabra = elegirAlAzar(palabras);
  const oculta = palabra.replace(/./g, "_ ");
  const intentos = 8;

  client.sendText(m.chat, `*[🪢] AHORCADO:*\n* ${oculta}\n\nTienes *${intentos}* intentos. Escribe una letra para adivinar.`, m).then((enviado) => marcarMensajeDeJuego(enviado?.key?.id, m.chat));

  ahorcado[m.sender] = {
    chat: m.chat,
    palabra,
    oculta: oculta.split(" "),
    intentos,
    letrasProbadas: [],
    timeout: setTimeout(() => {
      if (ahorcado[m.sender]) {
        const resumen = juegoTerminado(m.chat, null, { nombre: "ahorcado" });
        client.sendText(m.chat, `*[⏳] ¡Tiempo agotado!*\n\nLa palabra era: *${palabra}*${resumen}`, m).catch(console.error);
        delete ahorcado[m.sender];
      }
    }, 180000), // 3 minutes to complete the word
  };
};

plugin.before = async (m, { client }) => {
  if (!ahorcado[m.sender]) return;
  const juego = ahorcado[m.sender];
  // The game lives in one chat: whatever the player writes in other groups or in private doesn't count.
  if (m.chat !== juego.chat) return;
  // let commands (.play, etc.) and text-less messages through
  if (!m.text || globalThis.prefix.some((p) => m.text.startsWith(p))) return;

  const letra = m.text.toLowerCase().trim();
  // Long messages (ordinary chat) are ignored; it only speaks up if they sent a single non-letter character.
  if (letra.length !== 1) return;
  if (!/^[a-záéíóúüñ]$/.test(letra)) return client.sendText(m.chat, txt.ahorcadoLetra, m);
  if (juego.letrasProbadas.includes(letra)) return m.react("❗");

  juego.letrasProbadas.push(letra);
  let encontrada = false;

  for (let i = 0; i < juego.palabra.length; i++) {
    if (juego.palabra[i] === letra) {
      juego.oculta[i] = letra;
      encontrada = true;
    }
  }

  if (!encontrada) juego.intentos--;

  if (juego.intentos <= 0) {
    const resumen = juegoTerminado(m.chat, null, { nombre: "ahorcado" });
    client.sendText(m.chat, `*[💀] ¡PERDISTE!*\n\nLa palabra era: *${juego.palabra}*${resumen}`, m);
    clearTimeout(juego.timeout);
    delete ahorcado[m.sender];
    return;
  }

  if (!juego.oculta.includes("_")) {
    const resumen = juegoTerminado(m.chat, m.sender, { nombre: "ahorcado" });
    client.sendText(m.chat, txt.gameSuccess + resumen, m);
    clearTimeout(juego.timeout);
    delete ahorcado[m.sender];
    return;
  }

  client.sendText(m.chat, `*[🪢] AHORCADO:*\n\n${juego.oculta.join(" ")}\n\nIntentos restantes: *${juego.intentos}*\nLetras usadas: ${juego.letrasProbadas.join(", ")}`, m).then((enviado) => marcarMensajeDeJuego(enviado?.key?.id, m.chat));
};

export default plugin;
