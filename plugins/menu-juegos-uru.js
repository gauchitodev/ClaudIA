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
Reaccioná a los mensajes que te gusten — suma para quien lo escribió y para vos.
▸ .ranking — ver el estado del mes

🪙 *UruCoins*
Se ganan: reaccionando (+1), que te reaccionen (+2), mandando una entrada de las de arriba (+5), ganando trivia/acertijo/ahorcado/banderas/ordenar (+10), la entrada más votada de la semana (+25) y los ganadores del mes (+50).
▸ .coins — tu saldo y los más ricos
▸ .apostar 20 — durante un juego activo: si ganás, cobrás el doble
▸ .regalar @alguien 20 — transferí coins
▸ .playya / .videoya — música sin esperar el cooldown (15 coins)
`.trim();

  await client.sendText(m.chat, texto, m);
};

export default plugin;
