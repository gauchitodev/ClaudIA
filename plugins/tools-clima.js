import axios from "axios";

let plugin = {};
plugin.cmd = ["clima", "tiempo"];
plugin.botAdmin = true;

plugin.run = async (m, { client, args, text }) => {
  if (!args[0]) return client.sendText(m.chat, txt.climaNull, m);
  if (!globalThis.openWeatherApiKey) return client.sendText(m.chat, "Falta configurar la API key de OpenWeather en config.toml (openWeatherApiKey).", m);
  try {
    // Antes se interpolaba el array args ("Buenos,Aires") y OpenWeather lo leía como ciudad + país.
    const response = axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(text)}&units=metric&appid=${globalThis.openWeatherApiKey}`);
    const res = await response;
    const name = res.data.name;
    const Country = res.data.sys.country;
    const Weather = res.data.weather[0].description;
    const Temperature = res.data.main.temp + "°C";
    const Minimum_Temperature = res.data.main.temp_min + "°C";
    const Maximum_Temperature = res.data.main.temp_max + "°C";
    const Humidity = res.data.main.humidity + "%";
    const Wind = res.data.wind.speed + "km/h";
    const wea = `「 📍 」𝙻𝚄𝙶𝙰𝚁: ${name}\n「 🗺️ 」𝙿𝙰𝙸𝚂: ${Country}\n「 🌤️ 」𝚃𝙸𝙴𝙼𝙿𝙾: ${Weather}\n「 🌡️ 」𝚃𝙴𝙼𝙿𝙴𝚁𝙰𝚃𝚄𝚁𝙰: ${Temperature}\n「 💠 」 𝚃𝙴𝙼𝙿𝙴𝚁𝙰𝚃𝚄𝚁𝙰 𝙼𝙸𝙽𝙸𝙼𝙰: ${Minimum_Temperature}\n「 📛 」 𝚃𝙴𝙼𝙿𝙴𝚁𝙰𝚃𝚄𝚁𝙰 𝙼𝙰𝚇𝙸𝙼𝙰: ${Maximum_Temperature}\n「 💦 」𝙷𝚄𝙼𝙴𝙳𝙰𝙳: ${Humidity}\n「 🌬️ 」 𝚅𝙸𝙴𝙽𝚃𝙾: ${Wind}`;
    client.sendText(m.chat, wea, m);
  } catch (e) {
    console.log("[clima]", e.message);
    await client.sendText(m.chat, "No encontré el clima para ese lugar. Probá con el formato ciudad, país.", m);
  }
};

export default plugin;
