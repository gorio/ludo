/* =====================================================
   LUDO ONLINE - App Principal
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

let db, currentAuthManager, historyManager, engine, ai;
let myId = 'guest_' + Math.random().toString(36).slice(2, 8);
let myColor = null;
let roomCode = null;
let roomRef = null;
let specRef = null;
let gameActive = false;
let gameMode = 'multiplayer';
let aiThinking = false;
let isSpectator = false;
let selectedHumanPlayersCount = 2;
let selectedAiCount = 1;
let boardCells = [];

function gel(id) { return document.getElementById(id); }

function el(id, event, handler) {
  const element = gel(id);
  if (element) element.addEventListener(event, handler);
}

function text(node, value) {
  if (node) node.textContent = value == null ? '' : String(value);
}

function safeName(value, fallback) {
  const name = String(value || fallback || 'Jogador').trim();
  return name.slice(0, 60);
}

function initials(name) {
  return safeName(name, '?').split(/\s+/).slice(0, 2)
    .map(part => part[0] ? part[0].toUpperCase() : '')
    .join('') || '?';
}

function colorLabel(color) {
  return window.LUDO_CONSTANTS.COLOR_TRANSLATIONS[color] || color || '';
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  const target = gel('screen-' + name);
  if (target) target.classList.add('active');
}

function showModal(id) { const node = gel(id); if (node) node.classList.remove('hidden'); }
function hideModal(id) { const node = gel(id); if (node) node.classList.add('hidden'); }
function showAuthError(msg) { text(gel('auth-error'), msg); }
function clearAuthError() { showAuthError(''); }
function showLobbyError(msg) { text(gel('lobby-error'), msg); }
function clearLobbyError() { showLobbyError(''); }

window.addEventListener('DOMContentLoaded', function() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    currentAuthManager = new AuthManager();
    currentAuthManager.initialize(firebase.app());
    historyManager = new HistoryManager(db);
    engine = new LudoEngine();
    ai = new LudoAI();
  } catch (error) {
    console.error('Firebase init error:', error);
    showAuthError('Erro ao iniciar o app. Verifique a configuração do Firebase.');
    return;
  }

  initAuthUI();
  initLobbyUI();
  initGameUI();
  initHistoryUI();
  buildBoardDOM();

  currentAuthManager.onUserChanged(function(user) {
    updateHeaderUI(user);
    myId = user ? user.uid : 'guest_' + Math.random().toString(36).slice(2, 8);
    if (user) {
      if (!gameActive && !isSpectator) showScreen('lobby');
    } else {
      stopRoomListeners();
      gameActive = false;
      isSpectator = false;
      showScreen('auth');
    }
  });
});

/* =====================================================
   AUTH
===================================================== */
function authErrorMsg(code) {
  return ({
    'auth/user-not-found': 'Usuário não encontrado.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/email-already-in-use': 'E-mail já cadastrado.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'Senha muito fraca.',
    'auth/too-many-requests': 'Muitas tentativas. Tente mais tarde.',
    'auth/popup-closed-by-user': ''
  })[code] || 'Erro ao autenticar.';
}

function initAuthUI() {
  document.querySelectorAll('.auth-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      gel('tab-login').classList.toggle('hidden', target !== 'login');
      gel('tab-register').classList.toggle('hidden', target !== 'register');
      clearAuthError();
    });
  });

  el('btn-login-email', 'click', loginWithEmail);
  el('login-password', 'keydown', event => { if (event.key === 'Enter') loginWithEmail(); });
  el('btn-login-google', 'click', loginWithGoogle);
  el('btn-register-google', 'click', loginWithGoogle);
  el('btn-register', 'click', registerWithEmail);
}

async function loginWithEmail() {
  const email = gel('login-email').value.trim();
  const password = gel('login-password').value;
  if (!email || !password) { showAuthError('Preencha e-mail e senha.'); return; }
  try { await currentAuthManager.loginWithEmail(email, password); }
  catch (error) { showAuthError(authErrorMsg(error.code)); }
}

async function loginWithGoogle() {
  try { await currentAuthManager.loginWithGoogle(); }
  catch (error) {
    const msg = authErrorMsg(error.code);
    if (msg) showAuthError(msg);
  }
}

async function registerWithEmail() {
  const name = gel('reg-name').value.trim();
  const email = gel('reg-email').value.trim();
  const password = gel('reg-password').value;
  if (!name) { showAuthError('Informe seu nome.'); return; }
  if (!email) { showAuthError('Informe seu e-mail.'); return; }
  if (password.length < 6) { showAuthError('Senha mínima de 6 caracteres.'); return; }
  try { await currentAuthManager.registerWithEmail(name, email, password); }
  catch (error) { showAuthError(authErrorMsg(error.code)); }
}

