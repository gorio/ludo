/* =====================================================
   CONFIGURAÇÃO FIREBASE
===================================================== */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCa0WmUo1PIrlaYW6Ei8ZZK3XLZ4i0gIfo",
  authDomain:        "golf-oscar-romeo.firebaseapp.com",
  projectId:         "golf-oscar-romeo",
  storageBucket:     "golf-oscar-romeo.firebasestorage.app",
  databaseURL:       "https://golf-oscar-romeo-default-rtdb.firebaseio.com",
  messagingSenderId: "71631208569",
  appId:             "1:71631208569:web:e7a1cc7ad20903ce5ad4a8"
};

/* =====================================================
   CONSTANTES LUDO
   (Agora carregadas de ludo_constants.js via window.LUDO_CONSTANTS)
===================================================== */
// Os valores dessas constantes são acessados diretamente via window.LUDO_CONSTANTS.NOME_DA_CONSTANTE
// Não precisam ser redeclaradas aqui.

/* =====================================================
   ESTADO GLOBAL DA APLICAÇÃO
===================================================== */
let firebaseApp, db, fbAuth;          // Referências do Firebase
let currentAuthManager = null;        // Instância do AuthManager
let historyManager = null;            // Instância do HistoryManager

let engine = new LudoEngine();        // Instância do motor do Ludo
let ai = new LudoAI();                // Instância da IA do Ludo

let roomCode = null;                  // Código da sala multiplayer
let roomRef = null;                   // Referência do Firebase para a sala
let specRef = null;                   // Referência para sala de espectador
let myId = null;                      // UID do Firebase para usuários logados ou um ID temporário para convidados.
let myColor = null;                   // Minha cor na partida atual (ex: 'red', 'blue')
let gameActive = false;               // True se uma partida está em andamento
let gameMode = 'multiplayer';         // 'multiplayer' ou 'ai'
let aiThinking = false;               // True se a IA estiver processando um movimento
let selectedAiCount = 1;              // Quantidade de IAs no modo VS AI
let selectedHumanPlayersCount = 2;    // Qtd de players humanos (incluindo eu) para criar sala multiplayer
let isSpectator = false;              // True se estou apenas assistindo
let BOARD_CELLS_DOM = [];             // Cache do DOM das células do tabuleiro Ludo (grid 15x15)

/* =====================================================
   HELPER FUNCTIONS
===================================================== */
function gel(id) { return document.getElementById(id); }

function el(id, event, handler) {
  const element = gel(id);
  if (element) { element.addEventListener(event, handler); }
  else { /* console.warn(`Elemento com ID '${id}' não encontrado.`); */ }
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const targetScreen = gel(`screen-${name}`);
  if (targetScreen) targetScreen.classList.add('active');

  // Mostra/esconde o header dependendo da tela
  if (name === 'auth') {
    gel('app-header').classList.add('hidden');
  } else {
    gel('app-header').classList.remove('hidden');
  }
}

function showModal(id) {
  const modal = gel(id);
  if (modal) modal.classList.remove('hidden');
}

function hideModal(id) {
  const modal = gel(id);
  if (modal) modal.classList.add('hidden');
}

