const plugin = {};
plugin.cmd = ["instagram", "igdl"];
plugin.botAdmin = true;

plugin.run = async (m, { client, args }) => {
  if (!args[0]) return client.sendText(m.chat, txt.dlInstaNull, m);
  m.react("⌛");
  try {
    const res = await fetch(`${deliriusApi}/download/instagram?url=${encodeURIComponent(args[0])}`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`la API respondió ${res.status}`);
    const responseIg = await res.json();
    const linkig = responseIg?.data?.[0]?.url;
    if (!linkig) throw new Error("la API no devolvió ningún archivo");
    await client.sendFile(m.chat, linkig, "error.mp4", txt.dlInstaSuccess, m);
  } catch (e) {
    console.log("[dl-instagram]", e.message);
    m.react("❌");
    await client.sendText(m.chat, "No pude descargar ese enlace de Instagram, probá de nuevo más tarde.", m);
  }
};

export default plugin;
