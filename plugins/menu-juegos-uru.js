const plugin = {};
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
Se ganan: reaccionando (+1), que te reaccionen (+2), mandando una entrada de las de arriba (+5), ganando trivia/acertijo/ahorcado/banderas/ordenar (+10; el ahorcado paga hasta 5 partidas por día), la entrada más votada de la semana (+25) y los ganadores del mes (+50).
▸ .bal — tu saldo · .baltop — los más ricos del grupo · .inventario — tus ítems
▸ .perfil — tu ficha completa · .perfil @alguien — la de otra persona
▸ .mitimba — cuánto apostaste en cada juego y cómo te fue · .timba — el ranking del grupo
▸ .regalar @alguien 20 — transferí coins
▸ .playya / .videoya — música sin esperar el cooldown (15 coins)

🛒 *Tienda*
▸ .tienda — qué se puede comprar
▸ .comprar escudo — te salva una apuesta perdida (25)
▸ .comprar racha — 24 h ganando el doble (40)
▸ .comprar voto doble — tu próxima reacción a una entrada vale por dos (15)
▸ .comprar apodo Tito — Claudia te llama así (30)
▸ .inventario — lo que tenés

🎰 *Casino y lotería*
▸ .ruleta 20 rojo — abre la mesa; en 45 s apuestan todos y la bola sale una vez. Rojo, negro, par, impar, 1-18, 19-36 (x2), docenas y columnas (x3), seisena (x6), cuadro (x9), calle (x12), caballo (x18), pleno (x36; el 0 también como verde)
▸ .tragamonedas 50 — cinco líneas de pago (tres filas y dos diagonales); cada línea paga sobre la apuesta entera: dos cerezas x0,4 y tres iguales de x1 a x40
▸ .blackjack 20 — contra la banca: .pedir, .plantarse, .doblar, .dividir, .seguro o .rendirse; gana x2, blackjack x2.5
▸ .mines 20 3 — grilla de 5x5 con minas: destapás con .destapar B3, cada segura sube el multiplicador y .retirar cobra; una mina y perdés
▸ .duelo @alguien 20 [dado|carta|pelea] — uno contra uno, el ganador se lleva todo; el otro responde .acepto o .rechazo
▸ .pelea @alguien 20 — pelea por turnos con .golpe, .patada, .cubrirse y .curar hasta que uno cae
▸ .carrera 20 3 — abre la carrera; en 45 s apuestan todos a uno de cinco caballos con cuotas que cambian, y se corre
▸ .loteria — estado del pozo · .loteria 2 — comprá boletos (10 c/u, máximo 5 por semana); el sorteo sale al empezar la semana

📊 *Apuestas sobre eventos reales*
▸ .evento Peñarol vs Nacional | Peñarol | Empate | Nacional | 20:30 — un admin abre el mercado (la hora de cierre es obligatoria)
▸ .jugar 7 Nacional 20 — apostá en el mercado #7; lo apostado se reparte entre los que aciertan
▸ .mercados — mercados abiertos · .mercado 7 — detalle de uno
▸ .resolver 7 Nacional — un admin que no apostó carga el resultado (o "anulado" para devolver todo)

🔥 *Actividad*
▸ Racha diaria: escribí 3 mensajes (de dos palabras o más) en el día y ganás monedas; el premio sube con los días seguidos. Se ve en .racha
▸ Pregunta del día: a partir del mediodía, respondé al mensaje de Claudia y sumás monedas (un admin la activa con .preguntadeldia)
▸ Trivia relámpago: un par de veces por día, en horario sorpresa; el primero que acierta cobra (se activa con .triviarelampago)
▸ Rangos: con días en el grupo y mensajes subís solo de Nuevo a Leyenda, con premio al subir. .rango te muestra el tuyo, .rangos la escalera
▸ .recap — resumen de la semana en curso; el domingo de noche sale solo (se apaga con .recapsemanal)
`.trim();

  await client.sendText(m.chat, texto, m);
};

export default plugin;
