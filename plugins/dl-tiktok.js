
async function tiktokdl(url) {
  if (!url || !url.includes("tiktok.com")) throw new Error("URL de TikTok inválida");

  /* 
  
  Scraping de TikTok extraído del codigo fuente de la librería de bochilteam/scraper. https://github.com/martinezanthony

  */
  const response = await fetch("https://api.tikmate.app/api/lookup", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "*/*",
      Origin: "https://tikmate.app",
      Referer: "https://tikmate.app/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
    body: new URLSearchParams({ url }),
  });

  if (!response.ok) throw new Error("Error al contactar con TikMate");

  const data = await response.json();

  if (data.success === false || !data.token || !data.id) {
    throw new Error("No se pudo obtener el video (puede ser privado o bloqueado)");
  }

  const videoSinMarca = `https://tikmate.app/download/${data.token}/${data.id}.mp4`;
  const videoHD = `https://tikmate.app/download/${data.token}/${data.id}.mp4?hd=1`;

  return {
    author: {
      nickname: data.author_name || "Desconocido",
      unique_id: data.author_id || "unknown",
      avatar: data.author_avatar || "",
    },
    video: {
      no_watermark: videoSinMarca,
      no_watermark_hd: videoHD,
      no_watermark2: videoSinMarca,
      no_watermark_raw: videoSinMarca,
    },
    title: data.title || "",
    duration: data.duration || 0,
  };
}

const plugin = {};
plugin.cmd = ["tt", "tiktok", "dltiktok"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text, args }) => {
  if (!text) return client.sendText(m.chat, txt.tiktokNull, m);

  if (!/(vm\.tiktok\.com|vt\.tiktok\.com|tiktok\.com)/i.test(text)) return client.sendText(m.chat, txt.tiktokLinkNull, m);

  m.react("⏳");

  try {
    const data = await tiktokdl(text.trim());

    const url = data.video.no_watermark_hd || data.video.no_watermark || data.video.no_watermark2 || data.video.no_watermark_raw;

    await client.sendFile(m.chat, url, "tiktok.mp4", txt.tiktokSuccess, m);
    m.react("✅");
  } catch (err) {
    console.error("Error TikTok:", err.message);
    m.react("❌");
    client.sendText(m.chat, "❌ No se pudo descargar el video. Puede ser privado, eliminado o TikTok bloqueó la API.", m);
  }
};

export default plugin;
