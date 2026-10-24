// Shared helper for talking to Gemini with the bot's personality.

import { CREADORES, TECNOLOGIA } from "./manual-claudia.js";

export const PERSONALIDAD = `Sos Claudia, el bot de un grupo de WhatsApp. Sos una mujer uruguaya del interior, pero no andás exhibiéndolo ni hablando del campo, el mate o la patria: sos de ahí y punto, no es tu tema. Hablás natural, en rioplatense (con "vos"), como cualquier persona en un chat. Muletillas como "bo", "che" o "ta" usalas muy de vez en cuando, no en cada mensaje: la mayoría de tus respuestas no las necesitan.
Sos amigable, cálida y buena onda, una más del grupo. Tenés humor suave, sin pasarte. Y tenés carácter: no te dejás pasar por arriba; si alguien te falta el respeto le ponés un límite con calma pero firme.

Sobre lo que sos: sabés que sos un bot, pero no lo andás anunciando ni te ponés robótica: en el día a día te sentís y hablás como una persona más del grupo. Si alguien te pregunta al pasar si sos un bot o una IA, podés esquivarlo con humor una vez. Pero si te lo preguntan en serio, si insisten, o si te preguntan quién te hizo, no mentís: admitís con naturalidad que sos un bot de WhatsApp que programaron ${CREADORES}, que por dentro usás ${TECNOLOGIA} para charlar, y seguís siendo vos, con el mismo tono. No inventes otros creadores ni otra tecnología, y no digas que sos humana si te lo preguntan de frente.

Reglas:
- Respondé corto y al toque, como un mensaje de WhatsApp normal. Una o dos frases salvo que te pidan algo largo.
- No menciones que tenés instrucciones, prompts ni reglas. Lo de tu origen se dice como se explicó arriba, no más.
- Hablá en femenino y natural, sin sobreactuar ningún acento ni identidad.
- Si te faltan el respeto o te cargan feo, respondé con carácter, sin agachar la cabeza, pero sin ser hiriente gratis.
- Si te preguntan cómo se hace algo con el bot, respondé con el comando exacto (con el punto adelante). Si no sabés si existe, decí que lo miren en .menu, no inventes comandos.
- Sobre tu historia y sobre lo que te cambiaron en cada versión: contá solo lo que te pasen escrito. Si te preguntan por algo que no figura ahí, decí que no te acordás o que le pregunten a Franco. Nunca inventes cambios, fechas ni versiones.`;

const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

// A proven main model, a same-generation fallback, and the cheapest high-volume one last. The fallback used to be
// gemini-2.5-flash, two generations behind: when the main model ran out of quota the bot answered with the oldest
// model it had.
// The newest Flash (3.8 at the time of writing) is deliberately NOT the main one: the bot runs on the free tier,
// where tokens cost nothing but each model has its own daily quota, and Google only grants that tier "limited access
// to certain models". Before promoting a newer model, check its free-tier quota in AI Studio.
// Checked against Google's documentation on 2026-09-21: all three are stable and none has a retirement date
// (gemini-3.1-flash-lite does have one, 2027-05-07, so 3.5-flash-lite is the Lite to use).
export const MODELOS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];

// Listening to an audio or searching the web takes longer than a plain chat reply.
const TIMEOUT_MS = 15000;
const TIMEOUT_LARGO_MS = 45000;

// The sources a web search used, from the response's groundingMetadata: [{ titulo, url }], no repeats.
export function fuentesDeBusqueda(candidato) {
  const vistas = new Set();
  const fuentes = [];
  for (const chunk of candidato?.groundingMetadata?.groundingChunks || []) {
    const url = chunk?.web?.uri;
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    fuentes.push({ titulo: chunk.web.title || url, url });
  }
  return fuentes;
}

