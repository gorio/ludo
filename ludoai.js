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
    // 1. Se tiver 6 e peça na base, tenta tirar da base.
    // 2. Se puder capturar, prioriza.
    // 3. Se puder mover para casa segura, prioriza.
    // 4. Se puder mover para o corredor final/centro, move.
    // 5. Caso contrário, move a peça mais avançada.

    // 1. Tentar tirar peça da base com 6
    if (dice === 6) {
      const homePawns = player.pawns.filter(p => p.pos === -1);
      if (homePawns.length > 0) {
        // Encontra o índice do primeiro peão na base que pode se mover
        for (let i = 0; i < player.pawns.length; i++) {
          if (player.pawns[i].pos === -1 && validMoves.includes(i)) {
            return i;
          }
        }
      }
    }

    let bestMoveIdx = -1;
    let bestScore = -1;

    validMoves.forEach(pawnIdx => {
      let currentScore = 0;

      // Simula o movimento para avaliar
      const tempEngine = new LudoEngine(); // Cria uma nova instância do engine
      tempEngine.deserialize(engine.serialize()); // Clona o estado atual do jogo

      const tempPlayer = tempEngine.players.find(p => p.id === player.id);
      const tempPawn = tempPlayer.pawns[pawnIdx];

      const prevPos = tempPawn.pos;
      const prevHomeStep = tempPawn.homeStep;

      // Tenta mover a peça temporariamente na tempEngine
      let movedSuccessfully = tempEngine.movePawn(pawnIdx);

      // Se a simulação falhou (movimento inválido na tempEngine), não considera
      if (!movedSuccessfully) return;


      // Verifica captura na simulação
      const didCapture = tempEngine.log.some(logEntry => logEntry.message.includes('capturou uma peça'));
      if (didCapture) {
        currentScore += 200; // Alta prioridade para capturar
      }

      // Prioriza casas seguras na nova posição (se não estiver na base ou home path)
      if (tempPawn.pos !== -1 && tempPawn.homeStep === -1 && window.LUDO_CONSTANTS.SAFE_SQUARES.includes(tempPawn.pos)) {
        currentScore += 10;
      }

      // Prioriza chegar ao centro
      if (tempPawn.finished) {
          currentScore += 100;
      }
      // Prioriza entrar no corredor final
      else if (tempPawn.pos === -2) { // se entrou no home path
          currentScore += 50;
      }

      // Prioriza mover peças mais avançadas (para evitar bloqueios ou para chegar mais rápido)
      // Calcula uma "distância percorrida" para a peça
      let traveledDistance = 0;
      if (tempPawn.homeStep !== -1) { // Já está na trilha final
          traveledDistance = window.LUDO_CONSTANTS.BOARD_STEPS + tempPawn.homeStep;
      } else if (tempPawn.pos !== -1) { // Está no tabuleiro principal
          // Ajusta a posição para ser relativa à entrada do jogador (circular)
          let playerEntryPos = window.LUDO_CONSTANTS.ENTRY_POS[player.color];
          let normalizedPos = (tempPawn.pos - playerEntryPos + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS;
          traveledDistance = normalizedPos;
      }
      currentScore += traveledDistance;

      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestMoveIdx = pawnIdx;
      }
    });

    return bestMoveIdx !== -1 ? bestMoveIdx : (validMoves.length > 0 ? validMoves[0] : null); // Fallback para o primeiro movimento válido
  }
}