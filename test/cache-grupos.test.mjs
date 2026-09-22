import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { clienteFalso, G, esperar } from "./helpers.mjs";

// The cache is what keeps Baileys from asking WhatsApp for the participant list on every message the bot sends to a
// group. clienteFalso() has no groupMetadata, so it's added here counting the queries, the way test/moderacion
// patches groupParticipantsUpdate; the hit is proven by counting, like test/aero does with NOAA.

let C;
before(async () => {
  C = await import("../lib/cache-grupos.js");
});

const T0 = 1_800_000_000_000; // a real date: what matters is the distance between calls, not the date itself
let consultas = [];
let demora = 0;
let responder = (jid) => ({ id: jid, subject: jid.split("@")[0], participants: [{ id: "a@lid", admin: "admin" }, { id: "b@lid" }] });

function cliente() {
  consultas = [];
  C.vaciar();
  const client = clienteFalso();
  client.groupMetadata = async (jid) => {
    consultas.push(jid);
    if (demora) await esperar(demora);
    return responder(jid);
  };
  return client;
}

test("cache de grupos: la segunda consulta sale del caché y pasada la vida útil se vuelve a preguntar", async () => {
  const client = cliente();
  const primera = await C.metadataDe(client, G, { ahora: T0 });
  const segunda = await C.metadataDe(client, G, { ahora: T0 + 1000 });
  assert.equal(consultas.length, 1, "la segunda salió del caché");
  assert.equal(segunda, primera, "es la misma copia, no una nueva");

  await C.metadataDe(client, G, { ahora: T0 + C.CACHE_GRUPOS.VIDA_MS });
  assert.equal(consultas.length, 2, "pasada la vida útil se vuelve a preguntar");
  assert.deepEqual(C.estadisticas(), { grupos: 1, aciertos: 1, pedidos: 2 });

  assert.equal(await C.metadataDe(client, "alguien@s.whatsapp.net"), null, "un privado no tiene metadata de grupo");
  assert.equal(consultas.length, 2, "y no se pregunta por él");
});

test("cache de grupos: varios pedidos a la vez comparten una sola consulta", async () => {
  const client = cliente();
  demora = 20; // so the five overlap: without coalescing each one would query on its own
  const todas = await Promise.all([1, 2, 3, 4, 5].map(() => C.metadataDe(client, G, { ahora: T0 })));
  demora = 0;
  assert.equal(consultas.length, 1, "cinco pedidos simultáneos, una sola consulta a WhatsApp");
  for (const metadata of todas) assert.equal(metadata, todas[0], "todos reciben la misma copia");
  assert.equal(C.estadisticas().pedidos, 1);

  // And once it settles, the next one comes out of the cache: the in-flight entry was cleaned up.
  await C.metadataDe(client, G, { ahora: T0 + 1000 });
  assert.equal(consultas.length, 1);
});

test("cache de grupos: un refresco forzado no se repite si otro acaba de traerla", async () => {
  const client = cliente();
  // Someone joining the group arrives twice: the group notice, and group-participants.update.
  await C.metadataDe(client, G, { fresca: true, ahora: T0 });
  await C.metadataDe(client, G, { fresca: true, ahora: T0 + 500 });
  assert.equal(consultas.length, 1, "dos eventos por la misma entrada, una sola consulta");

  await C.metadataDe(client, G, { fresca: true, ahora: T0 + C.CACHE_GRUPOS.REFRESCO_MIN_MS });
  assert.equal(consultas.length, 2, "pasada la ventana, un refresco forzado sí vuelve a preguntar");
  assert.ok(C.CACHE_GRUPOS.REFRESCO_MIN_MS < C.CACHE_GRUPOS.VIDA_MS, "o sea que forzar se saltea la vida útil");
});

test("cache de grupos: un refresco forzado no se conforma con una copia de rutina, por reciente que sea", async () => {
  const client = cliente();
  // A routine read went out half a second before someone was demoted: its copy is recent but still from before.
  await C.metadataDe(client, G, { ahora: T0 });
  await C.metadataDe(client, G, { fresca: true, ahora: T0 + 500 });
  assert.equal(consultas.length, 2, "el evento vuelve a preguntar aunque la copia tenga medio segundo");
});

