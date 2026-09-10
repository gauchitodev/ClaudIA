import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

let P, FRASES;
before(async () => {
  await prepararBase("orsi");
  ({ default: P, FRASES } = await import("../plugins/fun-orsi.js"));
});

test(".orsi contesta con una de sus frases, y con el tiempo salen todas", async () => {
  assert.deepEqual(FRASES, ["No se", "Estamos analizando", "Es un caso aislado", "Acá el tema de fondo es la violencia", "lo que pasa es que los centros de educación necesitan centros multidisciplinarios y en esa época", "Se está conversando hace muuuuchos meses", "se habla mucho, pero se juega callado", "es el destino del país el que está en juego", "¿Un mensaje para Colombia Presidente, por el terremoto?: Eso, dejeme analizar un poco mejor los detalles, gracias.", "Este, eete, este es mi equipo, y lo respaldo cada vez más, si hay algo que estoy conforme y tranquilo, es que tengo una barra que trabaja y trabaja todos los días, y corregimos las lineas cuando las cosas no funcionan bien, así que por ahí, descontado, ustedes habrán visto que yo ni respondo, ni por redes, ni, por lo general estas cosas, ehhh, creo que están, en la medida qué, la gente continúe en sus lugares, en sus cargos, es porque merecen toda mi confianza, y tengo una barra que responde.", "Este, eete, este es mi equipo.", "Normalmente por lo general cuando hay descuentos yo me tiro de cabeza.", "Acá está faltando lo que está faltando", "No responsabilicemos a las instituciones de algo que es mucho más profundo."]);
  const vistas = new Set();
  for (let i = 0; i < 300; i++) {
    await P.run({ chat: G, sender: "111@lid" }, { client: globalThis.client });
    const texto = ultimoEnviado().msg.text;
    assert.ok(FRASES.includes(texto), `frase inesperada: ${texto}`);
    vistas.add(texto);
  }
  assert.equal(vistas.size, FRASES.length, "en 300 tiradas tienen que salir las catorce");
});
