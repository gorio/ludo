// ludoai.js
/* =====================================================
   LudoAI - Lógica básica de IA para Ludo
===================================================== */
class LudoAI {
    /**
     * Retorna o índice da melhor peça a ser movida para o jogador atual do engine.
     * @param {LudoEngine} engine A instância atual do LudoEngine.
     * @returns {number|null} O índice da peça a ser movida, ou null se não houver movimentos.
     */
    getBestMove(engine) {
        const player = engine.activePlayer;
        const diceValue = engine.diceValue;
        const playablePawns = engine.getPlayablePawns(diceValue);

        if (playablePawns.length === 0) {
            return null; // Nenhuma peça para mover
        }

        let bestMoveIdx = null;
        let bestScore = -Infinity;

        // Prioridade da IA (simples):
        // 1. Sair da base (se rolou 6)
        // 2. Mover uma peça que pode capturar
        // 3. Mover uma peça para uma casa segura
        // 4. Mover uma peça o mais longe possível
        // 5. Mover a peça que está mais perto de casa (se já saiu da base)
        // 6. Mover uma peça que já está fora da base (se não precisa de um 6)

        playablePawns.forEach(pawnIdx => {
            const pawn = player.pawns[pawnIdx];
            let currentScore = 0;

            // Prioridade 1: Sair da base (se a IA rolou 6)
            if (pawn.pos === -1 && diceValue === 6) {
                currentScore += 1000;
            }

            // Simula o movimento para avaliar
            const simulatedPawn = { ...pawn };
            let simulatedNewPos = pawn.pos;
            let simulatedNewHomeStep = pawn.homeStep;
            let finalMovementType = 'path'; // path, homepath, finished, base (only for start)

            if (simulatedPawn.pos === -1) { // Peça na base
                simulatedNewPos = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
                finalMovementType = 'path';
            } else if (simulatedPawn.homeStep !== -1) { // Peça no corredor final
                simulatedNewHomeStep += diceValue;
                if (simulatedNewHomeStep >= window.LUDO_CONSTANTS.HOME_PATH_LENGTH - 1) {
                    currentScore += 5000; // Forte prioridade para chegar em casa!
                    finalMovementType = 'finished';
                } else {
                    finalMovementType = 'homepath';
                }
            } else { // Peça no caminho principal
                const oldPos = pawn.pos;
                const homeEntryPathIndex = window.LUDO_CONSTANTS.HOME_START_POS[player.color];
                const distToHomeEntry = (homeEntryPathIndex - oldPos + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_CONSTANTS.BOARD_STEPS;

                if (diceValue > distToHomeEntry && !player.enteredHomePathYet) {
                    // Entrou no corredor final
                    fsimulatedNewHomeStep = diceValue - distToHomeEntry -1;
                    finalMovementType = 'homepath';
                    if (simulatedNewHomeStep >= window.LUDO_CONSTANTS.HOME_PATH_LENGTH - 1) {
                        currentScore += 5000; // Forte prioridade para chegar em casa!
                        finalMovementType = 'finished';
                    }
                } else {
                    simulatedNewPos = (simulatedPawn.pos + diceValue) % window.LUDO_CONSTANTS.BOARD_STEPS;
                    finalMovementType = 'path';
                }

                // Prioridade 2: Capturar uma peça do oponente
                // Verifica a posição simulada
                if (finalMovementType === 'path' && !window.LUDO_CONSTANTS.SAFE_SQUARES.includes(simulatedNewPos)) {
                    engine.players.forEach(otherPlayer => {
                        if (otherPlayer.color === player.color) return;
                        otherPlayer.pawns.forEach(otherPawn => {
                            if (!otherPawn.finished && otherPawn.pos === simulatedNewPos && otherPawn.homeStep === -1) {
                                currentScore += 1000; // Recompensa por captura
                            }
                        });
                    });
                }

                // Prioridade 3: Mover para uma casa segura
                if (finalMovementType === 'path' && window.LUDO_CONSTANTS.SAFE_SQUARES.includes(simulatedNewPos)) {
                    currentScore += 500;
                }

                // Prioridade 4: Mover o mais longe possível
                currentScore += simulatedNewPos; // Quanto maior a posição, melhor (no caminho principal)
            }


            // Prioridade 5: Mover peça que está mais perto de casa (se já saiu da base)
            if (pawn.pos !== -1) {
                // Cálculo de distância para casa (aproximado)
                const distanceToHome = (window.LUDO_CONSTANTS.HOME_START_POS[player.color] - pawn.pos + window.LUDO_CONSTANTS.BOARD_STEPS) % window.LUDO_CONSTANTS.BOARD_STEPS;
                currentScore += (window.LUDO_CONSTANTS.BOARD_STEPS - distanceToHome) * 10; // Peças mais avançadas têm maior score
            }

            // Prioridade 6: Dar preferência a peças que já saíram da base, se não for um 6
            if (pawn.pos !== -1 && diceValue !== 6) {
                currentScore += 100;
            }

            if (currentScore > bestScore) {
                bestScore = currentScore;
                bestMoveIdx = pawnIdx;
            }
        });

        return bestMoveIdx;
    }
}