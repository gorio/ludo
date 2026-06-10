/* =====================================================
   LUDO AI — lógica de decisão para o computador
===================================================== */

class LudoAI {
  constructor() {
    // Não há níveis de dificuldade complexos para Ludo,
    // a IA será basicamente "burra" ou "oportunista"
  }

  /* Retorna o índice da peça que a IA deve mover */
  getBestMove(engine) {
    const player = engine.activePlayer;
    const dice = engine.diceValue;
    const validMoves = engine.getValidMoves();

    if (validMoves.length === 0) return null;

    // Estratégia da IA:
    // 1. Se tiver 6 e peça na base, tira da base.
    // 2. Se puder capturar, captura.
    // 3. Se puder mover para casa segura, move.
    // 4. Se puder mover para o corredor final/centro, move.
    // 5. Caso contrário, move a peça mais avançada.

    // 1. Tentar tirar peça da base com 6
    if (dice === 6) {
      const homePawns = player.pawns.filter(p => p.pos === -1);
      if (homePawns.length > 0) {
        return player.pawns.indexOf(homePawns[0]); // Tira a primeira peça da base
      }
    }

    let bestMoveIdx = -1;
    let bestScore = -1;

    validMoves.forEach(pawnIdx => {
      const pawn = player.pawns[pawnIdx];
      let currentScore = 0;

      // Simula o movimento para avaliar
      const tempEngine = new LudoEngine();
      tempEngine.deserialize(engine.serialize()); // Clona o estado atual
      const tempPlayer = tempEngine.players.find(p => p.id === player.id);
      const tempPawn = tempPlayer.pawns[pawnIdx];

      // Tenta mover a peça temporariamente
      let movedSuccessfully = false;
      if (tempPawn.pos === -1 && dice === 6) {
        tempPawn.pos = ENTRY_POS[player.color];
        tempPawn.homeStep = -1;
        movedSuccessfully = true;
      } else if (tempPawn.homeStep !== -1) {
        const newHomeStep = tempPawn.homeStep + dice;
        if (newHomeStep <= 5) {
          tempPawn.homeStep = newHomeStep;
          if (tempPawn.homeStep === 5) currentScore += 100; // Prioriza chegar ao centro
          movedSuccessfully = true;
        }
      } else if (tempPawn.pos !== -1) {
        const currentBoardPos = tempPawn.pos;
        const finalEntryPos = FINAL_ENTRY_BOARD_POS[player.color];
        let newBoardPos = (currentBoardPos + dice);

        if (currentBoardPos <= finalEntryPos && newBoardPos > finalEntryPos) {
          const stepsIntoFinal = newBoardPos - finalEntryPos - 1;
          if (stepsIntoFinal <= 5) {
            tempPawn.pos = -2;
            tempPawn.homeStep = stepsIntoFinal;
            currentScore += 50; // Prioriza entrar no corredor final
            if (tempPawn.homeStep === 5) currentScore += 100; // Prioriza chegar ao centro
            movedSuccessfully = true;
          }
        } else if (newBoardPos < BOARD_STEPS) {
          tempPawn.pos = newBoardPos;
          movedSuccessfully = true;
        }
      }

      if (!movedSuccessfully) return; // Não foi um movimento válido na simulação

      // Verifica captura (após o movimento simulado)
      const originalPos = pawn.pos; // Posição original da peça antes da simulação
      const originalHomeStep = pawn.homeStep;

      // Temporariamente move a peça no engine real para verificar captura
      const captureCheckEngine = new LudoEngine();
      captureCheckEngine.deserialize(engine.serialize());
      const checkPlayer = captureCheckEngine.players.find(p => p.id === player.id);
      const checkPawn = checkPlayer.pawns[pawnIdx];

      // Simula o movimento real para verificar captura
      let didCapture = false;
      if (checkPawn.pos === -1 && dice === 6) {
        checkPawn.pos = ENTRY_POS[player.color];
        didCapture = captureCheckEngine._checkCapture(player.color, checkPawn.pos);
      } else if (checkPawn.homeStep === -1 && checkPawn.pos !== -1) {
        const newPos = (checkPawn.pos + dice);
        // Verifica se a peça permanece no tabuleiro principal e não entra no corredor final
        const finalEntryPos = FINAL_ENTRY_BOARD_POS[player.color];
        if (!(checkPawn.pos <= finalEntryPos && newPos > finalEntryPos) && newPos < BOARD_STEPS) {
          checkPawn.pos = newPos;
          didCapture = captureCheckEngine._checkCapture(player.color, checkPawn.pos);
        }
      }

      if (didCapture) {
        currentScore += 200; // Alta prioridade para capturar
      }

      // Prioriza casas seguras
      if (tempPawn.homeStep === -1 && SAFE_SQUARES.includes(tempPawn.pos)) {
        currentScore += 10;
      }

      // Prioriza mover peças mais avançadas (para evitar bloqueios ou para chegar mais rápido)
      currentScore += (tempPawn.homeStep !== -1 ? tempPawn.homeStep + BOARD_STEPS : tempPawn.pos);

      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestMoveIdx = pawnIdx;
      }
    });

    return bestMoveIdx;
  }
}