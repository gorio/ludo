/* =====================================================
   LUDO ENGINE — lógica completa do jogo
===================================================== */

const LUDO_COLORS   = ['red', 'blue', 'green', 'yellow'];
const LUDO_NAMES    = { red:'Vermelho', blue:'Azul', green:'Verde', yellow:'Amarelo' };
const PIECES_PER    = 4;
const BOARD_STEPS   = 52;

/*
  Trilha principal: 52 casas (índice 0–51)
  Cada cor entra na trilha em um ponto diferente:
    red   → entra na casa 0
    blue  → entra na casa 13
    green → entra na casa 26
    yellow→ entra na casa 39

  Cada cor tem um corredor final de 6 casas (índice 0–5 dentro do array finalTrack).
  Uma peça completa a partida quando finalTrack[5] é atingida e depois avança 1 (posição 6 = casa final).

  Estado de uma peça:
    { state: 'home' | 'board' | 'final' | 'done',
      pos: número (board=0–51, final=0–5) }
*/

const ENTRY_POS = { red: 0, blue: 13, green: 26, yellow: 39 };
const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47]; // casas seguras no tabuleiro
const FINAL_START_OFFSET = 50; // quantas casas antes do entry a trilha final começa
// A trilha final de cada cor começa 1 casa antes da entrada de volta:
// red: após casa 50 (índice 50 = 1 casa antes de 51→0)
// O acesso ao corredor final ocorre quando a peça está na posição (entry - 1 + 52) % 52
// e rola para avançar para dentro do corredor.
// Posição de acesso ao corredor final (última casa antes do corredor):
const FINAL_ENTRY = { red: 51, blue: 12, green: 25, yellow: 38 };

class LudoEngine {
  constructor() {
    this.reset();
  }

  reset() {
    // pieces[color] = array de 4 peças
    this.pieces = {};
    LUDO_COLORS.forEach(color => {
      this.pieces[color] = Array.from({ length: PIECES_PER }, () => ({
        state: 'home',
        pos: 0
      }));
    });

    this.players      = [];   // cores ativas nesta partida
    this.currentTurn  = 0;    // índice em this.players
    this.diceValue    = null;
    this.diceRolled   = false;
    this.consecutiveSixes = 0;
    this.status       = 'waiting'; // waiting | playing | finished
    this.winner       = null;
    this.extraTurn    = false;
    this.moveHistory  = [];
  }

  /* Configura quais cores participam */
  setup(players) {
    this.reset();
    this.players = [...players];
    this.status  = 'playing';
    this.currentTurn = 0;
  }

  get activeColor() {
    return this.players[this.currentTurn];
  }

  /* Rola o dado — retorna o valor */
  rollDice() {
    if (this.diceRolled) return this.diceValue;
    this.diceValue  = Math.floor(Math.random() * 6) + 1;
    this.diceRolled = true;
    this.extraTurn  = false;

    // Verifica se há algum movimento válido
    const moves = this.getValidMoves();
    if (moves.length === 0) {
      // Sem movimentos: passa a vez automaticamente
      this.nextTurn();
    }

    return this.diceValue;
  }

  /* Retorna lista de peças que podem mover */
  getValidMoves() {
    if (!this.diceRolled) return [];
    const color  = this.activeColor;
    const dice   = this.diceValue;
    const result = [];

    this.pieces[color].forEach((piece, idx) => {
      if (piece.state === 'done') return;

      if (piece.state === 'home') {
        if (dice === 6) result.push(idx); // só sai de casa com 6
        return;
      }

      if (piece.state === 'board') {
        const newPos = this.boardAdvance(color, piece.pos, dice);
        if (newPos !== null) result.push(idx);
        return;
      }

      if (piece.state === 'final') {
        const newFinal = piece.pos + dice;
        if (newFinal <= 5) result.push(idx);
        return;
      }
    });

    return result;
  }

  /* Calcula nova posição no tabuleiro, retorna null se não cabe */
  boardAdvance(color, pos, steps) {
    // Verifica se a peça entra no corredor final durante o avanço
    const finalEntry = FINAL_ENTRY[color];
    let cur = pos;
    for (let s = 0; s < steps; s++) {
      if (cur === finalEntry) {
        // Próximos passos vão para o corredor final
        const stepsInFinal = steps - s - 1;
        if (stepsInFinal <= 5) return { toFinal: stepsInFinal };
        return null; // não cabe no corredor
      }
      cur = (cur + 1) % BOARD_STEPS;
    }
    return { toBoard: cur };
  }

