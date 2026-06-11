/* =====================================================
   ludoai.js - Inteligência Artificial para o jogo de Ludo
   Define a classe LudoAI. Carregado ANTES de app.js.
   Depende de LudoEngine.
===================================================== */
class LudoAI {
  constructor() {
    // Nível de dificuldade pode ser adicionado aqui, mas o usuário pediu para simplificar
  }

  /**
   * Decide qual o melhor movimento para a IA.
   * @param {LudoEngine} engine A instância atual do motor do jogo.
   * @returns {number|null} O índice da peça a ser movida ou null se nenhum movimento for possível.
   */
  getBestMove(engine) {
    const activePlayer = engine.activePlayer;
    if (!activePlayer || !activePlayer.isAI) {
      return null;
    }

    const diceValue = engine.diceValue;
    const playablePawns = engine.playablePawns;

    if (playablePawns.length === 0) {
      return null; // Nenhuma peça para mover
    }

    // Estratégia simples da IA:
    // 1. Dar prioridade para tirar peças da base (se rolou 6).
    // 2. Dar prioridade a movimentos que levam as peças para casa (finalizadas).
    // 3. Dar prioridade a movimentos que capturam peças do oponente.
    // 4. Mover a peça que estiver mais avançada.
    // 5. Se nenhuma das anteriores, mover a primeira peça jogável.

    let bestPawnIdx = null;
    let bestScore = -1; // Quanto maior o score, melhor o movimento

    for (const pawnIdx of playablePawns) {
      const pawn = activePlayer.pawns[pawnIdx];
      let currentScore = 0;

      // Cria um clone do engine para simular o movimento sem alterar o estado real
      const tempEngine = new LudoEngine();
      tempEngine.deserialize(engine.serialize()); // Copia o estado atual
      const tempPlayer = tempEngine.colorMap[activePlayer.color]; // Pega a referência do player clonado
      const tempPawn = tempPlayer.pawns[pawnIdx];

      // Simula o movimento
      let simulatedMoved = false;
      let simulatedOldPos = { pos: tempPawn.pos, homeStep: tempPawn.homeStep };

      if (tempPawn.pos === -1 && diceValue === 6) {
        tempPawn.pos = window.LUDO_CONSTANTS.HOME_START_POS[activePlayer.color];
        simulatedMoved = true;
      } else if (tempPawn.homeStep !== -1) {
        const newHomeStep = tempPawn.homeStep + diceValue;
        if (newHomeStep <= window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
          tempPawn.homeStep = newHomeStep;
          if (newHomeStep === window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
            tempPawn.finished = true;
            tempPlayer.score++;
          }
          simulatedMoved = true;
        }
      } else if (tempPawn.pos !== -1) {
        const playerHomePathStartIdx = window.LUDO_CONSTANTS.HOME_START_POS[activePlayer.color];
        const boardSteps = window.LUDO_CONSTANTS.BOARD_STEPS;
        const currentPathPos = tempPawn.pos;
        const newMainPathPos = currentPathPos + diceValue;

        if (newMainPathPos < boardSteps) {
            // Movimento normal no caminho principal
            tempPawn.pos = newMainPathPos;
            simulatedMoved = true;
        } else {
            // Peça pode estar entrando no home path ou dando a volta
            const entryPathCoordIndex = window.LUDO_CONSTANTS.HOME_START_POS[activePlayer.color];
            let hypotheticalNewPos = tempPawn.pos + diceValue;

            if (hypotheticalNewPos >= entryPathCoordIndex && tempPawn.pos < entryPathCoordIndex) {
              const stepsIntoHome = hypotheticalNewPos - entryPathCoordIndex;
              if (stepsIntoHome < window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
                  tempPawn.pos = -1; // Remove da trilha principal
                  tempPawn.homeStep = stepsIntoHome;
                  simulatedMoved = true;
              } else if (stepsIntoHome === window.LUDO_CONSTANTS.HOME_PATH_LENGTH) {
                  tempPawn.pos = -1;
                  tempPawn.homeStep = window.LUDO_CONSTANTS.HOME_PATH_LENGTH;
                  tempPawn.finished = true;
                  tempPlayer.score++;
                  simulatedMoved = true;
              }
            } else {
                tempPawn.pos = newMainPathPos % boardSteps; // Continua no caminho principal dando a volta
                simulatedMoved = true;
            }
        }
      }

      if (simulatedMoved) {
        // --- Avalia o movimento ---

        // 1. Saiu da base? (muito bom se o dado é 6)
        if (simulatedOldPos.pos === -1 && tempPawn.pos !== -1) {
          currentScore += 100; // Alta prioridade
        }

        // 2. Chegou em casa?
        if (tempPawn.finished) {
          currentScore += 200; // Prioridade máxima
        }

        // 3. Capturou peça do oponente?
        // Verifica se a peça simulada está no caminho principal e não em uma casa segura
        if (tempPawn.pos !== -1 && tempPawn.homeStep === -1 && !window.LUDO_CONSTANTS.SAFE_SQUARES.includes(tempPawn.pos)) {
          tempEngine.players.forEach(otherPlayer => {
            if (otherPlayer.id === activePlayer.id) return;
            otherPlayer.pawns.forEach(otherPawn => {
              if (otherPawn.pos === tempPawn.pos && otherPawn.homeStep === -1) {
                currentScore += 150; // Muito bom, prioridade alta
              }
            });
          });
        }

        // 4. Avançou uma peça (quanto mais avançada, melhor)
        if (tempPawn.homeStep !== -1) {
            currentScore += (tempPawn.homeStep + 1) * 2; // Maior pontuação para mais perto de casa
        } else if (tempPawn.pos !== -1) {
            // Calculo da posição real na trilha 0-51 (que é cíclica)
            const playerHomePathStartIdx = window.LUDO_CONSTANTS.HOME_START_POS[activePlayer.color];
            const relativePos = (tempPawn.pos - playerHomePathStartIdx + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS;
            currentScore += relativePos; // Pontua por avançar no caminho
        }

        // 5. Evitou ser capturado? (mais complexo de simular, vamos ignorar por enquanto para simplificar)

        // Se este movimento é melhor que o anterior, atualiza
        if (currentScore > bestScore) {
          bestScore = currentScore;
          bestPawnIdx = pawnIdx;
        }
      }
    }

    // Se nenhuma estratégia avançada encontrou um bom movimento, pega o primeiro jogável ou o mais avançado.
    if (bestPawnIdx === null && playablePawns.length > 0) {
        // Fallback: mover a peça mais avançada no tabuleiro
        let mostAdvancedPos = -1;
        playablePawns.forEach(pawnIdx => {
          const pawn = activePlayer.pawns[pawnIdx];
          let paw_pos = pawn.pos
          if (pawn.homeStep !== -1) paw_pos = window.LUDO_CONSTANTS.BOARD_STEPS + pawn.homeStep; // Corrige pontuação para home path
          if (paw_pos > mostAdvancedPos) {
            mostAdvancedPos = paw_pos;
            bestPawnIdx = pawnIdx;
          }
        });
    }

    return bestPawnIdx;
  }
}