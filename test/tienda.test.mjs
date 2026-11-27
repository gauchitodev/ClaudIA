import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prepararBase, clienteFalso, fijarSaldo } from "./helpers.mjs";
import { conexion } from "../lib/conexion.js";

// The shop's status (lib/tienda.js): the signature reaction, the grand entrance, the notices in the Sunday paper, the
// statue, the informant, the lawyer, the bodyguard and the goods, and what each does in the town and the other modules.
let F, T, P, D, ES, EN, EM, SP, L, PF;
const ANA = "300000000000071@lid";
const BETO = "300000000000072@lid";
const CARLA = "300000000000073@lid";
const DANI = "300000000000074@lid";
const DIA = 24 * 60 * 60 * 1000;
// A fixed moment, at 15:00, so nothing depends on the hour the tests run at.
const QUINCE = new Date(2026, 10, 25, 15, 0, 0).getTime();

before(async () => {
  ({ F } = await prepararBase("tienda"));
  T = await import("../lib/tienda.js");
  P = await import("../lib/pueblo.js");
  D = await import("../lib/pueblo-diario.js");
  ES = await import("../lib/escenas.js");
  EN = await import("../lib/encargos.js");
  EM = await import("../lib/empresas.js");
  SP = await import("../lib/espias.js");
  L = await import("../lib/laburos.js");
  PF = await import("../lib/perfil.js");
});
beforeEach(() => {
  conexion.client = clienteFalso();
  P._dep.azar = () => 0;
  T._dep.azar = () => 0;
});

const saldo = (chat, u) => F.getSaldoCoins(chat, u);
const fijar = (chat, datos) => db.prepare(`UPDATE pueblos SET ${Object.keys(datos).map((k) => `${k} = ?`).join(", ")} WHERE chat = ?`).run(...Object.values(datos), chat);
const fila = (chat) => db.prepare(`SELECT * FROM pueblos WHERE chat = ?`).get(chat);
const hechos = (chat) => P.hechosDesde(chat, 0, Infinity);
const oficio = (chat, quien, laburo, cobros = 0) => db.prepare(`INSERT OR REPLACE INTO laburos (chat, usuario, laburo, desde, ultimo_cobro, cobros) VALUES (?, ?, ?, ?, '', ?)`).run(chat, quien, laburo, Date.now() - 30 * DIA, cobros);

function grupo(chat, { conPueblo = true, plata = 3000 } = {}) {
  for (const [quien, nombre] of [[ANA, "Ana"], [BETO, "Beto"], [CARLA, "Carla"], [DANI, "Dani"]]) {
    F.initDataDB({ chat, sender: quien, senderJid: "", pushName: nombre });
    fijarSaldo(F, chat, quien, plata);
  }
  if (conPueblo) {
    P.nacer(chat);
    F.updateChat(chat, { pueblo: 1 });
  }
}
const comprar = (chat, u, clave, arg = "", ahora = Date.now()) => T.comprar(chat, u, clave, arg, ahora);

test("tienda: los ítems de siempre siguen igual, y los nuevos se encuentran por su nombre y sus alias", () => {
  for (const k of ["escudo", "racha", "votodoble", "apodo"]) assert.ok(T.ITEMS[k]);
  assert.equal(T.ITEMS.escudo.precio, 25);
  const pares = { firma: "firma", "reacción": "firma", entrada: "entrada", clasificado: "aviso", chisme: "chisme", estatua: "estatua", pista: "informante", abogado: "abogado", patovica: "guardaespaldas", chalet: "casa", fusca: "auto", camioneta: "auto", mascota: "mascota", carpincho: "mascota" };
  for (const [texto, clave] of Object.entries(pares)) assert.equal(T.buscarItem(texto), clave, texto);
  // A company's goods are bought with .comprar too (plugins/coins-comprar.js): none of them is taken by the shop.
  for (const bien of ["camion", "semi", "bitren", "galpon", "vacas", "sonido"]) assert.equal(T.buscarItem(bien), null, bien);
});

