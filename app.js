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
   CONSTANTES E TRADUÇÕES
===================================================== */
const LUDO_COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_TRANSLATIONS = {
  red: 'Vermelho', blue: 'Azul', green: 'Verde', yellow: 'Amarelo'
};

const PIECES_SYMBOLS = {
  red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡'
};

/* =====================================================
   ESTADO GLOBAL DA APLICAÇÃO
===================================================== */
let firebaseApp, db, fbAuth, currentUser = null;
let currentAuthManager = null; // Instância do AuthManager
let historyManager = null;     // Instância do GameHistoryManager
let engine = new LudoEngine(); // Instância do motor do Ludo
let ai = new LudoAI();         // Instância da IA do Ludo

let roomCode = null;
let roomRef = null;
let specRef = null;
let myId = null;     // UID do Firebase para usuários logados ou um ID temporário para convidados.
let myColor = null;    // Cor do jogador atual na partida
let gameActive = false;
let gameMode = 'multiplayer';  // 'multiplayer' ou 'ai'
let aiThinking = false;
let selectedAiCount = 1;       // Quantidade de IAs no modo VS AI
let selectedHumanPlayersCount = 2; // Qtd de players humanos (incluindo eu) para criar sala
let isSpectator = false;

/* =====================================================
   FUNÇÕES HELPER
===================================================== */

/**
 * Adiciona um event listener a um elemento por ID, com verificação de existência.
 * @param {string} id O ID do elemento.
 * @param {string} event O nome do evento.
 * @param {function} handler A função de callback.
 */
function el(id, event, handler) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener(event, handler);
  } else {
    // console.warn(`#${id} não encontrado para evento '${event}'`);
  }
}

/**
 * Obtém um elemento por ID, com verificação de existência.
 * @param {string} id O ID do elemento.
 * @returns {HTMLElement|null} O elemento ou null.
 */
function gel(id) {
  return document.getElementById(id);
}

/**
 * Escapa strings para uso seguro em HTML.
 * @param {string} str A string a ser escapada.
 * @returns {string} A string escapada.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* =====================================================
   BOOTSTRAP DA APLICAÇÃO
===================================================== */
window.addEventListener('DOMContentLoaded', () => {
  try {
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    fbAuth = firebase.auth();

    currentAuthManager = new AuthManager();
    currentAuthManager.init(); // Inicializa o AuthManager e configura o onAuthStateChanged

    historyManager = new GameHistoryManager(); // Inicializa o GameHistoryManager

  } catch (e) {
    console.error('Firebase init error:', e);
    // Exibir mensagem de erro robusta na interface se o Firebase não carregar
    gel('screen-auth').innerHTML = '<div class="auth-container" style="max-width: 500px; text-align:center;">' +
      '<h2 style="color:red;">Erro ao Iniciar o Firebase</h2>' +
      '<p style="color:var(--text-muted);">Verifique sua conexão com a internet ou as configurações do Firebase.</p>' +
      `<p style="font-size:12px;color:var(--text-muted);">${escapeHtml(e.message)}</p>` +
      '</div>';
    showScreen('auth');
    return;
  }

  // Inicializa os manipuladores de UI para as diferentes seções
  initAuthUI();
  initLobbyUI();
  initGameUI();
  initHistoryUI(); // Adicionado para inicializar a UI de histórico

  // O AuthManager já trata o onAuthStateChanged, então apenas usamos seu listener
  currentAuthManager.onChange(user => {
    currentUser = user;
    if (user) {
      myId = user.uid; // Define o ID do usuário globalmente.
      updateHeaderUI(user);
      showScreen('lobby');
    } else {
      myId = 'guest_' + Math.random().toString(36).slice(2, 8); // ID temporário para convidados.
      updateHeaderUI(null);
      showScreen('auth');
    }
  });

  // Garante que a tela inicial seja de autenticação enquanto o Firebase carrega
  showScreen('auth');
});

/**
 * Atualiza a UI do cabeçalho com informações do usuário.
 * @param {firebase.User|null} user O objeto do usuário autenticado.
 */
function updateHeaderUI(user) {
  const headerName = gel('header-username');
  const headerPhoto = gel('header-photo');
  const headerInitials = gel('header-initials');
  const btnLogout = gel('btn-logout');

  if (user) {
    const name = user.displayName || (user.email ? user.email.split('@')[0] : '') || 'Jogador';
    const photoURL = user.photoURL || null;

    if (headerName) headerName.textContent = name;

    if (photoURL && headerPhoto && headerInitials) {
      headerPhoto.src = photoURL;
      headerPhoto.classList.remove('hidden');
      headerInitials.style.display = 'none';
    } else if (headerInitials) {
      headerPhoto.classList.add('hidden');
      headerInitials.style.display = 'flex';
      const initials = name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
      headerInitials.textContent = initials || '?';
    }
    if (btnLogout) btnLogout.classList.remove('hidden');

  } else {
    // Usuário deslogado ou convidado
    if (headerName) headerName.textContent = 'Visitante';
    if (headerPhoto) { headerPhoto.src = ''; headerPhoto.classList.add('hidden'); }
    if (headerInitials) {
      headerInitials.style.display = 'flex';
      headerInitials.textContent = '?';
    }
    if (btnLogout) btnLogout.classList.add('hidden'); // Esconde o botão de sair se não houver usuário logado
  }
}

