let plugin = {};
plugin.cmd = ["menuuru", "juegosuru"];
plugin.onlyGroup = true;

plugin.run = async (m, { client }) => {
  const texto = `
🇺🇾 *JUEGOS Y TEMÁTICAS DEL GRUPO*

😤 *Queja de Lunes*
Descargate con #quejadelunes
▸ .quejas — ver la lista de la semana

🎲 *Historias Random*
Contá algo random con #historiasrandom
▸ .historias — ver la lista de la semana

⭐ *Recomendación*
Compartí algo con #recomendado
▸ .recomendados — ver la lista de la semana

🏆 *Ranking del mes*
Reaccioná a los mensajes que te gusten — suma puntos a quien lo escribió y a vos por participar.
▸ .ranking — ver el estado del mes
`.trim();

  await client.sendText(m.chat, texto, m);
};

export default plugin;
