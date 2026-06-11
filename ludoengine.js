/* =====================================================
   LUDOENGINE - Lógica do Jogo de Ludo
===================================================== */
class LudoEngine {
  constructor() {
    this.players = [];                       // Array de objetos de jogador
    this.boardState = {};                    // Representa a posição de todos os peões
    this.activePlayerIndex = 0;              // Índice do jogador atual
    this.diceValue = 0;                      // Valor do dado rolado
    this.phase = 'roll';                     // 'roll' -> 'move' -> 'roll'
    this.status = 'waiting';                 // 'waiting', 'playing', 'finished', 'resigned'
    this.winner = null;                      // ID do jogador vencedor
    this.extraTurn = false;                  // Indica se o jogador ganhou um turno extra
    this.log = [];                           // Histórico de eventos do jogo
    this.lastMovementInfo = null;            // Usado para destacar o último movimento
    this.init();
  }

  init() {
    // Inicializa o motor, mas o setup do jogo (players) é feito em setupGame
    // As constantes são acessadas via window.LUDO_CONSTANTS
  }

  /**
   * Configura o jogo com os jogadores fornecidos.
   * @param {Array<Object>} playerConfigs Array de objetos {id, name, isAI, color, photoURL}.
   */
  setupGame(playerConfigs) {
    this.players = playerConfigs.map(config => ({
      id: config.id,
      name: config.name,
      isAI: config.isAI,
      color: config.color,
      photoURL: config.photoURL || null,
      pawns: Array(window.LUDO_CONSTANTS.PIECES_PER_PLAYER).fill(0).map(() => ({
        pos: -1,         // -1: na base, 0-51: no caminho principal,
        homeStep: -1,    // -1: não no corredor final, 0-5: no corredor final
        finished: false  // true: chegou na casa central
      })),
      score: 0 // Quantas peças chegaram na casa central
    }));

    this.boardState = {}; // Limpa o estado do tabuleiro
    this.activePlayerIndex = 0;
    this.diceValue = 0;
    this.phase = 'roll';
    this.status = 'playing';
    this.winner = null;
    this.extraTurn = false;
    this.log = [];
    this.lastMovementInfo = null;

    this.logEvent('neutral', 'Partida iniciada!');
    this.logEvent(this.activePlayer.color, `É a vez de ${this.activePlayer.name} rolar o dado.`);
  }

  /**
   * Retorna o jogador ativo no turno atual.
   * @returns {Object} O objeto do jogador ativo.
   */
  get activePlayer() {
    return this.players[this.activePlayerIndex];
  }

  /**
   * Rola o dado e inicia a fase de movimento.
   */
  rollDice() {
    if (this.status !== 'playing' || this.phase !== 'roll') return;

    this.diceValue = Math.floor(Math.random() * 6) + 1;
    this.logEvent(this.activePlayer.color, `${this.activePlayer.name} rolou: ${this.diceValue}.`);

    this.phase = 'move';
    this.extraTurn = (this.diceValue === 6); // Ganha turno extra se rolar 6

    const playablePawns = this.getValidMoves();

    if (playablePawns.length === 0) {
      this.logEvent(this.activePlayer.color, `Sem movimentos válidos para ${this.activePlayer.name}.`);
      if (!this.extraTurn) { // Se rolou 6 mas não tem moves, perde o 6, mas continua o turno? Discussão Ludo Rules.
        // Pelo padrão, se rolar 6 e não tiver peças na base, pode mover outra peça.
        // Se rolou 6 e NÃO PODE mover NADA, geralmente não se ganha outro rolagem e passa a vez.
        // Para simplificar, se não há moves válidos, passa a vez.
        this.nextTurn();
      } else {
        // Se rolou 6 e não pode mover, ainda tem o turno extra para rolar. Mas não tem movimento.
        // Vamos forçar a passar a vez também para evitar loop.
        this.logEvent(this.activePlayer.color, `${this.activePlayer.name} não pode mover, mesmo com 6. Passando a vez.`);
        this.nextTurn();
      }
    } else {
      this.logEvent(this.activePlayer.color, `${this.activePlayer.name}, escolha uma peça para mover.`);
    }
  }

