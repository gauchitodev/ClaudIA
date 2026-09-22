// What happens when someone joins a group: whoever is on the blacklist is removed on the spot, and everyone else gets
// the group rules, if an admin set them with .reglas set.
//
// It used to live inline in main.js, where no test could reach it. That is how a TypeError in the blacklist step went
// unnoticed: it fired on every join in a group where the bot is admin, and since the rules went out after it, it took
// the welcome down too. Now the blacklist runs in its own try, and nothing that fails there can stop the welcome.
import { expulsarDeListaNegra } from "./lista-negra.js";
import { avisoReglasParaNuevos } from "./reglas.js";

// "participantes" come straight from Baileys' group-participants.update: objects with an id (see lib/lista-negra.js).
// "metadata" is the group's, already refreshed. Returns who was caught by the blacklist and who got the welcome.
export async function recibirNuevos(client, chat, participantes, metadata) {
  const nuevos = participantes || [];
  let anotados = [];
  try {
    const miembros = metadata?.participants || [];
    const soyAdmin = miembros.find((p) => p.id === client.user?.lid || p.id === client.user?.jid)?.admin;
    if (soyAdmin) {
      const { expulsados, fallados } = await expulsarDeListaNegra(client, chat, nuevos, miembros);
      anotados = [...expulsados, ...fallados].map((e) => e.original);
    }
  } catch (e) {
    console.error("[lista negra] no se pudo revisar a los que entraron a", chat, e);
  }

  // The blacklisted don't get the welcome, not even when removing them failed.
  const bienvenidos = nuevos.filter((p) => !anotados.includes(p));
  const aviso = avisoReglasParaNuevos(chat, bienvenidos);
  if (aviso) await client.sendMessage(chat, { text: aviso.texto, mentions: aviso.mentions }).catch((e) => console.error("[reglas] no se pudieron mandar:", e.message));
  return { anotados, bienvenidos };
}
