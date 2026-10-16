// Downloads an image from a link that comes from outside (a search result, say) without letting it reach the bot's own
// network. A link, or any redirect it leads to, could point at the router or at another device in the house, and
// whatever answered would be sent to the group: .imagen handed Google's links to sendFile, whose fetch followed
// redirects anywhere. Here every connection checks the address it's about to use, at the moment of connecting (so a
// name can't resolve to one address for the check and another for the connection), redirects are followed by hand,
// and only an image of a reasonable size is accepted.
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

export const DESCARGA = {
  MAX_REDIRECCIONES: 3,
  MAX_BYTES: 10 * 1024 * 1024,
  TIMEOUT_MS: 15000,
};
// Like a browser: plenty of image hosts (Wikimedia among them) answer 403 to a request with no User-Agent.
const CABECERAS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
};

// Addresses that aren't the public internet: this machine, the local network, link-local (cloud metadata among them),
// carrier-grade NAT, multicast and reserved ones. An IPv4 written as IPv6 (::ffff:192.168.0.1) falls under the IPv4
// rules.
const PRIVADAS = new net.BlockList();
const REDES_V4 = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]];
const REDES_V6 = [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]];
for (const [red, prefijo] of REDES_V4) PRIVADAS.addSubnet(red, prefijo, "ipv4");
for (const [red, prefijo] of REDES_V6) PRIVADAS.addSubnet(red, prefijo, "ipv6");

// Anything that isn't an address counts as private: there's nothing public to connect to.
export function esDireccionPrivada(ip) {
  const tipo = net.isIP(ip);
  return !tipo || PRIVADAS.check(ip, tipo === 6 ? "ipv6" : "ipv4");
}

// Swappable in the tests: the name resolution, and which addresses are refused (the test server lives on 127.0.0.1).
export const _dep = { lookup: dns.lookup, esPrivada: esDireccionPrivada };

const errorPrivada = (donde, ip) => Object.assign(new Error(`${donde} apunta a una dirección privada (${ip})`), { code: "EDIRECCIONPRIVADA" });

// dns.lookup that refuses private addresses. Node asks for every address (all: true) to try IPv6 and IPv4 in turn:
// then none of them may be private.
function lookupSeguro(hostname, opciones, callback) {
  _dep.lookup(hostname, { ...opciones, all: true }, (err, direcciones) => {
    if (err) return callback(err);
    const privada = direcciones.find((d) => _dep.esPrivada(d.address));
    if (privada) return callback(errorPrivada(hostname, privada.address));
    if (opciones?.all) return callback(null, direcciones);
    callback(null, direcciones[0].address, direcciones[0].family);
  });
}

function pedir(enlace, redireccionesQuedan) {
  return new Promise((resolve, reject) => {
    let destino;
    try {
      destino = new URL(enlace);
    } catch {
      return reject(new Error(`link inválido: ${enlace}`));
    }
    if (destino.protocol !== "https:" && destino.protocol !== "http:") return reject(new Error(`protocolo no permitido: ${destino.protocol}`));
    // A link with the address written out connects without a lookup: it's checked here.
    const host = destino.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && _dep.esPrivada(host)) return reject(errorPrivada(host, host));

    const modulo = destino.protocol === "https:" ? https : http;
    const req = modulo.get(destino, { lookup: lookupSeguro, timeout: DESCARGA.TIMEOUT_MS, headers: CABECERAS }, (res) => {
      const { statusCode, headers } = res;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        res.resume();
        if (redireccionesQuedan <= 0) return reject(new Error("demasiadas redirecciones"));
        return resolve(pedir(new URL(headers.location, destino).href, redireccionesQuedan - 1));
      }
      const tipo = headers["content-type"] || "";
      const problema = statusCode !== 200 ? `respondió ${statusCode}` : !/^image\//i.test(tipo) ? `no es una imagen (${tipo || "sin tipo"})` : Number(headers["content-length"]) > DESCARGA.MAX_BYTES ? "es demasiado grande" : null;
      if (problema) {
        res.destroy();
        return reject(new Error(problema));
      }
      const partes = [];
      let total = 0;
      res.on("data", (parte) => {
        total += parte.length;
        if (total > DESCARGA.MAX_BYTES) res.destroy(new Error("es demasiado grande"));
        else partes.push(parte);
      });
      res.on("end", () => resolve(Buffer.concat(partes)));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("no respondió a tiempo")));
    req.on("error", reject);
  });
}

// The image behind a link, as a Buffer. Rejects when the link or a redirect leads to a private address, when what
// answers isn't an image, or when it's too big or too slow.
export const bajarImagen = (enlace) => pedir(enlace, DESCARGA.MAX_REDIRECCIONES);