test("cache de grupos: una consulta de rutina que termina tarde no deshace el refresco forzado", async () => {
  const client = cliente();
  let llamada = 0;
  client.groupMetadata = async (jid) => {
    llamada++;
    // The routine query left first and is slow; the forced one left after the join and comes back first.
    if (llamada === 1) {
      await esperar(40);
      return { id: jid, subject: "antes", participants: [{ id: "a@lid" }] };
    }
    await esperar(5);
    return { id: jid, subject: "después", participants: [{ id: "a@lid" }, { id: "nuevo@lid" }] };
  };
  const rutina = C.metadataDe(client, G, { ahora: T0 });
  const forzada = C.metadataDe(client, G, { fresca: true, ahora: T0 + 100 });
  assert.equal((await forzada).subject, "después");
  assert.equal((await rutina).subject, "después", "la de rutina terminó última y recibe la copia nueva, no la suya");
  assert.equal(C.enCache(G, T0 + 200).participants.length, 2, "en el caché queda la de después de la entrada");
});

test("cache de grupos: una consulta de rutina que termina antes no le saca el lugar al refresco forzado", async () => {
  const client = cliente();
  let llamada = 0;
  client.groupMetadata = async (jid) => {
    llamada++;
    // This time the routine query comes back first, while the forced one is still on its way.
    if (llamada === 1) {
      await esperar(5);
      return { id: jid, subject: "antes", participants: [{ id: "a@lid" }] };
    }
    await esperar(40);
    return { id: jid, subject: "después", participants: [{ id: "a@lid" }, { id: "nuevo@lid" }] };
  };
  const rutina = C.metadataDe(client, G, { ahora: T0 });
  const forzada = C.metadataDe(client, G, { fresca: true, ahora: T0 + 100 });
  assert.equal((await rutina).subject, "antes");
  // The routine query is done; the forced one isn't. A read now has to wait for it, not settle for "antes".
  assert.equal((await C.metadataDe(client, G, { ahora: T0 + 200 })).subject, "después");
  await forzada;
});

test("cache de grupos: mientras hay un refresco forzado en camino, las lecturas lo esperan", async () => {
  const client = cliente();
  await C.metadataDe(client, G, { ahora: T0 });
  responder = (jid) => ({ id: jid, subject: "después del demote", participants: [{ id: "a@lid" }] });
  demora = 20;
  const forzada = C.metadataDe(client, G, { fresca: true, ahora: T0 + 1000 });
  // The copy from T0 is well within its lifetime, but a forced refresh on its way says it's stale.
  const lectura = C.metadataDe(client, G, { ahora: T0 + 1001 });
  demora = 0;
  assert.equal((await lectura).subject, "después del demote", "un comando justo después del demote no se chequea contra la lista vieja");
  assert.equal(await lectura, await forzada);
  assert.equal(consultas.length, 2, "y no dispara una consulta propia");
  responder = (jid) => ({ id: jid, subject: jid.split("@")[0], participants: [{ id: "a@lid", admin: "admin" }, { id: "b@lid" }] });
});

test("cache de grupos: si WhatsApp no contesta se usa la copia vieja", async () => {
  const client = cliente();
  const buena = await C.metadataDe(client, G, { ahora: T0 });

  const errorReal = console.error;
  console.error = () => {};
  try {
    responder = () => {
      throw new Error("timed out");
    };
    const vencida = await C.metadataDe(client, G, { ahora: T0 + C.CACHE_GRUPOS.VIDA_MS });
    assert.equal(vencida, buena, "vale más la lista de admins vieja que ninguna");

    // Never rejects: Baileys awaits this in the middle of sending a message, and a rejection would take the
    // message down with it.
    C.vaciar();
    consultas = [];
    assert.equal(await C.metadataDe(client, G, { ahora: T0 }), null, "sin copia previa devuelve null, no tira");
    assert.equal(await C.metadataDe(client, G, { ahora: T0 + 500 }), null);
    assert.equal(consultas.length, 1, "un grupo que falla no se vuelve a preguntar en cada mensaje");
    assert.equal(await C.metadataDe(client, G, { ahora: T0 + C.CACHE_GRUPOS.REFRESCO_MIN_MS }), null);
    assert.equal(consultas.length, 2, "pero se reintenta pasada la ventana: la falla puede ser pasajera");
  } finally {
    console.error = errorReal;
    responder = (jid) => ({ id: jid, subject: jid.split("@")[0], participants: [{ id: "a@lid", admin: "admin" }, { id: "b@lid" }] });
  }
});

