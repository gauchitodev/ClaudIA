// Pick a random item from a list. Each plugin used to carry its own copy of this, or used the getRandom that
// wa-socket.js bolted onto Array's prototype.
export const elegirAlAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];
