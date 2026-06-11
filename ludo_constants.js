/* =====================================================
   LUDO_CONSTANTS - Constantes compartilhadas para o jogo de Ludo
   Este arquivo deve ser carregado ANTES de `ludoengine.js`, `ludoai.js` e `app.js`.
===================================================== */
window.LUDO_CONSTANTS = {
  // Configurações Globais do Jogo
  PIECES_PER_PLAYER: 4,               // Número de peças por jogador
  BOARD_SIZE: 15,                     // O tabuleiro é um grid de 15x15
  BOARD_STEPS: 52,                    // Total de casas na trilha principal (52 é o padrão do Ludo)
  HOME_PATH_LENGTH: 6,                // Número de casas no corredor final antes da casa central (Casa central é a 6)

  // Cores dos jogadores no Ludo
  LUDO_COLORS: ['red', 'blue', 'green', 'yellow'],
  COLOR_TRANSLATIONS: {
    red: 'Vermelho', blue: 'Azul', green: 'Verde', yellow: 'Amarelo'
  },
  PIECES_SYMBOLS: { // Símbolos a serem usados nos peões (pode ser o emoji ou o número)
    red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡'
  },

  // Mapeamento de Cores para Posições Iniciais no Board e Home Paths
  // HOME_START_POS agora indica o ÍNDICE na PATH_COORDS onde a cor "entra" na trilha principal
  HOME_START_POS: {
    red: 0,
    blue: 13,
    green: 26,
    yellow: 39
  },

  // Coordenadas (row, col) no tabuleiro 15x15 para as diversas áreas
  // ENTRY_POS: O (R,C) no tabuleiro onde a peça sai da BASE para a trilha principal.
  ENTRY_POS: {
    red: [6, 1], // Célula real no tabuleiro onde a peça VERMELHA "aparece" pela primeira vez
    blue: [1, 8], // Célula real no tabuleiro onde a peça AZUL "aparece" pela primeira vez
    green: [8, 13], // Célula real no tabuleiro onde a peça VERDE "aparece" pela primeira vez
    yellow: [13, 6] // Célula real no tabuleiro onde a peça AMARELA "aparece" pela primeira vez
  },

  // FINAL_ENTRY_BOARD_POS: Posição (r,c) da casa que dá acesso ao corredor final (Home Path)
  // ESTES SÃO OS ÚLTIMOS ÍNDICES DO PATH_COORDS ANTES DE ENTRAR NO HOME_PATH
  FINAL_ENTRY_BOARD_POS: {
    red:    [7,6], // Entrada do Home Path Vermelho
    blue:   [6,7], // Entrada do Home Path Azul
    green:  [8,7], // Entrada do Home Path Verde
    yellow: [7,8]  // Entrada do Home Path Amarelo
  },

  // Casas seguras (estrelas) no caminho principal.
  // Estes são ÍNDICES na PATH_COORDS
  SAFE_SQUARES: [0, 8, 13, 21, 26, 34, 39, 47], // Exemplo de casas seguras (índices 0-51)
  // Verifique com o novo PATH_COORDS se estes SAFE_SQUARES ainda fazem sentido para as posições visuais.

  // Coordenadas (row, col) para as células da base de cada cor
  BASE_POSITIONS: {
    red:    [[1,1], [1,2], [2,1], [2,2]], // Posições (R,C) para as 4 peças na base Vermelha
    blue:   [[1,12], [1,13], [2,12], [2,13]],
    green:  [[12,12], [12,13], [13,12], [13,13]],
    yellow: [[12,1], [12,2], [13,1], [13,2]]
  },

  // Lista CORRETA de 52 coordenadas do caminho principal (trilha de 0 a 51), no sentido anti-horário.
  // Inicia na casa de saída do Vermelho (índice 0), que é (6,1)
  PATH_COORDS: [
    [6,1],[6,2],[6,3],[6,4],[6,5],[6,6], // 0-5: Após saída Vermelha (sentido horário)
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6], // 6-11: Subindo para canto superior esquerdo
    [0,7],                               // 12: Casa de virada
    [0,8],[1,8],[2,8],[3,8],[4,8],[5,8], // 13-18: Descendo para saída Azul
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14], // 19-24: Após saída Azul
    [7,14],                              // 25: Casa de virada
    [8,14],[8,13],[8,12],[8,11],[8,10],[8,9], // 26-31: Após saída Verde
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8], // 32-37: Descendo para canto inferior direito
    [14,7],                              // 38: Casa de virada
    [14,6],[13,6],[12,6],[11,6],[10,6],[9,6], // 39-44: Após saída Amarela
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0], // 45-50: Subindo para canto inferior esquerdo
    [7,0]                                // 51: Casa de virada (antes da saída vermelha)
  ],

  // Coordenadas (row, col) para os corredores finais de cada cor (Home Paths)
  // São 6 casas, de 0 a 5, onde 5 é a última antes da casa central.
  HOME_PATHS: {
    red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]], // Da casa de entrada para o centro (0-5)
    blue:   [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
    green:  [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]], // Note a inversão se a entrada for de baixo para cima
    yellow: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]]  // Note a inversão se a entrada for da direita para a esquerda
  }

  // Não precisamos mais de START_POINTS nem COLOR_TO_PATH_INDEX diretamente,
  // pois HOME_START_POS já resolve para o índice no PATH_COORDS.
};