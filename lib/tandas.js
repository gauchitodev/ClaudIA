// A batch of incoming messages (one messages.upsert, main.js): in order within each chat, so the replies there don't
// get interleaved, and the chats side by side. The whole batch used to go one message at a time, and a chat whose
// replies were waiting their turn to be sent (lib/ritmo.js has no ceiling) held up every other chat in the batch.
// Batches come above all when reconnecting; live, each message usually arrives in a batch of its own.

// procesar(m) handles one message; whatever it throws is its own problem, the rest of the batch goes on.
export async function procesarTanda(mensajes, procesar) {
  const porChat = new Map();
  for (const m of mensajes || []) {
    const chat = m?.key?.remoteJid || "";
    if (!porChat.has(chat)) porChat.set(chat, []);
    porChat.get(chat).push(m);
  }
  await Promise.all(
    [...porChat.values()].map(async (delChat) => {
      for (const m of delChat) {
        try {
          await procesar(m);
        } catch (e) {
          console.error(e);
        }
      }
    }),
  );
}
