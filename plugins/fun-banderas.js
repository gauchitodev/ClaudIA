import { juegoIniciado, juegoTerminado } from "../lib/urucoins.js";
import { elegirAlAzar } from "../lib/azar.js";
const plugin = {};
plugin.cmd = ["adivinabandera", "bandera", "banderas"];
plugin.juego = true;
plugin.botAdmin = true;

const banderasLista = [
  { emoji: "🇦🇫", pais: "afganistán" },
  { emoji: "🇦🇱", pais: "albania" },
  { emoji: "🇩🇿", pais: "argelia" },
  { emoji: "🇦🇩", pais: "andorra" },
  { emoji: "🇦🇴", pais: "angola" },
  { emoji: "🇦🇬", pais: "antigua y barbuda" },
  { emoji: "🇦🇷", pais: "argentina" },
  { emoji: "🇦🇲", pais: "armenia" },
  { emoji: "🇦🇺", pais: "australia" },
  { emoji: "🇦🇹", pais: "austria" },
  { emoji: "🇦🇿", pais: "azerbaiyán" },
  { emoji: "🇧🇸", pais: "bahamas" },
  { emoji: "🇧🇭", pais: "baréin" },
  { emoji: "🇧🇩", pais: "bangladés" },
  { emoji: "🇧🇧", pais: "barbados" },
  { emoji: "🇧🇾", pais: "bielorrusia" },
  { emoji: "🇧🇪", pais: "bélgica" },
  { emoji: "🇧🇿", pais: "belice" },
  { emoji: "🇧🇯", pais: "benín" },
  { emoji: "🇧🇹", pais: "bután" },
  { emoji: "🇧🇴", pais: "bolivia" },
  { emoji: "🇧🇦", pais: "bosnia y herzegovina" },
  { emoji: "🇧🇼", pais: "botsuana" },
  { emoji: "🇧🇷", pais: "brasil" },
  { emoji: "🇧🇳", pais: "brunéi" },
  { emoji: "🇧🇬", pais: "bulgaria" },
  { emoji: "🇧🇫", pais: "burkina faso" },
  { emoji: "🇧🇮", pais: "burundi" },
  { emoji: "🇨🇻", pais: "cabo verde" },
  { emoji: "🇰🇭", pais: "camboya" },
  { emoji: "🇨🇲", pais: "camerún" },
  { emoji: "🇨🇦", pais: "canadá" },
  { emoji: "🇶🇦", pais: "catar" },
  { emoji: "🇹🇩", pais: "chad" },
  { emoji: "🇨🇱", pais: "chile" },
  { emoji: "🇨🇳", pais: "china" },
  { emoji: "🇨🇾", pais: "chipre" },
  { emoji: "🇨🇴", pais: "colombia" },
  { emoji: "🇰🇲", pais: "comoras" },
  { emoji: "🇨🇬", pais: "congo" },
  { emoji: "🇨🇩", pais: "república democrática del congo" },
  { emoji: "🇰🇵", pais: "corea del norte" },
  { emoji: "🇰🇷", pais: "corea del sur" },
  { emoji: "🇨🇮", pais: "costa de marfil" },
  { emoji: "🇨🇷", pais: "costa rica" },
  { emoji: "🇭🇷", pais: "croacia" },
  { emoji: "🇨🇺", pais: "cuba" },
  { emoji: "🇩🇰", pais: "dinamarca" },
  { emoji: "🇩🇲", pais: "dominica" },
  { emoji: "🇪🇨", pais: "ecuador" },
  { emoji: "🇪🇬", pais: "egipto" },
  { emoji: "🇸🇻", pais: "el salvador" },
  { emoji: "🇦🇪", pais: "emiratos árabes unidos" },
  { emoji: "🇪🇷", pais: "eritrea" },
  { emoji: "🇸🇰", pais: "eslovaquia" },
  { emoji: "🇸🇮", pais: "eslovenia" },
  { emoji: "🇪🇸", pais: "españa" },
  { emoji: "🇺🇸", pais: "estados unidos" },
  { emoji: "🇪🇪", pais: "estonia" },
  { emoji: "🇸🇿", pais: "esuatini" },
  { emoji: "🇪🇹", pais: "etiopía" },
  { emoji: "🇫🇯", pais: "fiyi" },
  { emoji: "🇵🇭", pais: "filipinas" },
  { emoji: "🇫🇮", pais: "finlandia" },
  { emoji: "🇫🇷", pais: "francia" },
  { emoji: "🇬🇦", pais: "gabón" },
  { emoji: "🇬🇲", pais: "gambia" },
  { emoji: "🇬🇪", pais: "georgia" },
  { emoji: "🇬🇭", pais: "ghana" },
  { emoji: "🇬🇷", pais: "grecia" },
  { emoji: "🇬🇩", pais: "granada" },
  { emoji: "🇬🇹", pais: "guatemala" },
  { emoji: "🇬🇳", pais: "guinea" },
  { emoji: "🇬🇼", pais: "guinea-bisáu" },
  { emoji: "🇬🇶", pais: "guinea ecuatorial" },
  { emoji: "🇬🇾", pais: "guyana" },
  { emoji: "🇭🇹", pais: "haití" },
  { emoji: "🇭🇳", pais: "honduras" },
  { emoji: "🇭🇺", pais: "hungría" },
  { emoji: "🇮🇳", pais: "india" },
  { emoji: "🇮🇩", pais: "indonesia" },
  { emoji: "🇮🇷", pais: "irán" },
  { emoji: "🇮🇶", pais: "irak" },
  { emoji: "🇮🇪", pais: "irlanda" },
  { emoji: "🇮🇸", pais: "islandia" },
  { emoji: "🇮🇱", pais: "israel" },
  { emoji: "🇮🇹", pais: "italia" },
  { emoji: "🇯🇲", pais: "jamaica" },
  { emoji: "🇯🇵", pais: "japón" },
  { emoji: "🇯🇴", pais: "jordania" },
  { emoji: "🇰🇿", pais: "kazajistán" },
  { emoji: "🇰🇪", pais: "kenia" },
  { emoji: "🇰🇬", pais: "kirguistán" },
  { emoji: "🇰🇮", pais: "kiribati" },
  { emoji: "🇰🇼", pais: "kuwait" },
  { emoji: "🇱🇦", pais: "laos" },
  { emoji: "🇱🇸", pais: "lesoto" },
  { emoji: "🇱🇻", pais: "letonia" },
  { emoji: "🇱🇧", pais: "líbano" },
  { emoji: "🇱🇷", pais: "liberia" },
  { emoji: "🇱🇾", pais: "libia" },
  { emoji: "🇱🇮", pais: "liechtenstein" },
  { emoji: "🇱🇹", pais: "lituania" },
  { emoji: "🇱🇺", pais: "luxemburgo" },
  { emoji: "🇲🇬", pais: "madagascar" },
  { emoji: "🇲🇾", pais: "malasia" },
  { emoji: "🇲🇼", pais: "malaui" },
  { emoji: "🇲🇻", pais: "maldivas" },
  { emoji: "🇲🇱", pais: "malí" },
  { emoji: "🇲🇹", pais: "malta" },
  { emoji: "🇲🇭", pais: "islas marshall" },
  { emoji: "🇲🇷", pais: "mauritania" },
  { emoji: "🇲🇺", pais: "mauricio" },
  { emoji: "🇲🇽", pais: "méxico" },
  { emoji: "🇫🇲", pais: "micronesia" },
  { emoji: "🇲🇩", pais: "moldavia" },
  { emoji: "🇲🇨", pais: "mónaco" },
  { emoji: "🇲🇳", pais: "mongolia" },
  { emoji: "🇲🇪", pais: "montenegro" },
  { emoji: "🇲🇦", pais: "marruecos" },
  { emoji: "🇲🇿", pais: "mozambique" },
  { emoji: "🇲🇲", pais: "myanmar" },
  { emoji: "🇳🇦", pais: "namibia" },
  { emoji: "🇳🇷", pais: "nauru" },
  { emoji: "🇳🇵", pais: "nepal" },
  { emoji: "🇳🇮", pais: "nicaragua" },
  { emoji: "🇳🇪", pais: "níger" },
  { emoji: "🇳🇬", pais: "nigeria" },
  { emoji: "🇳🇴", pais: "noruega" },
  { emoji: "🇳🇿", pais: "nueva zelanda" },
  { emoji: "🇴🇲", pais: "omán" },
  { emoji: "🇳🇱", pais: "países bajos" },
  { emoji: "🇵🇰", pais: "pakistán" },
  { emoji: "🇵🇼", pais: "palaos" },
  { emoji: "🇵🇦", pais: "panamá" },
  { emoji: "🇵🇬", pais: "papúa nueva guinea" },
  { emoji: "🇵🇾", pais: "paraguay" },
  { emoji: "🇵🇪", pais: "perú" },
  { emoji: "🇵🇱", pais: "polonia" },
  { emoji: "🇵🇹", pais: "portugal" },
  { emoji: "🇬🇧", pais: "reino unido" },
  { emoji: "🇨🇫", pais: "república centroafricana" },
  { emoji: "🇨🇿", pais: "república checa" },
  { emoji: "🇩🇴", pais: "república dominicana" },
  { emoji: "🇷🇼", pais: "ruanda" },
  { emoji: "🇷🇴", pais: "rumania" },
  { emoji: "🇷🇺", pais: "rusia" },
  { emoji: "🇼🇸", pais: "samoa" },
  { emoji: "🇰🇳", pais: "san cristóbal y nieves" },
  { emoji: "🇸🇲", pais: "san marino" },
  { emoji: "🇱🇨", pais: "santa lucía" },
  { emoji: "🇸🇹", pais: "santo tomé y príncipe" },
  { emoji: "🇻🇨", pais: "san vicente y las granadinas" },
  { emoji: "🇸🇳", pais: "senegal" },
  { emoji: "🇷🇸", pais: "serbia" },
  { emoji: "🇸🇨", pais: "seychelles" },
  { emoji: "🇸🇱", pais: "sierra leona" },
  { emoji: "🇸🇬", pais: "singapur" },
  { emoji: "🇸🇾", pais: "siria" },
  { emoji: "🇸🇴", pais: "somalia" },
  { emoji: "🇱🇰", pais: "sri lanka" },
  { emoji: "🇿🇦", pais: "sudáfrica" },
  { emoji: "🇸🇩", pais: "sudán" },
  { emoji: "🇸🇸", pais: "sudán del sur" },
  { emoji: "🇸🇪", pais: "suecia" },
  { emoji: "🇨🇭", pais: "suiza" },
  { emoji: "🇸🇷", pais: "surinam" },
  { emoji: "🇹🇭", pais: "tailandia" },
  { emoji: "🇹🇼", pais: "taiwán" },
  { emoji: "🇹🇿", pais: "tanzania" },
  { emoji: "🇹🇯", pais: "tayikistán" },
  { emoji: "🇹🇱", pais: "timor oriental" },
  { emoji: "🇹🇬", pais: "togo" },
  { emoji: "🇹🇴", pais: "tonga" },
  { emoji: "🇹🇹", pais: "trinidad y tobago" },
  { emoji: "🇹🇳", pais: "túnez" },
  { emoji: "🇹🇷", pais: "turquía" },
  { emoji: "🇹🇲", pais: "turkmenistán" },
  { emoji: "🇹🇻", pais: "tuvalu" },
  { emoji: "🇺🇦", pais: "ucrania" },
  { emoji: "🇺🇬", pais: "uganda" },
  { emoji: "🇺🇾", pais: "uruguay" },
  { emoji: "🇺🇿", pais: "uzbekistán" },
  { emoji: "🇻🇺", pais: "vanuatu" },
  { emoji: "🇻🇦", pais: "ciudad del vaticano" },
  { emoji: "🇻🇪", pais: "venezuela" },
  { emoji: "🇻🇳", pais: "vietnam" },
  { emoji: "🇾🇪", pais: "yemen" },
  { emoji: "🇩🇯", pais: "yibuti" },
  { emoji: "🇿🇲", pais: "zambia" },
  { emoji: "🇿🇼", pais: "zimbabue" },
];

