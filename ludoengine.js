/* =====================================================
   LudoEngine - Lógica principal do jogo de Ludo
   Depende de `ludo_constants.js` ser carregado primeiro.
===================================================== */
class LudoEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.players = [];      // Array de objetos Player { id, name, color, isAI, photoURL, pawns: [], score }
    this.currentTurn = 0;   // Índice do jogador atual no array `players`
    this.diceValue = 0;     // Valor do dado
    this.phase = 'roll';    // 'roll' (rolar dado) ou 'move' (mover peça)
    this.status = 'waiting';// 'waiting', 'playing', 'finished'
    this.winner = null;     // ID do jogador vencedor
    this.extraTurn = false; // Indica se o jogador ganhou uma jogada extra (rolar 6 ou capturar)
    this.log = [];          // Histórico de eventos do jogo
    this.activePlayerId = null; // ID do jogador ativo
    this.playablePawns = []; // Índices dos peões que podem ser movidos na fase 'move'
  }

  /**
   * Adiciona jogadores ao jogo e inicializa suas peças.
   * @param {Array<object>} playerConfigs Array de { id, name, color, isAI, photoURL }
   */
  setupGame(playerConfigs) {
    if (!playerConfigs || playerConfigs.length < 2 || playerConfigs.length > 4) {
      throw new Error("O Ludo requer entre 2 e 4 jogadores.");
    }
    this.players = playerConfigs.map(config => ({
      id: config.id,
      name: config.name,
      color: config.color,
      isAI: config.isAI || false,
      photoURL: config.photoURL || null,
      pawns: Array.from({ length: window.LUDO_CONSTANTS.PIECES_PER_PLAYER }, () => ({
        pos: -1,        // -1 = na base, 0-51 = no caminho, 0-5 = no homePath
        homeStep: -1,   // -1 = não no homePath, 0-5 = posição no homePath
        finished: false // Se a peça chegou ao centro
      })),
      score: 0 // Quantas peças chegaram ao centro
    }));

    this.currentTurn = 0;
    this.status = 'playing';
    this.activePlayerId = this.players[this.currentTurn].id;
    this.eventList = []; // Array para guardar eventos para logs, para ser salvo no Firebase
    this.logEvent(null, "Jogo iniciado!");
  }

  /**
   * Getter para o jogador ativo.
   * @returns {object|null} O objeto do jogador ativo.
   */
  get activePlayer() {
    return this.players[this.currentTurn];
  }

  /**
   * Rola o dado.
   * @returns {number} O valor do dado.
   */
  rollDice() {
    if (this.phase !== 'roll' || this.status !== 'playing') {
      this.logEvent(null, "Não é possível rolar o dado agora.");
      return 0;
    }
    const roll = Math.floor(Math.random() * 6) + 1;
    // const roll = 6; // Para testes
    this.diceValue = roll;
    this.eventList.push({ type: 'roll', player: this.activePlayer.id, value: roll });
    this.logEvent(this.activePlayer.color, `${this.activePlayer.name} rolou um ${roll}.`);

    this.playablePawns = this._getPlayablePawns(roll);

    if (this.playablePawns.length === 0) {
      this.logEvent(this.activePlayer.color, `Sem movimentos válidos para ${this.activePlayer.name}.`);
      this.phase = 'roll'; // Reseta a fase para que o próximo jogador possa rolar
      this.extraTurn = false; // Não há turno extra se não moveu
      this.nextTurn();
    } else {
      this.phase = 'move';
      this.extraTurn = (roll === 6); // Rolar 6 dá turno extra
    }
    return roll;
  }

  /**
   * Retorna os índices dos peões que podem ser movidos com o valor do dado.
   * @param {number} roll - o valor do dado
   * @returns {Array<number>} Um array de índices dos peões (0 a 3) que podem se mover.
   */
  _getPlayablePawns(roll) {
    const activePlayer = this.activePlayer;
    const playable = [];
    activePlayer.pawns.forEach((pawn, pIdx) => {
      if (pawn.finished) return; // Peças que já chegaram não podem se mover

      // Condição para tirar peça da base
      if (pawn.pos === -1 && roll === 6) {
        playable.push(pIdx);
        // Não retorna - a peça fora da base também pode mover se roll for 6 e ela já estiver no caminho
      }
      // Condição para mover peça já no caminho principal ou home path
      else if (pawn.pos !== -1 || pawn.homeStep !== -1) {
        // Simula o movimento para verificar se é válido
        const { willBeOnBoard, newPos, newHomeStep } = this._simulateMove(activePlayer.color, pawn.pos, pawn.homeStep, roll);

        if (willBeOnBoard) {
            // Verifica se a casa de destino não está ocupada por dois peões do próprio jogador
            const destinationCoords = this._getCoordinatesForPosition(activePlayer.color, newPos, newHomeStep);

            // Só faz a verificação se a peça de destino não for "segura" e for a casa da home ou path
            if (destinationCoords) { // Se for null, a peça chegou
                const isSafeCell = window.LUDO_CONSTANTS.SAFE_SQUARES.includes(this._getGlobalPathIndex(destinationCoords));
                const occupiedBySamePlayer = this.players.some(p => p.id === activePlayer.id && p.color === activePlayer.color && p.pawns.some(
                    otherPawn => otherPawn !== pawn && !otherPawn.finished &&
                                 (otherPawn.pos !== -1 && this._getCoordinatesForPosition(activePlayer.color, otherPawn.pos, otherPawn.homeStep)[0] === destinationCoords[0] &&
                                  this._getCoordinatesForPosition(activePlayer.color, otherPawn.pos, otherPawn.homeStep)[1] === destinationCoords[1])
                ));

                // Ludo: um peão não pode ocupar uma casa j á ocupada por outro peão do mesmo jogador (a menos que já tenha dois - 'stack')
                // E também não pode entrar numa safe_square ocupada por adversário
                // Simplificação: não pode ter 2 peças do MESMO jogador numa mesma casa (apenas na saída, com 6)
                // Vamos refinar: Uma casa pode ter no máximo duas peças. Se a casa destino tiver duas peças DO MESMO JOGADOR,
                // NÃO pode mover para lá. Se tiver uma ou nenhuma, pode. Se tiver uma ou duas do adversário, pode ir para lá e "capturar".

                const pawnsAtDestination = this.players.flatMap(p => p.pawns)
                    .filter(otherPawn => otherPawn !== pawn && !otherPawn.finished)
                    .filter(otherPawn => {
                        const otherPawnCoords = this._getCoordinatesForPosition(p.color, otherPawn.pos, otherPawn.homeStep);
                        return otherPawnCoords && otherPawnCoords[0] === destinationCoords[0] && otherPawnCoords[1] === destinationCoords[1];
                    });

                // Se o destino tem 2 peças, não pode mover para lá (Ludo padrão não permite 3)
                if (pawnsAtDestination.length >= 2) {
                    continue; // Não é um movimento válido se já há duas peças
                }
                // Se o destino tem 1 peça e é do próprio jogador, ainda pode mover
                // Se o destino tem 1 peça e é do ADVERSÁRIO, e não é casa segura, pode mover para capturar
                // Se o destino tem 1 peça e é do ADVERSÁRIO, e É casa segura, NÃO pode mover para capturar.
                if (pawnsAtDestination.length === 1) {
                    const otherPawnPlayer = this.players.find(p => p.pawns.includes(pawnsAtDestination[0]));
                    if (otherPawnPlayer.color === activePlayer.color) {
                       // Pode mover se já tem 1 peça, resultando em 2 suas na mesma casa.
                       // Padrão Ludo permite 2, não 3.
                        if (pawnsAtDestination.length === 1) playable.push(pIdx);
                        continue;
                    } else { // É um peão adversário
                        if (window.LUDO_CONSTANTS.SAFE_SQUARES.includes(this._getGlobalPathIndex(destinationCoords))) {
                            // Casa segura Ocupada por adversário - não pode capturar
                            continue;
                        }
                    }
                }
            }
            playable.push(pIdx);
        }
      }
    });
    return playable;
  }

  /**
   * Simula o movimento de uma peça para uma nova posição.
   * @param {string} playerColor Cor do jogador.
   * @param {number} currentPos Posição atual (-1 para base, 0-51 para path_coords).
   * @param {number} currentHomeStep Posição atual no homePath (-1 para não no homePath, 0-5 no homePath).
   * @param {number} roll Valor do dado.
   * @returns {{willBeOnBoard: boolean, newPos: number, newHomeStep: number, finished: boolean}} O estado simulado.
   */
  _simulateMove(playerColor, currentPos, currentHomeStep, roll) {
    let newPos = currentPos;
    let newHomeStep = currentHomeStep;
    let finished = false;
    let willBeOnBoard = true; // Indica se a peça permanece no tabuleiro ou chega ao centro

    const playerStartPathIndex = window.LUDO_CONSTANTS.HOME_START_POS_INDEX[playerColor];
    const playerFinalEntryBoardPosIndex = window.LUDO_CONSTANTS.FINAL_ENTRY_BOARD_POS_INDEX[playerColor];

    if (currentPos === -1) { // Peça na base
      if (roll === 6) {
        newPos = playerStartPathIndex;
        newHomeStep = -1;
      } else {
        willBeOnBoard = false; // Não move, continua na base
      }
    } else if (currentHomeStep !== -1) { // Peça no homePath
      newHomeStep = currentHomeStep + roll;
      if (newHomeStep >= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
        finished = true;
        willBeOnBoard = false;
      }
    } else { // Peça no caminho principal
      let nextPos = (currentPos + roll);

      // Checando se a peça entra no HOME PATH
      if (currentPos <= playerFinalEntryBoardPosIndex && nextPos > playerFinalEntryBoardPosIndex) {
          // A peça está antes ou na casa de entrada, e o roll a levará para além dela, significando entrada no home path
          const stepsIntoHomePath = nextPos - playerFinalEntryBoardPosIndex -1; // -1 pq entra na casa 0 do home path após a casa final do board

          // Calcula a nova posição no home path. A casa final do PATH_COORDS é 51.
          // Depois de sair do PATH_COORDS[FINAL_ENTRY_BOARD_POS_INDEX], o paw passa para HOME_PATHS[COLOR][0].
          // Então, o cálculo é: roll - (distância_até_a_entrada_do_home_path).
          const pathLengthBeforeHome = (playerFinalEntryBoardPosIndex - currentPos); // Casas a percorrer no caminho principal
          if (pathLengthBeforeHome <= roll) {
              newHomeStep = roll - pathLengthBeforeHome -1; // -1 porque a transição para a primeira casa do homePath consome 1 movimento
              if (newHomeStep < 0) newHomeStep = 0; // Garante que comece em 0 se o roll cai na primeira casa do home path
              newPos = -1; // Já não está mais no path_coords
              if (newHomeStep >= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
                  finished = true;
                  willBeOnBoard = false;
              }
          } else {
              // Continua no caminho principal
              newPos = nextPos % window.LUDO_CONSTANTS.BOARD_STEPS; // Usa módulo para circular o tabuleiro
              newHomeStep = -1;
          }
      } else {
          // Continua no caminho principal
          newPos = nextPos % window.LUDO_CONSTANTS.BOARD_STEPS; // Usa módulo para circular o tabuleiro
          newHomeStep = -1;
      }
    }

    return { willBeOnBoard, newPos, newHomeStep, finished };
  }


  /**
   * Move uma peça específica do jogador ativo.
   * @param {number} pawnIdx Índice da peça (0 a 3).
   * @returns {boolean} True se o movimento foi bem-sucedido.
   */
  doMovePawn(pawnIdx) {
    if (this.phase !== 'move' || this.status !== 'playing') {
      this.logEvent(null, "Não é possível mover a peça agora.");
      return false;
    }
    const activePlayer = this.activePlayer;
    const pawn = activePlayer.pawns[pawnIdx];

    // Verifica se este peão está entre os peões que podem ser movidos
    if (!this.playablePawns.includes(pawnIdx)) {
        this.logEvent(activePlayer.color, `Peão ${pawnIdx+1} não pode ser movido.`);
        return false;
    }

    const roll = this.diceValue;

    // Lógica para tirar peça da base
    if (pawn.pos === -1 && roll === 6) {
      pawn.pos = window.LUDO_CONSTANTS.HOME_START_POS_INDEX[activePlayer.color];
      pawn.homeStep = -1;
      this._handleCapture(activePlayer, pawn); // Verifica captura na saída
      this.logEvent(activePlayer.color, `${activePlayer.name} tirou o peão ${pawnIdx+1} da base.`);
      this.eventList.push({ type: 'move', player: activePlayer.id, pawn: pawnIdx, to: pawn.pos, isHome: false, fromBase: true });
    } else if (pawn.pos !== -1 || pawn.homeStep !== -1) { // Peça já no caminho ou home path
      const { newPos, newHomeStep, finished } = this._simulateMove(activePlayer.color, pawn.pos, pawn.homeStep, roll);

      pawn.pos = newPos;
      pawn.homeStep = newHomeStep;
      pawn.finished = finished;

      if (finished) {
        activePlayer.score++;
        this.logEvent(activePlayer.color, `${activePlayer.name} levou o peão ${pawnIdx+1} para casa!`);
        this.eventList.push({ type: 'move', player: activePlayer.id, pawn: pawnIdx, to: 'finished' });

        if (activePlayer.score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER) {
          this.status = 'finished';
          this.winner = activePlayer.id;
          this.logEvent(null, `Fim de jogo! ${activePlayer.name} venceu!`);
          this.eventList.push({ type: 'gameover', winner: activePlayer.id });
        }
      } else {
        this._handleCapture(activePlayer, pawn); // Verifica se houve captura
        this.logEvent(activePlayer.color, `${activePlayer.name} moveu o peão ${pawnIdx+1} para a casa ${this._getGlobalPathIndex(this._getCoordinatesForPosition(pawn.color, pawn.pos, pawn.homeStep))}.`);
        this.eventList.push({ type: 'move', player: activePlayer.id, pawn: pawnIdx, to: pawn.pos, isHome: pawn.homeStep !== -1 });
      }
    } else {
      // Este caso não deveria acontecer se playablePawns está correto
      return false;
    }

    this.phase = 'roll'; // Reseta a fase para que o próximo jogador possa rolar
    this.playablePawns = []; // Limpa peões jogáveis após o movimento

    // Se o jogo não terminou, avança o turno ou dá turno extra
    if (this.status === 'playing') {
      if (!this.extraTurn && !activePlayer.pawns.some(p => p.finished && p.score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER)) {
        this.nextTurn();
      } else {
        // Se há turno extra, reseta apenas o dado e a fase, mantendo o jogador
        this.diceValue = 0;
        this.extraTurn = false; // Resetando extra turn depois de conceder
        this.phase = 'roll';
        this.logEvent(activePlayer.color, `Turno extra para ${activePlayer.name}! Role o dado novamente.`);
      }
    }
    return true;
  }

  /**
   * Verifica se houve uma captura após o movimento de um peão.
   * @param {object} activePlayer O jogador que acabou de mover.
   * @param {object} movedPawn O peão que foi movido.
   */
  _handleCapture(activePlayer, movedPawn) {
    const movedPawnCoords = this._getCoordinatesForPosition(activePlayer.color, movedPawn.pos, movedPawn.homeStep);
    if (!movedPawnCoords) return; // Peça finalizou ou ainda está na base

    const isSafeCell = window.LUDO_CONSTANTS.SAFE_SQUARES.includes(this._getGlobalPathIndex(movedPawnCoords));

    if (isSafeCell) return; // Não há captura em casas seguras

    this.players.forEach(player => {
      if (player.id === activePlayer.id) return; // Não captura as próprias peças

      player.pawns.forEach(pawn => {
        if (pawn.finished || pawn.pos === -1 || pawn.homeStep !== -1) return; // Captura só em peças no caminho principal
        const otherPawnCoords = this._getCoordinatesForPosition(player.color, pawn.pos, pawn.homeStep);

        if (otherPawnCoords && movedPawnCoords[0] === otherPawnCoords[0] && movedPawnCoords[1] === otherPawnCoords[1]) {
          // Captura!
          pawn.pos = -1; // Volta para a base
          this.extraTurn = true; // Captura dá turno extra
          this.logEvent(activePlayer.color, `${activePlayer.name} capturou o peão ${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[player.color]} de ${player.name}!`);
          this.eventList.push({ type: 'capture', player: activePlayer.id, pawnCaptured: pawn, capturedBy: movedPawn });
        }
      });
    });
  }

  /**
   * Avança para o próximo turno.
   */
  nextTurn() {
    this.diceValue = 0; // Reseta o dado
    this.phase = 'roll';
    this.extraTurn = false; // Garante que não há turno extra pendente

    // Encontra o próximo jogador que não venceu
    let nextPlayerIndex = (this.currentTurn + 1) % this.players.length;
    let attempts = 0;
    while (this.players[nextPlayerIndex].score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER && attempts < this.players.length) {
        nextPlayerIndex = (nextPlayerIndex + 1) % this.players.length;
        attempts++;
    }

    if (attempts === this.players.length) {
        // Todos os jogadores foram testados e todos pontuaram, ou não há mais jogadores para jogar.
        // Isso pode indicar que o jogo já deveria ter terminado.
        // O caso de `status = 'finished'` já é tratado antes pelo `doMovePawn`.
        console.warn('Tentou avançar turno, mas todos pontuaram ou não há mais jogadores ativos.');
        return;
    }

    this.currentTurn = nextPlayerIndex;
    this.activePlayerId = this.players[this.currentTurn].id;
    this.logEvent(this.activePlayer.color, `É a vez de ${this.activePlayer.name}.`);
  }

  /**
   * Registra um evento no log do jogo.
   * @param {string|null} color Cor associada ao evento (null para neutro).
   * @param {string} message A mensagem do log.
   */
  logEvent(color, message) {
    this.log.push({ timestamp: Date.now(), color: color, message: message });
    // Limita o tamanho do log (opcional)
    if (this.log.length > 50) this.log.shift();
  }

  /**
   * Traduz coordenadas do tabuleiro lógico (pos/homeStep) para coordenadas (row, col) no grid 15x15.
   * @param {string} playerColor Cor do jogador (usado para homePath)
   * @param {number} pos Posição no caminho principal (-1 para base, 0-51 para path_coords)
   * @param {number} homeStep Posição no homePath (-1 para não no homePath, 0-5 no homePath)
   * @returns {[number, number]|null} [row, col] ou null se na base/finalizado.
   */
  _getCoordinatesForPosition(playerColor, pos, homeStep) {
    if (pos === -1 && homeStep === -1) { // Peça na base
        // Não temos uma única coordenada para 'na base', o renderBoard usa BASE_POSITIONS
        return null;
    }
    if (homeStep !== -1) { // Peça no Home Path
      return window.LUDO_CONSTANTS.HOME_PATHS[playerColor][homeStep];
    }
    if (pos !== -1) { // Peça no caminho principal
      return window.LUDO_CONSTANTS.PATH_COORDS[pos];
    }
    return null; // Caso a peça esteja finalizada
  }

  /**
   * Retorna o índice global na PATH_COORDS para uma coordenada (r,c), se for uma casa de path.
   * Útil para verificar casas seguras.
   * @param {[number, number]} coords [row, col]
   * @returns {number|null} Índice da casa no PATH_COORDS ou null.
   */
  _getGlobalPathIndex(coords) {
      if (!coords) return null;
      for (let i = 0; i < window.LUDO_CONSTANTS.PATH_COORDS.length; i++) {
          if (window.LUDO_CONSTANTS.PATH_COORDS[i][0] === coords[0] && window.LUDO_CONSTANTS.PATH_COORDS[i][1] === coords[1]) {
              return i;
          }
      }
      return null;
  }


  /**
   * Serializa o estado atual do jogo para armazenamento (ex: Firebase).
   * @returns {object} Estado serializado.
   */
  serialize() {
    return {
      players: this.players,
      currentTurn: this.currentTurn,
      diceValue: this.diceValue,
      phase: this.phase,
      status: this.status,
      winner: this.winner,
      extraTurn: this.extraTurn,
      log: this.log,
      activePlayerId: this.activePlayerId,
      // Não serializa playablePawns, é um estado transitório
    };
  }

  /**
   * Deserializa o estado do jogo a partir de um objeto.
   * @param {object} data Objeto de estado serializado.
   */
  deserialize(data) {
    if (!data) return;
    this.players = data.players || [];
    this.currentTurn = data.currentTurn ?? 0;
    this.diceValue = data.diceValue ?? 0;
    this.phase = data.phase || 'roll';
    this.status = data.status || 'waiting';
    this.winner = data.winner || null;
    this.extraTurn = data.extraTurn ?? false;
    this.log = data.log || [];
    this.activePlayerId = data.activePlayerId || (this.players[this.currentTurn] ? this.players[this.currentTurn].id : null);
    this.playablePawns = this._getPlayablePawns(this.diceValue); // Recalcula ao deserializar se estiver em fase de 'move'
  }
}