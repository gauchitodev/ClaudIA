// The WhatsApp connection, in one place: the socket main.js makes, how the connection is doing, and who the bot is by
// it. main.js makes a new socket on each reconnect, so whoever needs it asks here each time and doesn't keep one: one
// kept from before a reconnect is closed. They were globals: the socket (client), read off globalThis in some twenty
// files and bare in three, the database among them, and four more beside it for its state.
//
// No imports and nothing done on load: the database imports it, and so does lib/identidad.js, which the database can't
// ask (that one asks the database).
export const conexion = {
  // The socket (lib/wa-socket.js's makeWASocket): the one main.js made last.
  client: null,
  // Whether the connection is open: main.js turns it on when it opens, and off when it closes.
  botConectado: false,
  // When it last opened (.ping, .estado), and when it went down, while it's down (the "volví" notice, main.js).
  horaConexion: 0,
  horaCaida: 0,
  // The channel of config.toml's [canal] as WhatsApp gives it on connect, { jid, nombre } (main.js): the files the bot
  // sends carry it (lib/wa-socket.js).
  canal: null,
};

// Who the bot is, by its connection: its two ids (lib/wa-socket.js takes the device out of them), its LID and its name.
// The database asks here instead of looking into the socket, and so does lib/identidad.js.
export const idsDelBot = (client = conexion.client) => [client?.user?.lid, client?.user?.jid].filter(Boolean);
export const lidDelBot = (client = conexion.client) => client?.user?.lid;
export const nombreDelBot = (client = conexion.client) => client?.user?.name;
