import { test, before } from "node:test";
import assert from "node:assert/strict";
import { prepararBase } from "./helpers.mjs";

// The price of an ad (detectarPrecio, lib/compraventa.js). It was read only with its currency, and a real sales group
// writes it in other ways too: of 183 offers written as text, 84 had a price the bot read and 17 more had one it
// didn't ("a 5500", "1600$", "200 cada una", "lo dejo 900", "4 mil"), each answered with "no le pusiste precio". The
// examples marked "del grupo" are theirs, word for word.

let C;
before(async () => {
  await prepararBase("precio");
  C = await import("../lib/compraventa.js");
});

const precios = (casos) => {
  for (const [texto, precio] of casos) assert.equal(C.detectarPrecio(texto), precio, texto);
};

test("el precio con su moneda, adelante o atrás del número", () => {
  precios([
    ["bici $ 4.000 Pocitos", "$ 4.000"],
    ["celular USD 200 usado", "USD 200"],
    ["mesa 1500 pesos", "1500 pesos"],
    ["tele u$s 350", "u$s 350"],
    ["heladera US$ 300", "US$ 300"],
    ["ropero de pino, $ 3.000, Malvín", "$ 3.000"],
    ["campera $U 500 nueva", "$U 500"],
    ["moto $ 45 mil", "$ 45 mil"],
    ["moto $45k al día", "$45k"],
    ["auto 2 palos", "2 palos"],
    ["zapatillas 5 lucas", "5 lucas"],
    ["consola 200 dólares", "200 dólares"],
    ["sillón 5 mil pesos", "5 mil pesos"],
    // del grupo: the sign after the number
    ["Vendo lote de mujer de 15 prendas a 1600$ Paso fotos x priv", "1600$"],
    ["Ropa económica desde 80$", "80$"],
    ["Tiro las cartas x 350$ x 3 preguntas", "350$"],
    ["remera 1.500 $", "1.500 $"],
    ["remera 450$.", "450$"],
  ]);
});

test("un signo de pesos es del número que tiene pegado o adelante", () => {
  precios([
    // the sign opens the number that follows: the size isn't the price
    ["jean talle 42 $ 1.500", "$ 1.500"],
    ["jean talle 42 $1500", "$1500"],
    // and stuck to the one before, it's that one's
    ["remeras 1600$ 2 unidades", "1600$"],
    // a unit that only starts like "mil" or "k" isn't thousands
    ["harina $500 kilo", "$500"],
    ["yerba $ 300 kg", "$ 300"],
    ["milanesas $ 400 milanesas de pollo", "$ 400"],
  ]);
});

test("sin moneda: lo que cada uno, lo que anuncia una palabra, tantos por tanto, «a» tanto y los miles", () => {
  precios([
    // del grupo
    ["Hola cómo andan? Vendo estas piezas. 200 cada una o 10 por 1500. Tengo anillos", "200 cada una"],
    ["Vendo parlante JBL flip 7 A 3500", "3500"],
    ["Alguien le interesa un somier de 2 plazas a 5500?", "5500"],
    ["en perfecto estado esta a 5000", "5000"],
    ["Lo dejo 900", "900"],
    ["A 4 mil ,gracias", "4 mil"],
    // what each one costs
    ["stickers 50 c/u", "50 c/u"],
    ["libros 300 cada uno", "300 cada uno"],
    ["pines, 80 cada", "80 cada"],
    ["remeras 2 mil cada una", "2 mil cada una"],
    ["tazas c/u 250", "250"],
    ["tazas, cada una 250", "250"],
    // a word that announces it
    ["bici rodado 26, precio 4500", "4500"],
    ["bici rodado 26. Precio: 4.500", "4.500"],
    ["torta, sale 350 la porción", "350"],
    ["mesa, la dejo en 1.500 negociable", "1.500"],
    ["silla, cuesta 2 mil", "2 mil"],
    ["cuadro. Valor = 1200", "1200"],
    // so many for so much
    ["medias, 10 por 1500", "10 por 1500"],
    ["medias 3x1000", "3x1000"],
    ["medias 2 x 1.500 hoy", "2 x 1.500"],
    ["camperas 3 x 2 mil", "3 x 2 mil"],
    // "a" so much, from three digits on
    ["Vendo bici a 5500 escucho ofertas", "5500"],
    ["Vendo bici a 5500 🔥🔥", "5500"],
    ["manzanas a 150 el kilo", "150"],
    ["todo por 3000", "3000"],
    ["se va por 1.200!", "1.200"],
    // thousands, said and no more
    ["Vendo heladera 12 mil", "12 mil"],
    ["Vendo heladera, 3,5 mil.", "3,5 mil"],
  ]);
});

