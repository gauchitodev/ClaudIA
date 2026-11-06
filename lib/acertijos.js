// The riddles (.acertijo, plugins/fun-acertijos.js): the bank, how an answer is read, and which riddle comes next.
// The answer used to be compared whole, article included, with a margin for typos as long as the answer: "pez" lost
// against "un pez", and so did almost every bare noun, since every answer carries its article. Now both ends are
// cleaned the same way (no article, accents or signs), the margin goes by the cleaned word, and the riddles with more
// than one fair answer take the others. A riddle doesn't come back while it's among the group's latest.
import { limpiarRespuesta } from "./juego-rapido.js";

export const ACERTIJO = {
  INTENTOS: 3, // per person and riddle: room for a typo, not for trying everything until one hits
  RECIENTES: 20, // riddles remembered per group, so the same one doesn't come back right away
};

// So the tests hand over the dice.
export const _dep = { azar: Math.random };

// "otras" are the other answers that are fair for that riddle: what its words also describe (a chair has four legs
// too) and the names used here (palta, choclo, barrilete). The singular and the plural count on their own.
export const ACERTIJOS = [
  { pregunta: "Tengo teclas blancas y negras, y cuando me tocan, canto. ¿Qué soy?", respuesta: "un piano", pista: "Es un instrumento musical." },
  { pregunta: "Vuelo sin alas, lloro sin ojos. ¿Qué soy?", respuesta: "una nube", pista: "Aparezco en el cielo." },
  { pregunta: "Cuanto más le sacás, más grande es. ¿Qué es?", respuesta: "un agujero", otras: ["hoyo", "pozo"], pista: "Se forma cuando excavás en la tierra." },
  { pregunta: "Blanca por dentro, verde por fuera. Si quieres que te lo diga, espera.", respuesta: "la pera", pista: "Es una fruta." },
  { pregunta: "No es cama ni es león, y desaparece en cualquier rincón.", respuesta: "el camaleón", pista: "Puede cambiar de color." },
  { pregunta: "Si me nombrás, desaparezco. ¿Qué soy?", respuesta: "el silencio", pista: "Está cuando nadie habla." },
  { pregunta: "Tengo ojos de carbón y nariz de zanahoria, y cuando sale el sol, me derrito. ¿Qué soy?", respuesta: "un muñeco de nieve", pista: "Solo existo en invierno." },
  { pregunta: "Cien hermanos juntos en una cajita: con un raspón se les prende la cabecita.", respuesta: "los fósforos", otras: ["cerillas", "cerillos"], pista: "Sirven para encender fuego." },
  { pregunta: "Es más larga cuando es joven, y más corta cuando es vieja. ¿Qué es?", respuesta: "una vela", pista: "Se usa para dar luz." },
  { pregunta: "En el campo me crié, atada con verdes lazos, y aquel que llora por mí me está partiendo en pedazos.", respuesta: "la cebolla", pista: "Va en casi todas las comidas." },
  { pregunta: "Lana sube, lana baja. ¿Qué es?", respuesta: "la navaja", otras: ["cortaplumas"], pista: "Corta, y se dobla para llevarla en el bolsillo." },
  { pregunta: "Tiene dientes y no muerde. ¿Qué es?", respuesta: "un peine", otras: ["serrucho", "sierra", "tenedor", "cierre"], pista: "Se usa en el pelo." },
  { pregunta: "Siempre sube pero nunca baja. ¿Qué es?", respuesta: "la edad", otras: ["años"], pista: "A todos nos aumenta cada año." },
  { pregunta: "Tengo agujas y no sé coser, tengo números y no sé leer. ¿Qué soy?", respuesta: "un reloj", pista: "Mide el tiempo." },
  { pregunta: "Tiene cuatro patas y no camina. ¿Qué es?", respuesta: "una mesa", otras: ["silla", "cama", "sillón", "banco", "mueble"], pista: "Es un mueble." },
  { pregunta: "Todos pasan por mí, pero yo nunca paso por nadie. ¿Qué soy?", respuesta: "la calle", otras: ["puerta", "camino", "puente", "vereda"], pista: "Por acá circulan los autos." },
  { pregunta: "Puedo correr, pero nunca camino. Tengo boca, pero no hablo. ¿Qué soy?", respuesta: "un río", otras: ["arroyo"], pista: "Su agua corre todo el tiempo." },
  { pregunta: "Me podés romper sin tocarme ni golpearme. ¿Qué soy?", respuesta: "una promesa", otras: ["palabra", "silencio", "corazón"], pista: "Si no cumplís con tu palabra, se rompe." },
  { pregunta: "Es tuyo, pero los demás lo usan más que vos. ¿Qué es?", respuesta: "tu nombre", pista: "Es tu identidad." },
  { pregunta: "Siempre estoy en el medio del mar. ¿Qué soy?", respuesta: "la letra A", otras: ["a"], pista: "Es una letra." },
  { pregunta: "Tengo ciudades pero no casas, montañas pero no árboles, agua pero no peces. ¿Qué soy?", respuesta: "un mapa", otras: ["atlas", "planisferio"], pista: "Se usa para orientarse." },
  { pregunta: "Tengo un solo ojo, pero no puedo ver. ¿Qué soy?", respuesta: "una aguja", pista: "Sirve para coser." },
  { pregunta: "Cuanto más seca, más mojada queda. ¿Qué es?", respuesta: "una toalla", pista: "Se usa después de bañarse." },
  { pregunta: "Tiene orejas largas y salta mucho. ¿Qué es?", respuesta: "un conejo", otras: ["liebre"], pista: "Come zanahorias." },
  { pregunta: "Tengo muchos números pero no sé contar. ¿Qué soy?", respuesta: "un calendario", otras: ["almanaque", "reloj"], pista: "Se usa para organizar los días." },
  { pregunta: "Tengo cola pero no soy animal, tengo papel pero no soy libro. ¿Qué soy?", respuesta: "una cometa", otras: ["barrilete", "papalote"], pista: "Se remonta con el viento." },
  { pregunta: "Si me tenés, querés compartirme. Si me compartís, ya no me tenés. ¿Qué soy?", respuesta: "un secreto", pista: "Hay que guardarlo para que siga existiendo." },
  { pregunta: "Siempre está en el agua y nunca se moja. ¿Qué es?", respuesta: "la sombra del pez", otras: ["sombra", "reflejo"], pista: "Es la proyección de algo." },
  { pregunta: "Se estira y se encoge, pero siempre sigue igual. ¿Qué es?", respuesta: "un resorte", otras: ["elástico", "gomita", "goma"], pista: "Hay en algunos colchones." },
  { pregunta: "Me tiran cuando me necesitan y me levantan cuando ya no me quieren. ¿Qué soy?", respuesta: "un ancla", pista: "Se usa en los barcos." },
  { pregunta: "Siempre tengo hambre, y me muero cuando bebo agua. ¿Qué soy?", respuesta: "el fuego", otras: ["fogata", "llama"], pista: "Lo necesitás para el asado." },
  { pregunta: "Me pisan todo el día y nunca me quejo. ¿Qué soy?", respuesta: "la alfombra", otras: ["piso", "suelo", "felpudo", "pasto", "baldosa"], pista: "Está en el suelo de muchas casas." },
  { pregunta: "Cuantos más das, más dejás atrás. ¿Qué son?", respuesta: "los pasos", otras: ["huellas", "pisadas"], pista: "Se dan con los pies." },
  { pregunta: "Tiene un solo pie y es redonda. ¿Qué es?", respuesta: "una copa", otras: ["hongo"], pista: "Se usa para brindar." },
  { pregunta: "Tiene cuello pero no tiene cabeza. ¿Qué es?", respuesta: "una botella", otras: ["camisa", "jarra", "remera"], pista: "Guarda líquidos." },
  { pregunta: "Me abren cuando llueve y me cierran cuando para. ¿Qué soy?", respuesta: "un paraguas", otras: ["sombrilla"], pista: "Se lleva en la mano los días feos." },
  { pregunta: "Tengo hojas sin ser árbol, te hablo sin tener voz, y si me abrís no me quejo. ¿Qué soy?", respuesta: "un libro", otras: ["cuaderno", "revista"], pista: "Hay muchos en una biblioteca." },
  { pregunta: "Siempre está en el medio de la noche. ¿Qué es?", respuesta: "la letra C", otras: ["c"], pista: "Es una letra." },
  { pregunta: "Cuanto más limpio, más sucio me pongo. ¿Qué soy?", respuesta: "un trapo", otras: ["esponja", "rejilla", "repasador", "jabón"], pista: "Se usa para limpiar." },
  { pregunta: "Tiene alas pero no vuela. ¿Qué es?", respuesta: "un ventilador", otras: ["molino", "pingüino", "avestruz", "gallina"], pista: "Te refresca en verano." },
  { pregunta: "Vuelo de noche, pero no soy un avión. ¿Qué soy?", respuesta: "un murciélago", otras: ["lechuza", "búho", "mosquito", "polilla"], pista: "Duerme cabeza abajo." },
  { pregunta: "Cuanto más corrés, más lejos estoy. ¿Qué soy?", respuesta: "el horizonte", pista: "Lo ves donde el cielo toca el mar." },
  { pregunta: "Solo me podés ver en la oscuridad. ¿Qué soy?", respuesta: "las estrellas", otras: ["luna", "luciérnaga"], pista: "Brillan en el cielo." },
  { pregunta: "Aunque tenga barba, no es hombre. ¿Qué es?", respuesta: "el choclo", otras: ["maíz", "chivo", "cabra", "ajo"], pista: "Con sus granos se hace el pop." },
  { pregunta: "Tiene pico pero no es un pájaro. ¿Qué es?", respuesta: "la pava", otras: ["jarra", "tetera", "regadera", "montaña", "cerro"], pista: "Con ella se calienta el agua del mate." },
  { pregunta: "Si intentás agarrarla, se rompe. ¿Qué es?", respuesta: "una burbuja", otras: ["pompa", "pompa de jabón"], pista: "Es frágil y transparente." },
  { pregunta: "Repito todo lo que decís, pero nunca hablo primero. ¿Qué soy?", respuesta: "el eco", otras: ["loro"], pista: "Se escucha en las montañas y en los lugares vacíos." },
  { pregunta: "Siempre va para adelante y nunca vuelve. ¿Qué es?", respuesta: "el tiempo", otras: ["vida", "río"], pista: "No se puede volver atrás en él." },
  { pregunta: "Siempre da vueltas y nunca se cansa. ¿Qué es?", respuesta: "una rueda", otras: ["reloj", "calesita", "ventilador", "tierra", "planeta"], pista: "Los autos tienen cuatro." },
  { pregunta: "Aunque tenga escamas, no es pez. ¿Qué es?", respuesta: "una serpiente", otras: ["víbora", "culebra", "lagarto", "lagartija", "cocodrilo", "yacaré"], pista: "No tiene patas." },
  { pregunta: "Vive en el agua y, si lo sacás de ella, se muere. ¿Qué es?", respuesta: "un pez", otras: ["pescado", "pececito", "peces"], pista: "Nada en los ríos y en el mar." },
  { pregunta: "Cuanto más hay, menos se ve. ¿Qué es?", respuesta: "la oscuridad", otras: ["niebla", "neblina", "humo", "noche"], pista: "Pasa cuando apagás la luz." },
  { pregunta: "Oro parece, plata no es. ¿Qué es?", respuesta: "el plátano", otras: ["banana"], pista: "Es una fruta amarilla." },
  { pregunta: "Agua pasa por mi casa, cate de mi corazón. ¿Qué es?", respuesta: "el aguacate", otras: ["palta"], pista: "Es verde, con un carozo grande adentro." },
  { pregunta: "Lleva años en el mar y todavía no sabe nadar. ¿Qué es?", respuesta: "la arena", otras: ["piedra", "roca"], pista: "Está en la playa." },
  { pregunta: "Una señorita muy aseñorada, siempre va en coche y siempre está mojada.", respuesta: "la lengua", pista: "Te ayuda a sentir los sabores." },
  { pregunta: "Sube llena y baja vacía; si no se apura, la sopa se enfría.", respuesta: "la cuchara", pista: "Está en la mesa a la hora de comer." },
  { pregunta: "Redondo, redondo, barril sin fondo. ¿Qué es?", respuesta: "el anillo", otras: ["sortija", "alianza", "aro"], pista: "Se lleva en un dedo." },
  { pregunta: "Chiquito como un ratón, cuida la casa como un león. ¿Qué es?", respuesta: "el candado", otras: ["llave", "cerradura"], pista: "Cierra puertas y portones." },
  { pregunta: "Salgo de la sala, voy a la cocina, meneando la cola como una gallina. ¿Qué es?", respuesta: "la escoba", otras: ["escobillón"], pista: "Se usa para limpiar el piso." },
  { pregunta: "Dos niñas asomaditas, cada una a su ventana, lo ven y lo cuentan todo sin decir una palabra.", respuesta: "los ojos", pista: "Los tenés en la cara." },
  { pregunta: "Vuela sin alas, silba sin boca, pega sin manos y no se ve. ¿Qué es?", respuesta: "el viento", otras: ["aire"], pista: "Mueve las hojas de los árboles." },
  { pregunta: "Una cajita blanca como la cal: todos la saben abrir, nadie la sabe cerrar.", respuesta: "el huevo", pista: "Lo pone la gallina." },
  { pregunta: "Aparezco de noche, a veces entera y a veces partida, y de día me escondo. ¿Qué soy?", respuesta: "la luna", pista: "Tiene fases." },
  { pregunta: "Tiene cabeza redonda, sin nariz, ojos ni frente, y su cuerpo se compone tan solo de blancos dientes.", respuesta: "el ajo", pista: "Se usa para cocinar, y dicen que espanta a los vampiros." },
  { pregunta: "Viste de chaleco blanco y también de negro frac; es un ave que no vuela, pero nada. ¿Qué será?", respuesta: "el pingüino", pista: "Vive donde hace mucho frío." },
  { pregunta: "Llevo mi casa a cuestas, camino sin tener patas, y voy dejando mi huella con un hilito de plata.", respuesta: "el caracol", pista: "Sale cuando llueve." },
  { pregunta: "Una vieja con un diente que llama a toda la gente. ¿Qué es?", respuesta: "la campana", pista: "Suena en las iglesias." },
  { pregunta: "Tiene ojos y no ve, tiene agua y no la bebe, tiene carne y no la come, tiene barba y no es hombre.", respuesta: "el coco", pista: "Crece en las palmeras." },
  { pregunta: "Soy un palito muy derechito, y encima de la frente tengo un mosquito.", respuesta: "la letra i", otras: ["i"], pista: "Es una letra." },
  { pregunta: "Dos pinzas tengo, para atrás camino; de mar o de río, en el agua vivo.", respuesta: "el cangrejo", pista: "Camina de costado." },
];

