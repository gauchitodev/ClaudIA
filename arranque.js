import { cargarConfiguracion } from "./lib/configuracion.js";

// What has to happen before anything else is loaded: main.js imports this file first. It was globals.js, while the
// settings were globals.

// The bot's clock is Uruguay's unless the environment sets TZ: the daily rounds, the trivia window, the birthdays and
// the weekly and monthly closings all go by the process's time zone, and nothing used to set it, so it was whatever
// the tablet's environment handed Node. Setting it at runtime resets Node's time zone cache (since v13).
process.env.TZ ||= "America/Montevideo";

// config.toml and the version, into lib/configuracion.js, which each file that needs a setting imports. They were
// globals set here, read off globalThis by some twenty files, and each test set up the ones its files read; so were
// the bot's texts (txt, imported now from lib/strings.js), which 91 files read.
cargarConfiguracion();
