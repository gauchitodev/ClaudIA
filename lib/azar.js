// Pick a random item from a list. Each plugin used to carry its own copy of this, or used the getRandom that
// wa-socket.js bolted onto Array's prototype.
export const elegirAlAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];

// Return a shuffled copy of a list (Fisher–Yates), leaving the original untouched.
export const mezclar = (lista) => {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
};