test("cache de grupos: guardar deja copia en client.chats e invalidar la tira", async () => {
  const client = cliente();
  // pushMessage files the chat's last 40 messages here, and client.loadMessage() digs them out for the anti-delete:
  // if guardar replaced the entry instead of editing it, they'd go with it.
  client.chats[G] = { id: G, messages: { ABC: { key: { id: "ABC" } } } };
  await C.metadataDe(client, G, { ahora: T0 });
  assert.ok(client.chats[G].messages.ABC, "guardar la metadata no se lleva los mensajes del chat");
  assert.equal(client.chats[G].subject, "grupo", "los que leen client.chats directo siguen encontrándolo");
  assert.equal(client.chats[G].metadata.participants.length, 2);
  assert.equal(C.enCache(G, T0).subject, "grupo");
  assert.equal(C.enCache(G, T0 + C.CACHE_GRUPOS.VIDA_MS), null, "enCache no devuelve copias vencidas");

  C.invalidar(client, G);
  assert.equal(C.enCache(G, T0), null);
  assert.equal(client.chats[G].metadata, undefined, "también se va la copia de client.chats");
  await C.metadataDe(client, G, { ahora: T0 });
  assert.equal(consultas.length, 2, "después de invalidar se vuelve a preguntar");
});

test("cache de grupos: guardarVarios llena todo de una y nombreDeGrupo no pregunta si ya lo sabe", async () => {
  const client = cliente();
  const todos = { [G]: { id: G, subject: "grupo", participants: [] }, "otro@g.us": { id: "otro@g.us", subject: "otro", participants: [] } };
  assert.equal(C.guardarVarios(client, todos, T0), 2, "groupFetchAllParticipating llena todos los grupos gratis");
  assert.equal(C.estadisticas().grupos, 2);

  // A bulk load asked for before a forced refresh, and arriving after it, doesn't undo it.
  await C.metadataDe(client, G, { fresca: true, ahora: T0 + 1000 });
  C.guardarVarios(client, { [G]: { id: G, subject: "carga vieja", participants: [] } }, T0 + 500);
  assert.equal(C.enCache(G, T0 + 2000).subject, "grupo", "la carga masiva vieja no pisa el refresco forzado");
  consultas = [];

  assert.equal(await C.nombreDeGrupo(client, G), "grupo");
  assert.equal(consultas.length, 0, "el nombre salió del caché");
  assert.equal(await C.nombreDeGrupo(client, "nuevo@g.us"), "nuevo");
  assert.equal(consultas.length, 1, "uno que no estaba sí se pregunta");
  assert.equal(await C.nombreDeGrupo(client, "alguien@s.whatsapp.net"), "alguien@s.whatsapp.net", "un privado no tiene nombre de grupo");
});

test("cache de grupos: groups.update con la metadata entera la guarda, y un cambio de configuración solo invalida", () => {
  const client = cliente();
  // groupFetchAllParticipating() emits this event with the whole metadata of every group: it's already paid for.
  assert.ok(C.aplicarCambioDeGrupo(client, { id: G, subject: "grupo", participants: [{ id: "a@lid" }] }));
  assert.equal(C.enCache(G).participants.length, 1, "la metadata completa se guarda, no se tira");
  // Baileys may have held this event back for up to 30 s: with a copy still current, it doesn't replace it.
  assert.equal(C.aplicarCambioDeGrupo(client, { id: G, subject: "volcado viejo", participants: [] }), null);
  assert.equal(C.enCache(G).subject, "grupo", "un volcado de groups.update no pisa una copia vigente");

  // A settings change arrives partial, with no participants: that one can't be trusted as a full copy.
  assert.equal(C.aplicarCambioDeGrupo(client, { id: G, announce: true }), null);
  assert.equal(C.enCache(G), null, "y deja el grupo para volver a preguntar");
  assert.equal(consultas.length, 0, "nada de esto le pregunta a WhatsApp");
});

