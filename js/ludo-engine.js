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
    { pos: -1 | 0-51 | -2, // -1: na base, 0-51: no tabuleiro, -2: no corredor final
      homeStep: -1 | 0-5, // -1: não no corredor final, 0-5: passo no corredor final
      finished: false // true: chegou ao centro
    }
*/

const ENTRY_POS = { red: 0, blue: 13, green: 26, yellow: 39 };
const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47]; // casas seguras no tabuleiro
// Posição de acesso ao corredor final (última casa antes do corredor):
const FINAL_ENTRY_BOARD_POS = { red: 50, blue: 11, green: 24, yellow: 37 }; // Posição no tabuleiro antes de entrar no corredor final

class LudoEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.players = []; // { id, name, color, isAI, pawns: [{pos, homeStep, finished}], score }
    this.currentTurn = 0;
    this.diceValue = 0;
    this.phase = 'roll'; // 'roll' | 'move'
    this.status = 'waiting'; // 'waiting' | 'playing' | 'finished'
    this.winner = null;
    this.extraTurn = false;
    this.log = []; // Histórico de eventos para o log
  }

  /* Configura quais cores participam */
  setup(playersConfig) {
    this.reset();
    this.players = playersConfig.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isAI: p.isAI,
      pawns: Array.from({ length: PIECES_PER }, () => ({
        pos: -1, // -1: na base, 0-51: no tabuleiro, -2: no corredor final
        homeStep: -1, // -1: não no corredor final, 0-5: passo no corredor final
        finished: false // true: chegou ao centro
      })),
      score: 0
    }));
    this.status = 'playing';
    this.currentTurn = 0;
    this.logEvent('Partida iniciada!');
  }

  get activePlayer() {
    return this.players[this.currentTurn];
  }

  /* Rola o dado — retorna o valor */
  rollDice() {
    if (this.phase !== 'roll') return false;

    this.diceValue = Math.floor(Math.random() * 6) + 1;
    this.phase = 'move';
    this.extraTurn = false; // Reset extra turn flag

    this.logEvent(`${this.activePlayer.name} rolou ${this.diceValue}.`);

    // Verifica se há algum movimento válido
    const validMoves = this.getValidMoves();
    if (validMoves.length === 0) {
      this.logEvent(`${this.activePlayer.name} não tem movimentos válidos.`);
      this.nextTurn(); // Sem movimentos: passa a vez automaticamente
      return false; // Indica que não houve movimento válido
    }
    return true; // Indica que o dado foi rolado e há movimentos válidos
  }

  /* Retorna lista de peças que podem mover (índices 0-3) */
  getValidMoves() {
    if (this.phase !== 'move') return [];
    const player = this.activePlayer;
    const dice = this.diceValue;
    const result = [];

    player.pawns.forEach((pawn, idx) => {
      if (pawn.finished) return;

      if (pawn.pos === -1) { // Peça na base
        if (dice === 6) result.push(idx); // Só sai da base com 6
      } else if (pawn.homeStep !== -1) { // Peça no corredor final
        if (pawn.homeStep + dice <= 5) result.push(idx);
      } else { // Peça no tabuleiro principal
        const currentBoardPos = pawn.pos;
        const finalEntryPos = FINAL_ENTRY_BOARD_POS[player.color];

        // Calcula a nova posição no tabuleiro principal
        let newBoardPos = (currentBoardPos + dice);

        // Verifica se a peça entraria no corredor final
        if (currentBoardPos <= finalEntryPos && newBoardPos > finalEntryPos) {
          const stepsIntoFinal = newBoardPos - finalEntryPos - 1; // -1 porque a próxima casa já é a 0 do corredor
          if (stepsIntoFinal <= 5) result.push(idx);
        } else if (newBoardPos < BOARD_STEPS) { // Permanece no tabuleiro principal
          result.push(idx);
        }
        // Se newBoardPos >= BOARD_STEPS e não entrou no corredor final, significa que passou do final da trilha
        // e não é um movimento válido (não pode dar a volta completa)
      }
    });
    return result;
  }

  /* Move uma peça pelo índice (0-3) */
  movePawn(pawnIdx) {
    if (this.phase !== 'move') return false;
    const player = this.activePlayer;
    const pawn = player.pawns[pawnIdx];
    const dice = this.diceValue;
    let moved = false;
    let captured = false;
    let finished = false;

    if (pawn.pos === -1 && dice === 6) { // Sai da base
      pawn.pos = ENTRY_POS[player.color];
      pawn.homeStep = -1;
      this.extraTurn = true;
      this.logEvent(`${player.name} tirou uma peça da base.`);
      captured = this._checkCapture(player.color, pawn.pos);
      moved = true;
    } else if (pawn.homeStep !== -1) { // No corredor final
      const newHomeStep = pawn.homeStep + dice;
      if (newHomeStep <= 5) {
        pawn.homeStep = newHomeStep;
        if (pawn.homeStep === 5) {
          pawn.finished = true;
          player.score++;
          this.logEvent(`${player.name} levou uma peça para o centro!`);
          finished = true;
          this.extraTurn = true; // Ganha turno extra ao finalizar peça
        }
        moved = true;
      }
    } else if (pawn.pos !== -1) { // No tabuleiro principal
      const currentBoardPos = pawn.pos;
      const finalEntryPos = FINAL_ENTRY_BOARD_POS[player.color];
      let newBoardPos = (currentBoardPos + dice);

      if (currentBoardPos <= finalEntryPos && newBoardPos > finalEntryPos) {
        // Entra no corredor final
        const stepsIntoFinal = newBoardPos - finalEntryPos - 1;
        if (stepsIntoFinal <= 5) {
          pawn.pos = -2; // Indica que está no corredor final
          pawn.homeStep = stepsIntoFinal;
          this.logEvent(`${player.name} entrou no corredor final.`);
          if (pawn.homeStep === 5) {
            pawn.finished = true;
            player.score++;
            this.logEvent(`${player.name} levou uma peça para o centro!`);
            finished = true;
            this.extraTurn = true; // Ganha turno extra ao finalizar peça
          }
          moved = true;
        }
      } else if (newBoardPos < BOARD_STEPS) {
        // Permanece no tabuleiro principal
        pawn.pos = newBoardPos;
        captured = this._checkCapture(player.color, pawn.pos);
        moved = true;
      }
    }

    if (!moved) return false;

    this.logEvent(`${player.name} moveu a peça ${pawnIdx + 1}.`);

    // Regras de turno extra
    if (dice === 6) this.extraTurn = true;
    if (captured) this.extraTurn = true;

    this.phase = 'roll'; // Reseta para a fase de rolar o dado

    // Verifica vencedor
    if (this._checkWinner()) {
      this.status = 'finished';
      this.winner = player.color;
      this.logEvent(`${player.name} venceu a partida! 🏆`);
      return true;
    }

    if (!this.extraTurn) {
      this.nextTurn();
    } else {
      this.logEvent(`${player.name} ganhou um turno extra!`);
    }

    return true;
  }

  /* Captura peças de outras cores na mesma casa (exceto casas seguras) */
  _checkCapture(movingColor, pos) {
    if (SAFE_SQUARES.includes(pos)) return false; // Não captura em casas seguras

    let captured = false;
    this.players.forEach(otherPlayer => {
      if (otherPlayer.color === movingColor) return; // Não captura as próprias peças

      otherPlayer.pawns.forEach(otherPawn => {
        if (otherPawn.pos === pos && otherPawn.homeStep === -1 && !otherPawn.finished) {
          // Captura!
          otherPawn.pos = -1; // Volta para a base
          this.logEvent(`${movingColor} capturou uma peça de ${otherPlayer.color}!`);
          captured = true;
        }
      });
    });
    return captured;
  }

  /* Passa a vez para o próximo jogador */
  nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    this.phase = 'roll';
    this.diceValue = 0;
    this.extraTurn = false;
    this.logEvent(`Vez de ${this.activePlayer.name}.`);
  }

  /* Verifica se algum jogador venceu (todas as peças no centro) */
  _checkWinner() {
    return this.activePlayer.score === PIECES_PER;
  }

  /* Registra um evento no log */
  logEvent(message) {
    this.log.push({
      message: message,
      color: this.activePlayer.color,
      timestamp: Date.now()
    });
    // Manter o log com um tamanho razoável
    if (this.log.length > 50) {
      this.log.shift();
    }
  }

  /* Serializa o estado do jogo para salvar no Firebase */
  serialize() {
    return JSON.stringify({
      players: this.players,
      currentTurn: this.currentTurn,
      diceValue: this.diceValue,
      phase: this.phase,
      status: this.status,
      winner: this.winner,
      extraTurn: this.extraTurn,
      log: this.log
    });
  }

  /* Deserializa o estado do jogo do Firebase */
  deserialize(jsonString) {
    const data = JSON.parse(jsonString);
    this.players = data.players;
    this.currentTurn = data.currentTurn;
    this.diceValue = data.diceValue;
    this.phase = data.phase;
    this.status = data.status;
    this.winner = data.winner;
    this.extraTurn = data.extraTurn;
    this.log = data.log || [];
  }
}