test(".tienda: todo por góndolas, con los precios del pueblo; una góndola sola con .tienda bienes", () => {
  const chat = "gondolas@g.us";
  grupo(chat, { conPueblo: false });
  const texto = T.textoTienda(chat);
  for (const g of ["Para jugar", "Para que se note", "Del pueblo", "Servicios", "Bienes"]) assert.match(texto, new RegExp(g));
  for (const clave of Object.keys(T.ITEMS)) assert.match(texto, new RegExp(`\\.comprar ${clave}\\b`));
  assert.match(texto, /solo con pueblo/, "sin pueblo, lo del pueblo dice que hace falta");
  assert.match(texto, /Rancho 150 → 🏡 Chalet 450 → 🏰 Estancia 1200/);
  const bienes = T.textoTienda(chat, "bienes");
  assert.match(bienes, /Casa/);
  assert.doesNotMatch(bienes, /Escudo/);
  // With a rich town, the goods cost more.
  grupo(chat);
  fijar(chat, { prosperidad: 100 });
  assert.match(T.textoTienda(chat, "bienes"), /Rancho 170/);
});

test("el filtro: sin arrobas, links, teléfonos ni insultos; y para el diario, sin acusaciones graves", () => {
  assert.equal(T.filtrarTexto("llegó el patrón de la ruta 5").ok, true);
  for (const malo of ["llegó @Beto", "miren www.algo.com", "llamen al 099 123 456", "llegó el más boludo", "Beto es un pelotudo"]) assert.equal(T.filtrarTexto(malo).ok, false, malo);
  assert.equal(T.filtrarTexto("dicen que Beto robó gallinas", { graves: true }).ok, false);
  assert.equal(T.filtrarTexto("dicen que Beto baila cumbia a escondidas", { graves: true }).ok, true);
  assert.equal(T.filtrarTexto("x".repeat(200), { max: 80 }).ok, false);
});

test("reacción firma: un emoji por persona en el grupo, a algunos mensajes y con tope por día", () => {
  const chat = "firma@g.us";
  grupo(chat, { conPueblo: false });
  let r = comprar(chat, ANA, "firma", "");
  assert.equal(r.ok, false);
  assert.match(r.error, /Libres en el grupo: 🦄/);
  r = comprar(chat, ANA, "firma", "🦄");
  assert.equal(r.ok, true);
  assert.equal(saldo(chat, ANA), 3000 - T.ITEMS.firma.precio);
  // Somebody else can't have it.
  r = comprar(chat, BETO, "firma", "🦄");
  assert.equal(r.ok, false);
  assert.match(r.error, /ya es la firma de otra persona/);
  assert.doesNotMatch(comprar(chat, BETO, "firma", "").error.split("Libres")[1], /🦄/, "ya no figura entre los libres");
  // About one in ten messages, up to the day's cap.
  T._dep.azar = () => 50;
  assert.equal(T.reaccionFirma(chat, ANA), null);
  T._dep.azar = () => 0;
  const dadas = Array.from({ length: 10 }, () => T.reaccionFirma(chat, ANA)).filter(Boolean);
  assert.equal(dadas.length, T.TIENDA.FIRMA_TOPE_DIA);
  assert.ok(dadas.every((e) => e === "🦄"));
  assert.equal(T.reaccionFirma(chat, ANA, Date.now() + DIA), "🦄", "al otro día, de nuevo");
  // Done with: it's cleared, and the emoji is free again.
  assert.equal(T.reaccionFirma(chat, ANA, Date.now() + 8 * DIA), null);
  assert.equal(comprar(chat, BETO, "firma", "🦄 siempre").ok, true);
  assert.equal(saldo(chat, BETO), 3000 - T.TIENDA.FIRMA_PERMANENTE);
  assert.equal(T.reaccionFirma(chat, BETO, Date.now() + 400 * DIA), "🦄", "para siempre es para siempre");
  assert.match(T.textoInventario(chat, BETO), /🦄 Reacción firma \(para siempre\)/);
});