const normalizar = (texto) =>
  (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const banderas = {};

plugin.run = async (m, { client, chat }) => {
  if (banderas[m.chat]) return client.sendText(m.chat, txt.gameAlready, m);

  const bandera = elegirAlAzar(banderasLista);

  const mensajeJuego = await client.sendText(m.chat, `*[🌍] ADIVINA LA BANDERA:*\n* ${bandera.emoji}\n\n*[❗] RESPONDE A ESTE MENSAJE* con el nombre del país.\n*[⏱️]* 30 segundos para responder.`, m);

  banderas[m.chat] = {
    pais: bandera.pais.toLowerCase(),
    mensajeId: mensajeJuego.key.id,
    timeout: setTimeout(() => {
      if (banderas[m.chat]) {
        const resumen = juegoTerminado(m.chat, null);
        client.sendText(m.chat, `*[⏳] ¡Tiempo agotado!*\n\nLa respuesta era: *${bandera.pais}*${resumen}`, m).catch(console.error);
        delete banderas[m.chat];
      }
    }, 30000), // 30 segundos
  };
  juegoIniciado(m.chat, "banderas");
};

plugin.before = async (m, { client }) => {
  if (!banderas[m.chat]) return;
  const juego = banderas[m.chat];

  if (!m.quoted || m.quoted.id !== juego.mensajeId) return;

  const respuestaUsuario = normalizar(m.text);
  if (respuestaUsuario === normalizar(juego.pais)) {
    const resumen = juegoTerminado(m.chat, m.sender);
    client.sendText(m.chat, txt.gameSuccess + resumen, m);
    clearTimeout(banderas[m.chat].timeout);
    delete banderas[m.chat];
  } else {
    m.react("❌");
  }
};

export default plugin;
