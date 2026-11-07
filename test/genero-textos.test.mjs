import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { prepararBase, G, fijarSaldo } from "./helpers.mjs";
import txt from "../lib/strings.js";
import { conexion } from "../lib/conexion.js";

// The bot's fixed texts about one person agree with the gender set with .genero (lib/genero.js, concordar): kinship,
// trades, raffles, the welcome with the rules, kisses, the couple, adoptions, the jail card and the moderation notices.
// With nothing set, the texts go as they always did.
let F, Ge, Fa, Pj, La, Pf, Re;
const DIA = 24 * 60 * 60 * 1000;
const L = (n) => `${n}@lid`;
const persona = (n, pushName) => ({ chat: G, sender: L(n), senderJid: `5989900${n}@s.whatsapp.net`, pushName });
const fuente = (ruta) => fs.readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
before(async () => {
  ({ F } = await prepararBase("genero-textos"));
  Ge = await import("../lib/genero.js");
  Fa = await import("../lib/familia.js");
  Pj = await import("../lib/parejas.js");
  La = await import("../lib/laburos.js");
  Pf = await import("../lib/perfil.js");
  Re = await import("../lib/reglas.js");
  // Ana and Caro are women, Beto a man; Dani and Eva set nothing.
  for (const [n, nombre] of [[801, "Ana"], [802, "Beto"], [803, "Caro"], [804, "Dani"], [805, "Eva"]]) F.initDataDB(persona(n, nombre));
  F.updateUser(L(801), { genero: "mujer" });
  F.updateUser(L(802), { genero: "hombre" });
  F.updateUser(L(803), { genero: "mujer" });
  // Ana and Beto marry and adopt Caro and Dani: the kinship, the adoptions and the kisses below go by it, in any order
  // (node --test --test-randomize). Married just now: days without a kiss would make the partner turn the kiss down.
  Pj.fijarPareja(L(801), L(802), Date.now() - 60e3);
  Pj.fijarCasamiento(L(801), L(802), Date.now() - 30e3);
  for (const [hijo, dia] of [[803, 1], [804, 2]]) {
    fijarSaldo(F, G, L(801), 100);
    assert.equal(Fa.pedirAdopcion(G, L(801), L(hijo), Date.now() + dia * DIA).ok, true);
    assert.equal(Fa.responderAdopcion(L(hijo), true, Date.now() + dia * DIA).ok, true);
  }
});
// A plugin run as the dispatcher would, naming "quien" with a mention, and what it answered.
async function correr(archivo, sender, { quien = null, text = quien ? `@${quien.split("@")[0]}` : "", command, extra = {} } = {}) {
  const P = (await import(`../plugins/${archivo}.js`)).default;
  globalThis.enviados = [];
  const m = { chat: G, sender, senderJid: "", text, mentionedJid: quien ? [quien] : [], isGroup: true, react: async () => {} };
  await P.run(m, { client: conexion.client, text, args: text.split(" ").filter(Boolean), command: command || P.cmd[0], usedPrefix: ".", participants: [801, 802, 803, 804, 805].map((n) => ({ id: L(n), admin: null })), ...extra });
  return globalThis.enviados.map((e) => e.msg).find((msg) => msg?.text) ?? {};
}
// A run with Math.random fixed, for what's drawn.
async function conAzar(valores, hacer) {
  const real = Math.random;
  let i = 0;
  Math.random = () => valores[i++ % valores.length];
  try {
    return await hacer();
  } finally {
    Math.random = real;
  }
}

