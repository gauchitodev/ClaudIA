import { juegoIniciado, juegoTerminado } from "../lib/urucoins.js";
import { abrirJuego } from "../lib/juego-rapido.js";
import { elegirAlAzar } from "../lib/azar.js";
const plugin = {};
plugin.cmd = ["acertijo", "acertijos"];
plugin.juego = true;
plugin.botAdmin = true;

// game state
const response = [
  { pregunta: "Tengo llaves pero no abro puertas. ¿Qué soy?", respuesta: "un piano", pista: "Es un instrumento musical." },
  { pregunta: "Vuelo sin alas, lloro sin ojos. ¿Qué soy?", respuesta: "una nube", pista: "Aparezco en el cielo." },
  { pregunta: "Cuanto más me quitas, más grande soy. ¿Qué soy?", respuesta: "un agujero", pista: "Se forma cuando excavas en la tierra." },
  { pregunta: "Blanca por dentro, verde por fuera. Si quieres que te lo diga, espera.", respuesta: "la pera", pista: "Es una fruta." },
  { pregunta: "No es cama ni es león y desaparece en cualquier rincón.", respuesta: "el camaleón", pista: "Puede cambiar de color." },
  { pregunta: "Si me nombras, desaparezco. ¿Qué soy?", respuesta: "el silencio", pista: "Ocurre cuando nadie habla." },
  { pregunta: "Tengo ojos pero no veo, agua pero no bebo. ¿Qué soy?", respuesta: "un muñeco de nieve", pista: "Solo existo en invierno." },
  { pregunta: "Cien hermanos juntos en un solo estuche, si no los tocas, ellos no murmuran.", respuesta: "los fósforos", pista: "Sirven para encender fuego." },
  { pregunta: "Es más largo cuando es joven, y más corto cuando es viejo. ¿Qué es?", respuesta: "una vela", pista: "Se usa para dar luz." },
  { pregunta: "Me quitan la piel y no lloro, pero si me raspan, sí lloro. ¿Qué soy?", respuesta: "la cebolla", pista: "Hace llorar a quien la corta." },
  { pregunta: "Lana sube, lana baja. ¿Qué es?", respuesta: "la persiana", pista: "Se encuentra en las ventanas." },
  { pregunta: "Tiene dientes y no muerde. ¿Qué es?", respuesta: "un peine", pista: "Se usa en el cabello." },
  { pregunta: "Siempre sube pero nunca baja. ¿Qué es?", respuesta: "la edad", pista: "A todos nos aumenta cada año." },
  { pregunta: "Tiene agujas pero no cose. ¿Qué es?", respuesta: "un reloj", pista: "Mide el tiempo." },
  { pregunta: "Cuatro patas tiene, pero no anda. ¿Qué es?", respuesta: "una mesa", pista: "Se usa para comer o trabajar." },
  { pregunta: "Todos pasan por mí, pero yo nunca paso por nadie. ¿Qué soy?", respuesta: "una calle", pista: "Por aquí circulan los autos." },
  { pregunta: "Puedo correr, pero nunca caminar. Tengo una boca pero no puedo hablar. ¿Qué soy?", respuesta: "un río", pista: "Contengo agua y fluye constantemente." },
  { pregunta: "Me puedes romper sin tocarme ni golpearme. ¿Qué soy?", respuesta: "una promesa", pista: "Si no cumples con tu palabra, se rompe." },
  { pregunta: "Soy tuyo, pero los demás lo usan más que tú. ¿Qué soy?", respuesta: "tu nombre", pista: "Es tu identidad." },
  { pregunta: "Siempre estoy en medio del mar. ¿Qué soy?", respuesta: "la letra A", pista: "Es una letra." },
  { pregunta: "Si me usas, no me ves. ¿Qué soy?", respuesta: "el sueño", pista: "Lo necesitas para descansar." },
  { pregunta: "Tengo ciudades pero no casas, montañas pero no árboles, agua pero no peces. ¿Qué soy?", respuesta: "un mapa", pista: "Se usa para orientarse." },
  { pregunta: "Tengo un solo ojo, pero no puedo ver. ¿Qué soy?", respuesta: "una aguja", pista: "Sirve para coser." },
  { pregunta: "Cuanto más seco, más moja. ¿Qué es?", respuesta: "una toalla", pista: "Se usa después del baño." },
  { pregunta: "Soy alto cuando soy joven, y bajo cuando soy viejo. ¿Qué soy?", respuesta: "una vela", pista: "Se consume con fuego." },
  { pregunta: "Si tengo hambre, como; si tengo sed, bebo; si tengo sueño, duermo; si tengo frío, me abrigo. ¿Qué soy?", respuesta: "un ser humano", pista: "Es la especie más inteligente del planeta." },
  { pregunta: "Tiene orejas largas y salta mucho. ¿Qué es?", respuesta: "un conejo", pista: "Es un animal que come zanahorias." },
  { pregunta: "Vuelo sin moverme, lloro sin ojos. ¿Qué soy?", respuesta: "una nube", pista: "Produce la lluvia." },
  { pregunta: "Tengo muchos números pero no sé contar. ¿Qué soy?", respuesta: "un calendario", pista: "Se usa para organizar los días." },
  { pregunta: "Aunque tengas hambre, no me puedes comer. ¿Qué soy?", respuesta: "un plato", pista: "Sostiene la comida." },
  { pregunta: "Tengo cola pero no soy animal, tengo papel pero no soy libro. ¿Qué soy?", respuesta: "una cometa", pista: "Se vuela en el cielo." },
  { pregunta: "Si me tienes, quieres compartirme. Si me compartes, ya no me tienes. ¿Qué soy?", respuesta: "un secreto", pista: "Debe guardarse para que siga existiendo." },
  { pregunta: "Siempre en el agua y nunca mojado. ¿Qué es?", respuesta: "la sombra del pez", pista: "Es la proyección de algo." },
  { pregunta: "Voy de casa en casa, pero siempre estoy afuera. ¿Qué soy?", respuesta: "el timbre", pista: "Anuncia la llegada de alguien." },
  { pregunta: "Se estira y se encoge, pero siempre sigue igual. ¿Qué es?", respuesta: "un resorte", pista: "Se usa en algunos colchones." },
  { pregunta: "Tiene brazos, pero no puede abrazar. ¿Qué es?", respuesta: "un reloj", pista: "Mide el tiempo." },
  { pregunta: "Entre más me quitas, más grande soy. ¿Qué soy?", respuesta: "un agujero", pista: "Es lo opuesto a una montaña." },
  { pregunta: "Me lanzan cuando me necesitan, me recogen cuando ya no me quieren. ¿Qué soy?", respuesta: "un ancla", pista: "Se usa en los barcos." },
  { pregunta: "Cuanto más trabajo, menos me ves. ¿Qué soy?", respuesta: "la oscuridad", pista: "Ocurre cuando apagas la luz." },
  { pregunta: "Siempre tengo hambre y muero cuando bebo agua. ¿Qué soy?", respuesta: "el fuego", pista: "Lo necesitas para cocinar." },
  { pregunta: "Si me miras, no me ves. Si me escuchas, no me oyes. ¿Qué soy?", respuesta: "el pensamiento", pista: "Ocurre dentro de tu cabeza." },
  { pregunta: "Me pisan pero nunca me quejo. ¿Qué soy?", respuesta: "la alfombra", pista: "Está en el suelo de muchas casas." },
  { pregunta: "Si me nombras, me rompes. ¿Qué soy?", respuesta: "el silencio", pista: "Ocurre cuando no hay ruido." },
  { pregunta: "Siempre que voy, dejo algo atrás. ¿Qué soy?", respuesta: "las huellas", pista: "Se quedan en la arena o en la nieve." },
  { pregunta: "Tiene un solo pie y es redonda. ¿Qué es?", respuesta: "una copa", pista: "Se usa para beber." },
  { pregunta: "Tiene cuatro patas pero no puede caminar. ¿Qué es?", respuesta: "una silla", pista: "Sirve para sentarse." },
  { pregunta: "Tiene un cuello pero no cabeza. ¿Qué es?", respuesta: "una botella", pista: "Se usa para contener líquidos." },
  { pregunta: "Tiene ojos pero no puede ver. ¿Qué es?", respuesta: "una aguja", pista: "Sirve para coser." },
  { pregunta: "Me abren sin llave, me cierran sin llave. ¿Qué soy?", respuesta: "un paraguas", pista: "Se usa cuando llueve." },
  { pregunta: "No tiene boca pero siempre habla. ¿Qué es?", respuesta: "un libro", pista: "Puedes aprender mucho de él." },
  { pregunta: "Siempre está en el agua pero nunca se moja. ¿Qué es?", respuesta: "la sombra del pez", pista: "Sigue a un animal acuático." },
  { pregunta: "Siempre está en el medio de la noche. ¿Qué es?", respuesta: "la letra G", pista: "Es parte de una palabra." },
  { pregunta: "Si me cortas la cabeza, me vuelvo más grande. ¿Qué soy?", respuesta: "una almohada", pista: "Se usa para dormir." },
  { pregunta: "Mientras más quitas de mí, más grande soy. ¿Qué soy?", respuesta: "un agujero", pista: "Se forma cuando excavas." },
  { pregunta: "Tengo ciudades pero no casas, montañas pero no árboles, ríos pero no agua. ¿Qué soy?", respuesta: "un mapa", pista: "Te ayuda a no perderte." },
  { pregunta: "No soy un reloj, pero tengo manecillas. ¿Qué soy?", respuesta: "un cangrejo", pista: "Vive en la playa y camina de lado." },
  { pregunta: "Cuanto más me quitas, más grande me vuelvo. ¿Qué soy?", respuesta: "un agujero", pista: "Puede estar en el suelo o en la ropa." },
  { pregunta: "Tengo dientes pero no muerdo. ¿Qué soy?", respuesta: "un peine", pista: "Se usa en el cabello." },
  { pregunta: "Cuanto más limpio, más sucio me vuelvo. ¿Qué soy?", respuesta: "un trapo", pista: "Se usa para limpiar." },
  { pregunta: "Tiene alas pero no vuela. ¿Qué es?", respuesta: "un ventilador", pista: "Te refresca en los días calurosos." },
  { pregunta: "Vuelo de noche pero no soy un avión. ¿Qué soy?", respuesta: "un murciélago", pista: "Es un mamífero que duerme boca abajo." },
  { pregunta: "Cuanto más corres, más lejos estoy. ¿Qué soy?", respuesta: "el horizonte", pista: "Lo ves cuando miras al cielo." },
  { pregunta: "Nace verde, vive negra y muere blanca. ¿Qué es?", respuesta: "la aceituna", pista: "Se usa para hacer aceite." },
  { pregunta: "Me llenas para que pueda vaciarme. ¿Qué soy?", respuesta: "un vaso", pista: "Se usa para beber." },
  { pregunta: "Solo puedes verme en la oscuridad. ¿Qué soy?", respuesta: "las estrellas", pista: "Brillan en el cielo." },
  { pregunta: "Aunque tenga barba, no es hombre. ¿Qué es?", respuesta: "el maíz", pista: "Sus granos se usan para hacer palomitas." },
  { pregunta: "Tiene pico pero no es un pájaro. ¿Qué es?", respuesta: "una jarra", pista: "Sirve para contener líquidos." },
  { pregunta: "Mientras más le quitas, más grande es su espacio. ¿Qué es?", respuesta: "un túnel", pista: "Se usa para pasar a través de montañas." },
  { pregunta: "No se mueve pero siempre está en movimiento. ¿Qué es?", respuesta: "un río", pista: "Siempre fluye." },
  { pregunta: "Siempre se rompe si intentas sostenerlo. ¿Qué es?", respuesta: "una burbuja", pista: "Es frágil y transparente." },
  { pregunta: "Puedes oírme pero no puedes verme. ¿Qué soy?", respuesta: "el eco", pista: "Repite lo que dices." },
  { pregunta: "Siempre va en una dirección pero nunca regresa. ¿Qué es?", respuesta: "el tiempo", pista: "No puedes volver atrás en él." },
  { pregunta: "Siempre va hacia arriba pero nunca baja. ¿Qué es?", respuesta: "la edad", pista: "Nos pasa a todos con los años." },
  { pregunta: "Todos lo tienen pero nadie lo puede ver. ¿Qué es?", respuesta: "la sombra", pista: "Nos sigue a todas partes." },
  { pregunta: "Cuando me nombras, ya no existo. ¿Qué soy?", respuesta: "el silencio", pista: "Es la ausencia de sonido." },
  { pregunta: "Si lo dejas, se queda, si lo vendes, se va. ¿Qué es?", respuesta: "un barco", pista: "Flota en el agua." },
  { pregunta: "No es animal, pero tiene patas y bigotes. ¿Qué es?", respuesta: "una mesa", pista: "Es un mueble." },
  { pregunta: "Tiene cuernos y no es toro, tiene hojas y no es árbol. ¿Qué es?", respuesta: "un libro", pista: "Contiene historias y conocimiento." },
  { pregunta: "Siempre va en círculo pero nunca se detiene. ¿Qué es?", respuesta: "una rueda", pista: "Se encuentra en los autos." },
  { pregunta: "Tiene lomo pero no es animal. ¿Qué es?", respuesta: "un libro", pista: "Se encuentra en una biblioteca." },
  { pregunta: "Tiene una sola entrada y ninguna salida. ¿Qué es?", respuesta: "un túnel sin salida", pista: "No puedes atravesarlo completamente." },
  { pregunta: "Aunque tenga escamas, no es pez. ¿Qué es?", respuesta: "una serpiente", pista: "No tiene patas." },
  { pregunta: "Tiene un solo ojo y nunca parpadea. ¿Qué es?", respuesta: "una aguja", pista: "Se usa para coser." },
  { pregunta: "Cuanto más te alejas de mí, más pequeño me ves. ¿Qué soy?", respuesta: "una montaña", pista: "Es alta y firme." },
  { pregunta: "Vive en el agua, pero si la sacas de ella, muere. ¿Qué es?", respuesta: "un pez", pista: "Nada en los océanos." },
];

