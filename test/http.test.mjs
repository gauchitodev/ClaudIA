import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { pedirHttp } from "../lib/http.js";

let servidor, base;
before(async () => {
  servidor = http.createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (d) => (cuerpo += d));
    req.on("end", () => {
      if (req.url === "/texto") return res.writeHead(200, { "content-type": "text/plain" }).end(`hola ${req.headers["x-prueba"] || ""}`);
      if (req.url === "/json") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, metodo: req.method, cuerpo }));
      if (req.url === "/redir") return res.writeHead(302, { location: "/texto" }).end();
      if (req.url === "/bucle") return res.writeHead(302, { location: "/bucle" }).end();
      if (req.url === "/lento") return setTimeout(() => res.end("tarde"), 400);
      if (req.url === "/bytes") return res.writeHead(200).end(Buffer.from([0, 255, 7]));
      res.writeHead(404).end("no");
    });
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test("pedirHttp: texto, json, cabeceras, POST con cuerpo y 404", async () => {
  const r = await pedirHttp(`${base}/texto`, { headers: { "x-prueba": "mundo" } });
  assert.deepEqual([r.status, r.ok, await r.text()], [200, true, "hola mundo"]);
  assert.equal(r.headers["content-type"], "text/plain");
  const j = await pedirHttp(`${base}/json`, { method: "POST", body: "a=1", headers: { "content-type": "application/x-www-form-urlencoded" } });
  assert.deepEqual(await j.json(), { ok: true, metodo: "POST", cuerpo: "a=1" });
  const b = await pedirHttp(`${base}/bytes`);
  assert.deepEqual([...new Uint8Array(await b.arrayBuffer())], [0, 255, 7]);
  const n = await pedirHttp(`${base}/nada`);
  assert.deepEqual([n.status, n.ok], [404, false]);
});

test("pedirHttp: sigue redirecciones con tope, y corta por timeout", async () => {
  const r = await pedirHttp(`${base}/redir`);
  assert.deepEqual([r.status, await r.text(), r.url], [200, "hola ", `${base}/texto`]);
  const bucle = await pedirHttp(`${base}/bucle`, { redirecciones: 3 });
  assert.equal(bucle.status, 302, "después del tope devuelve la última respuesta sin seguirla");
  await assert.rejects(pedirHttp(`${base}/lento`, { timeoutMs: 100 }), /sin respuesta en 0.1 s/);
  await assert.rejects(pedirHttp("http://127.0.0.1:1/"), /ECONNREFUSED/);
});
