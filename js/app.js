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
let engine = new LudoEngine(); // Instância do motor do Ludo
let ai = new LudoAI();         // Instância da IA do Ludo
let state = null;              // Estado serializado do jogo Ludo
let myId = 'guest_' + Math.random().toString(36).slice(2, 8);
let myColor = null;            // Cor do jogador atual
let roomCode = null;
let roomRef = null;
let specRef = null;
let gameActive = false;
let gameMode = 'multiplayer';  // 'multiplayer' ou 'ai'
let aiThinking = false;
let selectedAiCount = 1;       // Quantidade de IAs no modo VS AI
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
      // Guarda o número de jogadores humanos para criar a sala
      gel('btn-create').dataset.humanPlayers = btn.dataset.count;
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
  el('btn-roll', 'click', rollDice); // Botão de rolar dado
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
  engine.reset(); // Reseta o motor do Ludo
  state = null;   // Limpa o estado serializado
  myColor = null; // Limpa a cor do jogador
  roomCode = null; // Limpa o código da sala

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
   CRIAR PARTIDA MULTIPLAYER
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

  const humanPlayersCount = parseInt(btn.dataset.humanPlayers || '2');
  const playersConfig = [];
  const myName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Jogador';

  // Adiciona o jogador criador da sala
  playersConfig.push({ id: myId, name: myName, color: COLORS[0], isAI: false });
  myColor = COLORS[0];

  // Adiciona slots para os outros jogadores humanos
  for (let i = 1; i < humanPlayersCount; i++) {
    playersConfig.push({ id: null, name: `Slot ${i + 1}`, color: COLORS[i], isAI: false });
  }

  // Preenche o restante com IAs se houver menos de 4 jogadores (slots)
  while (playersConfig.length < 4) {
    playersConfig.push({ id: `ai_${playersConfig.length}`, name: `IA ${playersConfig.length}`, color: COLORS[playersConfig.length], isAI: true });
  }

  try {
    roomCode = generateRoomCode();
    roomRef = db.ref('rooms/' + roomCode);

    // Configura o motor do Ludo com os jogadores iniciais
    engine.setup(playersConfig);
    state = engine.serialize();

    await roomRef.set({
      players: playersConfig.map(p => ({ id: p.id, name: p.name, color: p.color, isAI: p.isAI })),
      humanPlayers: humanPlayersCount, // Quantidade de slots humanos
      state: state,
      createdAt: Date.now(),
      status: 'waiting'
    });

    // Timeout para remover a sala se ninguém entrar
    setTimeout(async () => {
      if (!roomRef) return;
      const snap = await roomRef.once('value');
      if (snap.val()?.status === 'waiting') {
        await roomRef.remove();
        if (roomCode === snap.key) { // Só volta para o lobby se for a sala que criamos
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
      if (!data) return;

      updateWaitingList(data.players || []);

      const currentHumanPlayers = (data.players || []).filter(p => p.id && !p.isAI).length;
      const waitingCountEl = gel('waiting-count');
      const waitingTotalEl = gel('waiting-total');
      if (waitingCountEl) waitingCountEl.textContent = currentHumanPlayers;
      if (waitingTotalEl) waitingTotalEl.textContent = data.humanPlayers;

      if (data.status === 'playing' && data.state) {
        roomRef.off(); // Desliga o listener da sala
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

/* =====================================================
   ENTRAR NA PARTIDA MULTIPLAYER
===================================================== */
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
    if (data.status !== 'waiting') { showLobbyError('Partida já começou ou encerrou.'); roomRef = null; return; }

    // Encontra o primeiro slot humano vazio
    const emptySlotIndex = (data.players || []).findIndex(p => p.id === null && !p.isAI);
    if (emptySlotIndex === -1) { showLobbyError('Sala cheia de jogadores humanos.'); roomRef = null; return; }

    roomCode = code;
    myColor = data.players[emptySlotIndex].color; // Pega a cor do slot
    const myName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Jogador';

    // Atualiza o slot com os dados do jogador
    const updatedPlayers = [...data.players];
    updatedPlayers[emptySlotIndex] = { id: myId, name: myName, color: myColor, isAI: false };

    // Verifica se todos os slots humanos estão preenchidos para iniciar o jogo
    const allHumanSlotsFilled = updatedPlayers.filter(p => !p.isAI).every(p => p.id !== null);
    const newStatus = allHumanSlotsFilled ? 'playing' : 'waiting';

    await roomRef.update({ players: updatedPlayers, status: newStatus });

    // Se o jogo começou, carrega o estado inicial
    if (newStatus === 'playing') {
      engine.deserialize(data.state); // Carrega o estado inicial da sala
      startGameScreen();
    } else {
      // Se ainda está esperando, vai para a tela de espera
      showScreen('waiting');
      const drc = gel('display-room-code');
      if (drc) drc.textContent = roomCode;
    }

    // Listener para atualizações da sala
    roomRef.on('value', snap => {
      const d = snap.val();
      if (!d) return;
      updateWaitingList(d.players || []);
      const currentHumanPlayers = (d.players || []).filter(p => p.id && !p.isAI).length;
      const waitingCountEl = gel('waiting-count');
      const waitingTotalEl = gel('waiting-total');
      if (waitingCountEl) waitingCountEl.textContent = currentHumanPlayers;
      if (d.status === 'playing' && d.state) {
        roomRef.off();
        state = d.state;
        startGameScreen();
      }
    });
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
    engine.deserialize(data.state); // Carrega o estado atual do jogo

    startGameScreen();
    gel('spectator-bar').classList.remove('hidden');

    specRef.on('value', snap => {
      const d = snap.val();
      if (!d) return;
      engine.deserialize(d.state);
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

  engine.setup(playersConfig); // Configura o motor do Ludo com os jogadores
  state = engine.serialize();   // Serializa o estado inicial
  startGameScreen();
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
  if (engine.activePlayer.isAI) {
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
    const myPlayer = engine.players.find(p => p.id === myId);
    const winnerPlayer = engine.players.find(p => p.id !== myId && !p.isAI); // Encontra um oponente humano
    const winnerColor = winnerPlayer ? winnerPlayer.color : null; // Se não houver humano, não há vencedor claro

    await roomRef.update({ status: 'resigned', winner: winnerColor, state: engine.serialize() }).catch(() => { });
  }
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
  show('btn-gameover-new'); // Botão "Nova Partida"
  show('btn-gameover-lobby'); // Botão "Lobby"

  setTimeout(() => showModal('modal-gameover'), 700);
}

/* =====================================================
   LÓGICA DO JOGO
===================================================== */
function getCurrentPlayerIndex() {
  return engine.currentTurn;
}

function isMyTurn() {
  return engine.activePlayer.id === myId;
}

async function rollDice() {
  if (!gameActive || isSpectator || aiThinking || !isMyTurn() || engine.phase !== 'roll') return;

  engine.rollDice();
  state = engine.serialize(); // Atualiza o estado global
  renderGame();
  // logEvent(`${engine.activePlayer.name} rolou ${engine.diceValue}`); // Já logado pela engine

  if (gameMode === 'multiplayer' && roomRef) {
    await roomRef.update({ state: state });
  }

  // Se não houver movimentos válidos, a engine já passou a vez
  // Se o próximo jogador for IA, agenda o movimento
  if (engine.activePlayer.isAI) {
    setTimeout(doAITurn, 1000);
  }
}

async function doMovePawn(playerIdx, pawnIdx) {
  if (!gameActive || isSpectator || aiThinking || !isMyTurn() || engine.phase !== 'move') return;

  // Verifica se a peça clicada pertence ao jogador atual
  const currentPlayer = engine.activePlayer;
  if (engine.players.indexOf(currentPlayer) !== playerIdx) return;

  const validMoves = engine.getValidMoves();
  if (!validMoves.includes(pawnIdx)) {
    logEvent('Movimento inválido para esta peça.');
    return;
  }

  const moveResult = engine.movePawn(pawnIdx);
  state = engine.serialize(); // Atualiza o estado global
  renderGame();
  // logEvent(`${engine.activePlayer.name} moveu peão ${pawnIdx + 1}`); // Já logado pela engine

  if (gameMode === 'multiplayer' && roomRef) {
    await roomRef.update({ state: state });
  }

  if (engine.status === 'finished') {
    showGameOver('🏆 Vitória!', `${engine.activePlayer.name} venceu a partida!`);
    return;
  }

  // Se o próximo jogador for IA, agenda o movimento
  if (engine.activePlayer.isAI) {
    setTimeout(doAITurn, 1000);
  }
}

async function doAITurn() {
  if (!gameActive || !engine.activePlayer.isAI) return;

  aiThinking = true;
  renderGame(); // Atualiza UI para mostrar "IA pensando..."

  await new Promise(resolve => setTimeout(resolve, 1500)); // Simula tempo de pensamento da IA

  if (engine.phase === 'roll') {
    engine.rollDice();
    state = engine.serialize();
    renderGame();
    // logEvent(`${engine.activePlayer.name} (IA) rolou ${engine.diceValue}`); // Já logado pela engine

    if (gameMode === 'multiplayer' && roomRef) {
      await roomRef.update({ state: state });
    }

    if (engine.status === 'finished') {
      showGameOver('🏆 Vitória!', `${engine.activePlayer.name} venceu a partida!`);
      aiThinking = false;
      return;
    }

    // Se a IA não tem movimentos válidos após rolar, a engine já passou a vez.
    // Se o próximo jogador ainda for IA (ex: tirou 6), agenda o próximo movimento.
    if (engine.activePlayer.isAI) {
      setTimeout(doAITurn, 1000);
    } else {
      aiThinking = false;
      renderGame();
    }

  } else if (engine.phase === 'move') {
    const pawnIdx = ai.getBestMove(engine); // A IA decide qual peão mover
    if (pawnIdx !== null) {
      engine.movePawn(pawnIdx);
      state = engine.serialize();
      renderGame();
      // logEvent(`${engine.activePlayer.name} (IA) moveu peão ${pawnIdx + 1}`); // Já logado pela engine

      if (gameMode === 'multiplayer' && roomRef) {
        await roomRef.update({ state: state });
      }

      if (engine.status === 'finished') {
        showGameOver('🏆 Vitória!', `${engine.activePlayer.name} venceu a partida!`);
        aiThinking = false;
        return;
      }

      // Se o próximo jogador ainda for IA (ex: tirou 6 ou capturou), agenda o próximo movimento.
      if (engine.activePlayer.isAI) {
        setTimeout(doAITurn, 1000);
      } else {
        aiThinking = false;
        renderGame();
      }
    } else {
      // Caso a IA não encontre um movimento válido (não deveria acontecer se getValidMoves() funcionou)
      logEvent('IA não encontrou movimento válido e passou a vez.');
      engine.nextTurn(); // Força a passagem de turno
      state = engine.serialize();
      renderGame();
      if (gameMode === 'multiplayer' && roomRef) {
        await roomRef.update({ state: state });
      }
      aiThinking = false;
    }
  }
}

function logEvent(message, color = 'neutral') {
  engine.logEvent(message, color); // Adiciona ao log da engine
  renderLog(); // Renderiza o log na UI
}

/* =====================================================
   RENDERIZAÇÃO DO TABULEIRO LUDO (DOM)
===================================================== */
const BOARD_SIZE = 15; // 15x15 células
const PATH_COORDS = [
  // Vermelho (entrada 0)
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 0-4
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], // 5-9
  [7, 0], // 10
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], // 11-15
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], // 16-20
  // Azul (entrada 13)
  [0, 7], // 21
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], // 22-26
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], // 27-31
  [7, 14], // 32
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9], // 33-37
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], // 38-42
  // Verde (entrada 26)
  [14, 7], // 43
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6], // 44-48 (volta para a trilha vermelha)
  // Amarelo (entrada 39)
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], // 49-53 (volta para a trilha azul)
];

