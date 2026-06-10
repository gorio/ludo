/* =====================================================
   LUDO AI — estratégia simples para computador
===================================================== */

class LudoAI {
  constructor(color) {
    this.color = color;
  }

  /* Escolhe a melhor peça para mover dado o estado atual */
  chooseMove(engine) {
    const valid = engine.getValidMoves();
    if (valid.length === 0) return null;
    if (valid.length === 1) return valid[0];

    const pieces = engine.pieces[this.color];
    const dice   = engine.diceValue;

    // Prioridades:
    // 1. Mover peça que vai chegar à casa final (done)
    // 2. Capturar peça adversária
    // 3. Mover peça que está no corredor final
    // 4. Tirar peça de casa (se dado=6)
    // 5. Mover a peça mais avançada

    let best = null;
    let bestScore = -Infinity;

    valid.forEach(idx => {
      const piece = pieces[idx];
      let score = 0;

      if (piece.state === 'home') {
        score = 50; // sair de casa sempre é bom
      } else if (piece.state === 'final') {
        const newPos = piece.pos + dice;
        if (newPos === 5) score = 1000; // chegar ao final = máxima prioridade
        else score = 200 + newPos;      // avançar no corredor final
      } else if (piece.state === 'board') {
        const result = engine.boardAdvance(this.color, piece.pos, dice);
        if (!result) { score = -1; }
        else if (result.toFinal !== undefined) {
          score = 300 + result.toFinal; // entrar no corredor
        } else {
          const newPos = result.toBoard;
          // Verifica captura
          let capScore = 0;
          LUDO_COLORS.forEach(otherColor => {
            if (otherColor === this.color) return;
            if (!engine.players.includes(otherColor)) return;
            engine.pieces[otherColor].forEach(op => {
              if (op.state === 'board' && op.pos === newPos && !SAFE_SQUARES.includes(newPos)) {
                capScore += 400; // captura vale muito
              }
            });
          });
          // Evitar casas não-seguras perto de adversários
          let danger = 0;
          LUDO_COLORS.forEach(otherColor => {
            if (otherColor === this.color) return;
            if (!engine.players.includes(otherColor)) return;
            engine.pieces[otherColor].forEach(op => {
              if (op.state === 'board') {
                const dist = (newPos - op.pos + BOARD_STEPS) % BOARD_STEPS;
                if (dist > 0 && dist <= 6 && !SAFE_SQUARES.includes(newPos)) {
                  danger += 50;
                }
              }
            });
          });
          // Avançar peças mais atrasadas
          const progress = (newPos - ENTRY_POS[this.color] + BOARD_STEPS) % BOARD_STEPS;
          score = capScore - danger + progress;
        }
      }

      if (score > bestScore) { bestScore = score; best = idx; }
    });

    return best !== null ? best : valid[0];
  }
}