import { elegirAlAzar } from "../lib/azar.js";

// Reina-Valera 1960 verses from bolls.life. They used to come from bible-api.deno.dev, which ceased to exist when
// Deno Deploy Classic shut down in July 2026.
const API = "https://bolls.life";
const TRADUCCION = "RV1960";
const SALMOS = { id: 19, nombre: "Salmos", capitulos: 150 };
let libros = null; // [{ bookid, name, chapters }], loaded once

const pedir = async (ruta) => {
  const res = await fetch(`${API}${ruta}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`bolls.life respondió ${res.status}`);
  return res.json();
};
const limpiar = (t) => String(t).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const textoVersiculo = (libro, capitulo, v) => `*📖 LIBRO DE:* ${libro}\n\n*✍️Capitulo:* ${capitulo}\n\n*Versiculo: #${v.verse}*\n\n📝 ${limpiar(v.text)}\n`;

const plugin = {};
plugin.cmd = ["versiculo", "versículo", "biblia", "salmo", "salmos"];
plugin.botAdmin = true;

plugin.run = async (m, { client, command }) => {
  try {
    if (command === "salmo" || command === "salmos") {
      const capitulo = Math.floor(Math.random() * SALMOS.capitulos) + 1;
      const versos = await pedir(`/get-text/${TRADUCCION}/${SALMOS.id}/${capitulo}/`);
      if (!versos.length) throw new Error(`el salmo ${capitulo} vino vacío`);
      return client.sendText(m.chat, textoVersiculo(SALMOS.nombre, capitulo, elegirAlAzar(versos)), m);
    }
    libros ??= await pedir(`/get-books/${TRADUCCION}/`);
    const v = await pedir(`/get-random-verse/${TRADUCCION}/`);
    const libro = libros.find((l) => l.bookid === v.book)?.name || `Libro ${v.book}`;
    await client.sendText(m.chat, textoVersiculo(libro, v.chapter, v), m);
  } catch (error) {
    console.error("[biblia]", error.message);
    await client.sendText(m.chat, "No pude traer el versículo ahora, probá más tarde.", m);
  }
};

export default plugin;