test("concordar: las formas para los dos y el masculino genérico, en el género que se pida; sin género, igual", () => {
  assert.equal(Ge.concordar("tu hijo/a y tu padre o madre", "mujer"), "tu hija y tu madre");
  assert.equal(Ge.concordar("tu hijo/a y tu padre o madre", "hombre"), "tu hijo y tu padre");
  assert.equal(Ge.concordar("tu hijo/a y tu padre o madre", ""), "tu hijo/a y tu padre o madre");
  assert.equal(Ge.concordar("SER TAN LIND@😍 y GANADOR", "mujer"), "SER TAN LINDA😍 y GANADORA");
  assert.equal(Ge.concordar("Has sido elegido. SERÁS ELIMINADO(A)", "mujer"), "Has sido elegida. SERÁS ELIMINADA");
  assert.equal(Ge.concordar("Has sido elegido. Serás eliminado/a", "hombre"), "Has sido elegido. Serás eliminado");
  assert.equal(Ge.concordar("❤️ Más votado · 🔥 Más activo", "mujer"), "❤️ Más votada · 🔥 Más activa");
  assert.equal(Ge.concordar("es un santo y pendej@", "mujer"), "es una santa y pendeja");
  assert.equal(Ge.concordar("¿novia/o? ¡mía/o! chico/a", "hombre"), "¿novio? ¡mío! chico");
  assert.equal(Ge.concordar("activos y activar el hijo/a", "mujer"), "activos y activar el hija", "solo la palabra entera");
  assert.equal(Ge.concordarPlural("Bienvenid@s, ya están casados, novios y ganadores", "mujer"), "Bienvenidas, ya están casadas, novias y ganadoras");
  assert.equal(Ge.concordarPlural("Bienvenid@s y casados", "hombre"), "Bienvenidos y casados");
  assert.equal(Ge.concordarPlural("Bienvenid@s", ""), "Bienvenid@s");
  // the gender of several: every one a woman, or the generic masculine with any man or anyone unset among them
  assert.equal(Ge.generoDeVarios([L(801), L(803)]), "mujer");
  assert.equal(Ge.generoDeVarios([L(801), L(802)]), "hombre");
  assert.equal(Ge.generoDeVarios([L(801), L(804)]), "hombre");
  assert.equal(Ge.generoDeVarios([L(804), L(805)]), "");
  assert.equal(Ge.generoDeVarios([]), "");
});

test("parentescos en el género de la persona: hija, madre, hermana, esposa; sin género, como antes", () => {
  assert.equal(Fa.parentescoDe(L(801), L(803)), "tu hija");
  assert.equal(Fa.parentescoDe(L(801), L(804)), "tu hijo/a", "sin género, como antes");
  assert.equal(Fa.parentescoEntre(L(803), L(801)), "madre");
  assert.equal(Fa.parentescoEntre(L(803), L(802)), "padre");
  assert.equal(Fa.parentescoEntre(L(804), L(803)), "hermana");
  assert.equal(Fa.parentescoEntre(L(803), L(804)), "hermano/a");
  assert.equal(Fa.parentescoEntre(L(802), L(801)), "esposa");
  assert.equal(Fa.parentescoEntre(L(801), L(802)), "esposo");
  assert.equal(Fa.textoParentesco(L(801), L(803), true), "🧬 Ana es tu madre.");
  assert.equal(Fa.textoParentesco(L(803), L(802)), "🧬 Caro es hija de Beto.");
});

test(".adoptar: lo que dice de quien pide y de la persona nombrada va en su género", async () => {
  assert.equal((await correr("familia-adoptar", L(802), { quien: L(801) })).text, "Esa es tu pareja, no tu hija 🤨");
  assert.equal((await correr("familia-adoptar", L(801), { quien: L(801) })).text, "Adoptarte a vos misma no se puede, por más solo que estés.");
  assert.equal((await correr("familia-adoptar", L(803), { quien: L(805) })).text, "Para adoptar hay que estar casada. Primero .pareja, después .casarse, y ahí sí.");
  // Eva, going out with Caro and with no parents of her own: Beto can't adopt his daughter's partner.
  Pj.fijarPareja(L(803), L(805), Date.now() - 60e3);
  try {
    assert.equal((await correr("familia-adoptar", L(802), { quien: L(805) })).text, "Eva ya es la pareja de tu hija. No hace falta adoptarlo.");
  } finally {
    Pj.terminarPareja(L(803));
  }
  assert.match((await correr("familia-adoptar", L(804))).text, /Hay que estar casado; la otra persona acepta con \.si\./, "sin género, como antes");
});