  /* Move uma peça pelo índice */
  move(pieceIdx) {
    if (!this.diceRolled) return false;
    const color = this.activeColor;
    const piece = this.pieces[color][pieceIdx];
    const dice  = this.diceValue;
    let captured = false;
    let enteredFinal = false;
    let finished = false;

    if (piece.state === 'home' && dice === 6) {
      piece.state = 'board';
      piece.pos   = ENTRY_POS[color];
      this.extraTurn = true;
      // Captura na entrada?
      captured = this._checkCapture(color, piece.pos);

    } else if (piece.state === 'board') {
      const result = this.boardAdvance(color, piece.pos, dice);
      if (!result) return false;

      if (result.toFinal !== undefined) {
        piece.state = 'final';
        piece.pos   = result.toFinal;
        enteredFinal = true;
        if (piece.pos === 5) {
          piece.state = 'done';
          finished = true;
        }
      } else {
        piece.pos = result.toBoard;
        captured = this._checkCapture(color, piece.pos);
      }

    } else if (piece.state === 'final') {
      const newPos = piece.pos + dice;
      if (newPos > 5) return false;
      piece.pos = newPos;
      if (piece.pos === 5) {
        piece.state = 'done';
        finished = true;
      }
    } else {
      return false;
    }

    // Regra do 6: turno extra
    if (dice === 6) this.extraTurn = true;
    if (captured)   this.extraTurn = true;

    this.moveHistory.push({
      color, pieceIdx, dice,
      state: piece.state, pos: piece.pos,
      captured, enteredFinal, finished
    });

    this.diceRolled = false;
    this.diceValue  = null;

    // Verifica vencedor
    if (this._checkWinner()) {
      this.status = 'finished';
      this.winner = color;
      return true;
    }

    if (!this.extraTurn) {
      this.nextTurn();
    }

    return true;
  }

  /* Captura peças de outras cores na mesma casa (exceto casas seguras) */
  _checkCapture(color, pos) {
    if (SAFE_SQUARES.includes(pos)) return false;
    let captured = false;
    LUDO_COLORS.forEach(otherColor => {
      if (otherColor === color) return;
      if (!this.players.includes(otherColor)) return;
      this.pieces[otherColor].forEach(piece => {
        if (piece.state === 'board' && piece.pos === pos) {
          piece.state = 'home';
          piece.pos   = 0;
          captured = true;
        }
      });
    });
    return captured;
  }

  /* Verifica se a cor ativa completou todas as peças */
  _checkWinner() {
    const color = this.activeColor;
    return this.pieces[color].every(p => p.state === 'done');
  }

  /* Avança para o próximo turno */
  nextTurn() {
    this.extraTurn      = false;
    this.diceRolled     = false;
    this.diceValue      = null;
    this.consecutiveSixes = 0;
    this.currentTurn    = (this.currentTurn + 1) % this.players.length;
  }

  /* Posição visual de uma peça no tabuleiro (relativa à trilha de 52) */
  absolutePos(color, piece) {
    if (piece.state === 'home' || piece.state === 'done') return null;
    if (piece.state === 'final') return { type: 'final', pos: piece.pos };
    return { type: 'board', pos: piece.pos };
  }

  /* Serializa para Firebase */
  serialize() {
    return {
      pieces:    JSON.parse(JSON.stringify(this.pieces)),
      players:   [...this.players],
      turn:      this.currentTurn,
      diceValue: this.diceValue,
      diceRolled:this.diceRolled,
      extraTurn: this.extraTurn,
      status:    this.status,
      winner:    this.winner
    };
  }

  /* Deserializa do Firebase */
  deserialize(data) {
    if (!data) return;
    this.pieces    = JSON.parse(JSON.stringify(data.pieces));
    this.players   = [...data.players];
    this.currentTurn = data.turn || 0;
    this.diceValue = data.diceValue || null;
    this.diceRolled= data.diceRolled || false;
    this.extraTurn = data.extraTurn  || false;
    this.status    = data.status     || 'playing';
    this.winner    = data.winner     || null;
  }
}