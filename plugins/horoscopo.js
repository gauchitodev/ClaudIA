import { pedirHttp } from "../lib/http.js";

// Daily horoscope from horoscopo.com.
// Mind the names: the site uses accent-free URLs and calls Escorpio "escorpion", so what the person types never goes
// straight into the URL. It used to, which is why ".horoscopo géminis", ".horoscopo cáncer" and ".horoscopo escorpio"
// all returned 404.
const SIGNOS = {
  aries: { url: "aries", emoji: "♈", nombre: "Aries" },
  tauro: { url: "tauro", emoji: "♉", nombre: "Tauro" },
  geminis: { url: "geminis", emoji: "♊", nombre: "Géminis" },
  cancer: { url: "cancer", emoji: "♋", nombre: "Cáncer" },
  leo: { url: "leo", emoji: "♌", nombre: "Leo" },
  virgo: { url: "virgo", emoji: "♍", nombre: "Virgo" },
  libra: { url: "libra", emoji: "♎", nombre: "Libra" },
  escorpio: { url: "escorpion", emoji: "♏", nombre: "Escorpio" },
  sagitario: { url: "sagitario", emoji: "♐", nombre: "Sagitario" },
  capricornio: { url: "capricornio", emoji: "♑", nombre: "Capricornio" },
  acuario: { url: "acuario", emoji: "♒", nombre: "Acuario" },
  piscis: { url: "piscis", emoji: "♓", nombre: "Piscis" },
};

// "Géminis", "geminis!", "soy escorpión" → the sign's key, or null.
export function buscarSigno(texto) {
  const limpio = String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, " ");
  if (!limpio.trim()) return null;
  const palabras = limpio.split(/\s+/).filter(Boolean);
  for (const p of palabras) {
    if (SIGNOS[p]) return p;
    if (p === "escorpion" || p === "escorpo") return "escorpio";
    if (p === "geminis" || p === "gemini") return "geminis";
    if (p === "picis" || p === "piscis") return "piscis";
  }
  return null;
}

const plugin = {};
plugin.cmd = ["horoscopo", "horóscopo"];
plugin.botAdmin = true;

plugin.run = async (m, { client, text }) => {
  const caption = `🌠 \`INGRESE SU SIGNO\` 🌠\n\n${Object.entries(SIGNOS)
    .map(([clave, s]) => `${s.emoji} .horoscopo ${clave}`)
    .join("\n")}`;
  if (!text) return client.sendText(m.chat, caption, m);

  const clave = buscarSigno(text);
  if (!clave) return client.sendText(m.chat, `No reconocí ese signo.\n\n${caption}`, m);
  const signo = SIGNOS[clave];

  try {
    const res = await pedirHttp(`https://www.horoscopo.com/horoscopos/general-diaria-${signo.url}`, { timeoutMs: 15000 });
    if (!res.ok) throw new Error(`horoscopo.com respondió ${res.status}`);

    const html = await res.text();
    const inicio = html.indexOf("<p>") + "<p>".length;
    const fin = html.indexOf("</p>", inicio);
    const prediccion = inicio > 2 && fin > inicio ? html.substring(inicio, fin).trim() : "";
    if (!prediccion) throw new Error("no encontré la predicción en la página");

    // The site starts with "Domingo, 13 de Sept. de 2026 – text". If it doesn't come that way, it's sent whole.
    const guion = prediccion.indexOf("–") >= 0 ? "–" : "-";
    const partes = prediccion.split(guion);
    const fecha = partes.length > 1 ? partes[0].trim() : "";
    const texto = partes.length > 1 ? partes.slice(1).join(guion).trim() : prediccion;

    m.react(signo.emoji).catch(() => {});
    const teks = `*${signo.emoji} ${signo.nombre.toUpperCase()} ${signo.emoji}*\n${fecha ? `\n*📅 ${fecha}*\n` : ""}\n${texto}`;
    const link = "https://telegra.ph/file/cd132232c09831825aed2.jpg";
    const kz = await client.sendFile(m.chat, link, null, teks, m);
    if (kz?.key) client.sendMessage(m.chat, { react: { text: "🌠", key: kz.key } }).catch(() => {});
  } catch (error) {
    console.error("[horoscopo]", error.message);
    await client.sendText(m.chat, `🌠 No pude traer el horóscopo de ${signo.nombre} ahora. Probá de nuevo en un rato.`, m);
  }
};

export default plugin;
