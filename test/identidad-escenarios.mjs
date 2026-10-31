// Identity scenarios for the tests: a number that changed hands, a row from before LIDs, a device's row, an owner,
// the bot listed each way, and what WhatsApp answers about a number. Each builder takes a number of its own (n): a test
// file shares one database, and two scenarios with the same ids would see each other's rows. They write to the
// database prepararBase (helpers.mjs) publishes.
import { G } from "./helpers.mjs";

export const unaLid = (n, k = 1) => `3${String(n).padStart(6, "0")}${String(k).padStart(8, "0")}@lid`;
export const unNumero = (n) => `59899${String(n).padStart(6, "0")}@s.whatsapp.net`;
export const digitos = (id) => id.split("@")[0];

const fila = (lid, jid, pushName, timestamp) => db.prepare(`INSERT INTO users (lid, jid, pushName, timestamp) VALUES (?, ?, ?, ?)`).run(lid, jid, pushName, timestamp);

// X was VIEJO's, whose row still has it (he wrote with it long ago), and is NUEVO's now, who only ever wrote under the
// LID. The four ways a group may list NUEVO: by LID with the number, by number with the LID, by number alone, and by
// LID alone.
export function numeroReciclado(n) {
  const [X, VIEJO, NUEVO] = [unNumero(n), unaLid(n, 1), unaLid(n, 2)];
  fila(VIEJO, X, "Viejo", 1);
  fila(NUEVO, "", "Nuevo", 2);
  return {
    X,
    VIEJO,
    NUEVO,
    porLid: [{ id: NUEVO, phoneNumber: X, admin: null }],
    porNumero: [{ id: X, lid: NUEVO, admin: null }],
    porNumeroSinLid: [{ id: X, admin: null }],
    sinParear: [{ id: NUEVO, admin: null }],
  };
}

// Someone the bot knows by their number alone (X), as a group that lists people by number and whose messages bring no
// LID leaves them: their row is keyed by the number, and the LID WhatsApp gives for it (L) has none. The group lists
// them that way.
export function soloPorNumero(n) {
  const [X, L] = [unNumero(n), unaLid(n)];
  fila(X, X, "Por número", 1);
  return { X, L, porNumeroSinLid: [{ id: X, admin: null }] };
}

// Someone with their LID row and the row keyed by the number from before LIDs; with dispositivo, also a device's row
// ("…:12@lid"), which has no number, as soloUnaFilaPorNumero leaves it. The old row is the newer, as a message that
// came without the LID leaves it: the number stands for the LID row all the same (FILA_DEL_NUMERO), and with the old
// row older, "the LID row" and "the newest" couldn't be told apart.
export function filaVieja(n, { dispositivo = false } = {}) {
  const [X, LID] = [unNumero(n), unaLid(n)];
  const DISPOSITIVO = LID.replace("@lid", ":12@lid");
  fila(LID, X, "Persona", 1);
  fila(X, X, "Vieja", 2);
  if (dispositivo) fila(DISPOSITIVO, "", "Dispositivo", 3);
  return { X, LID, DISPOSITIVO };
}

// An owner, on globalThis.owners as config.toml has it (comoEnConfig, the bare digits if not given), with their LID
// row; with filaAjena, someone else's row that still has the owner's number. The owners come back after the test.
export function owner(t, n, { comoEnConfig = null, filaAjena = false } = {}) {
  const [X, LID, AJENA] = [unNumero(n), unaLid(n, 1), unaLid(n, 9)];
  const antes = globalThis.owners;
  globalThis.owners = [comoEnConfig ?? digitos(X)];
  t.after(() => {
    globalThis.owners = antes;
  });
  fila(LID, X, "Owner", 2);
  if (filaAjena) fila(AJENA, X, "Ajena", 1);
  return { X, LID, AJENA };
}

// The bot as a group lists it: by LID with the number, by number with the LID, and by number alone.
export function botEnGrupo(client = globalThis.client) {
  const { lid, jid } = client.user;
  return { porLid: { id: lid, phoneNumber: jid, admin: "admin" }, porNumero: { id: jid, lid, admin: "admin" }, porNumeroSinLid: { id: jid, admin: "admin" } };
}

// WhatsApp's answer to who has a number (USync's LID query, lidSegunWhatsApp): mapa is number -> LID, and a number not
// in it comes back without one. Returns the questions asked.
export function usyncFalso(t, mapa, client = globalThis.client) {
  const consultas = [];
  client.executeUSyncQuery = async (consulta) => {
    consultas.push(consulta);
    return { list: consulta.users.map((u) => ({ id: u.id, lid: mapa[u.id] })) };
  };
  t.after(() => delete client.executeUSyncQuery);
  return consultas;
}

// A group message, with what the plugins read of it.
export const mensaje = ({ chat = G, sender, senderJid = "", text = "", mentionedJid = [], quoted } = {}) => ({ chat, sender, senderJid, text, mentionedJid, quoted, isGroup: true, react: async () => {}, delete: async () => {} });
