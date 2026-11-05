import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso } from "./helpers.mjs";

// .ap, .ap 5 and .pendientes (plugins/grupo-aprobar-participantes.js, lib/solicitudes.js): the requests to join a
// group approved one at a time, a few seconds apart, with the blacklist looked up, every answer read, and a summary.
const G = "120363000000000091@g.us";
const ADMIN = "300000000000041@lid";
const PARTICIPANTS = [
  { id: ADMIN, admin: "admin" },
  { id: "bot@lid", admin: "admin" },
];

let F, S, Pausas, Plugin, client, llamadas, esperas, reacciones, pendientes, respuesta;
before(async () => {
  ({ F } = await prepararBase("solicitudes"));
  S = await import("../lib/solicitudes.js");
  Pausas = await import("../lib/pausas.js");
  Plugin = (await import("../plugins/grupo-aprobar-participantes.js")).default;
});
beforeEach(() => {
  client = clienteFalso();
  llamadas = [];
  esperas = [];
  reacciones = [];
  pendientes = [];
  respuesta = (ids) => ids.map((jid) => ({ status: "200", jid }));
  client.groupRequestParticipantsList = async () => pendientes;
  client.groupRequestParticipantsUpdate = async (chat, ids, accion) => {
    llamadas.push([ids, accion]);
    return respuesta(ids, accion);
  };
  Pausas._dep.esperar = async (ms) => {
    esperas.push(ms);
  };
  S._dep.azar = () => 0.5;
});

const mensaje = () => ({ chat: G, sender: ADMIN, isGroup: true, react: async (emoji) => reacciones.push(emoji) });
const ap = (text = "", command = "ap") => Plugin.run(mensaje(), { client, command, text, participants: PARTICIPANTS });
const textos = () => globalThis.enviados.map((e) => e.msg.text);
const pedido = (n) => ({ jid: `30000000000005${n}@lid`, phone_number: `5989900010${n}@s.whatsapp.net`, request_method: "invite_link" });
const limpiar = () => {
  globalThis.enviados = [];
  llamadas = [];
  esperas = [];
  reacciones = [];
};

test(".ap: aprueba los pedidos de a uno, con unos segundos entre cada uno, y al final resume", async () => {
  pendientes = [pedido(1), pedido(2), pedido(3)];
  await ap();
  assert.deepEqual(llamadas, [[[pedido(1).jid], "approve"], [[pedido(2).jid], "approve"], [[pedido(3).jid], "approve"]], "un pedido por persona, por el id con que la lista WhatsApp");
  assert.deepEqual(esperas, [6000, 6000], "una pausa entre pedido y pedido: ni antes del primero ni después del último");
  assert.deepEqual(reacciones, ["⏳", "✅"]);
  assert.deepEqual(textos(), ["✅ Aprobé los 3 pedidos."]);
  assert.equal(S.aprobacionEnCurso(G), false);
  // the pause is from four to eight seconds, at random
  for (const [azar, ms] of [
    [0, 4000],
    [1, 8000],
    [0.25, 5000],
  ]) {
    S._dep.azar = () => azar;
    limpiar();
    await ap();
    assert.deepEqual(esperas, [ms, ms], `azar ${azar}`);
  }
  // one pending: no pause, and the singular
  pendientes = [pedido(4)];
  limpiar();
  await ap();
  assert.deepEqual([textos(), esperas, reacciones], [["✅ Aprobé el pedido."], [], ["⏳", "✅"]]);
  // nothing pending: said, without touching anything
  pendientes = [];
  limpiar();
  await ap();
  assert.deepEqual([textos(), llamadas, reacciones], [["No hay pedidos pendientes para entrar al grupo."], [], []]);
  // .aprobar is the same command
  pendientes = [pedido(5)];
  limpiar();
  await ap("", "aprobar");
  assert.deepEqual(textos(), ["✅ Aprobé el pedido."]);
});

