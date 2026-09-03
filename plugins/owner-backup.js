import fs from "fs";
import { hacerBackup, enviarBackupAlOwner, tamano } from "../lib/backup.js";

let plugin = {};
plugin.cmd = ["backup"];
plugin.onlyOwner = true;

plugin.run = async (m, { client }) => {
  try {
    const archivo = await hacerBackup();
    const bytes = fs.statSync(archivo).size;
    const enviado = await enviarBackupAlOwner(archivo);
    await client.sendText(m.chat, `🗄️ Backup hecho: ${archivo} (${tamano(bytes)}).${enviado ? " Te lo mandé por privado." : ""}`, m);
  } catch (e) {
    await client.sendText(m.chat, `❌ Falló el backup: ${e.message}`, m);
  }
};

export default plugin;
