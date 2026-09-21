import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, fijarSaldo, ultimoEnviado } from "./helpers.mjs";

let F, Fa, P, Pf;
const DIA = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1, 12);
const persona = (n) => ({ chat: G, sender: `${n}@lid`, senderJid: `${n}@s.whatsapp.net`, pushName: `Persona ${n}` });
const L = (n) => `${n}@lid`;
// married a day ago, dating for eight
const casar = (a, b) => {
  P.fijarPareja(L(a), L(b), T0 - 8 * DIA);
  P.fijarCasamiento(L(a), L(b), T0 - DIA);
};
// a full adoption, with the request at a given moment (so it doesn't hit the one-a-day cap)
const adoptar = (padre, hijo, ahora) => {
  fijarSaldo(F, G, L(padre), 100); // so it doesn't fail over the fee
  const r = Fa.pedirAdopcion(G, L(padre), L(hijo), ahora);
  assert.equal(r.ok, true, `pedir adopción de ${hijo} por ${padre}: ${r.motivo}`);
  const a = Fa.responderAdopcion(L(hijo), true, ahora);
  assert.equal(a.ok, true, `aceptar adopción de ${hijo}: ${a.motivo}`);
  return a;
};

before(async () => {
  ({ F } = await prepararBase("familia"));
  Fa = await import("../lib/familia.js");
  P = await import("../lib/parejas.js");
  Pf = await import("../lib/perfil.js");
  globalThis.txt = (await import("../lib/strings.js")).default; // the couple plugins use the global texts
  for (let n = 1; n <= 14; n++) {
    F.initDataDB(persona(n));
    fijarSaldo(F, G, L(n), 100);
  }
});

test("adoptar: solo casados, con pedido, respuesta, trámite y tope diario", () => {
  assert.deepEqual(Fa.pedirAdopcion(G, L(1), L(3), T0), { ok: false, motivo: "sinCasar" });
  casar(1, 2);
  assert.deepEqual(Fa.pedirAdopcion(G, L(1), L(1), T0), { ok: false, motivo: "mismo" });
  assert.deepEqual(Fa.pedirAdopcion(G, L(1), L(2), T0), { ok: false, motivo: "esTuPareja" });
  assert.deepEqual(Fa.responderAdopcion(L(3), true, T0), { ok: false, motivo: "sinSolicitud" });

  assert.deepEqual(Fa.pedirAdopcion(G, L(1), L(3), T0), { ok: true, conyuge: L(2), costo: 30 });
  assert.equal(F.getSaldoCoins(G, L(1)), 70, "el trámite se paga al pedir");
  assert.equal(Fa.padresDe(L(3)), null, "pedir no adopta");
  assert.deepEqual(Fa.pedirAdopcion(G, L(1), L(3), T0), { ok: false, motivo: "yaPedida", hijo: L(3) });
  assert.deepEqual(Fa.pedirAdopcion(G, L(2), L(4), T0), { ok: false, motivo: "pendiente", hijo: L(3) }, "un pedido por matrimonio a la vez");
  assert.deepEqual(Fa.responderAdopcion(L(3), false, T0), { ok: true, acepta: false, padres: [L(1), L(2)] });
  assert.equal(F.getSaldoCoins(G, L(1)), 100, "si rechazan, se devuelve el trámite");

  // expired after a week, no refund
  Fa.pedirAdopcion(G, L(1), L(3), T0);
  assert.deepEqual(Fa.responderAdopcion(L(3), true, T0 + 8 * DIA), { ok: false, motivo: "sinSolicitud" });
  assert.equal(F.getSaldoCoins(G, L(1)), 70);

  const a = adoptar(1, 3, T0 + 8 * DIA);
  assert.deepEqual(a, { ok: true, acepta: true, padres: [L(1), L(2)], apellido: "" });
  assert.deepEqual(Fa.padresDe(L(3)), [L(1), L(2)]);
  assert.deepEqual(Fa.hijosDe(L(1)), [L(3)]);
  assert.deepEqual(Fa.hijosDe(L(2)), [L(3)]);
  assert.deepEqual(Fa.pedirAdopcion(G, L(2), L(4), T0 + 8 * DIA + 1000), { ok: false, motivo: "porHoy" }, "una adopción por día por persona");
  casar(5, 6);
  assert.deepEqual(Fa.pedirAdopcion(G, L(5), L(3), T0 + 8 * DIA), { ok: false, motivo: "tienePadres", padres: [L(1), L(2)] });

  // with no economy in the group, the fee is free
  F.updateChat(G, { monedas: 0 });
  assert.deepEqual(Fa.pedirAdopcion(G, L(5), L(7), T0), { ok: true, conyuge: L(6), costo: 0 });
  assert.equal(F.getSaldoCoins(G, L(5)), 100);
  assert.deepEqual(Fa.responderAdopcion(L(7), false, T0), { ok: true, acepta: false, padres: [L(5), L(6)] });
  F.updateChat(G, { monedas: 1 });
  fijarSaldo(F, G, L(5), 10);
  assert.deepEqual(Fa.pedirAdopcion(G, L(5), L(7), T0), { ok: false, motivo: "sinCoins", costo: 30 });
  fijarSaldo(F, G, L(5), 100);

  // if another couple asks the same person, the earlier request is dropped and its fee refunded
  casar(8, 9);
  Fa.pedirAdopcion(G, L(5), L(7), T0);
  assert.equal(F.getSaldoCoins(G, L(5)), 70);
  assert.deepEqual(Fa.pedirAdopcion(G, L(8), L(7), T0), { ok: true, conyuge: L(9), costo: 30 });
  assert.equal(F.getSaldoCoins(G, L(5)), 100);
  assert.deepEqual(Fa.responderAdopcion(L(7), false, T0).padres, [L(8), L(9)]);
  // if they divorced before the answer, there is no adoption and it's refunded
  Fa.pedirAdopcion(G, L(8), L(7), T0);
  P.terminarPareja(L(8));
  assert.deepEqual(Fa.responderAdopcion(L(7), true, T0), { ok: false, motivo: "yaNoCasados", padres: [L(8), L(9)] });
  assert.equal(F.getSaldoCoins(G, L(8)), 100);
});

