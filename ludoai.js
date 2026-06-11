/* =====================================================
   LUDOAI - Implementação da Inteligência Artificial para Ludo
===================================================== */
class LudoAI {
  constructor() {
    // A IA não precisa de estado interno complexo, ela opera com base no estado do engine.
  }

  /**
   * Retorna a melhor jogada que a IA pode fazer.
   * @param {LudoEngine} engine A instância atual do motor do jogo Ludo.
   * @returns {number|null} O índice da peça a ser movida ou null se não houver movimentos.
   */
  getBestMove(engine) {
    const activePlayer = engine.activePlayer;
    if (!activePlayer.isAI || engine.phase !== 'move' || engine.diceValue === 0) {
      console.warn('AI não pode fazer movimento agora.');
      return null;
    }

    const validMoves = engine.getValidMoves();

    if (validMoves.length === 0) {
      return null; // Nenhumm movimento possível
    }

    // Prioridades da IA (simples):
    // 1. Tirar peça da base se rolou 6.
    // 2. Mover peça que pode capturar um oponente.
    // 3. Mover peça que pode entrar em casa segura.
    // 4. Mover peça que pode ir para o corredor final.
    // 5. Mover peça mais avançada.
    // 6. Mover qualquer peça válida.

    // === 1. Tirar peça da base se rolou 6 ===
    if (engine.diceValue === 6) {
      const pawnOnBaseIndex = activePlayer.pawns.findIndex(p => p.pos === -1);
      if (pawnOnBaseIndex !== -1 && validMoves.includes(pawnOnBaseIndex)) {
        return pawnOnBaseIndex;
      }
    }

    let bestMoveIndex = -1;
    let bestMoveScore = -1; // Usamos um sistema de pontuação para o melhor movimento

    for (const pawnIndex of validMoves) {
      const pawn = activePlayer.pawns[pawnIndex];
      let currentScore = 0;

      // Cria uma cópia temporária do engine para simular movimentos
      const tempEngine = new LudoEngine();
      tempEngine.deserialize(engine.serialize());
      const tempPlayer = tempEngine.players.find(p => p.id === activePlayer.id);
      const tempPawn = tempPlayer.pawns[pawnIndex];

      // Simula o movimento
      const newPosInfo = tempEngine._calculateNewPosition(tempPlayer, tempPawn, engine.diceValue);

      // === 2. Mover peça que pode capturar um oponente ===
      if (!newPosInfo.isHomePath && newPosInfo.valid) { // Capturas só ocorrem no caminho principal
        const targetGlobalPathIndex = newPosInfo.targetPos;
        const targetCoords = window.LUDO_CONSTANTS.PATH_COORDS[targetGlobalPathIndex];

        // Se a casa não é segura, verifica se há peças de outros jogadores
        if (!tempEngine._isSafeSquare(targetGlobalPathIndex)) {
          const capturedOpponent = tempEngine.players.some(otherPlayer => {
            if (otherPlayer.id === activePlayer.id) return false;
            return otherPlayer.pawns.some(otherPawn => {
              if (otherPawn.pos !== -1 && otherPawn.pos !== -2) { // Está no caminho principal
                  const otherPawnCoords = window.LUDO_CONSTANTS.PATH_COORDS[otherPawn.pos];
                  return otherPawnCoords[0] === targetCoords[0] && otherPawnCoords[1] === targetCoords[1];
              }
              return false;
            });
          });

          if (capturedOpponent) {
            currentScore += 100; // Pontuação alta para captura
          }
        }
      }

      // === 3. Mover peça que pode entrar em casa segura (se não for a própria) ===
      if (!newPosInfo.isHomePath && newPosInfo.valid && tempEngine._isSafeSquare(newPosInfo.targetPos)) {
          // Garante que não é uma casa segura já ocupada por outra peça própria para evitar bloqueio
          if (!tempEngine._isOccupiedByOwnPawn(tempPlayer, newPosInfo.targetPos, false, pawnIndex)) {
              currentScore += 50; // Boa pontuação para segurança
          }
      }

      // === 4. Mover peça que pode ir para o corredor final ===
      if (newPosInfo.isHomePath && newPosInfo.valid) {
        currentScore += 75 + newPosInfo.targetPos; // Quanto mais perto do objetivo, melhor
      }

      // === 5. Mover peça que pode alcançar a casa central ===
      if (newPosInfo.isHomePath && newPosInfo.targetPos === (window.LUDO_CONSTANTS.HOME_PATH_LENGTH -1)) {
          currentScore += 200; // Pontuação muito alta para chegar na casa central
      }

      // === 6. Mover peça mais avançada ===
      // Penaliza peças que saem da base mas não avançam muito
      if (pawn.pos === -1 && engine.diceValue === 6) {
        currentScore += 10; // Incentiva tirar peças da base
      } else if (pawn.pos !== -1 && !newPosInfo.isHomePath) {
        // Quanto mais avançada a peça no caminho principal (maior o globalPathIndex), melhor
        const playerStartPos = window.LUDO_CONSTANTS.HOME_START_POS[activePlayer.color];
        let globalNextPos = newPosInfo.targetPos;

        // Calcula a "distância percorrida" no ciclo do tabuleiro
        let currentAbsPos = pawn.pos;
        let nextAbsPos = newPosInfo.targetPos;

        // Normalizar posições para a perspectiva do jogador, para que "mais longe" seja "mais avançado"
        const normalizePos = (pos) => {
            let offset = pos - playerStartPos;
            if (offset < 0) offset += window.LUDO_CONSTANTS.BOARD_STEPS;
            return offset;
        };

        const normalizedCurrentPos = normalizePos(pawn.pos);
        const normalizedNextPos = normalizePos(newPosInfo.targetPos);

        currentScore += (normalizedNextPos * 2); // Pontuação base para avançar
      }

      // Atualiza a melhor jogada
      if (currentScore > bestMoveScore) {
        bestMoveScore = currentScore;
        bestMoveIndex = pawnIndex;
      }
    }

    if (bestMoveIndex !== -1) {
      return bestMoveIndex;
    }

    // Se nenhuma das heurísticas gerou um high score, apenas pega o primeiro movimento válido (fallback)
    return validMoves.length > 0 ? validMoves[0] : null;
  }
}