// Coordenadas das casas seguras no tabuleiro principal (índices da PATH_COORDS)
const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Coordenadas dos corredores finais
const HOME_PATHS = {
  red:    [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]], // Coluna 7, subindo
  blue:   [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],     // Linha 7, da esquerda para direita
  green:  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],     // Coluna 7, descendo
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]]  // Linha 7, da direita para esquerda
};

// Coordenadas das posições iniciais dos peões na base
const BASE_POSITIONS = {
  red:    [[1, 1], [1, 4], [4, 1], [4, 4]],
  blue:   [[1, 10], [1, 13], [4, 10], [4, 13]],
  green:  [[10, 10], [10, 13], [13, 10], [13, 13]],
  yellow: [[10, 1], [10, 4], [13, 1], [13, 4]]
};

let BOARD_LAYOUT = []; // Cache do DOM das células do tabuleiro

function buildBoardDOM() {
  const boardEl = gel('ludo-board');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  BOARD_LAYOUT = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    BOARD_LAYOUT[r] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'ludo-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.style.gridRow = (r + 1);
      cell.style.gridColumn = (c + 1);

      const zone = getCellZone(r, c);
      if (zone) cell.classList.add('zone-' + zone);

      const pathIdx = getPathIndex(r, c);
      if (pathIdx !== -1 && SAFE_CELLS.has(pathIdx)) cell.classList.add('safe');

      boardEl.appendChild(cell);
      BOARD_LAYOUT[r][c] = cell;
    }
  }
}

