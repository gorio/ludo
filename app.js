/* =====================================================
   CONFIGURAÇÃO FIREBASE E VARIÁVEIS GLOBAIS
===================================================== */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCa0WmUo1PIlYW6Ei8ZZK3XLZ4i0gIfo", // SUBSTITUA PELA SUA CHAVE REAL!
  authDomain:        "golf-oscar-romeo.firebaseapp.com",
  projectId:         "golf-oscar-romeo",
  storageBucket:     "golf-oscar-romeo.firebasestorage.app",
  databaseURL:       "https://golf-oscar-romeo-default-rtdb.firebaseio.com",
  messagingSenderId: "71631208569",
  appId:             "1:71631208569:web:e7a1cc7ad20903ce5ad4a8"
};

// Variáveis de estado do aplicativo
let db, firebaseApp; // Instâncias do Firebase DB e App
let currentAuthManager;  // Instância de AuthManager (disponível globalmente)
let historyManager;      // Instância de HistoryManager (disponível globalmente)
let engine;              // Instância de LudoEngine (disponível globalmente)
let ai;                  // Instância de LudoAI (disponível globalmente)

// Variáveis de estado do jogo LUDO
let myId = 'guest_' + Math.random().toString(36).slice(2, 8); // ID temporário para visitantes
let myColor = null;           // Cor do jogador atual na partida (ex: 'red', 'blue')
let gameActive = false;       // Indica se uma partida de Ludo está em andamento
let gameMode = 'ai';          // 'ai' ou 'multiplayer'
let aiThinking = false;       // Indica se a IA está pensando/jogando
let isSpectator = false;      // Indica se o usuário é espectador de uma partida

// Variáveis para Multiplayer
let roomCode = null;        // Código da sala atual
let roomRef = null;         // Referência do Firebase para a sala
let specRef = null;         // Referência do Firebase para espectadores (pode ser a mesma de roomRef)
let selectedHumanPlayersCount = 2; // Padrão para multiplayer (2-4)
let selectedAiCount = 1;      // Padrão para partidas contra AI (1-3)

// Variáveis para Replay (do Xadrez, se mantidas)
// Mantidas como placeholders, o Ludo não terá um replay "passo-a-passo" complexo por enquanto.
let replayMoves = [];
let replayTarget = 0;
let replayEngine = null;
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
  // Encontre o elemento. `gel` (getElementById) é mais eficiente que querySelector.
  const element = gel(id);
  if (element) {
    element.addEventListener(event, handler);
    // console.log(`Evento '${event}' anexado a #${id}.`); // Debugging: remover em produção
  } else {
    // Console.warn para IDs não encontrados, para ajudar a depurar HTML e JS.
    console.warn(`Elemento com ID '${id}' não encontrado para anexar evento '${event}'.`);
  }
}

/**
 * Escapa HTML para prevenir ataques XSS.
 * @param {string} str A string a ser escapada.
 * @returns {string} A string escapada.
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

/* =====================================================
   BOOTSTRAP DO APLICATIVO
===================================================== */
window.addEventListener('DOMContentLoaded', function() {
  console.log('DOMContentLoaded - Iniciando App.');
  try {
    // 1. Inicializa Firebase App e serviços
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    db = firebaseApp.database();
    console.log('Firebase inicializado.');

    // 2. Instancia os Managers e Engines
    currentAuthManager = new AuthManager();
    currentAuthManager.initialize(firebaseApp); // Passa firebaseApp para o AuthManager
    historyManager = new HistoryManager(db);   // Passa a instância do DB para o HistoryManager
    engine = new LudoEngine();
    ai = new LudoAI();
    console.log('Managers e Engines instanciados.');

    // 3. Inicializa event listeners da UI
    initAuthUI();
    initLobbyUI();
    initGameUI();
    initLudoHistoryLiveUI(); // Histórico e Live Games do Ludo

    // Não há initReplayUI no Ludo, pois não temos replay de xadrez mais.

    // 4. Constrói o DOM do tabuleiro Ludo uma única vez
    console.log('Construindo DOM do tabuleiro Ludo...');
    buildBoardDOM();

    // 5. Observa mudanças de estado de autenticação para navegar entre telas
    currentAuthManager.onUserChanged(user => {
      console.log('AuthManager - onUserChanged:', user ? user.uid : 'Nenhum usuário');
      updateHeaderUI(user); // Atualiza o cabeçalho sempre que o user muda

      myId = user ? user.uid : 'guest_' + Math.random().toString(36).slice(2, 8);

      if (user) {
        // Se já estou em alguma sala, não mudo para o lobby imediatamente.
        // A lógica de startMultiplayerGame ou spectateGame deve gerenciar isso.
        // caso contrário, vai para o lobby.
        if (!gameActive && !isSpectator) {
          showScreen('lobby');
          gel('app-header').classList.remove('hidden'); // Mostra o header se logado
        }
      } else {
        // Se deslogou, ou não há usuário, sempre vai para a tela de autenticação
        // E esconde o header
        showScreen('auth');
        gel('app-header').classList.add('hidden');
        goLobby(); // Garante reset do estado do jogo ao deslogar
      }
    });

  } catch (e) {
    console.error('Erro crítico na inicialização do App:', e);
    alert('Erro crítico ao iniciar o aplicativo: ' + e.message + '. Verifique o console para mais detalhes.');
  }
});

/* =====================================================
   AUTENTICAÇÃO (UI e Lógica)
===================================================== */

// Helper para display de erros de autenticação
function showAuthError(msg) {
  const e = gel('auth-error');
  if (e) e.textContent = msg;
}
function clearAuthError() {
  const e = gel('auth-error');
  if (e) e.textContent = '';
}

// Mapeamento de códigos de erro de autenticação para mensagens amigáveis
function authErrorMsg(code) {
  const msgs = {
    'auth/user-not-found': 'Usuário não encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/email-already-in-use': 'E-mail já cadastrado.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres).',
    'auth/operation-not-allowed': 'Autenticação com e-mail/senha não habilitada. Contate o administrador.',
    'auth/network-request-failed': 'Erro de rede. Verifique sua conexão.',
    'auth/popup-closed-by-user': 'Login cancelado pelo usuário.',
    'auth/too-many-requests': 'Muitas tentativas de login. Tente novamente mais tarde.',
  };
  return msgs[code] || `Erro ao autenticar: ${code}`;
}

/**
 * Inicializa os event listeners para a UI de autenticação.
 */
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
    try { await currentAuthManager.loginWithEmail(email, pass); }
    catch (e) { showAuthError(authErrorMsg(e.code)); }
  });

  el('login-password', 'keydown', e => {
    if (e.key === 'Enter') {
      gel('btn-login-email').click();
    }
  });

  el('btn-login-google', 'click', async () => {
    try { await currentAuthManager.loginWithGoogle(); }
    catch (e) { showAuthError(authErrorMsg(e.code)); }
  });

  el('btn-register', 'click', async () => {
    const name = gel('reg-name').value.trim();
    const email = gel('reg-email').value.trim();
    const pass = gel('reg-password').value;
    if (!name) { showAuthError('Informe seu nome.'); return; }
    if (!email) { showAuthError('Informe seu e-mail.'); return; }
    if (pass.length < 6) { showAuthError('Senha mínima de 6 caracteres.'); return; }
    try { await currentAuthManager.registerWithEmail(name, email, pass); }
    catch (e) { showAuthError(authErrorMsg(e.code)); }
  });

  el('btn-guest', 'click', async () => {
    try { await currentAuthManager.loginAnonymously(); }
    catch (e) { showAuthError(authErrorMsg(e.code)); }
  });
}

/**
 * Atualiza os elementos da UI do cabeçalho com informações do usuário.
 * @param {object} user Objeto do usuário do Firebase.
 */
