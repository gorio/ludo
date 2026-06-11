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
   * Configura o jogo com os jogadores
   * @param {Array<Object>} playerConfigs Array de objetos { id, name, isAI, color, photoURL? }
   */
  setupGame(playerConfigs) {
    this.reset(); // Zera o estado anterior

    // Define as cores dos jogadores se não estiverem explícitas
    let availableColors = [...window.LUDO_CONSTANTS.LUDO_COLORS];
    this.players = playerConfigs.map((config, index) => {
      const color = config.color || availableColors.shift(); // Atribui cor
      if (!color) console.error("Não há cores suficientes para todos os jogadores!");

      return {
        id: config.id,
        name: config.name,
        color: color,
        isAI: config.isAI,
        photoURL: config.photoURL || null,
        pawns: Array.from({ length: window.LUDO_CONSTANTS.PIECES_PER_PLAYER }, () => ({
          pos: -1,        // -1: base, 0-51: trilha principal, -2: "home" (corredor final)
          homeStep: -1,   // -1: não no corredor final, 0-5: casas no corredor de casa, 6: casa central (finished)
          finished: false // Se a peça chegou na casa central
        })),
        score: 0, // Número de peças que chegaram na casa central
        turnSkipped: false // Se o jogador perdeu a vez de jogar
      };
    });
    this.shufflePlayers(); // Opcional: embaralha a ordem dos jogadores

    this.status = 'playing';
    this.currentTurn = Math.floor(Math.random() * this.players.length); // Começa com um jogador aleatório
    this.logEvent(this.activePlayer.color, `${this.activePlayer.name} começa.`);

    // Garante que o primeiro jogador começa na fase de rolagem
    this.phase = 'roll';
  }

  shufflePlayers() {
    for (let i = this.players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
    }
  }

  get activePlayer() {
    return this.players[this.currentTurn];
  }

  /**
   * Rola o dado.
   * @returns {number} O valor do dado.
   */
  rollDice() {
    if (this.phase !== 'roll' || this.status !== 'playing') return 0;

    this.diceValue = Math.floor(Math.random() * 6) + 1;
    this.logEvent(this.activePlayer.color, `${this.activePlayer.name} rolou ${this.diceValue}.`);

    const possibleMoves = this.getValidMoves();

    if (possibleMoves.length === 0) {
      this.logEvent(this.activePlayer.color, `Sem movimentos para ${this.activePlayer.name}.`);
      this.phase = 'move'; // Temporariamente muda para 'move' para acionar o próximo turno
      this.nextTurn();
      return this.diceValue;
    }

    this.phase = 'move';
    this.extraTurn = false; // Reseta extraTurn

    // Se o jogador rolou 6 e tem peças na base, automaticamente move uma se possível e não tiver outras opções
    if (this.diceValue === 6) {
        const pawnsInBase = this.activePlayer.pawns.filter(p => p.pos === -1 && !p.finished);
        if (pawnsInBase.length > 0) {
            // Se as únicas jogadas válidas são mover da base, faz isso automaticamente
            const movesFromBaseOnly = possibleMoves.every(pawnIdx => this.activePlayer.pawns[pawnIdx].pos === -1);
            if (movesFromBaseOnly && possibleMoves.length === 1) {
                this.doMovePawn(possibleMoves[0]);
                return this.diceValue;
            }
        }
    }
    return this.diceValue;
  }

  /**
   * Retorna uma lista de índices de peões que podem ser movidos.
   * @returns {Array<number>} Índices dos peões que podem mover.
   */
  getValidMoves() {
    const validMoves = [];
    if (this.phase !== 'move' || this.status !== 'playing') return validMoves;

    this.activePlayer.pawns.forEach((pawn, index) => {
      if (pawn.finished) return; // Peças que já chegaram não podem mover

      // Condição para tirar peça da base
      if (pawn.pos === -1) {
        if (this.diceValue === 6) {
          validMoves.push(index); // Pode tirar da base
        }
      } else {
        // Peça já está no tabuleiro ou no corredor final
        if (this.canPawnMove(pawn, this.diceValue)) {
          validMoves.push(index);
        }
      }
    });
    return validMoves;
  }

  /**
   * Verifica se uma peça pode ser movida pelo valor do dado.
   * @param {Object} pawn O objeto da peça.
   * @param {number} dice O valor do dado.
   * @returns {boolean} True se a peça pode mover.
   */
  canPawnMove(pawn, dice) {
    if (pawn.pos === -1 || pawn.finished) return false;

    // Se está no corredor final (home path)
    if (pawn.homeStep !== -1) {
      const newHomeStep = pawn.homeStep + dice;
      return newHomeStep <= window.LUDO_CONSTANTS.HOME_PATH_LENGTH; // Não pode ir além da casa central
    }

    // Está na trilha principal
    const newPos = pawn.pos + dice;
    const playerHomePathStart = this.getPlayerHomePathStartPos(this.activePlayer.color);

    // Se a nova posição cruza ou entra no corredor final do jogador
    if (pawn.pos < playerHomePathStart && newPos >= playerHomePathStart) {
      // Calcula quantos passos entram no corredor final
      const stepsIntoHomePath = newPos - playerHomePathStart;
      return stepsIntoHomePath < window.LUDO_CONSTANTS.HOME_PATH_LENGTH; // Não pode ir além do final
    }

    // Se a nova posição está na trilha principal e não é um movimento inválido (ex: atravessar o ponto de entrada da própria base)
    // Para Ludo tradicional, sempre pode mover na trilha principal, a menos que seja bloqueado.
    // A única "restrição" é se a casa de destino já tem 2 peças do MESMO jogador.
    // Mas essa é uma regra do "move" e não do "can move".
    return true; // Assume que na trilha principal o movimento é sempre possível

  }

  /**
   * Executa o movimento de um peão.
   * @param {number} pawnIndex O índice do peão a ser movido no array do jogador ativo.
   * @returns {boolean} True se o movimento foi bem-sucedido, False caso contrário.
   */
  doMovePawn(pawnIndex) {
    if (this.phase !== 'move' || this.status !== 'playing') return false;

    const player = this.activePlayer;
    const pawn = player.pawns[pawnIndex];

    if (!this.getValidMoves().includes(pawnIndex)) {
      this.logEvent(player.color, `Movimento inválido para o peão ${pawnIndex + 1}.`);
      return false;
    }

    let moved = false;
    let captured = false;
    this.extraTurn = false; // Reset extra turn for this move

    if (pawn.pos === -1 && this.diceValue === 6) {
      // Tira peça da base
      pawn.pos = window.LUDO_CONSTANTS.COLOR_TO_PATH_INDEX[player.color];
      pawn.homeStep = -1; // Garante que não está no home path
      this.logEvent(player.color, `Peão ${pawnIndex + 1} saiu da base.`);
      this.extraTurn = true; // Ganha uma jogada extra ao sair da base com 6
      moved = true;
    } else if (pawn.homeStep !== -1) {
      // Move no corredor final
      const newHomeStep = pawn.homeStep + this.diceValue;
      if (newHomeStep <= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
        if (newHomeStep === window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
          pawn.finished = true;
          pawn.homeStep = 6; // Representa que chegou na casa central
          player.score++;
          this.logEvent(player.color, `Peão ${pawnIndex + 1} chegou em casa! 🏡`);
          this.extraTurn = true; // Ganha uma jogada extra ao chegar em casa
        } else {
          pawn.homeStep = newHomeStep;
          this.logEvent(player.color, `Peão ${pawnIndex + 1} avançou para ${newHomeStep + 1} no corredor final.`);
        }
        moved = true;
      }
    } else if (this.diceValue > 0) {
      // Move na trilha principal
      // Calcula a nova posição absoluta e o ponto onde entra no corredor final do jogador
      const currentAbsPos = pawn.pos;
      const newAbsPos = currentAbsPos + this.diceValue;
      const playerPathStartIndex = window.LUDO_CONSTANTS.COLOR_TO_PATH_INDEX[player.color]; // Casa de saída do jogador na trilha principal
      const playerHomePathEntryIndex = (playerPathStartIndex + window.LUDO_CONSTANTS.BOARD_STEPS - 1) % window.LUDO_CONSTANTS.BOARD_STEPS; // Casa antes de entrar no home path

      let targetPosInPath = newAbsPos;
      let targetHomeStep = -1;

      // Verifica se a peça entrou ou passou do ponto de entrada do corredor final
      if (currentAbsPos < (playerPathStartIndex -1 + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS && newAbsPos >= (playerPathStartIndex -1 + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS) {
        // Se a peça atravessou seu próprio ponto de entrada do home path
        const stepsBeyondEntry = newAbsPos - ((playerPathStartIndex -1 + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS) //newAbsPos - (index da casa antes do home path)
        if (stepsBeyondEntry > 0 && stepsBeyondEntry <= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
            pawn.pos = -2; // Indica que está no home path
            pawn.homeStep = stepsBeyondEntry -1; // Ajusta para 0-index no home path
            this.logEvent(player.color, `Peão ${pawnIndex + 1} entrou no corredor final.`);
            moved = true;
        } else if (stepsBeyondEntry > window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
            // Tentou mover além do home path, movimento inválido
            this.logEvent(player.color, `Peão ${pawnIndex + 1} não pode mover além da casa central.`);
            return false;
        }
      }

      if (!moved) { // Se não entrou no home path, continua na trilha principal
          pawn.pos = newAbsPos % window.LUDO_CONSTANTS.BOARD_STEPS;
          this.logEvent(player.color, `Peão ${pawnIndex + 1} avançou ${this.diceValue} casas.`);
          moved = true;
      }

      // Verifica captura APENAS se o peão não entrou na área segura do home path ou na base
      // Casas seguras (SAFE_SQUARES) e casas de saída (ENTRY_POS) não permitem captura
      if (moved && pawn.pos !== -1 && pawn.homeStep === -1) {
        const currentPathIndex = pawn.pos;
        const currentCoords = window.LUDO_CONSTANTS.PATH_COORDS[currentPathIndex];
        const isSafeSquare = window.LUDO_CONSTANTS.SAFE_SQUARES.includes(currentPathIndex) ||
                             Object.values(window.LUDO_CONSTANTS.ENTRY_POS).some(pos => pos[0] === currentCoords[0] && pos[1] === currentCoords[1]);

        if (!isSafeSquare) {
          // Verifica se há alguma peça de outro jogador na mesma posição
          for (const otherPlayer of this.players) {
            if (otherPlayer.id === player.id) continue; // Não captura suas próprias peças

            for (const otherPawn of otherPlayer.pawns) {
                if (otherPawn.pos === pawn.pos && otherPawn.homeStep === -1) {
                    // Captura a peça!
                    otherPawn.pos = -1; // Volta para a base
                    otherPawn.homeStep = -1;
                    otherPawn.finished = false;
                    captured = true;
                    this.logEvent(player.color, `${player.name} capturou o peão ${window.LUDO_CONSTANTS.PIECES_SYMBOLS[otherPlayer.color]} do ${otherPlayer.name}! 🎉`);
                    this.extraTurn = true; // Ganha uma jogada extra ao capturar
                    break; // Capturou uma peça, vai para a próxima peça do jogador ativo
                }
            }
            if (captured) break;
          }
        }
      }
    }

    if (player.score === window.LUDO_CONSTANTS.PIECES_PER_PLAYER) {
      this.status = 'finished';
      this.winner = player.id;
      this.logEvent(player.color, `${player.name} venceu a partida! 🏆`);
    } else {
        // Se rolou 6, ou capturou, ou chegou em casa, recebe uma jogada extra.
        // Se não, passa o turno.
        if (!this.extraTurn && this.diceValue < 6 && !captured) { // Regra do Ludo: Captura ou 6 dá mais um turno
            this.nextTurn();
        } else {
            this.logEvent(player.color, `${player.name} ganhou uma jogada extra!`);
            this.phase = 'roll'; // Permite rolar o dado novamente
        }
    }

    this.diceValue = 0; // Zera o dado após o movimento

    return moved;
  }

  /**
   * Passa o turno para o próximo jogador.
   */
  nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % this.players.length;
    this.phase = 'roll'; // Próximo jogador sempre começa rolando
    this.diceValue = 0; // Zera o dado para o próximo turno
    this.extraTurn = false; // Garante que a jogada extra não persiste
    this.logEvent(this.activePlayer.color, `Vez de ${this.activePlayer.name}.`);
  }

  getPlayerHomePathStartPos(color) {
    const startIndex = window.LUDO_CONSTANTS.COLOR_TO_PATH_INDEX[color];
    // O corredor final do jogador está "antes" de completar um ciclo no tabuleiro para ele.
    // É a casa que antecede o loop completo (índice 51 para vermelho, por exemplo)
    const homeEntryIndex = (startIndex - 1 + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS;
    return homeEntryIndex;
  }

  // Funções de Log
  logEvent(color, message) {
    this.log.push({ timestamp: Date.now(), color: color, message: message });
    // Limita o histórico para não crescer indefinidamente
    if (this.log.length > 100) { // Mantém as últimas 100 entradas
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
    // Devemos garantir que o estado é compatível com a estrutura esperada
    this.players = data.players || [];
    this.currentTurn = data.currentTurn ?? 0;
    this.diceValue = data.diceValue ?? 0;
    this.phase = data.phase || 'roll';
    this.status = data.status || 'waiting';
    this.winner = data.winner || null;
    this.extraTurn = data.extraTurn ?? false;
    this.log = data.log || [];
  }

  // Métodos que expõem constantes para uso externo (UI, AI)
  get PATH_COORDS() { return window.LUDO_CONSTANTS.PATH_COORDS; }
  get HOME_PATHS() { return window.LUDO_CONSTANTS.HOME_PATHS; }
  get BASE_POSITIONS() { return window.LUDO_CONSTANTS.BASE_POSITIONS; }
  get SAFE_SQUARES() { return window.LUDO_CONSTANTS.SAFE_SQUARES; }
  get PIECES_PER_PLAYER() { return window.LUDO_CONSTANTS.PIECES_PER_PLAYER; }
};