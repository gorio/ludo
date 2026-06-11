/* =====================================================
   LudoAI - Lógica da inteligência artificial para o Ludo
   Depende de `ludo_constants.js` carregado globalmente.
===================================================== */
class LudoAI {
  constructor() {
    this.difficulty = 'intermediario'; // Define dificuldade padrão
  }

  setDifficulty(level) {
    this.difficulty = level;
    // O Ludo normalmente não tem "dificuldade" no sentido de cálculo de movimentos,
    // mas pode influenciar o tempo de resposta ou uma lógica mais refinada (ex: priorizar capturas)
    console.log(`Ludo AI dificuldade ajustada para: ${this.difficulty}`);
  }

  /**
   * Decide o melhor movimento para a IA.
   * @param {LudoEngine} engine A instância atual do motor do jogo.
   * @returns {number | null} O índice do peão a ser movido, ou null se não houver movimento.
   */
  getBestMove(engine) {
    const player = engine.activePlayer;
    const dice = engine.diceValue;
    const validMoves = engine.getValidMoves();

    if (validMoves.length === 0) {
      return null;
    }

    // Estratégias em ordem de prioridade para a IA:

    // 1. Prioriza tirar peças da base se rolou 6
    if (dice === 6) {
      const pawnsInBase = validMoves.filter(pawnIdx => player.pawns[pawnIdx].pos === -1);
      if (pawnsInBase.length > 0) {
        // Tenta tirar uma peça que ainda não foi tirada por 6 se houver
        const unMovedPawn = pawnsInBase.find(pawnIdx => pawnIdx === 0 || pawnIdx ===1 || pawnIdx ===2 || pawnIdx ===3);
        return unMovedPawn !== undefined ? unMovedPawn : pawnsInBase[0];
      }
    }

    let bestMoveIdx = validMoves[0];
    let bestScore = -Infinity;

    validMoves.forEach(pawnIdx => {
      const pawn = player.pawns[pawnIdx];
      let currentScore = 0;

      // Simula o movimento para avaliar
      let tempPawn = { ...pawn };
      let newPos = pawn.pos;
      let newHomeStep = pawn.homeStep;
      let newFinished = pawn.finished;

      if (pawn.pos === -1) { // Peça na base, vai para o ponto de partida
        newPos = window.LUDO_CONSTANTS.COLOR_TO_PATH_INDEX[player.color];
      } else if (pawn.homeStep !== -1) { // No corredor final
        newHomeStep += dice;
        if (newHomeStep >= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
          newFinished = true;
        }
      } else { // Na trilha principal
        const playerPathStartIndex = window.LUDO_CONSTANTS.COLOR_TO_PATH_INDEX[player.color];
        const newAbsPos = pawn.pos + dice;

        // Verifica se vai entrar no corredor final
        if (pawn.pos < playerPathStartIndex && newAbsPos >= playerPathStartIndex) {
            const stepsIntoHomePath = newAbsPos - playerPathStartIndex;
            if (stepsIntoHomePath > 0 && stepsIntoHomePath <= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
                newPos = -2; // Marca como "no corredor final"
                newHomeStep = stepsIntoHomePath - 1;
            } else {
                newPos = newAbsPos % window.LUDO_CONSTANTS.BOARD_STEPS;
            }
        } else {
            newPos = newAbsPos % window.LUDO_CONSTANTS.BOARD_STEPS;
        }
      }

      // Pontuação da estratégia
      // Prioriza movimentar peças para a casa central
      if (newFinished) {
        currentScore += 1000;
      }

      // Prioriza capturar peças adversárias
      // Isso é mais complexo para simular, mas podemos verificar se a nova posição
      // colidiria com uma peça adversária (que não está em casa segura)
      if (newPos !== -1 && newHomeStep === -1) { // Se não está na base ou no corredor final
        const isSafeSquare = window.LUDO_CONSTANTS.SAFE_SQUARES.includes(newPos) ||
                             Object.values(window.LUDO_CONSTANTS.ENTRY_POS).some(pos => {
                               const cellCoords = window.LUDO_CONSTANTS.PATH_COORDS[newPos];
                               return cellCoords[0] === pos[0] && cellCoords[1] === pos[1];
                             });

        if (!isSafeSquare) {
          for (const otherPlayer of engine.players) {
            if (otherPlayer.id === player.id) continue;
            for (const otherPawn of otherPlayer.pawns) {
              if (otherPawn.pos === newPos && otherPawn.homeStep === -1) {
                currentScore += 500; // Alta pontuação para captura
                break;
              }
            }
          }
        }
      }

      // Prioriza mover peças que estão perto do ponto de entrada do corredor final
      // ou já no corredor final
      if (pawn.homeStep !== -1) {
        currentScore += (pawn.homeStep * 10); // Quanto mais avançado no home path, melhor
      } else if (pawn.pos !== -1) {
        const playerPathStartIndex = window.LUDO_CONSTANTS.COLOR_TO_PATH_INDEX[player.color];
        const distToHome = (playerPathStartIndex - pawn.pos + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS;
        currentScore += (window.LUDO_CONSTANTS.BOARD_STEPS - distToHome) * 2; // Quanto mais perto de casa, melhor
      }

      // Prioriza mover peças que já estão fora da base
      if (pawn.pos !== -1) {
        currentScore += 10;
      }

      // Evita deixar peças em casas onde podem ser capturadas (se não for casa segura)
      if (newPos !== -1 && newHomeStep === -1) {
        const isSafeSquare = window.LUDO_CONSTANTS.SAFE_SQUARES.includes(newPos) ||
                             Object.values(window.LUDO_CONSTANTS.ENTRY_POS).some(pos => {
                               const cellCoords = window.LUDO_CONSTANTS.PATH_COORDS[newPos];
                               return cellCoords[0] === pos[0] && cellCoords[1] === pos[1];
                             });

        if (!isSafeSquare) { // Se não for casa segura, penaliza se houver risco
          // Seria ideal verificar se adversários podem alcançar esta casa, mas é complexo para uma AI simples.
          // Por simplicidade, assumimos que sair da base e ficar em casa segura é bom.
        }
      }


      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestMoveIdx = pawnIdx;
      }
    });

    return bestMoveIdx;
  }
}