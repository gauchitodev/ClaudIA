import { getUser } from "../database-functions.js";
import { lidMencionado, nombreDe } from "../lib/menciones.js";
import { pedirAdopcion, FAMILIA } from "../lib/familia.js";

// .adoptar @x: un matrimonio adopta a alguien. Queda pendiente hasta que x responda con .si o .no.
const plugin = {};
plugin.cmd = ["adoptar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  const who = lidMencionado(m, text);
  if (!who || !getUser(who)) return client.sendText(m.chat, `¿A quién? Uso: ${usedPrefix}${command} @persona (o respondé a un mensaje suyo). Hay que estar casado; la otra persona acepta con .si.`, m);
  if (who === client.user.lid) return client.sendText(m.chat, "A mí no me adopta nadie: yo los adopté a todos ustedes 😌", m);

  const r = pedirAdopcion(m.chat, m.sender, who);
  if (!r.ok) {
    const nombre = nombreDe(who);
    const errores = {
      mismo: "Adoptarte a vos mismo no se puede, por más solo que estés.",
      sinCasar: "Para adoptar hay que estar casado. Primero .pareja, después .casarse, y ahí sí.",
      esTuPareja: "Esa es tu pareja, no tu hijo 🤨",
      tienePadres: `${nombre} ya tiene padres: ${r.padres ? r.padres.map(nombreDe).join(" y ") : ""}. Tendría que emanciparse primero (.emancipar).`,
      antepasado: `${nombre} es antepasado tuyo. Adoptarlo haría un nudo en el árbol.`,
      pariente: `${nombre} ya es ${r.parentesco}. No hace falta adoptarlo.`,
      muchosHijos: `Ya tienen ${FAMILIA.MAX_HIJOS} hijos, que es el máximo. Con .desheredar se hace lugar 😬`,
      porHoy: "Una adopción por día. Mañana seguís agrandando la familia.",
      pendiente: `Ya tenés una adopción pendiente con ${r.hijo ? nombreDe(r.hijo) : "otra persona"}. Esperá a que responda.`,
      yaPedida: `Ya se lo pediste a ${nombre}. Tiene que responder con .si o .no.`,
      sinCoins: `El trámite de adopción cuesta ${r.costo} UruCoins y no te alcanza.`,
    };
    return client.sendText(m.chat, errores[r.motivo] || "No se pudo.", m);
  }
  const kz = await client.sendMessage(
    m.chat,
    { text: `👨‍👩‍👧 @${who.split("@")[0]}, ${nombreDe(m.sender)} y ${nombreDe(r.conyuge)} te quieren adoptar${r.costo ? ` (ya pagaron los ${r.costo} UruCoins del trámite)` : ""}. Respondé con .si o .no; el pedido vence en ${FAMILIA.DIAS_SOLICITUD} días.`, mentions: [who] },
    { quoted: m },
  );
  client.sendMessage(m.chat, { react: { text: "🍼", key: kz.key } });
};

export default plugin;