function updateHeaderUI(user) {
  const headerUsername = gel('header-username');
  const headerPhoto = gel('header-photo');
  const headerInitials = gel('header-initials');
  const appHeader = gel('app-header');

  if (user) {
    const name = user.displayName || (user.email ? user.email.split('@')[0] : 'Jogador');
    const photoURL = user.photoURL;

    if (headerUsername) headerUsername.textContent = name;

    if (headerPhoto && headerInitials) {
      if (photoURL) {
        headerPhoto.src = photoURL;
        headerPhoto.classList.remove('hidden');
        headerInitials.classList.add('hidden');
      } else {
        headerPhoto.classList.add('hidden');
        headerInitials.classList.remove('hidden');
        headerInitials.textContent = name.split(' ').map(w => w[0] ? w[0].toUpperCase() : '').join('').substring(0, 2) || '?';
      }
    }
    appHeader.classList.remove('hidden'); // Mostra o header se houver usuário
  } else {
    // Usuário deslogado
    if (headerUsername) headerUsername.textContent = 'Visitante'; // Ou texto padrão
    if (headerPhoto) headerPhoto.classList.add('hidden');
    if (headerInitials) {
      headerInitials.classList.remove('hidden');
      headerInitials.textContent = '?';
    }
    appHeader.classList.add('hidden'); // Esconde o header se não houver usuário
  }
}

/* =====================================================
   NAVEGAÇÃO E TELAS (UI)
===================================================== */

/**
 * Exibe a tela especificada e oculta todas as outras.
 * @param {string} name O ID da tela (ex: 'auth', 'lobby', 'game').
 */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); // Oculta todas
  const targetScreen = gel('screen-' + name);
  if (targetScreen) {
    targetScreen.classList.add('active'); // Exibe a tela alvo
    // console.log(`Exibindo tela: ${name}`); // Debugging
  } else {
    console.error(`Tela com ID 'screen-${name}' não encontrada.`);
  }
}

/**
 * Exibe um modal.
 * @param {string} id O ID do modal.
 */
function showModal(id) {
  const e = gel(id);
  if (e) e.classList.remove('hidden');
}

/**
 * Oculta um modal.
 * @param {string} id O ID do modal.
 */
function hideModal(id) {
  const e = gel(id);
  if (e) e.classList.add('hidden');
}

/**
 * Volta para a tela principal (lobby) e reseta o estado do jogo.
 */
function goLobby() {
  console.log('Navegando para o Lobby, resetando estado do jogo.');
  // Reseta todas as variáveis de estado do jogo
  gameActive = false;
  aiThinking = false;
  isSpectator = false;
  myColor = null;
  roomCode = null;

  // Desativa listeners do Firebase
  if (roomRef) { roomRef.off(); roomRef = null; }
  if (specRef) { specRef.off(); specRef = null; }

  engine.reset(); // Reseta o motor do jogo Ludo

  // Limpa inputs e feedback no lobby
  const inputRoom = gel('input-room');
  const inputSpectate = gel('input-spectate');
  if (inputRoom) inputRoom.value = '';
  if (inputSpectate) inputSpectate.value = '';
  clearLobbyError();

  showScreen('lobby');
}

// Mostra/Limpa erros no lobby
function showLobbyError(msg) {
  const e = gel('lobby-error');
  if (e) e.textContent = msg;
}
function clearLobbyError() {
  const e = gel('lobby-error');
  if (e) e.textContent = '';
}

/* =====================================================
   LOBBY (UI e Lógica)
===================================================== */

/**
 * Inicializa os event listeners para a UI do lobby.
 */
function initLobbyUI() {
  el('btn-logout', 'click', () => currentAuthManager.signOut());

  // Navegação para Histórico/Ao Vivo
  el('btn-history-ludo', 'click', openHistoryScreen);
  el('btn-live-games-ludo', 'click', openLiveGamesScreen);

  // Seleção de Modo de Jogo (AI vs Multiplayer)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameMode = btn.dataset.mode;
      gel('panel-multiplayer').classList.toggle('hidden', gameMode !== 'multiplayer');
      gel('panel-ai').classList.toggle('hidden', gameMode !== 'ai');
      clearLobbyError();
    });
  });

  // Multiplayer: Criação e Entrada de Sala
  el('btn-create-room', 'click', createGame);
  el('btn-join-room', 'click', joinGame);
  el('input-room', 'keydown', e => { if (e.key === 'Enter') joinGame(); });

  // Multiplayer: Seleção de # de Jogadores Humanos para Criar Sala
  document.querySelectorAll('#lobby-player-count .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedHumanPlayersCount = parseInt(btn.dataset.count);
      document.querySelectorAll('#lobby-player-count .btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // VS AI: Seleção de # de IAs
  document.querySelectorAll('#lobby-ai-count .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedAiCount = parseInt(btn.dataset.count);
      // Remove 'active' de todos os botões e adiciona ao clicado
      document.querySelectorAll('#lobby-ai-count .btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  el('btn-start-ai-game', 'click', startAIGame); // Botão para iniciar jogo contra IA

  // Waiting Room Botoes
  el('btn-cancel-game', 'click', cancelGame);
  el('btn-copy-room-code', 'click', copyRoomCode);
  el('btn-start-multiplayer-game-host', 'click', startGameAsHost); // Botão que só o host vê

  // Espectador
  el('btn-spectate-room', 'click', spectateGame);
  el('input-spectate', 'keydown', e => { if (e.key === 'Enter') spectateGame(); });
}

/**
 * Cria uma nova sala multiplayer.
 */
async function createGame() {
  if (!currentAuthManager.uid || currentAuthManager.isAnonymous) {
      showLobbyError('Faça login ou entre como visitante para criar um jogo. Visitantes também podem criar.');
      return;
  }

  const btn = gel('btn-create-room');
  if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }
  clearLobbyError();

  try {
    roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    roomRef = db.ref('rooms/' + roomCode);

    const currentPlayer = currentAuthManager.user;
    const myName = currentPlayer.displayName || (currentPlayer.email ? currentPlayer.email.split('@')[0] : 'Jogador');
    const myPhotoURL = currentAuthManager.photoURL;

    // Inicializa o mapa de jogadores com o host
    const playerColors = {};
    const availableLudoColors = [...window.LUDO_CONSTANTS.LUDO_COLORS];

    // O host sempre pega a primeira cor disponível (vermelho por padrão)
    myColor = availableLudoColors.shift();
    playerColors[myColor] = { id: myId, name: myName, isAI: false, photoURL: myPhotoURL || null };

    // Adiciona slots vazios para o número de jogadores humanos esperado pelo host
    for (let i = 1; i < selectedHumanPlayersCount; i++) {
        const nextColor = availableLudoColors.shift();
        if(!nextColor) break;
        playerColors[nextColor] = {
            id: null,
            name: `Aguardando ${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[nextColor]}`,
            isAI: false,
            photoURL: null
        };
    }
    // Preenche o restante dos slots até 4 (se houver) com IAs.
    // Isso garante que a sala tenha sempre 4 slots, mesmo que nem todos sejam humanos.
    let aiPlayersAdded = 0;
    while (Object.keys(playerColors).length < 4 && availableLudoColors.length > 0) {
        const nextColor = availableLudoColors.shift();
        playerColors[nextColor] = {
            id: `ai_${nextColor}_${Date.now()}_${aiPlayersAdded}`,
            name: `Computador ${aiPlayersAdded + 1}`,
            isAI: true,
            photoURL: null
        };
        aiPlayersAdded++;
    }

    engine.reset(); // Assegura que o engine está limpo antes de serializar o estado inicial
    engine.setupGame(Object.values(playerColors).map(p => ({
        id: p.id,
        name: p.name,
        isAI: p.isAI,
        color: p.color,
        photoURL: p.photoURL
    }))); // Configura um engine local para gerar o estado inicial

    const initialGameState = engine.serialize(); // Estado inicial do tabuleiro Ludo

    await roomRef.set({
      roomCode: roomCode,
      gameType: 'ludo',
      hostUid: myId,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      expectedHumanPlayers: selectedHumanPlayersCount, // Número REAL de humanos que o host espera
      status: 'waiting', // waiting, playing, finished, resigned, abandoned
      playerColors: playerColors, // Mapa de cores para dados dos jogadores e IAs
      state: initialGameState,
      log: []
    });

    gel('display-room-code').textContent = roomCode;
    showScreen('waiting');
    updateWaitingRoomPlayers(playerColors); // Exibe os jogadores iniciais na sala de espera

    // Inicia a observação da sala para o host
    roomRef.on('value', snap => {
      const roomData = snap.val();
      if (!roomData) { // Sala foi removida (ex: host clicou em Cancelar)
        roomRef.off();
        goLobby(); // Volta para o lobby
        showLobbyError('A sala foi encerrada.');
        return;
      }

      // Se o status da sala mudar para "playing" e eu sou um jogador...
      if (roomData.status === 'playing' && roomData.playerColors[myColor] && roomData.playerColors[myColor].id === myId) {
        startMultiplayerGame(roomData); // Inicia o jogo multiplayer
      } else if (roomData.status === 'waiting') {
        updateWaitingRoomPlayers(roomData.playerColors);
      }
    });

  } catch (e) {
    showLobbyError('Erro ao criar sala: ' + e.message);
    console.error('Erro ao criar sala:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Criar Nova Sala'; }
  }
}

/**
 * Entra em uma sala multiplayer existente.
 */
async function joinGame() {
  if (!currentAuthManager.uid || currentAuthManager.isAnonymous) {
      showLobbyError('Faça login ou entre como visitante para entrar em um jogo. Visitantes também podem entrar.');
      return;
  }

  const input = gel('input-room');
  const code = input ? input.value.trim().toUpperCase() : '';
  clearLobbyError();
  if (code.length !== 6) { showLobbyError('Código deve ter 6 caracteres.'); return; }

  const btn = gel('btn-join-room');
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
    const myName = currentPlayer.displayName || (currentPlayer.email ? currentPlayer.email.split('@')[0] : 'Jogador');
    const myPhotoURL = currentAuthManager.photoURL;

    // Encontra um slot de cor vazio ou onde eu já esteja
    let foundSlot = false;
    for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
        if (!data.playerColors[color] || data.playerColors[color].id === null) {
            myColor = color;
            await roomRef.child('playerColors').child(color).set({ // Ocupa o slot
                id: myId,
                name: myName,
                isAI: false,
                photoURL: myPhotoURL || null
            });
            foundSlot = true;
            break;
        } else if (data.playerColors[color].id === myId) { // Já estou na sala, reentrando
            myColor = color;
            foundSlot = true;
            break;
        }
    }

    if (!foundSlot) {
        showLobbyError('Sala cheia. Não há vagas para jogadores humanos.');
        roomRef = null;
        return;
    }

    gel('display-room-code').textContent = code;
    showScreen('waiting');
    updateWaitingRoomPlayers(data.playerColors);

    roomRef.on('value', snap => {
      const roomData = snap.val();
      if (!roomData) {
        roomRef.off();
        goLobby();
        showLobbyError('A sala foi encerrada.');
        return;
      }

      if (roomData.status === 'playing' && roomData.playerColors[myColor] && roomData.playerColors[myColor].id === myId) {
        startMultiplayerGame(roomData); // Inicia o jogo multiplayer
      } else if (roomData.status === 'waiting') {
        updateWaitingRoomPlayers(roomData.playerColors);
      }
    });

  } catch (e) {
    showLobbyError('Erro ao entrar na sala: ' + e.message);
    console.error('Erro ao entrar na sala:', e);
    roomRef = null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar na Sala'; }
  }
}

