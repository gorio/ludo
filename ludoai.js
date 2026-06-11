/* =====================================================
   LudoAI - Lógica do "computador" para o jogo de Ludo.
   Usa window.LUDO_CONSTANTS para informações do tabuleiro.
===================================================== */
class LudoAI {
  constructor() {
    // A AI do Ludo não tem "dificuldade" no sentido de cálculo tático complexo,
    // mas sim na sua estratégia de movimento (agressiva, defensiva, etc.).
    // Por enquanto, vamos com uma estratégia simples e direta.
  }

  /**
   * Retorna o índice do melhor peão para ser movido para o jogador da IA.
   * Prioriza sair da base, capturar, e mover peças mais avançadas.
   * @param {LudoEngine} engine A instância atual do LudoEngine.
   * @returns {number|null} Índice do peão a ser movido (0-3) ou null se nenhum movimento.
   */
  getBestMove(engine) {
    const player = engine.activePlayer;
    const validMoves = engine.getValidMoves();

    if (validMoves.length === 0) {
      return null;
    }

    let bestMoveIdx = null;
    let bestScore = -1;

    validMoves.forEach(pawnIdx => {
      const pawn = player.pawns[pawnIdx];
      let currentScore = 0;

      // Prioridade 1: Sair da base (sempre bom)
      if (pawn.pos === -1 && engine.diceValue === 6) {
        currentScore += 100;
      }

      // Prioridade 2: Capturar um peão adversário
      // Simula o movimento e verifica se resultaria em uma captura.
      const tempEngine = new LudoEngine();
      tempEngine.deserialize(engine.serialize()); // Clona o estado atual do jogo
      tempEngine.activePlayer.pawns[pawnIdx] = { ...pawn }; // Clona o peão para simulação

      let tempPawn = tempEngine.activePlayer.pawns[pawnIdx];
      let targetPos;

      if (tempPawn.pos === -1) {
        targetPos = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
      } else if (tempPawn.homeStep === -1) {
        targetPos = (tempPawn.pos + engine.diceValue) % window.LUDO_CONSTANTS.BOARD_STEPS;
        // Verifica se entraria no home path
        if (engine.canEnterHomePath(player.color, tempPawn.pos, engine.diceValue)) {
            // Se a AI pode entrar no home path, isso é uma boa jogada
            currentScore += 80;
        }
      } else { // Já no home path
        targetPos = tempPawn.homeStep + engine.diceValue;
        if (targetPos === window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
            // A piece reaches the center, this is a very good move
            currentScore += 150;
        }
      }

      // Simula a captura
      const captured = tempEngine.checkCapture(targetPos, player.color);
      if (captured) {
        currentScore += 90; // Pontua alto para captura
      }

      // Prioridade 3: Ajudar a mover uma peça para a frente (mais perto do centro)
      // Quanto maior a posição, maior o score (peças mais avançadas)
      if (pawn.pos !== -1) {
        currentScore += pawn.pos; // Se estiver no tabuleiro principal
      }
      if (pawn.homeStep !== -1) {
        currentScore += (window.LUDO_CONSTANTS.BOARD_STEPS + pawn.homeStep); // Se estiver no home path
      }

      // Prioridade 4: Não bloquear a si mesmo em uma safe-square (menos crítico, mas útil)
      // Se o movimento levar a uma safe square, é um bônus
      if (targetPos !== -1 && window.LUDO_CONSTANTS.SAFE_SQUARES.includes(targetPos)) {
        currentScore += 10;
      }

      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestMoveIdx = pawnIdx;
      }
    });

    return bestMoveIdx;
  }
}