test("entrada triunfal: el primer mensaje del día, con su frase; si el grupo está a los gritos, no siempre", () => {
  const chat = "entrada@g.us";
  grupo(chat, { conPueblo: false });
  assert.equal(comprar(chat, ANA, "entrada", "llegó el más boludo").ok, false);
  assert.equal(comprar(chat, ANA, "entrada", "triunfal llegó el patrón de la ruta 5", QUINCE).ok, true);
  assert.equal(T.entradaTriunfal(chat, ANA, QUINCE + 60000), null, "el día de la compra ya cuenta como hecho");
  const mañana = QUINCE + DIA;
  const r = T.entradaTriunfal(chat, ANA, mañana);
  assert.match(r.texto, /Llegó @300000000000071: «llegó el patrón de la ruta 5»/);
  assert.deepEqual(r.mentions, [ANA]);
  assert.equal(T.entradaTriunfal(chat, ANA, mañana + 60000), null, "solo el primero del día");
  // With a car and a pet, she arrives in it.
  assert.equal(comprar(chat, ANA, "auto").ok, true);
  assert.equal(comprar(chat, ANA, "mascota", "carpincho Ramón").ok, true);
  assert.match(T.entradaTriunfal(chat, ANA, mañana + DIA).texto, /Llegó @300000000000071, en su fusca, con el carpincho Ramón: «/);
  // The phrase changes for free while it lasts.
  const plata = saldo(chat, ANA);
  assert.match(comprar(chat, ANA, "entrada", "volvió la reina del pago").mensaje, /sin cargo/);
  assert.equal(saldo(chat, ANA), plata);
  // A busy group: only ENTRADA_CHANCE_ACTIVO % of them.
  const pasado = new Date(mañana + 2 * DIA);
  const dia = `${pasado.getFullYear()}-${String(pasado.getMonth() + 1).padStart(2, "0")}-${String(pasado.getDate()).padStart(2, "0")}`;
  db.prepare(`INSERT INTO actividad_horaria (chat, fecha, hora, mensajes) VALUES (?, ?, ?, ?)`).run(chat, dia, 15, 100);
  T._dep.azar = () => 99;
  assert.equal(T.entradaTriunfal(chat, ANA, pasado.getTime()), null);
  assert.equal(T.entradaTriunfal(chat, ANA, pasado.getTime() + 60000), null, "y ese día ya pasó");
});