/* =====================================================
   INIT — AUTH UI - Manipuladores e Event Listeners
===================================================== */
function initAuthUI() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      const tl = gel('tab-login');
      const tr = gel('tab-register');
      if (tl) tl.classList.toggle('hidden', target !== 'login');
      if (tr) tr.classList.toggle('hidden', target !== 'register');
      clearAuthError();
    });
  });

  el('btn-login-email', 'click', () => currentAuthManager.loginWithEmail(gel('login-email').value, gel('login-password').value)
    .catch(e => showAuthError(authErrorMsg(e.code))));
  el('login-password', 'keydown', e => {
    if (e.key === 'Enter')
      currentAuthManager.loginWithEmail(gel('login-email').value, gel('login-password').value)
        .catch(err => showAuthError(authErrorMsg(err.code)));
  });
  el('btn-login-google', 'click', () => currentAuthManager.loginWithGoogle()
    .catch(e => { if (e.code !== 'auth/popup-closed-by-user') showAuthError(authErrorMsg(e.code)); }));
  el('btn-register', 'click', async () => {
    const name = gel('reg-name').value.trim();
    const email = gel('reg-email').value.trim();
    const pass = gel('reg-password').value;
    if (!name) { showAuthError('Informe seu nome.'); return; }
    if (!email) { showAuthError('Informe seu e-mail.'); return; }
    if (pass.length < 6) { showAuthError('Senha mínima de 6 caracteres.'); return; }
    try {
      await currentAuthManager.registerWithEmail(email, pass, name);
    } catch (e) { showAuthError(authErrorMsg(e.code)); }
  });
  el('btn-register-google', 'click', () => currentAuthManager.loginWithGoogle()
    .catch(e => { if (e.code !== 'auth/popup-closed-by-user') showAuthError(authErrorMsg(e.code)); }));
  // No Ludo, não temos login anônimo direto no AuthUI, a menos que seja explicitamente necessário.
  // Por ora, o myId já lida com usuários não autenticados.
}

/**
 * Retorna uma mensagem de erro amigável para códigos de erro do Firebase Auth.
 * @param {string} code O código de erro do Firebase.
 * @returns {string} A mensagem de erro.
 */
function authErrorMsg(code) {
  return ({
    'auth/user-not-found': 'Usuário não encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/email-already-in-use': 'E-mail já cadastrado.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'Senha muito fraca.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
    'auth/popup-closed-by-user': 'Autenticação cancelada.'
  })[code] || 'Erro desconhecido ao autenticar.';
}

/**
 * Exibe uma mensagem de erro na área de autenticação.
 * @param {string} msg A mensagem a ser exibida.
 */
function showAuthError(msg) {
  const el = gel('auth-error');
  if (el) el.textContent = msg;
}

/**
 * Limpa a mensagem de erro da área de autenticação.
 */
function clearAuthError() {
  const el = gel('auth-error');
  if (el) el.textContent = '';
}

/* =====================================================
   INIT — LOBBY UI - Manipuladores e Event Listeners
===================================================== */
function initLobbyUI() {
  el('btn-logout', 'click', () => currentAuthManager.logout());
  el('btn-create', 'click', createGame);
  el('btn-join', 'click', joinGame);
  el('input-room', 'keydown', e => { if (e.key === 'Enter') joinGame(); });
  el('btn-open-history', 'click', openHistoryScreen);
  el('btn-spectate', 'click', spectateGame);
  el('input-spectate', 'keydown', e => { if (e.key === 'Enter') spectateGame(); });
  el('btn-start-ai', 'click', startAIGame);
  el('btn-ludo-live-games', 'click', openLiveGamesScreen);


  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameMode = btn.dataset.mode;
      gel('panel-multiplayer').classList.toggle('hidden', gameMode !== 'multiplayer');
      gel('panel-ai').classList.toggle('hidden', gameMode !== 'ai');
    });
  });

  document.querySelectorAll('.player-count-btns .count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-count-btns .count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedHumanPlayersCount = parseInt(btn.dataset.count);
    });
  });

  document.querySelectorAll('.ai-count-btns .ai-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-count-btns .ai-count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAiCount = parseInt(btn.dataset.ai);
    });
  });
}

/* =====================================================
   INIT — GAME UI - Manipuladores e Event Listeners
===================================================== */
function initGameUI() {
  el('btn-cancel', 'click', cancelGame);
  el('btn-copy', 'click', copyRoomCode);
  el('btn-resign', 'click', resign);
  el('btn-roll', 'click', rollDice); // Botão de rolar dado
  el('btn-new-game', 'click', goLobby); // Ao clicar em "Nova Partida" no game over, volta para lobby para configurar.
  el('btn-back-lobby', 'click', () => {
    if (specRef) { specRef.off(); specRef = null; }
    goLobby();
  });
  el('btn-gameover-new', 'click', () => {
    hideModal('modal-gameover');
    if (gameMode === 'ai') startAIGame(); // Reinicia IA diretamente
    else goLobby(); // Multiplayer sempre volta ao lobby para 'Nova Partida'
  });
  el('btn-gameover-lobby', 'click', () => { hideModal('modal-gameover'); goLobby(); });
}

function initHistoryUI() {
  el('btn-ludo-history-back', 'click', goLobby);
  el('btn-live-games-back', 'click', goLobby);
}

/* =====================================================
   NAVEGAÇÃO E TELAS
===================================================== */

/**
 * Exibe uma tela específica e esconde as outras.
 * @param {string} name O ID da tela (ex: 'auth', 'lobby').
 */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = gel('screen-' + name);
  if (target) target.classList.add('active');
}

/**
 * Exibe um modal específico.
 * @param {string} id O ID do modal.
 */
function showModal(id) { const e = gel(id); if (e) e.classList.remove('hidden'); }

/**
 * Esconde um modal específico.
 * @param {string} id O ID do modal.
 */
function hideModal(id) {
  const e = gel(id);
  if (e) e.classList.add('hidden');
}

/**
 * Volta para a tela do lobby, resetando o estado do jogo.
 */
function goLobby() {
  gameActive = false;
  aiThinking = false;
  isSpectator = false;
  if (roomRef) { roomRef.off(); roomRef = null; }
  if (specRef) { specRef.off(); specRef = null; }
  engine.reset();
  roomCode = null;
  myColor = null;

  // Limpa campos de entrada no lobby
  const inputRoom = gel('input-room');
  const inputSpectate = gel('input-spectate');
  if (inputRoom) inputRoom.value = '';
  if (inputSpectate) inputSpectate.value = '';
  clearLobbyError();
  showScreen('lobby');
}

/**
 * Exibe uma mensagem de erro no lobby.
 * @param {string} msg A mensagem a ser exibida.
 */
function showLobbyError(msg) {
  const el = gel('lobby-error');
  if (el) el.textContent = msg;
}

/**
 * Limpa a mensagem de erro do lobby.
 */
function clearLobbyError() {
  const el = gel('lobby-error');
  if (el) el.textContent = '';
}

/* =====================================================
   GERENCIAMENTO DE SALAS E MULTIPLAYER
===================================================== */

