import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, ultimoEnviado } from "./helpers.mjs";

// The job board (lib/bolsa.js): .gente with everyone's trade, level and how they stand, .disponible / .nodisponible
// to be down as looking for work (seen by the bosses in .puestos and .empresas, with the .contratar to copy), and the
// one-day jobs a boss posts with .ofrecerchanga and the first one takes with .agarrar.
let F, L, E, B;
before(async () => {
  ({ F } = await prepararBase("bolsa"));
  L = await import("../lib/laburos.js");
  E = await import("../lib/empresas.js");
  B = await import("../lib/bolsa.js");
  E._dep.azar = () => 0;
});

const DIA = 24 * 3600e3;
const [ANA, BETO, CARLA, DANI, EMA] = ["300000000000081@lid", "300000000000082@lid", "300000000000083@lid", "300000000000084@lid", "300000000000085@lid"];
const NOMBRES = { [ANA]: "Ana", [BETO]: "Beto", [CARLA]: "Carla", [DANI]: "Dani", [EMA]: "Ema" };

function gente(G) {
  for (const [quien, nombre] of Object.entries(NOMBRES)) F.initDataDB({ chat: G, sender: quien, senderJid: "", pushName: nombre });
}
function laburante(G, quien, oficio, { cobros = 0, coins = 0 } = {}) {
  assert.ok(L.tomarLaburo(G, quien, oficio).ok);
  db.prepare(`UPDATE laburos SET cobros = ? WHERE chat = ? AND usuario = ?`).run(cobros, G, quien);
  if (coins) F.moverCoins(G, quien, coins, "test_carga");
}
function patron(G, quien, { caja = 0, coins = 0 } = {}) {
  laburante(G, quien, "camionero", { cobros: L.cobrosParaNivel(10), coins: E.EMPRESA.COSTO_FUNDAR + caja + coins });
  assert.ok(E.fundar(G, quien, `Fletes ${NOMBRES[quien]}`).ok);
  if (caja) assert.ok(E.depositar(G, quien, caja).ok);
  return E.empresaDe(G, quien);
}
const caja = (e) => db.prepare(`SELECT caja FROM empresas WHERE id = ?`).get(e.id).caja;

test(".disponible / .nodisponible: anotarse con una línea, renovar, vencer, y salir al ser contratado", () => {
  const G = "disponible@g.us";
  gente(G);
  patron(G, ANA, { caja: 500 });
  laburante(G, BETO, "mozo", { cobros: L.cobrosParaNivel(3) });

  assert.match(B.anotarDisponible(G, ANA).error, /Sos patrón de \*Fletes Ana\*: el laburo lo das vos/);
  assert.match(B.anotarDisponible(G, BETO, "llamame al 099 123 456").error, /Nada de teléfonos/);
  assert.match(B.anotarDisponible(G, BETO, "x".repeat(61)).error, /hasta 60 letras/);
  const r = B.anotarDisponible(G, BETO, "manejo camión y no choco");
  assert.match(r.mensaje, /^📋 Anotado: @300000000000082 busca laburo, mozo nivel 3: «manejo camión y no choco»\.\nLos patrones te ven en \.puestos y \.empresas/);
  assert.deepEqual(r.mentions, [BETO]);
  assert.match(B.anotarDisponible(G, BETO).mensaje, /^📋 Renovado: .*mozo nivel 3\./, "sin línea, la borra");
  assert.match(B.anotarDisponible(G, CARLA).mensaje, /sin oficio \(con uno, \.laburos, te miran mejor\)/);

  // It lapses after DISPONIBLE_DIAS days.
  db.prepare(`UPDATE bolsa_disponibles SET desde = ? WHERE usuario = ?`).run(Date.now() - B.BOLSA.DISPONIBLE_DIAS * DIA - 1000, CARLA);
  assert.deepEqual(B.disponibles(G).map((d) => d.usuario), [BETO]);
  assert.match(B.quitarDisponible(G, CARLA).error, /No estabas anotado/);

  // Hired, off the board.
  assert.ok(E.ofrecer(G, ANA, BETO, "chofer", 30).ok);
  assert.ok(E.firmar(G, BETO).ok);
  assert.equal(B.estaDisponible(G, BETO), false);
  // An employee can still put themselves down (for the one-day jobs), and is told.
  assert.match(B.anotarDisponible(G, BETO).mensaje, /hoy laburás en \*Fletes Ana\*; para que otro patrón te contrate, primero \.renunciar/);
  assert.match(B.quitarDisponible(G, BETO).mensaje, /te saqué de la bolsa/);
});

