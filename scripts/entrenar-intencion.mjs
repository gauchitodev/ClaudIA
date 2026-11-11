// Trains the classifier of lib/intencion.js and writes its weights, lib/intencion-modelo.json:
//   npm run intencion -- RUTA/mensajes.json            (measures, then trains with every message and writes)
//   npm run intencion -- RUTA/mensajes.json --medir    (measures only)
// mensajes.json is [{ texto, clase: "vender" | "comprar" | "nada", autor, fecha }], labelled by hand (README,
// "Entrenar el detector de intención"). It isn't in the repo and mustn't be: it's what people wrote in a group.
// What it prints first is how the bot would do on messages the model wasn't trained with
// (lib/intencion-entrenamiento.js): the rules of lib/compraventa.js alone, and with the model behind them at the
// threshold the bot uses.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { aArchivo, INTENCION } from "../lib/intencion.js";
import { entrenar, medir } from "../lib/intencion-entrenamiento.js";
import { detectarPublicacion, detectarSuelta } from "../lib/compraventa.js";

const [ruta, ...resto] = process.argv.slice(2);
if (!ruta) {
  console.error("Uso: npm run intencion -- RUTA/mensajes.json [--medir]");
  process.exit(1);
}
const ejemplos = JSON.parse(fs.readFileSync(ruta, "utf8"));
const cuantos = (clase) => ejemplos.filter((e) => e.clase === clase).length;
console.log(`${ejemplos.length} mensajes: ${cuantos("vender")} vender, ${cuantos("comprar")} comprar, ${cuantos("nada")} nada`);

// What the rules make of a message, in the model's words. The model only gets what they read as nothing.
const reglaDe = (texto) => {
  const d = detectarPublicacion(texto) || detectarSuelta(texto);
  return !d ? null : d.tipo === "compro" ? "comprar" : "vender";
};
const linea = (clase, { reglas, conModelo }) =>
  `  ${clase.padEnd(8)} hay ${String(reglas[clase].hay).padStart(3)} · las reglas leen ${String(reglas[clase].aciertos).padStart(3)} · con el modelo ${String(conModelo[clase].aciertos).padStart(3)} · de más: ${reglas[clase].deMas} → ${conModelo[clase].deMas}`;
const m = medir(ejemplos, { reglaDe });
console.log(`\nCon gente que el modelo no vio (cinco partes, por autor), umbral ${INTENCION.UMBRAL}:`);
for (const clase of ["vender", "comprar"]) console.log(linea(clase, m.porAutor));
if (m.alFinal) {
  console.log("\nEl último tercio, entrenado con lo anterior:");
  for (const clase of ["vender", "comprar"]) console.log(linea(clase, m.alFinal));
}

if (!resto.includes("--medir")) {
  const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "intencion-modelo.json");
  const archivo = aArchivo(entrenar(ejemplos), { entrenado: new Date().toISOString().slice(0, 10), ejemplos: { nada: cuantos("nada"), vender: cuantos("vender"), comprar: cuantos("comprar") } });
  fs.writeFileSync(destino, `${JSON.stringify(archivo)}\n`);
  console.log(`\nlib/intencion-modelo.json: ${archivo.cubetas} cubetas, ${(fs.statSync(destino).size / 1024).toFixed(0)} KB`);
}
