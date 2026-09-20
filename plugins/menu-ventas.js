// Menú del modo compraventa: lo que sirve en un grupo de ventas, sin los juegos ni la economía.
// Si se agregan comandos nuevos de compraventa, sumalos acá y también en lib/manual-claudia.js para que Claudia sepa
// contestar cuando le pregunten cómo se hace algo. test/menus.test.mjs verifica que lo que se nombra acá exista.
const plugin = {};
plugin.cmd = ["menuventas", "menuventa", "menucompraventa", "ventas"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, chat }) => {
  const enModo = chat?.monedas === 0 && chat?.games === 0;

  const texto = `
🏷️ *MENÚ DE COMPRAVENTA*

📢 *Publicar*
▸ .vendo <qué, precio, zona> — lo ponés a la venta. Ej: .vendo bici rodado 26, 4500, Mercedes
▸ .compro <qué buscás> — publicás que lo estás buscando
▸ #vendo o #compro en un mensaje, o en el pie de una foto, hacen lo mismo
▸ .vendo respondiendo a una foto — la publica con la descripción que tenga (el dueño de la foto, o un admin)

🔎 *Ver y buscar*
▸ .catalogo — todo lo activo · .catalogo N — el detalle de la #N
▸ .vendo o .compro sin texto — solo las de ese tipo
▸ .buscar <palabra> — filtra por palabra
▸ .mias — las tuyas, con su número
▸ .avisame <palabra> — te aviso acá cuando aparezca · sin nada las lista · .avisame quitar <palabra> la saca

✅ *Cerrar la tuya* — respondé a tu publicación y escribí el comando, o agregá el número
▸ .vendido — se concretó · .baja — la sacás de la lista
▸ .reservado — está señada · .sigue — vuelve a estar libre (y la renueva)

⭐ *Confianza y grupo*
▸ .calificar @persona 5 buen vendedor — después de operar · .reputacion — la tuya
▸ .calificaciones @persona — el detalle, con números (los admins corrigen con borrar N o editar N)
▸ .perfil · .rango · .reglas · .plantilla

🛡️ *Admins*
▸ .modo compraventa — apaga juegos, economía y charla (.modo amigos los vuelve a prender)
▸ .roles · .adminbot @persona · .moderador @persona · .reglas set <texto> · .horario 8:00-22:00 · .config

${enModo ? "Este grupo está en modo compraventa." : "Este grupo NO está en modo compraventa: los juegos y la economía siguen prendidos. Un admin lo cambia con .modo compraventa"}
Menú general: .menu
`.trim();

  await client.sendText(m.chat, texto, m);
};

export default plugin;
