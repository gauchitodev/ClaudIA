import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, G, clienteFalso } from "./helpers.mjs";

let F, P, T;
const DIA = 24 * 60 * 60 * 1000;
const persona = (n) => ({ chat: G, sender: `${n}@lid`, senderJid: `${n}@s.whatsapp.net`, pushName: `Persona ${n}` });
before(async () => {
  ({ F } = await prepararBase("parejas"));
  P = await import("../lib/parejas.js");
  T = await import("../lib/tiempo.js");
  for (const n of [1, 2, 3, 4]) F.initDataDB(persona(n));
});

test("parejas: pedir, aceptar y terminar; un pedido pendiente no es una pareja", () => {
  assert.deepEqual(P.pedirPareja("1@lid", "1@lid"), { ok: false, motivo: "mismo" });
  assert.equal(P.pedirPareja("1@lid", "2@lid", G).ok, true);
  assert.equal(P.parejaDe("1@lid"), null, "pedir no forma pareja");
  assert.equal(P.parejaDe("2@lid"), null);
  assert.equal(P.solicitudDe("1@lid").para, "2@lid");
  // mientras está pendiente, 2 puede recibir un beso de cualquiera y 1 puede seguir pidiendo a otra persona
  assert.equal(P.pedirPareja("3@lid", "2@lid").ok, true, "otra persona también le puede pedir a 2");
  assert.deepEqual(P.pedirPareja("2@lid", "1@lid"), { ok: false, motivo: "teLoPidio" });
  assert.deepEqual(P.aceptarPareja("2@lid", "4@lid"), { ok: false, motivo: "sinSolicitud" });
  assert.deepEqual(P.rechazarPareja("2@lid", "4@lid"), { ok: false, motivo: "sinSolicitud" });

  assert.equal(P.aceptarPareja("2@lid", "1@lid").ok, true);
  assert.equal(P.parejaDe("1@lid").pareja, "2@lid");
  assert.equal(P.parejaDe("2@lid").pareja, "1@lid");
  assert.ok(P.sonPareja("1@lid", "2@lid"));
  assert.equal(P.solicitudDe("3@lid"), null, "al formarse la pareja se borran los pedidos hacia 2");
  assert.deepEqual(P.pedirPareja("1@lid", "2@lid"), { ok: false, motivo: "yaJuntos" });
  assert.deepEqual(P.pedirPareja("1@lid", "3@lid"), { ok: false, motivo: "vosTenesPareja", pareja: "2@lid" });
  assert.deepEqual(P.pedirPareja("3@lid", "2@lid"), { ok: false, motivo: "tienePareja", pareja: "1@lid" });
  assert.deepEqual(P.aceptarPareja("1@lid", "2@lid"), { ok: false, motivo: "yaJuntos" });
  assert.equal(P.listaParejas().length, 1);

  assert.equal(P.terminarPareja("3@lid").motivo, "sinPareja");
  const fin = P.terminarPareja("2@lid");
  assert.equal(fin.ok, true);
  assert.equal(fin.pareja, "1@lid");
  assert.equal(P.parejaDe("1@lid"), null);
  assert.deepEqual(P.exParejasDe("1@lid"), ["2@lid"]);
  assert.deepEqual(P.exParejasDe("2@lid"), ["1@lid"]);
  // vuelven: la ex deja de figurar como ex mientras están juntos
  P.pedirPareja("2@lid", "1@lid");
  P.aceptarPareja("1@lid", "2@lid");
  assert.deepEqual(P.exParejasDe("1@lid"), []);
  P.terminarPareja("1@lid");
});