/**
 * Gera um código de sala aleatório.
 * @returns {string} O código da sala.
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Cria uma nova partida multiplayer.
 */
async function createGame() {
  const btn = gel('btn-create');
  if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }
  clearLobbyError();

  const playersConfig = []; // Configuração inicial dos jogadores da sala
  const myName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Jogador';

  // Adiciona o jogador criador da sala (sempre cor vermelha por padrão)
  playersConfig.push({ id: myId, name: myName, color: LUDO_COLORS[0], isAI: false, photoURL: currentAuthManager.photoURL });
  myColor = LUDO_COLORS[0];

  // Adiciona slots para os outros jogadores humanos
  for (let i = 1; i < selectedHumanPlayersCount; i++) {
    playersConfig.push({ id: null, name: `Jogador ${i + 1}`, color: LUDO_COLORS[i], isAI: false, photoURL: null });
  }

  // Preenche os slots restantes com IAs até 4 jogadores totais (se houver espaço)
  for (let i = playersConfig.length; i < LUDO_COLORS.length; i++) {
    playersConfig.push({ id: `ai_${LUDO_COLORS[i]}`, name: `IA ${COLOR_TRANSLATIONS[LUDO_COLORS[i]]}`, color: LUDO_COLORS[i], isAI: true, photoURL: null });
  }

  try {
    roomCode = generateRoomCode();
    roomRef = db.ref('ludo_rooms/' + roomCode); // Usa 'ludo_rooms'

    // Reinicia e configura o motor do Ludo com os jogadores iniciais
    engine.reset();
    engine.setup(playersConfig); // Configura o motor com a lista completa de jogadores
    const serializedState = engine.serialize(); // Serializa o estado inicial

    await roomRef.set({
      players: playersConfig.map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isAI: p.isAI,
        photoURL: p.photoURL || null
      })),
      humanPlayersRequired: selectedHumanPlayersCount, // Qtd de slots que precisam ser preenchidos por humanos
      state: serializedState,
      createdAt: firebase.database.ServerValue.TIMESTAMP, // Usar timestamp do servidor
      status: 'waiting'
    });

    // Timeout para remover a sala se ninguém entrar (10 minutos)
    setTimeout(async () => {
      if (!roomRef) return;
      const snap = await roomRef.once('value');
      if (snap.exists() && snap.val()?.status === 'waiting') {
        await roomRef.remove();
        // Verifica se a sala ainda é a que o usuário criou antes de redirecionar para o lobby
        if (roomCode === snap.key) { // Usamos snap.key porque roomCode pode ter sido resetado
          goLobby();
          showLobbyError('Sua sala foi removida por inatividade.');
        }
      }
    }, 600000); // 10 minutos

    const drc = gel('display-room-code');
    if (drc) drc.textContent = roomCode;
    showScreen('waiting');

    // Listener para atualizações da sala
    roomRef.on('value', snap => {
      const data = snap.val();
      if (!data) { // Sala foi removida
        roomRef.off();
        goLobby();
        showLobbyError('A sala foi removida.');
        return;
      }

      updateWaitingList(data.players || [], data.humanPlayersRequired);

      if (data.status === 'playing' && data.state) {
        roomRef.off(); // Desliga o listener da sala
        engine.deserialize(data.state);
        startGameScreen(data.players);
      }
    });

  } catch (e) {
    showLobbyError('Erro ao criar sala: ' + e.message);
    console.error('Erro ao criar sala:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Criar Partida'; }
  }
}

/**
 * Entra em uma partida multiplayer existente.
 */
