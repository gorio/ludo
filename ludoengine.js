/* =====================================================
   LudoEngine - Lógica principal do jogo de Ludo
   Usa window.LUDO_CONSTANTS para constantes do tabuleiro e jogo.
===================================================== */
class LudoEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.players = [];      // Array de objetos Player
    this.currentTurn = 0;   // Índice do jogador atual no array `players`
    this.diceValue = 0;     // Valor do dado
    this.phase = 'roll';    // 'roll' (rolar dado) ou 'move' (mover peça)
    this.status = 'waiting';// 'waiting', 'playing', 'finished', 'resigned', 'abandoned'
    this.winner = null;     // ID do jogador vencedor
    this.extraTurn = false; // Indica se o jogador ganhou uma jogada extra (rolar 6, capturar ou chegar em casa)
    this.log = [];          // Histórico de eventos do jogo
    this.lastMovedPawn = null; // Para indicar visualmente a última peça movida
  }

  /**
   * Configura o jogo com os jogadores fornecidos.
   * @param {Array<Object>} playerConfigs Array de objetos { id, name, isAI, color, photoURL }.
   */
  setupGame(playerConfigs) {
    this.reset();
    if (!playerConfigs || playerConfigs.length < 2 || playerConfigs.length > 4) {
      console.error('Ludo: Configuração de jogadores inválida. Mínimo 2, máximo 4.');
      return;
    }

    this.players = playerConfigs.map(config => ({
      id: config.id,
      name: config.name,
      isAI: config.isAI,
      color: config.color,
      photoURL: config.photoURL,
      pawns: Array(window.LUDO_CONSTANTS.PIECES_PER_PLAYER).fill(0).map(() => ({
        pos: -1,        // -1: na base, 0-51: no tabuleiro, >51: casa final
        homeStep: -1,   // -1: nao no home path, 0-5: casas do home path
        finished: false // true se a peça chegou ao centro
      })),
      score: 0 // Quantas peças chegaram ao centro
    }));
    this.status = 'playing';
    this.currentTurn = 0;
    this.logEvent(null, 'Jogo iniciado!');
  }

  /**
   * Retorna o jogador ativo no turno atual.
   * @returns {Object} Objeto do jogador atual.
   */
  get activePlayer() {
    return this.players[this.currentTurn];
  }

  /**
   * Avança para o próximo turno.
   * Lida com jogadas extras e pular jogadores finalizados.
   */
  nextTurn() {
    if (this.extraTurn) {
      this.extraTurn = false;
      this.logEvent(this.activePlayer.color, `${this.activePlayer.name} tem uma jogada extra!`);
      return; // Permanece no mesmo jogador para jogada extra
    }

    let nextPlayerIndex = (this.currentTurn + 1) % this.players.length;
    let attempts = 0;
    while (this.players[nextPlayerIndex].score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER && attempts < this.players.length) {
      // Pula jogadores que já terminaram
      nextPlayerIndex = (nextPlayerIndex + 1) % this.players.length;
      attempts++;
    }

    if (attempts === this.players.length) {
      // Todos os jogadores terminaram, o jogo deveria ter acabado
      this.status = 'finished';
      return;
    }

    this.currentTurn = nextPlayerIndex;
    this.diceValue = 0; // Reseta o dado
    this.phase = 'roll'; // Próximo jogador sempre começa rolando
    this.logEvent(this.activePlayer.color, `Vez de ${this.activePlayer.name}.`);
  }

  /**
   * Registra um evento no log do jogo.
   * @param {string} color Cor do jogador (opcional).
   * @param {string} message Mensagem do log.
   */
  logEvent(color, message) {
    // Limita o log para não ficar muito grande
    if (this.log.length > 50) {
      this.log.shift();
    }
    this.log.push({ color, message, timestamp: Date.now() });
  }

  /**
   * Rola o dado para o jogador atual.
   * @returns {number} O valor do dado.
   */
  rollDice() {
    if (this.phase !== 'roll' || this.status !== 'playing') return 0;

    this.diceValue = Math.floor(Math.random() * 6) + 1;
    this.phase = 'move';
    this.lastMovedPawn = null; // Reseta a peça destacada

    this.logEvent(this.activePlayer.color, `${this.activePlayer.name} rolou um ${this.diceValue}.`);

    const validMoves = this.getValidMoves();
    if (validMoves.length === 0) {
      this.logEvent(this.activePlayer.color, `Nenhum movimento válido para ${this.diceValue}.`);
      this.nextTurn(); // Passa o turno automaticamente se não houver movimentos
    }

    // Se rolou 6, ganha uma jogada extra
    if (this.diceValue === 6) {
      this.extraTurn = true;
    }

    return this.diceValue;
  }

  /**
   * Obtém a lista de índices de peões do jogador atual que podem ser movidos com o dado atual.
   * @returns {Array<number>} Array de índices de peões (0 a PIECES_PER_PLAYER-1).
   */
  getValidMoves() {
    const player = this.activePlayer;
    const moves = [];
    if (this.diceValue === 0) return []; // Não rolou o dado ainda

    player.pawns.forEach((pawn, index) => {
      if (pawn.finished) return; // Peças que já chegaram não podem se mover

      if (pawn.pos === -1) { // Peça na base
        if (this.diceValue === 6) {
          // Só pode sair da base com um 6
          moves.push(index);
        }
      } else { // Peça no jogo (trilha principal ou home path)
        // Calcula a nova posição no caminho principal
        const currentPathIndex = pawn.pos;
        const newPathIndex = currentPathIndex + this.diceValue;

        // Verifica se a peça está para entrar no home path
        const playerStartPathIndex = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
        const playerFinalEntryTileIndex = (playerStartPathIndex + window.LUDO_CONSTANTS.BOARD_STEPS - 1) % window.LUDO_CONSTANTS.BOARD_STEPS;
        const pathToHomeEntry = (currentPathIndex <= playerFinalEntryTileIndex && newPathIndex > playerFinalEntryTileIndex) ||
                                (playerStartPathIndex === 0 && newPathIndex > window.LUDO_CONSTANTS.BOARD_STEPS -1 && newPathIndex - (window.LUDO_CONSTANTS.BOARD_STEPS -1) > 0 ); // se deu a volta
        // Esta lógica precisa ser ajustada para lidar com a "volta" no tabuleiro

        // Lógica simplificada:
        // Se a peça não está no home path
        if (pawn.homeStep === -1) {
            // Verifica se a peça vai para o home path ou continua na trilha principal
            const targetColorPathIndex = (window.LUDO_CONSTANTS.HOME_START_POS[player.color] + newPathIndex) % window.LUDO_CONSTANTS.BOARD_STEPS;

            // Calcula a posição absoluta no caminho (passou do START_POS do jogador?)
            let absoluteCurrentPos = pawn.pos;
            let absoluteNewPos = pawn.pos + this.diceValue;

            // Quantas casas o jogador ainda tem que percorrer na trilha comum para chegar à sua entrada do home path
            let distanceToHomeEntry;
            if (window.LUDO_CONSTANTS.HOME_START_POS[player.color] === 0) {
                 // Cor vermelha precisa dar a volta no tabuleiro todo.
                 distanceToHomeEntry = (window.LUDO_CONSTANTS.BOARD_STEPS - pawn.pos);
            } else if (pawn.pos < window.LUDO_CONSTANTS.HOME_START_POS[player.color] ) {
                distanceToHomeEntry = window.LUDO_CONSTANTS.HOME_START_POS[player.color] - pawn.pos;
            } else { // pawn.pos >= HOME_START_POS[player.color]
                distanceToHomeEntry = (window.LUDO_CONSTANTS.BOARD_STEPS - pawn.pos) + window.LUDO_CONSTANTS.HOME_START_POS[player.color];
            }


            // Se a jogada entra no home path (ou passa dela indo para as casas finais)
            if (this.canEnterHomePath(player.color, pawn.pos, this.diceValue)) {
                const stepInHomePath = this.getStepInHomePath(player.color, pawn.pos, this.diceValue);
                if (stepInHomePath <= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) { // Pode entrar no home path ou ir até o final
                    // Verifica se a casa final está bloqueada por outra peça
                    if (!this.isHomePathBlocked(player.color, stepInHomePath)) {
                        moves.push(index);
                    }
                }
            } else {
                // Se continua na trilha principal, verifica colisões
                const targetPosOnBoard = (pawn.pos + this.diceValue) % window.LUDO_CONSTANTS.BOARD_STEPS;
                if (!this.isBlockedAt(targetPosOnBoard, player.color)) {
                    moves.push(index);
                }
            }
        } else { // Peça já está no home path
            const newHomeStep = pawn.homeStep + this.diceValue;
            if (newHomeStep <= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) { // Pode se mover dentro do home path ou para o centro
                 // Move dentro do Home Path, verifica se a casa está bloqueada
                if (!this.isHomePathBlocked(player.color, newHomeStep)) {
                    moves.push(index);
                }
            }
        }
      }
    });

    return moves;
  }

  /**
   * Verifica se o dado rolado permite que a peça entre no Home Path.
   * @param {string} playerColor
   * @param {number} currentPos Posição atual do peão na PATH_COORDS.
   * @param {number} diceValue
   * @returns {boolean}
   */
  canEnterHomePath(playerColor, currentPos, diceValue) {
    const playerStartPathIndex = window.LUDO_CONSTANTS.HOME_START_POS[playerColor]; // Onde a cor começa na trilha principal
    const currentAbsolutePos = currentPos;
    const absPosAfterMove  = currentPos + diceValue;

    // Calcular o índice da casa de entrada para o corredor final de cada cor.
    // Exemplo: Vermelho entra no Home Path depois de passar o índice 51 e ir para 0.
    // O último passo na trilha comum para o Vermelho antes do Home Path é o 51.
    // O último passo na trilha comum para o Azul é o 12 (antes do 13).
    // O último passo na trilha comum para o Verde é o 25 (antes do 26).
    // O último passo na trilha comum para o Amarelo é o 38 (antes do 39).

    // Determinar o "ponto de virada" para entrar no home path para esta cor
    let entryToHomePathIndexOnBoard; // Este é o último índice de PATH_COORDS antes de entrar no Home Path
    if (playerColor === 'red') {
      entryToHomePathIndexOnBoard = window.LUDO_CONSTANTS.PATH_COORDS.length - 1; // Última casa é o 51
    } else {
      entryToHomePathIndexOnBoard = (window.LUDO_CONSTANTS.HOME_START_POS[playerColor] -1 + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS;
    }


    // Verifica se a peça vai passar pelo 'entryToHomePathIndexOnBoard'
    // E se não está vindo diretamente após o ponto de entrada da base
    if (currentPos <= entryToHomePathIndexOnBoard && absPosAfterMove > entryToHomePathIndexOnBoard) {
        // A peça passou pelo ponto de entrada para o Home Path
        return true;
    }
     // Em caso de RED, o ponto de entrada é dar a volta na trilha toda (passar pelo 51)
    if (playerColor === 'red' && currentPos > entryToHomePathIndexOnBoard && absPosAfterMove >= window.LUDO_CONSTANTS.BOARD_STEPS) {
        return true; // Deu a volta completa e vai entrar
    }


    // Verifica a situação de um peão que está na casa de saída do jogador.
    // E.g., se um peão vermelho está em (6,1) e rola um dado que o levaria a 7,1 (homepath[0])
    const homePathStartingBoardPos = window.LUDO_CONSTANTS.ENTRY_POS[playerColor];
    const pathIdxOfHomePathStart = window.LUDO_CONSTANTS.PATH_COORDS.findIndex(coord => coord[0] === homePathStartingBoardPos[0] && coord[1] === homePathStartingBoardPos[1]);
    if (currentPos === pathIdxOfHomePathStart && diceValue === window.LUDO_CONSTANTS.HOME_PATH_LENGTH + 1) { // Exemplo simplificado para entrar direto
        // Isso é complexo. A forma mais robusta é refazer o cálculo de "posição destino" para cobrir todos os cenários.
        return false; // Por enquanto, falso
    }

    return false; // Padrão
  }

  /**
   * Calcula o passo no home path para onde um peão se moveria.
   * Considera que a peça já está na trilha principal ou para entrar nela.
   * @param {string} playerColor Cor do jogador.
   * @param {number} currentMainPathPos Posição atual na PATH_COORDS (-1 se na base).
   * @param {number} diceValue Valor do dado.
   * @returns {number} O índice no HOME_PATHS (0-5) ou -1 se não entra no home path.
   */
  getStepInHomePath(playerColor, currentMainPathPos, diceValue) {
    const playerStartPathIndex = window.LUDO_CONSTANTS.HOME_START_POS[playerColor]; // Onde a cor começa a sua "volta" no tabuleiro
    const pathLength = window.LUDO_CONSTANTS.BOARD_STEPS;

    let stepsAroundBoard; // Quantas casas o peão já andou na trilha principal a partir do 'HOME_START_POS'
    if (currentMainPathPos >= playerStartPathIndex) {
      stepsAroundBoard = currentMainPathPos - playerStartPathIndex;
    } else {
      // Se a peça já deu a volta (passou pelo fim do array e está no início)
      stepsAroundBoard = pathLength - playerStartPathIndex + currentMainPathPos;
    }

    const totalStepsInMainPath = stepsAroundBoard + diceValue;
    const remainingStepsForHomePath = totalStepsInMainPath - (pathLength - 1); // Quantos passos após a última casa da trilha principal

    if (currentMainPathPos === -1 && diceValue === 6) { // Peça sai da base
      return 0; // Entra na primeira casa do Home Path (se a saída for a entrada)
    }

    if (totalStepsInMainPath >= pathLength) { // Se a peça vai passar por todas as casas da trilha principal
      let homePathStep = totalStepsInMainPath - (pathLength - 1);
      if (currentMainPathPos === 51) { // RED color is at the end of the common path.
          homePathStep = diceValue - 1; // If it rolls '1', it goes to homePath[0].
      }
      if (playerColor === 'red' && currentMainPathPos === window.LUDO_CONSTANTS.PATH_COORDS.length - 1) { // Está na última casa do BOARD_STEPS
        homePathStep = (diceValue - 1); // Primeiras casas no Home Path (0 a 5)
      } else if (playerColor === 'blue' && currentMainPathPos === window.LUDO_CONSTANTS.HOME_START_POS.blue - 1) {
          homePathStep = (diceValue -1);
      } // ... e assim por diante
      //
      // Refatorar esta logica. É muito propensa a erros.

      homePathStep = totalStepsInMainPath - (pathLength -1);
      if(homePathStep >=0 && homePathStep <= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
        return homePathStep;
      }
    }

    return -1; // Não entra no home path com esta jogada
  }


  /**
   * Verifica se uma casa no home path está bloqueada por um peão do jogador.
   * @param {string} playerColor Cor do jogador.
   * @param {number} homeStep Passo no home path (0-5).
   * @returns {boolean} True se bloqueada, falso caso contrário.
   */
  isHomePathBlocked(playerColor, homeStep) {
    if (homeStep === window.LUDO_CONSTANTS.HOME_PATH_LENGTH) { // O centro não pode ser bloqueado
        return false; // A casa final é sempre livre (mas só um peão por slot)
    }

    const player = this.players.find(p => p.color === playerColor);
    if (!player) return false;

    // Verifica se já há um peão ali (não pode ter 2 peões do mesmo jogador nas casas finais)
    return player.pawns.some(p => p.homeStep === homeStep && !p.finished);
  }

  /**
   * Move um peão do jogador ativo.
   * @param {number} pawnIndex Índice do peão a ser movido (0 a PIECES_PER_PLAYER-1).
   * @returns {boolean} True se o movimento foi bem-sucedido.
   */
  doMovePawn(pawnIndex) {
    const player = this.activePlayer;
    const pawn = player.pawns[pawnIndex];

    if (this.phase !== 'move' || this.status !== 'playing' || this.diceValue === 0 || pawn.finished) return false;

    // Valida se o movimento é permitido
    const validMoves = this.getValidMoves();
    if (!validMoves.includes(pawnIndex)) {
      console.warn('Movimento inválido para peão:', pawnIndex);
      return false;
    }

    let moved = false;
    let gainedExtraTurn = false;
    this.lastMovedPawn = { playerColor: player.color, pawnIndex: pawnIndex }; // Marca para visualização

    if (pawn.pos === -1) { // Peça saindo da base com um 6
      pawn.pos = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
      this.logEvent(player.color, `${player.name} tirou o peão ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]} com um 6!`);
      moved = true;
    } else { // Peça no jogo
      const playerStartPathIndex = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
      const pathLength = window.LUDO_CONSTANTS.BOARD_STEPS;

      // Lógica para entrar no home path ou continuar na trilha principal
      let oldPos = pawn.pos;
      let newCalculatedPos = oldPos + this.diceValue;

      // Se a peça ESTAVA na trilha principal
      if (pawn.homeStep === -1) {
        // Verifica se a jogada entra no home path
        let stepsPastHomeEntry = -1;
        if (player.color === 'red') { // Red wraps around the end of the path
            if (oldPos <= (pathLength - 1) && newCalculatedPos > (pathLength - 1)) {
                stepsPastHomeEntry = newCalculatedPos - (pathLength - 1);
            }
        } else {
            const entryHomePathIdx = (playerStartPathIndex - 1 + pathLength) % pathLength;
            if (oldPos <= entryHomePathIdx && newCalculatedPos > entryHomePathIdx) {
                stepsPastHomeEntry = newCalculatedPos - entryHomePathIdx;
            }
        }

        if (stepsPastHomeEntry > 0 && stepsPastHomeEntry <= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
            // Entrou no home path
            pawn.pos = -2; // Marca que não está mais na trilha principal
            pawn.homeStep = stepsPastHomeEntry -1; // 0-indexed
            this.logEvent(player.color, `${player.name} moveu o peão ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]} para a casa final.`);
            gainedExtraTurn = true; // Ganha uma rodada extra ao entrar na casa final
            moved = true;
        } else {
            // Continua na trilha principal
            const targetPosOnBoard = (pawn.pos + this.diceValue) % pathLength;
            const captured = this.checkCapture(targetPosOnBoard, player.color);
            if (captured) {
                this.logEvent(player.color, `${player.name} capturou um peão ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[captured.color]}!`);
                gainedExtraTurn = true; // Ganha uma jogada extra ao capturar
            }
            pawn.pos = targetPosOnBoard;
            moved = true;
        }
      } else { // Peça JÁ ESTAVA no home path
        let newHomeStep = pawn.homeStep + this.diceValue;
        if (newHomeStep === window.LUDO_CONSTANTS.HOME_PATH_LENGTH ) {
          pawn.finished = true;
          pawn.homeStep = -1; // Não está mais no home path, mas no centro
          player.score++;
          this.logEvent(player.color, `${player.name} levou o peão ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]} para o centro!`);
          gainedExtraTurn = true; // Ganha uma jogada extra ao chegar no centro
          moved = true;
          this.checkWinner();
        } else if (newHomeStep < window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
            pawn.homeStep = newHomeStep;
            this.logEvent(player.color, `${player.name} moveu o peão ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]} dentro do corredor final.`);
            moved = true;
        }
      }
    }

    if (moved) {
      if (gainedExtraTurn) {
        this.extraTurn = true;
      } else {
        this.phase = 'roll'; // Reinicia para o próximo rolar de dado
        this.nextTurn(); // Passa o turno se não houve jogada extra
      }
      this.diceValue = 0; // Consome o valor do dado
      return true;
    }
    return false;
  }


  /**
   * Verifica se uma casa da trilha principal está bloqueada por um peão inimigo ou ocupada por um peão amigo (não safe square).
   * @param {number} targetPos Índice de destino na PATH_COORDS.
   * @param {string} movingPlayerColor Cor do jogador que está movendo.
   * @returns {Object|null} Objeto do peão capturado se houver captura, ou null.
   */
  checkCapture(targetPos, movingPlayerColor) {
    if (window.LUDO_CONSTANTS.SAFE_SQUARES.includes(targetPos)) {
      return null; // Casas seguras não permitem captura
    }

    for (const player of this.players) {
      if (player.color === movingPlayerColor) continue; // Não verifica com peões do próprio jogador
      for (const pawn of player.pawns) {
        if (!pawn.finished && pawn.pos === targetPos && pawn.homeStep === -1) {
          // Captura: move o peão de volta para a base
          pawn.pos = -1;
          pawn.homeStep = -1;
          this.logEvent(movingPlayerColor, `${player.name}'s peão ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[pawn.color]} foi capturado!`);
          return pawn; // Retorna o peão capturado
        }
      }
    }
    return null;
  }

  /**
   * Verifica se o jogo tem um vencedor.
   */
  checkWinner() {
    for (const player of this.players) {
      if (player.score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER) {
        this.winner = player.id;
        this.status = 'finished';
        this.logEvent(player.color, `${player.name} venceu o jogo!`);
        return true;
      }
    }
    return false;
  }

  // Métodos de serialização e deserialização para Firebase Realtime Database
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
    this.status = data.status || 'playing'; // Padrão é 'playing' ao carregar
    this.winner = data.winner || null;
    this.extraTurn = data.extraTurn ?? false;
    this.log = data.log || [];
  }
}