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
const LUDO_COLORS = window.LUDO_CONSTANTS.LUDO_COLORS;
const COLOR_TRANSLATIONS = window.LUDO_CONSTANTS.COLOR_TRANSLATIONS;
const PIECES_SYMBOLS = window.LUDO_CONSTANTS.PIECES_SYMBOLS;


/* =====================================================
   ESTADO GLOBAL DA APLICAÇÃO
===================================================== */
let firebaseApp, db, fbAuth; // Firebase references
let currentAuthManager = null; // Instância do AuthManager
let historyManager = null;     // Instância do HistoryManager

let engine = new LudoEngine(); // Instância do motor do Ludo
let ai = new LudoAI();         // Instância da IA do Ludo

let roomCode = null;
let roomRef = null;
let specRef = null;
let myId = null;     // UID do Firebase para usuários logados ou um ID temporário para convidados.
let myColor = null;    // Cor do jogador atual na partida (referência para o playerConfigs)
let gameActive = false;
let gameMode = 'multiplayer';  // 'multiplayer' ou 'ai'
let aiThinking = false;
let selectedAiCount = 1;       // Quantidade de IAs no modo VS AI
let selectedHumanPlayersCount = 2; // Qtd de players humanos (incluindo eu) para criar sala multiplayer
let isSpectator = false;
let BOARD_CELLS_DOM = []; // Cache do DOM das células do tabuleiro Ludo

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
  // Se for tela de jogo, mostra o header
  if (name === 'game' || name.includes('history') || name.includes('live-games')) {
    gel('app-header').classList.remove('hidden');
  } else {
    gel('app-header').classList.add('hidden');
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
   BOOTSTRAP
===================================================== */
window.addEventListener('DOMContentLoaded', async function() {
  try {
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    fbAuth = firebase.auth();

    currentAuthManager = new AuthManager(db, fbAuth);
    historyManager = new HistoryManager(db);

  } catch (e) {
    console.error('Erro ao inicializar Firebase ou managers:', e);
    // Exibir um erro fatal na UI se necessário
    return;
  }

  // Inicializa UIs
  initAuthUI();
  initLobbyUI();
  initGameUI();
  initHistoryUI(); // Para Xadrez/Dama se houver.
  // Novo init para telas de Ludo
  initLudoHistoryLiveUI();

  // Listener principal de autenticação
  fbAuth.onAuthStateChanged(async function(user) {
    currentAuthManager.user = user; // Atualiza o objeto user no AuthManager
    myId = currentAuthManager.uid; // Atualiza o ID global

    if (user) {
      // Atualiza o perfil no header
      updateProfileUI(user);
      // Salva ou atualiza dados do usuário no DB, incluindo estatísticas de Ludo
      await db.ref('users/' + user.uid).update({
        displayName: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        lastSeen: Date.now(),
        // Garante que os campos de Ludo existam para novos usuários
        ludoGamesPlayed: firebase.database.ServerValue.increment(0), // Garante que é um número
        ludoWins: firebase.database.ServerValue.increment(0),
        ludoLosses: firebase.database.ServerValue.increment(0)
      });

      // Redireciona para o lobby se estiver logado
      if (gel('screen-auth').classList.contains('active')) {
        showScreen('lobby');
      }
    } else {
      // Se deslogou, redireciona para a tela de autenticação
      updateProfileUI(null);
      showScreen('auth');
    }
  });

  // Garante que o buildBoardDOM é chamado quando o DOM está pronto.
  // Ele cria a estrutura básica do tabuleiro, independentemente do jogo ativo.
  buildBoardDOM();
});

/* =====================================================
   AUTH UI & LOGIC
===================================================== */
function initAuthUI() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      gel('tab-login').classList.toggle('hidden', target !== 'login');
      gel('tab-register').classList.toggle('hidden', target !== 'register');
      clearAuthError();
    });
  });

  el('btn-login-email', 'click', async () => {
    const email = gel('login-email').value.trim();
    const pass = gel('login-password').value;
    if (!email || !pass) { showAuthError('Preencha e-mail e senha.'); return; }
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
    if (!name) { showAuthError('Informe seu nome.'); return; }
    if (!email) { showAuthError('Informe seu e-mail.'); return; }
    if (pass.length < 6) { showAuthError('Senha mínima de 6 caracteres.'); return; }
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
}

function showAuthError(msg) { gel('auth-error').textContent = msg; }
function clearAuthError() { gel('auth-error').textContent = ''; }

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
  el('btn-history-ludo', 'click', openHistoryScreen); // Ludo
  el('btn-live-games-ludo', 'click', openLiveGamesScreen); // Ludo
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
  engine.reset();
  myColor = null;

  // Limpa inputs
  const inputRoom = gel('input-room');
  const inputSpectate = gel('input-spectate');
  if (inputRoom) inputRoom.value = '';
  if (inputSpectate) inputSpectate.value = '';

  clearLobbyError();
  showScreen('lobby');
}

