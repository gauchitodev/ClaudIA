// Descarga una imagen de fondo con timeout, para pasársela a Jimp ya como buffer.
// Sin esto, si el servidor de la imagen no contesta (i.ibb.co, por ejemplo, se cayó), el comando
// queda colgado para siempre: la persona ve el relojito y nunca llega respuesta.
const TIMEOUT_MS = 12000;

export default async function fondo(url) {
  const control = new AbortController();
  const id = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: control.signal });
    if (!res.ok) throw new Error(`respondió ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    const motivo = e.name === "AbortError" ? `no respondió en ${TIMEOUT_MS / 1000}s` : e.message;
    throw new Error(`no se pudo bajar el fondo (${url}): ${motivo}`);
  } finally {
    clearTimeout(id);
  }
}
