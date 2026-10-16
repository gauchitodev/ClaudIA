import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import dns from "node:dns";
import { prepararBase, G, clienteFalso, ultimoEnviado } from "./helpers.mjs";
import strings from "../lib/strings.js";

// .imagen (plugins/dl-imagen.js) downloads a Google result's image through lib/descarga-segura.js. It used to hand the
// link to sendFile, whose fetch followed redirects anywhere: a result that redirected to the router, or to another
// device in the house, would have had its answer sent to the group. A local server plays the internet here.

let D, Imagen, servidor, base;
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
const pedidos = []; // what reached the server

before(async () => {
  await prepararBase("descarga-segura");
  globalThis.txt = strings;
  D = await import("../lib/descarga-segura.js");
  Imagen = (await import("../plugins/dl-imagen.js")).default;
  D.DESCARGA.TIMEOUT_MS = 2000; // a connection that shouldn't happen fails fast instead of hanging the test
  servidor = http.createServer((req, res) => {
    pedidos.push(req.url);
    const rutas = {
      "/foto.png": () => res.writeHead(200, { "content-type": "image/png" }).end(PNG),
      "/a-la-foto": () => res.writeHead(302, { location: "/foto.png" }).end(),
      "/pagina": () => res.writeHead(200, { "content-type": "text/html" }).end("<h1>panel del router</h1>"),
      "/al-router": () => res.writeHead(302, { location: "http://router.casa/admin" }).end(),
      "/a-la-red": () => res.writeHead(301, { location: "http://10.0.0.5/foto.png" }).end(),
      "/vueltas": () => res.writeHead(302, { location: "/vueltas" }).end(),
    };
    (rutas[req.url] || (() => res.writeHead(404).end()))();
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

// As if the server were on the internet: 127.0.0.1 counts as public, everything else follows the real rules, and
// router.casa is a name that resolves to the house's network.
function comoInternet() {
  D._dep.esPrivada = (ip) => ip !== "127.0.0.1" && D.esDireccionPrivada(ip);
  D._dep.lookup = (nombre, opciones, cb) => (nombre === "router.casa" ? cb(null, [{ address: "192.168.1.1", family: 4 }]) : dns.lookup(nombre, opciones, cb));
}
function reglasReales() {
  D._dep.esPrivada = D.esDireccionPrivada;
  D._dep.lookup = dns.lookup;
}

test("direcciones privadas: la máquina, la red de la casa, link-local y las IPv4 escritas como IPv6", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:192.168.1.1", "localhost"]) assert.equal(D.esDireccionPrivada(ip), true, ip);
  for (const ip of ["8.8.8.8", "172.32.0.1", "142.250.79.46", "::ffff:8.8.8.8", "2001:4860:4860::8888"]) assert.equal(D.esDireccionPrivada(ip), false, ip);
});

test("con las reglas de verdad, un link a esta máquina no llega a conectarse", async () => {
  reglasReales();
  const antes = pedidos.length;
  await assert.rejects(D.bajarImagen(`${base}/foto.png`), /dirección privada \(127\.0\.0\.1\)/, "escrita en el link");
  await assert.rejects(D.bajarImagen(`http://localhost:${servidor.address().port}/foto.png`), /localhost apunta a una dirección privada/, "por nombre");
  assert.equal(pedidos.length, antes, "el servidor no recibió nada");
});

test("redirecciones: se siguen a mano y cada salto se controla", async () => {
  comoInternet();
  try {
    assert.deepEqual(await D.bajarImagen(`${base}/foto.png`), PNG);
    assert.deepEqual(await D.bajarImagen(`${base}/a-la-foto`), PNG, "una redirección relativa, a un lugar público");
    await assert.rejects(D.bajarImagen(`${base}/al-router`), /router\.casa apunta a una dirección privada \(192\.168\.1\.1\)/);
    await assert.rejects(D.bajarImagen(`${base}/a-la-red`), /dirección privada \(10\.0\.0\.5\)/);
    await assert.rejects(D.bajarImagen(`${base}/vueltas`), /demasiadas redirecciones/);
    await assert.rejects(D.bajarImagen(`${base}/pagina`), /no es una imagen \(text\/html\)/);
    await assert.rejects(D.bajarImagen("file:///etc/passwd"), /protocolo no permitido/);
    const maximo = D.DESCARGA.MAX_BYTES;
    D.DESCARGA.MAX_BYTES = 10;
    try {
      await assert.rejects(D.bajarImagen(`${base}/foto.png`), /demasiado grande/);
    } finally {
      D.DESCARGA.MAX_BYTES = maximo;
    }
  } finally {
    reglasReales();
  }
});

// What Google answers, in the shape the plugin reads: a thumbnail, the original link and the title, per result.
const paginaDeGoogle = (...enlaces) => enlaces.map((e, i) => `["https://encrypted-tbn0.gstatic.com/images?q=t${i}",10,20],["${e}",30,40],"Resultado ${i}"]`).join(",");

test(".imagen: manda la imagen que se pudo bajar, y avisa si no se pudo ninguna", async () => {
  comoInternet();
  const fetchReal = globalThis.fetch;
  const errorReal = console.error;
  console.error = () => {};
  const correr = async (html) => {
    globalThis.fetch = async () => ({ text: async () => html });
    const client = clienteFalso();
    await Imagen.run({ chat: G, sender: "a@lid", isGroup: true, react: () => {} }, { client, text: "gatos", isOwner: false, chat: {} });
    return ultimoEnviado();
  };
  try {
    const enviado = await correr(paginaDeGoogle(`${base}/al-router`, `${base}/pagina`, `${base}/foto.png`));
    assert.deepEqual(enviado.archivo, PNG, "de tres resultados, el único que es una imagen pública");
    const nada = await correr(paginaDeGoogle(`${base}/al-router`, `${base}/a-la-red`));
    assert.equal(nada.msg.text, "No pude bajar ninguna de las imágenes que encontré. Probá con otra búsqueda.");
  } finally {
    globalThis.fetch = fetchReal;
    console.error = errorReal;
    reglasReales();
  }
});