test("el árbol: parentescos calculados, incesto y ciclos", () => {
  // 1+2 have 3 and 4; 3+7 have 8; 4+9 have 10; 5+6 have 11 (another family)
  // (the cap is one adoption per person per day, so each goes on a different day from those parents' previous one)
  adoptar(2, 4, T0 + 10 * DIA);
  casar(3, 7);
  adoptar(3, 8, T0 + 11 * DIA);
  casar(4, 9);
  adoptar(4, 10, T0 + 11 * DIA);
  adoptar(5, 11, T0 + 11 * DIA);

  const r8 = Fa.parientesDe(L(8));
  assert.deepEqual([r8.padres, r8.abuelos, r8.tios, r8.primos, r8.hermanos, r8.conyuge], [[L(3), L(7)], [L(1), L(2)], [L(4)], [L(10)], [], null]);
  const r3 = Fa.parientesDe(L(3));
  assert.deepEqual([r3.conyuge, r3.padres, r3.hijos, r3.hermanos, r3.sobrinos, r3.cunados, r3.suegros], [L(7), [L(1), L(2)], [L(8)], [L(4)], [L(10)], [L(9)], []]);
  const r1 = Fa.parientesDe(L(1));
  assert.deepEqual([r1.hijos, r1.nietos, r1.conyuge], [[L(3), L(4)], [L(8), L(10)], L(2)]);
  const r7 = Fa.parientesDe(L(7));
  assert.deepEqual([r7.suegros, r7.cunados, r7.hijos], [[L(1), L(2)], [L(4)], [L(8)]]);
  assert.equal(Fa.parentescoDe(L(8), L(10)), "tu primo/a");
  assert.equal(Fa.parentescoDe(L(3), L(4)), "tu hermano/a");
  assert.equal(Fa.parentescoDe(L(1), L(8)), "tu nieto/a");
  assert.equal(Fa.parentescoDe(L(8), L(1)), "tu abuelo/a");
  assert.equal(Fa.parentescoDe(L(8), L(4)), "tu tío/a");
  assert.equal(Fa.parentescoDe(L(4), L(8)), "tu sobrino/a");
  assert.equal(Fa.parentescoDe(L(3), L(1)), "tu padre o madre");
  assert.equal(Fa.parentescoDe(L(3), L(11)), null, "otra familia");
  assert.equal(Fa.parentescoDe(L(7), L(4)), null, "los cuñados no son sangre");

  // no incest: neither proposing nor accepting
  assert.deepEqual(P.pedirPareja(L(8), L(10)), { ok: false, motivo: "parientes", parentesco: "tu primo/a" });
  assert.deepEqual(P.aceptarPareja(L(10), L(8)), { ok: false, motivo: "parientes", parentesco: "tu primo/a" });
  assert.equal(P.pedirPareja(L(8), L(11)).ok, true, "de otra familia sí");
  P.cancelarSolicitud(L(8));

  // cycles and relatives in adoption
  assert.deepEqual(Fa.pedirAdopcion(G, L(3), L(1), T0 + 20 * DIA), { ok: false, motivo: "antepasado" }, "no se adopta al abuelo de los propios hijos");
  assert.deepEqual(Fa.pedirAdopcion(G, L(1), L(7), T0 + 20 * DIA), { ok: false, motivo: "pariente", parentesco: "la pareja de tu hijo/a" }, "la nuera no se adopta");
  // 12 emancipates from nobody: they have no parents; if 1+2 adopt them and then 3 tries, they already have parents
  assert.deepEqual(Fa.emanciparse(L(12)), { ok: false, motivo: "sinPadres" });
});

