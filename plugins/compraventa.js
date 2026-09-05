import { publicar, textoCatalogo, textoBusqueda, textoMias, textoPublicacion, cambiarEstado, gestionarAlerta } from "../lib/compraventa.js";

let plugin = {};
plugin.cmd = ["vendo", "compro", "busco", "publicaciones", "catalogo", "catálogo", "buscar", "publicacion", "publicación", "vendido", "conseguido", "baja", "reservado", "sigue", "mias", "mispublicaciones", "avisame", "avisame", "alertas"];
plugin.onlyGroup = true;

// .vendo / .compro sin nada → catálogo; con texto → publica · .buscar <palabra> · .publicacion N · .vendido/.baja/.reservado/.sigue N ·
// .mias · .avisame <palabra> (quitar para sacarla)
plugin.run = async (m, { client, command, args, text, isMod }) => {
  const enviar = (r) => client.sendMessage(m.chat, { text: r.texto ?? r.mensaje, mentions: r.mentions || [] }, { quoted: m });
  const contestar = (r) => (r.ok ? client.sendText(m.chat, r.mensaje, m) : client.sendText(m.chat, `❌ ${r.error}`, m));

  if (["vendo", "compro", "busco"].includes(command)) {
    const tipo = command === "vendo" ? "vendo" : "compro";
    if (!text.trim()) return enviar(textoCatalogo(m.chat, tipo));
    const r = publicar(m.chat, m.sender, tipo, text, m.key?.id || null);
    if (!r.ok) return client.sendText(m.chat, `❌ ${r.error}`, m);
    await client.sendText(m.chat, r.mensaje, m);
    if (r.avisos) await client.sendMessage(m.chat, { text: r.avisos.texto, mentions: r.avisos.mentions });
    return;
  }
  if (["publicaciones", "catalogo", "catálogo"].includes(command)) return enviar(textoCatalogo(m.chat, null));
  if (command === "buscar") return enviar(textoBusqueda(m.chat, text));
  if (command === "publicacion" || command === "publicación") return enviar(textoPublicacion(m.chat, parseInt(args[0], 10)));
  if (command === "mias" || command === "mispublicaciones") return enviar(textoMias(m.chat, m.sender));
  if (command === "avisame" || command === "alertas") return contestar(gestionarAlerta(m.chat, m.sender, args));
  const accion = command === "conseguido" ? "vendido" : command;
  return contestar(cambiarEstado(m.chat, parseInt(args[0], 10), m.sender, isMod, accion));
};

export default plugin;