const acertijos = {};

plugin.run = async (m, { client, chat }) => {
  const acertijo = elegirAlAzar(response);
  // The chat is taken before the riddle goes out, and only this riddle's timer can end it: see lib/juego-rapido.js.
  const abierto = await abrirJuego(acertijos, m.chat, {
    juego: { pregunta: acertijo.pregunta, respuesta: acertijo.respuesta.toLowerCase() },
    enviar: () => client.sendText(m.chat, `*[🧠] Acertijo:*\n* ${acertijo.pregunta}\n\n*[💡] PISTA:* ${acertijo.pista}\n\n*[❗] RESPONDE A ESTE MENSAJE* con la respuesta..\n*[⏱️]* Tienen 30 segundos para adivinar.`, m),
    alVencer: () => {
      const resumen = juegoTerminado(m.chat, null);
      client.sendText(m.chat, `*[⏳] ¡TIEMPO!*\n\n*[🌟] La respuesta era:* ${acertijo.respuesta}${resumen}`, m).catch(console.error);
    },
  });
  if (!abierto) return client.sendText(m.chat, txt.gameAlready, m);
  juegoIniciado(m.chat, "acertijo");
};

plugin.before = async (m, { client }) => {
  // check whether a riddle is in play
  if (!acertijos[m.chat]) return;

  const juego = acertijos[m.chat];

  // check whether the message is an answer to the riddle
  if (!m.quoted || m.quoted.id !== juego.mensajeId) return;

  const respuestaUsuario = m.text.toLowerCase().trim();

  // compute the Levenshtein distance to allow a margin of error in answers
  const distancia = levenshteinDistance(respuestaUsuario, juego.respuesta);

  // Margin of error proportional to the answer's length (it used to be a flat 4 letters, and "un ojo" passed for "un río").
  const margen = Math.max(1, Math.floor(juego.respuesta.length * 0.2));
  if (respuestaUsuario === juego.respuesta || distancia <= margen) {
    const resumen = juegoTerminado(m.chat, m.sender);
    client.sendText(m.chat, txt.gameSuccess + resumen, m);
    clearTimeout(acertijos[m.chat].timeout);
    delete acertijos[m.chat];
  } else {
    m.react("❌");
  }
};

export default plugin;

// computes the Levenshtein distance between two strings
function levenshteinDistance(s1, s2) {
  const dp = Array.from({ length: s1.length + 1 }, (_, i) => Array(s2.length + 1).fill(i));
  for (let j = 1; j <= s2.length; j++) dp[0][j] = j;

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[s1.length][s2.length];
}
