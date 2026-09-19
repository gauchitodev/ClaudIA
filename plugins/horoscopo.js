import { pedirHttp } from "../lib/http.js";

// Horóscopo diario de horoscopo.com.
// Ojo con los nombres: el sitio usa la URL sin tildes y llama "escorpion" a Escorpio, así que lo que
// escribe la persona nunca va directo a la URL. Antes sí iba, y por eso ".horoscopo géminis",
// ".horoscopo cáncer" y ".horoscopo escorpio" devolvían 404.
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

// "Géminis", "geminis!", "soy escorpión" → la clave del signo, o null.
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

    // El sitio arranca con "Domingo, 13 de Sept. de 2026 – texto". Si no viene así, se manda entero.
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