function escapeHtml(text) {
  const map = {
    '&': '&',
    '<': '<',
    '>': '>',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function isMyTurn() {
  if (!currentAuthManager || !currentAuthManager.uid || !engine.activePlayer) return false;
  return engine.activePlayer.id === currentAuthManager.uid;
}

/* =====================================================
   BOOTSTRAP - Inicialização da Aplicação
===================================================== */
window.addEventListener('DOMContentLoaded', async function() {
  try {
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    fbAuth = firebase.auth();

    // Instancia os managers e o motor do jogo UMA VEZ
    currentAuthManager = new AuthManager(db, fbAuth);
    historyManager = new HistoryManager(db);

  } catch (e) {
    console.error('Erro ao inicializar Firebase ou managers:', e);
    // TODO: Exibir um erro fatal na UI se necessário
    return;
  }

  // Inicializa os listeners de UI para as telas
  initAuthUI();
  initLobbyUI();
  initGameUI();
  initLudoHistoryLiveUI(); // Específico para telas de histórico do Ludo

  // Listener principal de autenticação do Firebase
  fbAuth.onAuthStateChanged(async function(user) {
    currentAuthManager.user = user; // Atualiza o objeto user no AuthManager
    myId = currentAuthManager.uid;   // Atualiza o ID global para o AuthManager.uid

    if (user) {
      updateProfileUI(user); // Atualiza o perfil no header
      // Salva/atualiza dados do usuário no DB, garantindo campos de Ludo
      await db.ref('users/' + user.uid).update({
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        lastSeen: Date.now(),
        ludoGamesPlayed: firebase.database.ServerValue.increment(0),
        ludoWins: firebase.database.ServerValue.increment(0),
        ludoLosses: firebase.database.ServerValue.increment(0),
        ludoDraws: firebase.database.ServerValue.increment(0)
      });

      // Redireciona para o lobby se estiver logado e na tela de auth
      if (gel('screen-auth').classList.contains('active')) {
        showScreen('lobby');
      }
    } else {
      updateProfileUI(null); // Atualiza UI para estado deslogado
      showScreen('auth');    // Redireciona para a tela de autenticação
    }
  });

  // Constrói a estrutura básica do tabuleiro Ludo UMA VEZ ao carregar
  buildBoardDOM();
});

/* =====================================================
   AUTH UI & LOGIC
===================================================== */
function initAuthUI() {
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

  el('btn-login-email', 'click', async () => {
    const email = gel('login-email').value.trim();
    const pass = gel('login-password').value;
    try {
      await currentAuthManager.loginWithEmail(email, pass);
    } catch (e) { showAuthError(e); }
  });

  el('login-password', 'keydown', e => { if (e.key === 'Enter') gel('btn-login-email').click(); });

  el('btn-login-google', 'click', async () => {
    try {
      await currentAuthManager.loginWithGoogle();
    } catch (e) { showAuthError(e); }
  });

  el('btn-register', 'click', async () => {
    const name = gel('reg-name').value.trim();
    const email = gel('reg-email').value.trim();
    const pass = gel('reg-password').value;
    try {
      await currentAuthManager.registerWithEmail(name, email, pass);
    } catch (e) { showAuthError(e); }
  });

  el('btn-register-google', 'click', async () => {
    try {
      await currentAuthManager.loginWithGoogle();
    } catch (e) { showAuthError(e); }
  });

  el('btn-guest', 'click', async () => {
    try {
      await currentAuthManager.loginAsGuest();
    } catch (e) { showAuthError(e); }
  });

  el('btn-forgot-password', 'click', async (e) => {
    e.preventDefault();
    const email = gel('login-email').value.trim();
    if (!email) {
      showAuthError('Insira seu e-mail para redefinir a senha.');
      return;
    }
    try {
      await fbAuth.sendPasswordResetEmail(email);
      alert('Um e-mail de redefinição de senha foi enviado para ' + email);
    } catch (error) {
      showAuthError(currentAuthManager._authErrorMsg(error.code));
    }
  });
}

function showAuthError(msg) { gel('auth-error').textContent = msg; }
function clearAuthError() {
  gel('auth-error').textContent = '';
  // Se houver um erro de registro, limpa também
  const regErrorEl = gel('auth-error-register');
  if (regErrorEl) regErrorEl.textContent = '';
}


function updateProfileUI(user) {
  const headerUsername = gel('header-username');
  const headerPhoto = gel('header-photo');
  const headerInitials = gel('header-initials');

  if (user) {
    headerUsername.textContent = currentAuthManager.displayName;
    if (currentAuthManager.photoURL) {
      headerPhoto.src = currentAuthManager.photoURL;
      headerPhoto.classList.remove('hidden');
      headerInitials.classList.add('hidden');
    } else {
      headerInitials.textContent = currentAuthManager.initials;
      headerInitials.classList.remove('hidden');
      headerPhoto.classList.add('hidden');
    }
  } else {
    headerUsername.textContent = 'Visitante';
    headerInitials.textContent = '?';
    headerInitials.classList.remove('hidden');
    headerPhoto.classList.add('hidden');
  }
}

/* =====================================================
   LOBBY UI & LOGIC
===================================================== */
function initLobbyUI() {
  el('btn-logout', 'click', () => currentAuthManager.logout());
  el('btn-back-to-lobby', 'click', goLobby); // Botão do header para voltar ao lobby

  el('btn-history-ludo', 'click', openHistoryScreen);
  el('btn-live-games-ludo', 'click', openLiveGamesScreen);
  el('btn-create', 'click', createGame);
  el('btn-join', 'click', joinGame);
  el('input-room', 'keydown', e => { if (e.key === 'Enter') joinGame(); });
  el('btn-spectate', 'click', spectateGame);
  el('input-spectate', 'keydown', e => { if (e.key === 'Enter') spectateGame(); });
  el('btn-start-ai', 'click', startAIGame);

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      gameMode = this.dataset.mode;
      gel('panel-multiplayer').classList.toggle('hidden', gameMode !== 'multiplayer');
      gel('panel-ai').classList.toggle('hidden', gameMode !== 'ai');
      clearLobbyError();
    });
  });

  document.querySelectorAll('.player-count-btns .btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.player-count-btns .btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      selectedHumanPlayersCount = parseInt(this.dataset.count);
    });
  });

  document.querySelectorAll('.ai-count-btns .btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.ai-count-btns .btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      selectedAiCount = parseInt(this.dataset.count);
    });
  });
}

function showLobbyError(msg) { gel('lobby-error').textContent = msg; }
function clearLobbyError() { gel('lobby-error').textContent = ''; }

function goLobby() {
  gameActive = false; aiThinking = false; isSpectator = false;

  if (roomRef) { roomRef.off(); roomRef = null; }
  if (specRef) { specRef.off(); specRef = null; }

  engine.reset(); // Zera o estado do motor do jogo
  myColor = null; // Reseta minha cor

  // Limpa inputs de sala
  const inputRoom = gel('input-room');
  const inputSpectate = gel('input-spectate');
  if (inputRoom) inputRoom.value = '';
  if (inputSpectate) inputSpectate.value = '';

  clearLobbyError(); // Limpa erros do lobby
  showScreen('lobby'); // Exibe a tela do lobby
}

/* =====================================================
   GAME UI & LOGIC
===================================================== */
function initGameUI() {
  el('btn-cancel', 'click', cancelGame);
  el('btn-copy', 'click', copyRoomCode);
  el('btn-resign', 'click', resignGame); // Renomeei para resignGame para evitar conflitos
  el('btn-gameover-new', 'click', () => { // "Nova Partida" no modal de gameover
    hideModal('modal-gameover');
    if (gameMode === 'ai') startAIGame();
    else goLobby();
  });
  el('btn-gameover-lobby', 'click', () => { hideModal('modal-gameover'); goLobby(); });

  // Botão de rolar dado
  el('btn-roll', 'click', onRollDiceClick);
}

// Handler para o clique no dado
async function onRollDiceClick() {
  if (isSpectator || !isMyTurn() || engine.phase !== 'roll' || aiThinking || engine.status !== 'playing') return;

  const rollButton = gel('btn-roll');
  if (rollButton) rollButton.disabled = true;

  gel('dice-display').textContent = '🎲'; // Mostra o dado "girando"
  await new Promise(resolve => setTimeout(resolve, 500));

  engine.rollDice();
  renderGame(); // Renderiza o dado e o tabuleiro

  // Se não houver movimentos válidos com o dado atual, e a AI ainda não estiver ativa,
  // automaticamente passa o turno após um pequeno delay para o jogador ver a mensagem.
  if (engine.status === 'playing' && engine.phase === 'move' && !engine.hasValidMoves()) {
    setTimeout(() => {
      engine.nextTurn();
      syncGameState(); // Sincroniza o estado atualizado
      renderGame();
      if (engine.activePlayer.isAI) setTimeout(doAITurn, 1500); // Se o próximo for IA, agendar.
    }, 1500);
  }

  if (rollButton) rollButton.disabled = false; // Reabilita o botão (será desabilitado novamente se for fase 'move')
}

