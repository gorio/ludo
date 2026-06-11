/* =====================================================
   CONFIGURAÇÃO FIREBASE E VARIÁVEIS GLOBAIS
===================================================== */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCa0WmUo1PIrlaYW6Ei8ZZK3XLZ4i0gIfo", // SUBSTITUA PELA SUA CHAVE REAL!
  authDomain:        "golf-oscar-romeo.firebaseapp.com",
  projectId:         "golf-oscar-romeo",
  storageBucket:     "golf-oscar-romeo.firebasestorage.app",
  databaseURL:       "https://golf-oscar-romeo-default-rtdb.firebaseio.com",
  messagingSenderId: "71631208569",
  appId:             "1:71631208569:web:e7a1cc7ad20903ce5ad4a8"
};

// Instâncias globais (criadas UMA VEZ no app.js)
let db, fbAuth; // Firebase Database e Auth
const currentAuthManager = new AuthManager(); // Gerencia o estado de autenticação
const historyManager = new HistoryManager();  // Gerencia o histórico de jogos
const engine = new LudoEngine();             // Motor do jogo de Ludo
const ai = new LudoAI();                     // AI do jogo de Ludo

// Variáveis de estado do jogo
let myId = 'guest_' + Math.random().toString(36).slice(2, 8); // ID temporário para visitantes
let myColor = null;           // Cor do jogador atual na partida
let gameActive = false;       // Indica se uma partida está em andamento
let gameMode = 'ai';          // 'ai' ou 'multiplayer'
let aiThinking = false;       // Indica se a IA está pensando/jogando
let isSpectator = false;      // Indica se o usuário é espectador

// Variáveis para Multiplayer
let roomCode = null;        // Código da sala atual
let roomRef = null;         // Referência do Firebase para a sala
let specRef = null;         // Referência do Firebase para espectadores (pode ser a mesma de roomRef)
let selectedHumanPlayersCount = 2; // Padrão para multiplayer (2-4)
let selectedAiCount = 1;      // Padrão para partidas contra AI (1-3)

// Variáveis para Replay (ainda implementadas para Xadrez, Ludo não tem replay estruturado assim)
// Mantidas para compatibilidade se o usuário decidir implementar replay Ludo.
let replayMoves = [];
let replayTarget = 0;
let replayEngine = null; // Replay deve usar ChessEngine se for para Xadrez
let replayInterval = null;
let replayGameData = null;

// Variáveis de UI específicos do Ludo
let BOARD_CELLS_DOM = []; // Armazena referências aos elementos DOM das células do tabuleiro Ludo

/* =====================================================
   HELPER FUNCTIONS (FUNÇÕES AUXILIARES)
===================================================== */

/**
 * Atalho para `document.getElementById()`.
 * @param {string} id O ID do elemento.
 * @returns {HTMLElement|null} O elemento HTML.
 */
function gel(id) {
  return document.getElementById(id);
}

/**
 * Atalho para adicionar event listener.
 * @param {string} id O ID do elemento.
 * @param {string} event O tipo de evento (ex: 'click').
 * @param {Function} handler O manipulador de evento.
 */
function el(id, event, handler) {
  const element = gel(id);
  if (element) {
    element.addEventListener(event, handler);
  } else {
    //console.warn(`Elemento com ID '${id}' não encontrado para adicionar evento '${event}'.`);
  }
}

/**
 * Escapa caracteres HTML para prevenir XSS.
 * @param {string} str A string a ser escapada.
 * @returns {string} A string escapada.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* =====================================================
   APP INITIALIZATION (INICIALIZAÇÃO DO APLICATIVO)
===================================================== */
document.addEventListener('DOMContentLoaded', function() {
  // Inicializa Firebase no DOMContentLoaded
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    fbAuth = firebase.auth();
    currentAuthManager.setFirebaseAuth(fbAuth); // Passa a instância do Firebase Auth para o manager
  } catch (e) {
    console.error('Erro ao inicializar Firebase:', e);
    alert('Erro ao inicializar o aplicativo. Verifique sua conexão ou tente novamente mais tarde.');
    return;
  }

  // Inicializa as UIs. Note que elas APENAS configuram listeners, NÃO mostram telas.
  initAuthUI();
  initLobbyUI();
  initGameUI();
  initLudoHistoryLiveUI(); // Inicializa listeners específicos de Ludo History/Live

  // O AuthManager gerencia o onAuthStateChanged e chama updateUI
  currentAuthManager.onAuthStateChanged(user => {
    if (user) {
      myId = user.uid;
      // Atualiza o display name se user for anônimo e ainda tiver "Visitante"
      if (user.isAnonymous && user.displayName === 'Visitante') {
          // Mantém como visitante por padrão
      } else if (!user.displayName && user.email) {
          // Se não tem displayName mas tem email, usa parte do email
          currentAuthManager.updateProfile({ displayName: user.email.split('@')[0] });
      }
      updateHeaderUI(user);
      showScreen('lobby'); // Vai para o lobby se autenticado
    } else {
      myId = 'guest_' + Math.random().toString(36).slice(2, 8);
      updateHeaderUI(null);
      showScreen('auth'); // Vai para a tela de autenticação se deslogado
    }
  });

  // Constrói o DOM do tabuleiro Ludo uma única vez
  buildBoardDOM();
});

/* =====================================================
   NAVIGATION (NAVEGAÇÃO ENTRE TELAS)
===================================================== */

/**
 * Exibe uma tela específica e esconde todas as outras.
 * @param {string} screenName O nome da tela (ex: 'auth', 'lobby', 'game').
 */
