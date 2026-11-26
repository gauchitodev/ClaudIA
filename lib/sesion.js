// WhatsApp's session, in a database of its own: botSession/sesion.db. The credentials, and the keys of each
// conversation, which change with every message that comes in or goes out. It was Baileys's useMultiFileAuthState,
// which its README gives as a guide to write this one and advises against anywhere serious: a file per key, thousands
// of them, each written whenever it got its turn. A write cut short left half a file, which read as no key at all, and
// when that file was creds.json, as no session: the number had to be paired again. Here what Baileys saves together is
// saved together or not at all, and it's on the disk by the time Baileys is told it was saved.
//
// Not in database/database.db: the backups copy that file whole (lib/backup.js), seven of them are kept and one a week
// goes to the owner over WhatsApp, and a copy of the session is the account. Nor would one be any good to go back to:
// the keys in it are the ones from that day. In its own file, inside the folder the README already says to keep to
// oneself: what's there is the session, and deleting the folder is still what closing it takes.
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";

export const SESION = {
  CARPETA: "botSession",
  ARCHIVO: "sesion.db",
  // Where the files of before go once they're in the database, and how long they stay: see traerArchivos.
  VIEJOS: "archivos-viejos",
  DIAS_DE_LOS_VIEJOS: 7,
};
const DIA = 24 * 60 * 60 * 1000;
const CREDENCIALES = "creds";

// The connection to each folder's database, one per process: main.js asks for the session again on every reconnect.
const abiertas = new Map();

