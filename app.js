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

// Variáveis de estado do aplicativo (DEVE estar usando window.LUDO_CONSTANTS)
// As instâncias das classes serão criadas AQUI em app.js
let db, fbAuth; // Firebase Database e Auth
let currentAuthManager;  // Instância de AuthManager
let historyManager;      // Instância de HistoryManager
let engine;              // Instância de LudoEngine
let ai;                  // Instância de LudoAI

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
let selectedAiCount = 1;      // Padrão para partidas contra AI (1-3) (memória do usuário: 1 a 3 computadores)

// Variáveis para Replay (ainda implementadas para Xadrez, Ludo não tem replay estruturado assim)
// MEMÓRIA DO USUÁRIO: "não precisar de replay no jogo Ludo".
// Mantidas apenas como placeholders ou para compatibilidade futura com Xadrez.
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
    // console.log(`Evento ${event} anexado a #${id}`); // Debugging de anexo de eventos
  } else {
    console.warn(`Elemento com ID '${id}' não encontrado para anexar evento '${event}'.`);
  }
}

/**
 * Escapa HTML para prevenir ataques XSS.
 * @param {string} str String a ser escapada.
 * @returns {string} String escapada.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* =====================================================
   BOOTSTRAP DO APLICATIVO
===================================================== */
window.addEventListener('DOMContentLoaded', function() {
  console.log('DOMContentLoaded: Iniciando aplicativo.');

  // 1. Inicialização do Firebase
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    fbAuth = firebase.auth();
    console.log('Firebase inicializado.');
  } catch (e) {
    console.error('Erro ao inicializar Firebase:', e);
    // Exibe uma mensagem de erro na UI se Firebase falhar
    gel('auth-error').textContent = 'Erro ao conectar ao servidor. Tente novamente mais tarde.';
    return;
  }

  // 2. Instanciação dos Managers e Engines (aqui, no app.js, uma única vez)
  currentAuthManager = new AuthManager(fbAuth, db);
  historyManager = new HistoryManager(db);
  engine = new LudoEngine();
  ai = new LudoAI();
  console.log('Managers e Engines instanciados.');

  // 3. Inicialização dos componentes da UI
  initAuthUI();
  initLobbyUI(); // Inicializa botões e event listeners do Lobby
  initGameUI();  // Inicializa botões e event listeners do Game
  initLudoHistoryLiveUI(); // Inicializa botões para Ludo History/Live

  // 4. Constrói o tabuleiro Ludo (DOM) uma única vez
  buildBoardDOM();
  console.log('Tabuleiro Ludo DOM construído.');

  // 5. Listener de estado de autenticação do Firebase
  currentAuthManager.onAuthStateChanged(user => {
    // console.log('Auth state changed:', user ? user.uid : 'No user'); // Debugging de auth state
    updateHeaderUI(user); // Atualiza o header com info do usuário
    if (user) {
      if (user.isAnonymous) {
        myId = user.uid; // ID real para o visitante
      } else {
        myId = user.uid;
      }
      showScreen('lobby');
      gel('app-header').classList.remove('hidden'); // Exibe o header após login
    } else {
      gel('app-header').classList.add('hidden'); // Esconde o header na tela de login
      showScreen('auth'); // Exibe a tela de autenticação
    }
  });

  // 6. Configura handlers iniciais para o lobby (seleção de players/AI)
  // Define o estado inicial dos seletores do modo de jogo
  gel('panel-multiplayer').classList.add('hidden'); // Esconde o painel multiplayer
  gel('panel-ai').classList.remove('hidden');    // Mostra o painel AI por padrão
  gel('btn-mode-ai').classList.add('active');    // Ativa o botão Ludo VS AI

  // Inicializa os seletores de quantidade de AI/jogadores humanos
  // Botões de contagem de jogadores humanos (2, 3, 4)
  document.querySelectorAll('#lobby-player-count .btn').forEach(btn => {
      btn.addEventListener('click', () => {
          selectedHumanPlayersCount = parseInt(btn.dataset.count);
          document.querySelectorAll('#lobby-player-count .btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          console.log(`Players humanos selecionados: ${selectedHumanPlayersCount}`);
      });
  });
  // Selecione 2 como padrão
  gel('btn-player-count-2').click();


  // Botões de dificuldade/quantidade de IA (Memória do usuário: 1 a 3 computadores)
  document.querySelectorAll('#lobby-ai-count .btn').forEach(btn => {
      btn.addEventListener('click', () => {
          selectedAiCount = parseInt(btn.dataset.count);
          document.querySelectorAll('#lobby-ai-count .btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          console.log(`IAs selecionadas: ${selectedAiCount}`);
      });
  });
  // Selecione 1 como padrão
  gel('btn-ai-count-1').click();


  // Força atualização da UI do header em caso de recarga (para visitante)
  updateHeaderUI(currentAuthManager.user);

  console.log('App inicializado e listeners configurados.');
});

/* =====================================================
   HEADER UI - Controles e Informações do Usuário
===================================================== */
function updateHeaderUI(user) {
  const headerUsername = gel('header-username');
  const headerPhoto = gel('header-photo');
  const headerInitials = gel('header-initials');

  if (user) {
    const name = user.displayName || (user.email ? user.email.split('@')[0] : 'Visitante');
    const photoURL = user.photoURL;

    if (headerUsername) headerUsername.textContent = name;

    if (photoURL && headerPhoto && headerInitials) {
      headerPhoto.src = photoURL;
      headerPhoto.classList.remove('hidden');
      headerInitials.classList.add('hidden');
    } else if (headerInitials) {
      headerInitials.classList.remove('hidden');
      headerInitials.textContent = name.split(' ').map(w => w[0] ? w[0].toUpperCase() : '').join('').substring(0, 2) || '?';
      headerPhoto.classList.add('hidden');
    }
  } else {
    // Usuário deslogado
    if (headerUsername) headerUsername.textContent = 'Visitante';
    if (headerPhoto) headerPhoto.classList.add('hidden');
    if (headerInitials) {
      headerInitials.classList.remove('hidden');
      headerInitials.textContent = '?';
    }
  }
}

/* =====================================================
   FUNÇÕES GERAIS DE NAVEGAÇÃO E UI
===================================================== */
/**
 * Exibe uma tela específica e esconde todas as outras.
 * @param {string} name O ID da seção da tela (ex: 'auth', 'lobby', 'game').
 */
function showScreen(name) {
  console.log(`Exibindo tela: ${name}`);
  document.querySelectorAll('.screen').forEach(s => {
    // console.log(`Escondendo tela: ${s.id}`); // Debugging
    s.classList.remove('active');
  });
  const targetScreen = gel(`screen-${name}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
    // console.log(`Tela 'screen-${name}' ativada.`); // Debugging
  } else {
    console.error(`Tela com ID 'screen-${name}' não encontrada.`);
  }
}

/**
 * Exibe um modal.
 * @param {string} id O ID do modal.
 */
function showModal(id) {
  const modal = gel(id);
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
}

/**
 * Esconde um modal.
 * @param {string} id O ID do modal.
 */
function hideModal(id) {
  const modal = gel(id);
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Redireciona para a tela de Lobby e limpa o estado do jogo e erros.
 */
function goLobby() {
  console.log('Navegando para o Lobby.');
  gameActive = false; aiThinking = false; isSpectator = false;
  if (roomRef) { roomRef.off(); roomRef = null; } // Desliga listener de sala
  if (specRef) { specRef.off(); specRef = null; } // Desliga listener de espectador
  engine.reset(); // Reseta o estado do motor do jogo Ludo

  // Limpa campos de input de sala/espectador
  const inputRoom = gel('input-room');
  const inputSpectate = gel('input-spectate');
  if (inputRoom) inputRoom.value = '';
  if (inputSpectate) inputSpectate.value = '';

  clearLobbyError(); // Limpa quaisquer mensagens de erro no lobby
  showScreen('lobby');
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
 * Exibe uma mensagem de erro na tela de lobby.
 * @param {string} msg A mensagem de erro.
 */
function showLobbyError(msg) {
  const errorEl = gel('lobby-error');
  if (errorEl) errorEl.textContent = msg;
}

/**
 * Limpa a mensagem de erro na tela de lobby.
 */
function clearLobbyError() {
  const errorEl = gel('lobby-error');
  if (errorEl) errorEl.textContent = '';
}

/* =====================================================
   AUTENTICAÇÃO / REGISTRO
===================================================== */
/**
 * Inicializa os event listeners para a UI de autenticação.
 */
function initAuthUI() {
  // Tabs Login/Registrar
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const targetPanel = tab.dataset.tab;
      gel('tab-login').classList.toggle('hidden', targetPanel !== 'login');
      gel('tab-register').classList.toggle('hidden', targetPanel !== 'register');
      clearAuthError();
    });
  });

  el('btn-login-email',     'click',   loginWithEmail);
  el('login-password',      'keydown', e => { if (e.key === 'Enter') loginWithEmail(); });
  el('btn-login-google',    'click',   loginWithGoogle);
  el('btn-register',        'click',   registerWithEmail);
  // el('btn-register-google', 'click',   loginWithGoogle); // Se necessário, reativar
  el('btn-guest',           'click',   loginAsGuest);
  el('btn-logout',          'click',   () => currentAuthManager.signOut()); // Botão de logout no header
}

/**
 * Realiza login com email e senha.
 */
async function loginWithEmail() {
  const email = gel('login-email').value.trim();
  const pass = gel('login-password').value;
  if (!email || !pass) { showAuthError('Preencha e-mail e senha.'); return; }
  await currentAuthManager.signInWithEmail(email, pass, showAuthError);
}

/**
 * Realiza login com Google.
 */
async function loginWithGoogle() {
  await currentAuthManager.signInWithGoogle(showAuthError);
}

/**
 * Realiza o registro com email e senha.
 */
async function registerWithEmail() {
  const name = gel('reg-name').value.trim();
  const email = gel('reg-email').value.trim();
  const pass = gel('reg-password').value;
  if (!name) { showAuthError('Informe seu nome.'); return; }
  if (!email) { showAuthError('Informe seu e-mail.'); return; }
  if (pass.length < 6) { showAuthError('Senha mínima de 6 caracteres.'); return; }
  await currentAuthManager.registerWithEmail(name, email, pass, showAuthError);
}

/**
 * Realiza login como visitante (anônimo).
 */
async function loginAsGuest() {
  await currentAuthManager.signInAnonymously(showAuthError);
}

/* =====================================================
   LOBBY UI & SELEÇÃO DE MODO DE JOGO
===================================================== */
/**
 * Inicializa os event listeners para a UI do Lobby.
 */
function initLobbyUI() {
  el('btn-history-ludo',    'click', openHistoryScreen);
  el('btn-live-games-ludo', 'click', openLiveGamesScreen);

  // Seletores de Modo de Jogo (VS AI / Multiplayer)
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
  el('btn-join-room',   'click', joinGame);
  el('input-room',      'keydown', e => { if (e.key === 'Enter') joinGame(); });

  // Multiplayer: Seleção de # de Jogadores Humanos
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
      document.querySelectorAll('#lobby-ai-count .btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  el('btn-start-ai-game', 'click', startAIGame); // Botão para iniciar jogo contra IA

  // Waiting Room
  el('btn-cancel-game', 'click', cancelGame);
  el('btn-copy-room-code', 'click', copyRoomCode);

  // Espectador
  el('btn-spectate-room', 'click', spectateGame);
  el('input-spectate', 'keydown', e => { if (e.key === 'Enter') spectateGame(); });
}

/**
 * Cria uma nova sala multiplayer.
 */
async function createGame() {
  if (!currentAuthManager.uid) { showLobbyError('Faça login para criar um jogo.'); return; }

  const btn = gel('btn-create-room');
  if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }
  clearLobbyError();

  try {
    roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    roomRef = db.ref('rooms/' + roomCode);

    const currentPlayer = currentAuthManager.user;
    const myName = currentPlayer.displayName || 'Jogador';
    const myPhotoURL = currentAuthManager.photoURL;

    const playerColors = {};
    const availableLudoColors = [...window.LUDO_CONSTANTS.LUDO_COLORS]; // Cópia para manipular

    // Adiciona o jogador host (sempre 'red' ou primeira cor disponível)
    myColor = availableLudoColors.shift(); // Remove a primeira cor para o host
    playerColors[myColor] = { id: myId, name: myName, isAI: false, photoURL: myPhotoURL || null };

    // Preenche os slots restantes com jogadores aguardando ou IAs (se pré-selecionado)
    let aiPlayersAdded = 0;
    while (Object.keys(playerColors).length < selectedHumanPlayersCount) {
        const nextColor = availableLudoColors.shift();
        if(!nextColor) break; // Todas as cores usadas
        playerColors[nextColor] = {
            id: null, // Slot vago para humanos
            name: `Aguardando ${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[nextColor]}`,
            isAI: false,
            photoURL: null
        };
    }
    // Adiciona IAs se ainda houver slots e a contagem de humanos for < 4
    if (Object.keys(playerColors).length < 4) {
        while (availableLudoColors.length > 0 && aiPlayersAdded < (4 - selectedHumanPlayersCount)) {
            const nextColor = availableLudoColors.shift();
            playerColors[nextColor] = {
                id: `ai_${nextColor}_${Date.now()}`,
                name: `Computador ${aiPlayersAdded + 1}`,
                isAI: true,
                photoURL: null
            };
            aiPlayersAdded++;
        }
    }


    const initialGameState = engine.serialize(); // Estado inicial do tabuleiro Ludo

    await roomRef.set({
      roomCode: roomCode,
      gameType: 'ludo',
      hostUid: myId,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      playerCount: selectedHumanPlayersCount, // O numero REAL de humanos que o host espera
      guestAllowed: true, // Ou false, dependendo da sua regra
      status: 'waiting', // waiting, playing, finished, resigned, abandoned
      playerColors: playerColors, // Mapa de cores para dados dos jogadores e IAs
      state: initialGameState,
      log: []
    });

    gel('display-room-code').textContent = roomCode;
    showScreen('waiting');
    updateWaitingRoomPlayers(playerColors);

    // Quando o host muda a sala, os jogadores são atualizados
    roomRef.on('value', snap => {
      const roomData = snap.val();
      if (!roomData) { // Sala foi removida
        roomRef.off();
        goLobby();
        showLobbyError('A sala foi encerrada pelo host.');
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
    console.error(e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Criar Nova Sala'; }
  }
}

/**
 * Entra em uma sala multiplayer existente.
 */
async function joinGame() {
  if (!currentAuthManager.uid) { showLobbyError('Faça login para entrar em um jogo.'); return; }

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
    const myName = currentPlayer.displayName || currentPlayer.email || 'Jogador';
    const myPhotoURL = currentAuthManager.photoURL;

    // Encontre um slot de cor vazio ou onde eu já esteja
    let foundSlot = false;
    for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
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
        } else if (data.playerColors[color].id === myId) { // Já estou na sala
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

    // Atualiza a UI para a tela de espera
    gel('display-room-code').textContent = code;
    showScreen('waiting');
    updateWaitingRoomPlayers(data.playerColors); // Renderiza jogadores iniciais

    // Monitora a sala para mudanças de estado (status, adição de jogadores)
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
    console.error(e);
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
    } else if (myColor) {
      // Se não sou o host, mas sou um jogador, libero meu slot de cor
      const emptyPlayerSlot = { id: null, name: `Aguardando ${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[myColor]}`, isAI: false, photoURL: null };
      await roomRef.child('playerColors').child(myColor).set(emptyPlayerSlot);
    }
  } catch (e) {
    console.error('Erro ao cancelar/sair da sala:', e);
  } finally {
    roomRef.off(); // Desliga o listener
    roomRef = null;
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
 * Atualiza a lista de jogadores na tela de espera.
 * @param {object} playerColors Objeto contendo os jogadores por cor.
 */
function updateWaitingRoomPlayers(playerColors) {
    const listEl = gel('waiting-players-list');
    const currentPlayersEl = gel('waiting-current-players');
    const maxPlayersEl = gel('waiting-max-players');
    if (!listEl || !currentPlayersEl || !maxPlayersEl) return;

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
            : `Aguardando...`;
        row.innerHTML = `
            <div class="player-color-dot" style="background-color: var(--ludo-${player.color});"></div>
            <span>${nameDisplay} ${player.id === myId ? '(Você)' : ''}</span>
        `;
        listEl.appendChild(row);
        if (player.id !== null && !player.isAI) {
            currentHumanCount++;
        }
    }

    currentPlayersEl.textContent = currentHumanCount;
    // Usa o playerCount do host para saber quantos humanos ele esperava
    roomRef.once('value').then(snap => {
        const data = snap.val();
        if (data) maxPlayersEl.textContent = data.playerCount;
    });

    const btnStartGameHost = gel('btn-start-multiplayer-game-host');
    if (btnStartGameHost) {
        if (currentAuthManager.uid === snap.val().hostUid && currentHumanCount >= 2) { // Exemplo: host pode iniciar com min 2 humanos
            btnStartGameHost.classList.remove('hidden');
        } else {
            btnStartGameHost.classList.add('hidden');
        }
    }
}

/**
 * Inicia o jogo multiplayer A PARTIR DA TELA DE ESPERA (apenas host).
 * Esta função é chamada pelo host para "forçar" o início do jogo assim que tiver jogadores suficientes.
 */
async function startGameAsHost() {
  if (!roomRef) return;
  const snap = await roomRef.once('value');
  const roomData = snap.val();

  if (!roomData || roomData.hostUid !== currentAuthManager.uid) {
    console.warn('Somente o host pode iniciar a partida.');
    return;
  }

  // Verificar se há jogadores suficientes (mínimo 2, por exemplo)
  const currentHumanPlayers = Object.values(roomData.playerColors).filter(p => p && !p.isAI && p.id !== null).length;
  if (currentHumanPlayers < 2) {
    alert('É necessário ter pelo menos 2 jogadores humanos para iniciar a partida.');
    return;
  }

  // Inicia o jogo
  await roomRef.update({ status: 'playing' });
}

/* =====================================================
   LÓGICA DE PARTIDA MULTIPLAYER (APÓS INICIADA)
===================================================== */
/**
 * Inicia o jogo multiplayer quando o status da sala muda para 'playing'.
 * @param {object} roomData Os dados da sala do Firebase.
 */
async function startMultiplayerGame(roomData) {
  console.log('Iniciando jogo multiplayer:', roomData.roomCode);
  roomCode = roomData.roomCode; // Garante que o roomCode global esteja setado
  gameMode = 'multiplayer';
  gameActive = true;
  isSpectator = false;

  // Deserializa o estado inicial do jogo
  engine.deserialize(roomData.state);

  // Define myColor se ainda não estiver definido (para spectator ou se join foi o first trigger)
  if (!myColor) {
      for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
          if (roomData.playerColors[color] && roomData.playerColors[color].id === myId) {
              myColor = color;
              break;
          }
      }
  }

  // Preenche o array de players do engine com os dados da sala
  const enginePlayers = [];
  for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
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
  engine.players = enginePlayers; // Atualiza o engine com a lista completa de jogadores do firebase

  // Esconder/mostrar botões de controle
  gel('btn-resign').classList.remove('hidden');
  gel('btn-start-ai-game').classList.add('hidden'); // Esconde botão de iniciar AI
  gel('btn-new-game').classList.add('hidden');
  gel('btn-back-lobby').classList.add('hidden');
  gel('spectator-bar').classList.add('hidden');

  showScreen('game');
  renderGame(); // Renderiza o estado inicial do jogo

  // Inicia o listener para atualizações de estado do jogo via Firebase.
  if (roomRef) {
    roomRef.on('value', snap => {
      const liveRoomData = snap.val();
      if (!liveRoomData) {
        console.log('Sala foi removida, jogo multiplayer encerrado.');
        showGameOver('Partida Encerrada', 'A sala foi removida pelo host.');
        if (roomRef) { roomRef.off(); roomRef = null; }
        goLobby();
        return;
      }

      // Se o estado do Firebase é mais recente que o local, atualiza o local.
      // Isso deve sincronizar o tabuleiro do multiplayer
      // if (JSON.stringify(engine.serialize()) !== JSON.stringify(liveRoomData.state)) {
        engine.deserialize(liveRoomData.state); // Atualiza o engine local
        renderGame(); // Redesenha a UI
      // }


      // === Lógica de Fim de Jogo (Resign/Finished/Abandoned) ===
      if (!gameActive) return; // Se o jogo já acabou localmente, não processa mais fim de jogo do Firebase.

      if (liveRoomData.status === 'resigned' || liveRoomData.status === 'finished' || liveRoomData.status === 'abandoned') {
        gameActive = false; // Finaliza o jogo localmente

        let title = 'Partida Encerrada';
        let message = 'O jogo terminou.';
        let result = 'draw'; // Padrão
        let winnerPlayer = null;

        if (liveRoomData.status === 'resigned') {
            winnerPlayer = engine.players.find(p => p.color === liveRoomData.winner);
            title = 'Partida Finalizada';
            message = `${winnerPlayer ? winnerPlayer.name : 'Um jogador'} desistiu.`;
            result = (liveRoomData.winner && liveRoomData.playerColors[liveRoomData.winner].id === myId) ? 'win' : 'loss';
        } else if (liveRoomData.status === 'finished' && liveRoomData.winner) {
            winnerPlayer = engine.players.find(p => p.id === liveRoomData.winner);
            title = 'Fim de Jogo! 🏁';
            message = `${winnerPlayer ? winnerPlayer.name : 'Um jogador'} venceu!`;
            result = (liveRoomData.winner === myId) ? 'win' : 'loss';
        } else if (liveRoomData.status === 'abandoned') {
            title = 'Partida Abandonada';
            message = `Um jogador (${liveRoomData.abandonedPlayerName || 'desconhecido'}) abandonou a partida.`;
            // Lógica para atribuir vitória a quem ficou na partida
            const remainingPlayers = engine.players.filter(p => p.id !== liveRoomData.abandonedPlayerId && !p.isAI);
            if(remainingPlayers.some(p => p.id === myId)) {
                result = 'win';
            } else {
                result = 'loss'; // Se eu também saí ou sou IA envolvida no abandono
            }
        }

        historyManager.saveGame({
            gameType: 'ludo',
            uid: currentAuthManager.uid,
            isAnonymous: currentAuthManager.isAnonymous,
            mode: gameMode,
            players: engine.players.map(p => ({ id: p.id, name: p.name, color: p.color, isAI: p.isAI, photoURL: p.photoURL })),
            myColor: myColor,
            result: result,
            endedAt: Date.now(),
        });
        historyManager.removeLudoLiveGame(roomCode); // Remove da lista de jogos ao vivo

        showGameOver(title, message);
        if (roomRef) { roomRef.off(); roomRef = null; }
        return;
      }

      // Se é a vez de uma IA no multiplayer
      const activePlayer = engine.activePlayer;
      if (engine.status === 'playing' && activePlayer.isAI && activePlayer.id !== myId && !aiThinking) {
        // Assume que o host é responsável por rodar os turnos das IAs
        if (roomData.hostUid === myId) {
            setTimeout(doAITurn, 1500); // Host executa o turno da IA
        }
      }
    });
  }

  // Se for o host da sala, também salva o jogo na lista de jogos ao vivo
  if (roomData.hostUid === currentAuthManager.uid) {
    historyManager.saveLudoLiveGame(roomData.roomCode, roomData);
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
  // botões do modal de gameover
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
window.isMyTurn = isMyTurn; // Tornar global para acesso de outras funções, se necessário

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
          await roomRef.update({status: 'finished', winner: myId});
          historyManager.removeLudoLiveGame(roomCode);
          roomRef.off();
          roomRef = null;
      }
      return;
  }

  // Verifica se há movimentos válidos. Se não, passa o turno automaticamente.
  if (engine.phase === 'move' && engine.getValidMoves().length === 0) {
    engine.logEvent(myColor, `Sem movimentos válidos para ${currentAuthManager.displayName}. Passando a vez.`);
    await new Promise(resolve => setTimeout(resolve, 800)); // Pequeno delay antes de passar o turno
    engine.nextTurn();
    renderGame();
    // Se for multiplayer, atualiza o Firebase.
    if (gameMode === 'multiplayer' && roomRef) {
      await roomRef.update({
        state: engine.serialize(),
        log: engine.log
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
        log: engine.log
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
            await roomRef.update({status: 'finished', winner: engine.winner});
            historyManager.removeLudoLiveGame(roomCode);
            roomRef.off();
            roomRef = null;
        }
        return;
    }

    // Se o jogo continua, atualiza o Firebase após o movimento
    if (gameMode === 'multiplayer' && roomRef) {
      await roomRef.update({
        state: engine.serialize(),
        log: engine.log
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
  myColor = window.LUDO_CONSTANTS.LUDO_COLORS[0]; // Jogador sempre vermelho no modo AI

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

  // Adiciona as IAs
  // Pega as cores restantes SEM incluir a cor do jogador humano
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

  engine.setupGame(playerConfigs); // Configura o jogo com os jogadores (Humano + AI)

  // Atualiza UI dos botões
  gel('btn-resign').classList.remove('hidden');
  gel('btn-start-ai-game').classList.add('hidden'); // Esconde botão de iniciar AI
  gel('btn-new-game').classList.add('hidden');
  gel('btn-back-lobby').classList.add('hidden');
  gel('spectator-bar').classList.add('hidden');

  showScreen('game');
  renderGame();

  if (engine.activePlayer.isAI) {
    setTimeout(doAITurn, 1500); // Se o primeiro turno for da IA, agenda o movimento
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
  await new Promise(resolve => setTimeout(resolve, 800)); // Atraso para rolar

  engine.rollDice();
  renderGame(); // Atualiza o dado e o tabuleiro com o roll da IA

  if (engine.status === 'finished') {
    // A IA rolou e venceu
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

  // Se a IA rolou e não há movimentos válidos (raro), ela passa o turno
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

      // Atraso para o movimento da IA com base na "dificuldade" (simulada)
      const delay = 1000 + (Math.random() * 500); // 1 a 1.5 segundos
      await new Promise(resolve => setTimeout(resolve, delay));

      const pawnIndexToMove = ai.getBestMove(engine); // AI escolhe a melhor peça para mover

      if (pawnIndexToMove !== null) {
          engine.doMovePawn(pawnIndexToMove);
          aiThinking = false;
          renderGame();

          if (engine.status === 'finished') {
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
        // Fallback: se a IA não encontrar movimento (não deveria acontecer aqui com getValidMoves)
        console.warn('AI não encontrou um movimento válido após rolar o dado.');
        engine.nextTurn();
        aiThinking = false;
        renderGame();
        if (engine.activePlayer.isAI) setTimeout(doAITurn, 1500);
      }
  }
  // Após a IA ter terminado seu turno ou passado, reabilita o botão de resign
  gel('btn-resign').disabled = false;
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
    if (data.status === 'finished' || data.status === 'resigned' || data.status === 'abandoned') {
      showLobbyError('Partida já encerrou.'); return;
    }

    isSpectator = true; roomCode = code; myColor = null; // Spectator não tem "myColor"
    engine.deserialize(data.state); // Carrega o estado atual do jogo

    // Preenche o array de players do engine com os dados da sala para exibir no sidebar
    const enginePlayers = [];
    for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
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
    gel('btn-resign').classList.add('hidden');
    gel('btn-start-ai-game').classList.add('hidden');
    gel('btn-new-game').classList.add('hidden');
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
      const updatedEnginePlayers = [];
      for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
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
        // Não mostra modal de game over para espectador, apenas atualiza a barra.
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
 * Desiste da partida atual.
 */
async function resign() {
  if (!gameActive || isSpectator || !currentAuthManager.uid || currentAuthManager.isAnonymous) return;
  if (!confirm('Tem certeza que deseja desistir da partida? Isso contará como uma derrota.')) return;

  gameActive = false;
  aiThinking = false;

  let winnerId = null;
  let winnerColor = null;

  if (gameMode === 'multiplayer') {
      // Se multiplayer, o vencedor é o próximo jogador humano ou o host se houver IAs.
      const remainingHumanPlayers = engine.players.filter(p => p.id !== myId && !p.isAI);
      if (remainingHumanPlayers.length > 0) {
          winnerId = remainingHumanPlayers[0].id;
          winnerColor = remainingHumanPlayers[0].color;
      } else if (roomRef && (await roomRef.child('hostUid').once('value')).val() === myId) {
          // Se sou o host e não há outros humanos, eu (o host) que estou desistindo. Quem ganha? Ninguém ou a IA.
          // Para simplificar, vou atribuir a vitória para a próxima IA se tiver, senão o jogo fica sem vencedor.
          const firstAi = engine.players.find(p => p.isAI);
          if (firstAi) {
              winnerId = firstAi.id;
              winnerColor = firstAi.color;
          }
      } else {
          // Se não sou host e não há outros humanos, quem ganhou? O host ou a IA.
          const hostUid = (await roomRef.child('hostUid').once('value')).val();
          if (hostUid) {
              const hostPlayer = engine.players.find(p => p.id === hostUid);
              if (hostPlayer) {
                  winnerId = hostPlayer.id;
                  winnerColor = hostPlayer.color;
              }
          }
      }

      if (roomRef) {
          await roomRef.update({
              status: 'resigned',
              winner: winnerColor, // Salva a cor do vencedor
              abandonedPlayerId: myId,
              abandonedPlayerName: currentAuthManager.displayName,
              state: engine.serialize() // Salva o estado final
          }).catch(e => console.error('Erro ao atualizar sala para resignação:', e));
          roomRef.off();
          roomRef = null;
          historyManager.removeLudoLiveGame(roomCode);
      }
  } else { // Modo AI
      // A IA "vence" quando o humano desiste
      const aiPlayer = engine.players.find(p => p.isAI);
      if (aiPlayer) {
          winnerId = aiPlayer.id;
          winnerColor = aiPlayer.color;
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
        isMe: p.id === myId,
        photoURL: p.photoURL
    })),
    myColor: myColor,
    result: 'loss', // Desistência é sempre perda para quem desiste
    endedAt: Date.now(),
  });

  const winnerNameDisplay = winnerId ? (engine.players.find(p => p.id === winnerId)?.name || 'Oponente') : 'Ninguém';
  showGameOver('Você Desistiu! 🏳️', `A vitória foi para ${winnerNameDisplay}.`);
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
    iconEl.textContent = title.includes('Venceu') || title.includes('Vitória') ? '🏆'
      : title.includes('Desistiu') || title.includes('Perdeu') ? '❌' : '🎲'; // Ícone padrão
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
  if (!boardEl) {
    console.error('Elemento #ludo-board não encontrado.');
    return;
  }
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

      // Adiciona classe 'safe' para casas seguras no PATH_COORDS
      const pathIdx = window.LUDO_CONSTANTS.PATH_COORDS.findIndex(coord => coord[0] === r && coord[1] === c);
      if (pathIdx !== -1 && window.LUDO_CONSTANTS.SAFE_SQUARES.includes(pathIdx)) {
        cell.classList.add('safe');
      }

      boardEl.appendChild(cell);
      BOARD_CELLS_DOM[r][c] = cell; // Guarda referência ao elemento DOM
    }
  }
  console.log('DOM do tabuleiro Ludo construído. Referências guardadas.');
}

/**
 * Identifica a "zona" (cor ou neutra) de uma célula específica do tabuleiro 15x15.
 * Usado para aplicar estilos de fundo.
 * @param {number} r Linha da célula.
 * @param {number} c Coluna da célula.
 * @returns {string} A zona (red, blue, green, yellow, center, neutral)
 */
function getCellZone(r, c) {
  // Bases (6x6)
  if (r >=0 && r <=5 && c >=0 && c <=5) return 'red-base';
  if (r >=0 && r <=5 && c >=9 && c <=14) return 'blue-base';
  if (r >=9 && r <=14 && c >=9 && c <=14) return 'green-base';
  if (r >=9 && r <=14 && c >=0 && c <=5) return 'yellow-base';

  // Centros de área de partida (círculos grandes dentro das bases)
  // Ajuste estes ranges conforme o seu design de CSS
  if ((r === 2 || r === 3) && (c === 2 || c === 3) && getCellZone(r,c).includes('red')) return 'red-start-inner';
  if ((r === 2 || r === 3) && (c === 11 || c === 12) && getCellZone(r,c).includes('blue')) return 'blue-start-inner';
  if ((r === 11 || r === 12) && (c === 11 || c === 12) && getCellZone(r,c).includes('green')) return 'green-start-inner';
  if ((r === 11 || r === 12) && (c === 2 || c === 3) && getCellZone(r,c).includes('yellow')) return 'yellow-start-inner';


  // Corredores finais (Home Paths, 6 casas de cada cor) com a cor correspondente
  if (r === 7 && c >= 1 && c <= 6) return 'red-homepath';
  if (c === 7 && r >= 1 && r <= 6) return 'blue-homepath';
  if (r === 7 && c >= 8 && c <= 13) return 'green-homepath';
  if (c === 7 && r >= 8 && r <= 13) return 'yellow-homepath';

  // Centro final (casa final do jogo)
  if (r === 7 && c === 7) return 'center-final';

  // Casas de entrada para o tabuleiro principal
  if (window.LUDO_CONSTANTS.ENTRY_POS.red[0] === r && window.LUDO_CONSTANTS.ENTRY_POS.red[1] === c) return 'red-entry';
  if (window.LUDO_CONSTANTS.ENTRY_POS.blue[0] === r && window.LUDO_CONSTANTS.ENTRY_POS.blue[1] === c) return 'blue-entry';
  if (window.LUDO_CONSTANTS.ENTRY_POS.green[0] === r && window.LUDO_CONSTANTS.ENTRY_POS.green[1] === c) return 'green-entry';
  if (window.LUDO_CONSTANTS.ENTRY_POS.yellow[0] === r && window.LUDO_CONSTANTS.ENTRY_POS.yellow[1] === c) return 'yellow-entry';

  return 'neutral-path'; // Trilhas neutras do caminho principal
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
        console.warn(`Coordenadas inválidas para peão ${player.color}-${pawnIdx}: [${coords}]`);
        return;
      }

      const cellElement = BOARD_CELLS_DOM[coords[0]][coords[1]];
      if (!cellElement) {
        console.warn(`Elemento da célula DOM não encontrado para [${coords[0]}, ${coords[1]}]`);
        return;
      }

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
    const card = document.createElement('div');
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
          // Se a peça está na base e o dado é 6, ela está "ready" para sair
          if (pawn.pos === -1 && engine.diceValue === 6 && isMyTurn() && player.id === currentAuthManager.uid) {
            dot.classList.add('ready');
          } else if (pawn.pos !== -1 || pawn.homeStep !== -1) {
            dot.style.backgroundColor = `var(--ludo-${player.color})`; // Peça já saiu (no caminho principal ou corredor final)
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
    bar.textContent = `Partida encerrada! Vencedor: ${activePlayer.name} (${window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[activePlayer.color]}) 🏆`;
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
    const games = await historyManager.loadLudoHistory(currentAuthManager.uid);

    if (!games || games.length === 0) {
      if (listEl) listEl.innerHTML = '<div class="history-empty">Nenhuma partida de Ludo ainda.<br>Jogue sua primeira partida!</div>';
      return;
    }

    const wins = games.filter(g => g.result === 'win').length;
    const losses = games.filter(g => g.result === 'loss' || g.result === 'resigned').length;
    const draws = games.filter(g => g.result === 'draw').length; // Desenhos são possíveis se o jogo for declarado um empate.

    if (statsEl) statsEl.innerHTML =
      `<span class="stat stat-win">🏆 Vitórias: ${wins}</span> ` +
      `<span class="stat stat-loss">❌ Derrotas: ${losses}</span> ` +
      `<span class="stat stat-draw">🤝 Empates: ${draws}</span>`;

    if (listEl) listEl.innerHTML = '';

    // Ordena os jogos por data mais recente primeiro
    games.sort((a,b) => b.endedAt - a.endedAt);

    games.forEach(game => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const resClassMap = { win: 'result-win', loss: 'result-loss', draw: 'result-draw', resigned: 'result-loss' };
      const resTextMap = { win: 'Vitória 🏆', loss: 'Derrota ❌', draw: 'Empate 🤝', resigned: 'Desistência 🏳️' };
      const resClass = resClassMap[game.result] || '';
      const resText = resTextMap[game.result] || game.result;

      // Obtém o nome dos oponentes
      let opponentDisplayNames = game.players
        .filter(p => !p.isMe && !p.isAI && p.id !== null) // Filtra `isMe` que é o próprio jogador na partida
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

      let playerDisplayNames = game.players
        .filter(p => !p.isAI && p.id !== null)
        .map(p => escapeHtml(p.name));
      let aiCount = game.players.filter(p => p.isAI).length;

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
          <span class="history-moves">${game.players.length} slots</span>
        </div>
        <div class="history-card-right">
          <span class="history-date">${date}</span>
          <button class="btn btn-small btn-secondary">👁 Assistir</button>
        </div>
      `;
      card.querySelector('button').addEventListener('click', () => {
        gel('input-spectate').value = game.roomCode; // Usar roomCode para spectate
        spectateGame();
      });
      if (listEl) listEl.appendChild(card);
    });
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="history-empty">Erro ao carregar partidas ao vivo.</div>';
    console.error('Erro ao carregar partidas de Ludo ao vivo:', e);
  }
}