// Words that go before the thing and say nothing about it: the article, a possessive, or "es" ("es un pez").
const DE_MAS = new Set(["el", "la", "los", "las", "lo", "un", "una", "unos", "unas", "mi", "mis", "tu", "tus", "su", "sus", "es", "son"]);

// An answer as it's compared: cleaned like the other quick games' (lib/juego-rapido.js) and without what goes before
// the thing. A lone word is kept as is: "la" alone isn't an empty answer that something could match.
export function normalizarRespuesta(texto) {
  const palabras = limpiarRespuesta(texto).split(" ").filter(Boolean);
  while (palabras.length > 1 && DE_MAS.has(palabras[0])) palabras.shift();
  return palabras.join(" ");
}

// Edits that still count as a word of the answer: none up to four letters ("paz" isn't "pez", "ojo" isn't "río"), a
// fifth of the letters past that.
const margenDe = (valida) => {
  const letras = valida.replace(/ /g, "").length;
  return letras <= 4 ? 0 : Math.floor(letras * 0.2);
};
const singularOPlural = (a, b) => a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;

function distancia(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length];
}

// One answer against one valid answer, word by word, each word with its own margin: over the whole phrase, "letra b"
// was one edit away from "letra a", inside the margin of its six letters.
function parecida(intento, valida) {
  if (intento === valida || singularOPlural(intento, valida)) return true;
  const a = intento.split(" ");
  const b = valida.split(" ");
  return a.length === b.length && a.every((p, i) => p === b[i] || singularOPlural(p, b[i]) || distancia(p, b[i]) <= margenDe(b[i]));
}

