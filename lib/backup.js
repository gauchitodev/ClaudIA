// Backup automático de la base: una copia diaria después de las 4:00 (se conservan las últimas 7) y, una vez por
// semana, la copia del día se manda al privado del owner. Usa la copia en caliente de better-sqlite3, que es
// consistente aunque el bot esté escribiendo. La carpeta está dentro de database/, que ya ignora git.
import fs from "fs";
import path from "path";
import { semanaDe } from "./hashtags.js";
import { periodoCerrado, marcarPeriodoCerrado } from "../database-functions.js";
import { avisarOwner, jidOwner } from "./avisos.js";

export const BACKUP = { CARPETA: "./database/backups", HORA: 4, CONSERVAR: 7 };

const pad = (n) => String(n).padStart(2, "0");
const claveDia = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const archivoDe = (clave) => path.join(BACKUP.CARPETA, `database-${clave}.db`);
const esBackup = (f) => /^database-\d{4}-\d{2}-\d{2}\.db$/.test(f);

export const tamano = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

export async function hacerBackup() {
  fs.mkdirSync(BACKUP.CARPETA, { recursive: true });
  const destino = archivoDe(claveDia());
  const temporal = `${destino}.tmp`;
  await db.backup(temporal);
  fs.renameSync(temporal, destino); // así nunca queda una copia a medias con el nombre final
  rotar();
  return destino;
}

function rotar() {
  const archivos = fs.readdirSync(BACKUP.CARPETA).filter(esBackup).sort();
  while (archivos.length > BACKUP.CONSERVAR) fs.unlinkSync(path.join(BACKUP.CARPETA, archivos.shift()));
}

export function ultimoBackup() {
  if (!fs.existsSync(BACKUP.CARPETA)) return null;
  const archivos = fs.readdirSync(BACKUP.CARPETA).filter(esBackup).sort();
  if (archivos.length === 0) return null;
  const archivo = path.join(BACKUP.CARPETA, archivos[archivos.length - 1]);
  const st = fs.statSync(archivo);
  return { archivo, fecha: st.mtimeMs, bytes: st.size };
}

export async function enviarBackupAlOwner(archivo) {
  const jid = jidOwner();
  if (!jid || !globalThis.client?.user || !globalThis.botConectado) return false;
  const bytes = fs.statSync(archivo).size;
  await globalThis.client.sendFile(jid, archivo, path.basename(archivo), `🗄️ Backup de la base de Claudia (${tamano(bytes)}). Guardalo en algún lado por las dudas.`, null, false, { asDocument: true });
  return true;
}

// Corre cada 5 minutos desde tareas-programadas.js
export async function chequearBackupProgramado() {
  if (new Date().getHours() < BACKUP.HORA) return;
  let destino = archivoDe(claveDia());
  if (!fs.existsSync(destino)) {
    try {
      destino = await hacerBackup();
      console.log(`[backup] copia diaria hecha: ${destino}`);
    } catch (e) {
      console.error("[backup] falló la copia diaria:", e);
      await avisarOwner(`❌ Falló el backup diario de la base: ${e.message}`, "backup-fallo", 6 * 60 * 60 * 1000);
      return;
    }
  }
  const semana = semanaDe(Date.now());
  if (!periodoCerrado("backup", "semanal", semana)) {
    try {
      if (await enviarBackupAlOwner(destino)) marcarPeriodoCerrado("backup", "semanal", semana);
    } catch (e) {
      console.error("[backup] no se pudo mandar la copia al owner:", e.message);
    }
  }
}
