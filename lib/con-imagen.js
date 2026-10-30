// A text that goes with a picture from the internet (a poster, a decoration): if the picture doesn't come, the text
// goes alone. sendFile throws when a link doesn't answer with the file (lib/wa-socket.js), and a command with no catch
// of its own ended there: the text was lost with the picture, and whoever asked heard nothing. With no picture at all,
// it's just the text.
export function mandarConImagen(client, chat, imagen, texto, quoted, etiqueta = "imagen") {
  if (!imagen) return client.sendText(chat, texto, quoted);
  return client.sendFile(chat, imagen, null, texto, quoted).catch((e) => {
    console.error(`[${etiqueta}] sin imagen:`, e?.message || e);
    return client.sendText(chat, texto, quoted);
  });
}