async function joinGame() {
  const input = gel('input-room');
  const code = input ? input.value.trim().toUpperCase() : '';
  clearLobbyError();
  if (code.length !== 6) { showLobbyError('Código da sala deve ter 6 caracteres.'); return; }

  const btn = gel('btn-join');
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

  try {
    roomRef = db.ref('ludo_rooms/' + code); // Usa 'ludo_rooms'
    const snap = await roomRef.once('value');
    const data = snap.val();

    if (!data) { showLobbyError('Sala não encontrada.'); roomRef = null; return; }
    if (data.status !== 'waiting') { showLobbyError('Partida já começou ou encerrou.'); roomRef = null; return; }

    // Encontra o primeiro slot humano vazio
    let emptySlotIndex = -1;
    for (let i = 0; i < data.players.length; i++) {
        if (!data.players[i].isAI && data.players[i].id === null) {
            emptySlotIndex = i;
            break;
        }
    }

    if (emptySlotIndex === -1) { showLobbyError('Sala cheia de jogadores humanos.'); roomRef = null; return; }
    if (data.players.some(p => p.id === myId)) { // Verifica se o usuário já está na sala
      showLobbyError('Você já está nesta sala.');
      // Ocultar modal e seguir para a tela de espera, se status ainda for waiting
      if (data.status === 'waiting') {
        roomCode = code;
        const existingPlayer = data.players.find(p => p.id === myId);
        myColor = existingPlayer ? existingPlayer.color : null;
        showScreen('waiting');
        const drc = gel('display-room-code');
        if (drc) drc.textContent = roomCode;
        updateWaitingList(data.players, data.humanPlayersRequired);

        // Listener para atualizações da sala
        roomRef.on('value', snap => {
          const d = snap.val();
          if (!d) {
            roomRef.off();
            goLobby();
            showLobbyError('A sala foi removida.');
            return;
          }
          updateWaitingList(d.players || [], d.humanPlayersRequired);
          if (d.status === 'playing' && d.state) {
            roomRef.off();
            engine.deserialize(d.state);
            startGameScreen(d.players);
          }
        });
      }
      return;
    }


    roomCode = code;
    myColor = LUDO_COLORS[emptySlotIndex]; // Atribui a cor do slot ao jogador
    const myName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Jogador';

    // Atualiza o slot com os dados do jogador
    const updatedPlayers = [...data.players];
    updatedPlayers[emptySlotIndex] = { id: myId, name: myName, color: myColor, isAI: false, photoURL: currentAuthManager.photoURL };

    // Verifica se todos os slots humanos estão preenchidos para iniciar o jogo
    const currentHumanPlayers = updatedPlayers.filter(p => !p.isAI && p.id !== null).length;
    const allHumanSlotsFilled = currentHumanPlayers >= data.humanPlayersRequired;
    const newStatus = allHumanSlotsFilled ? 'playing' : 'waiting';

    // Atualiza a sala no Firebase
    await roomRef.update({ players: updatedPlayers, status: newStatus });

    // Deserializa o estado do jogo que já estava na sala
    engine.deserialize(data.state);

    if (newStatus === 'playing') {
      startGameScreen(updatedPlayers);
    } else {
      showScreen('waiting');
      const drc = gel('display-room-code');
      if (drc) drc.textContent = roomCode;
      updateWaitingList(updatedPlayers, data.humanPlayersRequired);
    }

    // Listener para atualizações da sala
    roomRef.on('value', snap => {
      const d = snap.val();
      if (!d) { // Sala foi removida
        roomRef.off();
        goLobby();
        showLobbyError('A sala foi removida.');
        return;
      }
      // Se o usuário entrou na sala e ela ainda está esperando, atualiza a lista de espera
      if (d.status === 'waiting') {
        updateWaitingList(d.players || [], d.humanPlayersRequired);
      } else if (d.status === 'playing' && d.state) {
        roomRef.off(); // Desliga o listener quando o jogo começa
        engine.deserialize(d.state);
        startGameScreen(d.players);
      }
    });

  } catch (e) {
    showLobbyError('Erro ao entrar na sala: ' + e.message);
    console.error('Erro ao entrar na sala:', e);
    roomRef = null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

/**
 * Permite que um usuário assista a uma partida em andamento.
 */
async function spectateGame() {
  const input = gel('input-spectate');
  const code = input ? input.value.trim().toUpperCase() : '';
  clearLobbyError();
  if (code.length !== 6) { showLobbyError('Código da sala deve ter 6 caracteres.'); return; }

  try {
    specRef = db.ref('ludo_rooms/' + code); // Usa 'ludo_rooms'
    const snap = await specRef.once('value');
    const data = snap.val();

    if (!data) { showLobbyError('Sala não encontrada.'); specRef = null; return; }
    if (data.status === 'waiting') { showLobbyError('Partida ainda não começou.'); specRef = null; return; }
    // As partidas 'finished' também podem ser assistidas no modo spectate, mas não ficarão "ao vivo"

    isSpectator = true;
    roomCode = code;
    myColor = null; // Espectador não tem uma cor associada para jogar
    engine.deserialize(data.state); // Carrega o estado atual do jogo

    startGameScreen(data.players);
    gel('spectator-bar').classList.remove('hidden');

    specRef.on('value', snap => {
      const d = snap.val();
      if (!d) { // Sala foi removida ou finalizada
        specRef.off();
        goLobby();
        showLobbyError('A partida que você estava assistindo foi encerrada ou removida.');
        return;
      }
      engine.deserialize(d.state);
      renderGame();
      if (d.status === 'finished' || d.status === 'resigned' || d.status === 'abandoned') {
        logEvent('Partida encerrada.', 'neutral');
        specRef.off();
        gel('spectator-bar').textContent = 'Partida encerrada.';
        gel('btn-roll').classList.add('hidden'); // Garante que o botão de rolar seja escondido
      }
    });
  } catch (e) {
    showLobbyError('Erro ao conectar para assistir: ' + e.message);
    console.error('Erro ao assistir partida:', e);
    specRef = null;
  }
}

/**
 * Remove a sala criada pelo usuário.
 */
async function cancelGame() {
  if (roomRef) {
    // Apaga a sala se for o criador. Se não for, apenas sai dela.
    // As regras de segurança do Firebase devem controlar isso.
    await roomRef.remove().catch(e => {
      console.warn('Falha ao remover a sala, pode já ter sido removida ou você não tem permissão.', e);
    });
    roomRef.off(); // Desliga o listener
    roomRef = null;
  }
  goLobby();
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
      console.error('Falha ao copiar:', err);
      const fb = gel('copy-feedback');
      if (fb) { fb.textContent = 'Erro ao copiar.'; }
    });
  }
}

/**
 * Atualiza a lista de jogadores na tela de espera.
 * @param {Array<Object>} players A lista de objetos de jogador.
 * @param {number} humanPlayersRequired O número de slots humanos necessários.
 */
function updateWaitingList(players, humanPlayersRequired) {
  const list = gel('waiting-players-list');
  if (!list) return;
  list.innerHTML = '';

  let currentHumanPlayers = 0;
  players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'waiting-player-row';
    let playerStatus = '';

    if (p.id === myId) {
      playerStatus = ' (Você)';
      currentHumanPlayers++;
    } else if (p.isAI) {
      playerStatus = ' (IA)';
    } else if (p.id === null) {
      playerStatus = ' (Aguardando...)';
    } else { // Outro jogador humano
      currentHumanPlayers++;
    }

    row.innerHTML = `<span class="player-color-dot ${p.color}" style="background-color: var(--${p.color});"></span> ${escapeHtml(p.name)}${playerStatus}`;
    list.appendChild(row);
  });

  const waitingCountEl = gel('waiting-human-count');
  const waitingTotalEl = gel('waiting-human-total');
  if (waitingCountEl) waitingCountEl.textContent = currentHumanPlayers;
  if (waitingTotalEl) waitingTotalEl.textContent = humanPlayersRequired;
}

/* =====================================================
   MODO VS IA
===================================================== */

/**
 * Inicia uma partida contra a IA.
 */
