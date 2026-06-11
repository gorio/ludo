/* =====================================================
   LUDO_CONSTANTS - Constantes compartilhadas para o jogo de Ludo
   Este arquivo deve ser carregado ANTES de `auth.js`, `history.js`, `ludoengine.js`, `ludoai.js` e `app.js`.
===================================================== */
window.LUDO_CONSTANTS = {
  // Configurações Globais do Jogo
  PIECES_PER_PLAYER: 4,               // Número de peças por jogador
  BOARD_SIZE: 15,                     // O tabuleiro é um grid de 15x15
  BOARD_STEPS: 52,                    // Total de casas na trilha principal (52 é o padrão do Ludo)
  HOME_PATH_LENGTH: 6,                // Número de casas no corredor final antes da casa central

  // Coordenadas para as cores na UI/Lógica
  LUDO_COLORS: ['red', 'blue', 'green', 'yellow'],
  COLOR_TRANSLATIONS: {
    red: 'Vermelho', blue: 'Azul', green: 'Verde', yellow: 'Amarelo'
  },
  PIECES_SYMBOLS: { // Símbolos a serem usados nos peões (pode ser o emoji ou o número)
    red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡'
  },

  // Mapeamento de Cores para Posições Iniciais no Board e Home Paths
  HOME_START_POS: { // Posição de entrada da base para o caminho principal (índice em PATH_COORDS)
    red: 0,
    blue: 13,
    yellow: 26,
    green: 39
  },

  ENTRY_POS: { // Posição (r, c) de onde a peça entra na trilha principal saindo da base
    red: [6, 1],
    blue: [1, 8],
    green: [8, 13],
    yellow: [13, 6]
  },

  FINAL_ENTRY_BOARD_POS: { // Posição (r,c) da casa que dá acesso ao corredor final (path_home)
    red:    [7, 6],
    blue:   [6, 7],
    green:  [8, 7],
    yellow: [7, 8]
  },

  // Casas seguras (estrelas) no caminho principal.
  // Estes são índices na PATH_COORDS
  SAFE_SQUARES: [1, 9, 14, 22, 27, 35, 40, 48],

  // Coordenadas (row, col) para as células da base de cada cor
  BASE_POSITIONS: {
    red:    [[1,1], [1,2], [2,1], [2,2]], // Posições (R,C) para as 4 peças na base Vermelha
    blue:   [[1,12], [1,13], [2,12], [2,13]],
    green:  [[12,12], [12,13], [13,12], [13,13]],
    yellow: [[12,1], [12,2], [13,1], [13,2]]
  },

  // Lista CORRETA de 52 coordenadas do caminho principal, no sentido anti-horário.
  // Inicia na casa de saída do Vermelho (índice 0), que é (6,1)
  PATH_COORDS: [
    [6,1],[6,2],[6,3],[6,4],[6,5], //  0-4: Vermelho -> em direção ao canto sup-dir
    [5,6],[4,6],[3,6],[2,6],[1,6], //  5-9: Subindo no canto
    [0,6],                         // 10: Canto superior esquerdo
    [0,7],                         // 11: Saída Azul (index 13 em HOME_START_POS)
    [0,8],                         // 12: Depois da saída Azul
    [1,8],[2,8],[3,8],[4,8],[5,8], // 13-17: Descendo no canto
    [6,9],[6,10],[6,11],[6,12],[6,13], // 18-22: Para a direita no canto
    [6,14],                        // 23: Canto superior direito
    [7,14],                        // 24: Saída Verde (index 26 em HOME_START_POS)
    [8,14],                        // 25: Depois da saída Verde
    [8,13],[8,12],[8,11],[8,10],[8,9], // 26-30: Para a esquerda no canto
    [9,8],[10,8],[11,8],[12,8],[13,8], // 31-35: Descendo no canto
    [14,8],                        // 36: Canto inferior direito
    [14,7],                        // 37: Saída Amarela (index 39 em HOME_START_POS)
    [14,6],                        // 38: Depois da saída Amarela
    [13,6],[12,6],[11,6],[10,6],[9,6], // 39-43: Subindo no canto
    [8,5],[8,4],[8,3],[8,2],[8,1], // 44-48: Para a esquerda no canto
    [8,0],                         // 49: Canto inferior esquerdo
    [7,0],                         // 50: Casa antes da saída Vermelha
    [6,0]                          // 51: Última casa antes do loop de volta para [6,1]
  ],

  // Coordenadas (row, col) para os corredores finais de cada cor (Home Paths)
  HOME_PATHS: {
    red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]], // Da casa de entrada para o centro
    blue:   [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]], // Da casa de entrada para o centro
    green:  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]], // Da casa de entrada para o centro
    yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]  // Da casa de entrada para o centro
  }
};