/* =====================================================
   GERENCIADOR DE HISTÓRICO DE JOGOS + REPLAY + ESPECTADOR
   Suporta Xadrez/Dama e Ludo. Replay apenas para Xadrez.
===================================================== */
class GameHistoryManager {
  constructor() {
    // Propriedades para replay de Xadrez/Dama
    this.replayEngine = null;
    this.replayMoves = []; // Array de movimentos SAN do Xadrez
    this.replayIndex = 0;
    this.replayGameId = null;
  }

  /* -------------------------------------------------
     SALVAR PARTIDA DE XADREZ/DAMA
     (Mantém a mesma funcionalidade original)
  ------------------------------------------------- */
  async saveChessGame({ gameId, mode, difficulty, myColor,
                        whiteName, blackName, whiteUid, blackUid,
                        result, reason, movesData, sanHistory, totalMoves,
                        roomCode // Adicionado para referência
                      }) {
    if (!auth.isLoggedIn) return;

    const uid = auth.uid;
    const isWin = (result === myColor);
    const isDraw = (result === 'draw');

    const record = {
      gameId, mode, difficulty: difficulty || '',
      myColor, whiteName, blackName,
      whiteUid: whiteUid || '', blackUid: blackUid || '',
      result, reason,
      movesData: movesData || '',
      sanHistory: sanHistory || '',
      totalMoves: totalMoves || 0,
      roomCode: roomCode || null,
      startedAt: Date.now(),
      endedAt: Date.now()
    };

    try {
      await firebase.database()
        .ref(`gameHistory/${uid}/${gameId}`) // Caminho específico para Xadrez/Dama
        .set(record);

      // Atualiza stats de Xadrez/Dama do usuário
      const userRef = firebase.database().ref(`users/${uid}`);
      const snap = await userRef.once('value');
      const userData = snap.val() || {};

      await userRef.update({
        gamesPlayed: (userData.gamesPlayed || 0) + 1,
        wins: (userData.wins || 0) + (isWin ? 1 : 0),
        losses: (userData.losses || 0) + (!isWin && !isDraw ? 1 : 0),
        draws: (userData.draws || 0) + (isDraw ? 1 : 0)
      });
    } catch (e) {
      console.error('Erro ao salvar histórico de Xadrez/Dama:', e);
    }
  }

