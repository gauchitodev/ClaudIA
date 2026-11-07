import { juegoTerminado } from "../lib/urucoins.js";
import { abrirJuego } from "../lib/juego-rapido.js";
import { elegirAlAzar } from "../lib/azar.js";
import { esComando } from "../lib/comandos.js";
import txt from "../lib/strings.js";
import { estadoDe } from "../lib/estado-de-plugins.js";
const plugin = {};
plugin.cmd = ["adivinabandera", "bandera", "banderas"];
plugin.juego = true;
plugin.botAdmin = true;

// Each country with its capital, which the game tells along with the answer: people learn the flags playing, and the
// capital comes with it. The name goes as it's written (the answer is compared without accents or capitals). "nota",
// where one capital isn't the whole story: more than one, a recent move, or a bigger city people take for it.
// Exported for the tests.
export const BANDERAS = [
  { emoji: "🇦🇫", pais: "Afganistán", capital: "Kabul" },
  { emoji: "🇦🇱", pais: "Albania", capital: "Tirana" },
  { emoji: "🇩🇪", pais: "Alemania", capital: "Berlín" },
  { emoji: "🇩🇿", pais: "Argelia", capital: "Argel" },
  { emoji: "🇦🇩", pais: "Andorra", capital: "Andorra la Vieja" },
  { emoji: "🇦🇴", pais: "Angola", capital: "Luanda" },
  { emoji: "🇦🇬", pais: "Antigua y Barbuda", capital: "Saint John's" },
  { emoji: "🇸🇦", pais: "Arabia Saudita", capital: "Riad" },
  { emoji: "🇦🇷", pais: "Argentina", capital: "Buenos Aires" },
  { emoji: "🇦🇲", pais: "Armenia", capital: "Ereván" },
  { emoji: "🇦🇺", pais: "Australia", capital: "Canberra" },
  { emoji: "🇦🇹", pais: "Austria", capital: "Viena" },
  { emoji: "🇦🇿", pais: "Azerbaiyán", capital: "Bakú" },
  { emoji: "🇧🇸", pais: "Bahamas", capital: "Nasáu" },
  { emoji: "🇧🇭", pais: "Baréin", capital: "Manama" },
  { emoji: "🇧🇩", pais: "Bangladés", capital: "Daca" },
  { emoji: "🇧🇧", pais: "Barbados", capital: "Bridgetown" },
  { emoji: "🇧🇾", pais: "Bielorrusia", capital: "Minsk" },
  { emoji: "🇧🇪", pais: "Bélgica", capital: "Bruselas" },
  { emoji: "🇧🇿", pais: "Belice", capital: "Belmopán" },
  { emoji: "🇧🇯", pais: "Benín", capital: "Porto Novo", nota: "el gobierno está en Cotonú" },
  { emoji: "🇧🇹", pais: "Bután", capital: "Timbu" },
  { emoji: "🇧🇴", pais: "Bolivia", capital: "Sucre", nota: "el gobierno está en La Paz" },
  { emoji: "🇧🇦", pais: "Bosnia y Herzegovina", capital: "Sarajevo" },
  { emoji: "🇧🇼", pais: "Botsuana", capital: "Gaborone" },
  { emoji: "🇧🇷", pais: "Brasil", capital: "Brasilia", nota: "hasta 1960 era Río de Janeiro" },
  { emoji: "🇧🇳", pais: "Brunéi", capital: "Bandar Seri Begawan" },
  { emoji: "🇧🇬", pais: "Bulgaria", capital: "Sofía" },
  { emoji: "🇧🇫", pais: "Burkina Faso", capital: "Uagadugú" },
  { emoji: "🇧🇮", pais: "Burundi", capital: "Gitega", nota: "hasta 2019 era Buyumbura" },
  { emoji: "🇨🇻", pais: "Cabo Verde", capital: "Praia" },
  { emoji: "🇰🇭", pais: "Camboya", capital: "Nom Pen" },
  { emoji: "🇨🇲", pais: "Camerún", capital: "Yaundé" },
  { emoji: "🇨🇦", pais: "Canadá", capital: "Ottawa" },
  { emoji: "🇶🇦", pais: "Catar", capital: "Doha" },
  { emoji: "🇹🇩", pais: "Chad", capital: "Yamena" },
  { emoji: "🇨🇱", pais: "Chile", capital: "Santiago" },
  { emoji: "🇨🇳", pais: "China", capital: "Pekín" },
  { emoji: "🇨🇾", pais: "Chipre", capital: "Nicosia" },
  { emoji: "🇨🇴", pais: "Colombia", capital: "Bogotá" },
  { emoji: "🇰🇲", pais: "Comoras", capital: "Moroni" },
  { emoji: "🇨🇬", pais: "Congo", capital: "Brazzaville" },
  { emoji: "🇨🇩", pais: "República Democrática del Congo", capital: "Kinsasa" },
  { emoji: "🇰🇵", pais: "Corea del Norte", capital: "Pionyang" },
  { emoji: "🇰🇷", pais: "Corea del Sur", capital: "Seúl" },
  { emoji: "🇨🇮", pais: "Costa de Marfil", capital: "Yamusukro", nota: "Abiyán es la ciudad más grande" },
  { emoji: "🇨🇷", pais: "Costa Rica", capital: "San José" },
  { emoji: "🇭🇷", pais: "Croacia", capital: "Zagreb" },
  { emoji: "🇨🇺", pais: "Cuba", capital: "La Habana" },
  { emoji: "🇩🇰", pais: "Dinamarca", capital: "Copenhague" },
  { emoji: "🇩🇲", pais: "Dominica", capital: "Roseau" },
  { emoji: "🇪🇨", pais: "Ecuador", capital: "Quito" },
  { emoji: "🇪🇬", pais: "Egipto", capital: "El Cairo" },
  { emoji: "🇸🇻", pais: "El Salvador", capital: "San Salvador" },
  { emoji: "🇦🇪", pais: "Emiratos Árabes Unidos", capital: "Abu Dabi" },
  { emoji: "🇪🇷", pais: "Eritrea", capital: "Asmara" },
  { emoji: "🇸🇰", pais: "Eslovaquia", capital: "Bratislava" },
  { emoji: "🇸🇮", pais: "Eslovenia", capital: "Liubliana" },
  { emoji: "🇪🇸", pais: "España", capital: "Madrid" },
  { emoji: "🇺🇸", pais: "Estados Unidos", capital: "Washington D. C." },
  { emoji: "🇪🇪", pais: "Estonia", capital: "Tallin" },
  { emoji: "🇸🇿", pais: "Esuatini", capital: "Mbabane", nota: "Lobamba es la capital real y del Parlamento" },
  { emoji: "🇪🇹", pais: "Etiopía", capital: "Adís Abeba" },
  { emoji: "🇫🇯", pais: "Fiyi", capital: "Suva" },
  { emoji: "🇵🇭", pais: "Filipinas", capital: "Manila" },
  { emoji: "🇫🇮", pais: "Finlandia", capital: "Helsinki" },
  { emoji: "🇫🇷", pais: "Francia", capital: "París" },
  { emoji: "🇬🇦", pais: "Gabón", capital: "Libreville" },
  { emoji: "🇬🇲", pais: "Gambia", capital: "Banjul" },
  { emoji: "🇬🇪", pais: "Georgia", capital: "Tiflis" },
  { emoji: "🇬🇭", pais: "Ghana", capital: "Acra" },
  { emoji: "🇬🇷", pais: "Grecia", capital: "Atenas" },
  { emoji: "🇬🇩", pais: "Granada", capital: "Saint George's" },
  { emoji: "🇬🇹", pais: "Guatemala", capital: "Ciudad de Guatemala" },
  { emoji: "🇬🇳", pais: "Guinea", capital: "Conakri" },
  { emoji: "🇬🇼", pais: "Guinea-Bisáu", capital: "Bisáu" },
  { emoji: "🇬🇶", pais: "Guinea Ecuatorial", capital: "Ciudad de la Paz", nota: "desde 2026; antes era Malabo" },
  { emoji: "🇬🇾", pais: "Guyana", capital: "Georgetown" },
  { emoji: "🇭🇹", pais: "Haití", capital: "Puerto Príncipe" },
  { emoji: "🇭🇳", pais: "Honduras", capital: "Tegucigalpa" },
  { emoji: "🇭🇺", pais: "Hungría", capital: "Budapest" },
  { emoji: "🇮🇳", pais: "India", capital: "Nueva Delhi" },
  { emoji: "🇮🇩", pais: "Indonesia", capital: "Yakarta" },
  { emoji: "🇮🇷", pais: "Irán", capital: "Teherán" },
  { emoji: "🇮🇶", pais: "Irak", capital: "Bagdad" },
  { emoji: "🇮🇪", pais: "Irlanda", capital: "Dublín" },
  { emoji: "🇮🇸", pais: "Islandia", capital: "Reikiavik" },
  { emoji: "🇮🇱", pais: "Israel", capital: "Jerusalén", nota: "en disputa: la mayoría de las embajadas están en Tel Aviv" },
  { emoji: "🇮🇹", pais: "Italia", capital: "Roma" },
  { emoji: "🇯🇲", pais: "Jamaica", capital: "Kingston" },
  { emoji: "🇯🇵", pais: "Japón", capital: "Tokio" },
  { emoji: "🇯🇴", pais: "Jordania", capital: "Amán" },
  { emoji: "🇰🇿", pais: "Kazajistán", capital: "Astaná" },
  { emoji: "🇰🇪", pais: "Kenia", capital: "Nairobi" },
  { emoji: "🇰🇬", pais: "Kirguistán", capital: "Biskek" },
  { emoji: "🇰🇮", pais: "Kiribati", capital: "Tarawa" },
  { emoji: "🇰🇼", pais: "Kuwait", capital: "Ciudad de Kuwait" },
  { emoji: "🇱🇦", pais: "Laos", capital: "Vientián" },
  { emoji: "🇱🇸", pais: "Lesoto", capital: "Maseru" },
  { emoji: "🇱🇻", pais: "Letonia", capital: "Riga" },
  { emoji: "🇱🇧", pais: "Líbano", capital: "Beirut" },
  { emoji: "🇱🇷", pais: "Liberia", capital: "Monrovia" },
  { emoji: "🇱🇾", pais: "Libia", capital: "Trípoli" },
  { emoji: "🇱🇮", pais: "Liechtenstein", capital: "Vaduz" },
  { emoji: "🇱🇹", pais: "Lituania", capital: "Vilna" },
  { emoji: "🇱🇺", pais: "Luxemburgo", capital: "Luxemburgo" },
  { emoji: "🇲🇰", pais: "Macedonia del Norte", capital: "Skopie" },
  { emoji: "🇲🇬", pais: "Madagascar", capital: "Antananarivo" },
  { emoji: "🇲🇾", pais: "Malasia", capital: "Kuala Lumpur", nota: "el gobierno está en Putrajaya" },
  { emoji: "🇲🇼", pais: "Malaui", capital: "Lilongüe" },
  { emoji: "🇲🇻", pais: "Maldivas", capital: "Malé" },
  { emoji: "🇲🇱", pais: "Malí", capital: "Bamako" },
  { emoji: "🇲🇹", pais: "Malta", capital: "La Valeta" },
  { emoji: "🇲🇭", pais: "Islas Marshall", capital: "Majuro" },
  { emoji: "🇲🇷", pais: "Mauritania", capital: "Nuakchot" },
  { emoji: "🇲🇺", pais: "Mauricio", capital: "Port Louis" },
  { emoji: "🇲🇽", pais: "México", capital: "Ciudad de México" },
  { emoji: "🇫🇲", pais: "Micronesia", capital: "Palikir" },
  { emoji: "🇲🇩", pais: "Moldavia", capital: "Chisináu" },
  { emoji: "🇲🇨", pais: "Mónaco", capital: "Mónaco", nota: "es una ciudad-Estado" },
  { emoji: "🇲🇳", pais: "Mongolia", capital: "Ulán Bator" },
  { emoji: "🇲🇪", pais: "Montenegro", capital: "Podgorica" },
  { emoji: "🇲🇦", pais: "Marruecos", capital: "Rabat" },
  { emoji: "🇲🇿", pais: "Mozambique", capital: "Maputo" },
  { emoji: "🇲🇲", pais: "Myanmar", capital: "Naipyidó", nota: "hasta 2005 era Rangún" },
  { emoji: "🇳🇦", pais: "Namibia", capital: "Windhoek" },
  { emoji: "🇳🇷", pais: "Nauru", capital: "Yaren", nota: "no tiene capital oficial; el gobierno está ahí" },
  { emoji: "🇳🇵", pais: "Nepal", capital: "Katmandú" },
  { emoji: "🇳🇮", pais: "Nicaragua", capital: "Managua" },
  { emoji: "🇳🇪", pais: "Níger", capital: "Niamey" },
  { emoji: "🇳🇬", pais: "Nigeria", capital: "Abuya", nota: "hasta 1991 era Lagos" },
  { emoji: "🇳🇴", pais: "Noruega", capital: "Oslo" },
  { emoji: "🇳🇿", pais: "Nueva Zelanda", capital: "Wellington" },
  { emoji: "🇴🇲", pais: "Omán", capital: "Mascate" },
  { emoji: "🇳🇱", pais: "Países Bajos", capital: "Ámsterdam", nota: "el gobierno está en La Haya" },
  { emoji: "🇵🇰", pais: "Pakistán", capital: "Islamabad" },
  { emoji: "🇵🇼", pais: "Palaos", capital: "Ngerulmud" },
  { emoji: "🇵🇦", pais: "Panamá", capital: "Ciudad de Panamá" },
  { emoji: "🇵🇬", pais: "Papúa Nueva Guinea", capital: "Port Moresby" },
  { emoji: "🇵🇾", pais: "Paraguay", capital: "Asunción" },
  { emoji: "🇵🇪", pais: "Perú", capital: "Lima" },
  { emoji: "🇵🇱", pais: "Polonia", capital: "Varsovia" },
  { emoji: "🇵🇹", pais: "Portugal", capital: "Lisboa" },
  { emoji: "🇬🇧", pais: "Reino Unido", capital: "Londres" },
  { emoji: "🇨🇫", pais: "República Centroafricana", capital: "Bangui" },
  { emoji: "🇨🇿", pais: "República Checa", capital: "Praga" },
  { emoji: "🇩🇴", pais: "República Dominicana", capital: "Santo Domingo" },
  { emoji: "🇷🇼", pais: "Ruanda", capital: "Kigali" },
  { emoji: "🇷🇴", pais: "Rumania", capital: "Bucarest" },
  { emoji: "🇷🇺", pais: "Rusia", capital: "Moscú" },
  { emoji: "🇸🇧", pais: "Islas Salomón", capital: "Honiara" },
  { emoji: "🇼🇸", pais: "Samoa", capital: "Apia" },
  { emoji: "🇰🇳", pais: "San Cristóbal y Nieves", capital: "Basseterre" },
  { emoji: "🇸🇲", pais: "San Marino", capital: "San Marino" },
  { emoji: "🇱🇨", pais: "Santa Lucía", capital: "Castries" },
  { emoji: "🇸🇹", pais: "Santo Tomé y Príncipe", capital: "Santo Tomé" },
  { emoji: "🇻🇨", pais: "San Vicente y las Granadinas", capital: "Kingstown" },
  { emoji: "🇸🇳", pais: "Senegal", capital: "Dakar" },
  { emoji: "🇷🇸", pais: "Serbia", capital: "Belgrado" },
  { emoji: "🇸🇨", pais: "Seychelles", capital: "Victoria" },
  { emoji: "🇸🇱", pais: "Sierra Leona", capital: "Freetown" },
  { emoji: "🇸🇬", pais: "Singapur", capital: "Singapur", nota: "es una ciudad-Estado" },
  { emoji: "🇸🇾", pais: "Siria", capital: "Damasco" },
  { emoji: "🇸🇴", pais: "Somalia", capital: "Mogadiscio" },
  { emoji: "🇱🇰", pais: "Sri Lanka", capital: "Sri Jayawardenepura Kotte", nota: "Colombo es la ciudad más grande" },
  { emoji: "🇿🇦", pais: "Sudáfrica", capital: "Pretoria", nota: "también son capitales Ciudad del Cabo, la del Parlamento, y Bloemfontein, la de la Justicia" },
  { emoji: "🇸🇩", pais: "Sudán", capital: "Jartum" },
  { emoji: "🇸🇸", pais: "Sudán del Sur", capital: "Yuba" },
  { emoji: "🇸🇪", pais: "Suecia", capital: "Estocolmo" },
  { emoji: "🇨🇭", pais: "Suiza", capital: "Berna", nota: "es la ciudad federal: por ley, Suiza no tiene capital" },
  { emoji: "🇸🇷", pais: "Surinam", capital: "Paramaribo" },
  { emoji: "🇹🇭", pais: "Tailandia", capital: "Bangkok" },
  { emoji: "🇹🇼", pais: "Taiwán", capital: "Taipéi" },
  { emoji: "🇹🇿", pais: "Tanzania", capital: "Dodoma", nota: "Dar es-Salam es la ciudad más grande" },
  { emoji: "🇹🇯", pais: "Tayikistán", capital: "Dusambé" },
  { emoji: "🇹🇱", pais: "Timor Oriental", capital: "Dili" },
  { emoji: "🇹🇬", pais: "Togo", capital: "Lomé" },
  { emoji: "🇹🇴", pais: "Tonga", capital: "Nukualofa" },
  { emoji: "🇹🇹", pais: "Trinidad y Tobago", capital: "Puerto España" },
  { emoji: "🇹🇳", pais: "Túnez", capital: "Túnez" },
  { emoji: "🇹🇷", pais: "Turquía", capital: "Ankara", nota: "Estambul es la ciudad más grande" },
  { emoji: "🇹🇲", pais: "Turkmenistán", capital: "Asjabad" },
  { emoji: "🇹🇻", pais: "Tuvalu", capital: "Funafuti" },
  { emoji: "🇺🇦", pais: "Ucrania", capital: "Kiev" },
  { emoji: "🇺🇬", pais: "Uganda", capital: "Kampala" },
  { emoji: "🇺🇾", pais: "Uruguay", capital: "Montevideo" },
  { emoji: "🇺🇿", pais: "Uzbekistán", capital: "Taskent" },
  { emoji: "🇻🇺", pais: "Vanuatu", capital: "Port Vila" },
  { emoji: "🇻🇦", pais: "Ciudad del Vaticano", capital: "Ciudad del Vaticano", nota: "es una ciudad-Estado" },
  { emoji: "🇻🇪", pais: "Venezuela", capital: "Caracas" },
  { emoji: "🇻🇳", pais: "Vietnam", capital: "Hanói" },
  { emoji: "🇾🇪", pais: "Yemen", capital: "Saná" },
  { emoji: "🇩🇯", pais: "Yibuti", capital: "Yibuti" },
  { emoji: "🇿🇲", pais: "Zambia", capital: "Lusaka" },
  { emoji: "🇿🇼", pais: "Zimbabue", capital: "Harare" },
];

