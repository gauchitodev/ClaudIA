const plugin = {};
plugin.cmd = ["faggi"];

// Answers with the text configured in config.toml (textofaggi).
plugin.run = async (m, { client }) => {
  const texto = globalThis.textoFaggi || "";
  if (!texto) return client.sendText(m.chat, "Falta configurar el texto de .faggi en config.toml (textofaggi).", m);
  await client.sendText(m.chat, texto, m);
};

export default plugin;
