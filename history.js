// history.js
class HistoryManager {
  constructor() {
    this.db = null; // Instância do Firebase Database
  }

  setFirebaseDb(dbInstance) {
    this.db = dbInstance;
  }

  /**
   * Serializa o estado do jogo para salvar no histórico.
   * Adapta o formato para o Ludo.
   * @param {object} engineState O estado do LudoEngine.serialize()
   * @param {Array<object>} playersInfo Informações dos jogadores na partida.
   * @param {string} myUid ID do usuário atual.
   * @returns {object} Dados formatados para o histórico.
   */
  _formatLudoHistoryEntry(engineState, playersInfo, myUid, roomCode = null) {
      const normalizedPlayers = playersInfo.map(p => ({
          // Garante que o jogador atual seja marcado como 'isMe' para facilitar a exibição
          isMe: p.id === myUid,
          id: p.id,
          name: p.name,
          color: p.color,
          isAI: p.isAI || false,
          photoURL: p.photoURL || null
      }));

      // Determina o resultado para o jogador `myUid`
      let result = 'draw'; // Ludo raramente tem empate, mas é um padrão neutro
      if (engineState.winner) {
          const winnerPlayer = playersInfo.find(p => p.color === engineState.winner);
          if (winnerPlayer && winnerPlayer.id === myUid) {
              result = 'win';
          } else if (winnerPlayer && winnerPlayer.id !== myUid) {
              result = 'loss';
          } else if (winnerPlayer && winnerPlayer.isAI && myUid) {
                result = 'loss'; // Se a IA venceu e eu sou humano, eu perdi.
          }
      } else if (engineState.status === 'resigned' || engineState.status === 'abandoned') {
          // Se eu desisti, é perda. Se outro jogador desistiu, é vitória.
          const resigningPlayer = playersInfo.find(p => p.id === myUid);
          const winnerOfResignation = playersInfo.find(p => p.color === engineState.winner);

          if (resigningPlayer && engineState.winner !== resigningPlayer.color) {
            // Eu desisti, ou abandonei, e não fui declarado vencedor
            result = 'loss';
          } else if (winnerOfResignation && winnerOfResignation.id === myUid) {
            // Outro jogador desistiu, e eu fui declarado vencedor
            result = 'win';
          }
      }


      return {
          gameType: 'ludo',
          endedAt: Date.now(),
          mode: engineState.mode, // 'ai' ou 'multiplayer'
          players: normalizedPlayers,
          myColor: playersInfo.find(p => p.id === myUid)?.color || null,
          result: result,
          roomCode: roomCode, // Se for multiplayer
          state: engineState // Salva o estado final completo para possível replay (opcional para Ludo)
      };
  }

  /**
   * Salva uma partida de Ludo no histórico do usuário.
   * @param {object} gameData
   *   - gameType: 'ludo'
   *   - uid: ID do usuário
   *   - isAnonymous: bool
   *   - mode: 'ai' | 'multiplayer'
   *   - players: Array de objetos {id, name, color, isAI, photoURL}
   *   - myColor: Cor do jogador no jogo
   *   - result: 'win' | 'loss' | 'draw' | 'resigned'
   *   - endedAt: timestamp
   *   - roomCode: string (opcional para multiplayer)
   *   - state: objeto serializado do engine (opcional)
   */
  async saveGame(gameData) {
      if (!this.db || !gameData.uid || gameData.isAnonymous) return;

      const userGameRef = this.db.ref(`users/${gameData.uid}/ludoGames`).push();
      await userGameRef.set({
          endedAt: gameData.endedAt,
          mode: gameData.mode,
          players: gameData.players,
          myColor: gameData.myColor,
          result: gameData.result,
          roomCode: gameData.roomCode,
          state: gameData.state || null // Estado do jogo. Opcional para economia de dados.
      });

      // Atualiza as estatísticas do usuário
      const userStatsRef = this.db.ref(`users/${gameData.uid}`);
      await userStatsRef.update({
          ludoGamesPlayed: firebase.database.ServerValue.increment(1),
          ludoWins: firebase.database.ServerValue.increment(gameData.result === 'win' ? 1 : 0),
          ludoLosses: firebase.database.ServerValue.increment(gameData.result === 'loss' ? 1 : 0),
          ludoDraws: firebase.database.ServerValue.increment(gameData.result === 'draw' ? 1 : 0)
      });
  }

  /**
   * Carrega o histórico de partidas de Ludo para um usuário.
   * @param {string} uid ID do usuário.
   * @returns {Array<object>} Lista de jogos.
   */
  async loadLudoHistory(uid) {
    if (!this.db || !uid) return [];
    try {
      const snapshot = await this.db.ref(`users/${uid}/ludoGames`).orderByChild('endedAt').limitToLast(50).once('value');
      const games = [];
      snapshot.forEach(childSnapshot => {
        const game = childSnapshot.val();
        // Marca o jogador atual como 'isMe' para a UI
        if (game.players) {
            game.players.forEach(p => {
                if (p.id === uid) p.isMe = true;
                else p.isMe = false;
            });
        }
        games.push({ id: childSnapshot.key, ...game });
      });
      return games.reverse(); // Mais recentes primeiro
    } catch (e) {
      console.error('Erro ao carregar histórico de Ludo:', e);
      return [];
    }
  }

  /**
   * Salva uma partida de Ludo como "ao vivo" (multiplayer ativo)
   * @param {string} roomCode
   * @param {object} roomData
   */
  async saveLudoLiveGame(roomCode, roomData) {
      if (!this.db || !roomCode || !roomData) return;
      await this.db.ref(`ludoLiveGames/${roomCode}`).set({
          id: roomCode,
          createdAt: roomData.createdAt,
          gameType: 'ludo',
          players: Object.values(roomData.playerColors).filter(p => p.id !== null).map(p => ({
              id: p.id,
              name: p.name,
              color: p.color,
              isAI: p.isAI,
              photoURL: p.photoURL
          })),
          status: roomData.status,
          hostUid: roomData.hostId
      });
  }

  /**
   * Remove uma partida de Ludo da lista de "ao vivo".
   * @param {string} roomCode
   */
  async removeLudoLiveGame(roomCode) {
      if (!this.db || !roomCode) return;
      await this.db.ref(`ludoLiveGames/${roomCode}`).remove();
  }

  /**
   * Carrega partidas de Ludo ao vivo.
   * @returns {Array<object>}
   */
  async loadLudoLiveGames() {
      if (!this.db) return [];
      try {
          const snapshot = await this.db.ref('ludoLiveGames').orderByChild('createdAt').once('value');
          const games = [];
          snapshot.forEach(childSnapshot => {
              const game = childSnapshot.val();
              if (game.status === 'waiting' || game.status === 'playing') {
                  games.push({ id: childSnapshot.key, ...game });
              }
          });
          return games.reverse(); // Mais recentes primeiro
      } catch (e) {
          console.error('Erro ao carregar partidas Ludo ao vivo:', e);
          return [];
      }
  }
}