/**
 * Cancela a sala atual (se for o host) ou sai dela (se for jogador).
 */
async function cancelGame() {
  if (!roomRef) { goLobby(); return; }

  try {
    const snap = await roomRef.once('value');
    const data = snap.val();

    if (data && data.hostUid === currentAuthManager.uid) {
      // Se sou o host, remove a sala completamente
      await roomRef.remove();
      console.log('Sala removida pelo host.');
    } else if (myColor) {
      // Se não sou o host, mas sou um jogador, libero meu slot de cor
      const emptyPlayerSlot = { id: null, name: `Aguardando ${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[myColor]}`, isAI: false, photoURL: null };
      await roomRef.child('playerColors').child(myColor).set(emptyPlayerSlot);
      console.log(`Jogador ${myColor} saiu da sala.`);
    }
  } catch (e) {
    console.error('Erro ao cancelar/sair da sala:', e);
  } finally {
    if (roomRef) { roomRef.off(); roomRef = null; } // Desliga o listener
    goLobby(); // Volta para o lobby
  }
}

/**
 * Copia o código da sala para a área de transferência.
 */
function copyRoomCode() {
  if (roomCode) {
    navigator.clipboard.writeText(roomCode).then(() => {
      const fb = gel('copy-feedback');
      if (fb) { fb.textContent = 'Copiado!'; setTimeout(() => { fb.textContent = ''; }, 2000); }
    }).catch(err => {
      console.error('Erro ao copiar:', err);
      const fb = gel('copy-feedback');
      if (fb) { fb.textContent = 'Erro ao copiar!'; }
    });
  }
}

/**
 * Atualiza a lista de jogadores na tela de espera e o botão de "Iniciar Partida".
 * @param {object} playerColors Objeto contendo os dados dos jogadores por cor.
 */
async function updateWaitingRoomPlayers(playerColors) {
    const listEl = gel('waiting-players-list');
    const currentPlayersEl = gel('waiting-current-players');
    const maxPlayersEl = gel('waiting-max-players');
    const btnStartGameHost = gel('btn-start-multiplayer-game-host');

    if (!listEl || !currentPlayersEl || !maxPlayersEl || !btnStartGameHost) return;

    listEl.innerHTML = '';
    let currentHumanCount = 0;
    const allPlayers = Object.entries(playerColors)
      .map(([color, pData]) => ({ color, ...pData }))
      .sort((a,b) => window.LUDO_CONSTANTS.LUDO_COLORS.indexOf(a.color) - window.LUDO_CONSTANTS.LUDO_COLORS.indexOf(b.color)); // Garante ordem das cores

    for (const player of allPlayers) {
        const row = document.createElement('div');
        row.className = 'waiting-player-row';
        const nameDisplay = player.id
            ? (player.isAI ? `Computador (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[player.color]})` : escapeHtml(player.name))
            : `Aguardando ${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[player.color]}`;
        row.innerHTML = `
            <div class="player-color-dot" style="background-color: var(--ludo-${player.color});"></div>
            <span>${nameDisplay} ${player.id === currentAuthManager.uid ? '(Você)' : ''}</span>
        `;
        listEl.appendChild(row);
        if (player.id !== null && !player.isAI) {
            currentHumanCount++;
        }
    }

    const snap = await roomRef.once('value');
    const data = snap.val();

    let expectedHumans = data ? data.expectedHumanPlayers : 2; // Padrão 2 se não conseguir ler

    currentPlayersEl.textContent = currentHumanCount;
    maxPlayersEl.textContent = expectedHumans;

    // Apenas o host pode ver e clicar no botão "Iniciar Partida"
    if (data && data.hostUid === currentAuthManager.uid) {
        // Habilita o botão se houver pelo menos 2 jogadores humanos
        if (currentHumanCount >= 2 && currentHumanCount <= expectedHumans) {
            btnStartGameHost.classList.remove('hidden');
            btnStartGameHost.disabled = false;
        } else {
            btnStartGameHost.classList.remove('hidden'); // Ainda visível para o host, mas desabilitado
            btnStartGameHost.disabled = true;
        }
    } else {
        btnStartGameHost.classList.add('hidden'); // Outros jogadores não veem o botão
    }
}

