// Ta-te-ti sobre bits: cada jugador tiene un tablero de 9 bits y la combinación de los dos es el estado.
class TicTacToe {
  #x = 0;
  #o = 0;
  #currentTurn = false; // false: juega X · true: juega O

  constructor(playerX = "x", playerO = "o") {
    this.playerX = playerX;
    this.playerO = playerO;
    this.turns = 0;
  }

  get board() {
    return this.#x | this.#o;
  }

  get currentTurn() {
    return this.#currentTurn ? this.playerO : this.playerX;
  }

  get enemyTurn() {
    return this.#currentTurn ? this.playerX : this.playerO;
  }

  // true cuando le toca a O. Se puede fijar desde afuera: al rendirse alguien, el plugin lo deja apuntando al que sigue.
  get oTurn() {
    return this.#currentTurn;
  }

  set oTurn(valor) {
    this.#currentTurn = Boolean(valor);
  }

  static check(state) {
    for (const combo of [7, 56, 73, 84, 146, 273, 292, 448]) {
      if ((state & combo) === combo) return true;
    }
    return false;
  }

  /**
   * ```js
   * TicTacToe.toBinary(1, 2) // 0b010000000
   * ```
   */
  static toBinary(x = 0, y = 0) {
    if (x < 0 || x > 2 || y < 0 || y > 2) throw new Error("invalid position");
    return 1 << (x + 3 * y);
  }

  /**
   * @param player `0` is `X`, `1` is `O`
   *
   * - `-3` `Game Ended`
   * - `-2` `Invalid`
   * - `-1` `Invalid Position`
   * - ` 0` `Position Occupied`
   * - ` 1` `Sucess`
   * @return {-3|-2|-1|0|1}
   */
  turn(player = 0, x = 0, y) {
    if (this.board === 511) return -3;
    let pos;
    if (y == null) {
      if (x < 0 || x > 8) return -1;
      pos = 1 << x;
    } else {
      if (x < 0 || x > 2 || y < 0 || y > 2) return -1;
      pos = TicTacToe.toBinary(x, y);
    }
    if (this.#currentTurn ^ player) return -2;
    if (this.board & pos) return 0;
    if (this.#currentTurn) this.#o |= pos;
    else this.#x |= pos;
    this.#currentTurn = !this.#currentTurn;
    this.turns++;
    return 1;
  }

  /**
   * @return {('X'|'O'|1|2|3|4|5|6|7|8|9)[]}
   */
  static render(boardX = 0, boardO = 0) {
    const x = parseInt(boardX.toString(2), 4);
    const y = parseInt(boardO.toString(2), 4) * 2;
    return [...(x + y).toString(4).padStart(9, "0")].reverse().map((value, index) => (value === "1" ? "X" : value === "2" ? "O" : index + 1));
  }

  /**
   * @return {('X'|'O'|1|2|3|4|5|6|7|8|9)[]}
   */
  render() {
    return TicTacToe.render(this.#x, this.#o);
  }

  get winner() {
    const x = TicTacToe.check(this.#x);
    const o = TicTacToe.check(this.#o);
    return x ? this.playerX : o ? this.playerO : false;
  }
}

export default TicTacToe;
