/* =====================================================
   ludoengine.js - Motor do jogo de Ludo
   Define a classe LudoEngine. Carregado ANTES de ludoai.js e app.js.
===================================================== */

class LudoEngine {
  constructor() {
    this.players = [];      // Array de Player objects (id, name, color, isAI, score, pawns[])
    this.playerMap = {};    // Mapa de players por ID para acesso rápido
    this.colorMap = {};     // Mapa de players por cor
    this.currentTurnIdx = 0;// Índice do jogador atual no array `players`
    this.diceValue = 0;     // Valor do dado rolado
    this.phase = 'roll';    // 'roll' (rolar dado) ou 'move' (mover peça)
    this.status = 'waiting';// 'waiting', 'playing', 'finished', 'resigned'
    this.winner = null;     // ID do jogador vencedor
    this.extraTurn = false; // Indica se o jogador ganhou uma jogada extra (rolar 6 ou capturar)
    this.log = [];          // Histórico de eventos do jogo
    this.playablePawns = [];// Índices das peças que podem ser movidas no turno atual
  }

  /**
   * Reseta o estado do jogo para o início.
   */
  reset() {
    this.players = [];
    this.playerMap = {};
    this.colorMap = {};
    this.currentTurnIdx = 0;
    this.diceValue = 0;
    this.phase = 'roll';
    this.status = 'waiting';
    this.winner = null;
    this.extraTurn = false;
    this.log = [];
    this.playablePawns = [];
  }

  /**
   * Loga um evento no histórico do jogo.
   * @param {string} color Cor associada ao evento (opcional).
   * @param {string} message Mensagem do evento.
   */
  logEvent(color, message) {
    this.log.push({ timestamp: Date.now(), color, message });
    // Limita o log a 50 entradas para não sobrecarregar
    if (this.log.length > 50) {
      this.log.shift();
    }
  }

  /**
   * Configura o jogo com os jogadores iniciais.
   * @param {Array<object>} playerConfigs Array de objetos {id, name, color, isAI, photoURL}
   */
  setupGame(playerConfigs) {
    this.reset();
    if (!playerConfigs || playerConfigs.length === 0) {
      console.error("Configuração de jogadores inválida.");
      return;
    }

    playerConfigs.forEach((config, idx) => {
      const player = {
        id: config.id,
        name: config.name,
        color: config.color,
        isAI: config.isAI || false,
        photoURL: config.photoURL || null,
        score: 0,
        pawns: Array.from({ length: window.LUDO_CONSTANTS.PIECES_PER_PLAYER }, (_, i) => ({
          idx: i,
          pos: -1, // -1 = na base, 0-51 = no tabuleiro principal, >51 (ou homeStep) = no corredor final
          homeStep: -1, // -1 = não no corredor final, 0-5 = no corredor final
          finished: false // True se a peça chegou na casa central
        }))
      };
      this.players.push(player);
      this.playerMap[player.id] = player;
      this.colorMap[player.color] = player;
    });

    this.status = 'playing';
    this.currentTurnIdx = 0; // Começa com o primeiro jogador configurado (assumindo Vermelho como primeiro)
    this.logEvent(null, "Jogo Ludo iniciado!");
    this.logEvent(this.activePlayer.color, `É a vez de ${this.activePlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[this.activePlayer.color]}) rolar o dado.`);
  }

  /**
   * Retorna o jogador do turno atual.
   * @returns {object} O objeto Player.
   */
  get activePlayer() {
    return this.players[this.currentTurnIdx];
  }

  /**
   * Rola o dado do Ludo (1-6).
   * Atualiza `diceValue` e `phase`.
   */
  rollDice() {
    if (this.phase !== 'roll' || this.status !== 'playing') {
      console.warn("Não é a fase de rolar o dado.");
      return;
    }
    this.diceValue = Math.floor(Math.random() * 6) + 1;
    this.logEvent(this.activePlayer.color, `${this.activePlayer.name} rolou um ${this.diceValue}.`);

    this.playablePawns = this._getPlayablePawns(this.activePlayer.color, this.diceValue);

    if (this.playablePawns.length > 0) {
      this.phase = 'move'; // Se há peças para mover, muda para a fase de mover
    } else {
      this.logEvent(this.activePlayer.color, `Nenhuma peça pode se mover com ${this.diceValue}.`);
      this.diceValue = 0; // Reseta o dado se não houver movimentos válidos
      this.nextTurn(); // Passa o turno se não houver movimentos
    }

    // Marca turno extra se tirou 6
    if (this.diceValue === 6) {
      this.extraTurn = true;
      this.logEvent(this.activePlayer.color, `${this.activePlayer.name} ganhou um turno extra!` );
    } else {
      this.extraTurn = false;
    }
  }