/**
 * Função para o host iniciar a partida a partir da tela de espera.
 * Ocorre quando o host clica em "Iniciar Partida".
 */
async function startGameAsHost() {
  if (!roomRef) return;
  const snap = await roomRef.once('value');
  const roomData = snap.val();

  if (!roomData || roomData.hostUid !== currentAuthManager.uid) {
    console.warn('Somente o host pode iniciar a partida.');
    return;
  }

  const currentHumanPlayers = Object.values(roomData.playerColors).filter(p => p && !p.isAI && p.id !== null).length;
  if (currentHumanPlayers < 2) {
    alert('É necessário ter pelo menos 2 jogadores humanos para iniciar a partida.');
    return;
  }

  // Define o status da sala como "playing"
  await roomRef.update({ status: 'playing' });
}

/* =====================================================
   LÓGICA DE PARTIDA MULTIPLAYER (APÓS INICIADA)
===================================================== */
/**
 * Inicia o jogo multiplayer quando o status da sala muda para 'playing'.
 * Esta função é chamada tanto para o host quanto para os jogadores que entram.
 * @param {object} roomData Os dados da sala do Firebase.
 */
async function startMultiplayerGame(roomData) {
  console.log('Iniciando jogo multiplayer:', roomData.roomCode);
  roomCode = roomData.roomCode;
  gameMode = 'multiplayer';
  gameActive = true;
  isSpectator = false;
  aiThinking = false; // Garante que a IA não está pensando

  // Deserializa o estado inicial do jogo, que contém a ordem de players e pawns.
  engine.deserialize(roomData.state);

  // Define myColor se ainda não estiver definido (para spectator ou se join foi o first trigger)
  if (!myColor) {
      for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
          if (roomData.playerColors[color] && roomData.playerColors[color].id === currentAuthManager.uid) {
              myColor = color;
              break;
          }
      }
  }

  // Garante que a lista de players do engine está alinhada com o que veio do Firebase
  engine.players = Object.values(roomData.playerColors).map(p => ({
    id: p.id,
    name: p.name,
    isAI: p.isAI,
    color: p.color,
    photoURL: p.photoURL,
    pawns: p.pawns || Array(window.LUDO_CONSTANTS.PIECES_PER_PLAYER).fill(0).map(() => ({ pos: -1, homeStep: -1, finished: false })),
    score: p.score || 0
  }));

  // Esconder/mostrar botões de controle
  gel('btn-resign').classList.remove('hidden');
  gel('btn-start-ai-game').classList.add('hidden');
  gel('btn-new-game').classList.add('hidden'); // Botão "Novo Jogo" só aparece no game over
  gel('btn-back-lobby').classList.add('hidden'); // Esconder voltar lobby do spectator
  gel('spectator-bar').classList.add('hidden'); // Esconder barra de spectator

  showScreen('game');
  renderGame(); // Renderiza o estado inicial do jogo

  if (roomRef) {
    roomRef.on('value', async snap => { // Usar async lambda
      const liveRoomData = snap.val();
      if (!liveRoomData) {
        console.log('Sala foi removida, jogo multiplayer encerrado.');
        showGameOver('Partida Encerrada', 'A sala foi removida pelo host.');
        if (roomRef) { roomRef.off(); roomRef = null; }
        goLobby();
        return;
      }

      // Deserializa o estado do engine do Firebase para manter sincronia
      engine.deserialize(liveRoomData.state);
      // Atualiza a lista de players do engine caso entrem/saiam IAs ou jogadores
      engine.players = Object.values(liveRoomData.playerColors).map(p => ({
        id: p.id,
        name: p.name,
        isAI: p.isAI,
        color: p.color,
        photoURL: p.photoURL,
        pawns: p.pawns || Array(window.LUDO_CONSTANTS.PIECES_PER_PLAYER).fill(0).map(() => ({ pos: -1, homeStep: -1, finished: false })),
        score: p.score || 0
      }));
      renderGame(); // Redesenha a UI com o novo estado

      // === Lógica de Fim de Jogo (Resign/Finished/Abandoned) ===
      if (!gameActive) return; // Se o jogo já acabou localmente, não processa mais fim de jogo do Firebase.

      if (['resigned', 'finished', 'abandoned'].includes(liveRoomData.status)) {
        gameActive = false; // Finaliza o jogo localmente

        let title = 'Partida Encerrada';
        let message = 'O jogo terminou.';
        let result = 'draw'; // Padrão
        let winnerPlayerName = 'Ninguém';
        let winnerUID = null;

        if (liveRoomData.status === 'resigned') {
            winnerUID = liveRoomData.winner; // Quem VENCEU após a resignação
            const resignedPlayerName = liveRoomData.resignedPlayerName || 'Um jogador';
            winnerPlayerName = engine.players.find(p => p.id === winnerUID)?.name || 'Oponente';
            title = 'Partida Finalizada';
            message = `${resignedPlayerName} desistiu. ${winnerPlayerName} venceu!`;
            result = (winnerUID === currentAuthManager.uid) ? 'win' : 'loss'; // Meu resultado
        } else if (liveRoomData.status === 'finished' && liveRoomData.winner) {
            winnerUID = liveRoomData.winner; // Quem VENCEU o jogo
            winnerPlayerName = engine.players.find(p => p.id === winnerUID)?.name || 'Alguém';
            title = 'Fim de Jogo! 🏁';
            message = `${winnerPlayerName} venceu!`;
            result = (winnerUID === currentAuthManager.uid) ? 'win' : 'loss';
        } else if (liveRoomData.status === 'abandoned') {
            const abandonedPlayerName = liveRoomData.abandonedPlayerName || 'Um jogador';
            title = 'Partida Abandonada';
            message = `${abandonedPlayerName} abandonou a partida.`;
            // Lógica para atribuir vitória a quem ficou na partida
            const remainingPlayers = engine.players.filter(p => !p.isAI && p.id !== liveRoomData.abandonedPlayerId);
            if(remainingPlayers.some(p => p.id === currentAuthManager.uid)) {
                result = 'win';
                winnerPlayerName = currentAuthManager.displayName;
            } else {
                result = 'draw'; // Se não sou o vencedor, pode ser draw ou loss
            }
        }

        // Salva o resultado no histórico pessoal
        await historyManager.saveGame({
            gameType: 'ludo',
            uid: currentAuthManager.uid,
            isAnonymous: currentAuthManager.isAnonymous,
            mode: gameMode,
            players: engine.players.map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                isAI: p.isAI,
                isMe: p.id === currentAuthManager.uid,
                photoURL: p.photoURL
            })),
            myColor: myColor,
            result: result,
            endedAt: Date.now(),
        });
        historyManager.removeLudoLiveGame(roomCode); // Remove da lista de jogos ao vivo

        showGameOver(title, message);
        if (roomRef) { roomRef.off(); roomRef = null; }
        return;
      }

      // Se é a vez de uma IA no multiplayer, e eu sou o host
      const activePlayer = engine.activePlayer;
      if (roomData.hostUid === currentAuthManager.uid // Eu sou o host
          && activePlayer.isAI
          && engine.status === 'playing'
          && !aiThinking)
      {
          console.log(`Host (${currentAuthManager.displayName}) executando turno da IA (${activePlayer.name}).`);
          setTimeout(doAITurn, 1500); // Host executa o turno da IA
      }
    }); // Fim do roomRef.on('value')
  } // Fim do if (roomRef)

  // Se for o host da sala, também salva/atualiza o jogo na lista de jogos ao vivo
  if (roomData.hostUid === currentAuthManager.uid) {
    historyManager.saveLudoLiveGame(roomData.roomCode, {
        gameType: 'ludo',
        roomCode: roomData.roomCode,
        hostUid: roomData.hostUid,
        createdAt: roomData.createdAt,
        playerColors: roomData.playerColors,
        state: roomData.state,
        status: roomData.status,
        players: Object.values(roomData.playerColors).filter(p => p && p.id) // Apenas jogadores válidos
    });
  }
}

