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
   CONSTANTES DO JOGO
===================================================== */
const COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_PT = { red: 'Vermelho', blue: 'Azul', green: 'Verde', yellow: 'Amarelo' };

/* =====================================================
   ESTADO GLOBAL
===================================================== */
let db, fbAuth, currentUser = null;
let state = null; // Estado do jogo Ludo
let myId = 'guest_' + Math.random().toString(36).slice(2, 8);
let myColor = null; // Cor do jogador atual
let roomCode = null;
let roomRef = null;
let specRef = null;
let gameActive = false;
let gameMode = 'multiplayer'; // 'multiplayer' ou 'ai'
let aiThinking = false;
let selectedAiCount = 1; // Quantidade de IAs no modo VS AI
let isSpectator = false;

/* =====================================================
   HELPER — addEventListener seguro contra null
===================================================== */
function el(id, event, handler) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener(event, handler);
  } else {
    console.warn(`#${id} não encontrado para evento '${event}'`);
  }
}

function gel(id) {
  return document.getElementById(id);
}

function escHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/* =====================================================
   BOOT
===================================================== */
window.addEventListener('DOMContentLoaded', () => {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    fbAuth = firebase.auth();
  } catch (e) {
    console.error('Firebase init error:', e);
    return;
  }

  initAuthUI();
  initLobbyUI();
  initGameUI();

  fbAuth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
      myId = user.uid;
      const name = user.displayName || user.email?.split('@')[0] || 'Jogador';
      const photoURL = user.photoURL || null;

      const headerName = gel('header-username');
      if (headerName) headerName.textContent = name;

      const headerPhoto = gel('header-photo');
      const headerInitials = gel('header-initials');

      if (photoURL && headerPhoto && headerInitials) {
        headerPhoto.src = photoURL;
        headerPhoto.classList.remove('hidden');
        headerInitials.style.display = 'none';
      } else if (headerInitials) {
        headerInitials.style.display = 'flex';
        const initials = name
          .split(' ')
          .slice(0, 2)
          .map(w => w[0]?.toUpperCase() || '')
          .join('');
        headerInitials.textContent = initials || '?';
      }

      db.ref('users/' + user.uid).update({
        displayName: name,
        email: photoURL || '',
        photoURL: photoURL || '',
        lastSeen: Date.now()
      });

      showScreen('lobby');
    } else {
      const headerPhoto = gel('header-photo');
      const headerInitials = gel('header-initials');
      if (headerPhoto) { headerPhoto.src = ''; headerPhoto.classList.add('hidden'); }
      if (headerInitials) { headerInitials.style.display = 'flex'; headerInitials.textContent = '?'; }
      showScreen('auth');
    }
  });
});

/* =====================================================
   AUTH — funções de login
===================================================== */
async function loginWithEmail() {
  const email = gel('login-email').value.trim();
  const pass = gel('login-password').value;
  if (!email || !pass) { showAuthError('Preencha e-mail e senha.'); return; }
  try {
    await fbAuth.signInWithEmailAndPassword(email, pass);
  } catch (e) { showAuthError(authErrorMsg(e.code)); }
}

async function loginWithGoogle() {
  try {
    await fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') showAuthError(authErrorMsg(e.code));
  }
}

async function registerWithEmail() {
  const name = gel('reg-name').value.trim();
  const email = gel('reg-email').value.trim();
  const pass = gel('reg-password').value;
  if (!name) { showAuthError('Informe seu nome.'); return; }
  if (!email) { showAuthError('Informe seu e-mail.'); return; }
  if (pass.length < 6) { showAuthError('Senha mínima de 6 caracteres.'); return; }
  try {
    const cred = await fbAuth.createUserWithEmailAndPassword(email, pass);
    await cred.user.updateProfile({ displayName: name });
    await cred.user.reload();
  } catch (e) { showAuthError(authErrorMsg(e.code)); }
}

function authErrorMsg(code) {
  return ({
    'auth/user-not-found': 'Usuário não encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/email-already-in-use': 'E-mail já cadastrado.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'Senha muito fraca.',
    'auth/too-many-requests': 'Muitas tentativas. Tente mais tarde.'
  })[code] || 'Erro ao autenticar.';
}

function showAuthError(msg) {
  const el = gel('auth-error');
  if (el) el.textContent = msg;
}
function clearAuthError() {
  const el = gel('auth-error');
  if (el) el.textContent = '';
}