// The name useMultiFileAuthState gave each key's file, without its ".json". The files come in under the names they had,
// so nothing has to tell the type from the id in them (both have dashes of their own), and a key is looked up the way
// it always was: two ids that shared a file share a row.
const clave = (tipo, id) => `${tipo}-${id}`.replace(/\//g, "__").replace(/:/g, "-");

// An app state sync key as Baileys uses it, with its bytes as bytes. Baileys hands over the proto, which JSON writes
// with its bytes as base64 text (its toJSON), and useMultiFileAuthState brings them back with fromObject: neither is
// in Baileys 7's protos (test/protos-v7.test.mjs), which are written with their bytes as any other. Both read here.
function claveDeSincronizacion(valor) {
  if (typeof valor.keyData === "string") valor.keyData = Buffer.from(valor.keyData, "base64");
  return proto.Message.AppStateSyncKeyData.create(valor);
}

// Credentials as a file or a row keeps them, back as Baileys has them; null if there are none.
const credencialesDe = (texto) => (texto == null ? null : JSON.parse(texto, BufferJSON.reviver));
// Whether a session got paired: Baileys gives it its account once the pairing goes through (configureSuccessfulPairing),
// and not before. Not "registered", which stays false after a QR, nor "me", which asking for a pairing code already sets.
const vinculada = (creds) => Boolean(creds?.account);
// Whether two sets of credentials are one session: each new one makes its own identity key (initAuthCreds), and a copy
// keeps it.
function mismaSesion(a, b) {
  const [una, otra] = [a?.signedIdentityKey?.public, b?.signedIdentityKey?.public];
  return Buffer.isBuffer(una) && Buffer.isBuffer(otra) && una.equals(otra);
}

// The session useMultiFileAuthState kept in the folder, into the database: each file is a row, as it was. The files are
// there on the first start with this, and again if a version from before ran in between: it writes its session to
// them. While the database has no paired session, the files are the session, whatever they hold. Once it has one, only
// a pairing of the files' own takes its place: an account, and another identity key (that version was paired again).
// Not a session that never got paired, nor one whose creds.json doesn't read, nor a copy of this same one: a copy has
// the keys from before they came in, which the talks left behind as the database went on, and with them the bot no
// longer reads what it gets (test/sesion.test.mjs). Those files go and nothing else is touched, creds.json last, so a
// start cut short in between finds it and does the same again.
//
// The ones that come in go to archivos-viejos/, where they stay a week (borrarViejos), no way back to a version from
// before for that same reason. creds.json goes first, and only once the database has it all: a start cut short before
// that brings the same files in again, and one cut short after it finds files with no creds.json, which are only on
// their way out. A file that doesn't parse was no key for useMultiFileAuthState either, and a creds.json that doesn't,
// no session: nothing comes in then, and the database keeps what it had.
function traerArchivos({ base, guardar, leer }, ruta) {
  const sueltos = fs.readdirSync(ruta).filter((archivo) => archivo.endsWith(".json"));
  if (!sueltos.length) return null;
  const hecho = { claves: 0, rotos: 0, habia: 0, ilegible: false, otra: false, movidos: sueltos.length };
  const viejos = path.join(ruta, SESION.VIEJOS);
  const textoDe = (archivo) => {
    const texto = fs.readFileSync(path.join(ruta, archivo), "utf8");
    try {
      JSON.parse(texto);
      return texto;
    } catch {
      return null;
    }
  };
  if (sueltos.includes("creds.json")) {
    const texto = textoDe("creds.json");
    hecho.ilegible = texto === null;
    const deLaBase = credencialesDe(leer.get(CREDENCIALES)?.valor);
    if (vinculada(deLaBase)) {
      const deLosArchivos = credencialesDe(texto);
      const de = hecho.ilegible ? "ilegible" : !vinculada(deLosArchivos) ? "sin-vincular" : mismaSesion(deLosArchivos, deLaBase) ? "copia" : null;
      if (de) {
        for (const archivo of sueltos) if (archivo !== "creds.json") fs.rmSync(path.join(ruta, archivo), { force: true });
        fs.rmSync(path.join(ruta, "creds.json"), { force: true });
        return { descartados: sueltos.length, de };
      }
      hecho.otra = true;
    }
    if (!hecho.ilegible) {
      base.transaction(() => {
        hecho.habia = base.prepare(`DELETE FROM sesion`).run().changes;
        for (const archivo of sueltos) {
          const texto = textoDe(archivo);
          if (texto === null) hecho.rotos++;
          else hecho.claves += guardar.run(archivo.slice(0, -".json".length), texto).changes;
        }
      })();
      // All of it went through the log at once, which stays as big as it got (the bot is never closed tidily, which
      // is what would empty it): as much again as the session, on a tablet's disk.
      base.pragma("wal_checkpoint(TRUNCATE)");
    }
    // The ones from an earlier time are older than these.
    fs.rmSync(viejos, { recursive: true, force: true });
  }
  fs.mkdirSync(viejos, { recursive: true });
  const mover = (archivo) => fs.renameSync(path.join(ruta, archivo), path.join(viejos, archivo));
  if (sueltos.includes("creds.json")) mover("creds.json");
  for (const archivo of sueltos) if (archivo !== "creds.json") mover(archivo);
  return hecho;
}

// The files of before go a week after they were put away (the folder's own date says when): a copy of what came in,
// which by then the database has long left behind, and they still hold the account.
function borrarViejos(ruta, ahora) {
  const viejos = path.join(ruta, SESION.VIEJOS);
  const desde = fs.statSync(viejos, { throwIfNoEntry: false })?.mtimeMs;
  if (desde === undefined || ahora - desde < SESION.DIAS_DE_LOS_VIEJOS * DIA) return false;
  fs.rmSync(viejos, { recursive: true, force: true });
  return true;
}

// What opening the folder did to the files of before, said the way the database's migrations are.
function contar(carpeta, hecho, borrados) {
  const viejos = `${carpeta}/${SESION.VIEJOS}/`;
  if (borrados) console.log(`🧹 Borré ${viejos}: pasó una semana desde que la sesión de antes pasó a la base.`);
  if (!hecho) return;
  if (hecho.descartados) {
    const de = { "sin-vincular": "una sesión sin vincular", copia: "una copia vieja de esta misma sesión", ilegible: "una sesión con un creds.json que no se pudo leer" }[hecho.de];
    console.log(`🟠 En ${carpeta}/ había ${hecho.descartados} archivo(s) sueltos de ${de}: no reemplazaron a la sesión de la base, y los borré.`);
  } else if (hecho.ilegible) {
    console.log(`🟠 ${carpeta}/creds.json no se pudo leer, así que esos archivos no eran una sesión que sirva: no pasaron a la base y quedaron en ${viejos}`);
  } else if (!hecho.claves) {
    console.log(`🟢 ${hecho.movidos} archivo(s) sueltos de la sesión de antes pasaron a ${viejos}`);
  } else {
    const rotos = hecho.rotos ? ` ${hecho.rotos} archivo(s) no se pudieron leer y no pasaron.` : "";
    const porQue = hecho.otra ? ": los archivos traían otra vinculación" : ", que no estaba vinculada";
    const habia = hecho.habia ? ` Reemplazó a la que había en la base (${hecho.habia} claves)${porQue}.` : "";
    console.log(`🟢 Migración: la sesión de WhatsApp pasó de los archivos de ${carpeta}/ a ${carpeta}/${SESION.ARCHIVO} (${hecho.claves} claves).${rotos}${habia} Los archivos quedan ${SESION.DIAS_DE_LOS_VIEJOS} días en ${viejos}, pero no sirven para volver a una versión anterior.`);
  }
}

function conectar(carpeta, ahora) {
  const ruta = path.resolve(carpeta);
  if (abiertas.has(ruta)) return abiertas.get(ruta);
  fs.mkdirSync(ruta, { recursive: true });
  const base = new Database(path.join(ruta, SESION.ARCHIVO));
  try {
    // With the log (WAL), a save is one sync to the disk instead of the four it takes the way the main database is
    // kept, and there's a save for every message; where the log can't be used, SQLite stays that way. FULL has to be
    // said on every start: with the log, this SQLite's default is NORMAL, which syncs only now and then, and a tablet
    // that went off would come back with the keys of some messages ago.
    base.pragma("journal_mode = WAL");
    base.pragma("synchronous = FULL");
    base.exec(`CREATE TABLE IF NOT EXISTS sesion (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`);
    const abierta = {
      base,
      borrada: false,
      leer: base.prepare(`SELECT valor FROM sesion WHERE clave = ?`),
      guardar: base.prepare(`INSERT INTO sesion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`),
      borrar: base.prepare(`DELETE FROM sesion WHERE clave = ?`),
    };
    const hecho = traerArchivos(abierta, ruta);
    contar(carpeta, hecho, borrarViejos(ruta, ahora));
    abiertas.set(ruta, abierta);
    return abierta;
  } catch (e) {
    base.close();
    throw e;
  }
}

// What Baileys asks of a session, as useMultiFileAuthState gives it: { state: { creds, keys }, saveCreds }. The
// credentials are read each time (main.js asks again on every reconnect), and new ones are made when there are none,
// which is what makes the bot ask to be paired. keys takes any type of key, the ones Baileys 7 added among them
// (lid-mapping, device-list, tctoken, identity-key). Once the session is deleted (borrarSesion), what the socket being
// closed still asks finds nothing and what it still saves goes nowhere, so nothing of it is left behind. That's for a
// session that's gone: with the database only closed (cerrarSesion), a save fails out loud, and Baileys is told.
export function abrirSesion(carpeta = SESION.CARPETA, ahora = Date.now()) {
  const abierta = conectar(carpeta, ahora);
  const { base, leer, guardar, borrar } = abierta;
  const valorDe = (nombre) => {
    const fila = leer.get(nombre);
    return fila ? JSON.parse(fila.valor, BufferJSON.reviver) : null;
  };
  // All of a set or none of it: Baileys saves together what has to match (a message's session and the pre-key it used
  // up, a group's key and who has it).
  const guardarClaves = base.transaction((datos) => {
    for (const tipo in datos) {
      for (const id in datos[tipo]) {
        const valor = datos[tipo][id];
        if (valor) guardar.run(clave(tipo, id), JSON.stringify(valor, BufferJSON.replacer));
        else borrar.run(clave(tipo, id));
      }
    }
  });
  const creds = valorDe(CREDENCIALES) || initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async (tipo, ids) => {
          const datos = {};
          if (abierta.borrada) return datos;
          for (const id of ids) {
            const valor = valorDe(clave(tipo, id));
            datos[id] = valor && tipo === "app-state-sync-key" ? claveDeSincronizacion(valor) : valor;
          }
          return datos;
        },
        set: async (datos) => {
          if (!abierta.borrada) guardarClaves(datos);
        },
      },
    },
    saveCreds: async () => {
      if (!abierta.borrada) guardar.run(CREDENCIALES, JSON.stringify(creds, BufferJSON.replacer));
    },
  };
}

// Closes the folder's database: the next abrirSesion opens it again, as a new process would.
export function cerrarSesion(carpeta = SESION.CARPETA) {
  const ruta = path.resolve(carpeta);
  abiertas.get(ruta)?.base.close();
  abiertas.delete(ruta);
}

// WhatsApp closed the session: the folder goes, with the database and whatever files of before were still in it, and
// the next start pairs again.
export function borrarSesion(carpeta = SESION.CARPETA) {
  const ruta = path.resolve(carpeta);
  const abierta = abiertas.get(ruta);
  if (abierta) abierta.borrada = true;
  cerrarSesion(carpeta);
  fs.rmSync(ruta, { recursive: true, force: true });
}