/* =====================================================
   GAME UI LÓGICA E EVENTOS (LUDO)
===================================================== */

/**
 * Inicializa os event listeners para a UI do jogo.
 */
function initGameUI() {
  el('btn-roll', 'click', onRollDiceClick);
  el('btn-resign', 'click', resign);
  // Botões do modal de gameover
  el('btn-gameover-new', 'click', () => { hideModal('modal-gameover'); if (gameMode === 'ai') startAIGame(); else goLobby(); });
  el('btn-gameover-history', 'click', () => { hideModal('modal-gameover'); openHistoryScreen(); });
  el('btn-gameover-lobby', 'click', () => { hideModal('modal-gameover'); goLobby(); });

  // Botão de voltar do espectador
  el('btn-back-lobby', 'click', () => {
    if (specRef) { specRef.off(); specRef = null; }
    goLobby();
  });
}

/**
 * Verifica se é o turno do jogador humano atual.
 * @returns {boolean} True se for o turno, False caso contrário.
 */
function isMyTurn() {
  return !isSpectator && gameActive && engine.activePlayer && engine.activePlayer.id === currentAuthManager.uid;
}

/**
 * Handler para o clique no botão "Rolar Dado".
 */
async function onRollDiceClick() {
  if (!isMyTurn() || engine.phase !== 'roll' || aiThinking) {
    console.warn('Não é sua vez de rolar o dado ou não é a fase de rolar.');
    return;
  }

  engine.rollDice(); // Rola o dado
  renderGame();      // Atualiza a UI com o dado rolado e peças jogáveis

  if (engine.status === 'finished') {
      // Se a partida terminou com a rolagem (ex: atingiu o último ponto)
      await historyManager.saveGame({ // Salva o resultado
            gameType: 'ludo',
            uid: currentAuthManager.uid,
            isAnonymous: currentAuthManager.isAnonymous,
            mode: gameMode,
            players: engine.players.map(p => ({ id: p.id, name: p.name, color: p.color, isAI: p.isAI, photoURL: p.photoURL })),
            myColor: myColor,
            result: 'win', // Rolou e venceu
            endedAt: Date.now(),
        });
      showGameOver('Parabéns!', `${currentAuthManager.displayName} venceu a partida!`);
      if (gameMode === 'multiplayer' && roomRef) {
          await roomRef.update({status: 'finished', winner: currentAuthManager.uid, state: engine.serialize()});
          historyManager.removeLudoLiveGame(roomCode);
          if (roomRef) { roomRef.off(); roomRef = null; }
      }
      return;
  }

  // Verifica se há movimentos válidos. Se não, passa o turno automaticamente.
  const validMoves = engine.getValidMoves();
  if (engine.phase === 'move' && validMoves.length === 0) {
    engine.logEvent(myColor, `Sem movimentos válidos para ${currentAuthManager.displayName}. Passando a vez.`);
    await new Promise(resolve => setTimeout(resolve, 800)); // Pequeno delay antes de passar o turno
    engine.nextTurn();
    renderGame();
    // Se for multiplayer, atualiza o Firebase.
    if (gameMode === 'multiplayer' && roomRef) {
      await roomRef.update({
        state: engine.serialize(),
        log: engine.log,
        activePlayerIndex: engine.activePlayerIndex
      });
    }
    // Se o próximo jogador for IA, ativa IA
    if (engine.activePlayer.isAI) {
      setTimeout(doAITurn, 1500);
    }
  } else if (engine.phase === 'move' && gameMode === 'multiplayer' && roomRef) {
      // Se rolou e tem moves válidos, atualiza o firebase mas sem mudar o turno ainda.
      // O jogador terá que escolher a peça.
      await roomRef.update({
        state: engine.serialize(),
        log: engine.log,
        activePlayerIndex: engine.activePlayerIndex

      });
  }
}

/**
 * Handler para clique em uma peça para mover.
 * @param {number} pawnIdx O índice da peça a ser movida.
 */
async function doMovePawn(pawnIdx) {
  if (!isMyTurn() || engine.phase !== 'move' || aiThinking) {
    console.warn('Não é sua vez de mover a peça ou não é a fase de mover.');
    return;
  }

  const movedSuccessfully = engine.doMovePawn(pawnIdx);

  if (movedSuccessfully) {
    renderGame(); // Redesenha com o movimento feito

    if (engine.status === 'finished') {
        const result = (engine.winner && engine.winner === currentAuthManager.uid) ? 'win' : 'loss';
        await historyManager.saveGame({
            gameType: 'ludo',
            uid: currentAuthManager.uid,
            isAnonymous: currentAuthManager.isAnonymous,
            mode: gameMode,
            players: engine.players.map(p => ({ id: p.id, name: p.name, color: p.color, isAI: p.isAI, photoURL: p.photoURL })),
            myColor: myColor,
            result: result,
            endedAt: Date.now(),
        });
        showGameOver('Partida Encerrada!', `${engine.players.find(p => p.id === engine.winner)?.name || 'Alguém'} levou todas as peças para casa!`);

        if (gameMode === 'multiplayer' && roomRef) {
            await roomRef.update({status: 'finished', winner: engine.winner, state: engine.serialize()});
            historyManager.removeLudoLiveGame(roomCode);
            if (roomRef) { roomRef.off(); roomRef = null; }
        }
        return;
    }

    // Se o jogo continua, atualiza o Firebase após o movimento
    // e atualiza quem é o jogador ativo para o próximo turno.
    if (gameMode === 'multiplayer' && roomRef) {
      await roomRef.update({
        state: engine.serialize(),
        log: engine.log,
        activePlayerIndex: engine.activePlayerIndex
      }).catch(e => console.error('Erro ao atualizar estado do jogo multiplayer após movimento:', e));
    }

    // Se o próximo jogador é IA, agenda o turno da IA
    if (engine.activePlayer.isAI) {
      setTimeout(doAITurn, 1500);
    }
  }
}

/* =====================================================
   VS AI LOGIC (LUDO)
===================================================== */
/**
 * Inicia uma nova partida contra a IA.
 */
function startAIGame() {
  console.log('Iniciando jogo VS AI.');
  gameMode = 'ai';
  gameActive = true;
  isSpectator = false;
  aiThinking = false;
  myColor = window.LUDO_CONSTANTS.LUDO_COLORS[0]; // Jogador humano (eu) é sempre vermelho no modo AI

  engine.reset(); // Reseta o motor do jogo Ludo

  const playerConfigs = [];
  // Adiciona o jogador humano (eu) como o primeiro
  playerConfigs.push({
    id: currentAuthManager.uid,
    name: currentAuthManager.displayName || 'Você',
    isAI: false,
    color: myColor,
    photoURL: currentAuthManager.photoURL
  });

  // Adiciona as IAs preenchendo as cores restantes
  const aiColorsPool = window.LUDO_CONSTANTS.LUDO_COLORS.filter(color => color !== myColor);
  for (let i = 0; i < selectedAiCount; i++) {
    const aiColor = aiColorsPool[i];
    if (aiColor) { // Garante que há uma cor disponível
        playerConfigs.push({
            id: `ai_${aiColor}_${Date.now()}_${i}`, // ID único para a IA
            name: `Computador ${i + 1}`,
            isAI: true,
            color: aiColor,
            photoURL: null
        });
    }
  }

  engine.setupGame(playerConfigs); // Configura o jogo com todos os jogadores (Humano + AI)

  // Atualiza UI de botões de controle de jogo
  gel('btn-resign').classList.remove('hidden');
  gel('btn-roll').classList.remove('hidden');
  gel('btn-start-ai-game').classList.add('hidden'); // Esconde botão de iniciar AI
  gel('btn-back-lobby').classList.add('hidden');
  gel('spectator-bar').classList.add('hidden');

  showScreen('game');
  renderGame();

  // Se o primeiro jogador ativo for uma IA, agenda seu turno
  if (engine.activePlayer.isAI) {
    setTimeout(doAITurn, 1500);
  }
}