/* =====================================================
   INIT — Auth UI
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

  el('btn-login-email', 'click', loginWithEmail);
  el('login-password', 'keydown', e => { if (e.key === 'Enter') loginWithEmail(); });
  el('btn-login-google', 'click', loginWithGoogle);
  el('btn-register', 'click', registerWithEmail);
  el('btn-register-google', 'click', loginWithGoogle);
}

/* =====================================================
   INIT — Lobby UI
===================================================== */
function initLobbyUI() {
  el('btn-logout', 'click', () => fbAuth.signOut());
  el('btn-create', 'click', createGame);
  el('btn-join', 'click', joinGame);
  el('input-room', 'keydown', e => { if (e.key === 'Enter') joinGame(); });
  el('btn-spectate', 'click', spectateGame);
  el('input-spectate', 'keydown', e => { if (e.key === 'Enter') spectateGame(); });
  el('btn-start-ai', 'click', startAIGame);

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameMode = btn.dataset.mode;
      const mp = gel('panel-multiplayer');
      const pa = gel('panel-ai');
      if (mp) mp.classList.toggle('hidden', gameMode !== 'multiplayer');
      if (pa) pa.classList.toggle('hidden', gameMode !== 'ai');
    });
  });

  document.querySelectorAll('.player-count-btns .count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.player-count-btns .count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // No Ludo, o total de jogadores é fixo em 4, mas o usuário escolhe quantos humanos
      // O restante será preenchido por IAs ou slots vazios
    });
  });

  document.querySelectorAll('.ai-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-count-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAiCount = parseInt(btn.dataset.ai);
    });
  });
}

/* =====================================================
   INIT — Game UI
===================================================== */
function initGameUI() {
  el('btn-cancel', 'click', cancelGame);
  el('btn-copy', 'click', copyRoomCode);
  el('btn-resign', 'click', resign);
  el('btn-roll', 'click', rollDice);
  el('btn-new-game', 'click', goLobby);
  el('btn-back-lobby', 'click', () => { if (specRef) { specRef.off(); specRef = null; } goLobby(); });

  el('btn-gameover-new', 'click', () => {
    hideModal('modal-gameover');
    if (gameMode === 'ai') startAIGame(); else goLobby();
  });
  el('btn-gameover-lobby', 'click', () => { hideModal('modal-gameover'); goLobby(); });
}

/* =====================================================
   NAVEGAÇÃO
===================================================== */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = gel('screen-' + name);
  if (target) target.classList.add('active');
}
function showModal(id) { const e = gel(id); if (e) e.classList.remove('hidden'); }
function hideModal(id) { const e = gel(id); if (e) e.classList.add('hidden'); }

function goLobby() {
  gameActive = false;
  aiThinking = false;
  isSpectator = false;
  if (roomRef) { roomRef.off(); roomRef = null; }
  if (specRef) { specRef.off(); specRef = null; }
  state = null; // Limpa o estado do jogo Ludo
  myColor = null;
  roomCode = null;

  const ir = gel('input-room');
  const is = gel('input-spectate');
  if (ir) ir.value = '';
  if (is) is.value = '';
  clearLobbyError();
  showScreen('lobby');
}

function showLobbyError(msg) { const e = gel('lobby-error'); if (e) e.textContent = msg; }
function clearLobbyError() { const e = gel('lobby-error'); if (e) e.textContent = ''; }

/* =====================================================
   LÓGICA DO JOGO LUDO
===================================================== */
const BOARD_SIZE = 15; // 15x15 células
const CELL_SIZE = 40; // Tamanho em pixels de cada célula (ajustado via CSS)

// Mapeamento de coordenadas (row, col) para índice do caminho principal (0-51)
const PATH_COORDS = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], // 0-4 (yellow path)
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], // 5-9 (yellow path)
  [0, 6], [0, 7], [0, 8], // 10-12 (yellow path to green entry)
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], // 13-17 (green path)
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], // 18-22 (green path)
  [7, 14], [8, 14], // 23-24 (green path to blue entry)
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // 25-29 (blue path)
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], // 30-34 (blue path)
  [14, 8], [14, 7], [14, 6], // 35-37 (blue path to red entry)
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 38-42 (red path)
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], // 43-47 (red path)
  [7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5] // 48-53 (red path to yellow entry)
];

// Casas seguras (estrelas)
const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Posições de entrada na trilha principal para cada cor
const ENTRY_POINTS = {
  red: [12, 6], // Posição no tabuleiro para a peça vermelha sair da base
  blue: [8, 12], // Posição no tabuleiro para a peça azul sair da base
  green: [2, 8], // Posição no tabuleiro para a peça verde sair da base
  yellow: [6, 2] // Posição no tabuleiro para a peça amarela sair da base
};

// Posições das peças na base (para renderização)
const BASE_POSITIONS = {
  red: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  blue: [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  green: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
  yellow: [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]]
};

