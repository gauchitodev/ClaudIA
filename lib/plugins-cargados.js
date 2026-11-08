// The plugins loaded, by file name: load-functions.js fills it as the bot starts (loadPlugins) and swaps one each time
// its file changes (recargarPlugin). handle-message.js runs them, lib/comandos.js tells a command by them, and the
// menus and .estado list them. It was the last thing the bot kept on globalThis.
//
// No imports and nothing done on load: lib/comandos.js imports it, and start-process.js loads that one too, through
// lib/contexto-chat.js.
export const cargados = { plugins: {} };
