import { test } from "node:test";
import assert from "node:assert/strict";
import { clienteFalso, ultimoEnviado } from "./helpers.mjs";

// El plugin habla con bolls.life por fetch; acá se reemplaza el fetch global por respuestas enlatadas.
const RUTAS = {
  "/get-books/RV1960/": [
    { bookid: 1, name: "Génesis", chapters: 50 },
    { bookid: 19, name: "Salmos", chapters: 150 },
    { bookid: 42, name: "Lucas", chapters: 24 },
  ],
  "/get-random-verse/RV1960/": { book: 42, chapter: 17, verse: 36, text: "Dos estarán en el campo;  el uno será tomado,  y el otro dejado." },
};
const fetchFalso = async (url) => {
  const ruta = new URL(url).pathname;
  if (ruta.startsWith("/get-text/RV1960/19/")) return { ok: true, status: 200, json: async () => [{ verse: 1, text: "Jehová es mi pastor;  nada me faltará." }] };
  if (RUTAS[ruta]) return { ok: true, status: 200, json: async () => RUTAS[ruta] };
  return { ok: false, status: 404, json: async () => ({}) };
};

test("biblia: salmo y versículo al azar con el formato de siempre, y aviso si la API falla", async () => {
  const fetchReal = globalThis.fetch;
  globalThis.fetch = fetchFalso;
  try {
    const { default: plugin } = await import("../plugins/versiculos-biblia.js");
    const client = clienteFalso();
    const m = { chat: "grupo@g.us", sender: "a@lid" };

    await plugin.run(m, { client, command: "salmo" });
    let texto = ultimoEnviado().msg.text;
    assert.match(texto, /^\*📖 LIBRO DE:\* Salmos\n\n\*✍️Capitulo:\* \d+\n\n\*Versiculo: #1\*\n\n📝 Jehová es mi pastor; nada me faltará\.\n$/);

    await plugin.run(m, { client, command: "versiculo" });
    texto = ultimoEnviado().msg.text;
    assert.match(texto, /LIBRO DE:\* Lucas\n\n\*✍️Capitulo:\* 17\n\n\*Versiculo: #36\*/);
    assert.ok(texto.includes("Dos estarán en el campo; el uno será tomado, y el otro dejado."), "colapsa los espacios dobles de bolls");

    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await plugin.run(m, { client, command: "salmo" });
    assert.equal(ultimoEnviado().msg.text, "No pude traer el versículo ahora, probá más tarde.");
  } finally {
    globalThis.fetch = fetchReal;
  }
});
