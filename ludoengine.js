// ludoengine.js
/* =====================================================
   LudoEngine - Lógica principal do jogo de Ludo
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
    this.winner = null;     // ID/color do jogador vencedor
    this.extraTurn = false; // Indica se o jogador ganhou uma jogada extra (rolar 6 ou capturar)
    this.log = [];          // Histórico de eventos do jogo
    this.mode = 'ai';       // 'ai' ou 'multiplayer'
  }

  /**
   * Configura o jogo com os jogadores.
   * @param {Array<object>} playerConfigs Array de objetos {id, name, color, isAI, photoURL (opicional)}
   */
  setupGame(playerConfigs, mode = 'ai') {
    this.reset();
    this.mode = mode; // Define o modo de jogo

    if (!playerConfigs || playerConfigs.length === 0) {
      throw new Error("Configuração de jogadores inválida.");
    }

    this.players = playerConfigs.map(config => ({
      id: config.id,
      name: config.name,
      color: config.color,
      isAI: config.isAI,
      photoURL: config.photoURL || null,
      pawns: Array(window.LUDO_CONSTANTS.PIECES_PER_PLAYER).fill(null).map(() => ({
        pos: -1,        // -1 = na base, 0-51 = no tabuleiro, 100 = finalizado
        homeStep: -1,   // -1 = não no corredor final, 0-5 = no corredor final
        finished: false
      })),
      score: 0, // Peças que chegaram ao centro
      hasRolledSix: false // Para controlar se rolou um 6 (para sair da base)
    }));

    this.status = 'playing';
    this.logEvent('System', 'Jogo iniciado com ' + this.players.length + ' jogadores.');
  }

  /**
   * Retorna o jogador ativo no turno atual.
   * @returns {object} O objeto do jogador.
   */
  get activePlayer() {
    return this.players[this.currentTurn];
  }

  /**
   * Rola o dado e inicia a fase de movimento.
   */
  rollDice() {
    if (this.phase !== 'roll' || this.status !== 'playing') {
      this.logEvent(this.activePlayer.color, 'Não é possível rolar o dado agora.');
      return;
    }

    this.diceValue = Math.floor(Math.random() * 6) + 1;
    this.logEvent(this.activePlayer.color, `${this.activePlayer.name} rolou um ${this.diceValue}.`);

    if (this.diceValue === 6) {
      this.extraTurn = true;
    } else {
      this.extraTurn = false; // Reseta para não dar extra turn se não for 6
    }

    const playablePawns = this.getPlayablePawns(this.diceValue);

    if (playablePawns.length === 0) {
      this.logEvent(this.activePlayer.color, `Nenhuma peça pode mover ${this.diceValue} casas. Passando a vez.`);
      // Se não há movimentos, o turno é passado imediatamente.
      this.phase = 'roll'; // Reseta para a próxima rolagem
      this.diceValue = 0;   // Reseta o dado
      this.nextTurn();
      return;
    }

    this.phase = 'move'; // Agora o jogador deve selecionar uma peça para mover.
    // As peças jogáveis serão destacadas na UI.
  }

  /**
   * Retorna os índices dos peões que podem ser movidos com o valor do dado atual.
   * @param {number} diceValue O valor do dado.
   * @returns {Array<number>} Array de índices dos peões jogáveis.
   */
  getPlayablePawns(diceValue) {
    if (this.status !== 'playing') return [];
    const player = this.activePlayer;
    const playable = [];

    player.pawns.forEach((pawn, index) => {
      if (pawn.finished) return;

      if (pawn.pos === -1) { // Peça na base
        if (diceValue === 6) {
          playable.push(index); // Peça pode sair da base
        }
      } else if (pawn.homeStep !== -1) { // Peça no corredor final
        if (pawn.homeStep + diceValue < window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
          playable.push(index); // Pode mover no corredor final
        } else if (pawn.homeStep + diceValue === window.LUDO_CONSTANTS.HOME_PATH_LENGTH - 1) {
          // Exatamente o número de casas para a casa central.
          playable.push(index);
        }
      } else { // Peça no caminho principal
        // Posicionamento no caminho principal, perto da entrada para o corredor final
        const currentPathIndex = pawn.pos;
        const potentialNextPathIndex = currentPathIndex + diceValue;
        const playerHomeEntryIndex = window.LUDO_CONSTANTS.HOME_START_POS[player.color];

        let canMove = true;
        // Verifica se a peça pode entrar no corredor final
        if (player.color === 'red' && currentPathIndex < window.LUDO_CONSTANTS.BOARD_STEPS && potentialNextPathIndex >= window.LUDO_CONSTANTS.BOARD_STEPS) {
             // Peça Vermelha indo para seu corredor final após looping (se o tabuleiro não tivesse 0-47, mas 0-51)
             // Ajuste para um loop circular do tabuleiro.
        }

        // Caso geral: mover no caminho principal
        if (pawn.pos >= 0 && pawn.pos < window.LUDO_CONSTANTS.BOARD_STEPS) {
          // Entrar no corredor final
          const stepsToHomeEntry = (window.LUDO_CONSTANTS.HOME_START_POS[player.color] - pawn.pos + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS;
          if (diceValue === (stepsToHomeEntry % window.LUDO_CONSTANTS.BOARD_STEPS) && stepsToHomeEntry !== 0) { // Se o número do dado leva exato à entrada
              playable.push(index);
          } else if (diceValue < (stepsToHomeEntry % window.LUDO_CONSTANTS.BOARD_STEPS) || stepsToHomeEntry === 0) {
              // Se o dado é menor ou já passou da entrada, pode seguir no caminho principal
              playable.push(index);
          } else if (diceValue > stepsToHomeEntry && diceValue < (stepsToHomeEntry + window.LUDO_CONSTANTS.HOME_PATH_LENGTH)) {
              // Se o dado leva a peça para dentro do corredor final após passar a entrada
              playable.push(index);
          } else if (pawn.homeStep === -1) { // Se não está no corredor final E não está na base
              playable.push(index);
          }
        }
      }
    });
    return playable;
  }


  /**
   * Move um peão no tabuleiro.
   * @param {number} pawnIndex O índice do peão do jogador ativo.
   * @returns {boolean} True se o movimento foi bem-sucedido, False caso contrário.
   */
  doMovePawn(pawnIndex) {
    if (this.phase !== 'move' || this.status !== 'playing') {
      this.logEvent(this.activePlayer.color, 'Não é possível mover peças agora.');
      return false;
    }

    const player = this.activePlayer;
    const pawn = player.pawns[pawnIndex];
    if (!pawn) return false;

    // Garante que o peão é jogável
    const playablePawns = this.getPlayablePawns(this.diceValue);
    if (!playablePawns.includes(pawnIndex)) {
      this.logEvent(player.color, `Peça ${pawnIndex + 1} de ${player.name} não pode mover ${this.diceValue} casas.`);
      return false;
    }

    let moved = false;
    this.extraTurn = false; // Reseta jogada extra para este movimento

    if (pawn.pos === -1) { // Peça na base
      pawn.pos = window.LUDO_CONSTANTS.HOME_START_POS[player.color]; // Move para a saída da base
      pawn.homeStep = -1;
      this.logEvent(player.color, `Peça ${pawnIndex + 1} de ${player.name} saiu da base.`);
      this.extraTurn = true; // Ganha uma jogada extra ao sair da base
      moved = true;
    } else if (pawn.homeStep !== -1) { // Peça no corredor final
      pawn.homeStep += this.diceValue;
      this.logEvent(player.color, `Peça ${pawnIndex + 1} de ${player.name} moveu ${this.diceValue} casas no corredor final.`);
      if (pawn.homeStep >= window.LUDO_CONSTANTS.HOME_PATH_LENGTH - 1) { // Chegou na última casa do corredor ou passou
        pawn.finished = true;
        pawn.pos = 100; // Marca como finalizado
        pawn.homeStep = window.LUDO_CONSTANTS.HOME_PATH_LENGTH - 1; // Garante que a posição final é a última casa
        player.score++;
        this.logEvent(player.color, `Peça ${pawnIndex + 1} de ${player.name} chegou em casa!`);
        this.extraTurn = true; // Ganha uma jogada extra ao chegar em casa
        moved = true;
      } else {
        moved = true;
      }
    } else { // Peça no caminho principal
      const oldPos = pawn.pos;
      let newPos = (pawn.pos + this.diceValue);

      // Lógica para entrar no corredor final
      const homeEntryPathIndex = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
      // Calcula a quantidade de passos para a entrada do corredor final (circular)
      const distToHomeEntry = (homeEntryPathIndex - oldPos + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS;

      if (this.diceValue > distToHomeEntry && !player.enteredHomePathYet) {
        // Se o dado faz a peça passar direto pela entrada do corredor final
        // Ou seja, antes da entrada, e o dado o leva para dentro do corredor
        const stepsIntoHomePath = this.diceValue - distToHomeEntry;
        pawn.pos = -1; // Não está mais no caminho principal
        pawn.homeStep = stepsIntoHomePath - 1; // -1 porque HOME_PATHS[player.color][0] é a primeira casa.
        this.logEvent(player.color, `Peça ${pawnIndex + 1} de ${player.name} entrou no corredor final.`);
        moved = true;
      } else if (newPos >= window.LUDO_CONSTANTS.BOARD_STEPS) {
        newPos %= window.LUDO_CONSTANTS.BOARD_STEPS; // Volta ao início do tabuleiro
      }

      pawn.pos = newPos;
      this.logEvent(player.color, `Peça ${pawnIndex + 1} de ${player.name} moveu ${this.diceValue} casas.`);
      moved = true;

      // Verifica captura (apenas em casas não-seguras e se não for da própria cor)
      const isSafeSquare = window.LUDO_CONSTANTS.SAFE_SQUARES.includes(newPos);
      if (!isSafeSquare) {
        this.players.forEach(otherPlayer => {
          if (otherPlayer.color === player.color) return; // Não captura suas próprias peças
          otherPlayer.pawns.forEach(otherPawn => {
            // Verifica se um peão de outro jogador está na mesma posição NÃO SAFE
            if (!otherPawn.finished && otherPawn.pos === newPos && otherPawn.homeStep === -1) {
              // Peça capturada volta para a base
              otherPawn.pos = -1;
              otherPawn.homeStep = -1;
              this.logEvent(player.color, `Peça de ${otherPlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[otherPlayer.color]}) foi capturada!`);
              this.extraTurn = true; // Ganha uma jogada extra ao capturar
            }
          });
        });
      }
    }

    this.phase = 'roll'; // Após o movimento, volta para fase de rolar ou próximo turno
    this.diceValue = 0;   // Reseta o dado

    // Verifica condição de vitória
    if (player.score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER) {
      this.winner = player.color;
      this.status = 'finished';
      this.logEvent('System', `${player.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[player.color]}) venceu o jogo!`);
      return true; // Jogo acabou, movimento bem-sucedido
    }

    if (!this.extraTurn) {
      this.nextTurn(); // Se não teve jogada extra, passa a vez.
    }
    return moved;
  }

  /**
   * Passa o turno para o próximo jogador.
   */
  nextTurn() {
    if (this.status !== 'playing') return;

    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    this.logEvent('System', `Vez do jogador ${this.activePlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[this.activePlayer.color]}).`);
    this.phase = 'roll'; // Próximo jogador sempre começa rolando o dado.
    this.diceValue = 0;
    this.extraTurn = false; // Garante que a flag de jogada extra esteja resetada para o próximo turno
  }

  /**
   * Adiciona um evento ao log do jogo.
   * @param {string} type Tipo do evento (e.g., 'System', jogador.color).
   * @param {string} message A mensagem do log.
   */
  logEvent(type, message) {
    this.log.push({ type, message, color: type, timestamp: Date.now() });
    // Limita o log para manter o tamanho razoável
    if (this.log.length > 50) {
      this.log.shift();
    }
  }

  /**
   * Retorna os PAWN_INDICES válidos para movimentar no turno atual.
   * Usado para destacar peças selecionáveis na UI e para a IA.
   * @returns {Array<number>} Array de índices de peões jogáveis.
   */
  getValidMoves() {
    if (this.status !== 'playing' || this.phase !== 'move') return [];
    return this.getPlayablePawns(this.diceValue);
  }

  /**
   * Serializa o estado atual do engine para salvamento (Firebase, histórico).
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
      log: this.log, // Salva o log completo
      mode: this.mode
    };
  }

  /**
   * Deserializa um estado para carregar um jogo.
   * @param {object} jsonString O estado serializado como string JSON.
   */
  deserialize(jsonState) {
    if (typeof jsonState === 'string') {
      jsonState = JSON.parse(jsonState);
    }
    if (!jsonState) {
      console.error("Estado JSON inválido para deserializar.");
      return;
    }
    this.players = jsonState.players || [];
    this.currentTurn = jsonState.currentTurn ?? 0;
    this.diceValue = jsonState.diceValue ?? 0;
    this.phase = jsonState.phase || 'roll';
    this.status = jsonState.status || 'waiting';
    this.winner = jsonState.winner || null;
    this.extraTurn = jsonState.extraTurn ?? false;
    this.log = jsonState.log || [];
    this.mode = jsonState.mode || 'ai';
  }
}