test(".gente: buscan, libres, empleados y patrones, con oficio y nivel, sin arrobar, y solo los que siguen en el grupo", () => {
  const G = "gente@g.us";
  gente(G);
  assert.match(B.textoGente(G), /Acá nadie tiene oficio todavía/);
  patron(G, ANA, { caja: 200 });
  laburante(G, BETO, "mozo", { cobros: L.cobrosParaNivel(2) });
  laburante(G, CARLA, "tambero", { cobros: L.cobrosParaNivel(5) });
  laburante(G, DANI, "peon");
  assert.ok(E.ofrecer(G, ANA, CARLA, "chofer", 30).ok);
  assert.ok(E.firmar(G, CARLA).ok);
  B.anotarDisponible(G, BETO, "lo que sea");
  B.anotarDisponible(G, EMA);

  const t = B.textoGente(G);
  assert.equal(
    t,
    [
      "👥 *Bolsa de trabajo del grupo*",
      "",
      "🔎 *Buscan laburo* (2)\n• Beto — mozo nv.2 · «lo que sea»\n• Ema — sin oficio",
      "",
      "🟢 *Libres* (1)\n• Dani — peón de estancia nv.1",
      "",
      "👷 *Empleados* (1)\n• Carla — tambero nv.5 · chofer nv.1 en *Fletes Ana*",
      "",
      "🏭 *Patrones* (1)\n• Ana — camionero nv.10 · 🚛 *Fletes Ana* (Changarín)",
      "",
      "_.disponible te anota como que buscás laburo (y .nodisponible te saca): los patrones te ven en .puestos y .empresas. Quien no tiene oficio ni se anotó no aparece._",
    ].join("\n"),
  );
  assert.doesNotMatch(t, /@\d/, "no arroba a nadie");
  // Whoever left the group isn't on it.
  const sinDani = B.textoGente(G, [ANA, BETO, CARLA, EMA].map((id) => ({ id })));
  assert.doesNotMatch(sinDani, /Dani/);
  assert.match(sinDani, /Beto/);
});

test("los patrones ven quién busca, con el .contratar listo para copiar", () => {
  const G = "patrones@g.us";
  gente(G);
  const e = patron(G, ANA, { caja: 200 });
  assert.equal(B.textoBuscanParaPatron(G, ANA), "", "sin nadie buscando, nada");
  laburante(G, BETO, "mozo");
  laburante(G, CARLA, "tambero");
  B.anotarDisponible(G, BETO, "madrugo");
  B.anotarDisponible(G, CARLA);
  B.anotarDisponible(G, DANI);
  // Carla already did the books somewhere else: the post she has levels in is the one offered.
  db.prepare(`INSERT INTO empresas_experiencia (chat, usuario, puesto, cobros) VALUES (?, ?, 'contador', ?)`).run(G, CARLA, L.cobrosParaNivel(3));
  // Dani works for somebody: not hireable, so not shown.
  patron(G, EMA);
  assert.ok(E.ofrecer(G, EMA, DANI, "chofer", 30).ok);
  assert.ok(E.firmar(G, DANI).ok);
  B.anotarDisponible(G, DANI);

  const t = B.textoBuscanParaPatron(G, ANA);
  assert.match(t, /^🔎 \*Buscan laburo\* \(2\): copiá la línea/);
  assert.match(t, /• Beto — mozo nv\.1 · «madrugo»\n {3}\.contratar @300000000000082 chofer 30/);
  assert.match(t, /• Carla — tambero nv\.1 · ya es contador nv\.3\n {3}\.contratar @300000000000083 contador 35/);
  assert.doesNotMatch(t, /Dani/);
  assert.equal(B.textoBuscanParaPatron(G, BETO), "", "eso es para los patrones");
  assert.ok(e);
});