function updateHeaderUI(user) {
  const headerName = gel('header-username');
  const photo = gel('header-photo');
  const fallback = gel('header-initials');
  if (!user) {
    text(headerName, '');
    if (photo) { photo.src = ''; photo.classList.add('hidden'); }
    if (fallback) { fallback.textContent = '?'; fallback.classList.remove('hidden'); }
    return;
  }

  const name = safeName(user.displayName || (user.email ? user.email.split('@')[0] : ''), 'Jogador');
  text(headerName, name);
  if (photo && fallback) {
    if (user.photoURL) {
      photo.src = user.photoURL;
      photo.classList.remove('hidden');
      fallback.classList.add('hidden');
    } else {
      photo.src = '';
      photo.classList.add('hidden');
      fallback.textContent = initials(name);
      fallback.classList.remove('hidden');
    }
  }
}

/* =====================================================
   LOBBY
===================================================== */
function initLobbyUI() {
  el('btn-logout', 'click', function() { currentAuthManager.signOut(); });
  el('btn-history-ludo', 'click', openHistoryScreen);
  el('btn-live-games-ludo', 'click', openLiveGamesScreen);
  el('btn-create-room', 'click', createGame);
  el('btn-join-room', 'click', joinGame);
  el('input-room', 'keydown', event => { if (event.key === 'Enter') joinGame(); });
  el('btn-spectate-room', 'click', spectateGame);
  el('input-spectate', 'keydown', event => { if (event.key === 'Enter') spectateGame(); });
  el('btn-start-ai-game', 'click', startAIGame);
  el('btn-cancel-game', 'click', cancelGame);
  el('btn-copy-room-code', 'click', copyRoomCode);
  el('btn-start-multiplayer-game-host', 'click', startGameAsHost);

  document.querySelectorAll('.mode-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameMode = btn.dataset.mode;
      gel('panel-multiplayer').classList.toggle('hidden', gameMode !== 'multiplayer');
      gel('panel-ai').classList.toggle('hidden', gameMode !== 'ai');
      clearLobbyError();
    });
  });

  document.querySelectorAll('#lobby-player-count .seg-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      selectedHumanPlayersCount = parseInt(btn.dataset.count, 10);
      setActiveSegment('#lobby-player-count .seg-btn', btn);
    });
  });

  document.querySelectorAll('#lobby-ai-count .seg-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      selectedAiCount = parseInt(btn.dataset.count, 10);
      setActiveSegment('#lobby-ai-count .seg-btn', btn);
    });
  });
}

function setActiveSegment(selector, active) {
  document.querySelectorAll(selector).forEach(btn => btn.classList.remove('active'));
  active.classList.add('active');
}