test("apellido: lo elige el matrimonio y lo heredan los que llevaban el mismo", () => {
  assert.deepEqual(Fa.elegirApellido(L(12), "Pérez"), { ok: false, motivo: "sinCasar" });
  assert.deepEqual(Fa.elegirApellido(L(3), ""), { ok: false, motivo: "invalido" });
  assert.deepEqual(Fa.elegirApellido(L(3), "@Rodríguez"), { ok: false, motivo: "invalido" });
  assert.deepEqual(Fa.elegirApellido(L(3), "R"), { ok: false, motivo: "invalido" });
  assert.deepEqual(Fa.elegirApellido(L(3), "  Rodríguez   "), { ok: true, apellido: "Rodríguez", conyuge: L(7) });
  assert.deepEqual([3, 7, 8].map((n) => Fa.apellidoDe(L(n))), ["Rodríguez", "Rodríguez", "Rodríguez"]);
  assert.equal(Fa.apellidoDe(L(1)), "", "los padres no cambian");

  assert.deepEqual(Fa.elegirApellido(L(1), "Pérez"), { ok: true, apellido: "Pérez", conyuge: L(2) });
  assert.deepEqual([1, 2, 4, 10].map((n) => Fa.apellidoDe(L(n))), ["Pérez", "Pérez", "Pérez", "Pérez"], "baja por los hijos sin apellido y sus hijos");
  assert.equal(Fa.apellidoDe(L(3)), "Rodríguez", "el hijo que eligió el suyo con su matrimonio se lo queda");
  assert.equal(Fa.apellidoDe(L(8)), "Rodríguez");

  // an adoptee inherits the family surname
  const a = adoptar(1, 12, T0 + 30 * DIA);
  assert.equal(a.apellido, "Pérez");
  assert.equal(Fa.apellidoDe(L(12)), "Pérez");

  assert.equal(Fa.textoFamilias(), "👨‍👩‍👧‍👦 *FAMILIAS*\n\n1. *Pérez* — 5 personas: Persona 1, Persona 2, Persona 4, Persona 10 y Persona 12\n2. *Rodríguez* — 3 personas: Persona 3, Persona 7 y Persona 8");
});