test(".ofrecerchanga: de un patrón, con la paga entre topes, de la caja o del bolsillo, de a una y pocas por día", () => {
  const G = "ofrecer@g.us";
  gente(G);
  laburante(G, BETO, "mozo", { coins: 500 });
  assert.match(B.ofrecerChanga(G, BETO, ["50", "Lavar", "copas"]).error, /las ofrece un patrón/);
  const e = patron(G, ANA, { caja: 120, coins: 300 });
  assert.match(B.ofrecerChanga(G, ANA, ["50"]).error, /^Se publica así: \.ofrecerchanga 50 Descargar/);
  assert.match(B.ofrecerChanga(G, ANA, ["cincuenta", "algo", "lindo"]).error, /^Se publica así/);
  assert.match(B.ofrecerChanga(G, ANA, ["9", "Descargar", "el", "camión"]).error, /de 10 a 100 UruCoins/);
  assert.match(B.ofrecerChanga(G, ANA, ["101", "Descargar", "el", "camión"]).error, /de 10 a 100 UruCoins\. Para más, contratá/);
  assert.match(B.ofrecerChanga(G, ANA, ["50", "Llamar", "a", "@59899"]).error, /Nada de arrobar/);
  assert.match(B.ofrecerChanga(G, ANA, ["50", "bolsillo"]).error, /^Se publica así/);

  // The ones looking for work are told, by mention.
  B.anotarDisponible(G, BETO);
  const r = B.ofrecerChanga(G, ANA, ["80", "Descargar", "el", "camión", "de", "soja"]);
  assert.ok(r.ok, r.error);
  assert.equal(caja(e), 40, "la paga sale de la caja al publicar");
  assert.match(r.texto, /^🧰 \*CHANGA DE UN DÍA\* — de \*Fletes Ana\* \(🚛 paga la caja\)\n«Descargar el camión de soja»\n\nPaga \*80 UruCoins\* al primero que la agarre: \.agarrar/);
  assert.match(r.texto, /🔎 Para los que buscan laburo: @300000000000082$/);
  assert.deepEqual(r.mentions, [ANA, BETO]);
  assert.match(B.ofrecerChanga(G, ANA, ["20", "Otra", "cosa"]).error, /Ya tenés una changa esperando a alguien \(«Descargar el camión de soja»\): de a una/);

  // Taken, the next one; from the pocket when asked, or when the caja doesn't cover it it says so.
  assert.ok(B.agarrarChanga(G, BETO).ok);
  assert.match(B.ofrecerChanga(G, ANA, ["50", "Barrer", "el", "galpón"]).error, /En la caja de \*Fletes Ana\* hay 40 y la changa paga 50\. .*\.ofrecerchanga 50 bolsillo Barrer el galpón/);
  const b = B.ofrecerChanga(G, ANA, ["50", "bolsillo", "Barrer", "el", "galpón"]);
  assert.match(b.texto, /^🧰 \*CHANGA DE UN DÍA\* — de @300000000000081 \(de su bolsillo\)/);
  assert.equal(F.getSaldoCoins(G, ANA), 250);
  // POR_DIA a day.
  db.prepare(`UPDATE bolsa_changas SET estado = 'vencida' WHERE chat = ?`).run(G);
  assert.match(B.ofrecerChanga(G, ANA, ["10", "Una", "más"]).error, /Ya ofreciste 2 changas hoy/);
  assert.match(B.textoChangasDelDia(G), /^🧰 \*Changas de un día\*\nSe publica así/);
});