function requireUser(action) {
  if (currentAuthManager.uid && !currentAuthManager.isAnonymous) return true;
  showLobbyError('Faça login para ' + action + '.');
  return false;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function playerFromSlot(color, data) {
  return Object.assign({ color: color }, data || {});
}

function playersFromSlots(playerColors) {
  return window.LUDO_CONSTANTS.LUDO_COLORS
    .map(color => playerFromSlot(color, playerColors[color]))
    .filter(player => player && player.id);
}

function emptySlot(color) {
  return {
    id: null,
    name: 'Aguardando ' + colorLabel(color),
    isAI: false,
    photoURL: ''
  };
}

async function createGame() {
  if (!requireUser('criar uma partida')) return;
  const btn = gel('btn-create-room');
  if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }
  clearLobbyError();

  try {
    stopRoomListeners();
    roomCode = generateRoomCode();
    roomRef = db.ref('ludo_rooms/' + roomCode);
    myColor = 'red';

    const colors = window.LUDO_CONSTANTS.LUDO_COLORS.slice();
    const playerColors = {};
    colors.forEach(color => { playerColors[color] = emptySlot(color); });
    playerColors.red = {
      id: currentAuthManager.uid,
      name: safeName(currentAuthManager.displayName, 'Jogador'),
      isAI: false,
      photoURL: currentAuthManager.photoURL || ''
    };

    const aiSlots = colors.slice(selectedHumanPlayersCount);
    aiSlots.forEach(function(color, index) {
      playerColors[color] = {
        id: 'ai_' + color + '_' + Date.now() + '_' + index,
        name: 'Computador ' + (index + 1),
        isAI: true,
        photoURL: ''
      };
    });

    engine.setupGame(playersFromSlots(playerColors));
    await roomRef.set({
      roomCode: roomCode,
      gameType: 'ludo',
      hostUid: currentAuthManager.uid,
      expectedHumanPlayers: selectedHumanPlayersCount,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      status: 'waiting',
      playerColors: playerColors,
      state: engine.serialize()
    });

    text(gel('display-room-code'), roomCode);
    showScreen('waiting');
    watchWaitingRoom();
  } catch (error) {
    console.error(error);
    showLobbyError('Erro ao criar sala: ' + error.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Criar Partida'; }
  }
}

async function joinGame() {
  if (!requireUser('entrar em uma partida')) return;
  const code = (gel('input-room').value || '').trim().toUpperCase();
  clearLobbyError();
  if (code.length !== 6) { showLobbyError('Código deve ter 6 caracteres.'); return; }

  const btn = gel('btn-join-room');
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

  try {
    stopRoomListeners();
    roomRef = db.ref('ludo_rooms/' + code);
    const snap = await roomRef.once('value');
    const room = snap.val();
    if (!room) { showLobbyError('Sala não encontrada.'); roomRef = null; return; }
    if (room.gameType !== 'ludo') { showLobbyError('Esta sala é de outro jogo.'); roomRef = null; return; }
    if (room.status !== 'waiting') { showLobbyError('Esta partida já começou.'); roomRef = null; return; }

    const playerColors = room.playerColors || {};
    let chosenColor = null;
    for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
      const slot = playerColors[color];
      if (slot && slot.id === currentAuthManager.uid) { chosenColor = color; break; }
      if (slot && !slot.id && !slot.isAI && !chosenColor) chosenColor = color;
    }
    if (!chosenColor) { showLobbyError('Sala cheia.'); roomRef = null; return; }

    myColor = chosenColor;
    roomCode = code;
    await roomRef.child('playerColors/' + chosenColor).set({
      id: currentAuthManager.uid,
      name: safeName(currentAuthManager.displayName, 'Jogador'),
      isAI: false,
      photoURL: currentAuthManager.photoURL || ''
    });

    text(gel('display-room-code'), roomCode);
    showScreen('waiting');
    watchWaitingRoom();
  } catch (error) {
    console.error(error);
    showLobbyError('Erro ao entrar: ' + error.message);
    roomRef = null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

function watchWaitingRoom() {
  if (!roomRef) return;
  roomRef.on('value', function(snap) {
    const room = snap.val();
    if (!room) {
      stopRoomListeners();
      goLobby();
      showLobbyError('A sala foi encerrada.');
      return;
    }
    if (room.status === 'playing') {
      startMultiplayerGame(room);
      return;
    }
    updateWaitingRoomPlayers(room);
  });
}

function updateWaitingRoomPlayers(room) {
  const playerColors = room.playerColors || {};
  const list = gel('waiting-players-list');
  if (!list) return;
  list.innerHTML = '';

  const slots = window.LUDO_CONSTANTS.LUDO_COLORS
    .map(color => playerFromSlot(color, playerColors[color] || emptySlot(color)));
  const humanCount = slots.filter(player => player.id && !player.isAI).length;
  const expected = room.expectedHumanPlayers || 2;

  text(gel('waiting-current-players'), humanCount);
  text(gel('waiting-max-players'), expected);

  slots.forEach(function(player) {
    const row = document.createElement('div');
    row.className = 'waiting-player-row';
    const dot = document.createElement('span');
    dot.className = 'player-color-dot';
    dot.style.backgroundColor = 'var(--ludo-' + player.color + ')';
    const label = document.createElement('span');
    const suffix = player.id === currentAuthManager.uid ? ' (Você)' : '';
    label.textContent = player.id
      ? safeName(player.name, 'Jogador') + (player.isAI ? ' (IA)' : suffix)
      : 'Aguardando ' + colorLabel(player.color);
    row.append(dot, label);
    list.appendChild(row);
  });

  const startBtn = gel('btn-start-multiplayer-game-host');
  const isHost = room.hostUid === currentAuthManager.uid;
  if (startBtn) {
    startBtn.classList.toggle('hidden', !isHost);
    startBtn.disabled = !isHost || humanCount < expected;
  }
}

async function startGameAsHost() {
  if (!roomRef) return;
  const snap = await roomRef.once('value');
  const room = snap.val();
  if (!room || room.hostUid !== currentAuthManager.uid) return;
  const humanCount = Object.values(room.playerColors || {}).filter(player => player && player.id && !player.isAI).length;
  if (humanCount < (room.expectedHumanPlayers || 2)) return;

  const players = playersFromSlots(room.playerColors || {});
  engine.setupGame(players);
  await roomRef.update({
    status: 'playing',
    startedAt: firebase.database.ServerValue.TIMESTAMP,
    state: engine.serialize()
  });
  await saveLiveGame(roomCode, room, engine.serialize());
}

async function cancelGame() {
  if (!roomRef) { goLobby(); return; }
  try {
    const snap = await roomRef.once('value');
    const room = snap.val();
    if (room && room.hostUid === currentAuthManager.uid) {
      await roomRef.remove();
      await removeLiveGame(roomCode);
    } else if (myColor) {
      await roomRef.child('playerColors/' + myColor).set(emptySlot(myColor));
    }
  } finally {
    stopRoomListeners();
    goLobby();
  }
}

function copyRoomCode() {
  if (!roomCode) return;
  navigator.clipboard.writeText(roomCode).then(function() {
    const feedback = gel('copy-feedback');
    text(feedback, 'Copiado!');
    setTimeout(() => text(feedback, ''), 2000);
  });
}

/* =====================================================
   GAME
===================================================== */
function initGameUI() {
  el('btn-roll', 'click', onRollDiceClick);
  el('btn-resign', 'click', resign);
  el('btn-back-lobby', 'click', function() { stopRoomListeners(); goLobby(); });
  el('btn-gameover-new', 'click', function() {
    hideModal('modal-gameover');
    if (gameMode === 'ai') startAIGame();
    else goLobby();
  });
  el('btn-gameover-history', 'click', function() { hideModal('modal-gameover'); openHistoryScreen(); });
  el('btn-gameover-lobby', 'click', function() { hideModal('modal-gameover'); goLobby(); });
}

function buildBoardDOM() {
  const board = gel('ludo-board');
  if (!board) return;
  board.innerHTML = '';
  boardCells = [];
  for (let row = 0; row < window.LUDO_CONSTANTS.BOARD_SIZE; row++) {
    boardCells[row] = [];
    for (let col = 0; col < window.LUDO_CONSTANTS.BOARD_SIZE; col++) {
      const cell = document.createElement('div');
      cell.className = 'ludo-cell ' + getCellZone(row, col);
      cell.dataset.row = row;
      cell.dataset.col = col;
      if (isSafeCell(row, col)) cell.classList.add('safe');
      board.appendChild(cell);
      boardCells[row][col] = cell;
    }
  }
}

function isSafeCell(row, col) {
  return window.LUDO_CONSTANTS.PATH_COORDS.some(function(coord, index) {
    return window.LUDO_CONSTANTS.SAFE_SQUARES.includes(index) && coord[0] === row && coord[1] === col;
  });
}

function getCellZone(row, col) {
  if (row >= 0 && row <= 5 && col >= 0 && col <= 5) return 'red-base';
  if (row >= 0 && row <= 5 && col >= 9 && col <= 14) return 'blue-base';
  if (row >= 9 && row <= 14 && col >= 9 && col <= 14) return 'green-base';
  if (row >= 9 && row <= 14 && col >= 0 && col <= 5) return 'yellow-base';
  if (row === 7 && col >= 1 && col <= 6) return 'red-homepath';
  if (col === 7 && row >= 1 && row <= 6) return 'blue-homepath';
  if (row === 7 && col >= 8 && col <= 13) return 'green-homepath';
  if (col === 7 && row >= 8 && row <= 13) return 'yellow-homepath';
  if (row === 7 && col === 7) return 'center-final';
  for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
    const pos = window.LUDO_CONSTANTS.ENTRY_POS[color];
    if (pos[0] === row && pos[1] === col) return color + '-entry';
  }
  return 'neutral-path';
}

function startAIGame() {
  if (!requireUser('jogar contra a IA')) return;
  gameMode = 'ai';
  gameActive = true;
  isSpectator = false;
  aiThinking = false;
  myColor = 'red';
  stopRoomListeners();

  const players = [{
    id: currentAuthManager.uid,
    name: safeName(currentAuthManager.displayName, 'Você'),
    isAI: false,
    color: 'red',
    photoURL: currentAuthManager.photoURL || ''
  }];
  window.LUDO_CONSTANTS.LUDO_COLORS.slice(1, selectedAiCount + 1).forEach(function(color, index) {
    players.push({
      id: 'ai_' + color + '_' + Date.now() + '_' + index,
      name: 'Computador ' + (index + 1),
      isAI: true,
      color: color,
      photoURL: ''
    });
  });

  engine.setupGame(players);
  enterGameScreen(false);
  if (engine.activePlayer.isAI) setTimeout(doAITurn, 900);
}

function startMultiplayerGame(room) {
  gameMode = 'multiplayer';
  gameActive = true;
  isSpectator = false;
  roomCode = room.roomCode;
  if (!myColor) {
    for (const color of window.LUDO_CONSTANTS.LUDO_COLORS) {
      if (room.playerColors && room.playerColors[color] && room.playerColors[color].id === currentAuthManager.uid) {
        myColor = color;
      }
    }
  }
  engine.deserialize(room.state);
  enterGameScreen(false);
  roomRef.off();
  roomRef.on('value', onRoomGameUpdate);
}

async function onRoomGameUpdate(snap) {
  const room = snap.val();
  if (!room) {
    gameActive = false;
    showGameOver('Partida encerrada', 'A sala foi removida.');
    return;
  }
  if (room.state) engine.deserialize(room.state);
  renderGame();
  if (room.status === 'finished' || room.status === 'resigned' || room.status === 'abandoned') {
    await handleRemoteGameOver(room);
    return;
  }
  if (room.hostUid === currentAuthManager.uid && engine.activePlayer && engine.activePlayer.isAI && !aiThinking) {
    setTimeout(doAITurn, 900);
  }
}

function enterGameScreen(spectator) {
  isSpectator = spectator;
  gel('btn-roll').classList.toggle('hidden', spectator);
  gel('btn-resign').classList.toggle('hidden', spectator);
  gel('btn-back-lobby').classList.toggle('hidden', !spectator);
  gel('spectator-bar').classList.toggle('hidden', !spectator);
  showScreen('game');
  renderGame();
}

function isMyTurn() {
  return !isSpectator && gameActive && engine.activePlayer && engine.activePlayer.id === currentAuthManager.uid;
}

async function onRollDiceClick() {
  if (!isMyTurn() || engine.phase !== 'roll' || aiThinking) return;
  engine.rollDice();
  renderGame();
  await syncGameState();

  if (engine.status === 'finished') {
    await finishLocalGame('win', currentAuthManager.displayName + ' venceu a partida!');
    return;
  }

  if (engine.phase === 'move' && engine.getValidMoves().length === 0) {
    renderGame();
    await syncGameState();
    maybeRunAI();
  }
}

async function doMovePawn(pawnIndex) {
  if (!isMyTurn() || engine.phase !== 'move' || aiThinking) return;
  if (!engine.doMovePawn(pawnIndex)) return;
  renderGame();
  await syncGameState();

  if (engine.status === 'finished') {
    await finishLocalGame('win', (currentAuthManager.displayName || 'Você') + ' venceu a partida!');
    return;
  }
  maybeRunAI();
}

function maybeRunAI() {
  if (gameActive && engine.activePlayer && engine.activePlayer.isAI) {
    setTimeout(doAITurn, 900);
  }
}

async function doAITurn() {
  if (!gameActive || !engine.activePlayer || !engine.activePlayer.isAI || engine.status !== 'playing') return;
  aiThinking = true;
  renderGame();
  await wait(700);

  if (engine.phase === 'roll') {
    engine.rollDice();
    renderGame();
    await syncGameState();
    await wait(500);
  }

  if (engine.phase === 'move') {
    const validMoves = engine.getValidMoves();
    if (validMoves.length > 0) {
      const move = ai.getBestMove(engine);
      if (move !== null) engine.doMovePawn(move);
    }
  }

  aiThinking = false;
  renderGame();
  await syncGameState();

  if (engine.status === 'finished') {
    const winner = engine.players.find(player => player.id === engine.winner);
    await finishLocalGame(engine.winner === currentAuthManager.uid ? 'win' : 'loss', (winner ? winner.name : 'Alguém') + ' venceu a partida!');
    return;
  }
  maybeRunAI();
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncGameState() {
  if (gameMode !== 'multiplayer' || !roomRef) return;
  const patch = { state: engine.serialize() };
  if (engine.status === 'finished') {
    patch.status = 'finished';
    patch.winner = engine.winner;
  }
  await roomRef.update(patch).catch(error => console.error('Erro ao sincronizar:', error));
}

async function finishLocalGame(result, message) {
  gameActive = false;
  await saveHistory(result);
  if (gameMode === 'multiplayer' && roomRef) {
    await roomRef.update({ status: 'finished', winner: engine.winner, state: engine.serialize() }).catch(function(){});
    await removeLiveGame(roomCode);
  }
  showGameOver(result === 'win' ? 'Vitória! 🏆' : 'Fim de Jogo', message);
}

async function handleRemoteGameOver(room) {
  if (!gameActive) return;
  gameActive = false;
  const winnerId = room.winner || (engine && engine.winner);
  const winner = engine.players.find(player => player.id === winnerId);
  const result = winnerId === currentAuthManager.uid ? 'win' : 'loss';
  await saveHistory(result);
  await removeLiveGame(roomCode);
  showGameOver(result === 'win' ? 'Vitória! 🏆' : 'Fim de Jogo', (winner ? winner.name : 'Alguém') + ' venceu a partida.');
  stopRoomListeners();
}

async function resign() {
  if (!gameActive || isSpectator) return;
  if (!confirm('Tem certeza que deseja desistir?')) return;
  gameActive = false;
  await saveHistory('resigned');
  if (gameMode === 'multiplayer' && roomRef) {
    const winner = engine.players.find(player => !player.isAI && player.id !== currentAuthManager.uid) || engine.players.find(player => player.id !== currentAuthManager.uid);
    await roomRef.update({
      status: 'resigned',
      winner: winner ? winner.id : null,
      resignedPlayerId: currentAuthManager.uid,
      state: engine.serialize()
    }).catch(function(){});
    await removeLiveGame(roomCode);
  }
  showGameOver('Você desistiu', 'A partida foi encerrada.');
}

function showGameOver(title, message) {
  text(gel('gameover-title'), title);
  text(gel('gameover-msg'), message);
  text(gel('gameover-icon'), title.includes('Vitória') ? '🏆' : title.includes('desistiu') ? '🏳' : '🎲');
  gel('btn-resign').classList.add('hidden');
  setTimeout(() => showModal('modal-gameover'), 500);
}

/* =====================================================
   RENDER
===================================================== */
function renderGame() {
  renderBoard();
  renderPlayers();
  renderStatus();
  renderDice();
  renderLog();
}

function renderBoard() {
  document.querySelectorAll('.pawn').forEach(pawn => pawn.remove());
  if (!engine || !engine.players) return;

  engine.players.forEach(function(player) {
    player.pawns.forEach(function(pawn, index) {
      if (pawn.finished) return;
      const coords = pawnCoords(player, pawn, index);
      if (!coords || !boardCells[coords[0]] || !boardCells[coords[0]][coords[1]]) return;
      const pawnEl = document.createElement('button');
      pawnEl.type = 'button';
      pawnEl.className = 'pawn ' + player.color;
      pawnEl.dataset.color = player.color;
      pawnEl.dataset.index = index;
      pawnEl.textContent = window.LUDO_CONSTANTS.PIECES_SYMBOLS[player.color] || '';
      if (isMyTurn() && engine.phase === 'move' && engine.getValidMoves().includes(index)) {
        pawnEl.classList.add('movable');
        pawnEl.addEventListener('click', () => doMovePawn(index));
      }
      boardCells[coords[0]][coords[1]].appendChild(pawnEl);
    });
  });
}

function pawnCoords(player, pawn, index) {
  if (pawn.pos === -1) return window.LUDO_CONSTANTS.BASE_POSITIONS[player.color][index];
  if (pawn.homeStep !== -1) return window.LUDO_CONSTANTS.HOME_PATHS[player.color][pawn.homeStep];
  return window.LUDO_CONSTANTS.PATH_COORDS[pawn.pos];
}

function renderPlayers() {
  const list = gel('players-list');
  if (!list) return;
  list.innerHTML = '';
  engine.players.forEach(function(player) {
    const card = document.createElement('li');
    card.className = 'player-card';
    if (engine.activePlayer && engine.activePlayer.id === player.id) card.classList.add('active-turn');

    const avatar = document.createElement('div');
    avatar.className = 'player-avatar';
    avatar.style.backgroundColor = 'var(--ludo-' + player.color + '-dark)';
    if (player.photoURL) {
      const img = document.createElement('img');
      img.src = player.photoURL;
      img.alt = safeName(player.name, 'Jogador');
      img.onerror = function() { avatar.textContent = initials(player.name); img.remove(); };
      avatar.appendChild(img);
    } else {
      avatar.textContent = initials(player.name);
    }

    const info = document.createElement('div');
    info.className = 'player-info';
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = safeName(player.name, 'Jogador') +
      (player.id === currentAuthManager.uid ? ' (Você)' : player.isAI ? ' (IA)' : '');
    const score = document.createElement('span');
    score.className = 'player-score';
    score.textContent = colorLabel(player.color) + ' · ' + (player.score || 0) + ' / ' + window.LUDO_CONSTANTS.PIECES_PER_PLAYER + ' em casa';
    const dots = document.createElement('div');
    dots.className = 'ludo-score-indicator';
    player.pawns.forEach(function(pawn) {
      if (pawn.finished) return;
      const dot = document.createElement('span');
      dot.className = 'pawn-dot';
      dot.style.setProperty('--dot-color', 'var(--ludo-' + player.color + ')');
      if (pawn.pos !== -1 || pawn.homeStep !== -1) dot.classList.add('out');
      if (player.id === currentAuthManager.uid && pawn.pos === -1 && engine.diceValue === 6 && isMyTurn()) dot.classList.add('ready');
      dots.appendChild(dot);
    });

    info.append(name, score, dots);
    card.append(avatar, info);
    list.appendChild(card);
  });
}

function renderStatus() {
  const bar = gel('status-bar');
  const roll = gel('btn-roll');
  if (!bar || !roll || !engine.activePlayer) return;
  bar.className = 'status-bar';
  roll.disabled = true;

  if (isSpectator) {
    bar.textContent = '👁 Assistindo — vez de ' + engine.activePlayer.name + ' (' + colorLabel(engine.activePlayer.color) + ')';
    return;
  }
  if (aiThinking) {
    bar.innerHTML = 'IA pensando <span class="thinking-dots"><span></span><span></span><span></span></span>';
    return;
  }
  if (engine.status === 'finished') {
    const winner = engine.players.find(player => player.id === engine.winner);
    bar.textContent = 'Partida encerrada — ' + (winner ? winner.name : 'Alguém') + ' venceu';
    return;
  }
  if (isMyTurn()) {
    bar.classList.add('your-turn');
    roll.disabled = engine.phase !== 'roll';
    bar.textContent = engine.phase === 'roll'
      ? 'Sua vez (' + colorLabel(myColor) + ') — role o dado'
      : 'Sua vez (' + colorLabel(myColor) + ') — escolha uma peça para mover ' + engine.diceValue + ' casas';
  } else {
    bar.textContent = 'Vez de ' + engine.activePlayer.name + ' (' + colorLabel(engine.activePlayer.color) + ')';
  }
}

function renderDice() {
  const dice = gel('dice-display');
  if (!dice) return;
  const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  dice.textContent = engine.diceValue > 0 ? faces[engine.diceValue] : '🎲';
}

function renderLog() {
  const box = gel('log-entries');
  if (!box) return;
  box.innerHTML = '';
  (engine.log || []).forEach(function(entry) {
    const row = document.createElement('div');
    row.className = 'log-entry color-' + (entry.color || 'neutral');
    row.textContent = entry.message || '';
    box.appendChild(row);
  });
  box.scrollTop = box.scrollHeight;
}

/* =====================================================
   SPECTATOR / HISTORY
===================================================== */
async function spectateGame() {
  const code = (gel('input-spectate').value || '').trim().toUpperCase();
  clearLobbyError();
  if (code.length !== 6) { showLobbyError('Código deve ter 6 caracteres.'); return; }

  try {
    stopRoomListeners();
    specRef = db.ref('ludo_rooms/' + code);
    const snap = await specRef.once('value');
    const room = snap.val();
    if (!room) { showLobbyError('Sala não encontrada.'); specRef = null; return; }
    if (room.status === 'waiting') { showLobbyError('Partida ainda não começou.'); specRef = null; return; }
    engine.deserialize(room.state);
    roomCode = code;
    gameActive = false;
    enterGameScreen(true);
    specRef.on('value', function(nextSnap) {
      const data = nextSnap.val();
      if (!data) { stopRoomListeners(); goLobby(); return; }
      if (data.state) engine.deserialize(data.state);
      renderGame();
      if (['finished', 'resigned', 'abandoned'].includes(data.status)) {
        text(gel('spectator-bar'), '👁 Partida encerrada');
        specRef.off();
      }
    });
  } catch (error) {
    console.error(error);
    showLobbyError('Erro ao assistir: ' + error.message);
  }
}

function initHistoryUI() {
  el('btn-history-ludo-back', 'click', goLobby);
  el('btn-live-games-ludo-back', 'click', goLobby);
}

async function saveHistory(result) {
  if (!currentAuthManager.uid || currentAuthManager.isAnonymous) return;
  await historyManager.saveGame({
    gameType: 'ludo',
    uid: currentAuthManager.uid,
    isAnonymous: currentAuthManager.isAnonymous,
    mode: gameMode,
    players: engine.players.map(player => ({
      id: player.id,
      name: player.name,
      color: player.color,
      isAI: player.isAI,
      photoURL: player.photoURL || ''
    })),
    myColor: myColor,
    result: result,
    endedAt: Date.now()
  });
}

async function openHistoryScreen() {
  showScreen('ludo-history');
  const list = gel('ludo-history-list');
  const stats = gel('ludo-history-stats');
  if (list) list.innerHTML = '<div class="history-loading">Carregando...</div>';
  if (stats) stats.innerHTML = '';

  if (!currentAuthManager.uid || currentAuthManager.isAnonymous) {
    if (list) list.innerHTML = '<div class="history-empty">Faça login para ver seu histórico.</div>';
    return;
  }

  const games = await historyManager.loadLudoHistory(currentAuthManager.uid);
  renderHistoryList(games || []);
}

function renderHistoryList(games) {
  const list = gel('ludo-history-list');
  const stats = gel('ludo-history-stats');
  if (!list) return;
  if (!games.length) {
    list.innerHTML = '<div class="history-empty">Nenhuma partida ainda.<br>Jogue sua primeira partida!</div>';
    return;
  }

  const wins = games.filter(game => game.result === 'win').length;
  const losses = games.filter(game => game.result === 'loss' || game.result === 'resigned').length;
  const draws = games.filter(game => game.result === 'draw').length;
  if (stats) {
    stats.innerHTML = '<span class="stat stat-win">✓ ' + wins + '</span>' +
      '<span class="stat stat-draw">= ' + draws + '</span>' +
      '<span class="stat stat-loss">✗ ' + losses + '</span>';
  }

  list.innerHTML = '';
  games.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)).forEach(function(game) {
    list.appendChild(historyCard(game, false));
  });
}