/**
 * Executa o turno da IA.
 */
async function doAITurn() {
  if (!gameActive || !engine.activePlayer.isAI || engine.status !== 'playing') {
      aiThinking = false;
      renderStatusBar(); // Atualizar para remover "pensando"
      return;
  }

  aiThinking = true;
  renderStatusBar(); // Mostrar "IA pensando..."

  const rollButton = gel('btn-roll');
  if (rollButton) rollButton.disabled = true; // Desabilita roll para IA
  gel('btn-resign').disabled = true;           // Desabilita resign enquanto IA joga

  // Simula o rolar do dado pela IA
  gel('dice-display').textContent = '🎲';
  await new Promise(resolve => setTimeout(resolve, 800)); // Atraso para simular "rolando"

  engine.rollDice();
  renderGame(); // Atualiza o dado e o tabuleiro com o roll da IA

  if (engine.status === 'finished') {
    // A IA rolou e venceu, então o humano perdeu
    await historyManager.saveGame({
        gameType: 'ludo',
        uid: currentAuthManager.uid,
        isAnonymous: currentAuthManager.isAnonymous,
        mode: gameMode,
        players: engine.players.map(p => ({ id: p.id, name: p.name, color: p.color, isAI: p.isAI, photoURL: p.photoURL })),
        myColor: myColor,
        result: 'loss', // Eu perdi para a IA
        endedAt: Date.now(),
    });
    showGameOver('Você Perdeu! ❌', `${engine.activePlayer.name} venceu a partida!`);
    aiThinking = false;
    gel('btn-resign').disabled = false;
    return;
  }

  // Se a IA rolou e não há movimentos válidos, ela passa o turno automaticamente.
  if (engine.phase === 'move' && engine.getValidMoves().length === 0) {
      engine.logEvent(engine.activePlayer.color, `${engine.activePlayer.name} (IA) não tem movimentos válidos. Passando a vez.`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Pequeno delay antes de passar
      engine.nextTurn();
      aiThinking = false;
      renderGame();
      // Se o próximo jogador for IA, agenda o movimento novamente
      if (engine.activePlayer.isAI) setTimeout(doAITurn, 1500);
      gel('btn-resign').disabled = false;
      return;
  }

  if (engine.phase === 'move') {
      aiThinking = true;
      renderStatusBar(); // Ainda "pensando" para decidir o movimento

      // Atraso para o movimento da IA
      const delay = 800 + (Math.random() * 700); // 0.8 a 1.5 segundos
      await new Promise(resolve => setTimeout(resolve, delay));

      const pawnIndexToMove = ai.getBestMove(engine); // AI escolhe a melhor peça para mover

      if (pawnIndexToMove !== null) {
          engine.doMovePawn(pawnIndexToMove);
          aiThinking = false; // IA terminou de pensar e mover
          renderGame();

          if (engine.status === 'finished') { // A IA moveu e venceu o jogo
            await historyManager.saveGame({
                gameType: 'ludo',
                uid: currentAuthManager.uid,
                isAnonymous: currentAuthManager.isAnonymous,
                mode: gameMode,
                players: engine.players.map(p => ({ id: p.id, name: p.name, color: p.color, isAI: p.isAI, photoURL: p.photoURL })),
                myColor: myColor,
                result: 'loss', // Eu perdi para a IA
                endedAt: Date.now(),
            });
            showGameOver('Você Perdeu! ❌', `${engine.players.find(p => p.id === engine.winner)?.name || 'Alguém'} levou todas as peças para casa!`);
            gel('btn-resign').disabled = false;
            return;
          }

          // Se o turno continua com a IA (rolou 6, capturou, ou chegou em casa)
          if (engine.activePlayer.isAI) {
              setTimeout(doAITurn, 1500);
          }
      } else {
        console.warn('AI não encontrou um movimento válido. Passando a vez.');
        engine.nextTurn();
        aiThinking = false;
        renderGame();
        if (engine.activePlayer.isAI) setTimeout(doAITurn, 1500);
      }
  }
  // Após a IA ter terminado seu turno ou passado, reabilita o botão de resign (se for a vez do humano)
  if (isMyTurn()) { // Reabilita apenas se o próximo turno é do humano
      gel('btn-resign').disabled = false;
  }
}

/* =====================================================
   ESPECTADOR LOGIC (LUDO)
===================================================== */
/**
 * Permite ao usuário assistir uma partida existente.
 */
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
    if (['finished', 'resigned', 'abandoned'].includes(data.status)) {
      showLobbyError('Partida já encerrou.'); return;
    }

    isSpectator = true; roomCode = code; myColor = null; // Spectator não tem "myColor"
    engine.deserialize(data.state); // Carrega o estado atual do jogo

    // Garante que a lista de players do engine está alinhada com o que veio do Firebase
    engine.players = Object.values(data.playerColors).map(p => ({
        id: p.id,
        name: p.name,
        isAI: p.isAI,
        color: p.color,
        photoURL: p.photoURL,
        pawns: p.pawns || Array(window.LUDO_CONSTANTS.PIECES_PER_PLAYER).fill(0).map(() => ({ pos: -1, homeStep: -1, finished: false })),
        score: p.score || 0
    }));

    showScreen('game');
    renderGame();
    gel('btn-resign').classList.add('hidden');
    gel('btn-roll').classList.add('hidden');
    gel('btn-start-ai-game').classList.add('hidden');
    gel('btn-back-lobby').classList.remove('hidden'); // Botão pra voltar pro lobby
    gel('spectator-bar').classList.remove('hidden'); // Mostra barra de espectador

    specRef = db.ref('rooms/' + code);
    specRef.on('value', snap => {
      const d = snap.val();
      if (!d) { // Sala foi removida
        specRef.off();
        goLobby();
        return;
      }
      engine.deserialize(d.state);
      // Atualiza a lista de players no engine caso entre/saia alguém
      engine.players = Object.values(d.playerColors).map(p => ({
          id: p.id,
          name: p.name,
          isAI: p.isAI,
          color: p.color,
          photoURL: p.photoURL,
          pawns: p.pawns || Array(window.LUDO_CONSTANTS.PIECES_PER_PLAYER).fill(0).map(() => ({ pos: -1, homeStep: -1, finished: false })),
          score: p.score || 0
      }));
      renderGame();

      if (['finished', 'resigned', 'abandoned'].includes(d.status)) {
        gel('spectator-bar').textContent = '👁 Partida encerrada.';
        specRef.off(); // Desliga o listener, pois o jogo terminou
      } else {
        gel('spectator-bar').textContent = `👁 Assistindo — Vez de ${engine.activePlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[engine.activePlayer.color]})`;
      }
    });

  } catch (e) {
    showLobbyError('Erro ao conectar como espectador: ' + e.message);
    console.error('Erro ao conectar como espectador:', e);
  }
}

/* =====================================================
   GAME OVER / RESIGN LOGIC
===================================================== */
/**
 * Desiste da partida atual.
 */
