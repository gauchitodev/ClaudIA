import { elegirAlAzar } from "../lib/azar.js";
import { lidMencionado } from "../lib/menciones.js";
import { parejaDe, enojarPareja, besoEntrePareja } from "../lib/parejas.js";
import { parentescoDe } from "../lib/familia.js";

// .besar @x: beso virtual, salvo que alguno de los dos tenga pareja con otra persona. Un pedido de pareja pendiente no
// cuenta como pareja. Entre novios o casados el beso llega siempre, salvo que la pareja esté enojada: por un intento de
// infidelidad (una hora, o hasta un regalo) o por días sin un beso ni un regalo, donde el primero puede ser rechazado.
const plugin = {};
plugin.cmd = ["kiss", "beso", "besar"];
plugin.onlyGroup = true;
plugin.botAdmin = true;

plugin.run = async (m, { client, text, usedPrefix, command }) => {
  const who = lidMencionado(m, text);
  if (!who) return client.sendText(m.chat, txt.defaultWho(usedPrefix, command), m);
  if (who === client.user.lid) return client.sendText(m.chat, txt.besarBot, m);
  const parentesco = parentescoDe(m.sender, who);
  if (parentesco) return client.sendText(m.chat, `🚫 ¡Es ${parentesco}! En la familia los besos van en la mejilla, y esos no cuentan.`, m);

  const mia = parejaDe(m.sender);
  if (mia && mia.pareja !== who) {
    enojarPareja(m.sender, who);
    return client.sendText(m.chat, `${txt.besarInfiel(mia.pareja)}\n\n💢 @${mia.pareja.split("@")[0]} se enteró y quedó enojada: por una hora no te acepta besos. Se le pasa con un regalo (.regalar).`, m, { mentions: [mia.pareja] });
  }
  const suya = parejaDe(who);
  if (suya && suya.pareja !== m.sender) return client.sendText(m.chat, txt.besarTienePareja(who), m);

  const enPareja = mia && mia.pareja === who;
  if (enPareja) {
    const beso = besoEntrePareja(m.sender, who);
    if (beso.tipo === "enojo") {
      const kz = await client.sendText(m.chat, `💢 @${who.split("@")[0]} te corrió la cara: todavía está enojada por lo de @${beso.por.split("@")[0]}. Le quedan ${beso.minutos} min, o regalale algo.`, m, { mentions: [who, beso.por] });
      return client.sendMessage(m.chat, { react: { text: "💢", key: kz.key } });
    }
    if (beso.tipo === "abandono") {
      const kz = await client.sendText(m.chat, `🙄 @${who.split("@")[0]} te corrió la cara: "¿Ahora te acordás? Hace ${beso.dias} días que ni un beso". Probá de nuevo.`, m, { mentions: [who] });
      return client.sendMessage(m.chat, { react: { text: "🙄", key: kz.key } });
    }
  }
  const casados = enPareja && mia.casadosDesde > 0;
  const teks = enPareja ? elegirAlAzar(casados ? ["💍 Beso de casados, como el primer día.", "💍 Un beso para tu marido/mujer. Qué lindo verlos así.", "💍 Beso con anillo puesto. Se nota el amor."] : ["💞 Beso de novios, de esos que no se rechazan.", "💞 Un beso para tu pareja. Ay, el amor.", "💞 Beso entre novios: aceptado sin mirar."]) : elegirAlAzar(["¡Muah! 💋 Beso virtual enviado con cariño.", "¡Besoo enviado! 💋", "¡Hermoso beso virtual para ti! 💋"]);
  const recibido = `${teks}\n\n*💌Lo recibe:* @${who.split("@")[0]}\n\n*😚De parte de:* @${m.sender.split("@")[0]}`;
  const rechazado = `@${who.split("@")[0]} rechazó el beso y le corrió la cara a @${m.sender.split("@")[0]} 🤣`;
  const mensaje = enPareja ? recibido : elegirAlAzar([recibido, rechazado]);
  const kz = await client.sendText(m.chat, mensaje, m);
  client.sendMessage(m.chat, { react: { text: mensaje !== recibido ? "🤣" : casados ? "💍" : enPareja ? "💞" : "💋", key: kz.key } });
};

export default plugin;