test(".agarrar: el primero que contesta cobra; nadie la suya, una por día, y el mismo par pocas veces por semana", () => {
  const G = "agarrar@g.us";
  gente(G);
  const e = patron(G, ANA, { caja: 1000 });
  const otra = patron(G, EMA, { caja: 1000 });
  laburante(G, BETO, "mozo");
  assert.match(B.agarrarChanga(G, BETO).error, /No hay ninguna changa de un día esperando/);

  const r = B.ofrecerChanga(G, ANA, ["60", "Cargar", "fardos"]);
  B.anotarMensaje(r.id, "MSG-FARDOS");
  assert.match(B.agarrarChanga(G, ANA).error, /Es tu propia changa/);
  const hecho = B.agarrarChanga(G, BETO, { citado: "MSG-FARDOS" });
  assert.match(hecho.mensaje, /^🤝 @300000000000082 agarró la changa de \*Fletes Ana\*: «Cargar fardos»\. .+\n🪙 Cobró \*60 UruCoins\*, de la caja de la empresa\. Tiene 60\.$/);
  assert.deepEqual(hecho.mentions, [BETO, ANA]);
  assert.equal(caja(e), 940);
  assert.match(B.agarrarChanga(G, CARLA, { citado: "MSG-FARDOS" }).error, /No hay ninguna changa de un día esperando/, "ya la agarraron");

  // One a day per person.
  B.ofrecerChanga(G, EMA, ["30", "Pintar", "la", "cerca"]);
  assert.match(B.agarrarChanga(G, BETO).error, /Hoy ya hiciste una changa de un día/);
  // With two open, which one.
  B.ofrecerChanga(G, ANA, ["40", "Lavar", "el", "camión"]);
  assert.match(B.agarrarChanga(G, CARLA).error, /Hay 2 changas de un día[^]*1\. «Pintar la cerca» — 30, de \*Fletes Ema\*\n2\. «Lavar el camión» — 40, de \*Fletes Ana\*/);
  assert.match(B.agarrarChanga(G, CARLA, { numero: 2 }).mensaje, /agarró la changa de \*Fletes Ana\*: «Lavar el camión»/);
  // A boss can take another boss's one, not one of their own company's.
  assert.match(B.agarrarChanga(G, ANA, { numero: 1 }).mensaje, /agarró la changa de \*Fletes Ema\*/);
  assert.equal(caja(otra), 970);

  // The same boss and the same person: MISMO_PAR_MAX a week.
  const ayer = () => db.prepare(`UPDATE bolsa_changas SET tomada = tomada - ?, creada = creada - ? WHERE chat = ?`).run(DIA, DIA, G);
  ayer();
  B.ofrecerChanga(G, ANA, ["40", "Lavar", "el", "camión", "otra", "vez"]);
  assert.ok(B.agarrarChanga(G, BETO).ok, "la segunda de Ana a Beto");
  ayer();
  B.ofrecerChanga(G, ANA, ["40", "Y", "otra", "más"]);
  assert.match(B.agarrarChanga(G, BETO).error, /Ya le hiciste 2 changas a Ana esta semana/);
  assert.ok(B.agarrarChanga(G, DANI).ok, "otro sí");
});

