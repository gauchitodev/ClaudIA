import { servicioDe, elegirServicio, ponerPrecio, regatear, aceptar, resenar, SERVICIO } from "../lib/servicios.js";
import { leerEntero } from "../lib/comandos.js";

// Services between players (lib/servicios.js), in the groups that are a town. .servicio: the deal you have open, or
// .servicio 2 to pick · .cobro 80 / .cobro no: whoever was picked names a price · .trato · .regateo 60 ·
// .reseña 4: the stars for the last job done for you. All of it in the group.
const plugin = {};
plugin.cmd = ["servicio", "servicios", "cobro", "trato", "regateo", "resena"];
plugin.economia = true;
plugin.onlyGroup = true;

const responder = (client, m, r) => client.sendText(m.chat, r.ok ? r.texto : `❌ ${r.error}`, m, r.mentions?.length ? { mentions: r.mentions } : {});

plugin.run = async (m, { client, command, args = [] }) => {
  try {
    const cmd = command.toLowerCase();
    if (cmd === "cobro") {
      const no = ["no", "nop", "paso"].includes(String(args[0] || "").toLowerCase());
      return responder(client, m, ponerPrecio(m.chat, m.sender, no ? "no" : leerEntero(args[0])));
    }
    if (cmd === "trato") return responder(client, m, aceptar(m.chat, m.sender));
    if (cmd === "regateo") return responder(client, m, regatear(m.chat, m.sender, leerEntero(args[0])));
    if (cmd === "resena") return responder(client, m, resenar(m.chat, m.sender, leerEntero(args[0])));
    const numero = leerEntero(args[0]);
    if (numero !== null) return responder(client, m, elegirServicio(m.chat, m.sender, numero));
    const s = servicioDe(m.chat, m.sender);
    const texto = s
      ? `🔧 Tenés abierto: ${s.opciones.length} opciones para elegir con .servicio <número>${s.proveedor ? `; lo tiene @${s.proveedor.split("@")[0]}${s.precio ? `, que pide ${s.precio} (.trato o .regateo)` : ", que todavía no dijo cuánto"}` : ""}.`
      : `🔧 Los servicios entre vecinos: cuando se te rompe algo de la empresa o volvés lastimado de un encargo, te ofrezco a la gente del grupo que tiene el oficio (con su nivel, su apodo y sus reseñas) y al del pueblo, que es caro pero no falla. Elegís con .servicio <número>; el elegido dice cuánto con .cobro 80 (o .cobro no), y vos .trato o .regateo 60. Si sale bien queda arreglado, y si no, a veces queda peor. Después, .reseña 1 a 5. Si en ${SERVICIO.PLAZO_MIN} minutos no se arregla nada, va al del pueblo. Solo en los grupos con .pueblo on.`;
    return client.sendText(m.chat, texto, m, s?.proveedor ? { mentions: [s.proveedor] } : {});
  } catch (e) {
    console.error("[servicios] ERROR:", e);
  }
};

export default plugin;
