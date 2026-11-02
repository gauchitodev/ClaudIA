import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, fijarSaldo, ultimoEnviado, esperar } from "./helpers.mjs";
import { numeroReciclado, soloPorNumero, owner, usyncFalso, mensaje, unaLid, digitos, COMANDOS_QUE_NOMBRAN, POR_SU_NOMBRE } from "./identidad-escenarios.mjs";

// Three tests of who is who that wait as long as the plugins do: .setmarry's reactions go 700 ms apart, 5.6 s in all,
// and the anti-mention of statuses removes three seconds after its warning. They lived in test/identidad.test.mjs,
// which with them took 26 s on CI's Node 22, close to test:ci's 30 s for a file.

let F;
before(async () => {
  ({ F } = await prepararBase("identidad-lentos"));
  globalThis.txt = (await import("../lib/strings.js")).default;
});

const cliente = () => globalThis.client;

// Someone the bot knows by their number alone (soloPorNumero), whose LID WhatsApp gives has no row: the commands go to
// the number (comoLoConoce), and every message that names them with "@" carries the mention. The "@" in the text alone,
// through sendText, came out as "<digits>@lid" (parseMention), which is nobody, and WhatsApp tagged nobody: .besar,
// .love, the couple's commands, .setpareja, .setmarry, .adv, .unwarn and .rd. .rd goes last, as it erases them.
const ARROBAN_POR_EL_NUMERO = [
  ...COMANDOS_QUE_NOMBRAN.filter(([, command]) => !POR_SU_NOMBRE.includes(command)),
  ["grupo-advertir", "adv", " spam", null, { isWaAdmin: true }],
  ["grupo-advertir", "adv", " spam", "unaParaSalir", { isWaAdmin: true }], // the one that removes them
  ["grupo-advertir-delete", "unwarn", "", null, { isWaAdmin: true }], // one of the warnings .adv gave
  ["pareja-set-pareja", "setpareja", " @OTRO"],
  ["pareja-set-marry", "setmarry", " @OTRO"],
  ["owner-restaurar-usuario", "rd", "", null, { isOwner: true }],
];
test("a quien el bot conoce solo por su número lo arroban con la mención: el «@» del texto solo no le llegaba", async (t) => {
  const Par = await import("../lib/parejas.js");
  const D = await import("../lib/duelos.js");
  t.after(() => {
    for (const d of D.duelos.values()) clearTimeout(d.timeout);
    D.duelos.clear();
  });
  const [uno, otro] = [soloPorNumero(500), soloPorNumero(501)];
  const { X } = uno;
  usyncFalso(t, { [X]: uno.L, [otro.X]: otro.L });
  const participants = [...uno.porNumeroSinLid, ...otro.porNumeroSinLid];
  let n = 510;
  for (const [archivo, command, resto = "", necesita = null, extra = {}] of ARROBAN_POR_EL_NUMERO) {
    const [A, B] = [unaLid(++n, 1), unaLid(n, 2)];
    F.initDataDB({ chat: G, sender: A, senderJid: "", pushName: "Quien pide" });
    if (necesita === "saldo") fijarSaldo(F, G, A, 1000);
    if (necesita === "casamiento") {
      fijarSaldo(F, G, A, 1000);
      F.initDataDB({ chat: G, sender: B, senderJid: "", pushName: "Cónyuge" });
      Par.fijarPareja(A, B);
      Par.fijarCasamiento(A, B);
    }
    if (necesita === "unaParaSalir") F.setAdvertencias(X, G, F.MAX_ADVERTENCIAS - 1);
    const texto = `@${digitos(X)}${resto.replace("@OTRO", `@${digitos(otro.X)}`)}`;
    const m = mensaje({ sender: A, text: `.${command} ${texto}`, mentionedJid: resto.includes("@OTRO") ? [X, otro.X] : [X] });
    globalThis.enviados = [];
    const plugin = (await import(`../plugins/${archivo}.js`)).default;
    await plugin.run(m, { client: cliente(), text: texto, args: texto.split(" "), command, usedPrefix: ".", participants, chat: {}, ...extra });
    const nombran = globalThis.enviados.map((e) => e.msg).filter((msg) => (msg?.text ?? msg?.caption ?? "").includes(`@${digitos(X)}`));
    const caso = `.${command}: ${globalThis.enviados.map((e) => e.msg?.text ?? e.msg?.caption).join(" | ")}`;
    assert.ok(nombran.length, `no lo nombra: ${caso}`);
    assert.ok(
      nombran.every((msg) => msg.mentions?.includes(X)),
      `lo nombra sin la mención: ${caso}`,
    );
  }
});

test(".setpareja y .setmarry le pasan el grupo: forman y casan a quienes tienen los números ahora", async () => {
  const Par = await import("../lib/parejas.js");
  const plugin = async (archivo) => (await import(`../plugins/${archivo}.js`)).default;
  const [a, b] = [numeroReciclado(165), numeroReciclado(166)];
  const participants = [...a.porNumero, ...b.porNumero];
  const m = mensaje({ sender: unaLid(167), mentionedJid: [a.X, b.X] });
  const texto = `@${digitos(a.X)} @${digitos(b.X)}`;
  await (await plugin("pareja-set-pareja")).run(m, { client: cliente(), text: texto, participants });
  assert.equal(Par.parejaDe(a.NUEVO)?.pareja, b.NUEVO, ".setpareja");
  await (await plugin("pareja-set-marry")).run(m, { client: cliente(), text: texto, participants });
  assert.ok(Par.parejaDe(a.NUEVO)?.casadosDesde > 0, ".setmarry");
});

// The owner as config.toml has them may come with "+" and spaces: the mention was no id at all. And the removal goes by
// the id the group lists the person under, saying so when WhatsApp refuses, as the anti-link, .suicidarse, .aa and .ad
// do (identidad.test.mjs).
test("el anti-mención de estados menciona al owner por su LID, saca con la id del grupo y avisa si no puede", async (t) => {
  const { X, NUEVO, porNumero } = numeroReciclado(147);
  const o = owner(t, 148, { comoEnConfig: "+598 99 000 148" });
  const pedidos = [];
  cliente().groupParticipantsUpdate = async (chat, ids, accion) => (pedidos.push([ids[0], accion]), ids.map(() => ({ status: "403" })));
  t.after(() => delete cliente().groupParticipantsUpdate);
  globalThis.enviados = [];
  const Estados = (await import("../plugins/grupo-anti-group-mention-status.js")).default;
  const m = { ...mensaje({ sender: NUEVO, senderJid: X }), message: { groupStatusMentionMessage: { message: { protocolMessage: {} } } } };
  await Estados.before(m, { client: cliente(), participants: porNumero, isMod: false, isOwner: false, isBotAdmin: true, chat: { antiStatus: true } });
  assert.deepEqual(globalThis.enviados[0]?.msg.mentions, [NUEVO, o.LID]);
  await esperar(3100); // the removal comes three seconds after the warning
  assert.deepEqual(pedidos, [[X, "remove"]]);
  assert.equal(ultimoEnviado().msg.text, "No pude sacarlo (error 403).");
});