const normalizar = (texto) =>
  (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// chat -> the flag in play, kept where a reload of this file doesn't lose it (lib/estado-de-plugins.js)
const banderas = estadoDe("fun-banderas", () => ({}));

// The capital's line, said when the round ends either way.
const lineaCapital = (bandera) => `🏛️ Capital: *${bandera.capital}*${bandera.nota ? ` (${bandera.nota})` : ""}`;

plugin.run = async (m, { client, chat }) => {
  const bandera = elegirAlAzar(BANDERAS);
  // The chat is taken before the flag goes out, and only this game's timer can end it: see lib/juego-rapido.js.
  const abierto = await abrirJuego(banderas, m.chat, {
    nombre: "bandera",
    juego: { pais: bandera.pais.toLowerCase(), bandera },
    enviar: () => client.sendText(m.chat, `*[🌍] ADIVINA LA BANDERA:*\n* ${bandera.emoji}\n\n*[❗] RESPONDE A ESTE MENSAJE* con el nombre del país.\n*[⏱️]* 30 segundos para responder.`, m),
    alVencer: () => {
      const resumen = juegoTerminado(m.chat, null, { nombre: "banderas" });
      client.sendText(m.chat, `*[⏳] ¡Tiempo agotado!*\n\nLa respuesta era: *${bandera.pais}*\n${lineaCapital(bandera)}${resumen}`, m).catch(console.error);
    },
  });
  if (!abierto) return client.sendText(m.chat, txt.gameAlready, m);
};

plugin.before = async (m, { client }) => {
  if (!banderas[m.chat]) return;
  const juego = banderas[m.chat];

  if (!m.quoted || m.quoted.id !== juego.mensajeId) return;
  // A command quoting the question isn't an answer (lib/comandos.js), as in the riddles (plugins/fun-acertijos.js).
  if (esComando(m.text)) return;

  const respuestaUsuario = normalizar(m.text);
  if (respuestaUsuario === normalizar(juego.pais)) {
    const resumen = juegoTerminado(m.chat, m.sender, { nombre: "banderas" });
    const { bandera } = juego;
    client.sendText(m.chat, `${txt.gameSuccess}\n\n${bandera.emoji} *${bandera.pais}*\n${lineaCapital(bandera)}${resumen}`, m);
    clearTimeout(banderas[m.chat].timeout);
    delete banderas[m.chat];
  } else {
    m.react("❌");
  }
};

export default plugin;