// Handler para clique em um peão
function doMovePawn(pawnIndex) {
  if (isSpectator || !isMyTurn() || engine.phase !== 'move' || aiThinking || engine.status !== 'playing') return;

  const moved = engine.doMovePawn(pawnIndex);
  if (moved) {
    syncGameState();
    renderGame();
    if (engine.activePlayer.isAI) {
        if (!engine.extraTurn) { // Se não foi jogada extra, o turno da IA
            setTimeout(doAITurn, 1500);
        } else { // Se foi jogada extra, a IA rola novamente
             setTimeout(onRollDiceClick, 1500);
        }
    }
  }
}

async function syncGameState() {
  if (gameMode === 'multiplayer' && roomRef) {
    try {
      await roomRef.update({ state: engine.serialize() });
    } catch (e) {
      console.error('Erro ao sincronizar estado do jogo:', e);
    }
  }
}

/* =====================================================
   MULTIPLAYER LOGIC
===================================================== */
async function createGame() {
  const btn = gel('btn-create');
  if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }
  clearLobbyError();

  try {
    roomCode = generateRoomCode();
    roomRef = db.ref('rooms/' + roomCode);

    const currentPlayer = currentAuthManager.user;
    const myName = currentAuthManager.displayName;
    const myPhotoURL = currentAuthManager.photoURL;

    // Define os jogadores iniciais da sala (eu sou o red por padrão ao criar)
    const playersInRoom = {};
    const ludoColors = window.LUDO_CONSTANTS.LUDO_COLORS;

    // Garante que eu sou o primeiro jogador (slot 'red')
    playersInRoom[ludoColors[0]] = {
        id: myId,
        name: myName,
        isAI: false,
        photoURL: myPhotoURL || null
    };
    myColor = ludoColors[0]; // Define minha cor para esta sala

    // Preenche slots restantes com null para saber que esperam jogadores e define nomes padrão
    for (let i = 1; i < selectedHumanPlayersCount; i++) {
        const color = ludoColors[i];
        if (color) { // Garante que temos cores suficientes
            playersInRoom[color] = { id: null, name: `Aguardando ${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[color]}`, isAI: false, photoURL: null };
        }
    }

    await roomRef.set({
      gameType: 'ludo',
      hostId: myId,
      playerCount: selectedHumanPlayersCount, // Para controle na sala de espera
      playerColors: playersInRoom,           // Slots de cor para os jogadores
      state: engine.serialize(),             // Estado inicial vazio ou resetado do LudoEngine
      createdAt: Date.now(),
      status: 'waiting'
    });

    // Configura o timer para remover a sala se ninguém entrar
    setTimeout(async () => {
      if (!roomRef) return; // Sala já pode ter sido removida
      const snap = await roomRef.once('value');
      if (snap.val() && snap.val().status === 'waiting' && snap.val().hostId === myId) {
        await roomRef.remove(); // Apenas o host pode realmente remover
        goLobby();
        showLobbyError('Sua sala expirou por falta de jogadores.');
      }
    }, 600000); // 10 minutos

    gel('display-room-code').textContent = roomCode;
    showScreen('waiting');
    updateWaitingRoomPlayers(playersInRoom, selectedHumanPlayersCount);

    // Listener para mudanças na sala
    roomRef.on('value', snap => {
      const data = snap.val();
      if (!data) { // Sala foi removida por outro motivo ou host
        roomRef.off(); // Desliga o listener
        goLobby();
        showLobbyError('A sala foi encerrada.');
        return;
      }

      // Se o status mudou para 'playing' e minha cor está definida
      if (data.status === 'playing' && data.playerColors[myColor] && !gameActive) {
        roomRef.off(); // Desliga o listener da sala de espera, vamos para o jogo
        startMultiplayerGameSession(data);
      } else if (data.status === 'waiting') {
        updateWaitingRoomPlayers(data.playerColors, data.playerCount);
      }
    });

  } catch (e) {
    showLobbyError('Erro ao criar sala: ' + e.message);
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Criar Partida'; }
  }
}

