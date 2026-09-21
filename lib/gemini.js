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
const MODELOS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];

async function llamarModelo(modelo, texto, schema = null) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${globalThis.geminiApiKey}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const generationConfig = { temperature: 0.9, maxOutputTokens: 1500 };
    if (schema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = schema;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: PERSONALIDAD }] },
        contents: [{ role: "user", parts: [{ text: texto }] }],
        safetySettings: SAFETY_SETTINGS,
        generationConfig,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 429) return { ok: false, sinCuota: true };
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => "");
      console.error(`[gemini] ${modelo} respondió ${res.status}: ${cuerpo.slice(0, 300)}`);
      return { ok: false, sinCuota: false };
    }

    const json = await res.json();
    const respuesta = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (respuesta) return { ok: true, texto: respuesta.trim() };
    return { ok: false, sinCuota: false };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      console.error(`[gemini] ${modelo} no respondió en 15s, se corta y sigue con el siguiente`);
    } else {
      console.error(`[gemini] ${modelo} excepción: ${error.message}`);
    }
    return { ok: false, sinCuota: false };
  }
}

if (!globalThis.modeloSinCuotaDesde) globalThis.modeloSinCuotaDesde = new Map();
export const COOLDOWN_REINTENTO_MS = 4 * 60 * 60 * 1000;

export async function preguntarGemini(texto, opciones = {}) {
  const { schema = null } = opciones;
  if (!globalThis.geminiApiKey) return { ok: false, texto: null, sinCuota: false, modelo: null };

  let soloFallosPorCuota = true;

  for (const modelo of MODELOS) {
    const marcadoDesde = globalThis.modeloSinCuotaDesde.get(modelo);
    if (marcadoDesde && Date.now() - marcadoDesde < COOLDOWN_REINTENTO_MS) {
      continue;
    }

    const r = await llamarModelo(modelo, texto, schema);
    if (r.ok) {
      globalThis.modeloSinCuotaDesde.delete(modelo);
      return { ok: true, texto: r.texto, sinCuota: false, modelo };
    }
    if (r.sinCuota) {
      globalThis.modeloSinCuotaDesde.set(modelo, Date.now());
      console.log(`[gemini] ${modelo} sin cuota, probando el siguiente...`);
      continue;
    }
    soloFallosPorCuota = false;
    const r2 = await llamarModelo(modelo, texto, schema);
    if (r2.ok) {
      globalThis.modeloSinCuotaDesde.delete(modelo);
      return { ok: true, texto: r2.texto, sinCuota: false, modelo };
    }
  }

  return { ok: false, texto: null, sinCuota: soloFallosPorCuota, modelo: null };
}
