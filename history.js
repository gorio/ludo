/* =====================================================
   HistoryManager - Gerencia o histórico de jogos e estatísticas
   Unificado para Xadrez e Ludo.
   Depende de `ludo_constants.js` carregado globalmente.
   Exporta a classe para ser instanciada uma única vez em `app.js`.
===================================================== */
class HistoryManager {
  constructor(db) {
    this.db = db;
  }

  // ====================================================
  // Métodos para LUDO
  // ====================================================

  /**
   * Salva um registro de jogo de Ludo no Firebase.
   * @param {Object} gameData Dados do jogo a serem salvos.
   *   Ex: { gameType: 'ludo', uid: 'abc', isAnonymous: false, mode: 'multiplayer', players: [...], myColor: 'red', result: 'win', endedAt: Date.now() }
   * @returns {string} O ID do jogo salvo.
   */
  async saveLudoGame(gameData) {
    if (!gameData.uid || gameData.isAnonymous) {
      console.warn('Não salvando Ludo game para usuário anônimo ou sem UID.');
      return null;
    }

    const { uid, mode, players, result, myColor, endedAt } = gameData;
    const gameRecord = {
      gameType: 'ludo',
      mode: mode,
      players: players.map(p => ({
        id: p.id || null, // ID do jogador (pode ser null para IA)
        name: p.name,
        color: p.color,
        isAI: p.isAI || false,
        isMe: p.id === uid, // Marca se este é o usuário que está salvando
        photoURL: p.photoURL || null
      })),
      myColor: myColor,
      result: result, // 'win', 'loss', 'draw', 'resigned'
      endedAt: endedAt
    };

    try {
      // Salva o registro completo do jogo em uma coleção separada
      const gameRef = await this.db.ref(`ludoGames/${uid}`).push(gameRecord);

      // Atualiza o total de jogos e vitórias/derrotas/empates no perfil do usuário
      const userStatsRef = this.db.ref(`users/${uid}`);
      await userStatsRef.transaction(currentData => {
        if (!currentData) {
          currentData = { ludoGamesPlayed: 0, ludoWins: 0, ludoLosses: 0, ludoDraws: 0 };
        }
        currentData.ludoGamesPlayed = (currentData.ludoGamesPlayed || 0) + 1;
        if (result === 'win') {
          currentData.ludoWins = (currentData.ludoWins || 0) + 1;
        } else if (result === 'loss' || result === 'resigned') {
          currentData.ludoLosses = (currentData.ludoLosses || 0) + 1;
        } else if (result === 'draw') {
          currentData.ludoDraws = (currentData.ludoDraws || 0) + 1;
        }
        return currentData;
      });

      console.log(`Ludo game ${gameRef.key} salvo e estatísticas atualizadas para ${uid}.`);
      return gameRef.key;
    } catch (error) {
      console.error('Erro ao salvar jogo de Ludo ou atualizar estatísticas:', error);
      return null;
    }
  }

  /**
   * Carrega o histórico de jogos de Ludo para um usuário.
   * @param {string} uid UID do usuário.
   * @returns {Array<Object>} Lista de jogos de Ludo.
   */
  async loadLudoHistory(uid) {
    try {
      const snapshot = await this.db.ref(`ludoGames/${uid}`).orderByChild('endedAt').limitToLast(50).once('value');
      const gamesMap = snapshot.val();
      if (!gamesMap) return [];

      const gamesList = Object.entries(gamesMap).map(([id, game]) => ({ id, ...game }));
      return gamesList.sort((a, b) => b.endedAt - a.endedAt); // Mais recentes primeiro
    } catch (error) {
      console.error('Erro ao carregar histórico de Ludo:', error);
      return [];
    }
  }

  /**
   * Carrega partidas de Ludo ao vivo.
   * @returns {Array<Object>} Lista de partidas de Ludo ativas.
   */
  async loadLudoLiveGames() {
    try {
      // Busca salas que estão "playing" e são de Ludo
      const snapshot = await this.db.ref('rooms')
                                    .orderByChild('gameType')
                                    .equalTo('ludo') // Filtra apenas Ludo
                                    .once('value');
      const roomsMap = snapshot.val();
      if (!roomsMap) return [];

      const liveGames = [];
      for (const roomId in roomsMap) {
        const room = roomsMap[roomId];
        // Filtra as que estão em andamento (não 'waiting', 'finished', 'resigned', etc.)
        if (room.status === 'playing') {
          const players = [];
          if (room.playerColors) {
            for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
                  const pData = room.playerColors[color];
                  if (pData && pData.id) { // Apenas jogadores que já estão no slot
                      players.push({
                          id: pData.id,
                          name: pData.name,
                          color: color,
                          isAI: pData.isAI || false,
                          photoURL: pData.photoURL || null
                      });
                  }
              }
          }
          liveGames.push({
            id: roomId,
            gameType: 'ludo',
            mode: 'multiplayer',
            createdAt: room.createdAt,
            players: players // Lista de jogadores já na sala
          });
        }
      }
      return liveGames.sort((a, b) => b.createdAt - a.createdAt); // Mais recentes primeiro
    } catch (error) {
      console.error('Erro ao carregar partidas de Ludo ao vivo:', error);
      return [];
    }
  }
}