async function joinGame() {
  const input = gel('input-room');
  const code = input ? input.value.trim().toUpperCase() : '';
  clearLobbyError();
  if (code.length !== 6) { showLobbyError('Código deve ter 6 caracteres.'); return; }

  const btn = gel('btn-join');
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

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
    const myName = currentAuthManager.displayName;
    const myPhotoURL = currentAuthManager.photoURL;

    let availableColor = null;
    const ludoColors = window.LUDO_CONSTANTS.LUDO_COLORS;
    for (const color of ludoColors) {
        if (!data.playerColors[color] || data.playerColors[color].id === null) {
            // Este slot está vazio, posso entrar
            availableColor = color;
            break;
        } else if (data.playerColors[color].id === myId) {
            // Já estou nesta sala, re-entrando
            availableColor = color;
            break;
        }
    }

    if (!availableColor) {
        showLobbyError('Sala cheia. Não há slots disponíveis para você.');
        roomRef = null;
        return;
    }

    myColor = availableColor;
    await roomRef.child('playerColors').child(myColor).set({
        id: myId,
        name: myName,
        isAI: false,
        photoURL: myPhotoURL || null
    });

    // Verifica se a sala está cheia de jogadores humanos e IAs (se a sala suporta)
    let currentHumanPlayersCount = 0;
    for (const color of ludoColors) {
        if (data.playerColors[color] && data.playerColors[color].id !== null && !data.playerColors[color].isAI) {
            currentHumanPlayersCount++;
        }
    }
    if (currentHumanPlayersCount === data.playerCount) {
        await roomRef.update({ status: 'playing' });
    }

    gel('display-room-code').textContent = roomCode;
    showScreen('waiting');
    updateWaitingRoomPlayers(data.playerColors, data.playerCount);

    roomRef.on('value', snap => {
      const roomData = snap.val();
      if (!roomData) { // Sala foi removida
        roomRef.off();
        goLobby();
        showLobbyError('A sala foi encerrada.');
        return;
      }

      if (roomData.status === 'playing' && roomData.playerColors[myColor] && !gameActive) {
        roomRef.off();
        startMultiplayerGameSession(roomData);
      } else if (roomData.status === 'waiting') {
        updateWaitingRoomPlayers(roomData.playerColors, roomData.playerCount);
      }
    });

  } catch (e) {
    showLobbyError('Erro ao entrar na sala: ' + e.message);
    console.error(e);
    roomRef = null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

async function cancelGame() {
  if (roomRef) {
    const snap = await roomRef.once('value');
    const room = snap.val();

    if (room && room.hostId === myId) {
      // Se eu sou o host, removo a sala inteira
      await roomRef.remove().catch(() => {});
    } else if (room && myColor) {
      // Se eu não sou o host, apenas deixo meu slot vazio
      await roomRef.child('playerColors').child(myColor).set({
          id: null,
          name: `Aguardando ${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[myColor]}`,
          isAI: false,
          photoURL: null
      }).catch(() => {});
      // Se a sala tinha apenas 2 jogadores e um sai, ela pode voltar ao status 'waiting' ou ser cancelada
      if (room.status === 'playing' && room.playerCount === 2) {
          await roomRef.update({ status: 'waiting' });
      }
    }
    roomRef.off();
    roomRef = null;
  }
  goLobby();
}

function copyRoomCode() {
  navigator.clipboard.writeText(roomCode).then(() => {
    const fb = gel('copy-feedback');
    if (fb) { fb.textContent = 'Copiado!'; setTimeout(() => { fb.textContent = '', 2000; }); }
  }).catch(err => {
    console.error('Falha ao copiar:', err);
    const fb = gel('copy-feedback');
    if (fb) { fb.textContent = 'Erro ao copiar!'; }
  });
}

function updateWaitingRoomPlayers(playerColors, maxPlayers) {
    const listEl = gel('waiting-players-list');
    const currentPlayersEl = gel('waiting-current-players');
    const maxPlayersEl = gel('waiting-max-players');
    if (!listEl || !currentPlayersEl || !maxPlayersEl) return;

    listEl.innerHTML = '';
    let currentOccupiedSlots = 0;
    const allPlayers = Object.entries(playerColors || {}).map(([color, pData]) => ({ color, ...pData }));

    allPlayers.forEach(player => {
        const row = document.createElement('div');
        row.className = 'waiting-player-row';
        const name = (player.id && !player.isAI) ? escapeHtml(player.name) : `Aguardando ${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[player.color]}...`;
        row.innerHTML = `
            <div class="player-color-dot" style="background-color: var(--ludo-${player.color});"></div>
            <span>${name} ${player.id === myId ? '(Você)' : ''}</span>
        `;
        listEl.appendChild(row);
        if (player.id !== null || player.isAI) { // Conta slots ocupados (por humanos ou IAs)
            currentOccupiedSlots++;
        }
    });

    currentPlayersEl.textContent = currentOccupiedSlots;
    maxPlayersEl.textContent = maxPlayers;
}

/**
 * Inicia a sessão de jogo multiplayer após a sala estar pronta (status 'playing').
 * @param {Object} roomData Os dados da sala do Firebase.
 */
async function startMultiplayerGameSession(roomData) {
  gameMode = 'multiplayer';
  gameActive = true;
  isSpectator = false;

  engine.deserialize(roomData.state); // Carrega o estado atual do jogo

  // Preenche o array de players do engine com os dados da sala
  const enginePlayers = [];
  const ludoColors = window.LUDO_CONSTANTS.LUDO_COLORS;
  for (const color of ludoColors) {
      const pData = roomData.playerColors[color];
      // Apenas adiciona jogadores que têm um slot preenchido (id existe)
      if (pData && pData.id) {
          enginePlayers.push({
              id: pData.id,
              name: pData.name,
              color: color,
              isAI: pData.isAI || false,
              photoURL: pData.photoURL || null
          });
      }
  }
  engine.players = enginePlayers;

  // Redefine minha cor se for um join que disparou a função
  if (!myColor) {
      const myPlayerData = enginePlayers.find(p => p.id === myId);
      if (myPlayerData) myColor = myPlayerData.color;
  }

  // Esconder/mostrar botões de controle
  gel('btn-resign').classList.remove('hidden');
  gel('btn-new-game').classList.add('hidden');
  gel('btn-back-lobby').classList.add('hidden');
  gel('spectator-bar').classList.add('hidden');

  showScreen('game');
  renderGame();

  // Listener para atualizações contínuas do estado do jogo para quem está jogando
  if (roomRef) roomRef.off(); // Remove o listener da sala de espera para adicionar o do jogo
  roomRef = db.ref('rooms/' + roomCode);
  roomRef.on('value', snap => {
    const data = snap.val();
    if (!data) { // Sala foi removida
      roomRef.off();
      goLobby();
      showGameOver('Partida Encerrada', 'O host encerrou a sala ou ela foi removida.');
      return;
    }

    engine.deserialize(data.state); // Atualiza o estado do engine
    renderGame();

    if (data.status === 'resigned' || data.status === 'abandoned' || data.status === 'finished') {
      roomRef.off();
      gameActive = false;
      let title = 'Partida Encerrada';
      let msg = 'O jogo terminou.';
      let myResult = 'draw'; // Default caso não se aplique (ex: espectador, abandono)

      const winnerPlayer = engine.players.find(p => p.id === data.winner); // Vencedor da sala
      const myPlayerData = engine.players.find(p => p.id === myId); // Meus dados

      if (data.status === 'resigned') {
          title = 'Partida Finalizada';
          msg = `${winnerPlayer ? winnerPlayer.name : 'Um jogador'} resignou.`;
          if (data.winner === myId) { // Se o winner da sala sou eu
             msg = `Você venceu! Seu oponente desistiu. 🏆`;
             myResult = 'win';
          } else if (myPlayerData && myPlayerData.color === data.winner) {
             // Caso o winner seja definido pela COR, e a cor do winner sou eu
             msg = `Você venceu! Seu oponente desistiu. 🏆`;
             myResult = 'win';
          } else { // Oponente venceu minha rendição
             msg = `Você perdeu! O oponente venceu. ❌`;
             myResult = 'loss'; // Eu perdi por resignação ou outro resignou para outro
          }

      } else if (data.status === 'abandoned') {
        title = 'Partida Abandonada';
        msg = `Um jogador (${data.abandonedPlayerName || 'desconhecido'}) abandonou a partida.`;
        // Se eu sou o único player que sobrou e não abandonei
        const activePlayers = engine.players.filter(p => p.id && !p.isAI);
        if (activePlayers.length === 1 && activePlayers[0].id === myId) {
            msg += ` Você venceu! 🏆`;
            myResult = 'win';
        } else {
            myResult = 'draw'; // Se a partida foi inconclusiva
        }
      } else if (data.status === 'finished' && engine.winner) { // Fim de jogo por regras do Ludo
        title = (engine.winner === myId) ? 'Você Venceu! 🏆' : 'Fim de Jogo!';
        msg = (engine.winner === myId) ? `Parabéns, ${winnerPlayer.name}!` : `Vencedor: ${winnerPlayer.name}. Boa sorte na próxima!`;
        myResult = (engine.winner === myId) ? 'win' : 'loss';
      }

      // Salva o jogo no histórico apenas se eu não for espectador e tiver um resultado concreto para mim
      if(!isSpectator && myResult) {
          historyManager.saveLudoGame({
            gameType: 'ludo',
            uid: currentAuthManager.uid,
            isAnonymous: currentAuthManager.isAnonymous,
            mode: gameMode,
            players: engine.players,
            myColor: myColor,
            result: myResult,
            endedAt: Date.now(),
          });
      }

      showGameOver(title, msg);
    } else if (!isSpectator && isMyTurn() && engine.phase === 'move' && !engine.hasValidMoves()) {
        // Se meu turno, fase de 'move' e sem movimentos válidos, auto-passa o turno
        engine.nextTurn();
        syncGameState();
        renderGame();
    }
  });

  // Se o primeiro jogador ativo for uma IA, agenda o movimento dela
  if (roomData.status === 'playing' && engine.activePlayer.isAI) {
    setTimeout(doAITurn, 1500);
  }
}

/* =====================================================
   VS AI LOGIC (LUDO)
===================================================== */
function startAIGame() {
  gameMode = 'ai';
  gameActive = true;
  isSpectator = false;

  const ludoColors = window.LUDO_CONSTANTS.LUDO_COLORS;
  myColor = ludoColors[0]; // Jogador humano é sempre a primeira cor (red) no modo AI

  engine.reset(); // Reseta o motor do jogo

  const playerConfigs = [];
  // Adiciona o jogador humano (eu)
  playerConfigs.push({
    id: currentAuthManager.uid,
    name: currentAuthManager.displayName,
    isAI: false,
    color: myColor,
    photoURL: currentAuthManager.photoURL
  });

  // Adiciona as IAs
  for (let i = 0; i < selectedAiCount; i++) {
    const aiColor = ludoColors[i + 1]; // Próximas cores para as IAs
    playerConfigs.push({
      id: `ai_${aiColor}_${Date.now()}_${i}`, // ID único para a IA
      name: `Computador ${i + 1}`,
      isAI: true,
      color: aiColor,
      photoURL: null
    });
  }

  engine.setupGame(playerConfigs); // Configura o jogo com os jogadores (Humano + AI)

  // Esconder/mostrar botões de controle
  gel('btn-resign').classList.remove('hidden');
  gel('btn-new-game').classList.add('hidden');
  gel('btn-back-lobby').classList.add('hidden');
  gel('spectator-bar').classList.add('hidden');

  showScreen('game');
  renderGame();

  if (engine.activePlayer.isAI) {
    setTimeout(doAITurn, 1500); // Se o primeiro turno for da IA, agenda o movimento dela
  }
}

async function doAITurn() {
  if (!gameActive || !engine.activePlayer.isAI || engine.status !== 'playing') {
      aiThinking = false;
      renderStatusBar(); // Atualizar para remover pensando
      return;
  }

  aiThinking = true;
  renderStatusBar(); // Mostrar "IA pensando..."

  const rollButton = gel('btn-roll');
  if (rollButton) rollButton.disabled = true; // Desabilita roll para IA

  gel('dice-display').textContent = '🎲'; // Simula o dado girando
  await new Promise(resolve => setTimeout(resolve, 800));

  engine.rollDice();
  renderGame(); // Atualiza UI com o dado rolado pela IA

  // Se a IA rolou e não tem movimentos válidos, ela passa o turno automaticamente
  if (engine.phase === 'move' && !engine.hasValidMoves()) {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Pequeno delay
      engine.nextTurn();
      aiThinking = false;
      renderGame();
      if (engine.activePlayer.isAI) setTimeout(doAITurn, 1500); // Se o próximo for outra IA
      return;
  }

  if (engine.phase === 'move') {
      aiThinking = true;
      renderStatusBar(); // Ainda "pensando" para decidir o movimento

      const delay = 1000 + (Math.random() * 500); // Atraso aleatório (1 a 1.5 segundos)
      await new Promise(resolve => setTimeout(resolve, delay));

      const pawnIndexToMove = ai.getBestMove(engine);

      if (pawnIndexToMove !== null) {
          engine.doMovePawn(pawnIndexToMove);
          aiThinking = false;
          renderGame();

          if (engine.status === 'playing') {
            if (engine.activePlayer.id === engine.players[engine.currentTurn].id) { // Se ainda é a vez da IA (jogada extra)
                setTimeout(doAITurn, 1500);
            }
          }
      } else {
        // Isso não deveria acontecer se hasValidMoves() for preciso
        console.warn('IA não encontrou um movimento válido após rolar o dado (contingency).');
        engine.nextTurn();
        aiThinking = false;
        renderGame();
        if (engine.activePlayer.isAI) setTimeout(doAITurn, 1500);
      }
  }
}

/* =====================================================
   ESPECTADOR LOGIC
===================================================== */
async function spectateGame() {
  const input = gel('input-spectate');
  const code = input ? input.value.trim().toUpperCase() : '';
  clearLobbyError();
  if (code.length !== 6) { showLobbyError('Código deve ter 6 caracteres.'); return; }

  try {
    const snap = await db.ref('rooms/' + code).once('value');
    const data = snap.val();

    if (!data) { showLobbyError('Sala não encontrada.'); return; }
    if (data.gameType !== 'ludo') { showLobbyError('Esta sala é para outro jogo.'); return; }
    if (data.status === 'waiting') { showLobbyError('Partida ainda não começou.'); return; }
    if (data.status === 'finished' || data.status === 'resigned' || data.status === 'abandoned') {
      showLobbyError('Partida já encerrou.'); return;
    }

    isSpectator = true; roomCode = code; myColor = null; // Espectador não tem "minha cor"
    engine.deserialize(data.state);

    // Preenche o array de players do engine com os dados da sala para exibir na sidebar
    const enginePlayers = [];
    const ludoColors = window.LUDO_CONSTANTS.LUDO_COLORS;
    for (const color of ludoColors) {
        const pData = data.playerColors[color];
        if (pData && pData.id) { // Apenas jogadores que têm slot preenchido
            enginePlayers.push({
                id: pData.id,
                name: pData.name,
                color: color,
                isAI: pData.isAI || false,
                photoURL: pData.photoURL || null
            });
        }
    }
    engine.players = enginePlayers; // Define os players do engine

    showScreen('game');
    renderGame();
    // Esconde botões de ação para o espectador
    gel('btn-resign').classList.add('hidden');
    gel('btn-new-game').classList.add('hidden');
    gel('btn-back-lobby').classList.remove('hidden'); // Botão pra voltar pro lobby
    gel('spectator-bar').classList.remove('hidden'); // Mostra barra de espectador

    specRef = db.ref('rooms/' + code); // Listener para atualizações
    specRef.on('value', snap => {
      const d = snap.val();
      if (!d) { // Sala foi removida
        specRef.off();
        goLobby();
        showGameOver('Partida Encerrada', 'A sala que você assistia foi removida.');
        return;
      }
      engine.deserialize(d.state);

      // Atualiza a lista de players no engine caso entre/saia alguém
      const updatedEnginePlayers = [];
      for (const color of ludoColors) {
          const pData = d.playerColors[color];
          if (pData && pData.id) {
              updatedEnginePlayers.push({
                  id: pData.id,
                  name: pData.name,
                  color: color,
                  isAI: pData.isAI || false,
                  photoURL: pData.photoURL || null
              });
          }
      }
      engine.players = updatedEnginePlayers;
      renderGame(); // Renderiza o estado atualizado

      if (d.status === 'finished' || d.status === 'resigned' || d.status === 'abandoned') {
        gel('spectator-bar').textContent = '👁 Partida encerrada.';
        specRef.off();
      } else {
        gel('spectator-bar').textContent = `👁 Assistindo — Vez de ${engine.activePlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[engine.activePlayer.color]})`;
      }
    });

  } catch (e) {
    showLobbyError('Erro ao conectar como espectador: ' + e.message);
    console.error(e);
  }
}

/* =====================================================
   GAME OVER / RESIGN
===================================================== */
/**
 * Trata a desistência da partida.
 */
async function resignGame() {
  if (!gameActive || isSpectator || !isMyTurn()) return;
  if (!confirm('Tem certeza que deseja desistir da partida? Esta ação não pode ser desfeita.')) return;

  gameActive = false;
  aiThinking = false;

  let winningPlayerId = null;
  // No Ludo, se um jogador humano desiste, os outros não ganham automaticamente no DB,
  // mas o sistema precisa de um "vencedor" para registrar a partida.
  // Para fins de registro: se eu desisto, eu perco para o "primeiro outro jogador ativo".
  const otherPlayers = engine.players.filter(p => p.id !== myId && !p.isAI && p.id !== null);
  if (otherPlayers.length > 0) {
      winningPlayerId = otherPlayers[0].id;
  } else {
      // Se só sobrou IAs ou eu era o único no jogo multiplayer, a IA "ganha" ou fica sem vencedor real.
      const aiPlayers = engine.players.filter(p => p.isAI);
      if (aiPlayers.length > 0) {
          winningPlayerId = aiPlayers[0].id;
      }
  }

  engine.winner = winningPlayerId; // Define o vencedor para o engine salvar
  engine.status = 'resigned'; // Marca como resignado
  engine.logEvent(myColor, `${currentAuthManager.displayName} desistiu da partida.`);

  if (gameMode === 'multiplayer' && roomRef) {
    await roomRef.update({
      status: 'resigned',
      winner: winningPlayerId, // ID do jogador vencedor no Firebase
      state: engine.serialize() // Salva o estado final
    }).catch(e => console.error('Erro ao atualizar sala para resignação:', e));
    if (roomRef) { roomRef.off(); roomRef = null; }
  }

  // Salva o jogo como "loss" por resignação no meu histórico
  await historyManager.saveLudoGame({
    gameType: 'ludo',
    uid: currentAuthManager.uid,
    isAnonymous: currentAuthManager.isAnonymous,
    mode: gameMode,
    players: engine.players,
    myColor: myColor,
    result: 'loss', // Sempre 'loss' para quem desiste
    endedAt: Date.now(),
  });

  const getWinnerName = (id) => {
      const p = engine.players.find(player => player.id === id);
      return p ? p.name : 'Oponente';
  };

  const winnerNameDisplay = winningPlayerId ? getWinnerName(winningPlayerId) : 'Ninguém';
  const gameOverTitle = 'Você Desistiu! 🏳️';
  const gameOverMsg = `Vitória para ${winnerNameDisplay}!`;


  showGameOver(gameOverTitle, gameOverMsg);
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
      : title.includes('Desistiu') ? '🏳️' : '🎲'; // Ícone padrão
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
  BOARD_CELLS_DOM = [];

  for (let r = 0; r < window.LUDO_CONSTANTS.BOARD_SIZE; r++) {
    BOARD_CELLS_DOM[r] = [];
    for (let c = 0; c < window.LUDO_CONSTANTS.BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'ludo-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      // Adiciona classes de zona e segurança
      const zone = getCellZone(r, c);
      if (zone) cell.classList.add('zone-' + zone);

      // Adiciona classes para a base (as 4 casas coloridas de cada canto)
      Object.entries(window.LUDO_CONSTANTS.BASE_POSITIONS).forEach(([color, coordsArray]) => {
          if (coordsArray.some(coord => coord[0] === r && coord[1] === c)) {
              cell.classList.add(`ludo-base-${color}`); // Ex: ludo-base-red
          }
      });

      // Adiciona classes para a entrada de cada cor (a casa da estrela na saída)
      Object.entries(window.LUDO_CONSTANTS.ENTRY_POS).forEach(([color, entryCoords]) => {
          if (entryCoords[0] === r && entryCoords[1] === c) {
              cell.classList.add(`start-${color}`);
          }
      });

      // Verifica se a célula é uma casa segura no caminho principal
      const pathIndex = window.LUDO_CONSTANTS.PATH_COORDS.findIndex(coord => coord[0] === r && coord[1] === c);
      if (pathIndex !== -1 && window.LUDO_CONSTANTS.SAFE_SQUARES_INDEXES.includes(pathIndex)) {
        cell.classList.add('safe');
      }

      boardEl.appendChild(cell);
      BOARD_CELLS_DOM[r][c] = cell;
    }
  }
}

/**
 * Identifica a "zona" (cor ou neutra) de uma célula específica do tabuleiro 15x15.
 * Usado para aplicar estilos de fundo.
 * @param {number} r Linha da célula.
 * @param {number} c Coluna da célula.
 * @returns {string} A zona (red, blue, green, yellow, center, neutral_path) ou null.
 */
function getCellZone(r, c) {
  // Bases (regiões 6x6 nos cantos do tabuleiro)
  if (r >=0 && r <=5 && c >=0 && c <=5) return 'red';
  if (r >=0 && r <=5 && c >=9 && c <=14) return 'blue';
  if (r >=9 && r <=14 && c >=9 && c <=14) return 'green';
  if (r >=9 && r <=14 && c >=0 && c <=5) return 'yellow';

  // Centro (3x3)
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return 'center';

  // Corredores finais (Home Paths)
  // Vermelho: linha 7, colunas 0 a 6
  if (r === 7 && c >= 0 && c <= 6) return 'red';
  // Azul: coluna 7, linhas 0 a 6
  if (c === 7 && r >= 0 && r <= 6) return 'blue';
  // Verde: linha 7, colunas 8 a 14
  if (r === 7 && c >= 8 && c <= 14) return 'green';
  // Amarelo: coluna 7, linhas 8 a 14
  if (c === 7 && r >= 8 && r <= 14) return 'yellow';

  // Casas da trilha principal
  const isPathCoord = window.LUDO_CONSTANTS.PATH_COORDS.some(coord => coord[0] === r && coord[1] === c);
  if (isPathCoord) return 'neutral_path';

  return null; // Fora de qualquer zona definida
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
  // Limpa todos os peões existentes
  document.querySelectorAll('.pawn').forEach(p => p.remove());

  engine.players.forEach((player) => {
    player.pawns.forEach((pawn, pawnIdx) => {
      let coords = null;
      let targetCellEl = null;

      if (pawn.finished) {
          // Peças finalizadas não são mais renderizadas no tabuleiro
          return;
      } else if (pawn.pos === -1) {
          // Peça na base
          coords = window.LUDO_CONSTANTS.BASE_POSITIONS[player.color]?.[pawnIdx];
      } else if (pawn.homeStep !== -1) {
          // Peça no corredor final (home path)
          coords = window.LUDO_CONSTANTS.HOME_PATHS[player.color]?.[pawn.homeStep];
      } else {
          // Peça na trilha principal
          coords = window.LUDO_CONSTANTS.PATH_COORDS[pawn.pos];
      }

      if (!coords || !BOARD_CELLS_DOM[coords[0]] || !BOARD_CELLS_DOM[coords[0]][coords[1]]) {
        return; // Posição inválida, não renderiza a peça
      }
      targetCellEl = BOARD_CELLS_DOM[coords[0]][coords[1]];


      const pawnEl = document.createElement('div');
      pawnEl.className = `pawn ${player.color}`;
      pawnEl.dataset.playerColor = player.color;
      pawnEl.dataset.pawnIdx = pawnIdx;
      pawnEl.textContent = window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color];

      // Reset de estados visuais das células
      targetCellEl.classList.remove('highlight-move', 'highlight-capture');

      // Adiciona classe de "movable" se for a vez do jogador e a peça puder mover
      if (!isSpectator && isMyTurn() && engine.phase === 'move') {
        const validMoves = engine.getValidMoves();
        if (validMoves.includes(pawnIdx)) {
          pawnEl.classList.add('movable');
          pawnEl.addEventListener('click', () => doMovePawn(pawnIdx));
        }
      }
      targetCellEl.appendChild(pawnEl);
    });
  });

  // Limpa destaques do tabuleiro (de movimentos anteriores)
  document.querySelectorAll('.ludo-cell.highlight-move, .ludo-cell.highlight-capture').forEach(cell => {
    cell.classList.remove('highlight-move', 'highlight-capture');
  });

  // Destaca as células para onde as peças "movable" podem ir
  if (!isSpectator && isMyTurn() && engine.phase === 'move') {
    const player = engine.activePlayer;
    const validMoves = engine.getValidMoves();

    validMoves.forEach(validPawnIdx => {
      const pawn = player.pawns[validPawnIdx];
      const targetPositionResult = engine._calculateTargetPosition(player, pawn, engine.diceValue);

      let targetCoords = null;
      if (targetPositionResult.type === 'main') {
          targetCoords = window.LUDO_CONSTANTS.PATH_COORDS[targetPositionResult.index];
      } else if (targetPositionResult.type === 'homePath') {
          targetCoords = window.LUDO_CONSTANTS.HOME_PATHS[player.color][targetPositionResult.index];
      } else if (targetPositionResult.type === 'finished') {
          // Destacar a célula central como destino final se aplicável
          targetCoords = [7, 7]; // Coordenada central do tabuleiro
      }

      if (targetCoords) {
        const cellToHighlight = BOARD_CELLS_DOM[targetCoords[0]][targetCoords[1]];
        if (cellToHighlight) {
          // Verifica se é uma captura para aplicar destaque diferente
          if (engine._checkCapture(player, targetPositionResult)) {
            cellToHighlight.classList.add('highlight-capture');
          } else {
            cellToHighlight.classList.add('highlight-move');
          }
        }
      }
    });

  }
}


