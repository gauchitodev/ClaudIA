// State a plugin keeps while the bot runs and that has to outlive a reload of its file: load-functions.js imports the
// file again as a new module when it changes, and a variable of the plugin starts over. An open round was lost that
// way: the new module didn't see it, its answers went unheard, and only the old module's timer still closed it. And a
// .cancelar found no .llamar going on while the old one's calls kept coming.
// A lib/ module isn't reloaded, so what a plugin keeps here, under its name, is the same object every time, and none of
// it goes on globalThis.
const estados = new Map();

// The state under that name, made with crear() the first time it's asked for.
export function estadoDe(nombre, crear) {
  if (!estados.has(nombre)) estados.set(nombre, crear());
  return estados.get(nombre);
}