test("un número solo no es un precio, ni el que cuenta o mide algo", () => {
  precios([
    ["regalo perro", ""],
    ["bici rodado 26, 4500, Mercedes", ""],
    // del grupo
    ["vendo ihpone 17", ""],
    ["Vendo notebook gaming MSI gf63 thin 10sc es una i5-10500h, gtx 1650 max q, 256gb ssd nvme kingston, 16 gb netac ddr4 2666 mt, bateria al 89% y pasta nueva", ""],
    ["Vendo monopatín xiaomi 6 lite 25km/h max 25km autonomía", ""],
    ["Liquidación con etiqueta!!!! armó de 10 a 45 prendas!!!", ""],
    ["Vendo vapes, catálogo de lost mary 35k con los sabores", ""],
    ["Acepto mercado pago en hasta 12 cuotas o transferencia. WhatsApp 095730518", ""],
    ["Gran vivo 19 hs!!! Una compañía con más de 150 años de trayectoria", ""],
    ["funciona perfectamente 6 meses de uso", ""],
    // what it measures or counts
    ["Vendo casa a 100 metros de la plaza", ""],
    ["Vendo casa a 200 mts del centro", ""],
    ["Vendo auto 2015, 120 mil km", ""],
    ["Vendo cuenta con 30 mil seguidores", ""],
    ["Vendo campera, dejo 10 fotos", ""],
    ["Vendo curso, sale 12 cuotas", ""],
    ["Vendo remera, sale 100% algodón", ""],
    ["Vendo estufa, funciona a 220v", ""],
    ["Vendo monitor, anda a 1080p", ""],
    ["Vendo lote por 100 unidades", ""],
    ["Vendo pack por 500 gramos", ""],
    // a phone, whole or in two halves
    ["Vendo ropa, llamar a 099123456", ""],
    ["Vendo ropa, consultas a 2901 2345", ""],
    // fewer than three digits after "a" or "por", and a size
    ["Vendo de 9 a 18", ""],
    ["Vendo sillas, 2 por 1", ""],
    ["Vendo mesa de 60 x 90", ""],
    // the word or the number starts where it seems to: "encuesta" isn't "cuesta", nor "para" an "a"
    ["Vendo libro con la encuesta 2024", ""],
    ["Vendo agenda para 2027", ""],
    ["Vendo monitor 1920 x 1080", ""],
    // a single digit is no amount, with a word or with "cada"
    ["Vendo tazas, sale 1 sola", ""],
    ["Vendo tazas, 2 cada uno", ""],
  ]);
});

test("la forma más segura es la que vale: la moneda antes que lo demás", () => {
  precios([
    ["Vendo auto 2015, 120 mil km, USD 8.000", "USD 8.000"],
    ["Vendo tazas, 200 cada una, $ 1.500 las diez", "$ 1.500"],
    ["Vendo bici a 5500 o 200 dólares", "200 dólares"],
    // then what each one costs, then the word, then so many for so much, then "a", then the thousands alone
    ["Vendo tazas a 2000 el juego, 250 cada una", "250 cada una"],
    ["Vendo tazas, 10 por 1500, precio 200", "200"],
    ["Vendo tazas a 2000, 10 por 1500", "10 por 1500"],
    ["Vendo mesa 4 mil, a 3500 hoy", "3500"],
  ]);
});

// A 64.000-character "#vendo 1.1.1.1…" once held the whole bot for 13 s, with a regex that was quadratic. Each new form
// gets its own long text of what it almost matches.
test("ninguna forma se traba con un texto enorme", () => {
  const largos = [
    "1.".repeat(32000),
    "9".repeat(64000),
    "$".repeat(64000),
    "1 $".repeat(20000),
    "a 1".repeat(20000),
    `${"a 123 ".repeat(10000)}metros`,
    `${"1 mil ".repeat(10000)}km`,
    "precio en a de ".repeat(4000),
    "12 por ".repeat(9000),
    `${"200 cada".repeat(8000)}x`,
    `${"sale 12 ".repeat(8000)}cuotas`,
  ];
  for (const texto of largos) {
    const antes = performance.now();
    C.detectarPrecio(texto);
    const tardo = performance.now() - antes;
    assert.ok(tardo < 300, `«${texto.slice(0, 16)}…» (${texto.length} letras) tardó ${Math.round(tardo)} ms`);
  }
});

test("al publicar: el precio leído va en la confirmación, y el «no le pusiste precio» queda para quien no lo puso", () => {
  const chat = "precio-publicar@g.us";
  const leido = C.publicar(chat, "111@lid", "vendo", "somier de 2 plazas a 5500");
  assert.equal(leido.precio, "5500");
  assert.match(leido.mensaje, /registrada\. Precio: 5500\. /);
  assert.doesNotMatch(leido.mensaje, /no le pusiste precio/);
  const porUnidad = C.publicar(chat, "111@lid", "vendo", "piezas de bijou. 200 cada una o 10 por 1500");
  assert.match(porUnidad.mensaje, /registrada\. Precio: 200 cada una\. /);
  const sinPrecio = C.publicar(chat, "111@lid", "vendo", "bici rodado 26, 4500, Mercedes");
  assert.equal(sinPrecio.precio, "");
  assert.match(sinPrecio.mensaje, /Ojo: no le pusiste precio/);
});

// The same ad sent again renews its post, unless it comes at another price (test/compraventa-repetidas.test.mjs): the
// prices read now count for that too.
test("al publicar: el mismo aviso con el mismo «a 5500» se renueva, y a otro precio es otra publicación", () => {
  const chat = "precio-repetidas@g.us";
  const primera = C.publicar(chat, "111@lid", "vendo", "somier de 2 plazas a 5500");
  const otraVez = C.publicar(chat, "111@lid", "vendo", "somier de 2 plazas a 5500");
  assert.deepEqual([otraVez.renovada, otraVez.numero], [true, primera.numero]);
  const rebajado = C.publicar(chat, "111@lid", "vendo", "somier de 2 plazas a 5000");
  assert.ok(!rebajado.renovada && rebajado.numero !== primera.numero, "a otro precio, otra publicación");
});