test("parejas: rechazar, vencimiento y aceptar cuando alguno se puso de novio mientras tanto", () => {
  P.pedirPareja("3@lid", "4@lid");
  assert.equal(P.rechazarPareja("4@lid", "3@lid").ok, true);
  assert.equal(P.solicitudDe("3@lid"), null);

  const hace8dias = Date.now() - 8 * DIA;
  P.pedirPareja("3@lid", "4@lid", G, hace8dias);
  assert.equal(P.solicitudDe("3@lid", hace8dias + DIA).para, "4@lid", "al día sigue viva");
  assert.deepEqual(P.aceptarPareja("4@lid", "3@lid"), { ok: false, motivo: "sinSolicitud" }, "a la semana venció");

  P.pedirPareja("3@lid", "4@lid");
  P.pedirPareja("1@lid", "3@lid");
  P.aceptarPareja("3@lid", "1@lid"); // 3 se puso de novio con 1 antes de que 4 contestara
  assert.deepEqual(P.aceptarPareja("4@lid", "3@lid"), { ok: false, motivo: "sinSolicitud" }, "el pedido de 3 se borró al formar pareja");
  P.pedirPareja("4@lid", "2@lid");
  P.pedirPareja("2@lid", "4@lid"); // 2 recibe "teLoPidio"
  P.aceptarPareja("2@lid", "4@lid");
  assert.deepEqual(P.aceptarPareja("1@lid", "3@lid"), { ok: false, motivo: "yaJuntos" });
  P.terminarPareja("1@lid");
  P.terminarPareja("2@lid");
});

test("parejas: casamiento con una semana de relación, propuesta, sí y no, y ayudas del owner", () => {
  P.fijarPareja("1@lid", "2@lid", Date.now() - 2 * DIA);
  assert.deepEqual(P.proponerCasamiento("3@lid"), { ok: false, motivo: "sinPareja" });
  assert.deepEqual(P.proponerCasamiento("1@lid"), { ok: false, motivo: "pocoTiempo" });
  P.fijarPareja("1@lid", "2@lid", Date.now() - 8 * DIA);
  assert.deepEqual(P.responderCasamiento("2@lid", true), { ok: false, motivo: "sinPropuesta" });
  assert.deepEqual(P.proponerCasamiento("1@lid"), { ok: true, pareja: "2@lid" });
  assert.deepEqual(P.proponerCasamiento("2@lid"), { ok: false, motivo: "yaTePropuso" });
  assert.deepEqual(P.responderCasamiento("1@lid", true), { ok: false, motivo: "sinPropuesta" }, "el que propuso no se responde a sí mismo");
  assert.equal(P.responderCasamiento("2@lid", false).ok, true);
  assert.equal(P.parejaDe("1@lid").casadosDesde, 0);
  P.proponerCasamiento("1@lid");
  assert.equal(P.responderCasamiento("2@lid", true).ok, true);
  assert.ok(P.parejaDe("2@lid").casadosDesde > 0);
  assert.deepEqual(P.proponerCasamiento("1@lid"), { ok: false, motivo: "yaCasados" });
  assert.equal(P.terminarPareja("1@lid").casados, true);

  // el owner arma parejas de una, y si alguno estaba con otra persona esa relación termina
  P.fijarPareja("1@lid", "2@lid");
  assert.equal(P.fijarPareja("2@lid", "3@lid").ok, true);
  assert.equal(P.parejaDe("1@lid"), null);
  assert.equal(P.parejaDe("3@lid").pareja, "2@lid");
  assert.ok(P.exParejasDe("1@lid").includes("2@lid"));
  assert.deepEqual(P.fijarCasamiento("1@lid", "2@lid"), { ok: false, motivo: "noSonPareja" });
  assert.equal(P.fijarCasamiento("2@lid", "3@lid", Date.now() - 3 * DIA).ok, true);
  assert.ok(P.parejaDe("2@lid").casadosDesde > 0);
  P.terminarPareja("2@lid");

  assert.equal(P.tiempoIndicado("@1 @2"), 1000);
  assert.equal(P.tiempoIndicado("@1 @2 | 2 días 3 horas"), 2 * DIA + 3 * 3600000);
  assert.equal(P.tiempoIndicado("@1 @2 | cualquier cosa"), null);
  // los "@número" escritos a mano piden al menos tres dígitos, como en lidMencionado
  F.initDataDB(persona(111));
  F.initDataDB(persona(222));
  assert.deepEqual(P.dosPersonas({ mentionedJid: ["1@lid", "2@lid"] }, ""), ["1@lid", "2@lid"]);
  assert.deepEqual(P.dosPersonas({}, "@111 @222 | 1 día"), ["111@lid", "222@lid"]);
  assert.deepEqual(P.dosPersonas({}, "+111 +222"), ["111@lid", "222@lid"]);
  assert.equal(P.dosPersonas({}, "@111 @999"), null, "los dos tienen que existir");
  assert.equal(P.dosPersonas({}, "@111 @111"), null);
});