test("emancipar y desheredar: se pierden los padres y el apellido de la familia", () => {
  assert.deepEqual(Fa.emanciparse(L(12)), { ok: true, padres: [L(1), L(2)], apellidoPerdido: "Pérez" });
  assert.equal(Fa.padresDe(L(12)), null);
  assert.equal(Fa.apellidoDe(L(12)), "");
  assert.deepEqual(Fa.emanciparse(L(12)), { ok: false, motivo: "sinPadres" });

  assert.deepEqual(Fa.desheredar(L(5), L(8)), { ok: false, motivo: "noEsTuHijo" });
  assert.deepEqual(Fa.desheredar(L(1), L(4)), { ok: true, padres: [L(2), L(1)], apellidoPerdido: "Pérez" }, "los padres van en el orden en que pidieron: 2 pidió a 4");
  assert.deepEqual([4, 10].map((n) => Fa.apellidoDe(L(n))), ["", ""], "el hijo desheredado y su hijo dejan el apellido");
  assert.deepEqual(Fa.parientesDe(L(3)).hermanos, [], "ya no son hermanos");
  assert.deepEqual(Fa.desheredar(L(2), L(3)), { ok: true, padres: [L(1), L(2)], apellidoPerdido: "" }, "3 llevaba otro apellido: lo conserva");
  assert.equal(Fa.apellidoDe(L(3)), "Rodríguez");
  // back into the family
  adoptar(1, 3, T0 + 40 * DIA);
  assert.equal(Fa.apellidoDe(L(3)), "Pérez", "al ser adoptado toma el de la familia, y arrastra a los suyos");
  assert.deepEqual([7, 8].map((n) => Fa.apellidoDe(L(n))), ["Rodríguez", "Pérez"], "su hijo lo sigue; la pareja conserva el suyo hasta que elijan uno");
});

test("textos: .familia, .familias vacío y la línea del perfil", () => {
  assert.equal(
    Fa.textoFamilia(L(8)),
    ["👨‍👩‍👧‍👦 *Familia Pérez* · Persona 8", "👨‍👩‍👧 Padres: Persona 3 y Persona 7", "🧓 Abuelos: Persona 1 y Persona 2"].join("\n"),
  );
  assert.equal(
    Fa.textoFamilia(L(3), true),
    ["👨‍👩‍👧‍👦 *Familia Pérez* · Persona 3", "💍 Cónyuge: Persona 7", "👨‍👩‍👧 Padres: Persona 1 y Persona 2", "👶 Hijos: Persona 8"].join("\n"),
  );
  assert.equal(Fa.textoFamilia(L(13), true), "👨‍👩‍👧‍👦 *Familia de Persona 13*\nNo tenés familia todavía. Un matrimonio adopta con .adoptar @persona, y elige apellido con .apellido.");
  assert.equal(Fa.textoFamilia(L(13)), "👨‍👩‍👧‍👦 *Familia de Persona 13*\nNo tiene familia todavía. Un matrimonio adopta con .adoptar @persona, y elige apellido con .apellido.");
  assert.equal(Fa.resumenFamilia(L(8)), "👨‍👩‍👧 Familia Pérez · padres: Persona 3 y Persona 7");
  assert.equal(Fa.resumenFamilia(L(1)), "👨‍👩‍👧 Familia Pérez · 1 hijo");
  assert.equal(Fa.resumenFamilia(L(13)), "");
  assert.match(Pf.textoPerfil(G, L(8), F.getUser(L(8))).texto, /\n👨‍👩‍👧 Familia Pérez · padres: Persona 3 y Persona 7(\n|$)/);
  assert.doesNotMatch(Pf.textoPerfil(G, L(13), F.getUser(L(13))).texto, /👨‍👩‍👧/);
});