// ---------- consistency: scanning the source ----------
// The cache has one owner and one way into Baileys. None of this shows when it breaks: the bot keeps working, it just
// goes back to asking WhatsApp on every message it sends. Modelled on test/motivos.test.mjs.

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULO = "lib/cache-grupos.js";
const rel = (archivo) => path.relative(RAIZ, archivo);
const archivosDe = (carpeta) =>
  fs
    .readdirSync(path.join(RAIZ, carpeta))
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(RAIZ, carpeta, f));
const FUENTES = [...archivosDe("lib"), ...archivosDe("plugins"), path.join(RAIZ, "main.js"), path.join(RAIZ, "handle-message.js")];

// Every line of the repo that matches, as "file:line".
function lineasQueCoinciden(regex) {
  const encontradas = [];
  for (const archivo of FUENTES) {
    fs.readFileSync(archivo, "utf8")
      .split("\n")
      .forEach((linea, i) => {
        if (regex.test(linea)) encontradas.push(`${rel(archivo)}:${i + 1}`);
      });
  }
  return encontradas;
}

test("consistencia: main.js le sigue pasando cachedGroupMetadata al socket", () => {
  // Without it, Baileys asks WhatsApp for the participant list on EVERY message the bot sends to a group
  // (messages-send.js:501-507), which is the shortest road to a ratelimit. It's one line in a big options object:
  // exactly the kind of thing a merge eats without anyone noticing.
  const main = fs.readFileSync(path.join(RAIZ, "main.js"), "utf8");
  const opciones = main.slice(main.indexOf("const connectionOptions"), main.indexOf("globalThis.client = makeWASocket"));
  assert.ok(opciones.length > 200, "no se encontró el bloque de connectionOptions: el escaneo no está andando");
  assert.match(opciones, /cachedGroupMetadata:/, "falta cachedGroupMetadata en las connectionOptions de main.js");
  assert.match(opciones, /metadataDe\(/, `cachedGroupMetadata tiene que salir de ${MODULO}`);
});

test("consistencia: la metadata de grupos tiene un solo dueño", () => {
  assert.ok(FUENTES.length > 100, `se encontraron muy pocos archivos (${FUENTES.length}): el escaneo no está andando`);

  const piden = lineasQueCoinciden(/\.groupMetadata\(/);
  assert.equal(piden.filter((donde) => donde.startsWith(MODULO)).length, 1, `el escaneo no encuentra el pedido de ${MODULO}: no está andando`);
  const porSuCuenta = piden.filter((donde) => !donde.startsWith(MODULO));
  assert.deepEqual(porSuCuenta, [], `le piden la metadata a WhatsApp por su cuenta:\n${porSuCuenta.join("\n")}\n\nUsá metadataDe() de ${MODULO}.`);

  const escriben = lineasQueCoinciden(/\.metadata\s*=[^=]/).filter((d) => !d.startsWith(MODULO));
  assert.deepEqual(escriben, [], `escriben el cache sin pasar por ${MODULO}:\n${escriben.join("\n")}\n\nUsá guardar() o metadataDe().`);
});

test("consistencia: nadie muta los participants, que ahora son los del cache y no una copia por mensaje", () => {
  // Every plugin gets the very object the cache holds. A participants.sort() would corrupt it for the whole group
  // until the copy expires. Today nobody does it; this is the alarm for the day somebody tries.
  const mutan = lineasQueCoinciden(/participants\.(sort|push|splice|reverse|shift|pop|unshift|fill)\(/);
  assert.deepEqual(mutan, [], `mutan la lista de participantes compartida:\n${mutan.join("\n")}\n\nCopiala antes: [...participants].`);
});