test(".ap 5: aprueba solo los primeros y dice cuántos quedan; con muchos, avisa que va a tardar", async () => {
  pendientes = [1, 2, 3, 4, 5].map(pedido);
  await ap("2");
  assert.deepEqual(
    llamadas.map(([ids]) => ids[0]),
    [pedido(1).jid, pedido(2).jid],
  );
  assert.deepEqual([textos(), esperas], [["✅ Aprobé 2 pedidos. Quedan 3 pendientes: .ap para seguir."], [6000]]);
  // what isn't a count of at least one is explained, and nothing is approved
  for (const text of ["0", "cinco", "-3", "2.5"]) {
    limpiar();
    await ap(text);
    assert.deepEqual([textos(), llamadas], [["Para aprobar solo algunos: .ap 5 (los primeros 5, de a uno). .ap solo los aprueba a todos."], []], text);
  }
  // 1.000 is a thousand, as everywhere else: more than there are, so everyone
  limpiar();
  await ap("1.000");
  assert.deepEqual([llamadas.length, textos()], [5, ["✅ Aprobé los 5 pedidos."]]);
  // six or more to go through: it says so before starting; five, not
  pendientes = [1, 2, 3, 4, 5, 6].map(pedido);
  limpiar();
  await ap();
  assert.deepEqual(textos(), ["⏳ Hay 6 pedidos: los apruebo de a uno, con unos segundos entre cada uno. Te aviso cuando termine.", "✅ Aprobé los 6 pedidos."]);
  limpiar();
  await ap("5");
  assert.deepEqual(textos(), ["✅ Aprobé 5 pedidos. Queda 1 pendiente: .ap para seguir."]);
  pendientes = [1, 2, 3, 4, 5, 6, 7, 8].map(pedido);
  limpiar();
  await ap("6");
  assert.deepEqual(textos(), ["⏳ Hay 8 pedidos: apruebo los primeros 6 de a uno, con unos segundos entre cada uno. Te aviso cuando termine.", "✅ Aprobé 6 pedidos. Quedan 2 pendientes: .ap para seguir."]);
});

test(".ap: a quien está en la lista negra lo rechaza en vez de aprobarlo, y no cuenta para el tope", async (t) => {
  const malo = pedido(7);
  F.addToBlacklist(malo.phone_number, "spam", ADMIN, G);
  t.after(() => F.removeFromBlacklist(malo.phone_number, G));
  pendientes = [malo, pedido(1), pedido(2)];
  await ap("1");
  assert.deepEqual(llamadas, [[[malo.jid], "reject"], [[pedido(1).jid], "approve"]], "rechazado por el id con que lo lista WhatsApp, y el tope sigue contando aprobados");
  assert.deepEqual(textos(), ["✅ Aprobé 1 pedido. 1 estaba en la lista negra y lo rechacé. Queda 1 pendiente: .ap para seguir."]);
  // only people on the list: nobody approved, and the run still ends with ✅
  pendientes = [malo];
  limpiar();
  await ap();
  assert.deepEqual([textos(), reacciones], [["No aprobé a nadie: 1 estaba en la lista negra y lo rechacé."], ["⏳", "✅"]]);
  // the entry under the number catches a request listed by its LID with the number alongside, as above; one listed
  // by the number alone, too
  pendientes = [{ jid: malo.phone_number }, pedido(2)];
  limpiar();
  await ap();
  assert.deepEqual(llamadas, [[[malo.phone_number], "reject"], [[pedido(2).jid], "approve"]]);
  assert.deepEqual(textos(), ["✅ Aprobé 1 pedido. 1 estaba en la lista negra y lo rechacé."]);
});

