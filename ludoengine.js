/* =====================================================
   LUDO ENGINE — lógica completa do jogo
===================================================== */

const LUDO_COLORS = ['red', 'blue', 'green', 'yellow'];
// tradução para exibição, mas o motor usa as strings 'red', 'blue', etc.
const COLOR_TRANSLATIONS = {
  red: 'Vermelho', blue: 'Azul', green: 'Verde', yellow: 'Amarelo'
};

const PIECES_PER = 4; // Ludo tem 4 peças por jogador
const BOARD_STEPS = 52; // Número de casas no caminho principal
// Posições de entrada no caminho principal para cada cor
const ENTRY_POS = { red: 0, blue: 13, green: 26, yellow: 39 };

// Casas seguras no tabuleiro principal (índices da PATH_COORDS)
// Estes são os índices de PATH_COORDS (0-51)
const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

// Posição no tabuleiro principal ANTES de entrar no corredor final
const FINAL_ENTRY_BOARD_POS = { red: 50, blue: 11, green: 24, yellow: 37 }; // Corrigido para corresponder aos índices do PATH_COORDS

class LudoEngine {
  constructor() {
    this.reset();
  }

  // Reinicia o estado do jogo
  reset() {
    this.players = []; // [{ id, name, color, isAI, pawns: [{pos, homeStep, finished}], score }]
    this.currentTurn = 0; // Índice do jogador atual no array 'players'
    this.diceValue = 0; // Valor atual do dado
    this.phase = 'roll'; // 'roll' (rolar o dado) | 'move' (mover peça)
    this.status = 'waiting'; // 'waiting' | 'playing' | 'finished' | 'resigned'
    this.winner = null; // Cor do jogador vencedor
    this.extraTurn = false; // Indica se o jogador ganhou um turno extra
    this.log = []; // Histórico de eventos do jogo
    this.PIECES_PER = PIECES_PER; // Garante que a constante esteja disponível na instância
  }

