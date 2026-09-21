import fs from "fs";
import toml from "@iarna/toml";
import { destinatario } from "../lib/identidad.js";

const plugin = {};
plugin.cmd = ["addowner", "removeowner", "aowner", "rowner"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // config.toml guarda el teléfono pelado, así que de las dos identidades hace falta el número.
  const { jid } = destinatario(m, text, participants);
  const who = jid ? jid.split("@")[0] : "";
  if (!who) return client.sendText(m.chat, `No se encontró el numero telefonico del usuario mencionado. Pruebe: ${usedPrefix}${command} +598 99 999 999`, m);

  let configContent;
  try {
    configContent = fs.readFileSync("config.toml", "utf8");
  } catch (err) {
    return client.sendText(m.chat, "❌ Error al leer config.toml", m);
  }

  let config;
  try {
    config = toml.parse(configContent);
  } catch (err) {
    return client.sendText(m.chat, "❌ Error al parsear config.toml", m);
  }

  // owners reales, sin entradas vacías ""
  const currentOwners = (config.owners || []).filter((o) => o && o.trim() !== "");

  if (command === "addowner" || command === "aowner") {
    if (currentOwners.includes(who)) {
      return client.sendText(m.chat, `El número *${who}* ya es owner.`, m);
    }

    // añadir el nuevo owner
    config.owners = [...currentOwners, who];

    fs.writeFileSync("config.toml", toml.stringify(config));
    globalThis.owners = config.owners; // actualiza en memoria

    return client.sendText(m.chat, `✅ El numero *${who}* fué añadido como owner.`, m);
  }

  if (command === "removeowner" || command === "rowner") {
    if (!currentOwners.includes(who)) {
      return client.sendText(m.chat, `❌ El número *${who}* no es owner.`, m);
    }

    // no  permitir quitar el último owner real que haya
    if (currentOwners.length === 1) {
      return client.sendText(m.chat, "❌ No se puede eliminar el último owner.", m);
    }

    // quitar el owner especificado
    config.owners = currentOwners.filter((o) => o !== who);

    fs.writeFileSync("config.toml", toml.stringify(config));
    globalThis.owners = config.owners; // actualizar en memoria

    return client.sendText(m.chat, `✅ *${who}* fué removido de owners.`, m);
  }
};

export default plugin;
