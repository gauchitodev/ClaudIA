// The marketplace mode menu (.menuventas, plugins/menu-ventas.js): what's useful in a sales group, without the games
// or the economy. The sections live here, apart from the plugin, so the command guide (lib/guia-comandos.js,
// docs/comandos.md) carries them too. If new marketplace commands are added, add them here and in
// lib/manual-claudia.js, so Claudia can answer when someone asks how to do something. test/menus.test.mjs checks that
// what is named here exists.
export const SECCIONES_VENTAS = `📢 *Publicar*
▸ .vendo <qué, precio, zona> — lo ponés a la venta. Ej: .vendo bici rodado 26, $ 4.500, Mercedes
▸ Una venta entra al catálogo si dice qué es y el precio: si le falta algo, te digo qué
▸ .compro <qué buscás> — publicás que lo estás buscando
▸ #vendo o #compro en un mensaje, o en el pie de una foto, hacen lo mismo
▸ .vendo respondiendo a una foto — la publica con la descripción que tenga (quien la mandó, o un moderador)
▸ En modo compraventa alcanza con escribir «vendo», qué es y el precio: le pongo 🏷️ al mensaje y queda en el catálogo
▸ Ahí, si al aviso le falta algo le pongo ❔. Cómo publicar te lo explico una sola vez, y con palabras te confirmo solo la primera
▸ Ahí también, si un mensaje parece un aviso o un pedido aunque no esté escrito así, te cuento cómo anotarlo, una sola vez
▸ Si editás el mensaje para completarlo o corregirlo, vale como escrito de nuevo
▸ Si mandás de nuevo un aviso tuyo que sigue activo, renuevo esa publicación en vez de hacer otra

🔎 *Ver y buscar*
▸ .catalogo — todo lo activo · .catalogo N — el detalle de la #N
▸ En modo compraventa lo muestro yo cada 4 horas, entre las 11 y las 21, si el grupo estuvo escribiendo, y borro el anterior
▸ .vendo o .compro sin texto — solo las de ese tipo
▸ .buscar <palabra> — filtra por palabra
▸ .mias — las tuyas, con su número
▸ .avisame <palabra> — te aviso acá cuando aparezca · sin nada las lista · .avisame quitar <palabra> la saca
▸ #busco — te recuerdo quién vende algo parecido, y a quien venda le cuento que lo buscabas. En modo compraventa también con «¿alguien vende…?»

✅ *Cerrar la tuya* — respondé a tu publicación y escribí el comando, o agregá el número
▸ .vendido — se concretó · .baja — la sacás de la lista
▸ .reservado — está señada · .sigue — vuelve a estar libre (y la renueva)
▸ Varias de una vez: .sigue 12 13, o .sigue todas (las que te pregunté; si no pregunté por ninguna, todas las tuyas)
▸ Si es tuya, también sin el punto y con su número («sigue 12», «vendido 12»), o la palabra sola respondiendo a mi pregunta
▸ A los 7 días sin novedades pregunto si sigue en pie: una vez por día, entre las 11 y las 21, por todas las tuyas juntas. Lo que queda 2 días sin respuesta lo doy de baja

✏️ *Corregir la tuya* — con su número, o respondiendo a tu publicación
▸ .precio 12 $ 3.500 — le cambiás el precio · respondiendo a la publicación: .precio $ 3.500
▸ .editar 12 <texto nuevo> — reescribís el aviso (también .corregir): tiene que decir qué es y el precio
▸ El precio de una tuya, también sin el punto: «precio 12 $ 3.500»
▸ Al corregirla se renueva, y vale como respuesta si te había preguntado si sigue en pie

⭐ *Confianza y grupo*
▸ .calificar @persona 5 buen vendedor — después de operar · .reputacion — la tuya
▸ .calificaciones @persona — el detalle, con números (los admins corrigen con borrar N o editar N)
▸ .perfil · .rango · .reglas · .plantilla

🛡️ *Admins*
▸ .modo compraventa — apaga juegos, economía, charla, saludos, ascensos, recap, pregunta del día, trivia relámpago e iniciativa (.modo amigos vuelve a prender juegos, economía, charla, saludos, ascensos y recap)
▸ .catalogoauto off — dejo de mostrar el catálogo por mi cuenta (on lo vuelve a prender)
▸ Los moderadores corrigen la publicación de cualquiera (.precio 12 $ 3.500 · .editar 12 <texto>), y le aviso a quien la publicó
▸ .baja 12 <motivo>, de un moderador sobre una ajena — la saco del catálogo y le aviso a quien la publicó, con el motivo. Solo un moderador la devuelve (.sigue 12), y ese mismo aviso no vuelve a entrar por 30 días
▸ .baja @persona <motivo> — saco todas las de esa persona (o .baja todas <motivo> respondiendo a un mensaje suyo)
▸ .roles · .adminbot @persona · .moderador @persona · .reglas set <texto> · .horario 8:00-22:00 · .config`;

// The whole menu as .menuventas sends it: the sections and, at the foot, whether this group is in the mode.
export function textoMenuVentas(enModo) {
  const estado = enModo ? "Este grupo está en modo compraventa." : "Este grupo NO está en modo compraventa: los juegos y la economía siguen prendidos. Un admin lo cambia con .modo compraventa";
  return `🏷️ *MENÚ DE COMPRAVENTA*\n\n${SECCIONES_VENTAS}\n\n${estado}\nMenú general: .menu`;
}