test("plugins: .adoptar, .si/.no, .besar entre parientes, .apellido, .familia, .emancipar", async () => {
  const client = globalThis.client;
  const correr = (P, sender, text = "", command = P.cmd[0], mentioned = []) => P.run({ chat: G, sender, isGroup: true, mentionedJid: mentioned }, { client, text, usedPrefix: ".", command });
  // the last message with text (some plugins send a reaction after the text)
  const ultimoTexto = () => [...globalThis.enviados].reverse().find((e) => e.msg?.text)?.msg;
  const Adoptar = (await import("../plugins/familia-adoptar.js")).default;
  const Si = (await import("../plugins/pareja-casamiento-aceptar.js")).default;
  const No = (await import("../plugins/pareja-casamiento-rechazar.js")).default;
  const Besar = (await import("../plugins/fun-besar.js")).default;
  const Apellido = (await import("../plugins/familia-apellido.js")).default;
  const Familia = (await import("../plugins/familia-familia.js")).default;
  const Emancipar = (await import("../plugins/familia-emancipar.js")).default;

  await correr(Adoptar, L(13), "");
  assert.match(ultimoEnviado().msg.text, /¿A quién\? Uso: \.adoptar @persona/);
  await correr(Adoptar, L(13), "@14", "adoptar", [L(14)]);
  assert.match(ultimoEnviado().msg.text, /Para adoptar hay que estar casado/);
  casar(13, 14);
  fijarSaldo(F, G, L(13), 100);
  // 12 has no parents (they emancipated): 13 and 14 adopt them
  await correr(Adoptar, L(13), "@12", "adoptar", [L(12)]);
  assert.equal(ultimoTexto().text, "👨‍👩‍👧 @12, Persona 13 y Persona 14 te quieren adoptar (ya pagaron los 30 UruCoins del trámite). Respondé con .si o .no; el pedido vence en 7 días.");
  assert.deepEqual(ultimoTexto().mentions, [L(12)]);
  await correr(No, L(12));
  assert.equal(ultimoEnviado().msg.text, "💔 @12 rechazó la adopción de Persona 13 y Persona 14.");
  assert.equal(F.getSaldoCoins(G, L(13)), 100);
  await correr(Adoptar, L(13), "@12", "adoptar", [L(12)]);
  await correr(Si, L(12));
  assert.equal(ultimoEnviado().msg.text, "👨‍👩‍👧 ¡@12 ya es parte de la familia! Sus padres son Persona 13 y Persona 14.");
  assert.deepEqual(Fa.padresDe(L(12)), [L(13), L(14)]);
  // with no adoption or proposal pending, .si carries on with the marriage as before (12 has no partner)
  const antes = globalThis.enviados.length;
  await correr(Si, L(12));
  assert.equal(globalThis.enviados.length, antes + 1);
  assert.match(ultimoEnviado().msg.text, /Primero debes tener pareja/);

  await correr(Apellido, L(13), "");
  assert.match(ultimoEnviado().msg.text, /No tenés apellido/);
  await correr(Apellido, L(13), "Sosa");
  assert.equal(ultimoEnviado().msg.text, "📜 Desde hoy son la familia *Sosa*: Persona 13 y Persona 14, y los hijos que tengan lo heredan.");
  assert.equal(Fa.apellidoDe(L(12)), "Sosa");
  await correr(Apellido, L(12), "Otro");
  assert.match(ultimoEnviado().msg.text, /El apellido lo elige un matrimonio/);

  await correr(Familia, L(12), "");
  assert.equal(ultimoEnviado().msg.text, "👨‍👩‍👧‍👦 *Familia Sosa* · Persona 12\n👨‍👩‍👧 Padres: Persona 13 y Persona 14");
  await correr(Familia, L(12), "", "familias");
  assert.match(ultimoEnviado().msg.text, /^👨‍👩‍👧‍👦 \*FAMILIAS\*\n\n1\. \*Pérez\* — 4 personas: Persona 1, Persona 2, Persona 3 y Persona 8\n2\. \*Sosa\* — 3 personas: Persona 12, Persona 13 y Persona 14\n3\. \*Rodríguez\* — 1 persona: Persona 7$/);

  // kisses and dating within the family: no
  await correr(Besar, L(12), "@13", "besar", [L(13)]);
  assert.equal(ultimoEnviado().msg.text, "🚫 ¡Es tu padre o madre! En la familia los besos van en la mejilla, y esos no cuentan.");
  const Pareja = (await import("../plugins/pareja-elegir.js")).default;
  await correr(Pareja, L(8), "@1", "pareja", [L(1)]);
  assert.equal(ultimoEnviado().msg.text, "🤢 ¡Es tu abuelo/a! Pareja con un familiar no, respete.");

  await correr(Emancipar, L(12), "", "emancipar");
  assert.equal(ultimoEnviado().msg.text, "🧳 Persona 12 se emancipó: ya no es hijo de Persona 13 y Persona 14 y deja el apellido Sosa.");
  await correr(Emancipar, L(13), "@12", "desheredar", [L(12)]);
  assert.match(ultimoEnviado().msg.text, /Persona 12 no es hijo tuyo/);
});
