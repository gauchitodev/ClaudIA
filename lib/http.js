// Pedido HTTP con los módulos http/https del core de Node, para los sitios que le responden al fetch nativo con un
// desafío anti-bot (la RAE, detrás de Cloudflare, devuelve 403 al fetch de undici pero 200 a este cliente).
// Devuelve algo parecido a una Response: status, ok, headers, text(), json() y arrayBuffer(). Sigue redirecciones.
import http from "http";
import https from "https";

export function pedirHttp(url, { method = "GET", headers = {}, body = null, timeoutMs = 15000, redirecciones = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const destino = new URL(url);
    const cliente = destino.protocol === "http:" ? http : https;
    const req = cliente.request(destino, { method, headers }, (res) => {
      const { statusCode = 0, headers: cabeceras } = res;
      if ([301, 302, 303, 307, 308].includes(statusCode) && cabeceras.location && redirecciones > 0) {
        res.resume();
        const siguiente = new URL(cabeceras.location, destino).toString();
        const mantieneCuerpo = statusCode === 307 || statusCode === 308;
        return resolve(pedirHttp(siguiente, { method: mantieneCuerpo ? method : "GET", headers, body: mantieneCuerpo ? body : null, timeoutMs, redirecciones: redirecciones - 1 }));
      }
      const partes = [];
      res.on("data", (d) => partes.push(d));
      res.on("error", reject);
      res.on("end", () => {
        const buffer = Buffer.concat(partes);
        resolve({
          status: statusCode,
          ok: statusCode >= 200 && statusCode < 300,
          headers: cabeceras,
          url: destino.toString(),
          text: async () => buffer.toString("utf8"),
          json: async () => JSON.parse(buffer.toString("utf8")),
          arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`sin respuesta en ${timeoutMs / 1000} s`)));
    req.on("error", reject);
    if (body !== null && body !== undefined) req.write(typeof body === "string" || Buffer.isBuffer(body) ? body : String(body));
    req.end();
  });
}