async function openLiveGamesScreen() {
  showScreen('ludo-live-games');
  const list = gel('ludo-live-games-list');
  if (list) list.innerHTML = '<div class="history-loading">Carregando...</div>';
  const games = await historyManager.loadLudoLiveGames();
  if (!list) return;
  if (!games || !games.length) {
    list.innerHTML = '<div class="history-empty">Nenhuma partida ao vivo no momento.</div>';
    return;
  }
  list.innerHTML = '';
  games.forEach(game => list.appendChild(historyCard(game, true)));
}

function historyCard(game, live) {
  const card = document.createElement('div');
  card.className = 'history-card';

  const left = document.createElement('div');
  left.className = 'history-card-left';
  const result = document.createElement('span');
  result.className = 'history-result ' + (live ? 'result-draw' : game.result === 'win' ? 'result-win' : game.result === 'draw' ? 'result-draw' : 'result-loss');
  result.textContent = live ? 'Ao Vivo' : ({ win: 'Vitória ✓', loss: 'Derrota ✗', draw: 'Empate =', resigned: 'Desistiu' }[game.result] || game.result);
  const opponent = document.createElement('span');
  opponent.className = 'history-opponent';
  opponent.textContent = playerSummary(game);
  left.append(result, opponent);

  const center = document.createElement('div');
  center.className = 'history-card-center';
  const mode = document.createElement('span');
  mode.className = 'history-mode';
  mode.textContent = game.mode === 'ai' ? '🤖 vs Computador' : '👥 Multijogador';
  const count = document.createElement('span');
  count.className = 'history-moves';
  count.textContent = (game.players ? game.players.length : Object.keys(game.playerColors || {}).length) + ' jogadores';
  center.append(mode, count);

  const right = document.createElement('div');
  right.className = 'history-card-right';
  const date = document.createElement('span');
  date.className = 'history-date';
  const timestamp = game.endedAt || game.createdAt || Date.now();
  date.textContent = new Date(timestamp).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  right.appendChild(date);
  if (live) {
    const watch = document.createElement('button');
    watch.className = 'btn btn-small btn-secondary';
    watch.textContent = '👁 Assistir';
    watch.addEventListener('click', function() {
      gel('input-spectate').value = game.roomCode;
      spectateGame();
    });
    right.appendChild(watch);
  }

  card.append(left, center, right);
  return card;
}

