// Elegir un elemento al azar de una lista. Antes cada plugin tenía su propia copia de esto, o usaba el getRandom
// que wa-socket.js le agregaba al prototipo de Array.
export const elegirAlAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];
