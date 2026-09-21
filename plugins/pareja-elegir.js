import { getUser } from "../database-functions.js";
import { elegirAlAzar } from "../lib/azar.js";
import { lidMencionado } from "../lib/menciones.js";
import { pedirPareja } from "../lib/parejas.js";

// .pareja @x: asks x to be your partner. It stays pending until x answers with .aceptar or .rechazar.
const plugin = {};
plugin.cmd = ["pareja"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  const who = lidMencionado(m, text);
  if (!who || !getUser(who)) return client.sendText(m.chat, txt.parejaDefaultWho(usedPrefix, command), m);
  if (who === m.sender) return client.sendText(m.chat, txt.parejaWhoSender, m);
  if (who === client.user.lid) return client.sendText(m.chat, txt.parejaWhoBot, m);

  const numero = who.split("@")[0];
  const r = pedirPareja(m.sender, who, m.chat);
  if (!r.ok) {
    if (r.motivo === "parientes") return client.sendText(m.chat, `🤢 ¡Es ${r.parentesco}! Pareja con un familiar no, respete.`, m);
    if (r.motivo === "teLoPidio") return client.sendText(m.chat, `La persona ya te pidió ser tu pareja! Responde su petición con:\n\n${usedPrefix}aceptar @${numero}\n${usedPrefix}rechazar @${numero}`, m, { mentions: [who] });
    if (r.motivo === "tienePareja") return client.sendText(m.chat, `@${numero} ya tiene pareja, respete 🤨`, m, { mentions: [who] });
    if (r.motivo === "vosTenesPareja") {
      const kz = await client.sendText(m.chat, txt.parejaInfiel(r.pareja, who), m);
      return client.sendMessage(m.chat, { react: { text: "😡", key: kz.key } });
    }
    if (r.motivo === "yaJuntos") {
      const kz = await client.sendText(m.chat, txt.parejaAlready(who), m);
      return client.sendMessage(m.chat, { react: { text: "🥰", key: kz.key } });
    }
    return;
  }
  const kz = await client.sendText(m.chat, txt.parejaPeticion(elegirAlAzar(DECLARACIONES), m.sender, who), m);
  client.sendMessage(m.chat, { react: { text: "😳", key: kz.key } });
};

export default plugin;

const DECLARACIONES = ["Hay momentos en los que no me gusta estar solo. Pero tampoco quiero que todos me acompañen, solo te quiero a ti.", "Agradezco a mis ojos, porque estos ojos me llevaron a encontrarte", "¿Puedo enviarte un CV o no? Porque quiero postularme para ser tu novia/o.", "No soy el más grande, pero estoy seguro que si puedo hacerte feliz con amor y cariño.", "Solo soy una persona común que tiene muchos defectos y puede que no merezca tu amor, pero si estás dispuesto a aceptarme como tu novia/o, prometo hacer lo que sea mejor para ti. ¿Aceptarás mi amor?", "Quiero decir algo. Me gustas desde hace mucho tiempo, pero no me atrevo a decirlo. Entonces, decidí solo WA. Quiero que seas mi novia/o.", "Quiero decir algo que no puedo contener más. Te amo, ¿serás mi novia/o?", "Quiero ser una persona que pueda hacerte reír y sonreír todos los días. ¿Serás mi novia/o?", "Quiero tener una charla seria contigo. Todo este tiempo he albergado sentimientos por ti y siempre he estado pendiente de ti. Si no te importa, ¿quieres ser mi novia/o?", "Te miro y veo el resto de mi vida ante mis ojos.", "No tengo todo, pero al menos tengo suficiente amor para ti", "Me gustaste desde el principio. Eres tan simple, pero la sencillez es muy especial a mis ojos. Será perfecto si eres especial en mi corazón.", "Realmente estoy enamorado de ti. ¿Serás mía/o?", "No te dije que no porque no tengo cupo ni crédito, pero estoy disfrutando de este anhelo por ti. Tal vez te sorprendas al escuchar eso. Siempre me has gustado.", "No quiero que seas el sol de mi vida, porque aunque hace calor estás muy lejos. Tampoco quiero que seas aire, porque aunque te necesito y estás muy cerca, pero todos pueden respirarte también. Solo quiero que seas sangre que pueda estar muy cerca de mí.", "No sé hasta cuándo terminará mi edad. Todo lo que sé es que mi amor es para siempre solo para ti.", "Realmente disfruté el tiempo que pasamos juntos hoy. También nos conocemos desde hace mucho tiempo. En este día soleado, quiero expresarte que te amo.", "Siempre imaginé lo hermoso que sería si algún día pudiéramos construir un arca de una casa y vivir juntos hasta el final de la vida. Sin embargo, todo eso no habría sucedido si los dos no hubiéramos estado juntos hasta ahora. ¿Serás mi novia/o?", "Me preparo mentalmente para hoy. Tienes que ser mi novia/o para tratar este amor incontrolable", "Sé que no tenemos la misma edad, pero ¿puedo vivir contigo por el resto de mi vida?", "Sé que hemos sido amigos durante mucho tiempo. ¿Pero no está mal si me gustas? Cualquiera que sea tu respuesta, acepto. Lo más importante es ser honesto desde el fondo de mi corazón.", "No puedo empezar esto primero, pero te daré un código que me gustas. Si entiendes este código, estaremos juntos.", "Soy demasiado estúpido o eres demasiado egoísta para hacer que me enamore de ti.", "Cualquier cosa sobre ti, nunca he encontrado aburrimiento en ello. Porque estar a tu lado, el regalo más hermoso para mí. Sé mi novia/o, hey tú.", "Con el permiso de Alá y la bendición de mamá papá, ¿quieres ser mi novia/o?", "¿Y si nos convertimos en una banda de ladrones? Yo robé tu corazón y tú me robaste el mío.", "Feliz es que tú y yo nos hemos convertido en nosotros.", "Mañana, si no funciona, puedo registrarme para ser tu novia/o. Déjame tener trabajo para pensar siempre en ti.", "Déjame hacerte feliz para siempre. Solo tienes que hacer una cosa: Enamórate de mí.", "Que toda mi alegría sea tuya, toda tu tristeza sea mía. ¡Que el mundo entero sea tuyo, solo tú seas mía/o!", "Que el pasado sea mi pasado, pero por el presente, ¿serás tú mi futuro?", "¿Puedes darme una dirección a tu corazón? Parece que me he perdido en tus ojos.", "No es el trono o el tesoro lo que busco, sino el retorno de mi amor lo que espero de ti. La respuesta es sí.", "La forma en que puedes hacerme reír incluso en los días más oscuros me hace sentir más ligero que cualquier otra cosa. Quiero que seas mía/o", "Mi amor por ti es incuestionable porque este amor es sincero desde el fondo de mi corazón.", "Qué chico/a se atreve a lastimarte. Aquí te trataré, mientras quieras ser mi novia/o.", "Oye, ¿qué estás haciendo? Sal de la casa y mira la luna esta noche. La luz es hermosa y encantadora, pero sería aún más hermosa si yo estuviera a tu lado. ¿Qué tal si estamos juntos?"];