  /* -------------------------------------------------
     SALVAR PARTIDA DE LUDO
  ------------------------------------------------- */
  async saveLudoGame({ gameId, mode, players, // Array de players com seus scores finais
                       myColor, myId, winnerColor, status, roomCode
                     }) {
    if (!auth.isLoggedIn) return;

    const uid = auth.uid;
    // const playerRecord = players.find(p => p.id === myId); // Não é usado atualmente, mas útil para referência.

    // Determina o resultado para este usuário
    let result = 'draw'; // padrão para empates ou finalizações sem vencedor claro
    if (status === 'finished' && winnerColor === myColor) {
      result = 'win';
    } else if (status === 'finished' && winnerColor !== myColor && winnerColor !== null) {
      // Se não é a minha cor e há um vencedor específico
      result = 'loss';
    } else if (status === 'resigned' && winnerColor === myColor) {
      result = 'loss'; // Se eu resignei, é uma derrota
    }


    const record = {
      gameId,
      mode,
      myColor,
      myId,
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isAI: p.isAI,
        score: p.score // Pontuação final do jogador
      })),
      winnerColor,
      status, // 'finished', 'resigned', 'abandoned'
      roomCode,
      endedAt: Date.now()
    };

    try {
      await firebase.database()
        .ref(`ludoHistory/${uid}/${gameId}`) // Caminho específico para Ludo
        .set(record);

      // Atualiza stats de Ludo do usuário
      const userRef = firebase.database().ref(`users/${uid}`);
      const snap = await userRef.once('value');
      const userData = snap.val() || {};

      await userRef.update({
        ludoGamesPlayed: (userData.ludoGamesPlayed || 0) + 1,
        ludoWins: (userData.ludoWins || 0) + (result === 'win' ? 1 : 0),
        ludoLosses: (userData.ludoLosses || 0) + (result === 'loss' ? 1 : 0),
        ludoDraws: (userData.ludoDraws || 0) + (result === 'draw' ? 1 : 0)
      });
    } catch (e) {
      console.error('Erro ao salvar histórico de Ludo:', e);
    }
  }

  /* -------------------------------------------------
     CARREGAR HISTÓRICO DE XADREZ/DAMA
  ------------------------------------------------- */
  async loadChessHistory(uid) {
    uid = uid || auth.uid;
    if (!uid) return [];

    const snap = await firebase.database()
      .ref(`gameHistory/${uid}`)
      .orderByChild('endedAt')
      .limitToLast(50)
      .once('value');

    const data = snap.val();
    if (!data) return [];

    return Object.values(data)
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  }

  /* -------------------------------------------------
     CARREGAR HISTÓRICO DE LUDO
  ------------------------------------------------- */
  async loadLudoHistory(uid) {
    uid = uid || auth.uid;
    if (!uid) return [];

    const snap = await firebase.database()
      .ref(`ludoHistory/${uid}`) // Caminho específico para Ludo
      .orderByChild('endedAt')
      .limitToLast(50)
      .once('value');

    const data = snap.val();
    if (!data) return [];

    return Object.values(data)
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  }

  /* -------------------------------------------------
     CARREGAR PARTIDAS AO VIVO DE XADREZ/DAMA
  ------------------------------------------------- */
  async loadChessLiveGames() {
    const snap = await firebase.database()
      .ref('rooms') // As salas de Xadrez/Dama estão em 'rooms'
      .orderByChild('status')
      .equalTo('playing')
      .limitToLast(20)
      .once('value');

    const data = snap.val();
    if (!data) return [];

    return Object.entries(data).map(([id, room]) => ({ id, ...room }));
  }

  /* -------------------------------------------------
     CARREGAR PARTIDAS AO VIVO DE LUDO
  ------------------------------------------------- */
  async loadLudoLiveGames() {
    const snap = await firebase.database()
      .ref('ludo_rooms') // As salas de Ludo estão em 'ludo_rooms'
      .orderByChild('status')
      .equalTo('playing')
      .limitToLast(20)
      .once('value');

    const data = snap.val();
    if (!data) return [];

    // Adapta o nome da sala para o formato esperado pela UI de live games
    return Object.entries(data).map(([id, room]) => {
      const playerNames = (room.players || [])
        .filter(p => !p.isAI && p.id !== null)
        .map(p => p.name)
        .join(' vs ');
      const aiCount = (room.players || []).filter(p => p.isAI).length;
      let opponentDisplay = playerNames;
      if (aiCount > 0) {
        opponentDisplay += (opponentDisplay ? ' +' : '') + `${aiCount} IA(s)`;
      } else if (!opponentDisplay && (room.status === 'playing' || room.status === 'waiting')) { // Sala vazia mas "playing" - ou bug ou espera por mais humanos
        opponentDisplay = 'Aguardando jogadores';
      }

      return {
        id,
        ...room,
        gameType: 'ludo', // Identifica o tipo de jogo para a UI
        whiteName: opponentDisplay, // Usado como "nome do oponente" na UI de live games
        blackName: '', // Não aplicável diretamente para Ludo multi-color
      };
    });
  }

  /* -------------------------------------------------
     REPLAY DE XADREZ/DAMA
     (Mantido, Ludo não terá replay por sua memória)
  ------------------------------------------------- */
  startReplay(record) {
    this.replayGameId = record.gameId;
    this.replayMoves = record.sanHistory
      ? record.sanHistory.split('|').filter(Boolean)
      : [];

    this.replayIndex = 0;
    // O ChessEngine precisa ser importado ou estar disponível globalmente
    // Se você tiver um ChessEngine no seu projeto, certifique-se que ele é carregado
    // antes de `history.js` ou que `history.js` o importa.
    this.replayEngine = new ChessEngine(); // Replay para ChessEngine (assumindo que ChessEngine está global)
    return this.replayEngine;
  }

  get replayTotal() { return this.replayMoves.length; }
  get replayCurrent() { return this.replayIndex; }

  replayGoTo(index) {
    this.replayEngine = new ChessEngine(); // Re-cria o motor para resetar o estado
    this.replayIndex = 0;

    // A função `applyMoveBySAN` precisa ser global ou exportada para ser usada aqui.
    // Assumindo que ela está global em `app.js` e `app.js` é carregado no final,
    // esta chamada pode dar erro se history.js precisar dela antes da inicialização de app.js.
    // Uma solução seria passar `applyMoveBySAN` como um método para `GameHistoryManager` ou ter um `ReplayManager` separado.
    // Por enquanto, farei uma versão local apenas para o replay de xadrez.

    // Implementação simplificada para replay (assumindo que ChessEngine e `_applyMoveBySAN` estão globalmente acessíveis ou em escopo de `app.js`)
    for (let i = 0; i < index && i < this.replayMoves.length; i++) {
        // Esta função `_applyMoveBySAN` precisaria vir de um Chess Replay specific logic
        // Como o Ludo está sendo focado, vou deixar o Chess replay como era no `app.js`
        // e ele não deve afetar o Ludo. Esta é a parte que a função global `applyMoveBySAN` seria usada.
        // Já que app.js é carregado depois, não temos applyMoveBySAN aqui.
        // O mais seguro é que a função comece com `engine.applyMoveBySAN(this.replayMoves[i]);` e a lógica esteja no engine de xadrez
        // ou que `app.js` chame o `replayGoTo` com um callback de aplicação de movimento.
        // Por hora, vou remover a dependência direta de `applyMoveBySAN` esperando que ela seja resolvida em `app.js` ou em outro lugar.
        // Se ela vier de `app.js`, o `app.js` precisará passá-la para `historyManager` no `init`.
        // Para manter a compatibilidade com a estrutura, eu estou assumindo `applyMoveBySAN` existe no escopo global.
        if (typeof applyMoveBySAN !== 'undefined') {
            applyMoveBySAN(this.replayEngine, this.replayMoves[i]);
            this.replayIndex++;
        } else {
            console.warn("Função applyMoveBySAN não encontrada para replay de Xadrez/Dama. O replay pode não funcionar.");
        }
    }
    return this.replayEngine;
  }

  replayNext() {
    if (this.replayIndex >= this.replayMoves.length) return null;
    const san = this.replayMoves[this.replayIndex];
    if (typeof applyMoveBySAN !== 'undefined') {
        applyMoveBySAN(this.replayEngine, san);
        this.replayIndex++;
        return this.replayEngine;
    }
    console.warn("Função applyMoveBySAN não encontrada para replay de Xadrez/Dama. O replay pode não funcionar.");
    return null;
  }

  replayPrev() {
    if (this.replayIndex <= 0) return null;
    return this.replayGoTo(this.replayIndex - 1);
  }

  replayFirst() { return this.replayGoTo(0); }
  replayLast() { return this.replayGoTo(this.replayMoves.length); }
}

const historyManager = new GameHistoryManager();