/**
 * Renderiza a lista de jogadores na sidebar.
 */
function renderPlayersList() {
  const listEl = gel('players-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  engine.players.forEach(player => {
    const card = document.createElement('div');
    card.className = `player-card ${player.color}`;
    // Adiciona classe 'active-turn' se for o jogador atual
    if (engine.activePlayer && engine.activePlayer.id === player.id) {
      card.classList.add('active-turn');
    }

    let playerNameDisplay = escapeHtml(player.name);
    if (player.id === myId) playerNameDisplay += ' (Você)';
    else if (player.isAI) playerNameDisplay += ' (IA)';

    const playerPhotoURL = player.photoURL || null;
    let avatarContent = '';

    if (playerPhotoURL) {
      avatarContent = `<img src="${playerPhotoURL}" alt="${player.name}" class="player-photo">`;
    } else {
      const initials = (player.name || '?')[0].toUpperCase();
      avatarContent = `<span class="player-initials" style="background-color: var(--ludo-${player.color}-dark);">${initials}</span>`;
    }

    card.innerHTML = `
      <div class="player-avatar">
        ${avatarContent}
      </div>
      <div class="player-info">
        <span class="player-name">${playerNameDisplay}</span>
        <span class="player-score">${player.score} / ${window.LUDO_CONSTANTS.PIECES_PER_PLAYER}</span>
        <div class="ludo-score-indicator" data-color="${player.color}">
          <!-- Peões na base serão renderizados aqui como dots -->
        </div>
      </div>
    `;

    // Renderiza os "dots" para peões na base ou perto de sair
    const scoreIndicator = card.querySelector('.ludo-score-indicator');
    if (scoreIndicator) {
      for(let i=0; i < window.LUDO_CONSTANTS.PIECES_PER_PLAYER; i++){
        const pawn = player.pawns[i];
        if(!pawn.finished){ // Se a peça ainda não terminou
          const dot = document.createElement('span');
          dot.className = 'pawn-on-base-dot';
          if (pawn.pos === -1 && engine.diceValue === 6) { // Se o 6 rolou e a peça está na base, ela está "ready"
            dot.classList.add('ready');
          } else if (pawn.pos !== -1 || pawn.homeStep !== -1) {
            dot.style.backgroundColor = `var(--ludo-${player.color})`; // Peça já saiu.
          }
          scoreIndicator.appendChild(dot);
        }
      }
    }

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
  btnRoll.disabled = false;

  const activePlayer = engine.activePlayer;

  if (isSpectator) {
    bar.textContent = `👁 Assistindo — Vez de ${activePlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[activePlayer.color]})`;
    btnRoll.classList.add('hidden');
    return;
  }
  if (aiThinking) {
    bar.innerHTML = `Computador (${activePlayer.name}) pensando <span class="thinking-dots"><span></span><span></span><span></span></span>`;
    btnRoll.disabled = true;
    return;
  }

  if (engine.status === 'finished') {
    bar.textContent = `Partida encerrada! Vencedor: ${activePlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[activePlayer.color]}) 🏆`;
    bar.classList.remove('your-turn');
    btnRoll.classList.add('hidden'); // Esconde o botão de rolar ao final do jogo
  } else if (isMyTurn()) {
    if (engine.phase === 'roll') {
      bar.textContent = `Sua vez (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[myColor]}) — Role o dado!`;
      bar.classList.add('your-turn');
    } else { // phase === 'move'
      btnRoll.disabled = true; // Desabilita roll após rolar
      // Verifica se há movimentos válidos. Se não, avisa e passa o turno.
      if (!engine.hasValidMoves() && engine.diceValue > 0) {
        bar.textContent = `Sua vez (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[myColor]}) — Sem movimentos válidos para dado ${engine.diceValue}.`;
      } else {
        bar.textContent = `Sua vez (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[myColor]}) — Escolha uma peça para mover ${engine.diceValue} casas.`;
      }
      bar.classList.add('your-turn');
    }
  } else {
    // Vez de outro jogador (humano ou IA que ainda não começou o turno)
    bar.textContent = `Vez de ${activePlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[activePlayer.color]})`;
    bar.classList.remove('your-turn');
    btnRoll.disabled = true;
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
  logEntriesEl.innerHTML = '';
  engine.log.forEach(entry => {
    const logEntryEl = document.createElement('div');
    logEntryEl.className = `log-entry color-${entry.color || 'neutral'}`; // Adiciona classe de cor
    logEntryEl.textContent = entry.message;
    logEntriesEl.appendChild(logEntryEl);
  });
  logEntriesEl.scrollTop = logEntriesEl.scrollHeight; // Scroll para o final
}

/* =====================================================
   HISTÓRICO E PARTIDAS AO VIVO (UI LUDO)
===================================================== */
function initLudoHistoryLiveUI() {
  // Estes botões existem apenas para ir e voltar das telas de histórico e live games
  el('btn-history-ludo-back', 'click', goLobby);
  el('btn-live-games-ludo-back', 'click', goLobby);
}

// Abre a tela de histórico de Ludo
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
    const draws = games.filter(g => g.result === 'draw').length;

    if (statsEl) statsEl.innerHTML =
      `<span class="stat stat-win">🏆 Vitórias: ${wins}</span> ` +
      `<span class="stat stat-loss">❌ Derrotas: ${losses}</span> ` +
      `<span class="stat stat-draw">🤝 Empates: ${draws}</span>`;

    if (listEl) listEl.innerHTML = '';
    // Ordena jogos por data mais recente primeiro
    games.sort((a,b) => b.endedAt - a.endedAt);

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
        opponentDisplay += (opponentDisplayNames.length > 0 ? ' + ' : 'vs ') + `${aiOpponentCount} IA(s)`;
      }
      if (!opponentDisplay && game.mode === 'ai') { // Se só tinha eu e uma IA
          opponentDisplay = 'Partida Solo/IA';
      } else if (!opponentDisplay) { // Caso inesperado
          opponentDisplay = 'Outros jogadores';
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

// Abre a tela de partidas ao vivo de Ludo
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
        playerSummary += (playerDisplayNames.length > 0 ? ' + ' : '') + `${aiCount} IA(s)`;
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
        gel('input-spectate').value = game.id;
        spectateGame();
      });
      if (listEl) listEl.appendChild(card);
    });
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="history-empty">Erro ao carregar partidas ao vivo.</div>';
    console.error('Erro ao carregar partidas de Ludo ao vivo:', e);
  }
}