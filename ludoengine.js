/* =====================================================
   LudoEngine - Lógica principal do jogo de Ludo
   Depende de `ludo_constants.js` carregado globalmente.
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
    this.status = 'waiting';// 'waiting', 'playing', 'finished'
    this.winner = null;     // ID do jogador vencedor
    this.extraTurn = false; // Indica se o jogador ganhou uma jogada extra (rolar 6 ou capturar)
    this.log = [];          // Histórico de eventos do jogo
  }

  /**
   * Configura o jogo com os jogadores.
   * @param {Array<Object>} playersConfig Lista de objetos com {id, name, isAI, color, photoURL}.
   */
  setupGame(playersConfig) {
    this.reset(); // Garante um estado limpo antes de configurar um novo jogo

    this.players = playersConfig.map(p => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      color: p.color,
      photoURL: p.photoURL,
      pawns: Array(window.LUDO_CONSTANTS.PIECES_PER_PLAYER).fill(null).map(() => ({
        pos: -1,      // -1 para base, 0-51 para trilha principal
        homeStep: -1, // -1 para não no corredor final, 0-5 para casas do corredor
        finished: false // Se a peça chegou ao centro
      })),
      score: 0 // Peças que chegaram ao centro
    }));

    // Define o primeiro jogador como o currentTurn
    this.currentTurn = 0;
    this.status = 'playing';
    this.logEvent(null, 'O jogo começou!');
  }

  /**
   * Retorna o jogador ativo no turno atual.
   * @returns {Object} Objeto do jogador atual.
   */
  get activePlayer() {
    return this.players[this.currentTurn];
  }

  /**
   * Rola o dado.
   * @returns {number} O valor do dado.
   */
  rollDice() {
    if (this.status !== 'playing' || this.phase !== 'roll') {
      console.warn("Não é permitido rolar o dado agora.");
      return this.diceValue;
    }

    this.diceValue = Math.floor(Math.random() * 6) + 1;
    this.phase = 'move'; // Muda para fase de movimento
    this.extraTurn = (this.diceValue === 6); // Rolar 6 dá jogada extra

    this.logEvent(this.activePlayer.color, `${this.activePlayer.name} rolou ${this.diceValue}.`);

    // Se não houver movimentos válidos com o dado atual, passa o turno
    if (!this.hasValidMoves()) {
      this.logEvent(null, `Nenhum movimento possível para ${this.activePlayer.name}.`);
      this.nextTurn();
    }
    return this.diceValue;
  }

  /**
   * Move uma peça específica do jogador ativo.
   * @param {number} pawnIndex Índice da peça (0 a PIECES_PER_PLAYER-1) a ser movida.
   * @returns {boolean} True se a jogada foi bem-sucedida, false caso contrário.
   */
  doMovePawn(pawnIndex) {
    if (this.status !== 'playing' || this.phase !== 'move' || this.diceValue === 0) {
      console.warn("Não é permitido mover peça agora ou dado não rolado.");
      return false;
    }

    const player = this.activePlayer;
    const pawn = player.pawns[pawnIndex];

    if (!pawn) {
      console.warn(`Peça com índice ${pawnIndex} não encontrada para o jogador ${player.name}.`);
      return false;
    }

    // Valida se o movimento é legal para a peça escolhida
    if (!this._isValidMove(player, pawnIndex)) {
      this.logEvent(player.color, `Movimento inválido para a peça ${pawnIndex}.`);
      return false;
    }

    let movedFrom = null; // Para o log
    let captured = false; // Para o log e jogada extra

    // Lógica para tirar peça da base
    if (pawn.pos === -1) {
      movedFrom = 'base';
      pawn.pos = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
      this.logEvent(player.color, `${player.name} tirou uma peça da base.`);
      this.extraTurn = true; // Sair da base com 6 dá jogada extra.
    } else {
      // Lógica para mover peça já no tabuleiro
      movedFrom = `casa ${pawn.pos}`;
      const targetPos = this._calculateTargetPosition(player, pawn, this.diceValue);

      // Captura: se a nova posição for ocupada por uma peça de outro jogador (e não for segura)
      const capturedPawn = this._checkCapture(player, targetPos);
      if (capturedPawn) {
        this.logEvent(player.color, `${player.name} capturou uma peça!`);
        captured = true;
        this.extraTurn = true; // Capturar dá jogada extra
        // Manda peça capturada de volta para a base
        capturedPawn.pawn.pos = -1;
        capturedPawn.pawn.homeStep = -1;
        capturedPawn.pawn.finished = false;
        // Reinicializa o log dessa peça
        this.logEvent(capturedPawn.player.color, `${capturedPawn.player.name}'s peça foi capturada e voltou para a base.`);
      }

      // Atualiza a posição da peça
      if (targetPos.type === 'main') {
        pawn.pos = targetPos.index;
      } else if (targetPos.type === 'homePath') {
        pawn.pos = -2; // Indica que está no corredor final (não mais na trilha principal)
        pawn.homeStep = targetPos.index;
      } else if (targetPos.type === 'finished') {
        pawn.pos = -2; // Já não no tabuleiro principal
        pawn.homeStep = -2; // Já não no corredor final
        pawn.finished = true;
        player.score++; // Incrementa o score do jogador
        this.logEvent(player.color, `${player.name} levou uma peça para casa!`);
        this.extraTurn = true; // Levar peça para casa dá jogada extra
      }
    }

    this.logEvent(player.color, `${player.name} moveu a peça ${pawnIndex} de ${movedFrom} com o dado ${this.diceValue}.`);
    this.diceValue = 0; // Zera o dado após o movimento
    this.phase = 'roll'; // Redefine para a fase de rolar dado.

    // Verifica condição de vitória
    if (player.score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER) {
      this.status = 'finished';
      this.winner = player.id;
      this.logEvent(null, `${player.name} venceu o jogo! 🎉`);
    } else {
      // Se não houver jogada extra, passa o turno
      if (!this.extraTurn) {
        this.nextTurn();
      } else {
        // Se há jogada extra, o currentTurn permanece o mesmo e a fase volta para 'roll'
        this.logEvent(player.color, `${player.name} ganhou uma jogada extra!`);
      }
    }

    return true; // Movimento bem-sucedido
  }

  /**
   * Calcula a posição final de uma peça após o movimento.
   * Considera entrada no caminho principal, movimento na trilha, e entrada no corredor final.
   * @param {Object} player O objeto do jogador.
   * @param {Object} pawn O objeto da peça.
   * @param {number} steps Quantidade de casas para mover.
   * @returns {Object} { type: 'main'|'homePath'|'finished', index: number }
   */
  _calculateTargetPosition(player, pawn, steps) {
    if (pawn.pos === -1 && steps === 6) {
      // Sair da base
      return { type: 'main', index: window.LUDO_CONSTANTS.HOME_START_POS[player.color] };
    }

    // Movimento na trilha principal
    if (pawn.pos !== -1 && pawn.homeStep === -1) {
      let currentPathIndex = pawn.pos;
      const targetPathIndex = currentPathIndex + steps;

      // Verifica se a peça vai para o corredor final
      const entryToHomePathColorIndex = (window.LUDO_CONSTANTS.HOME_START_POS[player.color] + window.LUDO_CONSTANTS.BOARD_STEPS - 1) % window.LUDO_CONSTANTS.BOARD_STEPS;
      const willEnterHomePath = currentPathIndex <= entryToHomePathColorIndex && targetPathIndex > entryToHomePathColorIndex;

      // Calcular o deslocamento para o home path
      if(willEnterHomePath) {
        const stepsIntoHomePath = targetPathIndex - entryToHomePathColorIndex -1;
        if(stepsIntoHomePath >= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
          // Passou do corredor final, foi para o centro
          return { type: 'finished' };
        }
        return { type: 'homePath', index: stepsIntoHomePath };
      }

      // Continua na trilha principal, faz o loop se necessário
      return { type: 'main', index: targetPathIndex % window.LUDO_CONSTANTS.BOARD_STEPS };
    }

    // Movimento no corredor final (homePath)
    if (pawn.homeStep !== -1) {
      const targetHomeStep = pawn.homeStep + steps;
      if (targetHomeStep >= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
        return { type: 'finished' };
      }
      return { type: 'homePath', index: targetHomeStep };
    }

    // Peça já finalizada ou em estado desconhecido
    return { type: 'invalid' };
  }


  /**
   * Verifica se o jogador ativo tem algum movimento válido após rolar o dado.
   * @returns {boolean} True se há movimentos válidos, false caso contrário.
   */
  hasValidMoves() {
    return this.getValidMoves().length > 0;
  }

  /**
   * Retorna uma lista de índices de peças que podem ser movidas.
   * @returns {Array<number>} Índices das peças que podem ser movidas (0 a 3).
   */
  getValidMoves() {
    const player = this.activePlayer;
    if (this.diceValue === 0 || this.status !== 'playing') return [];

    const validPawnIndexes = [];

    player.pawns.forEach((pawn, pawnIndex) => {
      // Peças já finalizadas não podem se mover
      if (pawn.finished) return;

      // Peça na base: só pode sair com 6
      if (pawn.pos === -1) {
        if (this.diceValue === 6) {
          // Verifica se a casa de saída já está ocupada por outra peça do MESMO jogador
          const startCoords = window.LUDO_CONSTANTS.ENTRY_POS[player.color];
          const isBlocked = player.pawns.some(
            (otherPawn, otherPawnIdx) => otherPawnIdx !== pawnIndex && otherPawn.pos !== -1 &&
            window.LUDO_CONSTANTS.PATH_COORDS[otherPawn.pos][0] === startCoords[0] &&
            window.LUDO_CONSTANTS.PATH_COORDS[otherPawn.pos][1] === startCoords[1]
          );
          if (!isBlocked) {
            validPawnIndexes.push(pawnIndex);
          }
        }
        return;
      }

      // Peça já no tabuleiro principal ou corredor final (home path)
      const targetPositionResult = this._calculateTargetPosition(player, pawn, this.diceValue);

      if (targetPositionResult.type === 'invalid') {
        return; // Não é um movimento válido
      }

      // Antes de adicionar, verificar se a casa de destino não está bloqueada por duas peças do próprio jogador
      let targetCoords = null;
      if (targetPositionResult.type === 'main') {
          targetCoords = window.LUDO_CONSTANTS.PATH_COORDS[targetPositionResult.index];
      } else if (targetPositionResult.type === 'homePath') {
          targetCoords = window.LUDO_CONSTANTS.HOME_PATHS[player.color][targetPositionResult.index];
      } else if (targetPositionResult.type === 'finished') {
          // Chegar ao fim é sempre válido se o caminho permitiu
          validPawnIndexes.push(pawnIndex);
          return;
      }

      // Verifica se a casa de destino está bloqueada por 2 ou mais peças do próprio jogador
      // Nota: No Ludo padrão, uma casa NÃO pode ser ocupada por mais de duas peças.
      // Se já há duas peças da MESMA cor, a casa está BLOCADA.
      // Se for uma casa segura e já tiver uma peça, permite que outra peça da mesma cor se junte.
      const pawnsAtTarget = player.pawns.filter(
        (otherPawn, otherPawnIdx) => otherPawnIdx !== pawnIndex &&
        (
            (targetPositionResult.type === 'main' && otherPawn.pos === targetPositionResult.index) ||
            (targetPositionResult.type === 'homePath' && otherPawn.homeStep === targetPositionResult.index)
        )
      );

      // Regra: Uma casa da trilha principal ou corredor final não pode ter mais de duas peças de quaisquer jogadores.
      // E, mais especificamente, uma casa NÃO SEGURA não pode ter mais de uma peça do MESMO jogador.
      // Casas SEGURAS podem ter múltiplas peças do MESMO jogador.
      const isSafeSquare = (targetPositionResult.type === 'main' && window.LUDO_CONSTANTS.SAFE_SQUARES_INDEXES.includes(targetPositionResult.index));

      // Busca por peças de OUTROS jogadores na casa de destino
      const otherPlayersPawnsAtTarget = this.players.flatMap(
        (p) => p.color !== player.color ? p.pawns.filter(
          (op) =>
            (targetPositionResult.type === 'main' && op.pos === targetPositionResult.index) ||
            (targetPositionResult.type === 'homePath' && op.homeStep === targetPositionResult.index)
        ) : []
      );


      // Se não é casa segura E já tem 1+ peça do adversário, ou 2 peças da mesma cor, o movimento não é válido
      if (pawnsAtTarget.length >= 2) {
          return; // A casa já tem 2 peças do próprio jogador, bloqueado
      }
      if (!isSafeSquare && pawnsAtTarget.length === 1 && otherPlayersPawnsAtTarget.length === 0) {
          // Se não é segura e já tem uma peça minha, e não tem adversário (que seria captura),
          // então não posso mover OUTRA peça minha para lá.
          return;
      }
      if (otherPlayersPawnsAtTarget.length === 2 && !isSafeSquare && !capturedPawn) {
          // Se já tem duas peças de adversários (não capturáveis) e não é seguro, bloqueado.
          return;
      }

      validPawnIndexes.push(pawnIndex);
    });

    return validPawnIndexes;
  }

  /**
   * Verifica se uma peça pode ser capturada na posição alvo.
   * @param {Object} movingPlayer O jogador que está movendo.
   * @param {Object} targetPositionResult A posição alvo ({type, index}).
   * @returns {Object | null} Objeto {player, pawn} da peça capturada, ou null.
   */
  _checkCapture(movingPlayer, targetPositionResult) {
    if (targetPositionResult.type !== 'main') return null; // Captura só ocorre na trilha principal.
    const targetIndex = targetPositionResult.index;

    // Não pode capturar em casas seguras (estrelas)
    if (window.LUDO_CONSTANTS.SAFE_SQUARES_INDEXES.includes(targetIndex)) return null;

    for (const opponentPlayer of this.players) {
      if (opponentPlayer.id !== movingPlayer.id) { // Não verifica as próprias peças
        // Verifica se há peças do oponente na casa alvo que não estão em uma casa segura
        const capturedPawn = opponentPlayer.pawns.find(pawn =>
          pawn.pos === targetIndex && pawn.homeStep === -1 && !pawn.finished
        );

        if (capturedPawn) {
          return { player: opponentPlayer, pawn: capturedPawn };
        }
      }
    }
    return null;
  }

  /**
   * Verifica se um movimento é válido sem executar.
   * Útil para `getValidMoves` e para a `AI`.
   * @param {Object} player O objeto do jogador.
   * @param {number} pawnIndex Índice da peça a mover.
   * @returns {boolean} True se o movimento é legal, false caso contrário.
   */
  _isValidMove(player, pawnIndex) {
    // Basicamente, chama getValidMoves e verifica se pawnIndex está lá.
    const validMoves = this.getValidMoves();
    return validMoves.includes(pawnIndex);
  }

  /**
   * Passa o turno para o próximo jogador.
   */
  nextTurn() {
    this.diceValue = 0; // Sempre zera o dado quando o turno muda
    this.extraTurn = false; // Reseta a jogada extra

    this.currentTurn = (this.currentTurn + 1) % this.players.length;

    // Pula jogadores que já terminaram ou são inválidos
    while (this.activePlayer.score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER || this.activePlayer.id === null) {
      this.currentTurn = (this.currentTurn + 1) % this.players.length;
      if (this.currentTurn === 0) { // Se deu uma volta completa e não achou ninguém, algo está errado
          console.warn("Nenhum jogador válido para continuar o turno.");
          this.status = 'finished'; // Força o fim do jogo
          this.logEvent(null, 'Jogo encerrado por falta de jogadores válidos.');
          return;
      }
    }

    this.phase = 'roll'; // Próximo jogador sempre começa rolando o dado
    this.logEvent(this.activePlayer.color, `É a vez de ${this.activePlayer.name}.`);
  }


  /**
   * Registra um evento no log do jogo.
   * @param {string|null} color Cor do jogador associado ao evento (ou null para neutro).
   * @param {string} message Mensagem do evento.
   */
  logEvent(color, message) {
    this.log.push({ timestamp: Date.now(), color: color, message: message });
    // Mantém o log com um tamanho razoável (ex: últimas 50 entradas)
    if (this.log.length > 50) {
      this.log.shift();
    }
  }

  /**
   * Serializa o estado atual do jogo para armazenamento (ex: Firebase).
   * @returns {string} Estado do jogo em formato JSON.
   */
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

  /**
   * Deserializa o estado do jogo de JSON (ex: do Firebase).
   * @param {string} jsonString Estado do jogo em formato JSON.
   */
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