test(".ap: lee la respuesta de cada uno, y si WhatsApp deja de contestar corta y dice hasta dónde llegó", async () => {
  pendientes = [pedido(1), pedido(2), pedido(3)];
  respuesta = (ids) => ids.map((jid) => ({ status: jid === pedido(2).jid ? "409" : "200", jid }));
  await ap();
  assert.deepEqual(textos(), ["✅ Aprobé 2 pedidos. 1 no se pudo aprobar: WhatsApp contestó 409 (puede que ya no estuviera pendiente)."]);
  assert.deepEqual(reacciones, ["⏳", "✅"]);
  // an empty answer isn't an approval either
  respuesta = () => [];
  pendientes = [pedido(1), pedido(2)];
  limpiar();
  await ap();
  assert.deepEqual(textos(), ["No aprobé a nadie: 2 no se pudieron aprobar: WhatsApp contestó sin respuesta (puede que ya no estuvieran pendientes)."]);
  // the socket stops answering at the second one: the run stops there, the rest stays pending
  respuesta = (ids) => {
    if (ids[0] === pedido(2).jid) throw new Error("Timed Out");
    return ids.map((jid) => ({ status: "200", jid }));
  };
  pendientes = [pedido(1), pedido(2), pedido(3)];
  limpiar();
  await ap();
  assert.deepEqual(
    llamadas.map(([ids]) => ids[0]),
    [pedido(1).jid, pedido(2).jid],
  );
  assert.deepEqual([reacciones, textos()], [["⏳", "⚠️"], ["⚠️ Aprobé 1 pedido y WhatsApp dejó de contestar (Timed Out). Quedan 2 pendientes: probá .ap de nuevo en un rato."]]);
  assert.equal(S.aprobacionEnCurso(G), false, "el grupo no queda marcado como ocupado");
  // at the very first
  pendientes = [pedido(2), pedido(3)];
  limpiar();
  await ap();
  assert.deepEqual(textos(), ["⚠️ WhatsApp no contestó (Timed Out). Quedan 2 pendientes: probá .ap de nuevo en un rato."]);
  // the list itself failing
  client.groupRequestParticipantsList = async () => {
    throw new Error("no socket");
  };
  limpiar();
  await ap();
  assert.deepEqual([textos(), reacciones], [["Hubo un error al procesar el comando."], []]);
});

test(".ap: dos a la vez no se pisan: el segundo espera a que termine el primero", async () => {
  pendientes = [pedido(1), pedido(2)];
  let soltar;
  Pausas._dep.esperar = () => new Promise((r) => (soltar = r));
  const primero = ap();
  // the first run is in its pause, after the first approval
  await new Promise((r) => setImmediate(r));
  assert.deepEqual([llamadas.length, S.aprobacionEnCurso(G)], [1, true]);
  globalThis.enviados = [];
  await ap();
  assert.deepEqual([textos(), llamadas.length], [["Ya estoy aprobando los pedidos de este grupo: esperá a que termine."], 1]);
  // and the lib answers the same if asked straight
  assert.equal((await S.aprobarPendientes(client, G, pendientes)).estado, "enCurso");
  soltar();
  await primero;
  assert.deepEqual([S.aprobacionEnCurso(G), llamadas.length, globalThis.enviados.at(-1).msg.text], [false, 2, "✅ Aprobé los 2 pedidos."]);
});

test(".pendientes: lista los pedidos con el número cuando WhatsApp lo manda, y cómo llegaron", async () => {
  pendientes = [pedido(1), { jid: "300000000000099@lid", request_method: "non_admin_add" }, { jid: "59899000103@s.whatsapp.net", request_method: "algo_nuevo" }];
  await ap("", "pendientes");
  assert.deepEqual(textos(), ["Pedidos pendientes para entrar (3):\n1. +59899000101 · por el link\n2. LID 300000000000099 · lo agregó alguien que no es admin\n3. +59899000103\n\nPara aprobarlos: .ap (todos, de a uno) o .ap 5 (los primeros 5)."]);
  pendientes = [];
  limpiar();
  await ap("", "pendientes");
  assert.deepEqual([textos(), llamadas], [["No hay pedidos pendientes para entrar al grupo."], []]);
});

test("el plugin: solo en grupos, con el bot admin, por un admin, y sus tres nombres", () => {
  assert.deepEqual([Plugin.cmd, Plugin.onlyGroup, Plugin.botAdmin, Plugin.onlyAdmin, Plugin.casino, Plugin.economia], [["ap", "aprobar", "pendientes"], true, true, true, undefined, undefined]);
});