function startAIGame() {
  gameMode = 'ai';
  // Redefine engine e playersConfig para uma nova partida AI
  engine.reset();

  const myName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Jogador';
  const playersConfig = [];

  const availableColors = [...LUDO_COLORS]; // Copia para não modificar o original

  // Adiciona o jogador humano (sempre a primeira cor disponível)
  myColor = availableColors.shift(); // Pega a primeira cor disponível
  playersConfig.push({ id: myId, name: myName, color: myColor, isAI: false, photoURL: currentAuthManager.photoURL });

  // Adiciona as IAs selecionadas
  for (let i = 0; i < selectedAiCount; i++) {
    const aiColor = availableColors.shift(); // Pega a próxima cor disponível
    if (aiColor) {
      playersConfig.push({ id: `ai_${aiColor}`, name: `IA ${COLOR_TRANSLATIONS[aiColor]}`, color: aiColor, isAI: true, photoURL: null });
    }
  }

  // Preenche quaisquer slots restantes com IAs se o total de jogadores for menor que COLORS.length
  while (playersConfig.length < LUDO_COLORS.length) {
    const aiColor = availableColors.shift();
    if (aiColor) {
      playersConfig.push({ id: `ai_${aiColor}_auto`, name: `IA ${COLOR_TRANSLATIONS[aiColor]}`, color: aiColor, isAI: true, photoURL: null });
    }
  }

  engine.setup(playersConfig); // Configura o motor com a lista final de jogadores
  startGameScreen(playersConfig); // Inicia a tela de jogo

  // Se o primeiro jogador for IA, agenda o movimento da IA
  if (engine.activePlayer.isAI) {
    if (engine.activePlayer.id !== myId) { // Confirmar que não é o jogador humano que está "fingindo" ser IA.
       setTimeout(doAITurn, 1500); // Dá um pequeno delay para a UI renderizar
    } else {
        // Isso pode acontecer se, por algum motivo, o myId esteja atrelado a uma IA, o que não é o esperado.
        console.warn('Erro: Jogador humano com ID de IA.', myId, engine.activePlayer.id);
    }
  }
}

/**
 * Inicia a tela de jogo, configurando o tabuleiro e listeners.
 * @param {Array<Object>} players A lista de jogadores configurados para a partida.
 */
function startGameScreen(players) {
  gameActive = true;
  isSpectator = false; // Garante que não é espectador ao iniciar o jogo

  // Re-configura o motor com a lista final de jogadores da sala ou da IA.
  // Isso é importante para garantir que `engine.players` reflita o estado exato.
  engine.setup(players);

  buildBoardDOM(); // Constrói o DOM do tabuleiro Ludo uma única vez
  showScreen('game');

  // Ajusta visibilidade de botões
  const show = id => gel(id)?.classList.remove('hidden');
  const hide = id => gel(id)?.classList.add('hidden');

  if (isSpectator) {
    show('btn-back-lobby');
    show('spectator-bar');
    hide('btn-resign');
    hide('btn-roll');
    hide('btn-new-game');
    gel('spectator-bar').textContent = `👁 Assistindo — Sala ${roomCode}`;
  } else {
    show('btn-resign');
    show('btn-roll');
    hide('btn-new-game');
    hide('btn-back-lobby');
    hide('spectator-bar');
  }

  renderGame(); // Renderiza o estado inicial do jogo

  // Inicia o turno da IA se for o caso (para o primeiro jogador, ou após um jogador humano ter jogado no multiplayer)
  if (!isSpectator && engine.activePlayer.isAI && engine.phase === 'roll') { // Garante que a IA comece rolando o dado.
    setTimeout(doAITurn, 1500);
  }
}

/* =====================================================
   LÓGICA DO JOGO
===================================================== */

/**
 * Verifica se é o turno do jogador logado.
 * @returns {boolean} True se for o turno do jogador, false caso contrário.
 */
function isMyTurn() {
  return engine.activePlayer && engine.activePlayer.id === myId;
}

/**
 * Rola o dado para o jogador ativo.
 */
async function rollDice() {
  if (!gameActive || isSpectator || aiThinking || !isMyTurn() || engine.phase !== 'roll') return;

  const btnRoll = gel('btn-roll');
  if (btnRoll) { btnRoll.disabled = true; } // Desabilita o botão para evitar cliques múltiplos

  // A engine.rollDice já contém a lógica de rolar o dado, verificar movimentos e passar o turno se necessário (se não houver movimentos válidos).
  engine.rollDice();

  const serializedState = engine.serialize();
  renderGame(); // Renderiza o novo dado e status

  if (gameMode === 'multiplayer' && roomRef) {
    await roomRef.update({ state: serializedState });
  }

  // Verifica se o jogo terminou após a simulação (o rollDice pode terminar o jogo se for o último movimento)
  if (engine.status === 'finished') {
    handleGameEnd();
    return;
  }

  // Se o próximo jogador for IA (devido a extra turn ou passagem de turno), agenda.
  if (engine.activePlayer.isAI && engine.activePlayer.id !== myId) {
    setTimeout(doAITurn, 1500); // Pequeno delay antes da IA mover
  }
}

/**
 * Move uma peça clicada pelo jogador humano.
 * @param {number} playerPawnIdx O índice da peça dentro do array de peões do jogador (0-3).
 */
async function doMovePawn(playerPawnIdx) {
  if (!gameActive || isSpectator || aiThinking || !isMyTurn() || engine.phase !== 'move') return;

  // Verifica se a peça clicada pertence ao jogador atual
  const currentPlayer = engine.activePlayer;
  if (!currentPlayer || currentPlayer.id !== myId) {
      logEvent('Não é sua vez ou esta peça não é sua.', 'red');
      return;
  }

  const validMoves = engine.getValidMoves();
  if (!validMoves.includes(playerPawnIdx)) {
    logEvent('Movimento inválido para esta peça com o dado atual.', 'warning');
    return;
  }

  engine.movePawn(playerPawnIdx); // A engine lida com a mudança de fase e turno

  const serializedState = engine.serialize();
  renderGame();

  if (gameMode === 'multiplayer' && roomRef) {
    await roomRef.update({ state: serializedState });
  }

  // Verifica se o jogo terminou
  if (engine.status === 'finished') {
    handleGameEnd();
    return;
  }

  // Se o próximo jogador for IA (devido a extra turn ou mudança de turno), agenda o movimento
  if (engine.activePlayer.isAI && engine.activePlayer.id !== myId) {
    setTimeout(doAITurn, 1500);
  }
}

/**
 * Executa o turno de uma IA.
 */
