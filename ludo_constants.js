/* =====================================================
   CONSTANTES GLOBAIS DO LUDO
   (Centralizadas para evitar declaração duplicada)
===================================================== */
window.LUDO_CONSTANTS = {
  LUDO_COLORS: ['red', 'blue', 'green', 'yellow'],
  COLOR_TRANSLATIONS: {
    red: 'Vermelho', blue: 'Azul', green: 'Verde', yellow: 'Amarelo'
  },
  PIECES_SYMBOLS: {
    red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡'
  },

  PIECES_PER: 4, // Ludo tem 4 peças por jogador
  BOARD_STEPS: 52, // Número de casas no caminho principal de 0 a 51

  // Posições de entrada no caminho principal para cada cor (índices da PATH_COORDS)
  ENTRY_POS: { red: 0, blue: 13, green: 26, yellow: 39 },

  // Casas seguras no tabuleiro principal (índices da PATH_COORDS)
  // Estas são as casas com estrelas, onde outras peças não podem capturar
  SAFE_SQUARES: [0, 8, 13, 21, 26, 34, 39, 47],

  // Posição no tabuleiro principal ANTES de entrar no corredor final (para verificar se passou)
  FINAL_ENTRY_BOARD_POS: { red: 50, blue: 11, green: 24, yellow: 37 }, // Onde a peça 'sai' do ciclo e entra no corredor final

  // Coordenadas visuais (linha, coluna) para cada célula do caminho principal 15x15
  PATH_COORDS: [
    [6,1], [6,2], [6,3], [6,4], [6,5], // 0-4 (Vermelho - Início até a curva)
    [5,6], [4,6], [3,6], [2,6], [1,6], [0,6], // 5-10 (Subida pela esquerda)
    [0,7],                               // 11 (Caminho azul - Posição de entrada)
    [0,8], [1,8], [2,8], [3,8], [4,8], [5,8], // 12-17 (Descida pela direita)
    [6,9], [6,10], [6,11], [6,12], [6,13], // 18-22 (Curva azul para verde)
    [7,14],                              // 23 (Caminho verde - Posição de entrada)
    [8,13], [8,12], [8,11], [8,10], [8,9], // 24-28 (Verde - Início até a curva)
    [9,8], [10,8], [11,8], [12,8], [13,8], [14,8], // 29-34 (Descida pela direita)
    [14,7],                              // 35 (Caminho amarelo - Posição de entrada)
    [14,6], [13,6], [12,6], [11,6], [10,6], // 36-40 (Amarelo - Início até a curva)
    [9,5], [8,4], [8,3], [8,2], [8,1], [8,0], // 41-46 (Subida pela esquerda)
    [7,0],                               // 47 (Caminho vermelho - Posição de entrada)
    [6,0], [6,0], [6,0], [6,0]                // 48-51 (Ajuste para completar os 52 passos, voltando para o início lógico do vermelho)
  ].slice(0, 52), // Garantir que são exatamente 52 passos para o caminho principal

  // As posições na base para cada peça de cada cor.
  // [row, col] para a base de cada cor
  BASE_POSITIONS: {
    red:    [[1,1], [1,4], [4,1], [4,4]],    // Superior esquerda
    blue:   [[1,10], [1,13], [4,10], [4,13]],  // Superior direita
    green:  [[10,10], [10,13], [13,10], [13,13]], // Inferior direita
    yellow: [[10,1], [10,4], [13,1], [13,4]]  // Inferior esquerda
  },

  // Coordenadas visuais do caminho final para cada cor (corredor para o centro)
  HOME_PATHS: {
    red:    [[7,1], [7,2], [7,3], [7,4], [7,5], [7,6]], // Horizontal para o centro
    blue:   [[1,7], [2,7], [3,7], [4,7], [5,7], [6,7]], // Vertical para o centro
    green:  [[7,13], [7,12], [7,11], [7,10], [7,9], [7,8]], // Horizontal para o centro (reverso)
    yellow: [[13,7], [12,7], [11,7], [10,7], [9,7], [8,7]]  // Vertical para o centro (reverso)
  },

  // Coordenadas das células do centro (casa final para todas as cores)
  CENTER_CELLS: [[7,7]] // O ponto central
};