  /**
   * Retorna os índices das peças do jogador ativo que podem ser movidas.
   * @returns {Array<number>} Array de índices das peças jogáveis.
   */
  getValidMoves() {
    const player = this.activePlayer;
    const moves = [];

    player.pawns.forEach((pawn, index) => {
      if (pawn.finished) return;

      if (pawn.pos === -1) { // Peça está na base
        if (this.diceValue === 6) {
          moves.push(index); // Pode sair da base
        }
      } else { // Peça está no caminho principal ou home path
        // Calcula a nova posição
        const newPosInfo = this._calculateNewPosition(player, pawn, this.diceValue);

        // Verifica se o movimento é legal (não cai fora do tabuleiro final)
        if (newPosInfo.valid) {
          // Verifica se a casa de destino está ocupada pela própria peça
          const occupiedBySelf = this._isOccupiedByOwnPawn(player, newPosInfo.targetPos, newPosInfo.isHomePath, index);
          if (!occupiedBySelf) {
            moves.push(index);
          }
        }
      }
    });
    return moves;
  }

  /**
   * Move uma peça específica do jogador ativo com o valor do dado atual.
   * @param {number} pawnIndex Índice da peça a ser movida (0-3).
   * @returns {boolean} True se o movimento foi bem-sucedido, False caso contrário.
   */
  doMovePawn(pawnIndex) {
    const player = this.activePlayer;
    if (this.status !== 'playing' || this.phase !== 'move' || this.diceValue === 0) return false;
    if (!this.getValidMoves().includes(pawnIndex)) return false; // Movimento inválido

    const pawn = player.pawns[pawnIndex];
    let movementType = 'move'; // 'move', 'exitBase', 'capture', 'enterHome'

    this.lastMovementInfo = {
      playerColor: player.color, pawnIndex: pawnIndex,
      from: { pos: pawn.pos, homeStep: pawn.homeStep },
      to: { pos: -1, homeStep: -1 } // Será atualizado
    };

    if (pawn.pos === -1) { // Sai da base
        pawn.pos = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
        movementType = 'exitBase';
        this.logEvent(player.color, `${player.name} tirou 6 e moveu ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]} para a saída.`);
    } else { // Move no tabuleiro
      const newPosInfo = this._calculateNewPosition(player, pawn, this.diceValue);
      if (!newPosInfo.valid) return false; // Verifica novamente a validade

      if (newPosInfo.isHomePath) {
        if (pawn.homeStep === -1) movementType = 'enterHome';
        pawn.pos = -2; // Indica que está no corredor final (não no path_coords)
        pawn.homeStep = newPosInfo.targetPos;
        this.logEvent(player.color, `${player.name} moveu ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]} para o corredor final, casa ${pawn.homeStep + 1}.`);
      } else {
        pawn.pos = newPosInfo.targetPos;
        this.logEvent(player.color, `${player.name} moveu ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]} ${this.diceValue} casas.`);
      }

      // Verifica captura (apenas se não estiver em casa segura)
      const currentBoardPos = newPosInfo.isHomePath ? null : window.LUDO_CONSTANTS.PATH_COORDS[pawn.pos];
      if (currentBoardPos && !this._isSafeSquare(pawn.pos)) {
        this.players.forEach(otherPlayer => {
          if (otherPlayer.id === player.id) return; // Não pode capturar as próprias peças

          otherPlayer.pawns.forEach(otherPawn => {
            let otherPawnBoardPos = null;
            if (otherPawn.pos !== -1 && otherPawn.pos !== -2) { // Está no caminho principal
                otherPawnBoardPos = window.LUDO_CONSTANTS.PATH_COORDS[otherPawn.pos];
            } else if (otherPawn.homeStep !== -1) { // Está no corredor final
                otherPawnBoardPos = window.LUDO_CONSTANTS.HOME_PATHS[otherPlayer.color][otherPawn.homeStep];
            }

            if (otherPawnBoardPos && currentBoardPos &&
                otherPawnBoardPos[0] === currentBoardPos[0] &&
                otherPawnBoardPos[1] === currentBoardPos[1]) {
              // Capturou!
              otherPawn.pos = -1; // Volta para a base
              otherPawn.homeStep = -1;
              movementType = 'capture';
              this.extraTurn = true; // Captura concede turno extra
              this.logEvent(player.color, `${player.name} capturou a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[otherPlayer.color]} de ${otherPlayer.name}! Ganha uma rolagem extra.`);
            }
          });
        });
      }
    }

    // Atualiza a posição final no lastMovementInfo
    this.lastMovementInfo.to = { pos: pawn.pos, homeStep: pawn.homeStep };

    // Verifica se a peça chegou na casa central
    if (pawn.pos === -2 && pawn.homeStep === window.LUDO_CONSTANTS.HOME_PATH_LENGTH - 1) {
      pawn.finished = true;
      player.score++;
      this.extraTurn = true; // Chegar na casa central concede turno extra
      this.logEvent(player.color, `${player.name} levou ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]} para a casa central! Ganha uma rolagem extra.`);
      if (player.score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER) {
        this.status = 'finished';
        this.winner = player.id;
        this.logEvent('neutral', `${player.name} venceu a partida!`);
        return true; // Jogo termina
      }
    }

    // Após o movimento, a fase volta para 'roll' ou passa o turno
    this.phase = 'roll'; // Reseta a fase para 'roll' para o próximo turno do jogador

    if (!this.extraTurn) {
        // Se não ganhou um turno extra, passa para o próximo jogador
        this.nextTurn();
    } else {
        // Manteve o turno, então é a vez de rolar novamente
        this.logEvent(player.color, `${player.name}, você ganhou um turno extra! Role novamente.`);
        this.extraTurn = false; // Reseta para evitar loops, o próximo roll pode dar outro extra
    }
    this.diceValue = 0; // Zera o dado após o movimento
    return true;
  }