async function doAITurn() {
  if (!gameActive || isSpectator || !engine.activePlayer.isAI) {
      aiThinking = false; // Garante que o estado seja resetado se não for o turno da IA
      renderGame();
      return;
  }

  aiThinking = true;
  renderGame(); // Atualiza UI para mostrar "IA pensando..."

  await new Promise(resolve => setTimeout(resolve, 1500)); // Simula tempo de pensamento

  if (engine.phase === 'roll') {
    engine.rollDice();
    const serializedState = engine.serialize();
    renderGame(); // Mostra o dado rolado

    if (gameMode === 'multiplayer' && roomRef) {
      await roomRef.update({ state: serializedState });
    }

    // Verifica se o jogo terminou
    if (engine.status === 'finished') {
      handleGameEnd();
      return;
    }

    // Se a IA ainda for o jogador ativo (por extra turn ou porque o "rollDice" a moveu para a fase de "move")
    if (engine.activePlayer.isAI && engine.activePlayer.id !== myId) {
        setTimeout(doAITurn, 1500); // Agenda o próximo passo da IA
    } else {
        aiThinking = false;
        renderGame();
    }

  } else if (engine.phase === 'move') {
    const pawnIdx = ai.getBestMove(engine); // A IA decide qual peão mover
    if (pawnIdx !== null) { // AI encontrou um movimento válido
      engine.movePawn(pawnIdx);
      const serializedState = engine.serialize();
      renderGame(); // Mostra o peão movido

      if (gameMode === 'multiplayer' && roomRef) {
        await roomRef.update({ state: serializedState });
      }

      // Verifica se o jogo terminou
      if (engine.status === 'finished') {
        handleGameEnd();
        return;
      }

      // Se a IA ainda for o jogador ativo (ex: ganhou turno extra), agenda o próximo passo da IA
      if (engine.activePlayer.isAI && engine.activePlayer.id !== myId) {
        setTimeout(doAITurn, 1500);
      } else {
        aiThinking = false;
        renderGame();
      }
    } else { // AI não encontrou movimento válido - deveria passar a vez (já tratado na LudoEngine)
      logEvent(`IA (${engine.activePlayer.name}) não encontrou movimento válido.`, 'neutral');
      // O LudoEngine já deve ter passado o turno se não há movimentos válidos na fase de 'move'
      // Portanto, aqui apenas finalizamos o turno da IA e talvez agendamos a próxima se ainda for IA.
      aiThinking = false;
      renderGame();
      if (engine.activePlayer.isAI && engine.activePlayer.id !== myId) {
          setTimeout(doAITurn, 1500);
      }
    }
  }
}

/**
 * Adiciona uma mensagem ao log do jogo na UI.
 * @param {string} message A mensagem a ser logada.
 * @param {string} color A cor associada à mensagem (red, blue, green, yellow, neutral).
 */
function logEvent(message, color = 'neutral') {
  engine.logEvent(message, color); // Adiciona ao log interno da engine
  renderLog(); // Renderiza o log na UI
}

/**
 * Gerencia o fim de uma partida, atualizando o Firebase e mostrando o modal de Game Over.
 */
async function handleGameEnd() {
  gameActive = false;
  aiThinking = false; // Garante que a IA não estará pensando
  renderGame(); // Renderiza o estado final

  const myPlayer = engine.players.find(p => p.id === myId);
  const result = engine.status === 'finished' && engine.winner === myPlayer.color ? 'win' : 'loss';

  // Salva o jogo no Firebase
  await historyManager.saveGame({
    gameType: 'ludo',
    gameId: roomRef ? roomCode : `ai_${Date.now()}`, // ID da sala ou um ID gerado para AI
    mode: gameMode,
    players: engine.players.map(p => ({ id: p.id, name: p.name, color: p.color, isAI: p.isAI })),
    myColor: myColor,
    result: result,
    endedAt: Date.now(),
  });

  // Atualiza o status da sala para 'finished' no multiplayer
  if (gameMode === 'multiplayer' && roomRef) {
    await roomRef.update({ status: 'finished', winner: engine.winner });
    roomRef.off(); // Desliga o listener da sala
    roomRef = null;
  }

  showGameOver('🏆 Vitória!', `${COLOR_TRANSLATIONS[engine.winner]} venceu a partida!`);
}

/**
 * Resigna da partida atual.
 */
async function resign() {
  if (!gameActive || isSpectator || !isMyTurn()) return;
  if (!confirm('Tem certeza que deseja desistir da partida?')) return;

  gameActive = false;
  aiThinking = false; // Para a IA de pensar se estiver em um turno dela.

  let winningPlayer = null;
  // Encontrar o próximo jogador humano se houver, ou a IA
  // O vencedor será o primeiro jogador não IA diferente do que resignou, ou a IA se só tiver IA.
  const otherPlayers = engine.players.filter(p => p.id !== myId);
  if (otherPlayers.length > 0) {
      winningPlayer = otherPlayers[0]; // Qualquer um dos outros jogadores pode ser o "ganhador" por default
  }

  if (!winningPlayer) { // Cenário improvável de resignar sozinho.
      winningPlayer = { color: 'draw' }; // Ou definir como draw ou o próprio jogador
  }
  const winnerColor = winningPlayer.color;

  if (gameMode === 'multiplayer' && roomRef) {
    await roomRef.update({
      status: 'resigned',
      winner: winnerColor,
      state: engine.serialize() // Salva o estado final
    }).catch(e => console.error('Erro ao atualizar sala para resignação:', e));
    roomRef.off(); // Desliga o listener da sala.
    roomRef = null;
  }

  // Salva o jogo como "loss" por resignação
  await historyManager.saveGame({
    gameType: 'ludo',
    gameId: roomRef ? roomCode : `ai_resigned_${Date.now()}`,
    mode: gameMode,
    players: engine.players.map(p => ({ id: p.id, name: p.name, color: p.color, isAI: p.isAI })),
    myColor: myColor,
    result: 'loss', // Sempre perda para quem resigna
    endedAt: Date.now(),
  });

  showGameOver('Você desistiu!', `O jogador ${COLOR_TRANSLATIONS[winnerColor]} venceu a partida.`);
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
    iconEl.textContent = title.includes('Vitória') ? '🏆'
      : title.includes('desistiu') ? '🏳' : '🎲';
  }

  showModal('modal-gameover');
}

/* =====================================================
   RENDERIZAÇÃO DA UI DO JOGO
===================================================== */

const BOARD_SIZE = 15; // Ludo é 15x15 células

// As PATH_COORDS, SAFE_CELLS_INDICES, HOME_PATHS, BASE_POSITIONS foram movidas
// para dentro da LudoEngine como ENGINE_CONSTANTS para centralização.
// São acessadas via `engine.PATH_COORDS` etc.

let BOARD_CELLS_DOM = []; // Cache do DOM das células do tabuleiro

