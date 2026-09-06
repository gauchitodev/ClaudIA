import { setTimeout as esperar } from "node:timers/promises";

const plugin = {};
plugin.cmd = ["avisartodos", "broadcast"];

plugin.run = async (m, { client, text, isOwner }) => {
  if (!isOwner) return client.sendText(m.chat, "Este comando es solo para el dueño del bot.", m);
  if (!text) return client.sendText(m.chat, "Escribí el mensaje después del comando. Ej: .avisartodos Hoy arranca el ranking mensual 🏆", m);

  const grupos = await client.groupFetchAllParticipating();
  const jids = Object.keys(grupos);

  let enviados = 0;
  let fallidos = 0;

  for (const jid of jids) {
    try {
      await client.sendText(jid, text, null);
      enviados++;
      // pausa entre grupos para no mandar todo de golpe y que parezca spam.
      await esperar(1500);
    } catch (e) {
      console.error(`[avisar-todos] falló en ${jid}:`, e.message);
      fallidos++;
    }
  }

  await client.sendText(m.chat, `✅ Mensaje enviado a ${enviados} grupo(s).${fallidos > 0 ? ` (${fallidos} fallaron)` : ""}`, m);
};

export default plugin;
