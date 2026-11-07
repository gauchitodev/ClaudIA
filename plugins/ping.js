import { S_WHATSAPP_NET } from "@whiskeysockets/baileys";
import { duracion, enviadoEn } from "../lib/tiempo.js";
import { conexion } from "../lib/conexion.js";

// .ping: whether Claudia is up, and how far WhatsApp is. The round trip is the same iq Baileys keeps the connection
// alive with (lib/Socket/socket.js, keepAlive), timed; nothing goes to the group for it. Then since when she's on and
// connected, and, when the message took long to reach her, how long: the backlog after a reconnection shows there.
// For anyone, anywhere: .estado is the moderators' and reads the battery and the groups.
const plugin = {};
plugin.cmd = ["ping"];

export const PING = {
  ESPERA_MS: 5000, // how long to wait for WhatsApp's answer
  ATRASO_MIN_MS: 3000, // a message older than this when it's handled is said to have come late
};

// The round trip to WhatsApp's server, in ms; null when it doesn't answer in time, the connection fails, or the socket
// has no query (the tests' fake client). Baileys gives undefined, without throwing, when the wait runs out.
async function idaYVuelta(client) {
  if (typeof client?.query !== "function") return null;
  const desde = Date.now();
  try {
    const respuesta = await client.query({ tag: "iq", attrs: { to: S_WHATSAPP_NET, type: "get", xmlns: "w:p" }, content: [{ tag: "ping", attrs: {} }] }, PING.ESPERA_MS);
    return respuesta ? Date.now() - desde : null;
  } catch {
    return null;
  }
}

plugin.run = async (m, { client }) => {
  const ahora = Date.now();
  const ms = await idaYVuelta(client);
  const lineas = ["🏓 Pong", ms === null ? `📡 WhatsApp no me contestó el ping en ${PING.ESPERA_MS / 1000} s, pero acá estoy.` : `📡 WhatsApp me contesta en ${ms} ms.`];
  const salio = enviadoEn(m);
  const atraso = salio ? ahora - salio : 0;
  if (atraso >= PING.ATRASO_MIN_MS) lineas.push(`🐢 Tu mensaje salió hace ${duracion(atraso)}: voy atrasada.`);
  const conectada = conexion.horaConexion ? ` · conectada hace ${duracion(ahora - conexion.horaConexion)}` : "";
  lineas.push(`🟢 Encendida hace ${duracion(process.uptime() * 1000)}${conectada}.`);
  await client.sendText(m.chat, lineas.join("\n"), m);
};

export default plugin;
