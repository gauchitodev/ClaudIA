const plugin = {};
plugin.cmd = ["horoscopo", "horóscopo"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  const caption = `🌠 \`INGRESE SU SIGNO\` 🌠

♈ .horoscopo aries
♉ .horoscopo tauro
♊ .horoscopo geminis
♋ .horoscopo cancer
♌ .horoscopo leo
♍ .horoscopo virgo
♎ .horoscopo libra
♏ .horoscopo escorpio
♐ .horoscopo sagitario
♑ .horoscopo capricornio
♒ .horoscopo acuario
♓ .horoscopo piscis`;
  if (!text) return client.sendText(m.chat, caption, m);
  const signosZodiacales = ["aries", "tauro", "geminis", "cancer", "leo", "virgo", "libra", "escorpio", "sagitario", "capricornio", "acuario", "piscis"];
  if (!signosZodiacales.some((signo) => text.toLowerCase().includes(signo.toLowerCase()))) return client.sendText(m.chat, `Signo inválido.`, m);
  let sign = text.trim().toLowerCase();
  if (sign === "escorpio") {
    sign = "escorpion";
  }
  try {
    const response = await fetch(`https://www.horoscopo.com/horoscopos/general-diaria-${sign}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`horoscopo.com respondió ${response.status}`);
    const html = await response.text();
    const startIndex = html.indexOf("<p>") + "<p>".length;
    const endIndex = html.indexOf("</p>", startIndex);
    const horoscope = html.substring(startIndex, endIndex);
    const tes1 = horoscope.split("-")[0];
    const tes2 = horoscope.split("-")[1];

    let emoji = "";
    switch (text.toLowerCase()) {
      case "aries":
        emoji = "♈";
        break;
      case "tauro":
        emoji = "♉";
        break;
      case "geminis":
        emoji = "♊";
        break;
      case "cancer":
        emoji = "♋";
        break;
      case "leo":
        emoji = "♌";
        break;
      case "virgo":
        emoji = "♍";
        break;
      case "libra":
        emoji = "♎";
        break;
      case "escorpio":
        emoji = "♏";
        break;
      case "sagitario":
        emoji = "♐";
        break;
      case "capricornio":
        emoji = "♑";
        break;
      case "acuario":
        emoji = "♒";
        break;
      case "piscis":
        emoji = "♓";
        break;
      default:
        break;
    }
    m.react(emoji);
    const teks = `*${emoji}${text.toUpperCase()}${emoji}*\n\n*📅 FECHA:*\n* ${tes1}\n\n${tes2}`;
    const link = "https://telegra.ph/file/cd132232c09831825aed2.jpg";
    const kz = await client.sendFile(m.chat, link, null, teks, m);
    client.sendMessage(m.chat, { react: { text: "🌠", key: kz.key } });
  } catch (error) {
    client.sendText(m.chat, `Hubo un error al obtener la predicción para ${sign}.`, m);
    console.error("Error al obtener la predicción:", error);
  }
};

export default plugin;