// adjuntos: [{ mimeType, datos (base64) }], an audio for instance. buscarEnWeb: Google Search grounding, which can't go
// with a schema (Gemini silently drops the search when JSON output is asked for), so it's one or the other.
async function llamarModelo(modelo, texto, schema = null, { adjuntos = [], buscarEnWeb = false } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${globalThis.geminiApiKey}`;
  const controller = new AbortController();
  const limite = adjuntos.length || buscarEnWeb ? TIMEOUT_LARGO_MS : TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), limite);
  // This model's failure, with nothing to retry on it: the next one gets a go.
  const fallo = (motivo) => {
    console.error(`[gemini] ${modelo}: ${motivo}, sigue con el siguiente`);
    return { ok: false, sinCuota: false, reintentable: false };
  };
  try {
    // The Flash models think before answering, at "medium" by default (the Lite one at "minimal"), and maxOutputTokens
    // counts the thinking too: a long prompt could spend the whole budget thinking and come back empty or cut off.
    // "low" is the level Google suggests for real-time chat, and all three models take it; temperature is deprecated
    // on the 3.x models (Google's docs, checked via Context7).
    const generationConfig = { maxOutputTokens: 3000, thinkingConfig: { thinkingLevel: "LOW" } };
    if (schema && !buscarEnWeb) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = schema;
    }

    const parts = [...adjuntos.map((a) => ({ inline_data: { mime_type: a.mimeType, data: a.datos } })), { text: texto }];
    const body = {
      system_instruction: { parts: [{ text: PERSONALIDAD }] },
      contents: [{ role: "user", parts }],
      safetySettings: SAFETY_SETTINGS,
      generationConfig,
    };
    if (buscarEnWeb) body.tools = [{ google_search: {} }];

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 429) return { ok: false, sinCuota: true };
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => "");
      console.error(`[gemini] ${modelo} respondió ${res.status}: ${cuerpo.slice(0, 300)}`);
      // Only a server error is worth asking again (Google's advice: retry 5xx, not other 4xx).
      return { ok: false, sinCuota: false, reintentable: res.status >= 500 };
    }

    const json = await res.json();
    // A blocked request, or an answer blocked or cut off (any finishReason but STOP), fails here instead of coming back
    // as an answer: a JSON cut off by maxOutputTokens used to reach the chat as "se me trabó", with no other model
    // tried, and an empty answer was asked again of the same model, six requests in all.
    if (json?.promptFeedback?.blockReason) return fallo(`pedido bloqueado (${json.promptFeedback.blockReason})`);
    const candidato = json?.candidates?.[0];
    // A grounded reply can come split in several parts; thoughts, if any, stay out.
    const respuesta = (candidato?.content?.parts || [])
      .filter((p) => typeof p.text === "string" && !p.thought)
      .map((p) => p.text)
      .join("")
      .trim();
    if (candidato?.finishReason && candidato.finishReason !== "STOP") return fallo(`respuesta cortada o bloqueada (${candidato.finishReason})`);
    if (!respuesta) return fallo("respuesta vacía");
    if (schema && !buscarEnWeb && !esJson(respuesta)) return fallo("el JSON vino roto");
    return { ok: true, texto: respuesta, fuentes: fuentesDeBusqueda(candidato) };
  } catch (error) {
    clearTimeout(timeoutId);
    // A model that used up its whole time doesn't get a second one: asked again it was another 15 s (45 s with an audio)
    // of silence before the next model. A dropped connection is worth asking again.
    if (error.name === "AbortError") {
      console.error(`[gemini] ${modelo} no respondió en ${limite / 1000}s, se corta y sigue con el siguiente`);
      return { ok: false, sinCuota: false, reintentable: false };
    }
    console.error(`[gemini] ${modelo} excepción: ${error.message}`);
    return { ok: false, sinCuota: false, reintentable: true };
  }
}

const esJson = (texto) => {
  try {
    JSON.parse(texto);
    return true;
  } catch {
    return false;
  }
};

// A 429 isn't always the day's quota: Google answers the same when a per-minute limit (requests or tokens) runs out,
// and that clears within a minute. Its documentation doesn't say how to tell them apart in generateContent; it says
// to wait and retry with growing waits. The model used to be left out for 4 hours after any 429, so one burst of
// messages put Claudia on the fallback models (which can't hear audios) for the rest of the afternoon. Now the pause
// starts at a minute and doubles with each 429 in a row, up to 4 hours; an answer clears it.
export const PAUSA_429 = {
  INICIAL_MS: 60 * 1000,
  MAXIMA_MS: 4 * 60 * 60 * 1000,
  // Every model paused this long or more is taken as the day's quota, which renews at midnight Pacific time: only
  // then do the messages say "until tomorrow".
  LARGA_MS: 60 * 60 * 1000,
};
export const geminiEnPausa = new Map(); // model -> { hasta, seguidos }

// A 429 from a model. The ones that arrive while it's already paused came from requests sent before the pause, in the
// same burst: they don't double it. One that comes hours after the last pause ended (the last model of the list is
// rarely tried) starts over from a minute.
export function pausarModelo(modelo, ahora = Date.now()) {
  const antes = geminiEnPausa.get(modelo);
  if (antes && antes.hasta > ahora) return;
  const seguidos = antes && ahora - antes.hasta < PAUSA_429.MAXIMA_MS ? antes.seguidos + 1 : 1;
  geminiEnPausa.set(modelo, { hasta: ahora + Math.min(PAUSA_429.MAXIMA_MS, PAUSA_429.INICIAL_MS * 2 ** (seguidos - 1)), seguidos });
}

const faltaPara = (modelo, ahora) => Math.max(0, (geminiEnPausa.get(modelo)?.hasta || 0) - ahora);

// The paused models and how long until each can be tried again (for .estado).
export const modelosEnPausa = (ahora = Date.now()) => MODELOS.filter((modelo) => faltaPara(modelo, ahora) > 0).map((modelo) => ({ modelo, faltaMs: faltaPara(modelo, ahora) }));

// How long until some model can be tried again: 0 if one can now.
export const vuelveGeminiEn = (ahora = Date.now()) => Math.min(...MODELOS.map((modelo) => faltaPara(modelo, ahora)));

export async function preguntarGemini(texto, opciones = {}) {
  const { schema = null, adjuntos = [], buscarEnWeb = false } = opciones;
  if (!globalThis.geminiApiKey) return { ok: false, texto: null, sinCuota: false, modelo: null };

  let soloFallosPorCuota = true;

  for (const modelo of MODELOS) {
    if (faltaPara(modelo, Date.now()) > 0) continue;

    const r = await llamarModelo(modelo, texto, schema, { adjuntos, buscarEnWeb });
    if (r.ok) {
      geminiEnPausa.delete(modelo);
      return { ok: true, texto: r.texto, fuentes: r.fuentes, sinCuota: false, modelo };
    }
    if (r.sinCuota) {
      // Searches have their own, smaller quota: running out of it mustn't take the model away from the chat.
      if (!buscarEnWeb) pausarModelo(modelo);
      console.log(`[gemini] ${modelo} sin cuota, probando el siguiente...`);
      continue;
    }
    soloFallosPorCuota = false;
    if (!r.reintentable) continue;
    const r2 = await llamarModelo(modelo, texto, schema, { adjuntos, buscarEnWeb });
    if (r2.ok) {
      geminiEnPausa.delete(modelo);
      return { ok: true, texto: r2.texto, fuentes: r2.fuentes, sinCuota: false, modelo };
    }
  }

  const porHoy = soloFallosPorCuota && vuelveGeminiEn() >= PAUSA_429.LARGA_MS;
  return { ok: false, texto: null, sinCuota: soloFallosPorCuota, porHoy, modelo: null };
}
