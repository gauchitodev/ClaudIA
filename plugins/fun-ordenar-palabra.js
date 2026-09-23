import { juegoIniciado, juegoTerminado } from "../lib/urucoins.js";
import { abrirJuego } from "../lib/juego-rapido.js";
import { elegirAlAzar } from "../lib/azar.js";
const plugin = {};
plugin.cmd = ["ordenapalabra", "ordenarpalabra", "ordenar"];
plugin.juego = true;
plugin.botAdmin = true;

// Lista de palabras
const palabras = ["sol", "casa", "perro", "gato", "luz", "rio", "arbol", "flor", "mesa", "silla", "puerta", "ventana", "camino", "cielo", "nube", "estrella", "luna", "dia", "noche", "hora", "minuto", "segundo", "reloj", "libro", "papel", "lapiz", "pluma", "cuaderno", "escuela", "maestro", "alumno", "clase", "tarea", "juego", "pelota", "carro", "bici", "calle", "ciudad", "pueblo", "montaña", "valle", "lago", "mar", "playa", "arena", "roca", "piedra", "bosque", "hoja", "rama", "tronco", "fruta", "manzana", "naranja", "banana", "uva", "pera", "mango", "sandia", "comida", "pan", "agua", "leche", "jugo", "cafe", "te", "sopa", "carne", "pescado", "arroz", "frijol", "huevo", "sal", "azucar", "torta", "helado", "dulce", "chocolate", "galletas", "amigo", "familia", "madre", "padre", "hermano", "hermana", "abuelo", "abuela", "tio", "tia", "primo", "vecino", "persona", "niño", "niña", "hombre", "mujer", "risa", "amor", "felicidad", "zapato", "camisa", "pantalon", "sombrero", "bufanda", "guante", "cinturon", "bolsa", "mochila", "remera", "falda", "vestido", "chaqueta", "abrigo", "calcetin", "lentes", "anillo", "collar", "pulsera", "arete", "cama", "almohada", "sabana", "cobija", "lampara", "espejo", "alfombra", "cortina", "techo", "piso", "cocina", "estufa", "sarten", "cuchara", "tenedor", "cuchillo", "plato", "vaso", "taza", "servilleta", "jardin", "planta", "semilla", "tierra", "regadera", "pala", "maceta", "cesped", "baila", "cancion", "musica", "guitarra", "piano", "tambor", "flauta", "baile", "cine", "teatro", "pintura", "color", "rojo", "azul", "verde", "amarillo", "blanco", "negro", "gris", "rosa", "morado", "naranjo", "viaje", "tren", "avion", "barco", "bus", "taxista", "puente", "rioja", "isla", "volcan", "lluvia", "viento", "nieve", "trueno", "rayo", "solana", "calor", "frio", "niebla", "humedad", "sueno", "despertar", "cansancio", "energia", "salud", "doctor", "enfermo", "medicina", "rueda", "suerte"];

const ordenarPalabra = {};

plugin.run = async (m, { client, chat }) => {
  const palabra = elegirAlAzar(palabras);
  const desordenada = palabra
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");

  // The chat is taken before the word goes out, and only this game's timer can end it: see lib/juego-rapido.js.
  const abierto = await abrirJuego(ordenarPalabra, m.chat, {
    juego: { palabra },
    enviar: () => client.sendText(m.chat, `*[🔠] Ordena la palabra:*\n* ${desordenada}\n\n*[❗] RESPONDE A ESTE MENSAJE* con la palabra correcta.\n*[⏱️]* Tienen 30 segundos para responder.`, m),
    alVencer: () => {
      const resumen = juegoTerminado(m.chat, null);
      client.sendText(m.chat, `*[⏳] ¡TIEMPO!*\n\nLa palabra correcta era: *${palabra}*${resumen}`, m).catch(console.error);
    },
  });
  if (!abierto) return client.sendText(m.chat, txt.gameAlready, m);
  juegoIniciado(m.chat, "ordenar");
};

plugin.before = async (m, { client }) => {
  if (!ordenarPalabra[m.chat]) return;
  const juego = ordenarPalabra[m.chat];
  if (!m.quoted || m.quoted.id !== juego.mensajeId) return;

  const respuestaUsuario = m.text.toLowerCase().trim();

  if (respuestaUsuario === juego.palabra) {
    const resumen = juegoTerminado(m.chat, m.sender);
    client.sendText(m.chat, txt.gameSuccess + resumen, m);
    clearTimeout(ordenarPalabra[m.chat].timeout);
    delete ordenarPalabra[m.chat];
  } else {
    m.react("❌");
  }
};

export default plugin;
