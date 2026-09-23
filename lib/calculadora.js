// The arithmetic behind .calc. It used to eval() what people typed, behind a character whitelist: safe as it stood, but
// a single character added to that list later would have turned it into running code on the tablet. This evaluator
// only understands numbers and + - * / ** ( ), with the usual precedence, and never runs anything.
//
// Grammar, from the loosest binding to the tightest:
//   expresion := termino (("+" | "-") termino)*
//   termino   := factor (("*" | "/") factor)*
//   factor    := ("+" | "-") factor | potencia
//   potencia  := primario ("**" factor)?        right-associative: 2 ** 3 ** 2 is 2 ** 9
//   primario  := numero | "(" expresion ")"
// Unlike JavaScript, -2 ** 2 is -(2 ** 2) instead of a syntax error, which is what anyone typing it means.

// Throws when the text isn't an expression it understands. The result may be Infinity or NaN (1/0, 0/0).
export function evaluar(texto) {
  const tokens = String(texto).match(/\d+\.?\d*|\.\d+|\*\*|[+\-*/()]|\S/g) || [];
  let i = 0;
  const mirar = () => tokens[i];
  const tomar = (esperado) => {
    if (esperado !== undefined && tokens[i] !== esperado) throw new Error(`esperaba "${esperado}"`);
    return tokens[i++];
  };

  function primario() {
    const t = mirar();
    if (t === "(") {
      tomar("(");
      const valor = expresion();
      tomar(")");
      return valor;
    }
    if (t !== undefined && /^(\d+\.?\d*|\.\d+)$/.test(t)) return Number(tomar());
    throw new Error(t === undefined ? "falta un número" : `no entiendo "${t}"`);
  }
  function potencia() {
    const base = primario();
    if (mirar() !== "**") return base;
    tomar("**");
    return base ** factor();
  }
  function factor() {
    if (mirar() === "-") {
      tomar();
      return -factor();
    }
    if (mirar() === "+") {
      tomar();
      return factor();
    }
    return potencia();
  }
  function termino() {
    let valor = factor();
    while (mirar() === "*" || mirar() === "/") valor = tomar() === "*" ? valor * factor() : valor / factor();
    return valor;
  }
  function expresion() {
    let valor = termino();
    while (mirar() === "+" || mirar() === "-") valor = tomar() === "+" ? valor + termino() : valor - termino();
    return valor;
  }

  if (!tokens.length) throw new Error("no hay cuenta");
  const resultado = expresion();
  if (i < tokens.length) throw new Error(`sobra "${tokens[i]}"`);
  return resultado;
}