function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  const targetScreen = gel(`screen-${screenName}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
  } else {
    console.error(`Screen com ID 'screen-${screenName}' não encontrada.`);
  }

  // Lógica para esconder/mostrar o header
  const header = gel('app-header');
  if (header) {
    if (screenName === 'auth') { // Esconde o header na tela de autenticação
      header.classList.add('hidden');
    } else {
      header.classList.remove('hidden');
    }
  }

  // Limpa possíveis estados de jogo ao mudar de tela
  if (screenName !== 'game' && screenName !== 'waiting' && screenName !== 'ludo-history' && screenName !== 'ludo-live-games') {
    resetGameState();
    hideModal('modal-gameover');
  }

  // Limpa mensagens de erro ao mudar de tela
  clearAuthError();
  clearLobbyError();
}

/**
 * Reseta o estado do jogo e variáveis globais relacionadas.
 */
function resetGameState() {
  gameActive = false;
  aiThinking = false;
  isSpectator = false;
  myColor = null;
  roomCode = null;
  if (roomRef) { roomRef.off(); roomRef = null; }
  if (specRef) { specRef.off(); specRef = null; }
  engine.reset();
  // Limpar replay específicos de xadrez se estiverem ativos
  if (replayInterval) stopReplayAuto();
  replayEngine = null;
  replayGameData = null;

  // Reseta player/AI counts no lobby UI
  selectedHumanPlayersCount = 2; // Reinicia para padrão
  selectedAiCount = 1; // Reinicia para padrão
  // Reseta a UI do criador de sala
  const numPlayersBtns = document.getElementById('num-players-btns');
  if (numPlayersBtns) {
      numPlayersBtns.querySelectorAll('.btn').forEach(btn => {
          btn.classList.remove('active');
          if (parseInt(btn.dataset.count) === 2) btn.classList.add('active'); // Seleciona 2 como padrão
      });
  }
  const aiCountBtns = document.getElementById('ai-count-btns');
  if (aiCountBtns) {
      aiCountBtns.querySelectorAll('.btn').forEach(btn => {
          btn.classList.remove('active');
          if (parseInt(btn.dataset.count) === 1) btn.classList.add('active'); // Seleciona 1 como padrão
      });
  }

}

/**
 * Retorna para a tela do lobby, resetando o jogo.
 */
function goLobby() {
  resetGameState();
  // Garante que o input de sala esteja vazio
  const inputRoom = gel('input-room');
  if (inputRoom) inputRoom.value = '';
  const inputSpectate = gel('input-spectate');
  if (inputSpectate) inputSpectate.value = '';
  showScreen('lobby');
}

/**
 * Exibe um modal específico.
 * @param {string} id O ID do modal.
 */
function showModal(id) {
  const element = gel(id);
  if (element) element.classList.remove('hidden');
}

/**
 * Esconde um modal específico.
 * @param {string} id O ID do modal.
 */
function hideModal(id) {
  const element = gel(id);
  if (element) element.classList.add('hidden');
}

/* =====================================================
   AUTH UI & LOGIC (AUTENTICAÇÃO)
===================================================== */

/**
 * Inicializa os event listeners para a UI de autenticação.
 */
function initAuthUI() {
  // Lógica para alternar entre login e registro
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const target = this.dataset.tab;
      gel('tab-login').classList.toggle('hidden', target !== 'login');
      gel('tab-register').classList.toggle('hidden', target !== 'register');
      clearAuthError();
    });
  });

  // Botões de autenticação
  el('btn-login-email',     'click',   () => currentAuthManager.loginWithEmail(gel('login-email').value, gel('login-password').value));
  el('login-password',      'keydown', (e) => { if (e.key === 'Enter') currentAuthManager.loginWithEmail(gel('login-email').value, gel('login-password').value); });
  el('btn-login-google',    'click',   currentAuthManager.loginWithGoogle);
  el('btn-register',        'click',   () => currentAuthManager.registerWithEmail(gel('reg-name').value, gel('reg-email').value, gel('reg-password').value));
  el('btn-register-google', 'click',   currentAuthManager.loginWithGoogle);
  el('btn-guest',           'click',   currentAuthManager.loginAsGuest);

  // Monitora erros de autenticação do AuthManager
  currentAuthManager.onAuthError = showAuthError;
  currentAuthManager.onClearAuthError = clearAuthError;
  currentAuthManager.onAuthAvatarUpdate = (photoURL) => {
    const preview = gel('auth-avatar-preview');
    const previewImg = gel('auth-avatar-preview-img');
    if (photoURL && preview && previewImg) {
      previewImg.src = photoURL;
      preview.style.display = 'block';
    } else if (preview) {
      preview.style.display = 'none';
      previewImg.src = '';
    }
  };
}

/**
 * Exibe uma mensagem de erro na tela de autenticação.
 * @param {string} msg A mensagem de erro.
 */
function showAuthError(msg) {
  const errorEl = gel('auth-error');
  if (errorEl) errorEl.textContent = msg;
}

/**
 * Limpa a mensagem de erro na tela de autenticação.
 */
function clearAuthError() {
  const errorEl = gel('auth-error');
  if (errorEl) errorEl.textContent = '';
}

/**
 * Atualiza a UI do cabeçalho com informações do usuário.
 * @param {object|null} user Objeto de usuário do Firebase ou null.
 */
function updateHeaderUI(user) {
  const headerUsername = gel('header-username');
  const headerPhoto = gel('header-photo');
  const headerInitials = gel('header-initials');

  if (user) {
    const name = user.displayName || 'Visitante';
    const photoURL = user.photoURL || null;

    if (headerUsername) headerUsername.textContent = name;

    if (headerPhoto && headerInitials) {
      if (photoURL) {
        headerPhoto.src = photoURL;
        headerPhoto.classList.remove('hidden');
        headerInitials.style.display = 'none';
      } else {
        headerPhoto.classList.add('hidden');
        headerPhoto.src = '';
        headerInitials.style.display = 'flex';
        headerInitials.textContent = name.split(' ').map(w => (w[0] || '').toUpperCase()).join('').slice(0, 2) || '?';
      }
    }
  } else {
    // Usuário deslogado ou anônimo padrão
    if (headerUsername) headerUsername.textContent = 'Visitante';
    if (headerPhoto) { headerPhoto.classList.add('hidden'); headerPhoto.src = ''; }
    if (headerInitials) {
      headerInitials.style.display = 'flex';
      headerInitials.textContent = '?';
    }
  }
}

/* =====================================================
   LOBBY UI & LOGIC
===================================================== */

/**
 * Inicializa os event listeners para a UI do lobby.
 */
function initLobbyUI() {
  // Lidar com o cabeçalho
  el('btn-logout', 'click', () => currentAuthManager.logout());
  el('header-avatar-wrap', 'click', () => { // Clique no avatar no header
      if (currentAuthManager.user && !currentAuthManager.isAnonymous) {
          // Implemente aqui a lógica de "perfil" ou "logout específico"
          if (confirm('Deseja fazer logout?')) {
              currentAuthManager.logout();
          }
      }
  });

  // Botões de navegação no lobby
  el('btn-lobby-history', 'click', openHistoryScreen);
  el('btn-lobby-livegames', 'click', openLiveGamesScreen);

  // Lógica de seleção de modo (AI vs Multiplayer)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      gameMode = this.dataset.mode;
      gel('panel-create-multiplayer').classList.toggle('hidden', gameMode !== 'multiplayer');
      gel('panel-join-multiplayer').classList.toggle('hidden', gameMode !== 'multiplayer');
      gel('panel-ai-game').classList.toggle('hidden', gameMode !== 'ai');
    });
  });

  // Lógica para seleção do número de jogadores humanos na criação de sala multiplayer
  document.querySelectorAll('#num-players-btns .btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#num-players-btns .btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      selectedHumanPlayersCount = parseInt(this.dataset.count);
    });
  });

  // Lógica para seleção do número de IAs (para modo AI)
  document.querySelectorAll('#ai-count-btns .btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('#ai-count-btns .btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      selectedAiCount = parseInt(this.dataset.count);
    });
  });

  // Botões de ação no lobby
  el('btn-create-game', 'click', async () => {
    if (gameMode === 'multiplayer') await createMultiplayerRoom();
    else if (gameMode === 'ai') await startAIGame();
  });
  el('btn-join-game', 'click', joinMultiplayerRoom);
  el('input-room-code', 'keydown', (e) => { // Input para entrar na sala
    if (e.key === 'Enter') joinMultiplayerRoom();
  });
  el('btn-spectate-game', 'click', spectateGame);
  el('input-spectate-code', 'keydown', (e) => { // Input para espectar
    if (e.key === 'Enter') spectateGame();
  });
}

/**
 * Exibe uma mensagem de erro na tela do lobby.
 * @param {string} msg A mensagem de erro.
 */
function showLobbyError(msg) {
  const errorEl = gel('lobby-error');
  if (errorEl) errorEl.textContent = msg;
}

/**
 * Limpa a mensagem de erro na tela do lobby.
 */
function clearLobbyError() {
  const errorEl = gel('lobby-error');
  if (errorEl) errorEl.textContent = '';
}

/* =====================================================
   GAME UI & LOGIC (LÓGICA E EVENTOS DO JOGO)
===================================================== */

/**
 * Inicializa os event listeners para a UI do jogo.
 */
function initGameUI() {
  // Botões do jogo
  el('btn-roll', 'click', onRollDiceClick);
  el('btn-resign', 'click', resign);

  // Botões do Modal de Game Over
  el('btn-gameover-new', 'click', () => { hideModal('modal-gameover'); if (gameMode === 'ai') startAIGame(); else goLobby(); });
  el('btn-gameover-lobby', 'click', () => { hideModal('modal-gameover'); goLobby(); });
  el('btn-gameover-history', 'click', () => { hideModal('modal-gameover'); openHistoryScreen(); });

  // Botões da tela de waiting
  el('btn-cancel-multiplayer', 'click', onCancelMultiplayerGameClick);
  el('btn-copy-code', 'click', copyRoomCode);
}

/**
 * Verifica se é o turno do jogador logado e se não é um espectador.
 * @returns {boolean} True se for o turno do usuário logado, false caso contrário.
 */
function isMyTurn() {
  // Retorna se o jogo está ativo, se não sou espectador, se há activePlayer e se o ID é o meu
  return gameActive && !isSpectator && engine.activePlayer && engine.activePlayer.id === myId;
}

/**
 * Handler para o clique no botão "Rolar Dado".
 */
async function onRollDiceClick() {
  const rollButton = gel('btn-roll');
  if (!rollButton) return;

  if (isSpectator || aiThinking || engine.status !== 'playing') return;
  if (!isMyTurn() || engine.phase !== 'roll') {
    // console.warn('Não é sua vez de rolar o dado ou não é a fase de rolar.');
    return;
  }

  rollButton.disabled = true; // Desabilita o botão para evitar cliques múltiplos

  // Simula um delay para a rolagem visual do dado
  gel('dice-display').textContent = '🎲';
  await new Promise(resolve => setTimeout(resolve, 500));

  engine.rollDice();
  renderGame(); // Atualiza a UI com o dado rolado e as peças jogáveis

  if (engine.status === 'finished') {
    // O jogo terminou com esta jogada (alguém venceu ao rolar o 6 final)
    const result = (engine.winner.id === myId) ? 'win' : 'loss';
    await saveLudoGameResult(result);
    showGameOver('Parabéns!', `${engine.winner.name} venceu a partida!`);
    return;
  }

  // Após rolar o dado, se não houver movimentos válidos, passa o turno automaticamente.
  if (engine.phase === 'move' && engine.getValidMoves().length === 0) {
    engine.logEvent(myColor, `Sem movimentos válidos para ${currentAuthManager.displayName}. Passando a vez.`);
    engine.nextTurn();
    renderGame();
    if (gameMode === 'multiplayer' && roomRef) {
      await roomRef.update({
        state: engine.serialize(),
        log: engine.log // Sincroniza o log também
      });
    }

    // Se o próximo jogador for IA no modo single player, agenda o turno dela
    if (gameMode === 'ai' && engine.activePlayer.isAI) {
      setTimeout(doAITurn, 1500);
    }
  } else if (gameMode === 'multiplayer' && roomRef) {
    // Se há movimentos válidos em multiplayer, apenas sincroniza o estado após rolar.
    // O próximo passo é o jogador escolher a peça.
    await roomRef.update({
      state: engine.serialize(),
      log: engine.log
    });
  }

  rollButton.disabled = false; // Reabilita o botão se ainda for necessário (ex: rolagem extra).
  // renderGame() vai gerenciar o estado disabled do botão de rolar.
}

/**
 * Handler para clique em uma peça para mover.
 * `pawnIndex` é o índice do peão no array `player.pawns` do jogador ativo.
 * @param {number} pawnIndex O índice da peça a ser movida.
 */
async function doMovePawn(pawnIndex) {
  if (!gameActive || isSpectator || aiThinking || engine.status !== 'playing') return;
  if (!isMyTurn() || engine.phase !== 'move') {
    // console.warn('Não é sua vez de mover a peça ou não é a fase de mover.');
    return;
  }

  const movedSuccessfully = engine.doMovePawn(pawnIndex);
  if (movedSuccessfully) {
    renderGame(); // Renderiza o novo estado após o movimento

    if (engine.status === 'finished') {
      const result = (engine.winner && engine.winner.id === myId) ? 'win' : 'loss';
      await saveLudoGameResult(result);
      showGameOver('Partida Encerrada!', `${engine.winner.name} levou todas as peças para casa!`);
      // Não retorna aqui, permite sincronizar e depois o listener do room encerra.
    }

    if (gameMode === 'multiplayer' && roomRef) {
      await roomRef.update({
        state: engine.serialize(),
        status: engine.status, // Importante para sinalizar 'finished' para outros
        winner: engine.winner ? engine.winner.id : null, // ID do vencedor
        log: engine.log
      }).catch(e => console.error('Erro ao sincronizar movimento multiplayer:', e));

      if (engine.status === 'finished' || engine.status === 'resigned') {
        // A lógica do listener do roomRef já deve pegar isso e remover da lista de live games
      }
    } else if (gameMode === 'ai' && engine.status === 'playing') {
      // Se ainda é o turno da IA (por jogada extra), agenda o próximo turno dela
      if (engine.activePlayer.isAI) {
        setTimeout(doAITurn, 1500);
      }
    }
  }
}

/**
 * Salva o resultado de uma partida de Ludo no histórico.
 * @param {string} result 'win', 'loss', 'draw' (raro no Ludo), 'resigned'.
 */
async function saveLudoGameResult(result) {
  if (!currentAuthManager.uid || currentAuthManager.isAnonymous) return null;
  if (!gameActive) return; // Não salva se o jogo não estava ativo

  const playersData = engine.players.map(p => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isAI: p.isAI,
    photoURL: p.photoURL,
    isMe: p.id === currentAuthManager.uid
  }));

  const gameRecord = {
    gameType: 'ludo',
    uid: currentAuthManager.uid, // ID do usuário logado
    isAnonymous: currentAuthManager.isAnonymous,
    mode: gameMode,
    players: playersData,
    myColor: myColor,
    result: result,
    endedAt: Date.now(),
  };

  try {
    const gameId = await historyManager.saveLudoGame(currentAuthManager.uid, gameRecord);
    // console.log(`Partida de Ludo salva com ID: ${gameId}`);
    gameActive = false; // Marca o jogo como inativo após ser salvo
    return gameId;
  } catch (e) {
    console.error('Erro ao salvar partida de Ludo:', e);
    return null;
  }
}

/* =====================================================
   MULTIPLAYER LOGIC (LÓGICA MULTIPLAYER)
===================================================== */

/**
 * Gera um código de sala aleatório.
 * @returns {string} Código de 6 caracteres.
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Cria uma nova sala multiplayer de Ludo.
 */
async function createMultiplayerRoom() {
  const btnCreate = gel('btn-create-game');
  if (btnCreate) { btnCreate.disabled = true; btnCreate.textContent = 'Criando...'; }
  clearLobbyError();

  try {
    roomCode = generateRoomCode();
    roomRef = db.ref('rooms/' + roomCode);

    const currentPlayer = currentAuthManager.user;
    const myName = currentPlayer.displayName || 'Jogador';
    const myPhotoURL = currentAuthManager.photoURL;

    // Define os jogadores iniciais da sala (eu sou o red por padrão ao criar)
    const playerColorsMap = {};
    const LUDO_COLORS_CONST = window.LUDO_CONSTANTS.LUDO_COLORS;

    // O criador da sala sempre ocupa o slot vermelho
    playerColorsMap[LUDO_COLORS_CONST[0]] = {
        id: myId,
        name: myName,
        isAI: false,
        photoURL: myPhotoURL || null
    };
    myColor = LUDO_COLORS_CONST[0]; // Minha cor é vermelho

    // Preenche slots restantes com null para que aguardem outros jogadores
    for (let i = 1; i < selectedHumanPlayersCount; i++) {
        const color = LUDO_COLORS_CONST[i];
        if (color) {
            playerColorsMap[color] = { id: null, name: `Jogador ${i + 1}`, isAI: false, photoURL: null };
        }
    }

    await roomRef.set({
      gameType: 'ludo',
      hostUid: myId, // Quem criou a sala
      playerCount: selectedHumanPlayersCount, // Total de jogadores humanos esperados
      playerColors: playerColorsMap, // O mapa de slots de cores e jogadores
      state: engine.serialize(), // Estado inicial do engine
      createdAt: Date.now(),
      status: 'waiting' // Status inicial
    });

    // Configura um timer para remover a sala se ninguém mais entrar
    setTimeout(async () => {
      if (!roomRef) return; // Sala já foi removida ou o jogo começou.
      const snap = await roomRef.once('value');
      if (snap.val() && snap.val().status === 'waiting') {
        await roomRef.remove();
        goLobby();
        showLobbyError('Sua sala expirou por falta de jogadores.');
      }
    }, 600000); // 10 minutos para expirar

    gel('display-room-code').textContent = roomCode;
    showScreen('waiting');
    updateWaitingRoomPlayers(playerColorsMap);

    // Listener de Firebase para a sala de espera
    roomRef.on('value', snap => {
      const data = snap.val();
      if (!data) { // Sala foi removida durante a espera
        roomRef.off();
        roomRef = null;
        goLobby();
        return;
      }

      if (data.status === 'playing') {
        roomRef.off(); // Desliga o listener da sala de espera, o listener do jogo assume
        startMultiplayerGame(data);
      } else if (data.status === 'waiting') {
        updateWaitingRoomPlayers(data.playerColors);
      }
    });

  } catch (e) {
    showLobbyError('Erro ao criar sala: ' + e.message);
    console.error(e);
  } finally {
    if (btnCreate) { btnCreate.disabled = false; btnCreate.textContent = 'Criar Partida'; }
  }
}

/**
 * Entra em uma sala multiplayer existente.
 */
async function joinMultiplayerRoom() {
  const input = gel('input-room-code');
  const code = input ? input.value.trim().toUpperCase() : '';
  clearLobbyError();
  if (code.length !== 6) { showLobbyError('Código deve ter 6 caracteres.'); return; }

  const btnJoin = gel('btn-join-game');
  if (btnJoin) { btnJoin.disabled = true; btnJoin.textContent = 'Entrando...'; }

  try {
    roomRef = db.ref('rooms/' + code);
    const snap = await roomRef.once('value');
    const data = snap.val();

    if (!data) { showLobbyError('Sala não encontrada.'); roomRef = null; return; }
    if (data.gameType !== 'ludo') { showLobbyError('Esta sala é para outro jogo.'); roomRef = null; return; }
    if (data.status === 'finished' || data.status === 'resigned' || data.status === 'abandoned') {
      showLobbyError('Partida já encerrada.'); roomRef = null; return;
    }

    const currentPlayer = currentAuthManager.user;
    const myName = currentPlayer.displayName || 'Jogador';
    const myPhotoURL = currentAuthManager.photoURL;

    let foundSlot = false;
    const LUDO_COLORS_CONST = window.LUDO_CONSTANTS.LUDO_COLORS;

    // Tentar encontrar um slot vazio ou o meu próprio slot
    for (const color of LUDO_COLORS_CONST) {
        if (data.playerColors[color] && data.playerColors[color].id === null) {
            // Slot vazio, ocupá-lo
            myColor = color;
            await roomRef.child('playerColors').child(color).set({
                id: myId,
                name: myName,
                isAI: false,
                photoURL: myPhotoURL || null
            });
            foundSlot = true;
            break;
        } else if (data.playerColors[color] && data.playerColors[color].id === myId) {
            // Já estou nesta sala, apenas reconectar
            myColor = color;
            foundSlot = true;
            break;
        }
    }

    if (!foundSlot) {
        showLobbyError('Sala cheia. Não há slots disponíveis para você.');
        roomRef = null;
        return;
    }

    // Se todos os slots humanos esperados estiverem preenchidos, a sala começa
    const currentHumanPlayers = Object.values(data.playerColors).filter(p => p && !p.isAI && p.id !== null).length;
    if (currentHumanPlayers === data.playerCount && data.status === 'waiting') {
        await roomRef.update({ status: 'playing' });
        // O listener abaixo detectará a mudança e chamará startMultiplayerGame
    }

    gel('display-room-code').textContent = code;
    showScreen('waiting');
    updateWaitingRoomPlayers(data.playerColors);

    // Listener de Firebase para a sala (tanto para espera quanto para início do jogo)
    roomRef.on('value', snap => {
      const roomData = snap.val();
      if (!roomData) {
        roomRef.off();
        roomRef = null;
        goLobby();
        return;
      }

      if (roomData.status === 'playing') {
        roomRef.off(); // Desliga o listener da espera, o listener do jogo assume
        startMultiplayerGame(roomData);
      } else if (roomData.status === 'waiting') {
        updateWaitingRoomPlayers(roomData.playerColors);
      }
    });

  } catch (e) {
    showLobbyError('Erro ao entrar na sala: ' + e.message);
    console.error(e);
    if (roomRef) { roomRef.off(); roomRef = null; }
  } finally {
    if (btnJoin) { btnJoin.disabled = false; btnJoin.textContent = 'Entrar'; }
  }
}

/**
 * Responde ao clique no botão "Cancelar" na sala de espera multiplayer.
 */
async function onCancelMultiplayerGameClick() {
  if (!roomRef || !roomCode) { goLobby(); return; }

  const roomSnap = await roomRef.once('value');
  const roomData = roomSnap.val();

  if (!roomData) { goLobby(); return; }

  if (roomData.hostUid === myId) {
    // Se sou o host, pergunto se quer remover a sala
    if (!confirm('Tem certeza que deseja cancelar esta sala? Todos os jogadores serão desconectados.')) return;
    try {
      await roomRef.remove(); // Remove a sala inteira
      await historyManager.removeLudoLiveGame(roomCode); // Remove da lista de jogos ao vivo
      roomRef.off();
      roomRef = null;
      goLobby();
    } catch (e) {
      console.error('Erro ao cancelar sala como host:', e);
      alert('Erro ao cancelar sala: ' + e.message);
    }
  } else {
    // Se não sou o host, apenas saio do meu slot
    if (!confirm('Tem certeza que deseja sair desta sala?')) return;
    try {
      if (myColor && roomRef) {
        await roomRef.child('playerColors').child(myColor).set({
            id: null,
            name: `Jogador ${window.LUDO_CONSTANTS.LUDO_COLORS.indexOf(myColor) + 1}`,
            isAI: false,
            photoURL: null
        });
      }
      roomRef.off();
      roomRef = null;
      goLobby();
    } catch (e) {
      console.error('Erro ao sair da sala multiplayer:', e);
      alert('Erro ao sair da sala: ' + e.message);
    }
  }
}

/**
 * Copia o código da sala para a área de transferência.
 */
function copyRoomCode() {
  navigator.clipboard.writeText(roomCode).then(() => {
    const fb = gel('copy-feedback');
    if (fb) { fb.textContent = 'Copiado!'; setTimeout(() => { fb.textContent = ''; }, 2000); }
  }).catch(err => {
    console.error('Erro ao copiar:', err);
    alert('Erro ao copiar o código da sala.');
  });
}

/**
 * Atualiza a lista de jogadores na UI da sala de espera.
 * @param {object} playerColorsMap Mapeamento de cor para dados do jogador.
 */
function updateWaitingRoomPlayers(playerColorsMap) {
    const listEl = gel('waiting-players-list');
    const currentPlayersEl = gel('waiting-current-players');
    const maxPlayersEl = gel('waiting-max-players');
    if (!listEl || !currentPlayersEl || !maxPlayersEl) return;

    listEl.innerHTML = '';
    let currentHumanCount = 0;
    const LUDO_COLORS_CONST = window.LUDO_CONSTANTS.LUDO_COLORS;
    const COLOR_TRANSLATIONS_CONST = window.LUDO_CONSTANTS.COLOR_TRANSLATIONS;

    LUDO_COLORS_CONST.forEach(color => {
      const player = playerColorsMap[color];
      const row = document.createElement('div');
      row.className = 'waiting-player-row';

      let nameDisplay = '';
      if (player && player.id) {
          nameDisplay = escapeHtml(player.name);
          if (player.id === myId) nameDisplay += ' (Você)';
          if (player.isAI) nameDisplay += ' (IA)';
          if (!player.isAI) currentHumanCount++; // Conta apenas humanos
      } else {
          nameDisplay = `Aguardando ${COLOR_TRANSLATIONS_CONST[color]}...`;
      }

      row.innerHTML = `
          <div class="player-color-dot" style="background-color: var(--ludo-${color});"></div>
          <span>${nameDisplay}</span>
      `;
      listEl.appendChild(row);
    });

    currentPlayersEl.textContent = currentHumanCount;
    // O total de players da sala é definido pelo 'playerCount' no Firebase room, não pelo 'selectedHumanPlayersCount' local
    // Mas para fins de UI de "criando sala", podemos usar o local.
    maxPlayersEl.textContent = selectedHumanPlayersCount;
}

/**
 * Inicia uma partida multiplayer de Ludo com base nos dados da sala do Firebase.
 * @param {object} roomData Os dados da sala obtidos do Firebase.
 */
async function startMultiplayerGame(roomData) {
  gameMode = 'multiplayer';
  gameActive = true;
  isSpectator = false;

  // Define `myColor` se ainda não estiver definido (caso tenha entrado via JOIN).
  // Se for o criador, `myColor` já está definido.
  if (!myColor) {
      const LUDO_COLORS_CONST = window.LUDO_CONSTANTS.LUDO_COLORS;
      for (const color of LUDO_COLORS_CONST) {
          if (roomData.playerColors[color] && roomData.playerColors[color].id === myId) {
              myColor = color;
              break;
          }
      }
      if (!myColor) {
          console.error("Erro: Não consegui determinar a cor do meu jogador na sala multiplayer!");
          showLobbyError("Erro ao iniciar jogo multiplayer: cor não definida.");
          goLobby();
          return;
      }
  }

  // Preenche o array de players do engine com os dados da sala
  const enginePlayers = [];
  const LUDO_COLORS_CONST = window.LUDO_CONSTANTS.LUDO_COLORS;
  for (const color of LUDO_COLORS_CONST) {
      if (roomData.playerColors[color] && roomData.playerColors[color].id) { // Apenas slots preenchidos
          enginePlayers.push({
              id: roomData.playerColors[color].id,
              name: roomData.playerColors[color].name,
              color: color,
              isAI: roomData.playerColors[color].isAI || false,
              photoURL: roomData.playerColors[color].photoURL || null
          });
      }
  }

  engine.reset();
  engine.setupGame(enginePlayers); // Configura o engine com os jogadores da sala
  engine.deserialize(roomData.state); // Carrega o estado atual do jogo

  // Esconder/mostrar botões de controle
  gel('btn-resign').classList.remove('hidden');
  gel('btn-new-game').classList.add('hidden'); // 'New Game' é para AI, no multiplayer é 'Back to Lobby'
  gel('btn-back-lobby').classList.add('hidden');
  gel('spectator-bar').classList.add('hidden'); // Esconde barra de espectador

  showScreen('game');
  renderGame(); // Renderiza o estado inicial do jogo

  // Inicia o listener para atualizações de estado do jogo via Firebase.
  roomRef.on('value', async snap => {
    const data = snap.val();
    if (!data) { // Sala foi removida durante o jogo
      roomRef.off();
      roomRef = null;
      gameActive = false;
      showGameOver('Partida Encerrada', 'A sala foi removida ou o host desconectou.');
      return;
    }

    // Atualiza o estado do engine localmente, se diferente do Firebase
    if (JSON.stringify(engine.serialize()) !== JSON.stringify(data.state)) {
      engine.deserialize(data.state);
      renderGame();
    }

    // Lida com status de fim de jogo
    if (data.status === 'finished' || data.status === 'resigned') {
      roomRef.off(); // Desliga o listener do Firebase
      roomRef = null;
      gameActive = false;

      let title = 'Fim de Partida!';
      let msg = 'O jogo terminou.';
      let resultToSave = 'draw';

      if (data.winner) {
        const winnerPlayer = engine.players.find(p => p.id === data.winner);
        if (winnerPlayer) {
          title = (winnerPlayer.id === myId) ? 'Você Venceu! 🏆' : `Vitória para ${winnerPlayer.name}!`;
          msg = (winnerPlayer.id === myId) ? 'Parabéns!' : 'Boa sorte na próxima!';
          resultToSave = (winnerPlayer.id === myId) ? 'win' : 'loss';
        }
      } else if (data.status === 'resigned') {
          // Lógica de renúncia já lida no `resign()`
          // Este listener só captura o estado final.
          title = 'Partida Finalizada';
          msg = 'Um jogador desconectou ou desistiu.';
          // O resultado já foi salvo pelo jogador que desistiu ou pelo outro.
      }

      await saveLudoGameResult(resultToSave);
      showGameOver(title, msg);
    }
  });

  // Se o jogo recém começou e o primeiro a jogar é uma IA, agenda o turno dela
  if (engine.status === 'playing' && engine.activePlayer.isAI) {
    if (engine.activePlayer.color !== myColor) { // Só agenda se não for a minha "IA" (no caso, não existe)
        setTimeout(doAITurn, 1500);
    }
  }

  // Se sou o host da sala, também salvo o jogo na lista de jogos ao vivo
  if (roomData.hostUid === myId) {
    historyManager.addLudoLiveGame(roomData.roomCode, {
      id: roomData.roomCode,
      createdAt: roomData.createdAt,
      players: enginePlayers
    });
  }
}

/* =====================================================
   VS AI LOGIC (LÓGICA CONTRA IA)
===================================================== */

/**
 * Inicia uma partida de Ludo contra a IA.
 */
async function startAIGame() {
  gameMode = 'ai';
  gameActive = true;
  isSpectator = false;

  const LUDO_COLORS_CONST = window.LUDO_CONSTANTS.LUDO_COLORS;
  myColor = LUDO_COLORS_CONST[0]; // Jogador humano é sempre 'red' no modo AI

  engine.reset(); // Reseta o motor do jogo

  const playerConfigs = [];
  // Adiciona o jogador humano (eu)
  playerConfigs.push({
    id: myId,
    name: currentAuthManager.displayName || 'Jogador',
    isAI: false,
    color: myColor,
    photoURL: currentAuthManager.photoURL || null
  });

  // Adiciona as IAs (máximo 3)
  for (let i = 0; i < selectedAiCount; i++) {
    const aiColor = LUDO_COLORS_CONST[i + 1]; // Cores para as IAs
    playerConfigs.push({
      id: `ai_${aiColor}_${Date.now()}_${i}`, // ID único para IA
      name: `Computador ${i + 1}`,
      isAI: true,
      color: aiColor,
      photoURL: null
    });
  }

  engine.setupGame(playerConfigs); // Configura o jogo com os jogadores (Humano + AI)

  // Atualiza visibilidade dos botões de controle
  gel('btn-resign').classList.remove('hidden');
  gel('btn-new-game').classList.add('hidden'); // No modo AI, o botão "Novo Jogo" está no modal de game over
  gel('btn-back-lobby').classList.add('hidden');
  gel('spectator-bar').classList.add('hidden');

  showScreen('game');
  renderGame();

  // Se o primeiro turno for da IA, agenda o movimento dela
  if (engine.status === 'playing' && engine.activePlayer.isAI) {
    await new Promise(resolve => setTimeout(resolve, 800)); // Pequeno atraso antes da IA rolar
    doAITurn();
  }
}

/**
 * Executa o turno de uma IA.
 */
async function doAITurn() {
  if (!gameActive || !engine.activePlayer.isAI || engine.status !== 'playing') {
      aiThinking = false;
      renderStatusBar(); // Atualizar para remover "pensando..."
      return;
  }

  aiThinking = true;
  renderStatusBar(); // Mostra "Computador pensando..."

  const rollButton = gel('btn-roll');
  if (rollButton) rollButton.disabled = true; // Desabilita o botão para o usuário

  // 1. A IA rola o dado
  gel('dice-display').textContent = '🎲'; // Animação de dado "rolando..."
  await new Promise(resolve => setTimeout(resolve, 800)); // Delay para simular rolagem

  engine.rollDice();
  renderGame(); // Atualiza a UI com o dado que a IA rolou

  if (engine.status === 'finished') {
    // Alguém (a IA) venceu com esta rolagem
    const result = (engine.winner && engine.winner.id === myId) ? 'win' : 'loss';
    await saveLudoGameResult(result);
    showGameOver('Partida Encerrada!', `${engine.winner.name} venceu!`);
    return;
  }

  // Se a IA rolou e não tem movimentos válidos, ela passa o turno
  if (engine.phase === 'move' && engine.getValidMoves().length === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Pequeno delay
      engine.nextTurn();
      aiThinking = false;
      renderGame();
      // Agenda o próximo turno se for outra IA ou já espera pelo turno do humano.
      if (engine.activePlayer.isAI) setTimeout(doAITurn, 1500);
      return;
  }

  // 2. A IA decide e move uma peça
  if (engine.phase === 'move') {
      // Simula um tempo de "pensamento" da IA
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500)); // 1 a 1.5 segundos

      // Obtém o melhor movimento da IA
      const pawnIndexToMove = ai.getBestMove(engine);

      if (pawnIndexToMove !== null) {
          const moved = engine.doMovePawn(pawnIndexToMove);
          // console.log(`IA ${engine.activePlayer.name} moveu a peça ${pawnIndexToMove}. Sucesso: ${moved}`);
          aiThinking = false; // A IA terminou o pensamento e movimento
          renderGame();

          if (engine.status === 'finished') {
            const result = (engine.winner && engine.winner.id === myId) ? 'win' : 'loss';
            await saveLudoGameResult(result);
            showGameOver('Partida Encerrada!', `${engine.winner.name} venceu!`);
            return;
          }

          // Se o turno continua (por exemplo, a IA tirou 6 ou capturou), chama doAITurn novamente
          if (engine.activePlayer.isAI && engine.status === 'playing' && engine.extraTurn) {
              setTimeout(doAITurn, 1500); // A IA rola de novo
          }
      } else {
        // Isso não deve acontecer se getValidMoves() foi verificado corretamente
        console.warn('IA não encontrou movimento válido e não havia opção de passar turno. Passando turno forçadamente.');
        engine.nextTurn();
        aiThinking = false;
        renderGame();
        if (engine.activePlayer.isAI) setTimeout(doAITurn, 1500);
      }
  }
}


/* =====================================================
   ESPECTADOR LOGIC (LÓGICA DE ESPECTADOR)
===================================================== */

/**
 * Conecta-se a uma partida como espectador.
 */
async function spectateGame() {
  const input = gel('input-spectate-code');
  const code = input ? input.value.trim().toUpperCase() : '';
  clearLobbyError();
  if (code.length !== 6) { showLobbyError('Código deve ter 6 caracteres.'); return; }

  try {
    specRef = db.ref('rooms/' + code);
    const snap = await specRef.once('value');
    const data = snap.val();

    if (!data) { showLobbyError('Sala não encontrada.'); specRef = null; return; }
    if (data.gameType !== 'ludo') { showLobbyError('Esta sala é para outro jogo.'); specRef = null; return; }
    if (data.status === 'waiting') { showLobbyError('Partida ainda não começou.'); specRef = null; return; }
    if (data.status === 'finished' || data.status === 'resigned') { // 'abandoned' também finaliza
      showLobbyError('Partida já encerrou.'); specRef = null; return;
    }

    isSpectator = true; roomCode = code; myColor = null; // Espectador não tem uma cor específica
    engine.deserialize(data.state); // Carrega o estado atual para exibir

    // Preenche o array de players do engine para exibição no sidebar
    const enginePlayers = [];
    const LUDO_COLORS_CONST = window.LUDO_CONSTANTS.LUDO_COLORS;
    for (const color of LUDO_COLORS_CONST) {
        if (data.playerColors[color] && data.playerColors[color].id) {
            enginePlayers.push({
                id: data.playerColors[color].id,
                name: data.playerColors[color].name,
                color: color,
                isAI: data.playerColors[color].isAI || false,
                photoURL: data.playerColors[color].photoURL || null
            });
        }
    }
    engine.players = enginePlayers;

    showScreen('game');
    renderGame(); // Renderiza o board e sidebar como espectador

    // Esconde botões de ação para o espectador
    gel('btn-roll').classList.add('hidden');
    gel('btn-resign').classList.add('hidden');
    gel('btn-new-game').classList.add('hidden');
    gel('btn-back-lobby').classList.remove('hidden'); // Botão para voltar ao lobby
    gel('spectator-bar').classList.remove('hidden'); // Mostra a barra de "Assistindo"

    // Listener para atualizações do jogo para espectadores
    specRef.on('value', snap => {
      const liveData = snap.val();
      if (!liveData) { // Sala removida
        specRef.off();
        specRef = null;
        goLobby();
        return;
      }

      engine.deserialize(liveData.state);
      // Atualiza os jogadores do engine caso entre/saia alguém (improvável no meio do jogo mas por garantia)
      const updatedEnginePlayers = [];
      for (const color of LUDO_COLORS_CONST) {
          if (liveData.playerColors[color] && liveData.playerColors[color].id) {
              updatedEnginePlayers.push({
                  id: liveData.playerColors[color].id,
                  name: liveData.playerColors[color].name,
                  color: color,
                  isAI: liveData.playerColors[color].isAI || false,
                  photoURL: liveData.playerColors[color].photoURL || null
              });
          }
      }
      engine.players = updatedEnginePlayers;
      renderGame();

      // Atualiza a barra de status do espectador
      if (liveData.status === 'finished' || liveData.status === 'resigned') {
        const winnerName = (liveData.winner && liveData.playerColors[liveData.winner]) ? liveData.playerColors[liveData.winner].name : 'Partida';
        gel('spectator-bar').textContent = `👁 ${winnerName} Encerrada.`;
        specRef.off(); // Não precisa mais de updates
      } else {
        const activePlayerInfo = engine.activePlayer;
        const playerNameDisp = activePlayerInfo ? activePlayerInfo.name : 'Jogador Desconhecido';
        const playerColorDisp = activePlayerInfo ? window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[activePlayerInfo.color] : '';
        gel('spectator-bar').textContent = `👁 Assistindo — Vez de ${playerNameDisp} (${playerColorDisp})`;
      }
    });

  } catch (e) {
    showLobbyError('Erro ao conectar como espectador: ' + e.message);
    console.error(e);
    if (specRef) { specRef.off(); specRef = null; }
  }
}

/* =====================================================
   GAME OVER & RESIGN LOGIC
===================================================== */

/**
 * Desiste da partida atual.
 */
async function resign() {
  if (!gameActive || isSpectator || !isMyTurn()) return;
  if (!confirm('Tem certeza que deseja desistir da partida?')) return;

  gameActive = false;
  aiThinking = false;

  let winningPlayerInfo = null; // Informações do jogador que "venceu" pela desistência

  if (gameMode === 'multiplayer' && roomRef) {
    // Para multiplayer, o "vencedor" é o outro jogador humano na sala.
    const otherHumanPlayers = engine.players.filter(p => p.id !== myId && !p.isAI);
    if (otherHumanPlayers.length > 0) {
        winningPlayerInfo = otherHumanPlayers[0];
    } else { // Se só havia IAs ou eu mesmo
        // Este cenário é complicado. Por simplicidade, se for multiplayer e eu desisto,
        // apenas informamos que desisti e o jogo se encerra para mim.
        // Outros jogadores humanos (se houver) serão notificados. Se só havia IAs, o jogo se encerra.
        winningPlayerInfo = { id: 'other', name: 'Alguém', color: 'neutral' };
    }

    // Atualiza o Firebase para sinalizar a desistência
    await roomRef.update({
      status: 'resigned',
      winner: winningPlayerInfo.color, // Cor do "vencedor" ou 'neutral'
      state: engine.serialize() // Salva o estado final
    }).catch(e => console.error('Erro ao registrar desistência no multiplayer:', e));

    roomRef.off(); // Desliga o listener
    roomRef = null;
    historyManager.removeLudoLiveGame(roomCode); // Remove da lista de ao vivo
  } else if (gameMode === 'ai') {
    // No modo AI, se o humano desiste, as IAs "vencem"
    const aiPlayers = engine.players.filter(p => p.isAI);
    winningPlayerInfo = aiPlayers.length > 0 ? aiPlayers[0] : null;
  }

  // Salva o jogo como "loss" por resignação no histórico pessoal
  await saveLudoGameResult('loss');

  const gameOverTitle = 'Você Desistiu! 🏳️';
  const gameOverMsg = winningPlayerInfo ?
    `Vitória para ${winningPlayerInfo.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[winningPlayerInfo.color]})!` :
    'A partida foi encerrada.';

  showGameOver(gameOverTitle, gameOverMsg);
  // Não precisa ir pro lobby aqui, o modal já direciona.
}

/**
 * Exibe o modal de fim de jogo.
 * @param {string} title O título do modal.
 * @param {string} msg A mensagem detalhada.
 */
function showGameOver(title, msg) {
  const titleEl = gel('gameover-title');
  const msgEl = gel('gameover-msg');
  const iconEl = gel('gameover-icon');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = msg;
  if (iconEl) {
    iconEl.textContent = title.includes('Venceu') ? '🏆'
      : title.includes('Desistiu') ? '🏳️' : '🏁'; // Ícone padrão para outros fins de jogo
  }

  showModal('modal-gameover');
}

/* =====================================================
   RENDERIZAÇÃO DA UI DO JOGO LUDO
===================================================== */

/**
 * Constrói a estrutura DOM do tabuleiro Ludo.
 * Chamado uma vez ao iniciar o aplicativo (DOMContentLoaded).
 */
function buildBoardDOM() {
  const boardEl = gel('ludo-board');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  BOARD_CELLS_DOM = []; // Zera para recriar

  const LUDO_CONST = window.LUDO_CONSTANTS;

  for (let r = 0; r < LUDO_CONST.BOARD_SIZE; r++) {
    BOARD_CELLS_DOM[r] = [];
    for (let c = 0; c < LUDO_CONST.BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'ludo-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      // Adiciona classes de zona (red, blue, green, yellow, center, neutral)
      const zone = getCellZoneFromCoords(r, c);
      if (zone) cell.classList.add('zone-' + zone);

      // Adiciona casas seguras (estrelas)
      const pathIdx = LUDO_CONST.PATH_COORDS.findIndex(coord => coord[0] === r && coord[1] === c);
      if (pathIdx !== -1 && LUDO_CONST.SAFE_SQUARES.includes(pathIdx)) {
        cell.classList.add('safe');
      }

      boardEl.appendChild(cell);
      BOARD_CELLS_DOM[r][c] = cell;
    }
  }
}

/**
 * Identifica a "zona" (cor ou neutra) de uma célula específica do tabuleiro 15x15.
 * @param {number} r Linha da célula.
 * @param {number} c Coluna da célula.
 * @returns {string} A zona (red, blue, green, yellow, center, neutral)
 */
function getCellZoneFromCoords(r, c) {
  const LUDO_CONST = window.LUDO_CONSTANTS;

  // Lógica das Bases (6x6) - top-left (red), top-right (blue), bottom-right (green), bottom-left (yellow)
  if (r >=0 && r <=5 && c >=0 && c <=5) return 'red-home'; // Base Vermelha
  if (r >=0 && r <=5 && c >=9 && c <=14) return 'blue-home'; // Base Azul
  if (r >=9 && r <=14 && c >=9 && c <=14) return 'green-home'; // Base Verde
  if (r >=9 && r <=14 && c >=0 && c <=5) return 'yellow-home'; // Base Amarela

  // Corredores finais (Home Paths) - verificado por HomePaths constantes no ludo_constants.js
  for (const color of LUDO_CONST.LUDO_COLORS) {
      if (LUDO_CONST.HOME_PATHS[color].some(coord => coord[0] === r && coord[1] === c)) {
          return color + '-final'; // Ex: 'red-final'
      }
  }

  // Centro (3x3)
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return 'center-zone';

  // Casas de entrada para o caminho principal (Saídas da base)
  for (const color of LUDO_CONST.LUDO_COLORS) {
      if (LUDO_CONST.ENTRY_POS[color][0] === r && LUDO_CONST.ENTRY_POS[color][1] === c) {
          return color + '-entry'; // Ex: 'red-entry'
      }
  }

  // Retorna a cor da trilha para as casas de "start" dos outros jogadores
  for (const color of LUDO_CONST.LUDO_COLORS) {
      const idx = LUDO_CONST.LUDO_COLORS.indexOf(color);
      // Pega a casa de saída do próximo jogador
      const startPointCoords = LUDO_CONST.PATH_COORDS[LUDO_CONST.COLOR_TO_PATH_INDEX[color]];
      if (startPointCoords[0] === r && startPointCoords[1] === c) {
          return color + '-start-point';
      }
  }


  return 'neutral-path'; // Casas do caminho principal que não são de base ou final
}


/**
 * Renderiza todo o estado atual do jogo na UI.
 */
function renderGame() {
  renderBoard();
  renderPlayersList();
  renderStatusBar();
  renderDice();
  renderLog();
}

/**
 * Renderiza os peões no tabuleiro.
 */
function renderBoard() {
  const LUDO_CONST = window.LUDO_CONSTANTS;
  const PIECES_SYMBOLS_CONST = LUDO_CONST.PIECES_SYMBOLS;

  // Limpa todos os peões e estados visualmente
  document.querySelectorAll('.pawn').forEach(p => p.remove());
  document.querySelectorAll('.ludo-cell.movable-hint').forEach(cell => cell.classList.remove('movable-hint'));


  engine.players.forEach((player) => {
    player.pawns.forEach((pawn, pawnIdx) => {
      let coords = null; // Coordenadas (row, col) no tabuleiro 15x15

      if (pawn.finished) {
          return; // Peões finalizados não são renderizados no tabuleiro
      } else if (pawn.pos === -1) {
          // Peão na base
          coords = LUDO_CONST.BASE_POSITIONS[player.color]?.[pawnIdx];
      } else if (pawn.homeStep !== -1) {
          // Peão no corredor final (home path)
          coords = LUDO_CONST.HOME_PATHS[player.color]?.[pawn.homeStep];
      } else {
          // Peão no caminho principal
          coords = LUDO_CONST.PATH_COORDS[pawn.pos];
      }

      // Garante que as coordenadas são válidas antes de tentar renderizar
      if (!coords || !BOARD_CELLS_DOM[coords[0]] || !BOARD_CELLS_DOM[coords[0]][coords[1]]) {
        // console.warn(`Coordenadas inválidas para peão ${player.color}-${pawnIdx} na posição ${pawn.pos}/${pawn.homeStep}.`);
        return;
      }

      const cellElement = BOARD_CELLS_DOM[coords[0]][coords[1]];
      if (!cellElement) {
        // console.warn(`Elemento da célula DOM não encontrado para ${coords[0]},${coords[1]}`);
        return;
      }

      // Cria ou atualiza o elemento do peão
      const pawnEl = document.createElement('div');
      pawnEl.className = `pawn ${player.color}`;
      pawnEl.dataset.playerColor = player.color;
      pawnEl.dataset.pawnIdx = pawnIdx;
      pawnEl.textContent = PIECES_SYMBOLS_CONST[player.color];

      // Adiciona event listener e classe "movable" se for a vez do jogador e a peça puder ser movida
      if (!isSpectator && isMyTurn() && engine.phase === 'move') {
        const validMoves = engine.getValidMoves();
        if (validMoves.includes(pawnIdx)) {
          pawnEl.classList.add('movable');
          pawnEl.addEventListener('click', () => doMovePawn(pawnIdx));
        }
      }
      cellElement.appendChild(pawnEl);
    });
  });
}

/**
 * Renderiza a lista de jogadores na sidebar do jogo.
 */
function renderPlayersList() {
  const listEl = gel('players-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const LUDO_CONST = window.LUDO_CONSTANTS;

  engine.players.forEach(player => {
    const card = document.createElement('div');
    card.className = `player-card player-${player.color}`; // Ex: 'player-card player-red'

    // Adiciona classe 'active-turn' se for o jogador atual
    if (engine.activePlayer && engine.activePlayer.id === player.id) {
      card.classList.add('active-turn');
    }

    let playerNameDisplay = escapeHtml(player.name);
    // Adiciona "Você" ou "IA" ao nome para clara identificação
    if (player.id === myId) playerNameDisplay += ' (Você)';
    else if (player.isAI) playerNameDisplay += ' (IA)';

    const playerPhotoURL = player.photoURL || null;
    let avatarContent = '';

    if (playerPhotoURL) {
      avatarContent = `<img src="${playerPhotoURL}" alt="${player.name}" class="player-photo">`;
    } else {
      // Usa iniciais ou símbolo padrão com a cor do jogador
      const initials = (player.name || '?')[0].toUpperCase();
      avatarContent = `<span class="player-initials" style="background-color: var(--ludo-${player.color}-dark);">${initials}</span>`;
    }

    card.innerHTML = `
      <div class="player-avatar">
        ${avatarContent}
      </div>
      <div class="player-info">
        <span class="player-name">${playerNameDisplay}</span>
        <span class="player-score">Peças na casa: ${player.score} / ${LUDO_CONST.PIECES_PER_PLAYER}</span>
        <div class="ludo-pawn-track" data-color="${player.color}">
          <!-- Mini-ilustração das peças (na base, no caminho, no homepath) -->
        </div>
      </div>
    `;

    // Renderiza a "trilha" visual de mini-peões na base ou no caminho
    const pawnTrack = card.querySelector('.ludo-pawn-track');
    if (pawnTrack) {
      for (let i = 0; i < LUDO_CONST.PIECES_PER_PLAYER; i++) {
        const pawnStatusDot = document.createElement('span');
        pawnStatusDot.className = 'pawn-status-dot';
        const pawn = player.pawns[i];

        if (pawn.finished) {
          pawnStatusDot.classList.add('finished');
        } else if (pawn.pos === -1) {
          pawnStatusDot.classList.add('in-base');
          if (engine.phase === 'roll' && engine.diceValue === 6 && engine.activePlayer.id === player.id) {
              pawnStatusDot.classList.add('can-move-from-start'); // Se pode sair da base
          }
        } else if (pawn.homeStep !== -1) {
          pawnStatusDot.classList.add('in-home-path');
        } else {
          pawnStatusDot.classList.add('on-main-path');
        }
        pawnTrack.appendChild(pawnStatusDot);
      }
    }

    // Adiciona ao DOM
    listEl.appendChild(card);
  });
}

/**
 * Atualiza a barra de status com mensagens do jogo.
 */
function renderStatusBar() {
  const bar = gel('status-bar');
  const btnRoll = gel('btn-roll');
  if (!bar || !btnRoll) return;

  bar.className = 'status-bar'; // Reseta classes
  btnRoll.classList.remove('hidden');
  btnRoll.disabled = false; // Por padrão, btn de rolar habilitado (será desabilitado por outras condições)

  const activePlayer = engine.activePlayer;
  const isMyTurnNow = isMyTurn();
  const COLOR_TRANSLATIONS_CONST = window.LUDO_CONSTANTS.COLOR_TRANSLATIONS;

  if (!activePlayer) { // Jogo não configurado ou terminou sem activePlayer claro
    bar.textContent = 'Aguardando início do jogo...';
    btnRoll.classList.add('hidden');
    return;
  }

  // --- Estados de Espectador, AI Pensando, ou Jogo Finalizado ---
  if (isSpectator) {
    bar.innerHTML = `👁 Assistindo — Vez de ${escapeHtml(activePlayer.name)} (${COLOR_TRANSLATIONS_CONST[activePlayer.color]})`;
    btnRoll.classList.add('hidden'); // Esconde o botão de rolar para espectadores
    return;
  }
  if (aiThinking) {
    bar.innerHTML = `Computador (${escapeHtml(activePlayer.name)}) pensando <span class="thinking-dots"><span></span><span></span><span></span></span>`;
    btnRoll.disabled = true; // Desabilita roll enquanto IA pensa
    return;
  }
  if (engine.status === 'finished') {
    bar.textContent = `Partida encerrada! Vencedor: ${escapeHtml(activePlayer.name)} (${COLOR_TRANSLATIONS_CONST[activePlayer.color]}) 🏆`;
    bar.classList.remove('your-turn');
    btnRoll.classList.add('hidden'); // Esconde o botão de rolar ao final do jogo
    return;
  }

  // --- Lógica para o Jogador Ativo (Humano) ---
  if (isMyTurnNow) {
    bar.classList.add('your-turn');
    if (engine.phase === 'roll') {
      bar.textContent = `Sua vez (${COLOR_TRANSLATIONS_CONST[myColor]}) — Role o dado!`;
    } else { // engine.phase === 'move'
      btnRoll.disabled = true; // Desabilita roll após rolar
      const validMovesAvailable = engine.getValidMoves().length > 0;
      if (validMovesAvailable) {
        bar.textContent = `Sua vez (${COLOR_TRANSLATIONS_CONST[myColor]}) — Mova uma peça para ${engine.diceValue} casas.`;
      } else {
        bar.textContent = `Sua vez (${COLOR_TRANSLATIONS_CONST[myColor]}) — Sem movimentos válidos para dado ${engine.diceValue}.`;
        // O `onRollDiceClick` já lida com a passagem de turno automática se não houver moves
      }
    }
  } else {
    // Vez de outro jogador (humano ou IA)
    bar.textContent = `Vez de ${escapeHtml(activePlayer.name)} (${COLOR_TRANSLATIONS_CONST[activePlayer.color]})`;
    bar.classList.remove('your-turn');
    btnRoll.disabled = true; // Desabilita o botão se não for minha vez
  }
}

/**
 * Renderiza o valor do dado.
 */
function renderDice() {
  const diceDisplay = gel('dice-display');
  if (diceDisplay) {
    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    diceDisplay.textContent = engine.diceValue > 0 ? faces[engine.diceValue] : '🎲';
  }
}

/**
 * Renderiza o histórico de eventos (log) do jogo.
 */
function renderLog() {
  const logEntriesEl = gel('log-entries');
  if (!logEntriesEl) return;
  logEntriesEl.innerHTML = ''; // Limpa antes de renderizar

  const COLOR_TRANSLATIONS_CONST = window.LUDO_CONSTANTS.COLOR_TRANSLATIONS;

  engine.log.forEach(entry => {
    const logEntryEl = document.createElement('div');
    logEntryEl.classList.add('log-entry');
    // Adiciona classe de cor para estilização se a entrada de log tiver uma cor associada
    if (entry.color && COLOR_TRANSLATIONS_CONST[entry.color]) {
        // Usa `player-${color}` class para se alinhar com o css global de player-card
        logEntryEl.classList.add(`player-${entry.color}`);
    } else {
        logEntryEl.classList.add('player-neutral'); // Para mensagens neutras
    }
    logEntryEl.textContent = entry.message;
    logEntriesEl.appendChild(logEntryEl);
  });
  logEntriesEl.scrollTop = logEntriesEl.scrollHeight; // Scroll para o final
}

/* =====================================================
   REPLAY LOGIC (PARA XADREZ - NÃO USADO NO LUDO ATUALMENTE)
   Manter para compatibilidade futura ou para outros jogos.
===================================================== */
// Os métodos de replay (loadReplay, applyMoveBySAN, etc.) foram removidos para simplificar o Ludo.
// Se replay for necessário para o Ludo no futuro, precisarão ser reescritos ou adaptados.

/* =====================================================
   HISTÓRICO E PARTIDAS AO VIVO (UI LUDO)
===================================================== */

/**
 * Inicializa event listeners para as telas de histórico e partidas ao vivo de Ludo.
 */
function initLudoHistoryLiveUI() {
  el('btn-history-ludo-back', 'click', goLobby);
  el('btn-live-games-ludo-back', 'click', goLobby);
}

/**
 * Abre a tela de histórico de partidas de Ludo do usuário.
 */
async function openHistoryScreen() {
  showScreen('ludo-history');
  const listEl = gel('ludo-history-list');
  const statsEl = gel('ludo-history-stats');
  if (listEl) listEl.innerHTML = '<div class="history-loading">Carregando...</div>';
  if (statsEl) statsEl.innerHTML = '';

  if (!currentAuthManager.uid || currentAuthManager.isAnonymous) {
    if (listEl) listEl.innerHTML = '<div class="history-empty">Faça login para ver seu histórico.</div>';
    return;
  }

  try {
    const games = await historyManager.loadLudoHistory(currentAuthManager.uid);

    if (!games || games.length === 0) {
      if (listEl) listEl.innerHTML = '<div class="history-empty">Nenhuma partida de Ludo ainda.<br>Jogue sua primeira partida!</div>';
      return;
    }

    const wins = games.filter(g => g.result === 'win').length;
    const losses = games.filter(g => g.result === 'loss' || g.result === 'resigned').length;
    const draws = games.filter(g => g.result === 'draw').length; // Ludo geralmente não tem empate

    if (statsEl) statsEl.innerHTML =
      `<span class="stat stat-win">🏆 Vitórias: ${wins}</span> ` +
      `<span class="stat stat-loss">❌ Derrotas: ${losses}</span> ` +
      `<span class="stat stat-draw">🤝 Empates: ${draws}</span>`; // Draws podem ser 0 se não for implementado

    if (listEl) listEl.innerHTML = '';
    games.forEach(game => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const resClassMap = { win: 'result-win', loss: 'result-loss', draw: 'result-draw', resigned: 'result-loss' };
      const resTextMap = { win: 'Vitória 🏆', loss: 'Derrota ❌', draw: 'Empate 🤝', resigned: 'Desistência 🏳️' };
      const resClass = resClassMap[game.result] || '';
      const resText = resTextMap[game.result] || game.result;

      // Obtém os nomes dos oponentes de forma dinâmica
      let opponentDisplayNames = game.players
        .filter(p => !p.isMe && !p.isAI && p.id !== null)
        .map(p => escapeHtml(p.name));
      let aiOpponentCount = game.players.filter(p => p.isAI).length;

      let opponentDisplay = '';
      if (opponentDisplayNames.length > 0) {
        opponentDisplay = 'vs ' + opponentDisplayNames.join(', ');
      }
      if (aiOpponentCount > 0) {
        const separator = opponentDisplayNames.length > 0 ? ' + ' : '';
        opponentDisplay += `${separator}${aiOpponentCount} IA(s)`;
      }
      if (!opponentDisplay) { // Se não há oponentes explícitos (ex: só você no AI mode)
          opponentDisplay = 'Partida Solo/IA';
      }

      const date = new Date(game.endedAt).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
      });

      card.innerHTML = `
        <div class="history-card-left">
          <span class="history-result ${resClass}">${resText}</span>
          <span class="history-opponent">${opponentDisplay}</span>
        </div>
        <div class="history-card-center">
          <span class="history-mode">${game.mode === 'ai' ? '🤖 VS IA' : '👥 Multiplayer'}</span>
          <span class="history-moves">${game.players.length} jogadores</span>
        </div>
        <div class="history-card-right">
          <span class="history-date">${date}</span>
        </div>
      `;
      if (listEl) listEl.appendChild(card);
    });
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="history-empty">Erro ao carregar histórico de Ludo.</div>';
    console.error('Erro ao carregar histórico de Ludo:', e);
  }
}

/**
 * Abre a tela de partidas de Ludo ao vivo.
 */
async function openLiveGamesScreen() {
  showScreen('ludo-live-games');
  const listEl = gel('ludo-live-games-list');
  if (listEl) listEl.innerHTML = '<div class="history-loading">Carregando...</div>';

  try {
    const liveGames = await historyManager.loadLudoLiveGames();

    if (!liveGames || liveGames.length === 0) {
      if (listEl) listEl.innerHTML = '<div class="history-empty">Nenhuma partida de Ludo ao vivo no momento.</div>';
      return;
    }

    if (listEl) listEl.innerHTML = '';
    liveGames.forEach(game => {
      const card = document.createElement('div');
      card.className = 'history-card';

      // Constrói a lista de nomes de jogadores
      let playerDisplayNames = game.players
        .filter(p => !p.isAI && p.id !== null)
        .map(p => escapeHtml(p.name));
      let aiCount = game.players.filter(p => p.isAI).length;

      let playerSummary = playerDisplayNames.join(', ');
      if (aiCount > 0) {
        const separator = playerDisplayNames.length > 0 ? ' + ' : '';
        playerSummary += `${separator}${aiCount} IA(s)`;
      }
      if (!playerSummary) {
          playerSummary = 'Aguardando jogadores';
      }

      const date = new Date(game.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
      });

      card.innerHTML = `
        <div class="history-card-left">
          <span class="history-result result-draw">Ao Vivo</span>
          <span class="history-opponent">${playerSummary}</span>
        </div>
        <div class="history-card-center">
          <span class="history-mode">👥 Multiplayer</span>
          <span class="history-moves">${game.players.length} slots</span>
        </div>
        <div class="history-card-right">
          <span class="history-date">${date}</span>
          <button class="btn btn-small btn-secondary">👁 Assistir</button>
        </div>
      `;
      card.querySelector('button').addEventListener('click', () => {
        gel('input-spectate-code').value = game.id; // Preenche o campo de espectador
        spectateGame();
      });
      if (listEl) listEl.appendChild(card);
    });
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="history-empty">Erro ao carregar partidas ao vivo.</div>';
    console.error('Erro ao carregar partidas de Ludo ao vivo:', e);
  }
}