  /**
   * Calcula a nova posição de um peão dado um valor de dado.
   * Retorna um objeto {valid: boolean, targetPos: number, isHomePath: boolean}
   */
  _calculateNewPosition(player, pawn, dice) {
    let currentPathIndex = pawn.pos;
    let currentHomeStep = pawn.homeStep;

    // Se a peça está no corredor final (home path)
    if (currentHomeStep !== -1) {
      const newHomeStep = currentHomeStep + dice;
      if (newHomeStep < window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
        return { valid: true, targetPos: newHomeStep, isHomePath: true };
      } else {
        return { valid: false }; // Movimento excede o corredor final/casa central
      }
    }

    // Se a peça está no caminho principal (PATH_COORDS)
    const playerStartPos = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
    const playerFinalEntryBoardPosCoord = window.LUDO_CONSTANTS.FINAL_ENTRY_BOARD_POS[player.color];
    const pathCoords = window.LUDO_CONSTANTS.PATH_COORDS;

    // Encontra o índice da FINAL_ENTRY_BOARD_POS do jogador na PATH_COORDS
    let finalEntryPathIndex = -1;
    for(let i = 0; i < pathCoords.length; i++) {
        if (pathCoords[i][0] === playerFinalEntryBoardPosCoord[0] &&
            pathCoords[i][1] === playerFinalEntryBoardPosCoord[1]) {
            finalEntryPathIndex = i;
            break;
        }
    }

    // Calcula a posição no caminho global
    let globalCurrentPos = -1;
    for(let i = 0; i < pathCoords.length; i++) {
        if (pathCoords[i][0] === window.LUDO_CONSTANTS.PATH_COORDS[currentPathIndex][0] &&
            pathCoords[i][1] === window.LUDO_CONSTANTS.PATH_COORDS[currentPathIndex][1]) {
            globalCurrentPos = i;
            break;
        }
    }
    if (globalCurrentPos === -1) return { valid: false };

    let globalNewPos = globalCurrentPos + dice;

    // Se o movimento leva para o corredor final
    if (globalNewPos > finalEntryPathIndex && globalCurrentPos <= finalEntryPathIndex) {
      const homePathEntrySteps = globalNewPos - finalEntryPathIndex -1; // Quantidade de passos dentro do home path
      if (homePathEntrySteps < window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
        return { valid: true, targetPos: homePathEntrySteps, isHomePath: true };
      } else {
        return { valid: false }; // Excede o home path
      }
    } else {
      // Movimento continua no caminho principal (loop around)
      globalNewPos = globalNewPos % window.LUDO_CONSTANTS.BOARD_STEPS;
      return { valid: true, targetPos: globalNewPos, isHomePath: false };
    }
  }