function getCellZone(r, c) {
  // Bases
  if (r >= 0 && r <= 5 && c >= 0 && c <= 5) return 'red';
  if (r >= 0 && r <= 5 && c >= 9 && c <= 14) return 'blue';
  if (r >= 9 && r <= 14 && c >= 9 && c <= 14) return 'green';
  if (r >= 9 && r <= 14 && c >= 0 && c <= 5) return 'yellow';
  // Centro
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return 'center';
  // Trilhas coloridas de entrada
  if (r === 13 && c === 7) return 'red';
  if (r === 7 && c === 1) return 'blue';
  if (r === 1 && c === 7) return 'green';
  if (r === 7 && c === 13) return 'yellow';
  // Corredores finais
  if (r >= 8 && r <= 13 && c === 7) return 'red'; // Corredor vermelho
  if (r === 7 && c >= 8 && c <= 13) return 'blue'; // Corredor azul
  if (r >= 1 && r <= 6 && c === 7) return 'green'; // Corredor verde
  if (r === 7 && c >= 1 && c <= 6) return 'yellow'; // Corredor amarelo

  return 'neutral'; // Trilhas neutras
}

function getPathIndex(r, c) {
  for (let i = 0; i < PATH_COORDS.length; i++) {
    if (PATH_COORDS[i][0] === r && PATH_COORDS[i][1] === c) return i;
  }
  return -1;
}

