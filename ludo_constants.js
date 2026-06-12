/* =====================================================
   LUDO_CONSTANTS - Constantes compartilhadas para o jogo de Ludo
   Este arquivo deve ser carregado ANTES de `auth.js`, `history.js`, `ludoengine.js`, `ludoai.js` e `app.js`.
===================================================== */
window.LUDO_CONSTANTS = {
  // Configurações Globais do Jogo
  PIECES_PER_PLAYER: 4,               // Número de peças por jogador
  BOARD_SIZE: 15,                     // O tabuleiro é um grid de 15x15
  BOARD_STEPS: 52,                    // Total de casas na trilha principal (52 é o padrão do Ludo)
  HOME_PATH_LENGTH: 6,                // Número de casas no corredor final antes da casa central (Casa central é a 6a)

  // Cores Ludo e suas traduções/símbolos
  LUDO_COLORS: ['red', 'blue', 'green', 'yellow'],
  COLOR_TRANSLATIONS: {
    red: 'Vermelho', blue: 'Azul', green: 'Verde', yellow: 'Amarelo'
  },
  PIECES_SYMBOLS: { // Símbolos a serem usados nos peões na UI
    red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡'
  },

  // Mapeamento de cores para as posições de saída na trilha principal.
  HOME_START_POS: {
    red: 0,      // [6, 1]
    blue: 13,    // [1, 8]
    green: 28,   // [8, 13]
    yellow: 41   // [13, 6]
  },

  ENTRY_POS: { // Posição (r, c) de onde a peça entra na trilha principal saindo da base (casa colorida)
    red:    [6, 1],
    blue:   [1, 8],
    green:  [8, 13],
    yellow: [13, 6]
  },

  // Última casa da trilha principal antes de entrar no corredor final de cada cor.
  FINAL_ENTRY_BOARD_POS: {
    red:    [7, 0],
    blue:   [0, 7],
    green:  [7, 14],
    yellow: [14, 7]
  },

  // Casas seguras (estrelas) no caminho principal.
  SAFE_SQUARES: [0, 8, 13, 21, 26, 34, 39, 47],

  // Coordenadas (row, col) para as células da base de cada cor (4 posições para 4 peças)
  BASE_POSITIONS: {
    red:    [[1,1], [1,2], [2,1], [2,2]],
    blue:   [[1,12], [1,13], [2,12], [2,13]],
    green:  [[12,12], [12,13], [13,12], [13,13]],
    yellow: [[12,1], [12,2], [13,1], [13,2]]
  },

  // Lista de 52 coordenadas do caminho principal, no sentido anti-horário.
  PATH_COORDS: [
    // Caminho Vermelho (0-4)
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
    // Caminho para Azul (5-11)
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 7],
    // Caminho para Verde (12-25)
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
    // Caminho para Amarelo (26-38)
    [7, 14], [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
    // Caminho para Vermelho (39-51 - looping de volta)
    [14, 7], [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0], [7, 0]
  ],

  // Corredores finais de cada cor (Home Paths)
  HOME_PATHS: {
    red:    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
    blue:   [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
    green:  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
    yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]]
  },

  // Símbolo para a casa central do tabuleiro (destino final)
  CENTER_SYMBOL: '🏠'
};