function playerSummary(game) {
  const players = game.players || Object.values(game.playerColors || {}).filter(player => player && player.id);
  const humans = players.filter(player => !player.isAI && player.id !== currentAuthManager.uid).map(player => safeName(player.name, 'Jogador'));
  const aiCount = players.filter(player => player.isAI).length;
  if (humans.length && aiCount) return 'vs ' + humans.join(', ') + ' + ' + aiCount + ' IA(s)';
  if (humans.length) return 'vs ' + humans.join(', ');
  if (aiCount) return 'vs ' + aiCount + ' IA(s)';
  return 'Partida de Ludo';
}

async function saveLiveGame(code, room, state) {
  if (!code) return;
  await historyManager.saveLudoLiveGame(code, {
    gameType: 'ludo',
    roomCode: code,
    hostUid: room.hostUid,
    createdAt: room.createdAt || Date.now(),
    playerColors: room.playerColors,
    state: state,
    status: 'playing',
    mode: 'multiplayer',
    players: playersFromSlots(room.playerColors || {})
  });
}

async function removeLiveGame(code) {
  if (code) await historyManager.removeLudoLiveGame(code);
}

function stopRoomListeners() {
  if (roomRef) { roomRef.off(); roomRef = null; }
  if (specRef) { specRef.off(); specRef = null; }
}

function goLobby() {
  stopRoomListeners();
  gameActive = false;
  aiThinking = false;
  isSpectator = false;
  myColor = null;
  roomCode = null;
  if (engine) engine.reset();
  if (gel('input-room')) gel('input-room').value = '';
  if (gel('input-spectate')) gel('input-spectate').value = '';
  clearLobbyError();
  showScreen(currentAuthManager && currentAuthManager.uid ? 'lobby' : 'auth');
}
