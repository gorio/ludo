/* =====================================================
   LUDO_CONSTANTS - Constantes compartilhadas para o jogo de Ludo
   Este arquivo DEVE ser carregado ANTES de `ludoengine.js`, `ludoai.js` e `app.js`.
===================================================== */
window.LUDO_CONSTANTS = {
  // Configurações Globais do Jogo
  PIECES_PER_PLAYER: 4,               // Número de peças por jogador
  BOARD_SIZE: 15,                     // O tabuleiro é um grid de 15x15
  BOARD_STEPS: 52,                    // Total de casas na trilha principal (52 é o padrão do Ludo)
  HOME_PATH_LENGTH: 6,                // Número de casas no corredor final antes da casa central (excluindo a casa central)

  // Coordenadas para as cores na UI/Lógica
  LUDO_COLORS: ['red', 'blue', 'green', 'yellow'],
  COLOR_TRANSLATIONS: {
    red: 'Vermelho', blue: 'Azul', green: 'Verde', yellow: 'Amarelo'
  },
  PIECES_SYMBOLS: { // Símbolos a serem usados nos peões (pode ser o emoji ou o número)
    red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡'
  },

  // Mapeamento de Cores para Posições Iniciais no Board e Home Paths
  // HOME_START_POS: Posição (índice da PATH_COORDS) de onde a peça entra no caminho principal
  HOME_START_POS_INDEX: {
    red: 0,     // Vermelho começa na casa de índice 0 da PATH_COORDS
    blue: 13,   // Azul, 13 casas depois do vermelho na PATH_COORDS
    green: 26,  // Verde, 26 casas depois
    yellow: 39  // Amarelo, 39 casas depois
  },

  // START_POINTS: Coordenadas (row, col) no tabuleiro 15x15 para as casas de onde a peça "sai" da base.
  // Visualmente, pode ser um destaque maior.
  START_POINTS: {
    red:    [6,1], // No tabuleiro 15x15, essa é a primeira casa vermelha na trilha
    blue:   [1,8], // Primeira casa azul na trilha
    green:  [8,13], // Primeira casa verde na trilha
    yellow: [13,6] // Primeira casa amarela na trilha
  },

  // FINAL_ENTRY_BOARD_POS: Posição (índice da PATH_COORDS) da última casa do caminho principal
  // antes de virar para o corredor final (Home Path).
  FINAL_ENTRY_BOARD_POS_INDEX: { // Correspende às casas de entrada para o corredor final
      red: 50,    // Última casa que é 50-casas-antes-do-corredor das vermelhas (a casa 51 é a de entrada pro home path)
      blue: 11,
      green: 24,
      yellow: 37
  },

  // Casas seguras (estrelas) no caminho principal.
  // Estes são os ÍNDICES na PATH_COORDS (0 a 51) que são seguros.
  SAFE_SQUARES: [
    1, 9,             // Próximo à base vermelha e azul
    14, 22,           // Próximo à base azul e verde
    27, 35,           // Próximo à base verde e amarela
    40, 48            // Próximo à base amarela e vermelha
  ],

  // Coordenadas (row, col) para as células da base de cada cor
  BASE_POSITIONS: {
    red:    [[1,1], [1,2], [2,1], [2,2]], // Posições (R,C) para as 4 peças na base Vermelha
    blue:   [[1,12], [1,13], [2,12], [2,13]],
    green:  [[12,12], [12,13], [13,12], [13,13]],
    yellow: [[12,1], [12,2], [13,1], [13,2]]
  },

  // Coordenadas (row, col) para o caminho principal do tabuleiro (52 casas)
  // Ordem de movimento anti-horário começando do (6,1) vermelho
  // Este é o array central para o movimento das peças no tabuleiro principal
  PATH_COORDS: [
    [6,1],[6,2],[6,3],[6,4],[6,5], //  0-4 : Caminho Vermelho (inicial)
    [5,6],[4,6],[3,6],[2,6],[1,6], //  5-9 : Curva para Azul
    [0,6],                         // 10: canto  (parte do caminho Azul)
    [0,7],                         // 11: SAÍDA AZUL (Path Index 11) - **CORRIGIDO**: Era HOME_START_POS for BLUE.
    [0,8],                         // 12: Canto (parte do caminho Azul)
    [1,8],[2,8],[3,8],[4,8],[5,8], // 13-17: Caminho Azul
    [6,9],[6,10],[6,11],[6,12],[6,13], // 18-22: Caminho Azul (final) / Curva para Verde
    [6,14],                        // 23: Canto (parte do caminho Verde)
    [7,14],                        // 24: SAÍDA VERDE (Path Index 24) - **CORRIGIDO**: Era HOME_START_POS for GREEN.
    [8,14],                        // 25: Canto
    [8,13],[8,12],[8,11],[8,10],[8,9], // 26-30: Caminho Verde
    [9,8],[10,8],[11,8],[12,8],[13,8], // 31-35: Caminho Verde (final) / Curva para Amarelo
    [14,8],                        // 36: Canto
    [14,7],                        // 37: SAÍDA AMARELA (Path Index 37) - **CORRIGIDO**: Era HOME_START_POS for YELLOW.
    [14,6],                        // 38: Canto
    [13,6],[12,6],[11,6],[10,6],[9,6], // 39-43: Caminho Amarelo
    [8,5],[8,4],[8,3],[8,2],[8,1], // 44-48: Caminho Amarelo (final) / Curva para Vermelho
    [8,0],                         // 49: Canto
    [7,0],                         // 50: SAÍDA VERMELHA (Path Index 50) - **CORRIGIDO**: HOME_START_POS for RED.
    [6,0]                          // 51: Canto Final (última casa antes de fechar o loop no [6,1])
  ],

  // Coordenadas (row, col) para os corredores finais de cada cor (Home Paths)
  // São 6 casas, de 0 a 5, onde 5 é a última antes da casa central.
  HOME_PATHS: {
    red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]], // Da casa de entrada para o centro (esquerda -> direita)
    blue:   [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]], // De cima para baixo
    green:  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]], // Da direita para a esquerda
    yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]] // De baixo para cima
  }
};