// Whether what someone wrote answers the riddle: its answer or one of the others, in the singular or the plural, with
// or without its article, within the margin for typos.
export function esRespuesta(acertijo, texto) {
  const intento = normalizarRespuesta(texto);
  if (!intento) return false;
  return [acertijo.respuesta, ...(acertijo.otras || [])].map(normalizarRespuesta).some((valida) => parecida(intento, valida));
}

// The next riddle for a group: at random, among those not asked lately there. Kept here, so a reload of the plugin
// doesn't forget them; a restart does, like the trivia's (lib/trivia.js).
const recientes = new Map(); // chat -> indices of the latest riddles
export function elegirAcertijo(chat) {
  const hechos = recientes.get(chat) || [];
  const todos = ACERTIJOS.map((_, i) => i);
  const libres = todos.filter((i) => !hechos.includes(i));
  const lista = libres.length ? libres : todos;
  const i = lista[Math.min(lista.length - 1, Math.floor(_dep.azar() * lista.length))];
  hechos.push(i);
  if (hechos.length > ACERTIJO.RECIENTES) hechos.shift();
  recientes.set(chat, hechos);
  return ACERTIJOS[i];
}
// For the tests.
export const olvidarRecientes = () => recientes.clear();
export const recientesDe = (chat) => (recientes.get(chat) || []).map((i) => ACERTIJOS[i]);
