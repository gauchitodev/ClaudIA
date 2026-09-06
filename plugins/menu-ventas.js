// Menú del modo compraventa: lo que sirve en un grupo de ventas, sin los juegos ni la economía.
// Si se agregan comandos nuevos de compraventa, sumalos acá y también en lib/manual-claudia.js
// para que Claudia sepa contestar cuando le pregunten cómo se hace algo.
let plugin = {};
plugin.cmd = ["menuventas", "menuventa", "menucompraventa", "ventas"];
plugin.onlyGroup = true;

plugin.run = async (m, { client, chat }) => {
  const enModo = chat?.monedas === 0 && chat?.games === 0;

  const texto = `
🏷️ *MENÚ DE COMPRAVENTA*

📢 *Publicar*
▸ .vendo <qué, precio, zona> — publicás algo en venta
▸ .compro <qué buscás> — publicás que buscás algo
▸ Ej: .vendo bici rodado 26, 4500, Mercedes

🔎 *Ver y buscar*
▸ .catalogo — todo lo publicado en el grupo
▸ .vendo / .compro (sin texto) — solo las de ese tipo
▸ .buscar <palabra> — filtra por palabra
▸ .publicacion N — ver una en detalle
▸ .mias — tus publicaciones

🔔 *Alertas*
▸ .avisame <palabra> — te aviso cuando alguien publique eso
▸ .avisame quitar <palabra> — la sacás
▸ .alertas — las que tenés puestas

✅ *Cerrar tu aviso*
▸ .vendido N — se vendió
▸ .conseguido N — conseguiste lo que buscabas
▸ .reservado N — reservado, sigue en pie
▸ .sigue N — vuelve a estar disponible
▸ .baja N — lo das de baja

⭐ *Reputación* (vale en todos los grupos)
▸ .calificar @persona 5 buen vendedor — después de operar
▸ .reputacion — la tuya · .reputacion @persona — la de otro
▸ .calificaciones @persona — el detalle, con números
▸ Admins: .calificaciones borrar N · .calificaciones editar N <estrellas>

👤 *Personas*
▸ .perfil — tu ficha · .perfil @alguien — la de otro
▸ .rango — tu antigüedad en el grupo · .rangos — la escalera
▸ .reglas — las reglas del grupo · .plantilla — cómo publicar

🛡️ *Para admins*
▸ .modo compraventa — apaga juegos, economía y charla
▸ .modo amigos — vuelve a prender todo
▸ .roles — quién modera · .adminbot @persona · .moderador @persona
▸ .reglas set <texto> · .plantilla set <texto>
▸ .horario 8:00-22:00 — abre y cierra el grupo solo
▸ .config — anti-links y demás interruptores

${enModo ? "Este grupo está en modo compraventa." : "Este grupo NO está en modo compraventa: los juegos y la economía siguen prendidos. Un admin lo cambia con .modo compraventa"}
Menú general: .menu
`.trim();

  await client.sendText(m.chat, texto, m);
};

export default plugin;
