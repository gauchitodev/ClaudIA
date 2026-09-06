import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, ultimoEnviado } from "./helpers.mjs";

let F, R, P, Hook;
const DIA = 24 * 60 * 60 * 1000;
before(async () => {
  ({ F } = await prepararBase("rangos"));
  R = await import("../lib/rangos.js");
  P = (await import("../plugins/rango.js")).default;
  Hook = (await import("../plugins/_rangos.js")).default;
});
const persona = (n) => ({ chat: G, sender: `${n}@lid`, senderJid: `${n}@s.whatsapp.net`, pushName: `Persona ${n}` });
const fijar = (n, datos) => F.updateUser(`${n}@lid`, { inGroup: JSON.stringify({ [G]: { messageCount: 0, ...datos } }) });

test("rangos: hay que cumplir días y mensajes a la vez", () => {
  const clave = (d, m) => R.rangoPara(d, m).clave;
  assert.equal(clave(0, 0), "nuevo");
  assert.equal(clave(7, 100), "habitue");
  assert.equal(clave(7, 99), "nuevo", "le falta un mensaje");
  assert.equal(clave(400, 100), "habitue", "viejo pero callado no pasa de habitué");
  assert.equal(clave(30, 20000), "delacasa", "spam sin antigüedad no pasa de la casa");
  assert.equal(clave(365, 10000), "leyenda");
  assert.match(R.textoRangos(), /🧉 \*Habitué\* — 7 días y 100 mensajes \(\+10 coins al subir\)/);
});

test("rangos: la antigüedad sale de la primera actividad registrada si la entrada es vieja, y queda guardada", () => {
  F.initDataDB(persona(111));
  F.sumarMensajeDiario(G, "111@lid", "2026-08-01");
  F.sumarMensajeDiario(G, "111@lid", "2026-08-20");
  fijar(111, { messageCount: 5 }); // entrada anterior a los rangos: sin "desde"
  const desde = R.desdeCuando(G, "111@lid", F.getUser("111@lid"));
  assert.equal(new Date(desde).toDateString(), new Date(2026, 7, 1).toDateString());
  assert.equal(F.getUser("111@lid").inGroup[G].desde, desde, "quedó guardada");
  F.initDataDB(persona(222));
  const nuevo = F.getUser("222@lid", G); // getUser con chat inicializa la entrada con "desde" = ahora
  assert.ok(Date.now() - nuevo.inGroup[G].desde < 5000);
  assert.equal(R.rangoDe(G, "222@lid", nuevo).dias, 0);
});

test("rangos: progreso, ascenso anunciado con premio, y sin repetir", () => {
  fijar(111, { messageCount: 50, desde: Date.now() - 3 * DIA });
  const r = R.rangoDe(G, "111@lid", F.getUser("111@lid"));
  assert.deepEqual([r.rango.clave, r.siguiente.clave, r.faltanDias, r.faltanMensajes], ["nuevo", "habitue", 4, 50]);
  assert.match(R.textoRango(G, "111@lid", F.getUser("111@lid"), true).texto, /Tu rango:\* 🌱 \*Nuevo\*\n3 días en el grupo · 50 mensajes\nSiguiente: 🧉 Habitué, faltan 4 días y 50 mensajes\./);
  // primera pasada: guarda el rango actual sin avisar
  assert.equal(R.chequearAscenso(G, "111@lid", F.getUser("111@lid")), null);
  assert.equal(F.getUser("111@lid").inGroup[G].rango, "nuevo");
  // ahora cumple habitué
  fijar(111, { messageCount: 100, desde: Date.now() - 8 * DIA, rango: "nuevo" });
  const saldoAntes = F.getSaldoCoins(G, "111@lid");
  const aviso = R.chequearAscenso(G, "111@lid", F.getUser("111@lid"));
  assert.equal(aviso.texto, "🧉 @111 subió a *Habitué* (7 días en el grupo y 100 mensajes). +10 UruCoins.");
  assert.deepEqual(aviso.mentions, ["111@lid"]);
  assert.equal(F.getSaldoCoins(G, "111@lid") - saldoAntes, 10);
  assert.equal(F.getUser("111@lid").inGroup[G].rango, "habitue");
  assert.equal(R.chequearAscenso(G, "111@lid", F.getUser("111@lid")), null, "no se anuncia dos veces");
  // leyenda: rango máximo
  fijar(111, { messageCount: 10000, desde: Date.now() - 400 * DIA, rango: "veterano" });
  assert.match(R.chequearAscenso(G, "111@lid", F.getUser("111@lid")).texto, /subió a \*Leyenda\*.*\+100 UruCoins/);
  assert.match(R.textoRango(G, "111@lid", F.getUser("111@lid")).texto, /Rango de @111:\* 👑 \*Leyenda\*[\s\S]*Es el rango máximo/);
});

test("rangos: los comandos y el hook de mensajes", async () => {
  const cliente = globalThis.client;
  await P.run({ chat: G, sender: "222@lid", isGroup: true }, { client: cliente, command: "rango", text: "" });
  assert.match(ultimoEnviado().msg.text, /🎖️ \*Tu rango:\* 🌱 \*Nuevo\*/);
  await P.run({ chat: G, sender: "222@lid", isGroup: true }, { client: cliente, command: "rango", text: "@111" });
  assert.match(ultimoEnviado().msg.text, /Rango de @111:\* 👑 \*Leyenda\*/);
  await P.run({ chat: G, sender: "222@lid", isGroup: true }, { client: cliente, command: "rangos", text: "" });
  assert.match(ultimoEnviado().msg.text, /RANGOS DEL GRUPO/);
  await P.run({ chat: G, sender: "222@lid", isGroup: true }, { client: cliente, command: "rango", text: "@999" });
  assert.match(ultimoEnviado().msg.text, /No tengo datos/);
  // el hook anuncia el ascenso en el grupo
  fijar(222, { messageCount: 500, desde: Date.now() - 31 * DIA, rango: "habitue" });
  const enviados = globalThis.enviados.length;
  await Hook.before({ chat: G, sender: "222@lid", isGroup: true, message: {} }, { client: cliente, user: F.getUser("222@lid") });
  assert.equal(globalThis.enviados.length, enviados + 1);
  assert.match(ultimoEnviado().msg.text, /🪑 @222 subió a \*De la casa\*/);
  await Hook.before({ chat: G, sender: "222@lid", isGroup: true, message: {} }, { client: cliente, user: F.getUser("222@lid") });
  assert.equal(globalThis.enviados.length, enviados + 1, "sin ascenso no manda nada");
});
