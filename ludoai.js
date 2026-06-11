/* =====================================================
   LudoAI - Lógica da inteligência artificial para o jogo de Ludo
   Depende de `ludo_constants.js` carregado globalmente.
===================================================== */
class LudoAI {
  constructor() {
    // Não precisa de níveis de dificuldade detalhados como no Xadrez
    // A AI do Ludo será mais focada em regras e heurísticas simples.
  }

  /**
   * Retorna o melhor movimento para a IA no Ludo.
   * A IA simplesmente tentará fazer o movimento que:
   * 1. Coloque uma peça para fora da base se o dado for 6.
   * 2. Capture uma peça adversária.
   * 3. Mova uma peça para as casas seguras.
   * 4. Mova uma peça para mais perto da casa final.
   * 5. Mova qualquer peça válida.
   * @param {LudoEngine} engine A instância atual do motor do jogo.
   * @returns {number|null} O índice da peça a ser movida, ou null se nenhum movimento for possível.
   */
  getBestMove(engine) {
    const player = engine.activePlayer;
    const dice = engine.diceValue;
    const validMoves = engine.getValidMoves();

    if (validMoves.length === 0) {
      return null;
    }

    let bestMoveIndex = null;
    let bestScore = -1;

    // Mapeia todas as peças e suas possíveis posições
    validMoves.forEach(pawnIndex => {
      const pawn = player.pawns[pawnIndex];
      let currentScore = 0;

      // Simula o movimento para avaliar a nova posição
      const simulatedTarget = engine._calculateTargetPosition(player, pawn, dice); // Usa método interno do engine

      // Heurística 1: Sair da base com 6
      if (pawn.pos === -1 && dice === 6) {
        currentScore += 100; // Prioridade máxima
      }

      // Heurística 2: Tentar capturar uma peça adversária
      if (simulatedTarget.type === 'main') {
        const capturedPawn = engine._checkCapture(player, simulatedTarget); // Usa método interno do engine
        if (capturedPawn) {
          currentScore += 90; // Alta prioridade
        }
      }

      // Heurística 3: Mover para uma casa segura (se não estiver já nela)
      if (simulatedTarget.type === 'main' && window.LUDO_CONSTANTS.SAFE_SQUARES_INDEXES.includes(simulatedTarget.index)) {
        if (pawn.pos === -1 || !window.LUDO_CONSTANTS.SAFE_SQUARES_INDEXES.includes(pawn.pos)) { // Se está saindo da base ou de uma casa não segura
          currentScore += 70;
        }
      }

      // Heurística 4: Mover mais para frente na trilha principal ou corredor final
      if (simulatedTarget.type === 'main') {
        // Quanto mais longe, melhor
        currentScore += simulatedTarget.index;
      } else if (simulatedTarget.type === 'homePath') {
        // Mais perto do centro (no corredor final), melhor
        currentScore += (window.LUDO_CONSTANTS.BOARD_STEPS + simulatedTarget.index + 52); // Garante que homePath seja altamente valorizado
      } else if (simulatedTarget.type === 'finished') {
        currentScore += 500; // Altíssima prioridade, peça chegou!
      }


      // Se for o primeiro movimento ou um score melhor for encontrado
      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestMoveIndex = pawnIndex;
      }
    });

    return bestMoveIndex;
  }
}