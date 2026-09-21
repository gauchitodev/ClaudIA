import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, fijarSaldo, ultimoEnviado } from "./helpers.mjs";

let F, A, H, L, Pf, P, Pj;
const DIA = 24 * 60 * 60 * 1000;
before(async () => {
  ({ F } = await prepararBase("perfil"));
  A = await import("../lib/actividad.js");
  H = await import("../lib/hashtags.js");
  L = await import("../lib/laburos.js");
  Pf = await import("../lib/perfil.js");
  Pj = await import("../lib/parejas.js");
  P = (await import("../plugins/perfil.js")).default;
});
const persona = (n) => ({ chat: G, sender: `${n}@lid`, senderJid: `${n}@s.whatsapp.net`, pushName: `Persona ${n}` });

test("perfil: ficha mínima de alguien sin nada", () => {
  F.initDataDB(persona(111));
  const r = Pf.textoPerfil(G, "111@lid", F.getUser("111@lid"), true);
  assert.equal(r.texto, "👤 *Tu perfil*\n\n🌱 Nuevo · en el grupo desde hoy\n🪙 0 UruCoins\n💼 Sin laburo (.laburos)\n🔥 Sin racha diaria");
  assert.deepEqual(r.mentions, ["111@lid"]);
});

test("perfil: ficha completa con coins, laburo, racha, ranking, duelos, pareja, cumple, mensajes, ítems y apodo", () => {
  F.initDataDB(persona(222));
  fijarSaldo(F, G, "111@lid", 120);
  fijarSaldo(F, G, "222@lid", 300);
  L.tomarLaburo(G, "111@lid", "tambero");
  F.setRacha(G, "111@lid", 3, A.claveDia());
  const mes = H.mesDe();
  for (let i = 0; i < 2; i++) F.sumarInteraccion(mes, G, "111@lid", "recibidas");
  for (let i = 0; i < 5; i++) F.sumarInteraccion(mes, G, "222@lid", "recibidas");
  F.moverCoins(G, "111@lid", -10, "duelo_apuesta");
  F.moverCoins(G, "111@lid", -10, "duelo_apuesta");
  F.moverCoins(G, "111@lid", -10, "duelo_apuesta");
  F.moverCoins(G, "111@lid", 10, "duelo_devolucion"); // a declined challenge doesn't count as played
  F.moverCoins(G, "111@lid", 20, "duelo_premio");
  F.updateUser("111@lid", { apodo: "Tito", inGroup: JSON.stringify({ [G]: { messageCount: 600, desde: Date.now() - 40 * DIA } }) });
  Pj.fijarPareja("111@lid", "222@lid", Date.now() - 2 * DIA);
  F.setCumple(G, "111@lid", 14, 3);
  F.agregarItem(G, "111@lid", "escudo", 2);

  const r = Pf.textoPerfil(G, "111@lid", F.getUser("111@lid"), false);
  const esperado = [
    "👤 *Perfil de @111*",
    "",
    "🪑 De la casa · 40 días en el grupo",
    "🪙 120 UruCoins · puesto 2 del grupo · apuesta máxima 100",
    "💼 🐄 Tambero, nivel 1; faltan 3 cobros para el nivel 2",
    "🔥 Racha diaria: 3 días · mejor: 3",
    "🏆 Ranking del mes: puesto 2 · 2 reacciones recibidas, 0 dadas",
    "⚔️ Duelos: 1 ganado de 2",
    "💞 Pareja: @222, desde hace 2 d 0 h",
    "🎂 Cumple: 14 de marzo",
    "💬 600 mensajes en el grupo",
    "🎒 🛡️ Escudo x2",
    '🏷️ Claudia le dice "Tito"',
  ].join("\n");
  assert.equal(r.texto, esperado);
  assert.deepEqual(r.mentions, ["111@lid", "222@lid"]);
  // if the relationship ended, it isn't shown
  Pj.terminarPareja("222@lid");
  assert.doesNotMatch(Pf.textoPerfil(G, "111@lid", F.getUser("111@lid")).texto, /Pareja/);
});

test("perfil: el comando resuelve a quién mirar", async () => {
  const cliente = globalThis.client;
  await P.run({ chat: G, sender: "111@lid", isGroup: true }, { client: cliente, text: "" });
  assert.match(ultimoEnviado().msg.text, /^👤 \*Tu perfil\*/);
  await P.run({ chat: G, sender: "111@lid", isGroup: true }, { client: cliente, text: "@222" });
  assert.match(ultimoEnviado().msg.text, /^👤 \*Perfil de @222\*/);
  assert.match(ultimoEnviado().msg.text, /300 UruCoins · puesto 1 del grupo/);
  await P.run({ chat: G, sender: "111@lid", isGroup: true, quoted: { sender: "222@lid" } }, { client: cliente, text: "" });
  assert.match(ultimoEnviado().msg.text, /Perfil de @222/);
  await P.run({ chat: G, sender: "111@lid", isGroup: true }, { client: cliente, text: "@999" });
  assert.match(ultimoEnviado().msg.text, /No tengo datos de esa persona/);
});