test("laburos en el género de la persona: tambera, maestro, desocupada; la lista general, como siempre", () => {
  assert.equal(La.nombreDeOficio(La.OFICIOS.tambero, "mujer"), "Tambera");
  assert.equal(La.nombreDeOficio(La.OFICIOS.maestra, "hombre"), "Maestro");
  assert.equal(La.nombreDeOficio(La.OFICIOS.maestra, "mujer"), "Maestra");
  assert.equal(La.nombreDeOficio(La.OFICIOS.taxista, "mujer"), "Taxista");
  assert.equal(La.nombreDeOficio(La.OFICIOS.tambero, ""), "Tambero");
  fijarSaldo(F, G, L(801), 100);
  assert.match(La.tomarLaburo(G, L(801), "tambero").mensaje, /de ahora en más sos \*tambera\*\./);
  assert.equal(La.etiquetaLaburo(G, L(801)), "🐄 Tambera");
  assert.match(La.textoLaburos(G, L(801)), /🐄 \*Tambero\* — [\s\S]*Ahora sos tambera, /);
  assert.match(Pf.textoPerfil(G, L(801), F.getUser(L(801)), true).texto, /\n💼 🐄 Tambera, /);
  assert.match(La.renunciar(G, L(801)).mensaje, /^Renunciaste a tambera\. Ahora sos desocupada con orgullo\./);
  fijarSaldo(F, G, L(802), 100);
  assert.match(La.tomarLaburo(G, L(802), "maestra").mensaje, /sos \*maestro\*\./);
  fijarSaldo(F, G, L(804), 100);
  assert.match(La.tomarLaburo(G, L(804), "tambero").mensaje, /sos \*tambero\*\./, "sin género, como antes");
});

test("la bienvenida con las reglas: Bienvenidas cuando todas las que entran lo son; si no, como siempre", () => {
  const C = "reglas-genero@g.us";
  F.initDataDB({ chat: C, sender: L(805), senderJid: "", pushName: "Eva" });
  Re.fijarReglas(C, "Nada de spam.");
  assert.match(Re.avisoReglasParaNuevos(C, [L(801), L(803)]).texto, /^👋 Bienvenidas @801 @803\. Antes de publicar/);
  assert.match(Re.avisoReglasParaNuevos(C, [L(801), L(802)]).texto, /^👋 Bienvenidos @801 @802\./);
  assert.match(Re.avisoReglasParaNuevos(C, [L(804), L(805)]).texto, /^👋 Bienvenid@s @804 @805\./, "sin género, como antes");
});

test(".sortear: GANADORA y GANADORAS cuando lo son; GANADOR y GANADORES si no", async () => {
  // Each draw with the dice fixed: the first of the list, then the last, and so on.
  const sortear = (command, ids) => conAzar([0, 0.999], () => correr("sortear", L(801), { text: "una pizza", command, extra: { groupMetadata: { participants: ids.map((id) => ({ id })) } } }));
  assert.equal((await sortear("sortear", [L(801)])).text, "*🏆 GANADORA ​🏆​*\n\n*🥳PREMIO:* una pizza\n    \n*_1.- @801_*");
  assert.match((await sortear("sortear2", [L(801), L(803)])).text, /^\*🏆 GANADORAS ​🏆​\*\n\n\*🥳PREMIO:\* una pizza\n {4}\n\*_1\.- @801_\*\n\*_2\.- @803_\*$/);
  assert.match((await sortear("sortear2", [L(801), L(802)])).text, /^\*🏆 GANADORES ​🏆​\*/, "con un hombre, el genérico");
  assert.match((await sortear("sortear", [L(804)])).text, /^\*🏆 GANADOR ​🏆​\*/, "sin género, como antes");
  assert.match((await sortear("sortear3", [L(804), L(805)])).text, /^\*🏆 GANADORES ​🏆​\*\n\n\*🥳PREMIO:\* una pizza\n {4}\n\*_1\.- @804_\*\n\*_2\.- @805_\*\n\*_3\.- @804_\*$/);
  assert.equal((await correr("sortear", L(801), { text: "", command: "sortear", extra: { groupMetadata: { participants: [{ id: L(801) }] } } })).text, txt.sortearText, "sin premio, pide uno");
});

test(".besar y .mipareja: tu marido o tu mujer, y casadas o novias cuando las dos lo son", async () => {
  // Ana, married to Beto: the second of the married texts names the partner
  const aBeto = await conAzar([0.5], () => correr("fun-besar", L(801), { quien: L(802) }));
  assert.match(aBeto.text, /^💍 Un beso para tu marido\. Qué lindo verlos así\.\n/);
  const aAna = await conAzar([0.5], () => correr("fun-besar", L(802), { quien: L(801) }));
  assert.match(aAna.text, /^💍 Un beso para tu mujer\. Qué lindo verlos así\.\n/);
  assert.match((await conAzar([0], () => correr("fun-besar", L(801), { quien: L(802) }))).text, /^💍 Beso de casados, como el primer día\./, "ella y él: el genérico");
  // Caro and Eva, both women, going out
  F.updateUser(L(805), { genero: "mujer" });
  Pj.fijarPareja(L(803), L(805), Date.now() - 60e3);
  try {
    assert.match((await conAzar([0], () => correr("fun-besar", L(803), { quien: L(805) }))).text, /^💞 Beso de novias, de esos que no se rechazan\./);
    assert.match((await correr("pareja-mi-pareja", L(803))).text, /\*💍Casadas:\* ❌/);
    assert.match((await correr("pareja-mi-pareja", L(801))).text, /\*💍Casados:\* ✅\n\*⏳Tiempo casados:\*/);
  } finally {
    Pj.terminarPareja(L(803));
    F.updateUser(L(805), { genero: "" });
  }
});