test("tiempo: duracionLarga y parsearDuracion", () => {
  assert.equal(T.duracionLarga(0), "0 segundos");
  assert.equal(T.duracionLarga(45 * 1000), "45 segundos");
  assert.equal(T.duracionLarga(3 * 3600000 + 5 * 60000 + 7000), "3 horas, 5 minutos, 7 segundos");
  assert.equal(T.duracionLarga(2 * DIA + 3600000 + 7000), "2 días, 1 hora", "pasado un día no se muestran los segundos");
  assert.equal(T.duracionLarga(400 * DIA), "1 año, 1 mes, 5 días");
  assert.equal(T.parsearDuracion("3 días 2 horas"), 3 * DIA + 2 * 3600000);
  assert.equal(T.parsearDuracion("45 minutos"), 45 * 60000);
  assert.equal(T.parsearDuracion("10s"), 10000);
  assert.equal(T.parsearDuracion("nada"), 0);
});

test("besar: un pedido de pareja pendiente no bloquea el beso, una pareja de verdad sí", async () => {
  globalThis.txt = (await import("../lib/strings.js")).default;
  const { default: besar } = await import("../plugins/fun-besar.js");
  const client = clienteFalso();
  const besa = async (de, a) => {
    globalThis.enviados = [];
    await besar.run({ chat: G, sender: de, mentionedJid: [a] }, { client, text: `@${a.split("@")[0]}`, usedPrefix: ".", command: "besar" });
    return globalThis.enviados.find((x) => x.msg?.text)?.msg.text; // el último envío puede ser la reacción
  };
  P.pedirPareja("1@lid", "2@lid"); // 1 le pidió a 2, sin respuesta
  assert.doesNotMatch(await besa("3@lid", "1@lid"), /TIENE PAREJA/, "el que pidió sigue libre");
  assert.doesNotMatch(await besa("3@lid", "2@lid"), /TIENE PAREJA/, "el pedido no cuenta como pareja");
  P.aceptarPareja("2@lid", "1@lid");
  assert.match(await besa("3@lid", "2@lid"), /TIENE PAREJA/);
  assert.match(await besa("1@lid", "3@lid"), /SOS INFIEL/);
  assert.doesNotMatch(await besa("1@lid", "2@lid"), /TIENE PAREJA|INFIEL/, "entre ellos sí");
  P.terminarPareja("1@lid");
});

test("parejas: migración desde las columnas viejas de users", async () => {
  // 1 y 2 mutuos y casados, 3 le pidió a 4 sin respuesta, 4 tiene a 1 en el historial
  F.updateUser("1@lid", { couple: "2@s.whatsapp.net", coupleTime: 1000, married: "2@s.whatsapp.net", marriedTime: 5000, couplesHistory: "[]" });
  F.updateUser("2@lid", { couple: "1@s.whatsapp.net", coupleTime: 1200, married: "1@s.whatsapp.net", marriedTime: 5000 });
  F.updateUser("3@lid", { couple: "4@s.whatsapp.net" });
  F.updateUser("4@lid", { couplesHistory: JSON.stringify(["1@s.whatsapp.net", "inexistente@s.whatsapp.net"]) });
  db.exec(`DROP TABLE parejas; DROP TABLE solicitudes_pareja; DROP TABLE exparejas`);
  globalThis.db = F.loadDatabase();
  const p = P.parejaDe("1@lid");
  assert.equal(p.pareja, "2@lid");
  assert.equal(p.desde, 1000);
  assert.equal(p.casadosDesde, 5000);
  assert.equal(P.listaParejas().length, 1);
  assert.equal(P.solicitudDe("3@lid").para, "4@lid");
  assert.deepEqual(P.exParejasDe("4@lid"), ["1@lid"]);
  assert.deepEqual(P.exParejasDe("1@lid"), ["4@lid"]);
  globalThis.db = F.loadDatabase(); // idempotente: no duplica ni pisa
  assert.equal(P.listaParejas().length, 1);
});