async function resign() {
  if (!gameActive || isSpectator || !currentAuthManager.uid || currentAuthManager.isAnonymous) return;
  if (!confirm('Tem certeza que deseja desistir da partida? Isso contará como uma derrota.')) return;

  gameActive = false;
  aiThinking = false;

  let result = 'loss'; // Quem desiste sempre perde
  let winnerUID = null;
  let winnerPlayerName = 'Ninguém';

  if (gameMode === 'multiplayer' && roomRef) {
      // No multiplayer, o vencedor é a próxima pessoa humana se houver, ou o host decide.
      // Simplificando: vamos atribuir a vitória a qualquer outro jogador humano ativo na sala.
      const otherPlayers = engine.players.filter(p => p.id !== currentAuthManager.uid && !p.isAI);
      if (otherPlayers.length > 0) {
          winnerUID = otherPlayers[0].id; // O primeiro "outro" jogador ganha por padrão
          winnerPlayerName = otherPlayers[0].name;
      }

      await roomRef.update({
          status: 'resigned',
          winner: winnerUID, // ID de quem 'ganha' a partida devido à resignação
          resignedPlayerId: currentAuthManager.uid, // Quem desistiu
          resignedPlayerName: currentAuthManager.displayName,
          state: engine.serialize() // Salva o estado final
      }).catch(e => console.error('Erro ao atualizar sala para resignação:', e));
      historyManager.removeLudoLiveGame(roomCode);
      if (roomRef) { roomRef.off(); roomRef = null; }
  } else { // Modo AI
      // A IA "vence" quando o humano desiste
      const aiPlayer = engine.players.find(p => p.isAI);
      if (aiPlayer) {
          winnerUID = aiPlayer.id;
          winnerPlayerName = aiPlayer.name;
      }
  }

  // Salva o jogo como "loss" por resignação no histórico pessoal
  await historyManager.saveGame({
    gameType: 'ludo',
    uid: currentAuthManager.uid,
    isAnonymous: currentAuthManager.isAnonymous,
    mode: gameMode,
    players: engine.players.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isAI: p.isAI,
        isMe: p.id === currentAuthManager.uid,
        photoURL: p.photoURL
    })),
    myColor: myColor,
    result: result, // Desistência é sempre perda para quem desiste
    endedAt: Date.now(),
  });

  showGameOver('Você Desistiu! 🏳️', `A vitória foi para ${winnerPlayerName}.`);
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
    iconEl.textContent = title.includes('Venceu') || title.includes('Parabéns') ? '🏆'
      : title.includes('Desistiu') || title.includes('Perdeu') ? '❌' : '🎲'; // Ícone padrão
  }
  showModal('modal-gameover');
}

/* =====================================================
   RENDERIZAÇÃO DA UI DO JOGO LUDO
===================================================== */

/**
 * Constrói a estrutura DOM do tabuleiro Ludo.
 * Chamado uma única vez ao iniciar o aplicativo (DOMContentLoaded).
 * Isso evita a recriação desnecessária de elementos HTML a cada render.
 */
function buildBoardDOM() {
  const boardEl = gel('ludo-board');
  if (!boardEl) {
    console.error('Elemento #ludo-board não encontrado. Não é possível construir o tabuleiro.');
    return;
  }
  boardEl.innerHTML = ''; // Limpa qualquer conteúdo preexistente
  BOARD_CELLS_DOM = []; // Reseta o array de referências DOM

  for (let r = 0; r < window.LUDO_CONSTANTS.BOARD_SIZE; r++) {
    BOARD_CELLS_DOM[r] = []; // Inicializa a linha
    for (let c = 0; c < window.LUDO_CONSTANTS.BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'ludo-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.id = `cell-${r}-${c}`; // Adiciona um ID único para cada célula

      // Adiciona classes de zona (cor, base, home path, etc.)
      const zone = getCellZone(r, c);
      if (zone) cell.classList.add(zone);

      // Adiciona classe 'safe' para casas seguras no PATH_COORDS
      const pathIdx = window.LUDO_CONSTANTS.PATH_COORDS.findIndex(coord => coord[0] === r && coord[1] === c);
      if (pathIdx !== -1 && window.LUDO_CONSTANTS.SAFE_SQUARES.includes(pathIdx)) {
        cell.classList.add('safe');
      }

      boardEl.appendChild(cell);
      BOARD_CELLS_DOM[r][c] = cell; // Guarda referência ao elemento DOM para acesso rápido
    }
  }
  console.log('DOM do tabuleiro Ludo construído e referências guardadas.');
}

/**
 * Identifica a "zona" (cor ou neutra) de uma célula específica do tabuleiro 15x15.
 * Usado para aplicar estilos de fundo via CSS.
 * @param {number} r Linha da célula.
 * @param {number} c Coluna da célula.
 * @returns {string} A zona (red-base, blue-homepath, neutral-path, center-final, etc.)
 */
