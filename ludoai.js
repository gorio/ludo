/* =====================================================
   LUDOAI - Implementacao da Inteligencia Artificial para Ludo
===================================================== */
class LudoAI {
  constructor() {
    // A IA opera com base no estado atual do motor.
  }

  /**
   * Retorna a melhor jogada que a IA pode fazer.
   * @param {LudoEngine} engine A instancia atual do motor do jogo Ludo.
   * @returns {number|null} O indice da peca a ser movida ou null se nao houver movimentos.
   */
  getBestMove(engine) {
    const activePlayer = engine.activePlayer;
    if (!activePlayer || !activePlayer.isAI || engine.phase !== 'move' || engine.diceValue === 0) {
      console.warn('AI nao pode fazer movimento agora.');
      return null;
    }

    const validMoves = engine.getValidMoves();

    if (validMoves.length === 0) {
      return null;
    }

    // Prioridades da IA:
    // 1. Tirar peca da base se rolou 6.
    // 2. Capturar oponente.
    // 3. Entrar em casa segura.
    // 4. Ir para o corredor final.
    // 5. Avancar a peca mais distante.
    // 6. Usar qualquer movimento valido.

    if (engine.diceValue === 6) {
      const pawnOnBaseIndex = activePlayer.pawns.findIndex(p => p.pos === -1);
      if (pawnOnBaseIndex !== -1 && validMoves.includes(pawnOnBaseIndex)) {
        return pawnOnBaseIndex;
      }
    }

    let bestMoveIndex = -1;
    let bestMoveScore = -1;

    for (const pawnIndex of validMoves) {
      const pawn = activePlayer.pawns[pawnIndex];
      let currentScore = 0;

      const tempEngine = new LudoEngine();
      tempEngine.deserialize(engine.serialize());
      const tempPlayer = tempEngine.players.find(p => p.id === activePlayer.id);
      if (!tempPlayer || !tempPlayer.pawns || !tempPlayer.pawns[pawnIndex]) continue;

      const tempPawn = tempPlayer.pawns[pawnIndex];
      const newPosInfo = tempEngine._calculateNewPosition(tempPlayer, tempPawn, engine.diceValue);
      if (!newPosInfo || !newPosInfo.valid) continue;

      if (!newPosInfo.isHomePath) {
        const targetGlobalPathIndex = newPosInfo.targetPos;
        const targetCoords = window.LUDO_CONSTANTS.PATH_COORDS[targetGlobalPathIndex];

        if (targetCoords && !tempEngine._isSafeSquare(targetGlobalPathIndex)) {
          const capturedOpponent = tempEngine.players.some(otherPlayer => {
            if (otherPlayer.id === activePlayer.id) return false;
            return otherPlayer.pawns.some(otherPawn => {
              if (otherPawn.pos === -1 || otherPawn.pos === -2 || otherPawn.finished) return false;
              const otherPawnCoords = window.LUDO_CONSTANTS.PATH_COORDS[otherPawn.pos];
              return Boolean(
                otherPawnCoords &&
                otherPawnCoords[0] === targetCoords[0] &&
                otherPawnCoords[1] === targetCoords[1]
              );
            });
          });

          if (capturedOpponent) {
            currentScore += 100;
          }
        }
      }

      if (!newPosInfo.isHomePath && tempEngine._isSafeSquare(newPosInfo.targetPos)) {
        if (!tempEngine._isOccupiedByOwnPawn(tempPlayer, newPosInfo.targetPos, false, pawnIndex)) {
          currentScore += 50;
        }
      }

      if (newPosInfo.isHomePath) {
        currentScore += 75 + newPosInfo.targetPos;
      }

      if (newPosInfo.isHomePath && newPosInfo.targetPos === (window.LUDO_CONSTANTS.HOME_PATH_LENGTH - 1)) {
        currentScore += 200;
      }

      if (pawn.pos === -1 && engine.diceValue === 6) {
        currentScore += 10;
      } else if (pawn.pos !== -1 && pawn.pos !== -2 && !newPosInfo.isHomePath) {
        const playerStartPos = window.LUDO_CONSTANTS.HOME_START_POS[activePlayer.color];
        const normalizePos = (pos) => {
          let offset = pos - playerStartPos;
          if (offset < 0) offset += window.LUDO_CONSTANTS.BOARD_STEPS;
          return offset;
        };

        currentScore += normalizePos(newPosInfo.targetPos) * 2;
      }

      if (currentScore > bestMoveScore) {
        bestMoveScore = currentScore;
        bestMoveIndex = pawnIndex;
      }
    }

    return bestMoveIndex !== -1 ? bestMoveIndex : validMoves[0];
  }
}