function renderGame() {
  if (!state) return;
  engine.deserialize(state); // Garante que o motor está com o estado mais recente
  renderBoard();
  renderPlayersList();
  renderStatusBar();
  renderDice();
  renderLog();
}

function renderBoard() {
  // Remove todos os peões existentes do DOM
  document.querySelectorAll('.pawn').forEach(p => p.remove());

  engine.players.forEach((player, playerIdx) => {
    player.pawns.forEach((pawn, pawnIdx) => {
      if (pawn.finished) return; // Peças que chegaram ao centro não são renderizadas no tabuleiro

      let coords = null;
      if (pawn.pos === -1) {
        // Peça na base
        coords = BASE_POSITIONS[player.color]?.[pawnIdx];
      } else if (pawn.homeStep !== -1) {
        // Peça no corredor final
        coords = HOME_PATHS[player.color]?.[pawn.homeStep];
      } else {
        // Peça no tabuleiro principal
        coords = PATH_COORDS[pawn.pos];
      }

      if (!coords) return;

      const cell = BOARD_LAYOUT[coords[0]]?.[coords[1]];
      if (!cell) return;

      const pawnEl = document.createElement('div');
      pawnEl.className = `pawn ${player.color}`;
      pawnEl.dataset.playerIdx = playerIdx;
      pawnEl.dataset.pawnIdx = pawnIdx;
      pawnEl.textContent = (pawnIdx + 1); // Número do peão

      // Adiciona classe de "movable" se for a vez do jogador e a peça puder mover
      if (!isSpectator && isMyTurn() && engine.phase === 'move') {
        const validMoves = engine.getValidMoves();
        if (validMoves.includes(pawnIdx)) {
          pawnEl.classList.add('movable');
          pawnEl.addEventListener('click', () => doMovePawn(playerIdx, pawnIdx));
        }
      }
      cell.appendChild(pawnEl);
    });
  });
}

