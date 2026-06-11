/* =====================================================
   history.js - Gerencia o histórico de jogos e partidas ao vivo.
   Define a classe HistoryManager. Carregado ANTES de app.js.
===================================================== */
class HistoryManager {
  constructor() {
    this.databaseInstance = null; // Será inicializado com a instância do Firebase Database
  }

  /**
   * Inicializa o HistoryManager com a instância do Firebase Database.
   * @param {object} db Firebase Database instance.
   */
  init(db) {
    this.databaseInstance = db;
  }

  /**
   * Salva o resultado de uma partida Ludo no histórico do usuário.
   * @param {object} gameData Dados do jogo a serem salvos.
   * @returns {Promise<string|null>} A chave do jogo salvo ou null em caso de erro.
   */
  async saveGame(gameData) {
    if (!this.databaseInstance || !gameData.uid || gameData.isAnonymous) {
      // console.warn('Não é possível salvar o jogo: Firebase não inicializado, UID ausente ou usuário anônimo.');
      return null;
    }

    const { gameType, mode, result, endedAt, players, myColor } = gameData;
    const gameRecord = {
      gameType: gameType || 'ludo',
      mode: mode,
      result: result,
      endedAt: endedAt || firebase.database.ServerValue.TIMESTAMP,
      players: players, // Array de { id, name, color, isAI, photoURL, isMe }
    };

    try {
      const userGamesRef = this.databaseInstance.ref(`users/${gameData.uid}/games`);
      const newGameRef = userGamesRef.push();
      await newGameRef.set(gameRecord);
      return newGameRef.key;
    } catch (e) {
      console.error('Erro ao salvar jogo no histórico:', e);
      return null;
    }
  }

  /**
   * Carrega o histórico de partidas Ludo para um dado usuário.
   * @param {string} uid O UID do usuário.
   * @returns {Promise<Array<object>>} Lista de partidas.
   */
  async loadLudoHistory(uid) {
    if (!this.databaseInstance || !uid) {
      console.warn('Não é possível carregar o histórico: Firebase não inicializado ou UID ausente.');
      return [];
    }
    try {
      const snapshot = await this.databaseInstance.ref(`users/${uid}/games`)
        .orderByChild('endedAt')
        .limitToLast(50) // Limita aos últimos 50 jogos
        .once('value');

      const games = [];
      snapshot.forEach(childSnapshot => {
        const game = childSnapshot.val();
        // Garante que é um jogo de Ludo (ou assume se gameType não estiver presente)
        if (!game.gameType || game.gameType === 'ludo') {
          games.push({ id: childSnapshot.key, ...game });
        }
      });
      return games;
    } catch (e) {
      console.error('Erro ao carregar histórico de Ludo:', e);
      return [];
    }
  }

  /**
   * Salva os dados de uma partida Ludo ao vivo.
   * @param {string} roomCode O código da sala.
   * @param {object} roomData Os dados da sala para salvar.
   */
  async saveLudoLiveGame(roomCode, roomData) {
    if (!this.databaseInstance || !roomCode) return;
    try {
      await this.databaseInstance.ref(`live_ludo_games/${roomCode}`).set(roomData);
    } catch (e) {
      console.error('Erro ao salvar partida Ludo ao vivo:', e);
    }
  }

  /**
   * Remove uma partida Ludo da lista de jogos ao vivo.
   * @param {string} roomCode O código da sala.
   */
  async removeLudoLiveGame(roomCode) {
    if (!this.databaseInstance || !roomCode) return;
    try {
      await this.databaseInstance.ref(`live_ludo_games/${roomCode}`).remove();
    } catch (e) {
      console.error('Erro ao remover partida Ludo ao vivo:', e);
    }
  }

  /**
   * Carrega a lista de partidas Ludo ao vivo.
   * @returns {Promise<Array<object>>} Lista de partidas ao vivo.
   */
  async loadLudoLiveGames() {
    if (!this.databaseInstance) {
      console.warn('Não é possível carregar partidas ao vivo: Firebase não inicializado.');
      return [];
    }
    try {
      const snapshot = await this.databaseInstance.ref('live_ludo_games')
        .orderByChild('createdAt')
        .once('value');

      const liveGames = [];
      snapshot.forEach(childSnapshot => {
        const game = childSnapshot.val();
        if (game.status === 'playing' || game.status === 'waiting') { // Apenas jogos ativos/esperando
          liveGames.push({ id: childSnapshot.key, ...game });
        }
      });
      return liveGames;
    } catch (e) {
      console.error('Erro ao carregar partidas Ludo ao vivo:', e);
      return [];
    }
  }
}