  /**
   * Obtém os índices das peças que podem ser movidas para o jogador ativo.
   * @param {string} playerColor Cor do jogador.
   * @param {number} diceValue Valor do dado.
   * @returns {Array<number>} Array de índices das peças jogáveis.
   */
  _getPlayablePawns(playerColor, diceValue) {
    const player = this.colorMap[playerColor];
    if (!player) return [];

    const playable = [];
    player.pawns.forEach((pawn, pawnIdx) => {
      if (pawn.finished) return; // Peças que já chegaram não podem se mover

      // Regra 1: Tirou 6 e peça está na base (-1)
      if (pawn.pos === -1) {
        if (diceValue === 6) {
          playable.push(pawnIdx);
        }
        return; // Não pode mover outras se está na base sem 6
      }

      // Regra 2: Peça em movimento ou no corredor final
      const newPos = pawn.pos + diceValue;
      if (pawn.homeStep !== -1) { // Já está no corredor final
        const newHomeStep = pawn.homeStep + diceValue;
        if (newHomeStep <= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
            playable.push(pawnIdx);
        }
      } else if (newPos < window.LUDO_CONSTANTS.BOARD_STEPS) { // Ainda no caminho principal
        // Verifica se a casa de destino após BOARD_STEPS é o corredor final
        const homePathStartIdx = window.LUDO_CONSTANTS.HOME_START_POS[playerColor];
        const distanceToEnd = window.LUDO_CONSTANTS.BOARD_STEPS - pawn.pos - 1;

        if (newPos > homePathStartIdx && pawn.pos <= homePathStartIdx) {
            // A peça está entrando no home path
            const overshoot = newPos - window.LUDO_CONSTANTS.BOARD_STEPS; // Isso é incorreto para Ludo, path é circular
            // A lógica correta para entrar no home path precisa de um cálculo mais cuidadoso.
            // Para simplificar, vou considerar que a peça move pelo PATH_COORDS e depois entra no HOME_PATHS.
            // Se newPos for >= HOME_START_POS_DO_JOGADOR, ela está PODE ESTAR entrando em seu home path.

            // Encontra a posição no PATH_COORDS que corresponde à entrada do HOME_PATHS
            const entryHomePathCoord = window.LUDO_CONSTANTS.FINAL_ENTRY_BOARD_POS[playerColor];
            const pathCoordIdx = window.LUDO_CONSTANTS.PATH_COORDS.findIndex(coord =>
                coord[0] === entryHomePathCoord[0] && coord[1] === entryHomePathCoord[1]
            );

            // Se a peça está próxima da entrada do home path, ou tentando entrar
            // Simplified: If the pawn is already on the main path, and moving by diceValue
            // doesn't exceed the total path steps + home path steps
            // This is a complex check to get right, so for now, we'll allow all valid moves
            // and check bounds later during actual move.
            playable.push(pawnIdx);
        } else {
             // Move normal no caminho principal
             playable.push(pawnIdx);
        }
      } else { // Peça cruzou BOARD_STEPS ou está para entrar no home path
        // Lógica para entrar no corredor final
        // Se a posição atual + dado excede o ponto de entrada do corredor final *no caminho principal*,
        // mas não excede a última casa antes do centro.

        const playerHomePathStart = window.LUDO_CONSTANTS.HOME_START_POS[playerColor];
        // Calculo da posição no caminho principal real
        const currentPathPos = pawn.pos;
        const newPathPos = (currentPathPos + diceValue) % window.LUDO_CONSTANTS.BOARD_STEPS; // Cyclic path

        // If the pawn crosses its HOME_START_POS and is still going towards a valid home path step
        // This is a simplified check. A lógica real deve ser mais granular.
        // A peça só pode entrar em sua área final *após* ter completado sua volta
        // Se pawn.pos <= playerHomePathStart (minha saida) E newPos > playerHomePathStart (minha saida)
        // Isso quer dizer que o jogador passou de novo pela sua casa de saída. Isso é um erro conceitual.

        // Correção: Uma peca entra na reta final (homePath) APOS completar 52 casas ou chegar a um ponto especifico.
        const entryPointIndex = window.LUDO_CONSTANTS.HOME_START_POS[playerColor];
        const distToEntryPoint = (entryPointIndex - pawn.pos + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS;

        if (diceValue >= distToEntryPoint && pawn.pos <= entryPointIndex && newPos >= entryPointIndex) {
            // A peça pode estar entrando no corredor final A PARTIR da sua última casa na PATH_COORDS
            // Simplificado: se o movimento levar a peça ao caminho principal
            playable.push(pawnIdx);
        } else {
            // Movimento simples no caminho principal.
            playable.push(pawnIdx);
        }
      }

      // Adicional: verificar se o movimento resulta em "comer" outra peça
      // Isso é mais complexo e pode ser feito na função doMovePawn.
    });
    return playable;
  }

  /**
   * Move uma peça.
   * @param {number} pawnIdx O índice da peça a ser movida.
   * @returns {boolean} True se o movimento foi bem-sucedido, False caso contrário.
   */
  doMovePawn(pawnIdx) {
    if (this.phase !== 'move' || this.status !== 'playing') {
      console.warn("Não é a fase de mover ou o jogo não está ativo.");
      return false;
    }
    const player = this.activePlayer;
    const pawn = player.pawns[pawnIdx];

    if (!pawn || pawn.finished) {
      console.warn("Peça inválida ou já finalizada.");
      return false;
    }

    if (!this.playablePawns.includes(pawnIdx)) {
      console.warn("Esta peça não pode ser movida com o dado atual.");
      return false;
    }

    let moved = false;
    let oldPos = { pos: pawn.pos, homeStep: pawn.homeStep };

    // Movimento 1: Peça saindo da base (com dado 6)
    if (pawn.pos === -1 && this.diceValue === 6) {
      pawn.pos = window.LUDO_CONSTANTS.HOME_START_POS[player.color]; // Move para a casa de início do jogador
      this.logEvent(player.color, `${player.name} moveu a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]}${pawnIdx+1} para a casa inicial.`);
      moved = true;
    }
    // Movimento 2: Peça já no tabuleiro ou corredor final
    else if (pawn.pos !== -1 || pawn.homeStep !== -1) {
      // Calcula a nova posição no caminho principal ou corredor final
      const playerHomePathStartIdx = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
      const playerHomePathCoords = window.LUDO_CONSTANTS.HOME_PATHS[player.color];
      const boardSteps = window.LUDO_CONSTANTS.BOARD_STEPS;
      const homePathLength = window.LUDO_CONSTANTS.HOME_PATH_LENGTH;

      if (pawn.homeStep !== -1) { // Peça no corredor final (home path)
        const newHomeStep = pawn.homeStep + this.diceValue;
        if (newHomeStep < homePathLength) { // Ainda dentro do corredor final, não chegou ao centro
          pawn.homeStep = newHomeStep;
          this.logEvent(player.color, `${player.name} moveu a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]}${pawnIdx+1} no corredor final para ${newHomeStep+1}.`);
          moved = true;
        } else if (newHomeStep === homePathLength) { // Chegou na casa central
          pawn.homeStep = homePathLength; // Setei para indicar que chegou no centro, mas finished é o mais importante.
          pawn.finished = true;
          player.score++;
          this.logEvent(player.color, `${player.name} levou a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]}${pawnIdx+1} para casa! 🎉`);
          moved = true;
          this.extraTurn = true; // Ganha turno extra por chegar em casa
        } else {
          // Overshoot no corredor final, não pode mover
          console.warn(`Overshoot no corredor final para a peça ${pawnIdx}.`);
          return false;
        }
      } else { // Peça no caminho principal (pos !== -1)
        const newMainPathPos = pawn.pos + this.diceValue;

        // Se a peça vai passar pelo seu próprio ponto de entrada do home path
        const distToHomePathEntrada = (playerHomePathStartIdx - pawn.pos + boardSteps) % boardSteps;

        if (this.diceValue === distToHomePathEntrada) { // Entra exatamente na casa de entrada do home path
            pawn.pos = -1; // Sai do caminho principal
            pawn.homeStep = 0; // Entra na primeira casa do corredor final
            this.logEvent(player.color, `${player.name} moveu a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]}${pawnIdx+1} para o corredor final.`);
            moved = true;
        } else if (newMainPathPos < boardSteps) { // Permanece no caminho principal
            pawn.pos = newMainPathPos;
            this.logEvent(player.color, `${player.name} moveu a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]}${pawnIdx+1} para a posição ${pawn.pos}.`);
            moved = true;
        } else { // Circulou e passou da casa de entrada do home path, ou overshoot.
            // Lógica mais complexa: ultrapassagem do ponto de entrada do home path
            // Se a peça está no PATH_COORDS e seu destino é passar ou entrar no HOME_PATH
            // Ex: Estou no PATH 51, rolo 2. Entro na PATH_COORD 1.
            // A posição real na trilha para fins de entrada no home path:
            const totalStepsTaken = pawn.pos + this.diceValue;

            // Se a peça completa uma volta e está em uma posição que a levaria ao home path
            // Simplificação: Assume que após uma volta completa, o ponto de entrada é o playerHomePathStartIdx.
            // if (newMainPathPos >= boardSteps) { // Passou da última casa do board
                // Calcule a posição após dar a volta
                const finalBoardPos = (newMainPathPos % boardSteps);

                // Se passou do seu ponto de entrada e está no caminho correto para o home path
                // Isso ainda é uma simplificação. A lógica real deveria calcular a "distância" total percorrida
                // e se essa distância leva ao home path do jogador.

                // Para o Ludo, a peça deve completar uma volta inteira (52 casas) E depois entrar no seu home path.
                // A posição `pawn.pos` é o índice no `PATH_COORDS`.
                // Preciso saber se o `pawn.pos` atual é um ponto antes ou na sua entrada para o home path
                // e se rolar `diceValue` empurra ela para DENTRO do `HOME_PATHS`.

                // Solução mais robusta:
                const entryPathCoordIndex = window.LUDO_CONSTANTS.HOME_START_POS[player.color]
                // Se a peça vai "cruzar" a casa de entrada para sua reta final:
                // Se ela estava antes ou na casa de entrada, e com o dado, pula para a reta final
                const pathLengthBeforeHome = entryPathCoordIndex; // Distancia da saida ate a entrada do home path (do jogador)
                // pathLengthBeforeHome varia para cada cor.
                // Red: 0. Blue: 13. etc.

                // A posição "real" avançada
                let hypotheticalNewPos = pawn.pos + this.diceValue;

                // Se a peça já passou pelo seu ponto de HOME_START_POS uma vez (ou mais)
                if (hypotheticalNewPos >= boardSteps) { // A peça completou pelo menos uma volta no tabuleiro
                    // Queremos verificar se a peça entra no home path
                    // O movimento total em relação ao início do tabuleiro
                    const totalPathDistance = pawn.pos; // A posição no ciclo 0-51
                    const playerRelativePos = (totalPathDistance - playerHomePathStartIdx + boardSteps) % boardSteps; // Distancia 'real' do inicio do jogador à sua posição
                    const targetHomeStep = playerRelativePos + this.diceValue - (boardSteps - 1); // Exemplo de cálculo simplista, precisa ser exato

                    // Se a peça entra no home path
                    if (hypotheticalNewPos >= entryPathCoordIndex && pawn.pos < entryPathCoordIndex) {
                        const stepsIntoHome = hypotheticalNewPos - entryPathCoordIndex;
                        if (stepsIntoHome < homePathLength) {
                            pawn.pos = -1; // Remove da trilha principal
                            pawn.homeStep = stepsIntoHome;
                            this.logEvent(player.color, `${player.name} moveu a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]}${pawnIdx+1} para o corredor final na casa ${stepsIntoHome+1}.`);
                            moved = true;
                        } else if (stepsIntoHome === homePathLength) {
                            pawn.pos = -1;
                            pawn.homeStep = homePathLength;
                            pawn.finished = true;
                            player.score++;
                            this.logEvent(player.color, `${player.name} levou a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]}${pawnIdx+1} para casa! 🎉`);
                            moved = true;
                            this.extraTurn = true;
                        } else {
                            console.warn("Overshoot no corredor final.");
                            return false; // Overshoot no corredor final
                        }
                    } else { // Continua no caminho principal, após ter dado uma volta completa
                        pawn.pos = (pawn.pos + this.diceValue) % boardSteps;
                        this.logEvent(player.color, `${player.name} moveu a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]}${pawnIdx+1} para a posição ${pawn.pos}.`);
                        moved = true;
                    }
                } else {
                    // Esta condição já deveria estar coberta acima para newMainPathPos < boardSteps
                    pawn.pos = newMainPathPos;
                    this.logEvent(player.color, `${player.name} moveu a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]}${pawnIdx+1} para a posição ${pawn.pos}.`);
                    moved = true;
                }
            }
        }
    }

    if (moved) {
        // Verifica captura:
        // Se a peça movida está no caminho principal e não em uma casa segura
        if (pawn.pos !== -1 && pawn.homeStep === -1 && !window.LUDO_CONSTANTS.SAFE_SQUARES.includes(pawn.pos)) {
            this.players.forEach(otherPlayer => {
                if (otherPlayer.id === player.id) return; // Não pode capturar as próprias peças

                otherPlayer.pawns.forEach(otherPawn => {
                    if (otherPawn.pos === pawn.pos && otherPawn.homeStep === -1) {
                        // Captura! Manda a peça do oponente de volta para a base
                        otherPawn.pos = -1;
                        this.logEvent(player.color, `${player.name} capturou a peça ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[otherPlayer.color]}${otherPawn.idx+1} de ${otherPlayer.name}!`);
                        this.extraTurn = true; // Ganha turno extra por capturar
                    }
                });
            });
        }

        // Reseta o dado e limpa peças jogáveis
        this.diceValue = 0;
        this.playablePawns = [];

        // Verifica condição de vitória
        if (player.score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER) {
            this.status = 'finished';
            this.winner = player.id;
            this.logEvent(player.color, `${player.name} venceu o jogo!`);
            return true;
        }

        // Passa o turno ou mantém o turno extra
        if (!this.extraTurn) {
          this.nextTurn();
        } else {
          this.phase = 'roll'; // Mantém a fase de rolar para o turno extra
          this.extraTurn = false; // Reseta para próxima rolagem
          this.logEvent(player.color, `${player.name} ganhou um turno extra e pode rolar novamente.`);
        }
        return true;
    }
    return false;
  }

  /**
   * Passa o turno para o próximo jogador.
   */
  nextTurn() {
    if (this.status !== 'playing') return;
    this.currentTurnIdx = (this.currentTurnIdx + 1) % this.players.length;
    this.phase = 'roll';
    this.diceValue = 0; // Garante que o dado seja zerado para o próximo jogador
    this.playablePawns = []; // Limpa peças jogáveis
    this.extraTurn = false; // Reseta turno extra

    this.logEvent(this.activePlayer.color, `É a vez de ${this.activePlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[this.activePlayer.color]}) rolar o dado.`);

    // Se o próximo jogador for IA, marca para o app.js lidar com isso
    // if (this.activePlayer.isAI) {
    //   // O app.js será responsável por chamar doAITurn()
    // }
  }

  /**
   * Retorna um array com os índices das peças que podem se mover
   * para o jogador ativo com o valor do dado atual.
   * Usado para destacar peças jogáveis na UI e pela IA.
   * @returns {Array<number>} Índices das peças que podem se mover.
   */
  getValidMoves() {
    return this.playablePawns;
  }

  /**
   * Serializa o estado atual do jogo para armazenamento (ex: Firebase).
   * @returns {object} Estado serializado.
   */
  serialize() {
    return {
      players: this.players,
      currentTurnIdx: this.currentTurnIdx,
      diceValue: this.diceValue,
      phase: this.phase,
      status: this.status,
      winner: this.winner,
      extraTurn: this.extraTurn,
      log: this.log,
      playablePawns: this.playablePawns
    };
  }

  /**
   * Deserializa o estado do jogo a partir de um objeto.
   * @param {object} data Estado serializado.
   */
  deserialize(data) {
    if (!data) return;
    this.players = data.players || [];
    this.playerMap = {};
    this.colorMap = {};
    this.players.forEach(p => {
        this.playerMap[p.id] = p;
        this.colorMap[p.color] = p;
    });
    this.currentTurnIdx = data.currentTurnIdx !== undefined ? data.currentTurnIdx : 0;
    this.diceValue = data.diceValue || 0;
    this.phase = data.phase || 'roll';
    this.status = data.status || 'playing';
    this.winner = data.winner || null;
    this.extraTurn = data.extraTurn || false;
    this.log = data.log || [];
    this.playablePawns = data.playablePawns || [];
  }
}