  // Configura os jogadores para uma nova partida
  setup(playersConfig) {
    this.reset();
    this.players = playersConfig.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isAI: p.isAI,
      pawns: Array.from({ length: this.PIECES_PER }, () => ({
        pos: -1, // -1: na base, 0-51: no tabuleiro principal, -2: no corredor final
        homeStep: -1, // -1: não no corredor final, 0-5: passo no corredor final (para -2)
        finished: false // true: chegou ao centro
      })),
      score: 0 // Quantidade de peças no centro
    }));
    this.status = 'playing';
    this.currentTurn = 0;
    this.logEvent('Partida iniciada!', 'neutral'); // Loga o início da partida
  }

  // Retorna o objeto do jogador cujo turno é atual
  get activePlayer() {
    return this.players[this.currentTurn];
  }

  // Rola o dado para o jogador ativo
  rollDice() {
    if (this.phase !== 'roll') {
      this.logEvent('Não é hora de rolar o dado.', 'warning');
      return false;
    }

    this.diceValue = Math.floor(Math.random() * 6) + 1;
    this.extraTurn = false; // Reseta o flag de turno extra a cada nova rolagem

    this.logEvent(`${this.activePlayer.name} rolou um ${this.diceValue}.`, this.activePlayer.color);

    const validMoves = this.getValidMoves();

    if (validMoves.length === 0) {
      this.logEvent(`${this.activePlayer.name} não tem movimentos válidos.`, 'orange');
      this.nextTurn(); // Passa a vez automaticamente se não houver movimentos
      return false; // Indica que não houve movimento válido
    }

    this.phase = 'move'; // Entra na fase de mover peça
    return true; // Indica que há movimentos válidos
  }

  // Obtém os índices dos peões que o jogador ativo pode mover com o dado atual
  getValidMoves() {
    const player = this.activePlayer;
    const dice = this.diceValue;
    const validPawns = [];

    player.pawns.forEach((pawn, idx) => {
      // Peça na base
      if (pawn.pos === -1) {
        if (dice === 6) { // Só pode sair da base com um 6
          validPawns.push(idx);
        }
      }
      // Peça no tabuleiro principal
      else if (pawn.pos !== -1 && pawn.homeStep === -1) {
        const currentBoardPos = pawn.pos;
        const newBoardPos = currentBoardPos + dice;

        // Verifica se a peça entra no corredor final
        if (newBoardPos >= FINAL_ENTRY_BOARD_POS[player.color] && currentBoardPos < FINAL_ENTRY_BOARD_POS[player.color]) {
          const stepsIntoFinal = newBoardPos - FINAL_ENTRY_BOARD_POS[player.color] -1;
           // O peão precisa ter a cor correta para entrar no seu corredor final
           // A posição 50 do tabuleiro principal é o passo 0 do corredor final de RED
           // A posição 11 do tabuleiro principal é o passo 0 do corredor final de BLUE
           // ...
          if (stepsIntoFinal < 6) { // Pode entrar no corredor final
            validPawns.push(idx);
          }
        }
        // Permanece no tabuleiro principal (não passou do limite)
        else if (newBoardPos < BOARD_STEPS) {
          validPawns.push(idx);
        }
        else if (newBoardPos === BOARD_STEPS + (ENTRY_POS[player.color])) { // Se a peça der a volta completa e parar na "saída" do loop
            validPawns.push(idx);
        }
      }
      // Peça no corredor final
      else if (pawn.homeStep !== -1) {
        const newHomeStep = pawn.homeStep + dice;
        if (newHomeStep < 6) { // Não pode passar do final do corredor
          validPawns.push(idx);
        }
      }
    });

    return validPawns;
  }

  // Move uma peça específica (pelo índice do peão)
  movePawn(pawnIdx) {
    if (this.phase !== 'move') {
      this.logEvent('Não é a fase de mover peças.', 'warning');
      return false;
    }

    const player = this.activePlayer;
    const pawn = player.pawns[pawnIdx];
    const dice = this.diceValue;
    let moved = false;
    let captured = false;

    // Ações baseadas na posição do peão
    if (pawn.pos === -1 && dice === 6) { // Peça na base, rola 6: sai da base
      pawn.pos = ENTRY_POS[player.color];
      this.logEvent(`${player.name} tirou a peça ${pawnIdx + 1} da base.`, player.color);
      captured = this._checkCapture(player.color, pawn.pos); // Verifica captura ao sair da base
      moved = true;
    } else if (pawn.homeStep !== -1) { // Peça no corredor final
      const newHomeStep = pawn.homeStep + dice;
      if (newHomeStep < 6) { // Se não ultrapassar o final
        pawn.homeStep = newHomeStep;
        this.logEvent(`${player.name} moveu a peça ${pawnIdx + 1} no corredor final.`, player.color);
        moved = true;
        if (pawn.homeStep === 5) { // Chegou ao centro!
          pawn.finished = true;
          player.score++;
          this.logEvent(`${player.name} levou a peça ${pawnIdx + 1} para o centro!`, player.color);
          this.extraTurn = true; // Ganha turno extra ao finalizar peça
        }
      }
    } else if (pawn.pos !== -1) { // Peça no tabuleiro principal
      const currentBoardPos = pawn.pos;
      const finalEntryPos = FINAL_ENTRY_BOARD_POS[player.color];
      let newBoardPos = (currentBoardPos + dice);

      // Peça entra no corredor final
      if (newBoardPos >= finalEntryPos && currentBoardPos < finalEntryPos) {
        const stepsIntoFinal = newBoardPos - finalEntryPos - 1; // Posição no corredor (0-5)
        if (stepsIntoFinal < 6) {
          pawn.pos = -2; // Indica que está no corredor final
          pawn.homeStep = stepsIntoFinal;
          this.logEvent(`${player.name} moveu a peça ${pawnIdx + 1} para o corredor final.`, player.color);
          moved = true;
          if (pawn.homeStep === 5) { // Chegou ao centro!
            pawn.finished = true;
            player.score++;
            this.logEvent(`${player.name} levou a peça ${pawnIdx + 1} para o centro!`, player.color);
            this.extraTurn = true; // Ganha turno extra
          }
        }
      }
      // Peça permanece no tabuleiro principal
      else if (newBoardPos < BOARD_STEPS) {
        pawn.pos = newBoardPos;
        captured = this._checkCapture(player.color, pawn.pos);
        this.logEvent(`${player.name} moveu a peça ${pawnIdx + 1}.`, player.color);
        moved = true;
      }
    }

    if (!moved) {
      this.logEvent(`Movimento inválido para peça ${pawnIdx + 1}.`, 'red');
      return false;
    }

    // Regras de turno extra (se não tiver finalizado uma peça)
    if (dice === 6) this.extraTurn = true;
    if (captured) this.extraTurn = true;

    this.phase = 'roll'; // Após mover, volta para a fase de rolar o dado

    // Verifica se o jogador atual venceu
    if (this._checkWinner()) {
      this.status = 'finished';
      this.winner = player.color;
      this.logEvent(`${player.name} venceu a partida! 🏆`, player.color);
    }

    // Passa a vez se não houver turno extra
    if (!this.extraTurn && this.status !== 'finished') {
      this.nextTurn();
    } else if (this.extraTurn && this.status !== 'finished') {
      this.logEvent(`${player.name} ganhou um turno extra!`, player.color);
    }
    return true;
  }

  // Verifica e realiza a captura de peças de outras cores na mesma casa
  _checkCapture(movingColor, pos) {
    if (SAFE_SQUARES.includes(pos)) return false; // Não captura em casas seguras (estrela)

    let captured = false;
    this.players.forEach(otherPlayer => {
      // Não captura as próprias peças e ignora jogadores que não são oponentes diretos
      if (otherPlayer.color === movingColor) return;

      otherPlayer.pawns.forEach(otherPawn => {
        // Se a peça do oponente estiver na mesma posição, não estiver na base,
        // não estiver no corredor final, e não estiver finalizada.
        if (otherPawn.pos === pos && otherPawn.homeStep === -1 && !otherPawn.finished) {
          otherPawn.pos = -1; // Volta para a base
          this.logEvent(`${COLOR_TRANSLATIONS[movingColor]} capturou uma peça de ${COLOR_TRANSLATIONS[otherPlayer.color]}!`, movingColor);
          captured = true;
        }
      });
    });
    return captured;
  }

  // Passa a vez para o próximo jogador válido
  nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    this.phase = 'roll';
    this.diceValue = 0; // Zera o dado a cada novo turno
    this.extraTurn = false; // Zera o turno extra
    this.logEvent(`Vez de ${this.activePlayer.name}.`, this.activePlayer.color);
  }

  // Verifica se o jogador ativo venceu a partida (todas as peças no centro)
  _checkWinner() {
    return this.activePlayer.score === PIECES_PER;
  }

  // Adiciona um evento ao histórico de log do jogo
  logEvent(message, color = 'neutral') {
    this.log.push({
      message: message,
      color: color, // Para estilização do log (ex: cor da peça, warning, neutral)
      timestamp: Date.now()
    });
    // Mantém o log com um tamanho razoável (ex: 50 entradas)
    if (this.log.length > 50) {
      this.log.shift();
    }
  }

  // Serializa o estado do jogo para JSON (para Firebase)
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

  // Deserializa o estado do jogo de JSON (do Firebase)
  deserialize(jsonString) {
    if (!jsonString) {
      console.error("Tentativa de deserializar string vazia ou nula.");
      return;
    }
    const data = JSON.parse(jsonString);
    this.players = data.players || [];
    this.currentTurn = data.currentTurn ?? 0;
    this.diceValue = data.diceValue ?? 0;
    this.phase = data.phase || 'roll';
    this.status = data.status || 'waiting';
    this.winner = data.winner || null;
    this.extraTurn = data.extraTurn ?? false;
    this.log = data.log || [];
  }
}