test(".love: «tu novia» o «tu novio» según de quién se habla", async () => {
  const love = (quien) => conAzar([0.99], () => correr("fun-calcular-juegos", L(804), { quien, command: "love", extra: { chat: {} } }));
  assert.match((await love(L(801))).text, /¿Deberías pedirle que sea tu novia\?😍/);
  assert.match((await love(L(802))).text, /¿Deberías pedirle que sea tu novio\?😍/);
  assert.match((await love(L(804))).text, /¿Deberías pedirle que sea tu novia\/o\?😍/, "sin género, como antes");
});

test("los avisos fijos pasan por concordar: lo que dicen en femenino, y que cada sitio lo llame", () => {
  assert.equal(Ge.concordar(txt.advertirKick(L(801)), "mujer"), "*SE TE ADVIRTIÓ VARIAS VECES.*\n*@801* *SERÁS ELIMINADA* 🙄");
  assert.equal(Ge.concordar(txt.antiGroupsSuccess(L(801)), "mujer"), "*[⚠️ANTI LINK DE GRUPOS⚠️]*\n* *Serás eliminada* @801");
  assert.equal(Ge.concordar(txt.ruletaDelBan(L(801)), "mujer"), "*@801 ☠️ Has sido elegida por la ruleta de la muerte*");
  assert.equal(Ge.concordar(txt.banSpam, "mujer"), "Has sido baneada por pesada y pendeja");
  assert.equal(Ge.concordar(txt.carcelMsg("5", "SER TAN LIND@😍"), "mujer"), "*CUMPLIRÁ LA PENA DE 5 AÑOS POR SER TAN LINDA😍*");
  assert.equal(Ge.concordar(txt.carcelMsg("5", "ACOSADOR🤢"), "mujer"), "*CUMPLIRÁ LA PENA DE 5 AÑOS POR ACOSADORA🤢*");
  assert.equal(Ge.concordarPlural(txt.parejaCasamientoAlready, "mujer"), "*[❕]* Ya están casadas 🥰");
  // The sites that can't be run here from end to end: the call is what's checked.
  for (const [ruta, patron] of [
    ["plugins/grupo-advertir.js", /concordar\(txt\.advertirKick\(quien\), generoDe\(quien\)\)/],
    ["plugins/_anti-Link-grupos-canales.js", /concordar\(txt\.antiGroupsSuccess\(m\.sender\), generoDe\(m\.sender\)\)/],
    ["plugins/fun-ruleta-del-ban.js", /concordar\(txt\.ruletaDelBan\(user\), generoDe\(user\)\)/],
    ["plugins/dl-youtube.js", /concordar\(txt\.banSpam, generoDe\(m\.sender\)\)/],
    ["plugins/fun-canvas-carcel.js", /concordar\(txt\.carcelMsg\(years, razon\), generoDe\(who\)\)/],
    ["plugins/_cierres-periodicos.js", /concordar\("❤️ Más votado", generoDe\(masVotado\[0\]\.usuario\)\)[\s\S]*concordar\("🔥 Más activo", generoDe\(masActivo\[0\]\.usuario\)\)/],
    ["plugins/pareja-elegir.js", /concordar\(elegirAlAzar\(DECLARACIONES\), generoDe\(who\)\)/],
    ["plugins/pareja-casamiento-aceptar.js", /concordarPlural\(txt\.parejaCasamientoSuccess\(m\.sender, r\.pareja\), generoDeVarios\(\[m\.sender, r\.pareja\]\)\)/],
    ["plugins/pareja-casamiento-aceptar.js", /concordarPlural\(txt\.parejaCasamientoAlready, generoDeVarios\(\[m\.sender, parejaDe\(m\.sender\)\?\.pareja\]\)\)/],
    ["plugins/_auto-ia.js", /trabaja de \$\{nombreDeOficio\(laburo\.oficio, generoDe\(m\.sender\)\)\.toLowerCase\(\)\}/],
  ]) assert.match(fuente(ruta), patron, ruta);
});
