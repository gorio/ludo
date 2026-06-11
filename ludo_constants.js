/* =====================================================
   LUDO_CONSTANTS - Constantes compartilhadas para o jogo de Ludo
   Este arquivo deve ser carregado ANTES de `ludoengine.js`, `ludoai.js` e `app.js`.
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
  // Cor principal do L jogador
  HOME_START_POS: { // Posição de entrada da base para o caminho principal
    red: 0,
    blue: 13, // 13 na trilha principal
    yellow: 26, // 26 na trilha principal
    green: 39  // 39 na trilha principal
  },

  // Coordenadas (row, col) no tabuleiro 15x15 para as trilhas de cada cor
  // Isso é essencial para o render do tabuleiro
  ENTRY_POS: { // Posição (r, c) de onde a peça entra na trilha principal saindo da base
    red: [6, 1], // (R,C) no tabuleiro
    blue: [1, 8],
    green: [8, 13],
    yellow: [13, 6]
  },

  FINAL_ENTRY_BOARD_POS: { // Posição (r,c) da casa que dá acesso ao corredor final (path_home)
    red:    [7, 6],  // (R,C) no tabuleiro, logo antes do corredor final
    blue:   [6, 7],
    green:  [8, 7],
    yellow: [7, 8]
  },

  // Casas seguras (estrelas) no caminho principal.
  // Estes são índices na PATH_COORDS
  SAFE_SQUARES: [1, 9, 14, 22, 27, 35, 40, 48], // Exemplo de casas seguras

  // Coordenadas (row, col) para as células da base de cada cor
  BASE_POSITIONS: {
    red:    [[1,1], [1,2], [2,1], [2,2]], // Posições (R,C) para as 4 peças na base Vermelha
    blue:   [[1,12], [1,13], [2,12], [2,13]],
    green:  [[12,12], [12,13], [13,12], [13,13]],
    yellow: [[12,1], [12,2], [13,1], [13,2]]
  },

  // Coordenadas (row, col) para o caminho principal do tabuleiro (52 casas)
  // Ordem de movimento anti-horário começando do (6,1) vermelho
  PATH_COORDS: [
    [6,1],[6,2],[6,3],[6,4],[6,5], // 0-4 (vermelho: saída e 4 casas)
    [5,6],[4,6],[3,6],[2,6],[1,6], // 5-9
    [0,7],                         // 10 (canto superior)
    [1,8],[2,8],[3,8],[4,8],[5,8], // 11-15 (azul: saída e 4 casas)
    [6,9],[6,10],[6,11],[6,12],[6,13], // 16-20
    [7,14],                        // 21 (canto direito)
    [8,13],[8,12],[8,11],[8,10],[8,9], // 22-26 (verde: saída e 4 casas)
    [9,8],[10,8],[11,8],[12,8],[13,8], // 27-31
    [14,7],                        // 32 (canto inferior)
    [13,6],[12,6],[11,6],[10,6],[9,6], // 33-37 (amarelo: saída e 4 casas)
    [8,5],[8,4],[8,3],[8,2],[8,1], // 38-42
    [7,0],                         // 43 (canto esquerdo)
    [6,0],                         // 44 (casa final antes do ponto de entrada do vermelho - repetida, deve ser 7,0 o anterior, 6,0 seria uma casa antes)
    // Ajustando o loop para 52 casas:
    // Começa em 6,1 (index 0), então [6,1] é a casa 1
    // ...
    // Vamos corrigir a lista de PATH_COORDS para ter exatamente 52 casas de 0 a 51.
    // É importante que essa lista esteja 100% correta.

    // A contagem padrão é 52 casas, então vamos gerar isso corretamente:
    // Começa na saída Vermelha (6,1)
    [6,1],[6,2],[6,3],[6,4],[6,5],[6,6], // 0-5 (após a saída vermelha, 6 casas)
    [5,7],[4,7],[3,7],[2,7],[1,7],[0,7], // 6-11 (vertical para cima)
    [0,8],[0,9],[0,10],[0,11],[0,12],[0,13], // 12-17 (horizontal para a direita)
    [1,8],[2,8],[3,8],[4,8],[5,8],[6,8], // 18-23 (vertical para baixo)
    [7,8], // 24 (casa antes de entrar no corredor azul) - Esta será a casa 24 como a saída da base for o índice 1 no array
    [8,8],[8,9],[8,10],[8,11],[8,12],[8,13], // 25-30
    [9,7],[10,7],[11,7],[12,7],[13,7],[14,7], // 31-36
    [14,6],[14,5],[14,4],[14,3],[14,2],[14,1], // 37-42
    [13,7],[12,7],[11,7],[10,7],[9,7],[8,7], // 43-48
    [7,6],[7,5],[7,4],[7,3],[7,2],[7,1] // 49-54 (casa final antes de entrar no corredor amarelo)
    // Isso é complexo. A coordenação de 52 casas precisa ser precisa.
    // Vamos usar a lista padrão validada:
  ],

  // Lista CORRETA de 52 coordenadas do caminho principal, no sentido anti-horário.
  // Inicia na casa de saída do Vermelho (índice 0), que é (6,1)
  PATH_COORDS: [
    [6,1],[6,2],[6,3],[6,4],[6,5], //  0-4: Saída Vermelha -> em direção ao canto sup-dir
    [5,6],[4,6],[3,6],[2,6],[1,6], //  5-9: Subindo no canto
    [0,6],                         // 10: Canto superior esquerdo
    [0,7],                         // 11: Casa antes da saída Azul
    [0,8],                         // 12: Depois da saída Azul
    [1,8],[2,8],[3,8],[4,8],[5,8], // 13-17: Descendo no canto
    [6,9],[6,10],[6,11],[6,12],[6,13], // 18-22: Para a direita no canto
    [6,14],                        // 23: Canto superior direito
    [7,14],                        // 24: Casa antes da saída Verde
    [8,14],                        // 25: Depois da saída Verde
    [8,13],[8,12],[8,11],[8,10],[8,9], // 26-30: Para a esquerda no canto
    [9,8],[10,8],[11,8],[12,8],[13,8], // 31-35: Descendo no canto
    [14,8],                        // 36: Canto inferior direito
    [14,7],                        // 37: Casa antes da saída Amarela
    [14,6],                        // 38: Depois da saída Amarela
    [13,6],[12,6],[11,6],[10,6],[9,6], // 39-43: Subindo no canto
    [8,5],[8,4],[8,3],[8,2],[8,1], // 44-48: Para a esquerda no canto
    [8,0],                         // 49: Canto inferior esquerdo
    [7,0],                         // 50: Casa antes da saída Vermelha
    [6,0]                          // 51: Última casa antes do loop de volta para [6,1]
  ],

  // Coordenadas (row, col) para os corredores finais de cada cor (Home Paths)
  // São 6 casas, de 0 a 5, onde 5 é a última antes da casa central.
  HOME_PATHS: {
    red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]], // Da casa de entrada para o centro
    blue:   [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
    green:  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
    yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]]
  },

  // Mapeamento de quais coordenadas R,C são as casas de saída do jogo
  // onde uma peça entra na trilha principal.
  START_POINTS: {
    red:    [6,1],
    blue:   [1,8],
    green:  [8,13],
    yellow: [13,6]
  },

  // Mapeamento de qual cor pertence a qual faixa de START_POINTS
  COLOR_TO_PATH_INDEX: {
    red:    0,  // Índice onde as peças vermelhas começam na PATH_COORDS
    blue:   13, // Onde as peças azuis começam
    green:  26,
    yellow: 39
  }
};