// Corredores finais (home path)
const HOME_PATHS = {
  red: [[7, 6], [7, 7], [7, 8], [7, 9], [7, 10], [7, 11]], // row 7, cols 6-11
  blue: [[6, 7], [5, 7], [4, 7], [3, 7], [2, 7], [1, 7]], // col 7, rows 6-1
  green: [[7, 8], [7, 9], [7, 10], [7, 11], [7, 12], [7, 13]], // row 7, cols 8-13
  yellow: [[8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [13, 7]] // col 7, rows 8-13
};

// Posição de "entrada" no corredor final (uma casa antes do corredor)
const FINAL_ENTRY_POINTS = {
  red: [14, 6], // A peça vermelha chega aqui antes de entrar no corredor final
  blue: [8, 0], // A peça azul chega aqui antes de entrar no corredor final
  green: [0, 8], // A peça verde chega aqui antes de entrar no corredor final
  yellow: [6, 14] // A peça amarela chega aqui antes de entrar no corredor final
};

// Mapeamento de cor para o índice de início na PATH_COORDS
const COLOR_START_INDEX = {
  red: 39, // Vermelho começa na casa 39 da PATH_COORDS
  blue: 13, // Azul começa na casa 13 da PATH_COORDS
  green: 26, // Verde começa na casa 26 da PATH_COORDS
  yellow: 0 // Amarelo começa na casa 0 da PATH_COORDS
};

/* =====================================================
   FUNÇÕES DE LÓGICA DO JOGO
===================================================== */

// Retorna o índice do jogador atual
function getCurrentPlayerIndex() {
  return state.currentTurn;
}

// Retorna a cor do jogador atual
function getCurrentPlayerColor() {
  return state.players[state.currentTurn].color;
}

// Verifica se é a vez do jogador logado
function isMyTurn() {
  return !isSpectator && (state.players[state.currentTurn].id === myId);
}

// Lança o dado
function rollDice() {
  if (!gameActive || isSpectator || aiThinking || !isMyTurn() || state.phase !== 'roll') return;

  const diceValue = Math.floor(Math.random() * 6) + 1;
  state.diceValue = diceValue;
  state.phase = 'move';
  logEvent(`🎲 ${COLOR_PT[getCurrentPlayerColor()]} rolou ${diceValue}`);
  renderGame();

  // Se não houver movimentos válidos, passa a vez
  if (!hasValidMoves()) {
    logEvent(`Sem movimentos válidos para ${COLOR_PT[getCurrentPlayerColor()]}.`);
    setTimeout(nextTurn, 1500);
  } else if (state.players[getCurrentPlayerIndex()].isAI) {
    setTimeout(doAITurn, 1000);
  }
}

// Verifica se o jogador atual tem movimentos válidos para o dado
function hasValidMoves() {
  const player = state.players[getCurrentPlayerIndex()];
  const dice = state.diceValue;

  for (let i = 0; i < player.pawns.length; i++) {
    if (canPawnMove(player.pawns[i], dice)) {
      return true;
    }
  }
  return false;
}

// Verifica se um peão específico pode se mover
function canPawnMove(pawn, dice) {
  // Se está na base, só pode sair com 6
  if (pawn.pos === -1) {
    return dice === 6;
  }

  // Se está no caminho final (home path)
  if (pawn.homeStep >= 0) {
    return (pawn.homeStep + dice) <= 5; // Pode mover se não ultrapassar o final do corredor
  }

  // Se está no tabuleiro principal
  // Calcula a nova posição no tabuleiro principal
  const playerColor = state.players[getCurrentPlayerIndex()].color;
  const startIndex = COLOR_START_INDEX[playerColor];
  const currentRelativePos = (pawn.pos - startIndex + 52) % 52;
  const newRelativePos = currentRelativePos + dice;

  // Se a nova posição relativa ultrapassa o ponto de entrada do corredor final
  if (newRelativePos > 51) { // 51 é a última casa antes de entrar no corredor final
    const stepsIntoHomePath = newRelativePos - 51 -1; // -1 porque a casa 51 é a última do tabuleiro
    return stepsIntoHomePath <= 5; // Verifica se cabe no corredor final
  }

  return true; // Pode mover no tabuleiro principal
}

// Move um peão
function doMovePawn(playerIndex, pawnIndex) {
  if (!gameActive || isSpectator || aiThinking || state.phase !== 'move') return;
  if (playerIndex !== getCurrentPlayerIndex()) return; // Não é a vez deste jogador
  if (!isMyTurn() && !state.players[playerIndex].isAI) return; // Não é meu peão ou não é IA

  const player = state.players[playerIndex];
  const pawn = player.pawns[pawnIndex];
  const dice = state.diceValue;

  if (!canPawnMove(pawn, dice)) {
    logEvent(`Movimento inválido para ${COLOR_PT[player.color]} peça ${pawnIndex + 1}.`);
    return;
  }

  let moved = false;
  let captured = false;
  let extraTurn = false;

  // Se o peão está na base e rolou 6
  if (pawn.pos === -1 && dice === 6) {
    pawn.pos = COLOR_START_INDEX[player.color]; // Move para a casa de entrada
    logEvent(`${COLOR_PT[player.color]} peça ${pawnIndex + 1} saiu da base.`);
    moved = true;
    extraTurn = true; // Ganha turno extra ao sair da base

    // Verifica captura na casa de entrada
    captured = checkCapture(player.color, pawn.pos);

  } else if (pawn.pos !== -1 && pawn.homeStep === -1) { // Peão no tabuleiro principal
    const playerColor = player.color;
    const startIndex = COLOR_START_INDEX[playerColor];
    const currentRelativePos = (pawn.pos - startIndex + 52) % 52;
    const newRelativePos = currentRelativePos + dice;

    if (newRelativePos > 51) { // Entra no corredor final
      pawn.homeStep = newRelativePos - 51 -1;
      pawn.pos = -2; // Indica que está no corredor final
      logEvent(`${COLOR_PT[player.color]} peça ${pawnIndex + 1} entrou no corredor final.`);
      moved = true;
    } else { // Continua no tabuleiro principal
      pawn.pos = (pawn.pos + dice) % 52;
      logEvent(`${COLOR_PT[player.color]} peça ${pawnIndex + 1} moveu ${dice} casas.`);
      moved = true;
      captured = checkCapture(player.color, pawn.pos);
    }

  } else if (pawn.homeStep >= 0) { // Peão no corredor final
    pawn.homeStep += dice;
    logEvent(`${COLOR_PT[player.color]} peça ${pawnIndex + 1} moveu ${dice} casas no corredor final.`);
    moved = true;
  }

  if (moved) {
    // Verifica se a peça chegou ao centro
    if (pawn.homeStep === 5) {
      pawn.finished = true;
      player.score++;
      logEvent(`${COLOR_PT[player.color]} peça ${pawnIndex + 1} chegou ao centro!`);
      extraTurn = true; // Ganha turno extra ao chegar ao centro
    }

    // Se houve captura, ganha turno extra
    if (captured) {
      logEvent(`${COLOR_PT[player.color]} capturou uma peça!`);
      extraTurn = true;
    }

    // Se rolou 6, ganha turno extra
    if (dice === 6) {
      extraTurn = true;
    }

    state.phase = 'roll'; // Reseta para rolar o dado
    state.diceValue = 0; // Limpa o dado
    renderGame();

    // Verifica se o jogador atual venceu
    if (player.score === 4) {
      state.status = 'finished';
      state.winner = player.color;
      logEvent(`${COLOR_PT[player.color]} venceu a partida!`);
      showGameOver(`🏆 ${COLOR_PT[player.color]} venceu!`, 'Parabéns!');
      saveGame('win');
      return;
    }

    if (!extraTurn) {
      setTimeout(nextTurn, 1000);
    } else {
      logEvent(`${COLOR_PT[player.color]} ganhou um turno extra!`);
      if (state.players[getCurrentPlayerIndex()].isAI) {
        setTimeout(doAITurn, 1000);
      }
    }
  }
}

// Verifica e executa capturas
function checkCapture(movingColor, pos) {
  let captured = false;
  if (SAFE_CELLS.has(pos)) return false; // Não captura em casas seguras

  state.players.forEach(player => {
    if (player.color === movingColor) return; // Não captura peças da mesma cor
    player.pawns.forEach(pawn => {
      if (pawn.pos === pos && pawn.homeStep === -1) { // Peça no tabuleiro principal
        pawn.pos = -1; // Retorna para a base
        logEvent(`${COLOR_PT[movingColor]} capturou peça de ${COLOR_PT[player.color]}!`);
        captured = true;
      }
    });
  });
  return captured;
}

// Passa a vez para o próximo jogador
function nextTurn() {
  state.currentTurn = (state.currentTurn + 1) % state.players.length;
  state.diceValue = 0;
  state.phase = 'roll';
  logEvent(`Vez de ${COLOR_PT[getCurrentPlayerColor()]}.`);
  renderGame();

  // Se o próximo jogador for IA, agenda o movimento
  if (state.players[getCurrentPlayerIndex()].isAI) {
    setTimeout(doAITurn, 1000);
  }
}

// Lógica da IA
function doAITurn() {
  if (!gameActive || !state.players[getCurrentPlayerIndex()].isAI || aiThinking) return;

  aiThinking = true;
  renderGame(); // Atualiza status bar para "IA pensando..."

  setTimeout(() => {
    const player = state.players[getCurrentPlayerIndex()];
    const dice = Math.floor(Math.random() * 6) + 1;
    state.diceValue = dice;
    state.phase = 'move';
    logEvent(`🎲 ${COLOR_PT[player.color]} (IA) rolou ${dice}`);
    renderGame();

    setTimeout(() => {
      const validMoves = [];
      player.pawns.forEach((pawn, idx) => {
        if (canPawnMove(pawn, dice)) {
          validMoves.push(idx);
        }
      });

      if (validMoves.length > 0) {
        // IA escolhe aleatoriamente entre os movimentos válidos
        const chosenPawnIndex = validMoves[Math.floor(Math.random() * validMoves.length)];
        doMovePawn(getCurrentPlayerIndex(), chosenPawnIndex);
      } else {
        logEvent(`IA ${COLOR_PT[player.color]} sem movimentos válidos.`);
        nextTurn();
      }
      aiThinking = false;
    }, 1000); // Pequeno delay para simular "pensamento" da IA
  }, 1000); // Delay para rolar o dado
}

/* =====================================================
   RENDERIZAÇÃO DO TABULEIRO LUDO
===================================================== */
let BOARD_LAYOUT = []; // Cache da grade de células DOM

function buildBoardDOM() {
  const boardEl = gel('ludo-board');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  BOARD_LAYOUT = [];

  boardEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${BOARD_SIZE}, 1fr)`;

  for (let r = 0; r < BOARD_SIZE; r++) {
    BOARD_LAYOUT[r] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'ludo-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      // Adiciona classes para estilização de zonas (bases, centro, trilhas)
      const zone = getCellZone(r, c);
      if (zone) cell.classList.add('zone-' + zone);

      // Adiciona classe para casas seguras
      const pathIdx = getPathIndex(r, c);
      if (pathIdx !== -1 && SAFE_CELLS.has(pathIdx)) {
        cell.classList.add('safe');
      }

      boardEl.appendChild(cell);
      BOARD_LAYOUT[r][c] = cell;
    }
  }
}

// Determina a zona de uma célula (para estilização)
function getCellZone(r, c) {
  // Bases
  if (r >= 0 && r <= 5 && c >= 0 && c <= 5) return 'red-base';
  if (r >= 0 && r <= 5 && c >= 9 && c <= 14) return 'blue-base';
  if (r >= 9 && r <= 14 && c >= 9 && c <= 14) return 'green-base';
  if (r >= 9 && r <= 14 && c >= 0 && c <= 5) return 'yellow-base';

  // Centro
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return 'center';

  // Trilhas coloridas (corredores finais)
  if (r === 7 && c >= 1 && c <= 6) return 'yellow-home';
  if (r >= 1 && r <= 6 && c === 7) return 'blue-home';
  if (r === 7 && c >= 8 && c <= 13) return 'green-home';
  if (r >= 8 && r <= 13 && c === 7) return 'red-home';

  // Trilhas principais (neutras)
  if ((r === 6 && c >= 0 && c <= 5) || (r === 8 && c >= 0 && c <= 5) ||
    (r >= 0 && r <= 5 && c === 6) || (r >= 0 && r <= 5 && c === 8) ||
    (r === 6 && c >= 9 && c <= 14) || (r === 8 && c >= 9 && c <= 14) ||
    (r >= 9 && r <= 14 && c === 6) || (r >= 9 && r <= 14 && c === 8)) {
    return 'track';
  }

  return null;
}

// Retorna o índice no PATH_COORDS para uma dada coordenada (ou -1 se não estiver no caminho)
function getPathIndex(r, c) {
  for (let i = 0; i < PATH_COORDS.length; i++) {
    if (PATH_COORDS[i][0] === r && PATH_COORDS[i][1] === c) {
      return i;
    }
  }
  return -1;
}

// Renderiza o estado atual do jogo no tabuleiro
function renderGame() {
  if (!state) return;

  // Limpa peões existentes
  document.querySelectorAll('.pawn').forEach(p => p.remove());

  // Renderiza peões
  state.players.forEach((player, playerIndex) => {
    player.pawns.forEach((pawn, pawnIndex) => {
      if (pawn.finished) return; // Peças que chegaram ao centro não são renderizadas

      const coords = getPawnRenderCoords(player.color, pawn, pawnIndex);
      if (!coords) return;

      const cell = BOARD_LAYOUT[coords[0]]?.[coords[1]];
      if (!cell) return;

      const pawnEl = document.createElement('div');
      pawnEl.className = `pawn ${player.color}`;
      pawnEl.dataset.playerIndex = playerIndex;
      pawnEl.dataset.pawnIndex = pawnIndex;
      pawnEl.textContent = pawnIndex + 1;

      // Adiciona evento de clique se for a vez do jogador e o peão for movível
      if (!isSpectator && isMyTurn() && state.phase === 'move' && canPawnMove(pawn, state.diceValue)) {
        pawnEl.classList.add('movable');
        pawnEl.addEventListener('click', () => doMovePawn(playerIndex, pawnIndex));
      }

      cell.appendChild(pawnEl);
    });
  });

  updateStatusBar();
  updateDiceDisplay();
  updatePlayerCards();
  updateLog();
}

// Retorna as coordenadas (row, col) para renderizar um peão
function getPawnRenderCoords(color, pawn, pawnIndex) {
  if (pawn.pos === -1) { // Na base
    const baseCoords = BASE_POSITIONS[color];
    return baseCoords[pawnIndex];
  } else if (pawn.homeStep >= 0) { // No corredor final
    const homePathCoords = HOME_PATHS[color];
    return homePathCoords[pawn.homeStep];
  } else { // No tabuleiro principal
    return PATH_COORDS[pawn.pos];
  }
}

/* =====================================================
   STATUS E UI
===================================================== */
function updateStatusBar() {
  const bar = gel('status-bar');
  if (!bar) return;

  if (isSpectator) { bar.textContent = '👁 Assistindo'; bar.className = 'status-bar'; return; }
  if (aiThinking) { bar.textContent = 'Computador pensando...'; bar.className = 'status-bar ai-thinking'; return; }
  if (state.status === 'finished') { bar.textContent = `Partida encerrada! ${COLOR_PT[state.winner]} venceu!`; bar.className = 'status-bar finished'; return; }

  const activePlayer = state.players[getCurrentPlayerIndex()];
  const isMyTurnNow = isMyTurn();
  const name = activePlayer.name;

  if (isMyTurnNow) {
    bar.textContent = state.phase === 'roll'
      ? 'Sua vez — role o dado!'
      : 'Sua vez — escolha uma peça';
    bar.className = 'status-bar your-turn';
  } else {
    bar.textContent = `Vez de ${name}`;
    bar.className = 'status-bar';
  }

  const btnRoll = gel('btn-roll');
  if (btnRoll) {
    btnRoll.disabled = !isMyTurnNow || state.phase !== 'roll' || aiThinking;
  }
}

function updateDiceDisplay() {
  const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const diceDisplay = gel('dice-display');
  const diceResult = gel('dice-result');

  if (diceDisplay) diceDisplay.textContent = state.diceValue ? faces[state.diceValue] : '🎲';
  if (diceResult) diceResult.textContent = state.diceValue ? `Rolou: ${state.diceValue}` : '';
}

function updatePlayerCards() {
  const playersList = gel('players-list');
  if (!playersList) return;
  playersList.innerHTML = '';

  state.players.forEach((player, index) => {
    const card = document.createElement('div');
    card.className = `player-card ${player.color}`;
    if (index === getCurrentPlayerIndex()) {
      card.classList.add('active-turn');
    }
    if (player.id === myId) {
      card.classList.add('my-player');
    }

    const pawnIcons = player.pawns.map(pawn => {
      if (pawn.finished) return '✅';
      if (pawn.pos === -1) return '🏠';
      return '♟';
    }).join('');

    card.innerHTML = `
      <div class="player-info">
        <span class="player-color-dot" style="background-color: var(--${player.color});"></span>
        <span class="player-name">${escHtml(player.name)}</span>
        ${player.isAI ? '<span class="player-ai-tag">🤖</span>' : ''}
      </div>
      <div class="player-pawns">${pawnIcons}</div>
    `;
    playersList.appendChild(card);
  });
}

function logEvent(message) {
  const logBox = gel('log-entries');
  if (logBox) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = message;
    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight; // Scroll para o final
  }
}

function updateLog() {
  // A função logEvent já adiciona e rola, então aqui só garantimos que o log está visível
  const logBox = gel('log-entries');
  if (logBox) {
    logBox.scrollTop = logBox.scrollHeight;
  }
}

/* =====================================================
   FIREBASE — MULTIPLAYER
===================================================== */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function createGame() {
  const btn = gel('btn-create');
  if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }
  clearLobbyError();

  const numPlayers = parseInt(document.querySelector('.player-count-btns .count-btn.active').dataset.count);
  const playersConfig = [];
  const myName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Jogador';

  // Adiciona o criador da sala
  playersConfig.push({ id: myId, name: myName, color: COLORS[0], isAI: false });
  myColor = COLORS[0];

  // Preenche com slots vazios para outros jogadores humanos
  for (let i = 1; i < numPlayers; i++) {
    playersConfig.push({ id: null, name: `Slot ${i + 1}`, color: COLORS[i], isAI: false });
  }

  // Preenche o restante até 4 jogadores com IAs (se houver espaço)
  for (let i = numPlayers; i < 4; i++) {
    playersConfig.push({ id: `ai_${i}`, name: `IA ${i + 1}`, color: COLORS[i], isAI: true });
  }

  try {
    roomCode = generateRoomCode();
    roomRef = db.ref('rooms/' + roomCode);

    await roomRef.set({
      players: playersConfig,
      totalPlayers: 4, // Sempre 4 no Ludo
      humanPlayers: numPlayers,
      state: buildInitialState(playersConfig),
      createdAt: Date.now(),
      status: 'waiting'
    });

    // Timeout para remover sala se ninguém entrar
    setTimeout(() => {
      if (!roomRef) return;
      roomRef.once('value', snap => {
        if (snap.val()?.status === 'waiting') {
          roomRef.remove();
          goLobby();
          alert('Sua sala foi cancelada por inatividade.');
        }
      });
    }, 600000); // 10 minutos

    const drc = gel('display-room-code');
    if (drc) drc.textContent = roomCode;
    showScreen('waiting');
    updateWaitingList(playersConfig);

    roomRef.on('value', snap => {
      const data = snap.val();
      if (!data) return;

      updateWaitingList(data.players || []);
      const currentHumanPlayers = (data.players || []).filter(p => p.id && !p.isAI).length;
      const waitingCountEl = gel('waiting-count');
      const waitingTotalEl = gel('waiting-total');
      if (waitingCountEl) waitingCountEl.textContent = currentHumanPlayers;
      if (waitingTotalEl) waitingTotalEl.textContent = numPlayers;

      if (data.status === 'playing' && data.state) {
        roomRef.off();
        state = data.state;
        startGameScreen();
      }
    });
  } catch (e) {
    showLobbyError('Erro ao criar sala: ' + e.message);
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
    if (data.status !== 'waiting') { showLobbyError('Sala não está aguardando jogadores.'); roomRef = null; return; }

    const availableSlotIndex = (data.players || []).findIndex(p => p.id === null && !p.isAI);
    if (availableSlotIndex === -1) { showLobbyError('Sala cheia de jogadores humanos.'); roomRef = null; return; }

    const myName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Jogador';
    const newPlayers = [...data.players];
    newPlayers[availableSlotIndex] = { id: myId, name: myName, color: COLORS[availableSlotIndex], isAI: false };
    myColor = COLORS[availableSlotIndex];

    let newStatus = 'waiting';
    const currentHumanPlayers = newPlayers.filter(p => p.id && !p.isAI).length;
    if (currentHumanPlayers === data.humanPlayers) {
      newStatus = 'playing'; // Todos os slots humanos preenchidos
    }

    await roomRef.update({ players: newPlayers, status: newStatus });

    if (newStatus === 'playing') {
      roomRef.off(); // Desliga listener da sala de espera
      state = buildInitialState(newPlayers); // Gera estado inicial com todos os jogadores
      await roomRef.update({ state: state }); // Salva o estado inicial
      startGameScreen();
    } else {
      showScreen('waiting');
      updateWaitingList(newPlayers);
      const waitingCountEl = gel('waiting-count');
      const waitingTotalEl = gel('waiting-total');
      if (waitingCountEl) waitingCountEl.textContent = currentHumanPlayers;
      if (waitingTotalEl) waitingTotalEl.textContent = data.humanPlayers;

      roomRef.on('value', snap => {
        const d = snap.val();
        if (!d) return;
        updateWaitingList(d.players || []);
        const currentHuman = (d.players || []).filter(p => p.id && !p.isAI).length;
        if (waitingCountEl) waitingCountEl.textContent = currentHuman;
        if (d.status === 'playing' && d.state) {
          roomRef.off();
          state = d.state;
          startGameScreen();
        }
      });
    }
  } catch (e) {
    showLobbyError('Erro ao entrar: ' + e.message);
    roomRef = null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

async function spectateGame() {
  const input = gel('input-spectate');
  const code = input ? input.value.trim().toUpperCase() : '';
  clearLobbyError();
  if (code.length !== 6) { showLobbyError('Código deve ter 6 caracteres.'); return; }

  try {
    specRef = db.ref('rooms/' + code);
    const snap = await specRef.once('value');
    const data = snap.val();

    if (!data) { showLobbyError('Sala não encontrada.'); specRef = null; return; }
    if (data.status === 'waiting') { showLobbyError('Partida ainda não começou.'); specRef = null; return; }
    if (data.status === 'finished') { showLobbyError('Partida já encerrou.'); specRef = null; return; }

    isSpectator = true;
    roomCode = code;
    state = data.state; // Carrega o estado atual do jogo

    startGameScreen();
    gel('spectator-bar').classList.remove('hidden');

    specRef.on('value', snap => {
      const d = snap.val();
      if (!d) return;
      state = d.state;
      renderGame();
      if (d.status === 'finished') {
        logEvent('Partida encerrada.');
        specRef.off();
        gel('spectator-bar').textContent = 'Partida encerrada.';
      }
    });
  } catch (e) {
    showLobbyError('Erro ao conectar: ' + e.message);
    specRef = null;
  }
}

async function cancelGame() {
  if (roomRef) {
    await roomRef.remove().catch(() => { });
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

function updateWaitingList(players) {
  const list = gel('waiting-players-list');
  if (!list) return;
  list.innerHTML = '';
  players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'waiting-player-row';
    let playerStatus = '';
    if (p.id === myId) playerStatus = ' (Você)';
    else if (p.isAI) playerStatus = ' (IA)';
    else if (p.id === null) playerStatus = ' (Aguardando...)';

    row.innerHTML = `<span class="player-color-dot" style="background-color: var(--${p.color});"></span> ${escHtml(p.name)}${playerStatus}`;
    list.appendChild(row);
  });
}

/* =====================================================
   VS IA
===================================================== */
function startAIGame() {
  gameMode = 'ai';
  const myName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Jogador';
  const playersConfig = [];

  // Adiciona o jogador humano
  playersConfig.push({ id: myId, name: myName, color: COLORS[0], isAI: false });
  myColor = COLORS[0];

  // Adiciona as IAs
  for (let i = 0; i < selectedAiCount; i++) {
    playersConfig.push({ id: `ai_${i}`, name: `IA ${i + 1}`, color: COLORS[i + 1], isAI: true });
  }

  // Preenche com slots vazios se houver menos de 4 jogadores (humano + IAs)
  while (playersConfig.length < 4) {
    playersConfig.push({ id: null, name: `Slot ${playersConfig.length + 1}`, color: COLORS[playersConfig.length], isAI: false });
  }

  state = buildInitialState(playersConfig);
  startGameScreen();
}

/* =====================================================
   ESTADO INICIAL DO JOGO LUDO
===================================================== */
function buildInitialState(playersConfig) {
  return {
    players: playersConfig.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isAI: p.isAI,
      pawns: Array.from({ length: 4 }, () => ({
        pos: -1, // -1: na base, 0-51: no tabuleiro, -2: no corredor final
        homeStep: -1, // -1: não no corredor final, 0-5: passo no corredor final
        finished: false // true: chegou ao centro
      })),
      score: 0 // Peças que chegaram ao centro
    })),
    currentTurn: 0,
    diceValue: 0,
    phase: 'roll', // 'roll' ou 'move'
    status: 'playing', // 'playing' ou 'finished'
    winner: null
  };
}

/* =====================================================
   INICIAR TELA DE JOGO
===================================================== */
function startGameScreen() {
  gameActive = true;
  buildBoardDOM(); // Constrói o DOM do tabuleiro Ludo
  showScreen('game');

  const show = id => { const e = gel(id); if (e) e.classList.remove('hidden'); };
  const hide = id => { const e = gel(id); if (e) e.classList.add('hidden'); };

  if (isSpectator) {
    show('btn-back-lobby');
    show('spectator-bar');
    hide('btn-resign');
    hide('btn-roll');
    hide('btn-new-game');
  } else {
    show('btn-resign');
    show('btn-roll');
    hide('btn-new-game');
    hide('btn-back-lobby');
    hide('spectator-bar');
  }

  renderGame(); // Renderiza o estado inicial do jogo

  // Se o primeiro jogador for IA, agenda o movimento
  if (state.players[getCurrentPlayerIndex()].isAI) {
    setTimeout(doAITurn, 1000);
  }
}

/* =====================================================
   RESIGNAR
===================================================== */
async function resign() {
  if (!gameActive || isSpectator) return;
  if (!confirm('Tem certeza que deseja desistir da partida?')) return;

  gameActive = false;
  if (gameMode === 'multiplayer' && roomRef) {
    const myPlayer = state.players.find(p => p.id === myId);
    const winnerColor = state.players.find(p => p.id !== myId && !p.isAI)?.color || 'opponent'; // Pega a cor de um oponente humano, se houver
    await roomRef.update({ status: 'finished', winner: winnerColor, state: state }).catch(() => { });
  }
  // Não há saveGame para Ludo no momento, pois não foi solicitado histórico
  showGameOver('Você desistiu', 'O jogo terminou.');
}

/* =====================================================
   GAME OVER
===================================================== */
function showGameOver(title, msg) {
  const t = gel('gameover-title');
  const m = gel('gameover-msg');
  const i = gel('gameover-icon');
  if (t) t.textContent = title;
  if (m) m.textContent = msg;
  if (i) i.textContent = title.includes('🏆') ? '🏆' : title.includes('desistiu') ? '🏳' : '🎲';

  const hide = id => { const e = gel(id); if (e) e.classList.add('hidden'); };
  const show = id => { const e = gel(id); if (e) e.classList.remove('hidden'); };

  hide('btn-resign');
  hide('btn-roll');
  show('btn-new-game'); // Botão "Nova Partida"
  show('btn-back-lobby'); // Botão "Lobby"

  setTimeout(() => showModal('modal-gameover'), 700);
}