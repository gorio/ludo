class HistoryManager {
  constructor(firebaseDB) {
    this.db = firebaseDB;
    if (!this.db) {
        console.error("Firebase Database not provided to HistoryManager constructor.");
    }
  }

  /**
   * Salva um registro de jogo no Firebase Realtime Database.
   * @param {object} gameData Dados do jogo a serem salvos.
   * @returns {Promise<string|null>} A chave do novo registro ou null em caso de erro.
   */
  async saveGame(gameData) {
    if (!this.db || !gameData || !gameData.uid || gameData.isAnonymous) {
      console.warn("Não foi possível salvar o jogo: DB não conectado, dados incompletos ou usuário anônimo.");
      return null;
    }

    const { gameType, uid, mode, players, myColor, result, endedAt } = gameData;
    const opponentName = players
        .filter(p => p.id !== uid && !p.isAI)
        .map(p => p.name)
        .join(', ') || 'Oponente IA/Outros';

    const record = {
      gameType: gameType, // 'ludo' ou 'chess'
      uid: uid,
      playerName: players.find(p => p.id === uid)?.name || 'Eu',
      opponentName: opponentName,
      myColor: myColor,
      mode: mode,
      result: result,
      players: players, // Salva todos os players para reconstituição
      endedAt: endedAt
    };

    try {
      const ref = await this.db.ref(`users/${uid}/games/${gameType}`).push(record);
      return ref.key;
    } catch (e) {
      console.error(`Erro ao salvar jogo de ${gameType}:`, e);
      return null;
    }
  }

  /**
   * Carrega o histórico de partidas de um tipo específico de jogo para um usuário.
   * @param {string} uid UID do usuário.
   * @param {string} gameType Tipo de jogo ('ludo' ou 'chess').
   * @returns {Promise<Array>} Lista de objetos de jogo.
   */
  async loadHistory(uid, gameType) {
    if (!this.db || !uid) {
      console.warn("Não foi possível carregar o histórico: DB não conectado ou UID ausente.");
      return [];
    }

    try {
      const snap = await this.db.ref(`users/${uid}/games/${gameType}`)
        .orderByChild('endedAt').limitToLast(50).once('value'); // Últimas 50 partidas
      const raw = snap.val();

      if (!raw) return [];

      const games = Object.entries(raw)
        .map(([key, value]) => ({ id: key, ...value }))
        .sort((a, b) => b.endedAt - a.endedAt); // Ordena do mais recente para o mais antigo

      return games;
    } catch (e) {
      console.error(`Erro ao carregar histórico de ${gameType}:`, e);
      return [];
    }
  }

  /**
   * Salva um jogo multiplayer ao vivo (apenas Ludo no momento).
   * Isso permite que outros usuários assistam.
   * @param {string} roomCode Código da sala.
   * @param {object} roomData Dados da sala.
   */
  async saveLudoLiveGame(roomCode, roomData) {
    if (!this.db) return;
    try {
        await this.db.ref(`live_games/ludo/${roomCode}`).set(roomData);
    } catch (e) {
        console.error("Erro ao salvar partida Ludo ao vivo:", e);
    }
  }

  /**
   * Remove um jogo multiplayer ao vivo.
   * @param {string} roomCode Código da sala.
   */
  async removeLudoLiveGame(roomCode) {
    if (!this.db) return;
    try {
        await this.db.ref(`live_games/ludo/${roomCode}`).remove();
    } catch (e) {
        console.error("Erro ao remover partida Ludo ao vivo:", e);
    }
  }

  /**
   * Carrega todas as partidas de Ludo ao vivo.
   * @returns {Promise<Array>} Lista de partidas.
   */
  async loadLudoLiveGames() {
    if (!this.db) return [];
    try {
        const snap = await this.db.ref('live_games/ludo').once('value');
        const raw = snap.val();
        if (!raw) return [];
        return Object.entries(raw).map(([roomCode, data]) => ({ roomCode, ...data }));
    } catch (e) {
        console.error("Erro ao carregar partidas Ludo ao vivo:", e);
        return [];
    }
  }

  // Adaptação para Ludo
  async loadLudoHistory(uid) {
      return this.loadHistory(uid, 'ludo');
  }
}