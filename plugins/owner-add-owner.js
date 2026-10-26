import fs from "fs";
import toml from "@iarna/toml";
import { destinatario, confirmarOwners } from "../lib/identidad.js";

// config.toml with only its owners line changed: rewriting the whole file with toml.stringify wiped every comment that
// explains the settings. The result is parsed back before anything is written: null if the owners didn't come out
// right (an unusual layout), and then nothing is touched.
export function conOwners(texto, owners) {
  const linea = `owners = [${owners.map((o) => JSON.stringify(o)).join(", ")}]`;
  const conLinea = /^[ \t]*owners[ \t]*=[ \t]*\[[^\]]*\]/m.test(texto) ? texto.replace(/^[ \t]*owners[ \t]*=[ \t]*\[[^\]]*\]/m, linea) : `${linea}\n${texto}`;
  try {
    return JSON.stringify(toml.parse(conLinea).owners) === JSON.stringify(owners) ? conLinea : null;
  } catch {
    return null;
  }
}

// Written to a side file and then renamed over it: a crash halfway leaves the old config, never a cut one.
function guardarConfig(texto) {
  fs.writeFileSync("config.toml.tmp", texto);
  fs.renameSync("config.toml.tmp", "config.toml");
}

const plugin = {};
plugin.cmd = ["addowner", "removeowner", "aowner", "rowner"];
plugin.onlyOwner = true;

plugin.run = async (m, { client, text, usedPrefix, command, participants }) => {
  // config.toml stores the bare phone number, so of the two identities it's the number we need.
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

  // the real owners, without empty "" entries
  const currentOwners = (config.owners || []).filter((o) => o && o.trim() !== "");
  // By their digits: config.toml may have an owner with "+" and spaces, as esOwner reads them, and written that way
  // they were added again as someone new, and couldn't be removed.
  const digitos = (o) => String(o).replace(/[^0-9]/g, "");
  const yaEsOwner = currentOwners.some((o) => digitos(o) === who);

  if (command === "addowner" || command === "aowner") {
    if (yaEsOwner) {
      return client.sendText(m.chat, `El número *${who}* ya es owner.`, m);
    }

    // add the new owner
    const owners = [...currentOwners, who];
    const nuevo = conOwners(configContent, owners);
    if (!nuevo) return client.sendText(m.chat, "❌ No pude cambiar la línea de owners en config.toml: agregalo a mano.", m);
    guardarConfig(nuevo);
    globalThis.owners = owners; // update it in memory
    await confirmarOwners(client); // their LID, as WhatsApp says, for when a message brings only that

    return client.sendText(m.chat, `✅ El numero *${who}* fué añadido como owner.`, m);
  }

  if (command === "removeowner" || command === "rowner") {
    if (!yaEsOwner) {
      return client.sendText(m.chat, `❌ El número *${who}* no es owner.`, m);
    }

    // don't allow removing the last real owner
    if (currentOwners.length === 1) {
      return client.sendText(m.chat, "❌ No se puede eliminar el último owner.", m);
    }

    // remove the given owner
    const owners = currentOwners.filter((o) => digitos(o) !== who);
    const nuevo = conOwners(configContent, owners);
    if (!nuevo) return client.sendText(m.chat, "❌ No pude cambiar la línea de owners en config.toml: sacalo a mano.", m);
    guardarConfig(nuevo);
    globalThis.owners = owners; // update it in memory

    return client.sendText(m.chat, `✅ *${who}* fué removido de owners.`, m);
  }
};

export default plugin;