/* =====================================================
   GAME UI & LOGIC
===================================================== */
function initGameUI() {
  el('btn-cancel', 'click', cancelGame);
  el('btn-copy', 'click', copyRoomCode);
  el('btn-resign', 'click', resign);
  el('btn-new-game', 'click', () => { // "Nova Partida" no modal de gameover
    hideModal('modal-gameover');
    if (gameMode === 'ai') startAIGame();
    else goLobby(); // No multiplayer, volta para o lobby para criar/entrar em uma nova
  });
  el('btn-back-lobby', 'click', goLobby); // Botão "Voltar para o Lobby"
  el('btn-gameover-new', 'click', () => {
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
  if (rollButton) rollButton.disabled = true; // Desabilita para evitar cliques múltiplos

  // Simula um atraso para o dado "girar"
  gel('dice-display').textContent = '🎲'; // Mostra o dado girando
  await new Promise(resolve => setTimeout(resolve, 500));

  engine.rollDice();
  renderGame(); // Renderiza o dado e o tabuleiro

  if (engine.status === 'playing' && engine.phase === 'move') {
    const validMoves = engine.getValidMoves();
    if (validMoves.length === 0) {
      // Se não há movimentos válidos, automaticamente passa o turno após um pequeno delay
      setTimeout(() => {
        engine.nextTurn();
        syncGameState();
        renderGame();
        if (engine.activePlayer.isAI) setTimeout(doAITurn, 1500); // Agendar IA
      }, 1500);
    }
  }

  if (rollButton) rollButton.disabled = false; // Reabilita após a rolagem (se necessário, será desabilitado novamente se não for fase 'roll')
}

// Handler para clique em um peão
// `pawnIndex` é o índice do peão no array `player.pawns` do jogador ativo
function doMovePawn(pawnIndex) {
  if (isSpectator || !isMyTurn() || engine.phase !== 'move' || aiThinking || engine.status !== 'playing') return;

  const moved = engine.doMovePawn(pawnIndex);
  if (moved) {
    syncGameState();
    renderGame();
    if (engine.activePlayer.isAI) {
        if (!engine.extraTurn) { // Se não foi jogada extra, a IA pode ter seu turno
            setTimeout(doAITurn, 1500);
        } else { // Se foi jogada extra, continua o turno atual (IA rola novamente)
             setTimeout(onRollDiceClick, 1500); // Força um novo rolar de dado para a IA
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
    const myName = currentPlayer.displayName || currentPlayer.email || 'Jogador';
    const myPhotoURL = currentAuthManager.photoURL;

    // Define os jogadores iniciais da sala (eu sou o red por padrão ao criar)
    const playersInRoom = {};
    playersInRoom['red'] = {
        id: myId,
        name: myName,
        isAI: false,
        photoURL: myPhotoURL || null
    };

    // Preenche slots restantes com null para saber que esperam jogadores.
    for (let i = 1; i < selectedHumanPlayersCount; i++) {
        const color = LUDO_COLORS[i];
        if (color) { // Garante que temos cores suficientes
            playersInRoom[color] = { id: null, name: `Jogador ${i+1}`, isAI: false, photoURL: null };
        }
    }

    await roomRef.set({
      gameType: 'ludo', // Identifica como jogo de Ludo
      hostId: myId,
      playerCount: selectedHumanPlayersCount,
      playerColors: playersInRoom, // Objeto com slots de cor para os jogadores
      state: engine.serialize(),
      createdAt: Date.now(),
      status: 'waiting'
    });

    // Configura o timer para remover a sala se ninguém entrar
    setTimeout(async () => {
      if (!roomRef) return;
      const snap = await roomRef.once('value');
      if (snap.val() && snap.val().status === 'waiting') {
        await roomRef.remove();
        goLobby();
        showLobbyError('Sua sala expirou por falta de jogadores.');
      }
    }, 600000); // 10 minutos

    gel('display-room-code').textContent = roomCode;
    showScreen('waiting');
    updateWaitingRoomPlayers(playersInRoom);

    // Listener para mudanças na sala
    roomRef.on('value', snap => {
      const data = snap.val();
      if (!data) { // Sala foi removida
        goLobby();
        // showLobbyError('A sala foi encerrada.'); // Pode ser intrusivo
        return;
      }

      if (data.status === 'playing' && data.playerColors[myColor]) {
        // Encontra minha cor e inicia o jogo
        const myPlayerData = data.playerColors[myColor];
        startMultiplayerGame(data);
      } else if (data.status === 'waiting') {
        updateWaitingRoomPlayers(data.playerColors);
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
    const myName = currentPlayer.displayName || currentPlayer.email || 'Jogador';
    const myPhotoURL = currentAuthManager.photoURL;

    // Encontre um slot de cor vazio ou onde eu já esteja
    let foundSlot = false;
    for (const color of LUDO_COLORS) {
        if (!data.playerColors[color] || data.playerColors[color].id === null) {
            myColor = color;
            await roomRef.child('playerColors').child(color).set({
                id: myId,
                name: myName,
                isAI: false,
                photoURL: myPhotoURL || null
            });
            foundSlot = true;
            break;
        } else if (data.playerColors[color].id === myId) {
            // Já estou nesta sala
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

    // Se todos os slots humanos estiverem preenchidos, inicia-se a partida
    const currentHumanPlayers = Object.values(data.playerColors).filter(p => p && !p.isAI && p.id !== null).length;
    if (currentHumanPlayers === data.playerCount) {
        await roomRef.update({ status: 'playing' });
        // O listener na roomRef (já configurado no createGame ou aqui se join for primeiro)
        // vai detectar a mudança de status para 'playing' e iniciar o jogo.
    }

    gel('display-room-code').textContent = roomCode; // Mesmo que ainda esteja 'waiting'
    showScreen('waiting');
    updateWaitingRoomPlayers(data.playerColors);

    roomRef.on('value', snap => {
      const roomData = snap.val();
      if (!roomData) { goLobby(); return; }

      if (roomData.status === 'playing' && roomData.playerColors[myColor]) {
        // Encontra minha cor e inicia o jogo
        startMultiplayerGame(roomData);
      } else if (roomData.status === 'waiting') {
        updateWaitingRoomPlayers(roomData.playerColors);
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
    // Apenas o host pode realmente remover a sala
    if (currentAuthManager.uid === roomRef.child('hostId')) {
      await roomRef.remove().catch(() => {});
    } else {
      // Outros jogadores podem "sair" da sala, limpando seu slot
      if (myColor) {
        await roomRef.child('playerColors').child(myColor).set({ id: null, name: `Jogador ${window.LUDO_CONSTANTS.LUDO_COLORS.indexOf(myColor)+1}`, isAI: false, photoURL: null });
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
    if (fb) { fb.textContent = 'Copiado!'; setTimeout(() => { fb.textContent = ''; }, 2000); }
  });
}

function updateWaitingRoomPlayers(playerColors) {
    const listEl = gel('waiting-players-list');
    const currentPlayersEl = gel('waiting-current-players');
    const maxPlayersEl = gel('waiting-max-players');
    if (!listEl || !currentPlayersEl || !maxPlayersEl) return;

    listEl.innerHTML = '';
    let currentHumanCount = 0;
    const allPlayers = Object.entries(playerColors).map(([color, pData]) => ({ color, ...pData }));

    for (const player of allPlayers) {
        const row = document.createElement('div');
        row.className = 'waiting-player-row';
        const name = player.id ? player.name : `Aguardando ${COLOR_TRANSLATIONS[player.color]}...`;
        row.innerHTML = `
            <div class="player-color-dot" style="background-color: var(--ludo-${player.color});"></div>
            <span>${name} ${player.id === myId ? '(Você)' : ''}</span>
        `;
        listEl.appendChild(row);
        if (player.id !== null && !player.isAI) {
            currentHumanCount++;
        }
    }

    currentPlayersEl.textContent = currentHumanCount;
    maxPlayersEl.textContent = selectedHumanPlayersCount; // Usa o número selecionado no lobby para partida multiplayer
}


async function startMultiplayerGame(roomData) {
  gameMode = 'multiplayer';
  gameActive = true;
  isSpectator = false;

  // Deserializa o estado inicial do jogo
  engine.deserialize(roomData.state);

  // Define myColor se ainda não estiver definido (para spectator ou se join foi o first trigger)
  if (!myColor) {
      for (const color of LUDO_COLORS) {
          if (roomData.playerColors[color] && roomData.playerColors[color].id === myId) {
              myColor = color;
              break;
          }
      }
  }

  // Preenche o array de players do engine com os dados da sala
  const enginePlayers = [];
  for (const color of LUDO_COLORS) {
      if (roomData.playerColors[color]) {
          enginePlayers.push({
              id: roomData.playerColors[color].id,
              name: roomData.playerColors[color].name,
              color: color,
              isAI: roomData.playerColors[color].isAI || false,
              photoURL: roomData.playerColors[color].photoURL || null
          });
      }
  }
  engine.players = enginePlayers; // Atualiza o engine com a lista completa de jogadores

  // Esconder/mostrar botões de controle
  gel('btn-resign').classList.remove('hidden');
  gel('btn-new-game').classList.add('hidden');
  gel('btn-back-lobby').classList.add('hidden');
  gel('spectator-bar').classList.add('hidden');

  showScreen('game');
  renderGame();

  // Listener para atualizações do estado do jogo
  roomRef.on('value', snap => {
    const data = snap.val();
    if (!data) { // Sala foi removida
      goLobby();
      // showLobbyError('A sala foi encerrada.');
      return;
    }

    engine.deserialize(data.state);
    renderGame();

    if (data.status === 'resigned' || data.status === 'abandoned' || data.status === 'finished') {
      roomRef.off();
      gameActive = false;
      let title = 'Partida Encerrada';
      let msg = 'O jogo terminou.';

      if (data.status === 'resigned') {
        const winnerPlayer = engine.players.find(p => p.color === data.winner);
        title = 'Partida Finalizada';
        msg = `${winnerPlayer ? winnerPlayer.name : 'Um jogador'} resignou`;
        if(data.winner === myColor) msg = `Você venceu! Seu oponente desistiu. 🏆`;
        else if(data.winner !== myColor) msg = `Você perdeu. Oponente venceu. ❌`;
      } else if (data.status === 'abandoned') {
        title = 'Partida Abandonada';
        msg = `Um jogador (${data.abandonedPlayerName || 'desconhecido'}) abandonou a partida.`;
        // Se o outro abandonou, eu ganho
        // TODO: Atribuir vitória para quem permanece
      } else if (data.status === 'finished' && engine.winner) {
        const winnerPlayer = engine.players.find(p => p.id === engine.winner);
        title = winnerPlayer.id === myId ? 'Você Venceu! 🏆' : 'Você Perdeu! ❌';
        msg = winnerPlayer.id === myId ? `Parabéns, ${winnerPlayer.name}!` : `Vencedor: ${winnerPlayer.name}. Boa sorte na próxima!`;
      }

      showGameOver(title, msg);
    } else if (!isSpectator && isMyTurn() && engine.phase === 'move' && engine.getValidMoves().length === 0) {
        // Se meu turno, fase de 'move' e sem movimentos válidos, auto-passa o turno
        engine.nextTurn();
        syncGameState();
        renderGame();
    }
  });

  if (roomData.status === 'playing' && engine.activePlayer.isAI) {
    if (engine.activePlayer.id === myId) {
        // AI sou eu. Não deveria acontecer em multiplayer, mas por segurança.
    } else {
        setTimeout(doAITurn, 1500);
    }
  }
}


/* =====================================================
   VS AI LOGIC (LUDO)
===================================================== */
function startAIGame() {
  gameMode = 'ai';
  gameActive = true;
  isSpectator = false;
  myColor = LUDO_COLORS[0]; // Jogador sempre vermelho no modo AI

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
  let aiColors = LUDO_COLORS.slice(1, 1 + selectedAiCount); // Pega as próximas 'selectedAiCount' cores
  for (let i = 0; i < selectedAiCount; i++) {
    playerConfigs.push({
      id: `ai_${aiColors[i]}_${Date.now()}`,
      name: `Computador ${i + 1}`,
      isAI: true,
      color: aiColors[i],
      photoURL: null
    });
  }

  engine.setupGame(playerConfigs); // Configura o jogo com os jogadores (Humano + AI)

  // Atualiza UI dos botões
  gel('btn-resign').classList.remove('hidden');
  gel('btn-new-game').classList.add('hidden');
  gel('btn-back-lobby').classList.add('hidden');
  gel('spectator-bar').classList.add('hidden');

  showScreen('game');
  renderGame();

  if (engine.activePlayer.isAI) {
    setTimeout(doAITurn, 1500); // Se o primeiro turno for da IA, agenda o movimento
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

  // Simula o rolar do dado pela IA
  gel('dice-display').textContent = '🎲';
  await new Promise(resolve => setTimeout(resolve, 800)); // Atraso para rolar

  engine.rollDice();
  renderGame(); // Atualiza o dado e o tabuleiro com o roll da IA

  // Se a IA rolou e não há movimentos válidos (raro, mas possível), ela passa o turno
  if (engine.phase === 'move' && engine.getValidMoves().length === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Pequeno delay
      engine.nextTurn();
      aiThinking = false;
      renderGame();
      // Se o próximo jogador for humano, ele rolará o dado. Se for outra IA, agendar.
      if (engine.activePlayer.isAI) setTimeout(doAITurn, 1500);
      return;
  }

  if (engine.phase === 'move') {
      aiThinking = true;
      renderStatusBar(); // Ainda "pensando" para decidir o movimento

      // Determina o atraso para o movimento da IA com base na "dificuldade" (simulada)
      // No Ludo, a AI é mais sobre velocidade do que complexidade da escolha.
      const delay = 1000 + (Math.random() * 500); // 1 a 1.5 segundos
      await new Promise(resolve => setTimeout(resolve, delay));

      const pawnIndexToMove = ai.getBestMove(engine);

      if (pawnIndexToMove !== null) {
          engine.doMovePawn(pawnIndexToMove);
          aiThinking = false;
          renderGame();

          if (engine.status === 'playing') {
            if (engine.activePlayer.isAI) {
                // Se o turno continua com a IA (pq rolou 6, capturou, ou chegou em casa)
                setTimeout(doAITurn, 1500);
            }
          }
      } else {
        // Não deveria chegar aqui se getValidMoves() já verificou, mas por segurança.
        console.warn('AI não encontrou um movimento válido após rolar o dado.');
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

    isSpectator = true; roomCode = code; myColor = null; // Spectator não tem "myColor"
    engine.deserialize(data.state);

    // Preenche o array de players do engine com os dados da sala para exibir no sidebar
    const enginePlayers = [];
    for (const color of LUDO_COLORS) {
        if (data.playerColors[color]) {
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
    renderGame();
    // Esconde botões de ação para o espectador
    gel('btn-resign').classList.add('hidden');
    gel('btn-new-game').classList.add('hidden');
    gel('btn-back-lobby').classList.remove('hidden'); // Botão pra voltar pro lobby
    gel('spectator-bar').classList.remove('hidden'); // Mostra barra de espectador

    specRef = db.ref('rooms/' + code);
    specRef.on('value', snap => {
      const d = snap.val();
      if (!d) { // Sala removida
        specRef.off();
        goLobby();
        return;
      }
      engine.deserialize(d.state);
      // Atualiza a lista de players no engine caso entre/saia alguém
      const updatedEnginePlayers = [];
      for (const color of LUDO_COLORS) {
          if (d.playerColors[color]) {
              updatedEnginePlayers.push({
                  id: d.playerColors[color].id,
                  name: d.playerColors[color].name,
                  color: color,
                  isAI: d.playerColors[color].isAI || false,
                  photoURL: d.playerColors[color].photoURL || null
              });
          }
      }
      engine.players = updatedEnginePlayers; // Atualiza aqui também
      renderGame();

      if (d.status === 'finished' || d.status === 'resigned' || d.status === 'abandoned') {
        gel('spectator-bar').textContent = '👁 Partida encerrada.';
        specRef.off();
      } else {
        gel('spectator-bar').textContent = `👁 Assistindo — Vez de ${engine.activePlayer.name} (${COLOR_TRANSLATIONS[engine.activePlayer.color]})`;
      }
    });

  } catch (e) {
    showLobbyError('Erro ao conectar como espectador: ' + e.message);
  }
}


/* =====================================================
   GAME OVER / RESIGN
===================================================== */
/**
 * Desiste da partida atual.
 */
async function resign() {
  if (!gameActive || isSpectator || !isMyTurn()) return;
  if (!confirm('Tem certeza que deseja desistir da partida?')) return;

  gameActive = false;
  aiThinking = false;

  let winningPlayer = null;
  // Encontra o jogador que não desistiu e não é a IA (se houver outro humano)
  const otherHumanPlayers = engine.players.filter(p => p.id !== myId && !p.isAI);
  if (otherHumanPlayers.length > 0) {
      winningPlayer = otherHumanPlayers[0];
  } else {
      // Se não há outros humanos, o vencedor é a IA, ou mesmo "ninguém" se só havia o jogador.
      // Neste caso, se a IA estava jogando, ela "ganha" o ponto da desistência.
      const aiPlayers = engine.players.filter(p => p.isAI);
      if (aiPlayers.length > 0) {
          winningPlayer = aiPlayers[0];
      } else {
          // Cenário raro: só um jogador humano, e ele desiste.
          winningPlayer = { color: 'neutral', name: 'Ninguém' }; // Ou o próprio player desistiu para si mesmo rs
      }
  }

  // Define o resultado final do engine para salvamento no histórico
  engine.winner = winningPlayer.id; // Define o vencedor
  engine.status = 'resigned'; // Marca como resignado
  engine.logEvent(myColor, `${currentAuthManager.displayName} desistiu da partida.`);


  if (gameMode === 'multiplayer' && roomRef) {
    await roomRef.update({
      status: 'resigned',
      winner: winningPlayer.color, // Salva a cor do vencedor
      state: engine.serialize()
    }).catch(e => console.error('Erro ao atualizar sala para resignação:', e));
    roomRef.off(); // Desliga o listener da sala.
    roomRef = null;
  }

  // Salva o jogo como "loss" por resignação
  await historyManager.saveGame({
    gameType: 'ludo',
    uid: currentAuthManager.uid,
    isAnonymous: currentAuthManager.isAnonymous,
    mode: gameMode,
    players: engine.players.map(p => ({ id: p.id, name: p.name, color: p.color, isAI: p.isAI, photoURL: p.photoURL })),
    myColor: myColor,
    result: 'loss',
    endedAt: Date.now(),
  });

  const winnerNameDisplay = (winningPlayer.id === myId) ? 'Você' : winningPlayer.name;
    const gameOverTitle = (winningPlayer.id === myId) ? 'Você Venceu! 🏆' : 'Você Desistiu! 🏳️';
    const gameOverMsg = (winningPlayer.id === myId) ? 'Seu oponente desistiu.' : `Vitória para ${winnerNameDisplay}!`;

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
      : title.includes('Desistiu') ? '🏳️' : '🎲'; // Ícone padrão para outros fins de jogo
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
      // cell.style.gridRow = (r + 1); // CSS Grid lida com isso automaticamente
      // cell.style.gridColumn = (c + 1); // CSS Grid lida com isso automaticamente

      // Adiciona classes de zona e segurança
      const zone = getCellZone(r, c);
      if (zone) cell.classList.add('zone-' + zone);

      // Verifica se a célula é uma casa segura no caminho principal
      // Precisa iterar sobre PATH_COORDS para encontrar o índice
      const pathIdx = window.LUDO_CONSTANTS.PATH_COORDS.findIndex(coord => coord[0] === r && coord[1] === c);
      if (pathIdx !== -1 && window.LUDO_CONSTANTS.SAFE_SQUARES.includes(pathIdx)) {
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
function getCellZone(r, c) {
  // Bases (6x6 da borda)
  if (r >=0 && r <=5 && c >=0 && c <=5) return 'red'; // Top-left
  if (r >=0 && r <=5 && c >=9 && c <=14) return 'blue'; // Top-right
  if (r >=9 && r <=14 && c >=9 && c <=14) return 'green'; // Bottom-right
  if (r >=9 && r <=14 && c >=0 && c <=5) return 'yellow'; // Bottom-left

  // Centro (3x3)
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return 'center';

  // Corredores finais (Home Paths, 6 casas de cada cor)
  // Vermelho: (7,1) -> (7,6)
  if (r === 7 && c >= 1 && c <= 6) return 'red';
  // Azul: (1,7) -> (6,7)
  if (c === 7 && r >= 1 && r <= 6) return 'blue';
  // Verde: (7,13) -> (7,8) (ordem reversa)
  if (r === 7 && c >= 8 && c <= 13) return 'green';
  // Amarelo: (13,7) -> (8,7) (ordem reversa)
  if (c === 7 && r >= 8 && r <= 13) return 'yellow';

  return 'neutral'; // Trilhas neutras do caminho principal
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
  // Remove todos os peões existentes do DOM antes de redesenhar
  document.querySelectorAll('.pawn').forEach(p => p.remove());

  engine.players.forEach((player) => {
    player.pawns.forEach((pawn, pawnIdx) => {
      let coords = null;
      let finalPositionType = ''; // 'base', 'path', 'homepath', 'finished'

      if (pawn.finished) {
          // Para peões finalizados, não renderizamos no tabuleiro.
          return;
      } else if (pawn.pos === -1) {
          // Peça na base
          coords = window.LUDO_CONSTANTS.BASE_POSITIONS[player.color]?.[pawnIdx];
          finalPositionType = 'base';
      } else if (pawn.homeStep !== -1) {
          // Peça no corredor final (home path)
          coords = window.LUDO_CONSTANTS.HOME_PATHS[player.color]?.[pawn.homeStep];
          finalPositionType = 'homepath';
      } else {
          // Peça no tabuleiro principal (path_coords)
          coords = window.LUDO_CONSTANTS.PATH_COORDS[pawn.pos];
          finalPositionType = 'path';
      }

      if (!coords || !BOARD_CELLS_DOM[coords[0]] || !BOARD_CELLS_DOM[coords[0]][coords[1]]) {
        // console.warn(`Coordenadas inválidas para peão ${player.color}-${pawnIdx} na posição ${pawn.pos}/${pawn.homeStep}.`);
        return; // Não renderiza se as coordenadas forem inválidas
      }

      const cellElement = BOARD_CELLS_DOM[coords[0]][coords[1]];
      if (!cellElement) {
        // console.warn(`Elemento da célula DOM não encontrado para ${coords[0]},${coords[1]}`);
        return; // Não renderiza se o elemento da célula não for encontrado
      }

      const pawnEl = document.createElement('div');
      pawnEl.className = `pawn ${player.color}`;
      pawnEl.dataset.playerColor = player.color;
      pawnEl.dataset.pawnIdx = pawnIdx;
      pawnEl.textContent = PIECES_SYMBOLS[player.color]; // Mostra o símbolo da peça

      // Adiciona classe de "movable" se for a vez do jogador e a peça puder mover
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
    // Adiciona "Você" ou "IA" ao nome para clara identificação
    if (player.id === currentAuthManager.uid) playerNameDisplay += ' (Você)';
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
        <span class="player-score">${player.score} / ${window.LUDO_CONSTANTS.PIECES_PER_PLAYER}</span>
        <div class="ludo-score-indicator" data-color="${player.color}">
          <!-- Peões na base serão renderizados aqui como dots -->
        </div>
      </div>
    `;

    // Renderiza os "dots" para peões na base ou perto de sair
    const scoreIndicator = card.querySelector('.ludo-score-indicator');
    if (scoreIndicator) {
      player.pawns.forEach(pawn => {
        if (!pawn.finished) {
          const dot = document.createElement('span');
          dot.className = 'pawn-on-base-dot';
          if (pawn.pos === -1 && engine.diceValue === 6) { // Se o 6 rolou e a peça está na base, ela está "ready"
            dot.classList.add('ready');
          } else if (pawn.pos !== -1 || pawn.homeStep !== -1) {
            dot.style.backgroundColor = `var(--ludo-${player.color})`; // Peça já saiu.
          }
          scoreIndicator.appendChild(dot);
        }
      });
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
  btnRoll.classList.remove('hidden'); // Garante que o botão de rolar dado está visível por padrão
  btnRoll.disabled = false; // Por padrão, btn de rolar habilitado

  const activePlayer = engine.activePlayer;
  const isMyTurnNow = isMyTurn();

  if (isSpectator) {
    bar.textContent = `👁 Assistindo — Vez de ${activePlayer.name} (${COLOR_TRANSLATIONS[activePlayer.color]})`;
    btnRoll.classList.add('hidden'); // Esconde o botão de rolar para espectadores
    return;
  }
  if (aiThinking) {
    bar.innerHTML = `Computador (${activePlayer.name}) pensando <span class="thinking-dots"><span></span><span></span><span></span></span>`;
    btnRoll.disabled = true;
    return;
  }

  if (engine.status === 'finished') {
    bar.textContent = `Partida encerrada! Vencedor: ${activePlayer.name} (${COLOR_TRANSLATIONS[activePlayer.color]}) 🏆`;
    bar.classList.remove('your-turn');
    btnRoll.classList.add('hidden'); // Esconde o botão de rolar ao final do jogo
  } else if (isMyTurnNow) {
    if (engine.phase === 'roll') {
      bar.textContent = `Sua vez (${COLOR_TRANSLATIONS[myColor]}) — Role o dado!`;
      bar.classList.add('your-turn');
    } else { // phase === 'move'
      btnRoll.disabled = true; // Desabilita roll após rolar
      // Verifica se há movimentos válidos. Se não, avisa e passa o turno.
      const validMovesAvailable = engine.getValidMoves().length > 0;
      if (!validMovesAvailable && engine.diceValue > 0) {
        bar.textContent = `Sua vez (${COLOR_TRANSLATIONS[myColor]}) — Sem movimentos válidos para dado ${engine.diceValue}.`;
        // O `onRollDiceClick` já lida com a passagem de turno automática se não houver moves
      } else {
        bar.textContent = `Sua vez (${COLOR_TRANSLATIONS[myColor]}) — Escolha uma peça para mover ${engine.diceValue} casas.`;
      }
      bar.classList.add('your-turn');
    }
  } else {
    // Vez de outro jogador (humano ou IA que ainda não começou o turno)
    bar.textContent = `Vez de ${activePlayer.name} (${COLOR_TRANSLATIONS[activePlayer.color]})`;
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
    // Empates são raros no Ludo, mas se tiver, conte aqui
    const draws = games.filter(g => g.result === 'draw').length;

    if (statsEl) statsEl.innerHTML =
      `<span class="stat stat-win">🏆 Vitórias: ${wins}</span> ` +
      `<span class="stat stat-loss">❌ Derrotas: ${losses}</span> ` +
      `<span class="stat stat-draw">🤝 Empates: ${draws}</span>`;

    if (listEl) listEl.innerHTML = '';
    games.forEach(game => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const resClassMap = { win: 'result-win', loss: 'result-loss', draw: 'result-draw', resigned: 'result-loss' };
      const resTextMap = { win: 'Vitória 🏆', loss: 'Derrota ❌', draw: 'Empate 🤝', resigned: 'Desistência 🏳️' };
      const resClass = resClassMap[game.result] || '';
      const resText = resTextMap[game.result] || game.result;

      // Obtém o nome dos oponentes
      let opponentDisplayNames = game.players
        .filter(p => !p.isMe && !p.isAI)
        .map(p => escapeHtml(p.name));
      let aiOpponentCount = game.players.filter(p => p.isAI).length;

      let opponentDisplay = '';
      if (opponentDisplayNames.length > 0) {
        opponentDisplay = 'vs ' + opponentDisplayNames.join(', ');
      }
      if (aiOpponentCount > 0) {
        opponentDisplay += (opponentDisplayNames.length > 0 ? ' + ' : 'vs ') + `${aiOpponentCount} IA(s)`;
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
    if (listEl) listEl.innerHTML = '<div class="history-empty">Erro ao carregar histórico.</div>';
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