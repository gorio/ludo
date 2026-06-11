/* =====================================================
   HistoryManager - Gerencia o registro, leitura e replay de partidas (Ludo e Chess/Dama).
   Esta classe NÃO deve ser instanciada globalmente neste arquivo.
   Sua instância será criada e gerenciada por `app.js`.
===================================================== */
class HistoryManager {
  constructor(firebaseDatabase) {
    this.db = firebaseDatabase;
    this.replayEngine = null; // Para replay de Chess/Dama
  }

  /**
   * Salva um registro de jogo no Firebase.
   * @param {Object} gameData Dados do jogo a serem salvos.
   *   Ex: { gameType: 'ludo', uid: 'user123', mode: 'pvp', players: [...], result: 'win', endedAt: Date.now() }
   */
  async saveGame(gameData) {
    if (!gameData.uid || gameData.isAnonymous) {
      console.warn("Não é possível salvar jogo para usuário anônimo ou sem UID.");
      return null;
    }

    const { gameType, uid, mode, result, endedAt, players } = gameData;
    const opponentNames = players
      .filter(p => p.id !== uid && !p.isAI)
      .map(p => p.name)
      .join(', ');
    const aiCount = players.filter(p => p.isAI).length;

    const record = {
      gameType: gameType,
      mode: mode,
      result: result,
      endedAt: endedAt,
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isAI: p.isAI,
        photoURL: p.photoURL || null
      })),
      opponentSummary: opponentNames || (aiCount > 0 ? `${aiCount} IA(s)` : 'Solo'),
    };

    try {
      const userGameRef = this.db.ref(`users/${uid}/games`).push();
      await userGameRef.set(record);
      return userGameRef.key;
    } catch (e) {
      console.error(`Erro ao salvar jogo (${gameType}) para o usuário ${uid}:`, e);
      return null;
    }
  }

  /**
   * Carrega o histórico de jogos Ludo para um usuário específico.
   * @param {string} uid UID do usuário.
   * @returns {Array} Lista de jogos Ludo.
   */
  async loadLudoHistory(uid) {
    if (!uid) return [];
    try {
      const snapshot = await this.db.ref(`users/${uid}/games`)
        .orderByChild('endedAt')
        .once('value');
      const gamesMap = snapshot.val();
      if (!gamesMap) return [];

      const filteredGames = Object.entries(gamesMap)
        .map(([id, data]) => ({ id, ...data }))
        .filter(game => game.gameType === 'ludo') // Filtra apenas jogos de Ludo
        .sort((a, b) => b.endedAt - a.endedAt); // Mais recente primeiro

      // Adiciona 'isMe' para facilitar a renderização no frontend
      return filteredGames.map(game => {
        const myPlayer = game.players.find(p => p.id === uid);
        return {
          ...game,
          players: game.players.map(p => ({
            ...p,
            isMe: (p.id === uid),
            name: (p.id === uid && myPlayer.name) ? myPlayer.name + ' (Você)' : p.name
          }))
        };
      });
    } catch (e) {
      console.error('Erro ao carregar histórico de Ludo:', e);
      return [];
    }
  }

  /**
   * Carrega partidas Ludo ao vivo que ainda não terminaram.
   * @returns {Array} Lista de partidas Ludo ao vivo.
   */
  async loadLudoLiveGames() {
    try {
      const snapshot = await this.db.ref('rooms')
        .orderByChild('status')
        .equalTo('playing')
        .once('value');
      const roomsMap = snapshot.val();
      if (!roomsMap) return [];

      const liveGames = [];
      for (const roomId in roomsMap) {
        const room = roomsMap[roomId];
        if (room.gameType === 'ludo') { // Filtra por tipo de jogo Ludo
          const playersArray = Object.values(room.playerColors || {}).map(playerData => ({
            id: playerData.id,
            name: playerData.name,
            color: playerData.color,
            isAI: playerData.isAI || false,
            photoURL: playerData.photoURL || null
          }));
          liveGames.push({
            id: roomId,
            createdAt: room.createdAt,
            players: playersArray,
            status: room.status,
            // Adicione outros dados relevantes se necessário
          });
        }
      }
      return liveGames.sort((a,b) => b.createdAt - a.createdAt); // Mais recentes primeiro
    } catch (e) {
      console.error('Erro ao carregar partidas Ludo ao vivo:', e);
      return [];
    }
  }

  /* =====================================================
     MÉTODOS DE REPLAY DE XADREZ/DAMA (MANTIDOS SEPARADOS)
     Esses métodos são específicos para jogos de Tabuleiro (Chess/Draughts)
     e não são usados pelo Ludo.
     ** REMOVIDOS ** para evitar duplicação e código não utilizado para o LUDO.
  ===================================================== */

}