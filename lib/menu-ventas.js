// The marketplace mode menu (.menuventas, plugins/menu-ventas.js): what's useful in a sales group, without the games
// or the economy. The sections live here, apart from the plugin, so the command guide (lib/guia-comandos.js,
// docs/comandos.md) carries them too. If new marketplace commands are added, add them here and in
// lib/manual-claudia.js, so Claudia can answer when someone asks how to do something. test/menus.test.mjs checks that
// what is named here exists.
export const SECCIONES_VENTAS = `📢 *Publicar*
▸ .vendo <qué, precio, zona> — lo ponés a la venta. Ej: .vendo bici rodado 26, 4500, Mercedes
▸ .compro <qué buscás> — publicás que lo estás buscando
▸ #vendo o #compro en un mensaje, o en el pie de una foto, hacen lo mismo
▸ .vendo respondiendo a una foto — la publica con la descripción que tenga (quien la mandó, o un moderador)
▸ En modo compraventa alcanza con empezar el mensaje con «vendo» o «se vende»

🔎 *Ver y buscar*
▸ .catalogo — todo lo activo · .catalogo N — el detalle de la #N
▸ .vendo o .compro sin texto — solo las de ese tipo
▸ .buscar <palabra> — filtra por palabra
▸ .mias — las tuyas, con su número
▸ .avisame <palabra> — te aviso acá cuando aparezca · sin nada las lista · .avisame quitar <palabra> la saca
▸ #busco — te recuerdo quién vende algo parecido, y a quien venda le cuento que lo buscabas. En modo compraventa también con «¿alguien vende…?»

✅ *Cerrar la tuya* — respondé a tu publicación y escribí el comando, o agregá el número
▸ .vendido — se concretó · .baja — la sacás de la lista
▸ .reservado — está señada · .sigue — vuelve a estar libre (y la renueva)

⭐ *Confianza y grupo*
▸ .calificar @persona 5 buen vendedor — después de operar · .reputacion — la tuya
▸ .calificaciones @persona — el detalle, con números (los admins corrigen con borrar N o editar N)
▸ .perfil · .rango · .reglas · .plantilla

🛡️ *Admins*
▸ .modo compraventa — apaga juegos, economía, charla, saludos, ascensos, recap, pregunta del día, trivia relámpago e iniciativa (.modo amigos vuelve a prender juegos, economía, charla, saludos, ascensos y recap)
▸ .roles · .adminbot @persona · .moderador @persona · .reglas set <texto> · .horario 8:00-22:00 · .config`;

// The whole menu as .menuventas sends it: the sections and, at the foot, whether this group is in the mode.
export function textoMenuVentas(enModo) {
  const estado = enModo ? "Este grupo está en modo compraventa." : "Este grupo NO está en modo compraventa: los juegos y la economía siguen prendidos. Un admin lo cambia con .modo compraventa";
  return `🏷️ *MENÚ DE COMPRAVENTA*\n\n${SECCIONES_VENTAS}\n\n${estado}\nMenú general: .menu`;
}