  /**
   * Verifica se uma posição no tabuleiro está ocupada por outra peça do próprio jogador.
   * Peças do próprio jogador podem ocupar a mesma casa em casas seguras ou base/homepath.
   * No Ludo clássico, apenas casas seguras permitem múltiplas peças do mesmo jogador.
   */
  _isOccupiedByOwnPawn(player, targetPos, isHomePath, currentPawnIndex) {
      // Se for home path, cada casa tem só uma peça
      if (isHomePath) {
          return player.pawns.some((p, idx) => idx !== currentPawnIndex && p.homeStep === targetPos && p.pos === -2 && !p.finished);
      }

      // No caminho principal
      const isSafe = this._isSafeSquare(targetPos);
      if (isSafe) return false; // Casas seguras podem ter múltiplas peças (bloqueio)

      // Outras casas: verifica se há outra peça do próprio jogador na mesma casa
      return player.pawns.some((p, idx) => idx !== currentPawnIndex && p.pos === targetPos && p.homeStep === -1 && !p.finished);
  }

  /**
   * Verifica se uma posição no caminho principal é uma casa segura.
   * @param {number} pathIndex Índice no PATH_COORDS.
   * @returns {boolean} True se a casa é segura, False caso contrário.
   */
  _isSafeSquare(pathIndex) {
    return window.LUDO_CONSTANTS.SAFE_SQUARES.includes(pathIndex);
  }

  /**
   * Passa o turno para o próximo jogador.
   */
  nextTurn() {
    this.diceValue = 0;
    this.phase = 'roll';
    this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;
    this.logEvent(this.activePlayer.color, `É a vez de ${this.activePlayer.name} rolar o dado.`);
  }

  /**
   * Registra um evento no log do jogo.
   * @param {string} color Cor do jogador ('red', 'blue', etc.) ou 'neutral'.
   * @param {string} message A mensagem do evento.
   */
  logEvent(color, message) {
    this.log.push({ color: color, message: message, timestamp: Date.now() });
    if (this.log.length > 50) { // Limita o histórico para não crescer demais
      this.log.shift();
    }
  }

  /**
   * Reseta o estado do motor do jogo, preparando para uma nova partida.
   * Não afeta a lista de jogadores `this.players`. Use `setupGame` para configurar.
   */
  reset() {
    this.boardState = {};
    this.activePlayerIndex = 0;
    this.diceValue = 0;
    this.phase = 'roll';
    this.status = 'waiting';
    this.winner = null;
    this.extraTurn = false;
    this.log = [];
    this.lastMovementInfo = null;
    this.players.forEach(player => {
        player.pawns = Array(window.LUDO_CONSTANTS.PIECES_PER_PLAYER).fill(0).map(() => ({
            pos: -1, homeStep: -1, finished: false
        }));
        player.score = 0;
    });
  }

  /**
   * Serializa o estado atual do jogo para armazenamento (ex: Firebase).
   * @returns {object} Um objeto serializável que representa o estado do jogo.
   */
  serialize() {
    return {
      players: this.players,
      boardState: this.boardState,
      activePlayerIndex: this.activePlayerIndex,
      diceValue: this.diceValue,
      phase: this.phase,
      status: this.status,
      winner: this.winner,
      extraTurn: this.extraTurn,
      log: this.log,
      lastMovementInfo: this.lastMovementInfo
    };
  }

  /**
   * Deserializa um estado de jogo e aplica ao motor.
   * @param {object} serializedState O estado serializado.
   */
  deserialize(serializedState) {
    if (!serializedState) return;
    this.players = serializedState.players || [];
    this.boardState = serializedState.boardState || {};
    this.activePlayerIndex = serializedState.activePlayerIndex !== undefined ? serializedState.activePlayerIndex : 0;
    this.diceValue = serializedState.diceValue !== undefined ? serializedState.diceValue : 0;
    this.phase = serializedState.phase || 'roll';
    this.status = serializedState.status || 'waiting';
    this.winner = serializedState.winner !== undefined ? serializedState.winner : null;
    this.extraTurn = serializedState.extraTurn !== undefined ? serializedState.extraTurn : false;
    this.log = serializedState.log || [];
    this.lastMovementInfo = serializedState.lastMovementInfo || null;
  }
}