/**
 * Constrói a estrutura DOM do tabuleiro Ludo.
 * Chamado uma vez ao iniciar a tela de jogo.
 */
function buildBoardDOM() {
  const boardEl = gel('ludo-board');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  BOARD_CELLS_DOM = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    BOARD_CELLS_DOM[r] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'ludo-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.style.gridRow = (r + 1);
      cell.style.gridColumn = (c + 1);

      const zone = getCellZone(r, c);
      if (zone) cell.classList.add('zone-' + zone);

      // Verifica se a célula é uma casa segura no caminho principal
      const pathIdx = engine.PATH_COORDS.findIndex(coord => coord[0] === r && coord[1] === c);
      if (pathIdx !== -1 && engine.SAFE_SQUARES.includes(pathIdx)) {
        cell.classList.add('safe');
      }

      boardEl.appendChild(cell);
      BOARD_CELLS_DOM[r][c] = cell;
    }
  }
}

/**
 * Identifica a "zona" (cor ou neutra) de uma célula específica do tabuleiro.
 * @param {number} r Linha da célula.
 * @param {number} c Coluna da célula.
 * @returns {string} A zona (red, blue, green, yellow, center, neutral)
 */
function getCellZone(r, c) {
  // Bases (6x6)
  if (r <= 5 && c <= 5) return 'red';
  if (r <= 5 && c >= 9) return 'blue';
  if (r >= 9 && c >= 9) return 'green';
  if (r >= 9 && c <= 5) return 'yellow';

  // Centro (3x3)
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return 'center';

  // Corredores finais (6 casas)
  if (r === 6 && c >= 1 && c <= 6) return 'red';    // Corredor (vermelho) horizontal
  if (r >= 1 && r <= 6 && c === 7) return 'blue';   // Corredor (azul) vertical
  if (r === 8 && c >= 8 && c <= 13) return 'green'; // Corredor (verde) horizontal
  if (r >= 8 && r <= 13 && c === 7) return 'yellow';  // Corredor (amarelo) vertical

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
  // Remove todos os peões existentes do DOM
  document.querySelectorAll('.pawn').forEach(p => p.remove());

  engine.players.forEach((player) => {
    player.pawns.forEach((pawn, pawnIdx) => {
      if (pawn.finished) return; // Peças no centro não são renderizadas no tabuleiro principal

      let coords = null;
      if (pawn.pos === -1) {
        // Peça na base
        coords = engine.BASE_POSITIONS[player.color]?.[pawnIdx];
      } else if (pawn.homeStep !== -1) {
        // Peça no corredor final
        coords = engine.HOME_PATHS[player.color]?.[pawn.homeStep];
      } else {
        // Peça no tabuleiro principal (PATH_COORDS)
        coords = engine.PATH_COORDS[pawn.pos];
      }

      if (!coords || !BOARD_CELLS_DOM[coords[0]] || !BOARD_CELLS_DOM[coords[0]][coords[1]]) {
        // console.warn(`Coordenadas inválidas para peão ${player.color}-${pawnIdx} na posição ${pawn.pos}/${pawn.homeStep}.`);
        return;
      }

      const cellElement = BOARD_CELLS_DOM[coords[0]][coords[1]];
      if (!cellElement) {
        // console.warn(`Elemento da célula DOM não encontrado para ${coords[0]},${coords[1]}`);
        return;
      }

      const pawnEl = document.createElement('div');
      pawnEl.className = `pawn ${player.color}`;
      pawnEl.dataset.playerColor = player.color; // Adiciona data-set para facilitar identificação
      pawnEl.dataset.pawnIdx = pawnIdx;
      pawnEl.textContent = PIECES_SYMBOLS[player.color] || (pawnIdx + 1); // Exibe símbolo ou número do peão

      // Adiciona classe de "movable" se for a vez do jogador e a peça puder mover
      if (!isSpectator && isMyTurn() && engine.phase === 'move') {
        const validMoves = engine.getValidMoves();
        if (validMoves.includes(pawnIdx)) {
          pawnEl.classList.add('movable');
          // Adiciona listener diretamente, que chamará doMovePawn com a peça correta.
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
    if (engine.activePlayer && engine.activePlayer.id === player.id) {
      card.classList.add('active-turn');
    }

    let playerNameDisplay = escapeHtml(player.name);
    // Adiciona "Você" ou "IA" ao nome para clara identificação
    if (player.id === myId) playerNameDisplay += ' (Você)';
    else if (player.isAI) playerNameDisplay += ' (IA)';

    const playerPhotoURL = player.photoURL || null;
    let avatarContent = `<span class="player-initials" style="background-color: var(--${player.color}-dark);">${(player.name || '?')[0].toUpperCase()}</span>`;
    if (playerPhotoURL) {
      avatarContent = `<img src="${playerPhotoURL}" alt="${player.name}" class="player-photo" onerror="this.onerror=null;this.src='${currentAuthManager.photoURL || ''}';this.parentElement.innerHTML='<span class=\\'player-initials\\' style=\\'background-color: var(--${player.color}-dark);\\'>${(player.name || '?')[0].toUpperCase()}</span>'">`;
    }

    card.innerHTML = `
      <div class="player-avatar">
        ${avatarContent}
      </div>
      <div class="player-info">
        <span class="player-name">${playerNameDisplay}</span>
        <span class="player-score">${player.score} / ${engine.PIECES_PER}</span>
      </div>
    `;
    listEl.appendChild(card);
  });
}


/**
 * Atualiza a barra de status com mensagens do jogo.
 */
function renderStatusBar() {
  const bar = gel('status-bar');
  if (!bar) return;
  bar.className = 'status-bar'; // Reseta classes
  const btnRoll = gel('btn-roll');
  if (btnRoll) { btnRoll.classList.remove('hidden'); } // Garante que o botão de rolar dado está visível por padrão

  const isCurrentPlayerAI = engine.activePlayer.isAI;
  const isMyTurnNow = isMyTurn();

  if (isSpectator) {
    bar.textContent = `👁 Assistindo — Vez de ${engine.activePlayer.name} (${COLOR_TRANSLATIONS[engine.activePlayer.color]})`;
    if (btnRoll) btnRoll.classList.add('hidden'); // Esconde o botão de rolar para espectadores
    return;
  }
  if (aiThinking) {
    bar.innerHTML = `Computador (${engine.activePlayer.name}) pensando <span class="thinking-dots"><span></span><span></span><span></span></span>`;
    if (btnRoll) btnRoll.disabled = true;
    return;
  }

  if (engine.status === 'finished') {
    bar.textContent = `Partida encerrada! Vencedor: ${engine.activePlayer.name} (${COLOR_TRANSLATIONS[engine.activePlayer.color]}) 🏆`;
    bar.classList.remove('your-turn');
    if (btnRoll) btnRoll.classList.add('hidden'); // Esconde o botão de rolar ao final do jogo
  } else if (isMyTurnNow) {
    if (engine.phase === 'roll') {
      if (btnRoll) btnRoll.disabled = false;
      bar.textContent = `Sua vez (${COLOR_TRANSLATIONS[myColor]}) — Role o dado!`;
      bar.classList.add('your-turn');
    } else { // phase === 'move'
      if (btnRoll) btnRoll.disabled = true; // Desabilita roll após rolar
      bar.textContent = `Sua vez (${COLOR_TRANSLATIONS[myColor]}) — Escolha uma peça para mover ${engine.diceValue} casas.`;
      bar.classList.add('your-turn');
    }
  } else {
    // Vez de outro jogador (humano ou IA que ainda não começou o turno)
    bar.textContent = `Vez de ${engine.activePlayer.name} (${COLOR_TRANSLATIONS[engine.activePlayer.color]})`;
    bar.classList.remove('your-turn');
    if (btnRoll) btnRoll.disabled = true;
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
   HISTÓRICO E PARTIDAS AO VIVO (UI)
===================================================== */

async function openHistoryScreen() {
  showScreen('ludo-history'); // Tela de histórico para Ludo
  const listEl = gel('ludo-history-list');
  const statsEl = gel('ludo-history-stats');
  if (listEl) listEl.innerHTML = '<div class="history-loading">Carregando...</div>';
  if (statsEl) statsEl.innerHTML = '';

  if (!currentUser || currentUser.isAnonymous) {
    if (listEl) listEl.innerHTML = '<div class="history-empty">Faça login para ver seu histórico.</div>';
    return;
  }

  try {
    const games = await historyManager.loadLudoHistory(currentUser.uid);

    if (!games || games.length === 0) {
      if (listEl) listEl.innerHTML = '<div class="history-empty">Nenhuma partida de Ludo ainda.<br>Jogue sua primeira partida!</div>';
      return;
    }

    const wins = games.filter(g => g.result === 'win').length;
    const losses = games.filter(g => g.result === 'loss').length;
    const draws = games.filter(g => g.result === 'draw').length; // Ludo pode ter um tipo de 'draw' em algumas regras, ou aqui será 0.

    if (statsEl) statsEl.innerHTML =
      `<span class='stat stat-win'>🏆 Vitórias: ${wins}</span> ` +
      `<span class='stat stat-loss'>❌ Derrotas: ${losses}</span> ` +
      `<span class='stat stat-draw'>🤝 Empates: ${draws}</span>`; // Adapte draw se não for aplicável no Ludo.

    if (listEl) listEl.innerHTML = '';
    games.forEach(game => {
      const card = document.createElement('div');
      card.className = 'history-card';
      const resClassMap = { win: 'result-win', loss: 'result-loss', draw: 'result-draw' };
      const resTextMap = { win: 'Vitória 🏆', loss: 'Derrota ❌', draw: 'Empate 🤝' };
      const resClass = resClassMap[game.result] || '';
      const resText = resTextMap[game.result] || game.result;

      let opponentNames = game.players
        .filter(p => p.id !== currentUser.uid && !p.isAI)
        .map(p => escapeHtml(p.name));
      let aiOpponentCount = game.players.filter(p => p.isAI).length;

      let opponentDisplay = '';
      if (opponentNames.length > 0) {
        opponentDisplay = 'vs ' + opponentNames.join(', ');
      }
      if (aiOpponentCount > 0) {
        opponentDisplay += (opponentNames.length > 0 ? ' + ' : 'vs ') + `${aiOpponentCount} IA(s)`;
      }
      if (!opponentDisplay) { // Se não tiver nem humano nem IA (ex: só você no modo AI)
          opponentDisplay = 'vs IA'; // Garante que algo seja exibido
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
      // Ludo não tem replay, então o botão de replay é omitido.
      if (listEl) listEl.appendChild(card);
    });
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="history-empty">Erro ao carregar histórico.</div>';
    console.error('Erro ao carregar histórico de Ludo:', e);
  }
}

async function openLiveGamesScreen() {
  showScreen('ludo-live-games'); // Tela de partidas ao vivo para Ludo
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

      let playerNames = game.players
        .filter(p => !p.isAI && p.id !== null)
        .map(p => escapeHtml(p.name));
      let aiCount = game.players.filter(p => p.isAI).length;

      let opponentDisplay = playerNames.join(', ');
      if (aiCount > 0) {
        opponentDisplay += (playerNames.length > 0 ? ' + ' : '') + `${aiCount} IA(s)`;
      }
      if (!opponentDisplay) {
          opponentDisplay = 'Aguardando jogadores';
      }

      const date = new Date(game.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
      });

      card.innerHTML = `
        <div class="history-card-left">
          <span class="history-result result-draw">Ao Vivo</span> <!-- Usar uma cor neutra para "Ao Vivo" -->
          <span class="history-opponent">${opponentDisplay}</span>
        </div>
        <div class="history-card-center">
          <span class="history-mode">👥 Multiplayer</span>
          <span class="history-moves">${game.players.length} jogadores na sala</span>
        </div>
        <div class="history-card-right">
          <span class="history-date">${date}</span>
          <button class="btn btn-small btn-primary">👁 Assistir</button>
        </div>
      `;
      card.querySelector('button').addEventListener('click', () => {
        // Redireciona para a tela de jogo como espectador
        gel('input-spectate').value = game.id; // Preenche o campo com o código da sala
        spectateGame();
      });
      if (listEl) listEl.appendChild(card);
    });
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="history-empty">Erro ao carregar partidas ao vivo.</div>';
    console.error('Erro ao carregar partidas de Ludo ao vivo:', e);
  }
}