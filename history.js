/* =====================================================
   HISTORY MANAGER - Gerencia o histórico de jogos
===================================================== */
class HistoryManager {
  constructor(firebaseDbInstance) {
    this.db = firebaseDbInstance;
  }

  /**
   * Salva um registro de jogo concluído (Ludo) no histórico do usuário e na lista de jogos globais.
   * @param {object} gameData Dados do jogo a serem salvos.
   * @param {string} gameData.gameType 'ludo'
   * @param {string} gameData.uid ID do usuário.
   * @param {boolean} gameData.isAnonymous Se o usuário é anônimo.
   * @param {string} gameData.mode 'ai' ou 'multiplayer'
   * @param {Array<object>} gameData.players Array de objetos Player do engine.
   * @param {string} gameData.myColor A cor do jogador atual.
   * @param {string} gameData.result 'win', 'loss', 'draw', 'resigned'
   * @param {number} gameData.endedAt Timestamp do fim do jogo.
   * @param {string} [gameData.roomCode] Código da sala para jogos multiplayer.
   * @param {string} [gameData.difficulty] Dificuldade da IA para jogos contra IA.
   * @returns {Promise<string|null>} A chave do jogo salvo ou null em caso de erro.
   */
  async saveGame(gameData) {
    if (gameData.isAnonymous) {
      console.log('Não é possível salvar histórico para usuários anônimos.');
      return null;
    }
    if (!gameData.uid) {
      console.error('UID do usuário é necessário para salvar o jogo.');
      return null;
    }

    try {
      const myPlayer = gameData.players.find(p => p.id === gameData.uid);
      const opponentPlayers = gameData.players.filter(p => p.id !== gameData.uid);

      const record = {
        gameType: gameData.gameType,
        uid: gameData.uid,
        mode: gameData.mode,
        players: gameData.players.map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            isAI: p.isAI || false,
            photoURL: p.photoURL || null,
            isMe: p.id === gameData.uid // Adiciona uma flag para o próprio jogador no registro
        })),
        myColor: myPlayer ? myPlayer.color : 'unknown', // Cor do jogador no jogo
        result: gameData.result,
        endedAt: gameData.endedAt,
        roomCode: gameData.roomCode || null,
        difficulty: gameData.difficulty || null,
        // Adicione outros dados relevantes do estado final do jogo, se necessário
      };

      // Salva na lista de jogos do usuário
      const userGamesRef = this.db.ref(`users/${gameData.uid}/games`);
      const newGameRef = userGamesRef.push();
      await newGameRef.set(record);

      console.log(`Jogo Ludo salvo para ${gameData.uid}. ID: ${newGameRef.key}`);
      return newGameRef.key;

    } catch (e) {
      console.error('Erro ao salvar jogo de Ludo:', e);
      return null;
    }
  }

  /**
   * Carrega o histórico de jogos Ludo de um usuário.
   * @param {string} uid ID do usuário.
   * @returns {Promise<Array<object>>} Array de objetos de jogos.
   */
  async loadLudoHistory(uid) {
    if (!uid) return [];
    try {
      const snap = await this.db.ref(`users/${uid}/games`)
        .orderByChild('endedAt')
        .limitToLast(50) // Limita aos 50 jogos mais recentes
        .once('value');
      const rawGames = snap.val();
      if (!rawGames) return [];

      const games = Object.entries(rawGames)
        .map(([id, data]) => ({ id, ...data }))
        .filter(game => game.gameType === 'ludo') // Filtra apenas jogos de Ludo
        .sort((a,b) => b.endedAt - a.endedAt); // Ordena do mais recente para o mais antigo

      return games;
    } catch (e) {
      console.error('Erro ao carregar histórico de Ludo:', e);
      return [];
    }
  }

  /**
   * Salva o estado de uma sala multiplayer de Ludo (usado para partidas ao vivo).
   * @param {string} roomCode Código da sala.
   * @param {object} roomData Dados da sala.
   */
  async saveLudoLiveGame(roomCode, roomData) {
    try {
      await this.db.ref(`live_ludo_rooms/${roomCode}`).set(roomData);
    } catch (e) {
      console.error('Erro ao salvar partida Ludo ao vivo:', e);
    }
  }

  /**
   * Remove uma sala de Ludo da lista de partidas ao vivo.
   * @param {string} roomCode Código da sala.
   */
  async removeLudoLiveGame(roomCode) {
    try {
      await this.db.ref(`live_ludo_rooms/${roomCode}`).remove();
    } catch (e) {
      console.error('Erro ao remover partida Ludo ao vivo:', e);
    }
  }

  /**
   * Carrega todas as partidas de Ludo ao vivo.
   * @returns {Promise<Array<object>>}
   */
  async loadLudoLiveGames() {
    try {
      const snap = await this.db.ref('live_ludo_rooms')
        .orderByChild('createdAt')
        .once('value');
      const rawRooms = snap.val();
      if (!rawRooms) return [];

      return Object.entries(rawRooms)
        .map(([id, data]) => ({ id, ...data }))
        .filter(room => room.status === 'playing' || room.status === 'waiting' || room.status === 'resumed') // Filtra apenas jogos ativos
        .sort((a,b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error('Erro ao carregar partidas de Ludo ao vivo:', e);
      return [];
    }
  }

  // Métodos específicos para Xadrez/Dama (se coexistirem no projeto)
  // Atualmente não são usados neste fluxo Ludo, mas podem ser adicionados aqui
  // para futura expansão, mantendo HistoryManager coeso.
}