function getCellZone(r, c) {
  // Bases (Blocos 6x6)
  if (r >=0 && r <=5 && c >=0 && c <=5) return 'red-base';
  if (r >=0 && r <=5 && c >=9 && c <=14) return 'blue-base';
  if (r >=9 && r <=14 && c >=9 && c <=14) return 'green-base';
  if (r >=9 && r <=14 && c >=0 && c <=5) return 'yellow-base';

  // Home Paths (corredores finais 6x1)
  if (r === 7 && c >= 1 && c <= 6) return 'red-homepath';
  if (c === 7 && r >= 1 && r <= 6) return 'blue-homepath';
  if (r === 7 && c >= 8 && c <= 13) return 'green-homepath';
  if (c === 7 && r >= 8 && r <= 13) return 'yellow-homepath';

  // Casa Central (7,7)
  if (r === 7 && c === 7) return 'center-final';

  // Casas de Entrada (onde as peças vermelhas, azuis, etc. entram no caminho principal)
  if (window.LUDO_CONSTANTS.ENTRY_POS.red[0] === r && window.LUDO_CONSTANTS.ENTRY_POS.red[1] === c) return 'red-entry';
  if (window.LUDO_CONSTANTS.ENTRY_POS.blue[0] === r && window.LUDO_CONSTANTS.ENTRY_POS.blue[1] === c) return 'blue-entry';
  if (window.LUDO_CONSTANTS.ENTRY_POS.green[0] === r && window.LUDO_CONSTANTS.ENTRY_POS.green[1] === c) return 'green-entry';
  if (window.LUDO_CONSTANTS.ENTRY_POS.yellow[0] === r && window.LUDO_CONSTANTS.ENTRY_POS.yellow[1] === c) return 'yellow-entry';

  // Células do caminho principal (o resto)
  // Não precisamos de verificação explícita aqui, se não se encaixa nas anteriores
  // e está no grid, é parte do caminho principal neutro ou entre eles.
  return 'neutral-path';
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
      let coords = null; // Coordenadas (r,c) para renderizar a peça

      if (pawn.finished) {
          return; // Peões finalizados não são renderizados no tabuleiro
      } else if (pawn.pos === -1) { // Peça na base
          coords = window.LUDO_CONSTANTS.BASE_POSITIONS[player.color]?.[pawnIdx];
      } else if (pawn.homeStep !== -1) { // Peça no corredor final
          coords = window.LUDO_CONSTANTS.HOME_PATHS[player.color]?.[pawn.homeStep];
      } else { // Peça no tabuleiro principal
          coords = window.LUDO_CONSTANTS.PATH_COORDS[pawn.pos];
      }

      // Verifica se as coordenadas são válidas e se a célula do DOM existe
      if (!coords ||
          coords[0] < 0 || coords[0] >= window.LUDO_CONSTANTS.BOARD_SIZE ||
          coords[1] < 0 || coords[1] >= window.LUDO_CONSTANTS.BOARD_SIZE ||
          !BOARD_CELLS_DOM[coords[0]] || !BOARD_CELLS_DOM[coords[0]][coords[1]]) {
        console.warn(`Coordenadas inválidas ou célula DOM não encontrada para peão ${player.color}-${pawnIdx} em [${coords}].`);
        return;
      }

      const cellElement = BOARD_CELLS_DOM[coords[0]][coords[1]];
      if (!cellElement) {
        console.warn(`Elemento da célula DOM não encontrado para [${coords[0]}, ${coords[1]}].`);
        return;
      }

      // Cria e posiciona o elemento do peão
      const pawnEl = document.createElement('div');
      pawnEl.className = `pawn ${player.color}`;
      pawnEl.dataset.playerColor = player.color;
      pawnEl.dataset.pawnIdx = pawnIdx;
      pawnEl.textContent = window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color]; // Símbolo da peça

      // Adiciona classe 'movable' e event listener se for a vez do jogador e a peça puder mover
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
    const card = document.createElement('li'); // Mudado para <li> para lista semântica
    card.className = `player-card ${player.color}`;
    // Adiciona 'active-turn' se for o jogador atual
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
      const initials = (player.name || '?')[0].toUpperCase();
      avatarContent = `<span class="player-initials" style="background-color: var(--ludo-${player.color}-dark);">${initials}</span>`;
    }

    card.innerHTML = `
      <div class="player-avatar">
        ${avatarContent}
      </div>
      <div class="player-info">
        <span class="player-name">${playerNameDisplay}</span>
        <span class="player-score">Peças em Casa: ${player.score} / ${window.LUDO_CONSTANTS.PIECES_PER_PLAYER}</span>
        <div class="ludo-score-indicator" data-color="${player.color}">
          <!-- Peões na base serão renderizados aqui como dots -->
        </div>
      </div>
    `;

    // Renderiza os "dots" para peões na base ou perto de sair
    const scoreIndicator = card.querySelector('.ludo-score-indicator');
    if (scoreIndicator) {
      player.pawns.forEach(pawn => {
        if (!pawn.finished) { // Só mostra dots para peças que não chegaram na casa central
          const dot = document.createElement('span');
          dot.className = 'pawn-on-base-dot';
          // Peças na base ficam brancas; peças no board ficam coloridas; peças prontas para sair ficam com destaque amarelado
          if (pawn.pos !== -1 || pawn.homeStep !== -1) {
            dot.style.backgroundColor = `var(--ludo-${player.color})`; // Peça já saiu: colorida
          }

          // Se a peça está na base E é o turno do jogador E o dado é 6
          if (pawn.pos === -1 && engine.diceValue === 6 && isMyTurn() && player.id === currentAuthManager.uid) {
            dot.classList.add('ready'); // Destaque para peça pronta para sair
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
    bar.textContent = `👁 Assistindo — Vez de ${activePlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[activePlayer.color]})`;
    btnRoll.classList.add('hidden'); // Esconde o botão de rolar para espectadores
    return;
  }
  if (aiThinking) {
    bar.innerHTML = `Computador (${activePlayer.name}) pensando <span class="thinking-dots"><span></span><span></span><span></span></span>`;
    btnRoll.disabled = true;
    return;
  }

  if (engine.status === 'finished') {
    bar.textContent = `Partida encerrada! Vencedor: ${engine.players.find(p => p.id === engine.winner)?.name || 'Alguém'} 🏆`;
    bar.classList.remove('your-turn');
    btnRoll.classList.add('hidden'); // Esconde o botão de rolar ao final do jogo
  } else if (isMyTurnNow) {
    if (engine.phase === 'roll') {
      bar.textContent = `Sua vez (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[myColor]}) — Role o dado!`;
      bar.classList.add('your-turn');
    } else { // phase === 'move'
      btnRoll.disabled = true; // Desabilita roll após rolar
      const validMovesAvailable = engine.getValidMoves().length > 0;
      if (!validMovesAvailable && engine.diceValue > 0) {
        bar.textContent = `Sua vez (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[myColor]}) — Sem movimentos válidos para dado ${engine.diceValue}.`;
        // O `onRollDiceClick` já lida com a passagem de turno automática se não houver moves
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
/**
 * Inicializa os event listeners para as telas de Histórico e Partidas ao Vivo de Ludo.
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
    // Usa o HistoryManager para carregar o histórico de Ludo
    const games = await historyManager.loadLudoHistory(currentAuthManager.uid);

    if (!games || games.length === 0) {
      if (listEl) listEl.innerHTML = '<div class="history-empty">Nenhuma partida de Ludo ainda.<br>Jogue sua primeira partida!</div>';
      return;
    }

    const wins = games.filter(g => g.result === 'win').length;
    const losses = games.filter(g => g.result === 'loss' || g.result === 'resigned').length;
    const draws = games.filter(g => g.result === 'draw').length; // Considera empates, se a lógica Ludo permitir

    if (statsEl) statsEl.innerHTML =
      `<span class="stat stat-win">🏆 Vitórias: ${wins}</span> ` +
      `<span class="stat stat-loss">❌ Derrotas: ${losses}</span> ` +
      `<span class="stat stat-draw">🤝 Empates: ${draws}</span>`;

    if (listEl) listEl.innerHTML = '';

    // Ordena os jogos por data mais recente primeiro (presumindo que `endedAt` é um timestamp)
    games.sort((a,b) => b.endedAt - a.endedAt);

    games.forEach(game => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const resClassMap = { win: 'result-win', loss: 'result-loss', draw: 'result-draw', resigned: 'result-loss' };
      const resTextMap = { win: 'Vitória 🏆', loss: 'Derrota ❌', draw: 'Empate 🤝', resigned: 'Desistência 🏳️' };
      const resClass = resClassMap[game.result] || '';
      const resText = resTextMap[game.result] || game.result;

      // Obtém os nomes dos oponentes de forma dinâmica
      // Filtra o próprio jogador e as IAs para listar "oponentes humanos"
      let opponentDisplayNames = game.players
        .filter(p => p.id !== currentAuthManager.uid && !p.isAI)
        .map(p => escapeHtml(p.name));
      let aiOpponentCount = game.players.filter(p => p.isAI).length;

      let opponentDisplay = '';
      if (opponentDisplayNames.length > 0) {
        opponentDisplay = 'vs ' + opponentDisplayNames.join(', ');
      }
      if (aiOpponentCount > 0) {
        const joiner = opponentDisplayNames.length > 0 ? ' + ' : 'vs ';
        opponentDisplay += `${joiner}${aiOpponentCount} IA(s)`;
      }
      if (!opponentDisplay) { // Se não há oponentes humanos explicitamente (i.e., apenas IA ou jogo solo simples)
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

      // Constrói um resumo dos jogadores para exibição
      // Filtra os IDs null (slots vazios), e apenas humanos (não IAs) para a lista de nomes
      let playerDisplayNames = Object.values(game.playerColors || {})
        .filter(p => !p.isAI && p.id !== null)
        .map(p => escapeHtml(p.name));
      let aiCount = Object.values(game.playerColors || {}).filter(p => p.isAI).length;

      let playerSummary = playerDisplayNames.join(', ');
      if (aiCount > 0) {
        const joiner = playerDisplayNames.length > 0 ? ' + ' : '';
        playerSummary += `${joiner}${aiCount} IA(s)`;
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
          <span class="history-moves">${Object.keys(game.playerColors || {}).length} slots</span>
        </div>
        <div class="history-card-right">
          <span class="history-date">${date}</span>
          <button class="btn btn-small btn-secondary">👁 Assistir</button>
        </div>
      `;
      // Anexa o listener para o botão "Assistir"
      card.querySelector('button').addEventListener('click', () => {
        gel('input-spectate').value = game.roomCode; // Preenche o input do lobby com o código
        spectateGame(); // Chama a função de espectador
      });
      if (listEl) listEl.appendChild(card);
    });
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="history-empty">Erro ao carregar partidas ao vivo.</div>';
    console.error('Erro ao carregar partidas de Ludo ao vivo:', e);
  }
}