import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import { procesarTanda } from "../lib/tandas.js";
import { nodosQue, manejadorDe } from "./helpers.mjs";

// A batch of incoming messages (one messages.upsert, main.js) used to go one message at a time: a chat whose replies
// were waiting their turn to be sent held up every other chat in the batch. Now it's in order within each chat, and the
// chats side by side.

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const msg = (chat, n) => ({ key: { remoteJid: chat, id: `${chat}-${n}` } });

test("tandas: un chat lento no frena a los otros, y dentro de cada chat se respeta el orden", async () => {
  const hechos = [];
  const procesar = async (m) => {
    if (m.key.remoteJid === "lento@g.us") await esperar(60);
    hechos.push(m.key.id);
  };
  await procesarTanda([msg("lento@g.us", 1), msg("lento@g.us", 2), msg("rapido@g.us", 1), msg("otro@g.us", 1), msg("rapido@g.us", 2)], procesar);
  assert.deepEqual(hechos.slice(0, 3), ["rapido@g.us-1", "otro@g.us-1", "rapido@g.us-2"], "los demás chats no esperaron al lento");
  assert.deepEqual(hechos.slice(3), ["lento@g.us-1", "lento@g.us-2"], "y el lento, en su orden");
});

test("tandas: lo que falla en un mensaje no corta el resto", async () => {
  const hechos = [];
  const errorReal = console.error;
  console.error = () => {};
  try {
    await procesarTanda([msg("a@g.us", 1), msg("a@g.us", 2), msg("b@g.us", 1)], async (m) => {
      if (m.key.id === "a@g.us-1") throw new Error("se rompió");
      hechos.push(m.key.id);
    });
  } finally {
    console.error = errorReal;
  }
  assert.deepEqual(hechos.sort(), ["a@g.us-2", "b@g.us-1"]);
  await procesarTanda(undefined, async () => assert.fail("no hay nada que procesar"));
});

// The messages of each batch the event brings, waited for. Read as code (nodosQue): read as text, the call passed
// commented out, and broke on a renamed variable.
test("consistencia: main.js procesa las tandas con procesarTanda", async () => {
  const main = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");
  const llamadas = await nodosQue('CallExpression[callee.property.name="on"][arguments.0.value="messages.upsert"] CallExpression[callee.name="procesarTanda"]', main);
  const conLaTanda = (llamada) => llamada.parent.type === "AwaitExpression" && llamada.arguments[0]?.property?.name === "messages" && llamada.arguments[0].object?.name === manejadorDe(llamada)?.params[0]?.name;
  assert.ok(llamadas.some(conLaTanda), "main.js no procesa cada tanda con procesarTanda");
});
