import { randomInt } from "crypto";

// Some in his style, some his own words as the press reported them. The last three: on not travelling to the 2026
// World Cup (Ámbito), on Bukele at Búsqueda's breakfast (Caras y Caretas), and on the criticism of his UN speech
// (Ámbito).
export const FRASES = ["No se", "Estamos analizando", "Es un caso aislado", "Acá el tema de fondo es la violencia", "lo que pasa es que los centros de educación necesitan centros multidisciplinarios y en esa época", "Se está conversando hace muuuuchos meses", "se habla mucho, pero se juega callado", "es el destino del país el que está en juego", "¿Un mensaje para Colombia Presidente, por el terremoto?: Eso, dejeme analizar un poco mejor los detalles, gracias.", "Este, eete, este es mi equipo, y lo respaldo cada vez más, si hay algo que estoy conforme y tranquilo, es que tengo una barra que trabaja y trabaja todos los días, y corregimos las lineas cuando las cosas no funcionan bien, así que por ahí, descontado, ustedes habrán visto que yo ni respondo, ni por redes, ni, por lo general estas cosas, ehhh, creo que están, en la medida qué, la gente continúe en sus lugares, en sus cargos, es porque merecen toda mi confianza, y tengo una barra que responde.", "Este, eete, este es mi equipo.", "Normalmente por lo general cuando hay descuentos yo me tiro de cabeza.", "Acá está faltando lo que está faltando", "No responsabilicemos a las instituciones de algo que es mucho más profundo.", "El país tiene mil dolores de cabeza que tenemos que resolver", "Es un ejemplo para analizar", "A buen entendedor, pocas palabras."];

const plugin = {};
plugin.cmd = ["orsi"];

// .orsi → one of the quotes, at random
plugin.run = async (m, { client }) => {
  await client.sendText(m.chat, FRASES[randomInt(0, FRASES.length)], m);
};

export default plugin;