test("sin nadie que la agarre, la plata vuelve: a la caja o al bolsillo, por el trabajo pendiente", async () => {
  const P = await import("../lib/pendientes.js");
  const client = clienteFalso();
  const G = "vence@g.us";
  gente(G);
  const e = patron(G, ANA, { caja: 100, coins: 100 });
  const r = B.ofrecerChanga(G, ANA, ["70", "Ordenar", "el", "depósito"]);
  assert.equal(caja(e), 30);
  assert.equal(B.vencerChangaDelDia(r.id), null, "todavía vale");
  db.prepare(`UPDATE bolsa_changas SET vence = ? WHERE id = ?`).run(Date.now() - 1000, r.id);
  db.prepare(`UPDATE pendientes SET ejecutar_en = ? WHERE chat = ? AND tipo = 'bolsa_changa_vence'`).run(Date.now() - 1000, G);
  await P.procesarPendientes(client);
  assert.equal(ultimoEnviado().chat, G);
  assert.match(ultimoEnviado().msg.text, /^🦗 Nadie agarró la changa de un día de \*Fletes Ana\*: «Ordenar el depósito»\. .*\nLos 70 UruCoins vuelven a la caja\./);
  assert.equal(caja(e), 100);
  assert.equal(E.valorDeEmpresa(E.empresaDe(G, ANA)).reciente, 100, "volver a la caja no es depositar");

  const b = B.ofrecerChanga(G, ANA, ["50", "bolsillo", "Regar", "las", "plantas"]);
  assert.equal(F.getSaldoCoins(G, ANA), 50);
  db.prepare(`UPDATE bolsa_changas SET vence = ? WHERE id = ?`).run(Date.now() - 1000, b.id);
  assert.match(B.vencerChangaDelDia(b.id).texto, /vuelven al bolsillo de @300000000000081/);
  assert.equal(F.getSaldoCoins(G, ANA), 100);
  assert.equal(B.vencerChangaDelDia(b.id), null, "una sola vez");
});

test("los comandos: .gente, .disponible, .ofrecerchanga, .agarrar contestando, y lo que ven los patrones en .puestos y .empresas", async () => {
  const G = "comandos-bolsa@g.us";
  gente(G);
  const client = clienteFalso();
  const plugin = async (archivo) => (await import(`../plugins/${archivo}.js`)).default;
  const [Bolsa, Empresa] = [await plugin("coins-bolsa"), await plugin("coins-empresa")];
  const participants = Object.keys(NOMBRES).map((id) => ({ id, admin: null }));
  const correr = async (p, sender, texto, extra = {}) => {
    const [command, ...args] = texto.slice(1).split(/\s+/);
    await p.run({ chat: G, sender, isGroup: true, text: texto, mentionedJid: [], ...extra }, { client, command, args, text: args.join(" "), participants });
    return ultimoEnviado().msg;
  };
  patron(G, ANA, { caja: 300 });
  laburante(G, BETO, "mozo");

  assert.match((await correr(Bolsa, BETO, ".disponible de noche no")).text, /^📋 Anotado: @300000000000082 busca laburo/);
  assert.match((await correr(Bolsa, CARLA, ".gente")).text, /🔎 \*Buscan laburo\* \(1\)\n• Beto — mozo nv\.1 · «de noche no»/);
  assert.match((await correr(Bolsa, CARLA, ".gente numeros")).text, /• \+?\d*.*mozo nv\.1|• Beto/);
  assert.match((await correr(Empresa, ANA, ".puestos")).text, /👥 \*Puestos de Fletes Ana\*[^]*\n\n🔎 \*Buscan laburo\* \(1\)[^]*\.contratar @300000000000082 chofer 30$/);
  assert.match((await correr(Empresa, ANA, ".empresas")).text, /🏭 \*Empresas del grupo\*[^]*🔎 \*Buscan laburo\* \(1\)/);
  assert.doesNotMatch((await correr(Empresa, BETO, ".empresas")).text, /Buscan laburo/, "eso lo ven los patrones");

  assert.match((await correr(Bolsa, ANA, ".ofrecerchanga")).text, /^🧰 \*Changas de un día\*/);
  const post = await correr(Bolsa, ANA, ".ofrecerchanga 40 Cebar mate en la oficina");
  assert.match(post.text, /^🧰 \*CHANGA DE UN DÍA\*/);
  assert.deepEqual(post.mentions, [ANA, BETO]);
  const idPost = `MSG${globalThis.enviados.length}`;
  const tomada = await correr(Bolsa, BETO, ".agarrar", { quoted: { id: idPost } });
  assert.match(tomada.text, /^🤝 @300000000000082 agarró la changa de \*Fletes Ana\*: «Cebar mate en la oficina»/);
  assert.match((await correr(Bolsa, BETO, ".nodisponible")).text, /te saqué de la bolsa/);
});
