// The arithmetic behind .calc. It used to eval() what people typed, behind a character whitelist: safe as it stood, but
// a single character added to that list later would have turned it into running code on the tablet. This evaluator
// only understands numbers, + - * / ** ^ % ( ) and "de", with the usual precedence, and never runs anything.
//
// Grammar, from the loosest binding to the tightest:
//   expresion := termino (("+" | "-") termino)*
//   termino   := factor (("*" | "/") factor | "de" factor)*    "de" only right after a percentage
//   factor    := ("+" | "-") factor | potencia
//   potencia  := porciento (("**" | "^") factor)?             right-associative: 2 ^ 3 ^ 2 is 2 ^ 9
//   porciento := primario "%"?
//   primario  := numero | "(" expresion ")"
// Unlike JavaScript, -2 ** 2 is -(2 ** 2) instead of a syntax error, which is what anyone typing it means.
//
// Percentages go as on a phone's calculator: 10% is 0.1, and 1500 * 10% is 150, but a percentage added or taken away
// on its own is a share of what comes before it: 1500 + 10% is 1650 and 1500 - 20% is 1200. "de" follows one, as it's
// said: 20% de 1500 is 300.

// What evaluar can't give a result for, though the text is a sum it understands: motivo is "cero" (dividing by zero, or
// zero to a negative power), "grande" (a number, or a step of the sum, past what a double holds: Infinity, and then an
// Infinity minus another was NaN) or "negativa" (a negative number to a power with decimals, which has no real value).
export class ErrorDeCuenta extends Error {
  constructor(motivo) {
    super(motivo);
    this.motivo = motivo;
  }
}

// Throws ErrorDeCuenta for the three above, and a plain Error when the text isn't a sum it understands. Returns a
// finite number.
export function evaluar(texto) {
  const tokens = String(texto).match(/\d+\.?\d*|\.\d+|\*\*|de|[+\-*/()^%]|\S/g) || [];
  let i = 0;
  const mirar = () => tokens[i];
  const tomar = (esperado) => {
    if (esperado !== undefined && tokens[i] !== esperado) throw new Error(`esperaba "${esperado}"`);
    return tokens[i++];
  };
  const finito = (valor) => {
    if (!Number.isFinite(valor)) throw new ErrorDeCuenta("grande");
    return valor;
  };

  // Each step from porciento to termino hands back its value and whether it's a percentage on its own: 10%, -10% or
  // (5 + 5)%, but not 10% * 2 nor 2 ^ 10%.
  function primario() {
    const t = mirar();
    if (t === "(") {
      tomar("(");
      const valor = expresion();
      tomar(")");
      return valor;
    }
    if (t !== undefined && /^(\d+\.?\d*|\.\d+)$/.test(t)) return finito(Number(tomar()));
    throw new Error(t === undefined ? "falta un número" : `no entiendo "${t}"`);
  }
  function porciento() {
    const valor = primario();
    if (mirar() !== "%") return { valor, porcentaje: false };
    tomar("%");
    return { valor: valor / 100, porcentaje: true };
  }
  function potencia() {
    const base = porciento();
    if (mirar() !== "**" && mirar() !== "^") return base;
    tomar();
    const exponente = factor().valor;
    if (base.valor === 0 && exponente < 0) throw new ErrorDeCuenta("cero");
    if (base.valor < 0 && !Number.isInteger(exponente)) throw new ErrorDeCuenta("negativa");
    return { valor: finito(base.valor ** exponente), porcentaje: false };
  }
  function factor() {
    if (mirar() === "-") {
      tomar();
      const { valor, porcentaje } = factor();
      return { valor: -valor, porcentaje };
    }
    if (mirar() === "+") {
      tomar();
      return factor();
    }
    return potencia();
  }
  function termino() {
    let { valor, porcentaje } = factor();
    let ultimoEsPorcentaje = porcentaje;
    while (mirar() === "*" || mirar() === "/" || (mirar() === "de" && ultimoEsPorcentaje)) {
      const operador = tomar();
      const derecho = factor();
      if (operador === "/" && derecho.valor === 0) throw new ErrorDeCuenta("cero");
      valor = finito(operador === "/" ? valor / derecho.valor : valor * derecho.valor);
      ultimoEsPorcentaje = derecho.porcentaje;
      porcentaje = false;
    }
    return { valor, porcentaje };
  }
  function expresion() {
    let { valor } = termino();
    while (mirar() === "+" || mirar() === "-") {
      const operador = tomar();
      const derecho = termino();
      const sumando = derecho.porcentaje ? valor * derecho.valor : derecho.valor;
      valor = finito(operador === "+" ? valor + sumando : valor - sumando);
    }
    return valor;
  }

  if (!tokens.length) throw new Error("no hay cuenta");
  const resultado = expresion();
  if (i < tokens.length) throw new Error(`sobra "${tokens[i]}"`);
  return resultado;
}

// What people type, as evaluar reads it: without spaces ("1 500" is 1500, as it always was), in lowercase for the "de",
// and with the signs a phone's keyboard gives: × and x multiply, ÷ divides and − (U+2212) takes away.
export function normalizar(texto) {
  return String(texto).replace(/\s+/g, "").toLowerCase().replace(/[x×]/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
}

// A result as .calc shows it, with a dot for the decimals, as they're typed, and no thousands separator. Rounded to 15
// significant digits, which takes away what binary leaves over (0.1 + 0.2 came out 0.30000000000000004) and keeps every
// integer under a quadrillion whole; from there up, and under a millionth, as a power of ten, "1.5 × 10^21", which
// .calc reads back as it is. JavaScript wrote those as "1.5e+21".
export function mostrar(n) {
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) {
    const [mantisa, exponente] = n.toExponential(14).split("e");
    return `${Number(mantisa)} × 10^${Number(exponente)}`;
  }
  return String(Number(n.toPrecision(15)));
}