function renderPlayersList() {
  const listEl = gel('players-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  engine.players.forEach(player => {
    const card = document.createElement('div');
    card.className = `player-card ${player.color}`;
    if (engine.activePlayer.id === player.id) {
      card.classList.add('active-turn');
    }

    let playerName = escHtml(player.name);
    if (player.id === myId) playerName += ' (Você)';
    else if (player.isAI) playerName += ' (IA)';

    card.innerHTML = `
      <div class="color-dot"></div>
      <span class="player-name">${playerName}</span>
      <span class="player-score">${player.score} / ${engine.PIECES_PER}</span>
    `;
    listEl.appendChild(card);
  });
}

function renderStatusBar() {
  const bar = gel('status-bar');
  if (!bar) return;
  bar.className = 'status-bar'; // Reseta classes

  if (isSpectator) {
    bar.textContent = `👁 Assistindo — Vez de ${engine.activePlayer.name}`;
    return;
  }
  if (aiThinking) {
    bar.innerHTML = 'Computador pensando <span class="thinking-dots"><span></span><span></span><span></span></span>';
    return;
  }

  const isCurrentPlayerAI = engine.activePlayer.isAI;
  const isMyTurnNow = isMyTurn();

  if (engine.status === 'finished') {
    bar.textContent = `Partida encerrada! Vencedor: ${engine.players.find(p => p.color === engine.winner)?.name || 'Desconhecido'}`;
    bar.classList.add('finished');
  } else if (isMyTurnNow) {
    if (engine.phase === 'roll') {
      bar.textContent = `Sua vez (${COLOR_PT[myColor]}) — Role o dado!`;
    } else { // phase === 'move'
      bar.textContent = `Sua vez (${COLOR_PT[myColor]}) — Escolha uma peça para mover ${engine.diceValue} casas.`;
    }
    bar.classList.add('your-turn');
  } else {
    bar.textContent = `Vez de ${engine.activePlayer.name}`;
    bar.classList.remove('your-turn');
  }

  // Botão de rolar dado
  const btnRoll = gel('btn-roll');
  if (btnRoll) {
    btnRoll.disabled = !isMyTurnNow || engine.phase !== 'roll' || aiThinking || !gameActive;
  }
}

function renderDice() {
  const diceDisplay = gel('dice-display');
  if (diceDisplay) {
    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    diceDisplay.textContent = engine.diceValue > 0 ? faces[engine.diceValue] : '🎲';
  }
}

function renderLog() {
  const logEntriesEl = gel('log-entries');
  if (!logEntriesEl) return;
  logEntriesEl.innerHTML = '';
  engine.log.forEach(entry => {
    const logEntryEl = document.createElement('div');
    logEntryEl.className = `log-entry color-${entry.color}`;
    logEntryEl.textContent = entry.message;
    logEntriesEl.appendChild(logEntryEl);
  });
  logEntriesEl.scrollTop = logEntriesEl.scrollHeight; // Scroll para o final
}