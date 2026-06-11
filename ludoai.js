/* =====================================================
   LudoAI - Lógica da inteligência artificial para o Ludo
   Depende de `ludo_constants.js` e `ludoengine.js` serem carregados primeiro.
===================================================== */
class LudoAI {
  /**
   * Construtor da IA.
   * @param {LudoEngine} engine A instância do LudoEngine.
   */
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Determina o melhor movimento para a IA.
   * Atualmente, esta é uma IA muito básica:
   * 1. Se pode tirar peça da base e rolou 6, faz isso.
   * 2. Caso contrário, move a primeira peça disponível que pode se mover.
   *
   * @param {string} aiPlayerColor A cor da IA.
   * @returns {number|null} O índice do peão a ser movido (0-3) ou null se nenhum movimento for possível.
   */
  getBestMove(aiPlayerColor) {
    const activePlayer = this.engine.players.find(p => p.color === aiPlayerColor);
    if (!activePlayer) return null;

    const playablePawns = this.engine._getPlayablePawns(this.engine.diceValue);

    if (playablePawns.length === 0) {
      return null;
    }

    // Estratégia simples:
    // 1. Procurar peão na base que pode sair com um 6.
    if (this.engine.diceValue === 6) {
      const pawnInBase = activePlayer.pawns.findIndex(pawn => pawn.pos === -1);
      if (pawnInBase !== -1 && playablePawns.includes(pawnInBase)) {
        return pawnInBase;
      }
    }

    // 2. Se não, tenta mover qualquer peça que está no caminho para frente.
    // Tenta mover as peças mais avançadas primeiro, ou as que estão mais perto de "capturar"
    // ou entrar no home path, ou as que estão em risco.
    // Para simplificar: escolhe a primeira peça jogável que não está na base.
    let bestPawnIdx = null;
    let bestScore = -Infinity; // Pior score possível

    playablePawns.forEach(pawnIdx => {
        const pawn = activePlayer.pawns[pawnIdx];
        let currentScore = 0;

        // Se a peça está no home path, prioriza avançar
        if (pawn.homeStep !== -1) {
            currentScore += (pawn.homeStep + 1) * 100; // Quanto mais avançado no home path, maior o score
            if (pawn.homeStep + this.engine.diceValue >= LUDO_CONSTANTS.HOME_PATH_LENGTH) {
                currentScore += 1000; // Bônus enorme se for para a casa
            }
        } else if (pawn.pos !== -1) {
            // Se está no caminho principal, prioriza avançar
            // Mas leva em conta a "distância" para casa
            const playerStartPathIndex = LUDO_CONSTANTS.HOME_START_POS_INDEX[aiPlayerColor];
            const playerPathLengthToHome = (LUDO_CONSTANTS.BOARD_STEPS - playerStartPathIndex + pawn.pos) % LUDO_CONSTANTS.BOARD_STEPS;
            currentScore += playerPathLengthToHome;

            // Bônus se puder capturar
            const { newPos, newHomeStep } = this.engine._simulateMove(aiPlayerColor, pawn.pos, pawn.homeStep, this.engine.diceValue);
            const destinationCoords = this.engine._getCoordinatesForPosition(aiPlayerColor, newPos, newHomeStep);

            if (destinationCoords) { // Se não finalizou (chegou ao centro)
                const pawnsAtDestination = this.engine.players.flatMap(p => p.pawns)
                    .filter(otherPawn => (!otherPawn.finished && otherPawn !== pawn))
                    .filter(otherPawn => {
                        const otherPawnCoords = this.engine._getCoordinatesForPosition(this.engine.players.find(p => p.pawns.includes(otherPawn)).color, otherPawn.pos, otherPawn.homeStep);
                        return otherPawnCoords && otherPawnCoords[0] === destinationCoords[0] && otherPawnCoords[1] === destinationCoords[1];
                    });

                if (pawnsAtDestination.length > 0) {
                    const opponentPawnAtDest = pawnsAtDestination.some(otherPawn => {
                        const owner = this.engine.players.find(p => p.pawns.includes(otherPawn));
                        return owner && owner.color !== aiPlayerColor;
                    });
                    const isSafeCell = LUDO_CONSTANTS.SAFE_SQUARES.includes(this.engine._getGlobalPathIndex(destinationCoords));

                    if (opponentPawnAtDest && !isSafeCell) {
                        currentScore += 500; // Grande bônus para captura
                    }
                }
            }

            // Bônus se puder entrar na zona segura
            const simulatedNextPawnState = this.engine._simulateMove(aiPlayerColor, pawn.pos, pawn.homeStep, this.engine.diceValue);
            if (simulatedNextPawnState.willBeOnBoard) {
                const nextCoords = this.engine._getCoordinatesForPosition(aiPlayerColor, simulatedNextPawnState.newPos, simulatedNextPawnState.newHomeStep);
                if (nextCoords && LUDO_CONSTANTS.SAFE_SQUARES.includes(this.engine._getGlobalPathIndex(nextCoords))) {
                    currentScore += 50; // Pequeno bônus para ir para casa segura
                }
            }
        }

        if (currentScore > bestScore) {
            bestScore = currentScore;
            bestPawnIdx = pawnIdx;
        }
    });

    return bestPawnIdx;
  }
}