test("aviso y chisme: solo con pueblo, filtrados, salen en El Eco marcados como pagos y un admin los veta", async () => {
  const chat = "aviso@g.us";
  grupo(chat, { conPueblo: false });
  assert.match(comprar(chat, ANA, "aviso", "Vendo bicicleta con una rueda sola").error, /cosa del pueblo/);
  grupo(chat);
  assert.match(comprar(chat, ANA, "chisme", "dicen que Beto le roba al almacén").error, /acusación seria/);
  assert.match(comprar(chat, ANA, "aviso", "Vendo bici, llamar al 099123456").error, /teléfonos/);
  let r = comprar(chat, ANA, "aviso", "Vendo bicicleta con una rueda sola, ideal para equilibristas");
  assert.equal(r.ok, true);
  assert.match(r.mensaje, /sale el domingo en \*El Eco de .+\*, con el sello de \*aviso pago\*/);
  assert.match(comprar(chat, ANA, "chisme", "dicen que el intendente baila cumbia").error, /Ya tenés un aviso esperando/);
  assert.equal(comprar(chat, BETO, "chisme", "dicen que el intendente baila cumbia a escondidas").ok, true);
  assert.equal(comprar(chat, CARLA, "aviso", "Se busca gato que responda a Michi").ok, true);
  assert.equal(saldo(chat, CARLA), 3000 - T.ITEMS.aviso.precio);
  // .avisos lists them, and an admin vetoes one: it's paid back and doesn't go out.
  const lista = T.textoAvisos(chat);
  assert.match(lista.texto, /#\d+ 📢 clasificado de @300000000000071: «Vendo bicicleta/);
  const idCarla = T.avisosPendientes(chat).find((a) => a.usuario === CARLA).id;
  r = T.vetarAviso(chat, idCarla);
  assert.equal(r.ok, true);
  assert.equal(saldo(chat, CARLA), 3000);
  assert.equal(T.vetarAviso(chat, idCarla).ok, false);
  // In the paper: the caption and the page.
  const diario = D.armarDiario(chat);
  assert.equal(diario.avisos.length, 2);
  const texto = D.textoDelDiario(diario);
  assert.match(texto, /📢 \*AVISOS PAGOS\*/);
  assert.match(texto, /Clasificado:_ Vendo bicicleta con una rueda sola, ideal para equilibristas — @300000000000071/);
  assert.match(texto, /Chisme:_ «dicen que el intendente baila cumbia a escondidas» — lo pagó @300000000000072/);
  assert.doesNotMatch(texto, /Michi/, "el vetado no sale");
  assert.ok(diario.mentions.includes(ANA));
  // The edition that goes out prints them, once.
  const r2 = await D.publicarDiario(chat, Date.now(), { semana: "2026-W48", conIlustracion: false });
  assert.ok(r2.imagen);
  assert.equal(T.avisosPendientes(chat).length, 0);
  assert.equal(D.armarDiario(chat).avisos.length, 0);
});

test("estatua: la pone el que más pone, la anterior la derriban, va a las arcas y sale en .pueblo y en el diario", async () => {
  const chat = "estatua@g.us";
  grupo(chat, { conPueblo: false });
  assert.equal(comprar(chat, ANA, "estatua").ok, false);
  grupo(chat);
  const arcas = fila(chat).arcas;
  let r = comprar(chat, ANA, "estatua", "100");
  assert.match(r.error, /arranca en 500/);
  r = comprar(chat, ANA, "estatua");
  assert.equal(r.ok, true);
  assert.equal(saldo(chat, ANA), 2500);
  assert.equal(fila(chat).arcas, arcas + 500);
  assert.match(comprar(chat, ANA, "estatua", "900").error, /ya es tuya/);
  assert.equal(T.precioEstatua(chat), 630);
  assert.match(comprar(chat, BETO, "estatua", "600").error, /por lo menos 630/);
  r = comprar(chat, BETO, "estatua", "700");
  assert.equal(r.ok, true);
  assert.match(r.mensaje, /La de @300000000000071 ya no está/);
  assert.deepEqual(r.mentions, [BETO, ANA]);
  assert.equal(P.estatuaDe(chat).usuario, BETO);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM tienda_estatuas WHERE chat = ? AND derribada > 0`).get(chat).n, 1);
  const tablero = await P.textoPueblo(chat);
  assert.match(tablero.texto, /🗿 En la plaza .+ está la estatua de @300000000000072 \(la pagó 700/);
  const diario = D.armarDiario(chat);
  const titular = diario.titulares.find((t) => t.tipo === "estatua");
  assert.match(titular.caption.titulo, /Derriban la estatua de @300000000000071: ya está la de @300000000000072/);
  assert.match(diario.pie, /la estatua de Beto/);
  assert.match(P.puebloParaPrompt(chat), /hay una estatua de Beto/);
});

test("informante: una pista sobre el sobre abierto, nunca el nombre, una por sobre por persona", () => {
  const chat = "informante@g.us";
  grupo(chat, { conPueblo: false });
  assert.match(comprar(chat, CARLA, "informante").error, /No hay ningún sobre dando vueltas/);
  F.updateUser(ANA, { genero: "mujer" });
  oficio(chat, ANA, "tambero");
  db.prepare(`INSERT INTO espias_misiones (chat, agente, emoji, objetivo, tipo, palabra, premio, publicada, vence, estado, abierta) VALUES (?, ?, '🦊', ?, 'palabra', 'chorizo', 150, ?, ?, 'abierta', 1)`).run(chat, ANA, BETO, Date.now(), Date.now() + 3600000);
  const pistas = new Set();
  for (let i = 0; i < 6; i++) {
    T._dep.azar = () => i;
    const quien = `30000000000009${i}@lid`;
    F.initDataDB({ chat, sender: quien, senderJid: "", pushName: `Vecino ${i}` });
    fijarSaldo(F, chat, quien, 100);
    const r = comprar(chat, quien, "informante");
    assert.equal(r.ok, true);
    assert.doesNotMatch(r.mensaje, /300000000000071|Ana/, "nunca el nombre");
    pistas.add(r.mensaje.match(/«(.+)»/)[1]);
    assert.match(comprar(chat, quien, "informante").error, /Una pista por sobre por cabeza/);
  }
  for (const p of ["el sobre lo tiene una mujer", "el espía labura de tambero (o eso dice el recibo)", "el espía ya abrió el sobre y anda en la suya"]) assert.ok(pistas.has(p), p);
  assert.ok([...pistas].some((p) => /más UruCoins que vos/.test(p)), "tiene más plata que el que pregunta");
});

test("abogado: te saca de la multa de una escena de control, de una denuncia falsa y de un sabotaje descubierto", () => {
  const chat = "abogado@g.us";
  grupo(chat, { conPueblo: false });
  assert.match(comprar(chat, ANA, "abogado").mensaje, /Contrataste al Dr\./);
  assert.match(comprar(chat, ANA, "abogado").error, /Ya tenés un abogado/);
  // The scene: coimear at the caminera goes badly (×0.3); with the lawyer, the plain wage.
  oficio(chat, ANA, "camionero", 5);
  const abrir = () => db.prepare(`INSERT OR REPLACE INTO laburos_escenas (chat, usuario, escena, jornal, mensaje_id, vence) VALUES (?, ?, 'camionero/caminera', 100, '', ?)`).run(chat, ANA, Date.now() + 600000);
  ES._dep.azar = () => 99;
  abrir();
  let r = ES.elegirEnEscena(chat, ANA, 1);
  assert.equal(r.salioBien, false);
  assert.equal(r.cobrado, 100);
  assert.match(r.texto, /⚖️ Pero tu abogado .+ te sacó de la multa/);
  abrir();
  assert.equal(ES.elegirEnEscena(chat, ANA, 1).cobrado, 30, "el abogado era para una sola vez");
  // A false report.
  db.prepare(`INSERT INTO espias_misiones (chat, agente, emoji, objetivo, tipo, palabra, premio, publicada, vence, estado, abierta) VALUES (?, ?, '🦊', ?, 'palabra', 'chorizo', 150, ?, ?, 'abierta', 1)`).run(chat, DANI, CARLA, Date.now(), Date.now() + 3600000);
  comprar(chat, BETO, "abogado");
  const plata = saldo(chat, BETO);
  r = SP.denunciar(chat, BETO, CARLA);
  assert.equal(r.acerto, false);
  assert.match(r.texto, /el abogado de @300000000000072 .+ y no paga nada/);
  assert.equal(saldo(chat, BETO), plata);
  // A saboteur caught.
  comprar(chat, CARLA, "abogado");
  const clave = EN.todasLasClaves()[0];
  const id = Number(db.prepare(`INSERT INTO encargos (chat, usuario, clave, camino, creada, vence) VALUES (?, ?, ?, 1, ?, ?)`).run(chat, DANI, clave, Date.now() - 3600000, Date.now() - 1).lastInsertRowid);
  db.prepare(`INSERT INTO encargos_aportes (encargo, usuario, tipo, cantidad) VALUES (?, ?, 'sabotaje', 20)`).run(id, CARLA);
  EN._dep.azar = () => 0; // it goes well, and she's caught
  const antes = saldo(chat, CARLA);
  r = EN.vencerEncargo(id);
  assert.deepEqual(r.pescados, [CARLA]);
  assert.match(r.texto, /Se descubrió, pero su abogado .+ y no paga multa/);
  assert.equal(saldo(chat, CARLA), antes);
});

test("guardaespaldas: no te sabotean, no te roban el premio ni la caja de la empresa", () => {
  const chat = "guardaespaldas@g.us";
  grupo(chat);
  assert.match(comprar(chat, ANA, "guardaespaldas").mensaje, /Contratado/);
  assert.match(comprar(chat, ANA, "guardaespaldas").error, /Ya tenés guardaespaldas/);
  assert.ok(T.tieneGuardaespaldas(chat, ANA));
  assert.equal(T.tieneGuardaespaldas(chat, ANA, Date.now() + 4 * DIA), false, "a los tres días se va");
  comprar(chat, ANA, "guardaespaldas");
  const clave = EN.todasLasClaves()[0];
  const id = Number(db.prepare(`INSERT INTO encargos (chat, usuario, clave, camino, creada, vence) VALUES (?, ?, ?, 1, ?, ?)`).run(chat, ANA, clave, Date.now(), Date.now() + 3600000).lastInsertRowid);
  const r = EN.aportar(chat, BETO, "sabotaje", 30);
  assert.equal(r.ok, false);
  assert.match(r.error, /anda con guardaespaldas/);
  assert.equal(EN.aportar(chat, BETO, "ayuda", 30).ok, true, "ayudar, sí");
  // The prize isn't stolen on the way back, with safety on the floor.
  db.prepare(`UPDATE encargos SET vence = ? WHERE id = ?`).run(Date.now() - 1, id);
  fijar(chat, { seguridad: 0 });
  EN._dep.azar = () => 0;
  const v = EN.vencerEncargo(id);
  assert.equal(v.salioBien, true);
  assert.equal(v.robado, 0);
  // Nor the company's cash box.
  oficio(chat, ANA, "camionero", L.cobrosParaNivel(10));
  assert.equal(EM.fundar(chat, ANA, "Fletes Ana").ok, true);
  db.prepare(`UPDATE empresas SET caja = 1000 WHERE patron = ? AND chat = ?`).run(ANA, chat);
  EM._dep.azar = (n) => n - 1;
  const j = EM.jornadaDelPatron(chat, ANA);
  assert.doesNotMatch(j.mensaje, /entraron a robar/);
});

test("bienes: casa y auto de a un escalón, mascota con nombre; se ven en .perfil y son noticia", () => {
  const chat = "bienes@g.us";
  grupo(chat);
  let r = comprar(chat, ANA, "casa");
  assert.match(r.mensaje, /🛖 \*Rancho\*/);
  assert.equal(saldo(chat, ANA), 3000 - 150);
  assert.match(comprar(chat, ANA, "casa").mensaje, /🏡 \*Chalet\*.+El rancho queda para las visitas/);
  comprar(chat, ANA, "casa");
  assert.match(comprar(chat, ANA, "casa").error, /Palacio Salvo/);
  comprar(chat, ANA, "auto");
  comprar(chat, ANA, "auto");
  assert.equal(T.escalonDe(chat, ANA, "auto").nombre, "Camioneta");
  assert.match(comprar(chat, ANA, "mascota", "carpincho").error, /Ponele nombre/);
  assert.match(comprar(chat, ANA, "mascota", "dinosaurio Rex").error, /¿Qué bicho\?/);
  assert.match(comprar(chat, ANA, "mascota", "carpincho @Beto").error, /Ese nombre no/);
  assert.equal(comprar(chat, ANA, "mascota", "caballo criollo Relámpago").ok, true);
  r = comprar(chat, ANA, "mascota", "carpincho Ramón");
  assert.match(r.mensaje, /Relámpago se fue a vivir al campo/);
  assert.equal(T.comoLlega(chat, ANA), "en su camioneta, con el carpincho Ramón");
  assert.equal(T.comoLlega(chat, ANA, { vos: true }), "en tu camioneta, con el carpincho Ramón");
  assert.equal(T.lineaDeBienes(chat, ANA), "🏰 Estancia · 🛻 Camioneta · 🦫 el carpincho Ramón");
  const perfil = PF.textoPerfil(chat, ANA, F.getUser(ANA), true);
  assert.match(perfil.texto, /🏠 🏰 Estancia · 🛻 Camioneta · 🦫 el carpincho Ramón/);
  assert.doesNotMatch(perfil.texto, /🎒 .*Estancia/, "los bienes no se repiten en la mochila");
  assert.match(T.bienesParaPrompt(chat, ANA, "Ana"), /Ana se compró una estancia, una camioneta y un carpincho que se llama Ramón/);
  assert.ok(hechos(chat).some((h) => h.tipo === "bien_comprado" && h.datos.nombre === "Estancia"));
  // Prices follow the town's prosperity.
  fijar(chat, { prosperidad: 100 });
  assert.equal(T.precioBien(chat, 1000), 1150);
});

test("los bienes en los cuentos: la escena, el encargo y el diario dicen en qué llega", () => {
  const chat = "cuentos@g.us";
  grupo(chat);
  comprar(chat, ANA, "auto");
  comprar(chat, ANA, "mascota", "perro Firulais");
  oficio(chat, ANA, "camionero", 5);
  ES._dep.azar = () => 0;
  const escena = ES.cobrarConEscena(chat, ANA);
  assert.equal(escena.escena, true);
  assert.match(escena.mensaje, /_\(llegaste en tu fusca, con el perro Firulais\)_/);
  const diario = D.armarDiario(chat);
  assert.ok(diario.titulares.some((t) => /Ana llegó en su fusca, con el perro Firulais\./.test(t.bajada)));
});

test("robo de auto: con la seguridad baja te lo roban (el seguro paga un poco); con guardaespaldas, no", () => {
  const chat = "roboauto@g.us";
  grupo(chat);
  comprar(chat, ANA, "auto");
  comprar(chat, ANA, "auto");
  comprar(chat, BETO, "auto");
  comprar(chat, BETO, "guardaespaldas");
  fijar(chat, { seguridad: 0 });
  const quince = new Date(QUINCE);
  const dia = "2026-11-25";
  db.prepare(`INSERT INTO actividad_horaria (chat, fecha, hora, mensajes) VALUES (?, ?, 15, 10)`).run(chat, dia);
  // Scheduled once a day, at the town's robbery rate.
  T._dep.azar = () => 0;
  assert.ok(T.chequearRobosDeAutos(quince) >= 1);
  assert.equal(T.chequearRobosDeAutos(quince), 0, "una vez por día");
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM pendientes WHERE chat = ? AND tipo = 'robo_auto'`).get(chat).n, 1);
  // At its moment: Beto's bodyguard stops it; Ana's camioneta is gone.
  let r = T.robarAuto(chat, BETO, quince);
  assert.match(r.texto, /el guardaespaldas los agarró de las orejas/);
  assert.ok(T.escalonDe(chat, BETO, "auto"));
  const plata = saldo(chat, ANA);
  r = T.robarAuto(chat, ANA, quince);
  assert.match(r.texto, /¡Le robaron la camioneta a @300000000000071!/);
  assert.equal(T.escalonDe(chat, ANA, "auto"), null);
  assert.equal(saldo(chat, ANA), plata + 100, "el seguro: 25 % de 400");
  assert.ok(hechos(chat).some((h) => h.tipo === "robo_auto"));
  assert.equal(T.robarAuto(chat, ANA, quince), null, "sin auto no hay robo");
  // With safety back up, nothing.
  comprar(chat, ANA, "auto");
  fijar(chat, { seguridad: 80 });
  assert.equal(T.robarAuto(chat, ANA, quince), null);
});

test("plugins/_tienda.js: reacciona con la firma y recibe con la entrada; a un comando, nada", async () => {
  const chat = "hook@g.us";
  grupo(chat, { conPueblo: false });
  comprar(chat, ANA, "firma", "🎩");
  comprar(chat, ANA, "entrada", "llegó la jefa", Date.now() - DIA);
  const { default: plugin } = await import("../plugins/_tienda.js");
  const client = clienteFalso();
  const reacciones = [];
  const mensaje = (text) => ({ isGroup: true, message: {}, chat, sender: ANA, text, key: { id: `M${Math.random()}` }, react: async (e) => reacciones.push(e) });
  await plugin.before(mensaje(".saldo"), { client });
  assert.equal(globalThis.enviados.length, 0);
  assert.equal(reacciones.length, 0);
  await plugin.before(mensaje("buen día gente"), { client });
  await new Promise((r) => setImmediate(r));
  assert.match(globalThis.enviados[0].msg.text, /Llegó @300000000000071: «llegó la jefa»/);
  assert.deepEqual(reacciones, ["🎩"]);
});
