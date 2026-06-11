/* =====================================================
   LUDO_CONSTANTS - Constantes compartilhadas para o jogo de Ludo
   Este arquivo DEVE ser carregado ANTES de `ludoengine.js`, `ludoai.js` e `app.js`.
===================================================== */
window.LUDO_CONSTANTS = {
  // Configurações Globais do Jogo
  PIECES_PER_PLAYER: 4,               // Número de peças por jogador
  BOARD_SIZE: 15,                     // O tabuleiro é um grid de 15x15
  BOARD_STEPS: 52,                    // Total de casas na trilha principal (52 é o padrão do Ludo)
  HOME_PATH_LENGTH: 6,                // Número de casas no corredor final antes da casa central (ex: 6 casas)

  // Coleta de Cores e Aparência
  LUDO_COLORS: ['red', 'blue', 'green', 'yellow'], // Ordem padrão das cores
  COLOR_TRANSLATIONS: {                            // Tradução para exibição
    red: 'Vermelho', blue: 'Azul', green: 'Verde', yellow: 'Amarelo'
  },
  PIECES_SYMBOLS: { // Símbolos a serem usados nos peões (emojis para visual)
    red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡'
  },

  // Mapeamento de Cores para Posições Iniciais e Corredores no Board
  // HOME_START_POS: é o INDEX na PATH_COORDS onde uma peça começa a se mover.
  // 0 -> primeira casa visível para o vermelho (6,1)
  // 13 -> primeira casa visível para o azul (1,8)
  // 26 -> primeira casa visível para o verde (8,13)
  // 39 -> primeira casa visível para o amarelo (13,6)
  HOME_START_POS: {
    red: 0,
    blue: 13,
    green: 26,
    yellow: 39
  },

  ENTRY_POS: { // Coordenadas (row, col) no grid 15x15 de ONDE a peça entra na trilha principal.
    red: [6, 1], // Vermelho
    blue: [1, 8], // Azul
    green: [8, 13], // Verde
    yellow: [13, 6] // Amarelo
  },

  FINAL_ENTRY_BOARD_POS: { // Coordenadas (row, col) da casa que DA ACESSO ao corredor final (home path)
    // EX: Para vermelho, é a última casa na trilha principal (casa index 51) que leva ao [7,6] home path.
    red:    [7,6], // Última casa do corredor final vermelho - (7,6) é a primeira casa na Home Path
    blue:   [6,7], // Última casa do corredor final azul
    green:  [8,7], // Última casa do corredor final verde
    yellow: [7,8]  // Última casa do corredor final amarelo
  },

  // Casas seguras (estrelas) no caminho principal, como **índices** na PATH_COORDS.
  // Estes são os índices das casas que são seguras (nenhuma captura).
  SAFE_SQUARES_INDEXES: [0, 8, 13, 21, 26, 34, 39, 47], // Exemplo de casas seguras

  // Coordenadas (row, col) no tabuleiro 15x15 para as células da BASE de cada cor.
  // Onde as peças ficam antes de entrar no jogo.
  BASE_POSITIONS: {
    red:    [[1,1], [1,2], [2,1], [2,2]],    // Base Vermelha (canto superior esquerdo)
    blue:   [[1,12], [1,13], [2,12], [2,13]], // Base Azul (canto superior direito)
    green:  [[12,12], [12,13], [13,12], [13,13]],// Base Verde (canto inferior direito)
    yellow: [[12,1], [12,2], [13,1], [13,2]]  // Base Amarela (canto inferior esquerdo)
  },

  // Lista COMPLETA e CORRIGIDA de 52 coordenadas do caminho principal, no sentido anti-horário.
  // Inicia na casa de saída do Vermelho (índice 0, que é [6,1]), e termina no [7,0] (índice 51).
  PATH_COORDS: [
    [6,1],[6,2],[6,3],[6,4],[6,5], // Index 0-4: Vermelho: Saída (6,1) até (6,5)
    [5,6],[4,6],[3,6],[2,6],[1,6], // Index 5-9: Subindo ao canto esquerdo
    [0,6],                         // Index 10: Canto superior esquerdo (antes da casa de saída Azul)
    [0,7],                         // Index 11: Casa segura antes da saída Azul
    [0,8],                         // Index 12: Depois da saída Azul
    [1,8],[2,8],[3,8],[4,8],[5,8], // Index 13-17: Descendo
    [6,9],[6,10],[6,11],[6,12],[6,13], // Index 18-22: Para a direita
    [6,14],                        // Index 23: Canto superior direito (antes da casa de saída Verde)
    [7,14],                        // Index 24: Casa segura antes da saída Verde
    [8,14],                        // Index 25: Depois da saída Verde
    [8,13],[8,12],[8,11],[8,10],[8,9], // Index 26-30: Para a esquerda
    [9,8],[10,8],[11,8],[12,8],[13,8], // Index 31-35: Descendo
    [14,8],                        // Index 36: Canto inferior direito (antes da casa de saída Amarela)
    [14,7],                        // Index 37: Casa segura antes da saída Amarela
    [14,6],                        // Index 38: Depois da saída Amarela
    [13,6],[12,6],[11,6],[10,6],[9,6], // Index 39-43: Subindo
    [8,5],[8,4],[8,3],[8,2],[8,1], // Index 44-48: Para a esquerda
    [8,0],                         // Index 49: Canto inferior esquerdo (antes da casa de saída Vermelha)
    [7,0],                         // Index 50: Casa segura antes da saída Vermelha
    [6,0]                          // Index 51: Última casa antes de fechar o loop (que é o index 0)
  ],

  // Coordenadas (row, col) para os corredores finais de cada cor (Home Paths).
  // São 6 casas, de `homeStep=0` a `homeStep=5`, onde 5 é a última antes da casa central.
  HOME_PATHS: {
    // A primeira casa do Home Path é a próxima casa da FINAL_ENTRY_BOARD_POS para cada cor.
    red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],    // (7,0) -> (7,6) Vermelho (horizontal, crescente col)
    blue:   [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],    // (0,7) -> (6,7) Azul (vertical, crescente row)
    green:  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],// (7,14) -> (7,8) Verde (horizontal, decrescente col)
    yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]] // (14,7) -> (8,7) Amarelo (vertical, decrescente row)
  },

  // Mapeamento de Coordenadas de Zona para facilitar a identificação de bases e caminhos no render.
  // Este é para uso no LudoEngine para identificar qual zona uma célula pertence de forma mais abstrata,
  // ou no app.js para aplicar classes CSS.
  ZONE_COORDS_MAP: { // Mapeamento de regiões para classes CSS de cores
    // Bases (regiões maiores 6x6 nos cantos)
    'red_base':    { startRow: 0, endRow: 5, startCol: 0, endCol: 5 },
    'blue_base':   { startRow: 0, endRow: 5, startCol: 9, endCol: 14 },
    'green_base':  { startRow: 9, endRow: 14, startCol: 9, endCol: 14 },
    'yellow_base': { startRow: 9, endRow: 14, startCol: 0, endCol: 5 },
    // Centro (3x3)
    'center_final':{ startRow: 6, endRow: 8, startCol: 6, endCol: 8 }
    // Home paths, etc. são dinâmicos ou específicos usando PATH_COORDS
  }
};