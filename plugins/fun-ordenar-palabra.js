import { juegoTerminado } from "../lib/urucoins.js";
import { abrirJuego, limpiarRespuesta } from "../lib/juego-rapido.js";
import { elegirAlAzar } from "../lib/azar.js";
import { esComando } from "../lib/comandos.js";
import txt from "../lib/strings.js";
const plugin = {};
plugin.cmd = ["ordenapalabra", "ordenarpalabra", "ordenar"];
plugin.juego = true;
plugin.botAdmin = true;

// The words, spelled as they're written (the answer is compared without accents, lib/juego-rapido.js: "arbol" and
// "árbol" both count). Exported for the tests.
export const PALABRAS = ["sol", "casa", "perro", "gato", "luz", "río", "árbol", "flor", "mesa", "silla", "puerta", "ventana", "camino", "cielo", "nube", "estrella", "luna", "día", "noche", "hora", "minuto", "segundo", "reloj", "libro", "papel", "lápiz", "pluma", "cuaderno", "escuela", "maestro", "alumno", "clase", "tarea", "juego", "pelota", "carro", "bici", "calle", "ciudad", "pueblo", "montaña", "valle", "lago", "mar", "playa", "arena", "roca", "piedra", "bosque", "hoja", "rama", "tronco", "fruta", "manzana", "naranja", "banana", "uva", "pera", "mango", "sandía", "comida", "pan", "agua", "leche", "jugo", "café", "té", "sopa", "carne", "pescado", "arroz", "frijol", "huevo", "sal", "azúcar", "torta", "helado", "dulce", "chocolate", "galletas", "amigo", "familia", "madre", "padre", "hermano", "hermana", "abuelo", "abuela", "tío", "tía", "primo", "vecino", "persona", "niño", "niña", "hombre", "mujer", "risa", "amor", "felicidad", "zapato", "camisa", "pantalón", "sombrero", "bufanda", "guante", "cinturón", "bolsa", "mochila", "remera", "falda", "vestido", "chaqueta", "abrigo", "calcetín", "lentes", "anillo", "collar", "pulsera", "arete", "cama", "almohada", "sábana", "cobija", "lámpara", "espejo", "alfombra", "cortina", "techo", "piso", "cocina", "estufa", "sartén", "cuchara", "tenedor", "cuchillo", "plato", "vaso", "taza", "servilleta", "jardín", "planta", "semilla", "tierra", "regadera", "pala", "maceta", "césped", "baila", "canción", "música", "guitarra", "piano", "tambor", "flauta", "baile", "cine", "teatro", "pintura", "color", "rojo", "azul", "verde", "amarillo", "blanco", "negro", "gris", "rosa", "morado", "naranjo", "viaje", "tren", "avión", "barco", "bus", "taxista", "puente", "rioja", "isla", "volcán", "lluvia", "viento", "nieve", "trueno", "rayo", "solana", "calor", "frío", "niebla", "humedad", "sueño", "despertar", "cansancio", "energía", "salud", "doctor", "enfermo", "medicina", "rueda", "suerte"];

const ordenarPalabra = {};

plugin.run = async (m, { client, chat }) => {
  const palabra = elegirAlAzar(PALABRAS);
  const desordenada = palabra
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");

  // The chat is taken before the word goes out, and only this game's timer can end it: see lib/juego-rapido.js.
  const abierto = await abrirJuego(ordenarPalabra, m.chat, {
    nombre: "ordenar",
    juego: { palabra },
    enviar: () => client.sendText(m.chat, `*[🔠] Ordena la palabra:*\n* ${desordenada}\n\n*[❗] RESPONDE A ESTE MENSAJE* con la palabra correcta.\n*[⏱️]* Tienen 30 segundos para responder.`, m),
    alVencer: () => {
      const resumen = juegoTerminado(m.chat, null, { nombre: "ordenar" });
      client.sendText(m.chat, `*[⏳] ¡TIEMPO!*\n\nLa palabra correcta era: *${palabra}*${resumen}`, m).catch(console.error);
    },
  });
  if (!abierto) return client.sendText(m.chat, txt.gameAlready, m);
};

plugin.before = async (m, { client }) => {
  if (!ordenarPalabra[m.chat]) return;
  const juego = ordenarPalabra[m.chat];
  if (!m.quoted || m.quoted.id !== juego.mensajeId) return;
  // A command quoting the question isn't an answer (lib/comandos.js), as in the riddles (plugins/fun-acertijos.js).
  if (esComando(m.text)) return;

  // With or without accents, upper or lower case: what counts is the letters' order.
  if (limpiarRespuesta(m.text) === limpiarRespuesta(juego.palabra)) {
    const resumen = juegoTerminado(m.chat, m.sender, { nombre: "ordenar" });
    client.sendText(m.chat, txt.gameSuccess + resumen, m);
    clearTimeout(ordenarPalabra[m.chat].timeout);
    delete ordenarPalabra[m.chat];
  } else {
    m.react("❌");
  }
};

export default plugin;
