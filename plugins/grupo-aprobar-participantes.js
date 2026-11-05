// .ap (.aprobar): approves the group's pending requests to join (lib/solicitudes.js), one at a time and a few seconds
// apart, as an admin tapping them would; .ap 5 approves the first five and leaves the rest for another .ap.
// .pendientes lists them. Whoever is on the blacklist is rejected instead, every answer from WhatsApp is read, and the
// run ends with what happened to each. Only in a group, with the bot as admin, by an admin.
import { aprobacionEnCurso, aprobarPendientes, textoPendientes, textoAviso, textoResumen, SIN_PENDIENTES, USO, YA_EN_CURSO } from "../lib/solicitudes.js";
import { leerEntero } from "../lib/comandos.js";

const plugin = {};
plugin.cmd = ["ap", "aprobar", "pendientes"];
plugin.onlyGroup = true;
plugin.botAdmin = true;
plugin.onlyAdmin = true;

// A reaction that fails (one that would wait too long isn't sent, lib/ritmo.js) mustn't stop the run.
async function reaccionar(m, emoji) {
  try {
    await m.react(emoji);
  } catch (e) {
    console.error("[ap] no se pudo reaccionar:", e?.message || e);
  }
}

plugin.run = async (m, { client, command, text, participants }) => {
  try {
    if (command === "pendientes") return await client.sendText(m.chat, textoPendientes(await client.groupRequestParticipantsList(m.chat)), m);

    // .ap 5: at most that many approved in this run (lib/comandos.js reads it); .ap alone, everyone.
    const pedido = String(text || "").trim();
    const maximo = pedido ? leerEntero(pedido) : Infinity;
    if (!(maximo > 0)) return await client.sendText(m.chat, USO, m);
    if (aprobacionEnCurso(m.chat)) return await client.sendText(m.chat, YA_EN_CURSO, m);
    const pendientes = await client.groupRequestParticipantsList(m.chat);
    if (!pendientes.length) return await client.sendText(m.chat, SIN_PENDIENTES, m);

    const aviso = textoAviso(pendientes.length, maximo);
    if (aviso) await client.sendText(m.chat, aviso, m);
    await reaccionar(m, "⏳");
    const r = await aprobarPendientes(client, m.chat, pendientes, { maximo, participants });
    if (r.estado !== "enCurso") await reaccionar(m, r.estado === "cortado" ? "⚠️" : "✅");
    return await client.sendText(m.chat, textoResumen(r), m);
  } catch (error) {
    console.error("[ap] ERROR:", error);
    await client.sendText(m.chat, "Hubo un error al procesar el comando.", m);
  }
};

export default plugin;
