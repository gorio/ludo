/* =====================================================
   AUTENTICAÇÃO — Firebase Auth + Google
   Atualizado para sincronizar estatísticas de Ludo.
===================================================== */
class AuthManager {
  constructor() {
    this.user = null;
    this.provider = null;
    this._listeners = [];
    this.db = null; // Adicionado para acesso ao Firebase Database
  }

  /**
   * Inicializa o AuthManager, configura o provedor do Google e o listener de estado de autenticação.
   * @param {firebase.database.Database} dbInstance Instância do Firebase Database.
   */
  init(dbInstance) {
    this.db = dbInstance; // Armazena a instância do DB
    this.provider = new firebase.auth.GoogleAuthProvider();

    firebase.auth().onAuthStateChanged(user => {
      this.user = user;
      this._listeners.forEach(fn => fn(user));

      if (user && !user.isAnonymous) {
        this._syncUserProfile(user);
      }
    });
  }

  /**
   * Adiciona um listener para mudanças no estado de autenticação.
   * @param {function} fn A função de callback a ser chamada quando o estado muda.
   */
  onChange(fn) {
    this._listeners.push(fn);
  }

  /**
   * Realiza o login utilizando a conta Google.
   * @returns {firebase.User|null} O objeto do usuário autenticado ou null se o pop-up foi fechado.
   * @throws {firebase.FirebaseError} Se ocorrer outro erro de autenticação.
   */
  async loginWithGoogle() {
    try {
      const result = await firebase.auth().signInWithPopup(this.provider);
      return result.user;
    } catch (e) {
      // Ignora o erro se o usuário fechar o pop-up de login
      if (e.code !== 'auth/popup-closed-by-user') throw e;
      return null;
    }
  }

  /**
   * Realiza o login anonimamente.
   * @returns {firebase.User} O objeto do usuário anônimo.
   */
  async loginAnonymously() {
    const result = await firebase.auth().signInAnonymously();
    return result.user;
  }

  /**
   * Realiza o logout do usuário.
   */
  async logout() {
    await firebase.auth().signOut();
  }

  /**
   * Sincroniza o perfil do usuário com o Firebase Realtime Database,
   * criando-o se não existir e atualizando o lastSeen e estatísticas.
   * @param {firebase.User} user O objeto do usuário autenticado.
   */
  async _syncUserProfile(user) {
    if (!this.db) {
      console.error('Firebase Database não inicializado no AuthManager.');
      return;
    }
    const ref = this.db.ref('users/' + user.uid);
    const snap = await ref.once('value');
    const existing = snap.val() || {};

    await ref.update({
      displayName: user.displayName || existing.displayName || 'Jogador',
      photoURL: user.photoURL || existing.photoURL || '',
      email: user.email || '',
      lastSeen: Date.now(),
      // Estatísticas gerais (Xadrez/Dama)
      gamesPlayed: existing.gamesPlayed || 0,
      wins: existing.wins || 0,
      losses: existing.losses || 0,
      draws: existing.draws || 0,
      // Novas estatísticas para Ludo
      ludoGamesPlayed: existing.ludoGamesPlayed || 0,
      ludoWins: existing.ludoWins || 0,
      ludoLosses: existing.ludoLosses || 0,
      ludoDraws: existing.ludoDraws || 0,
    });
    console.log('Perfil do usuário sincronizado:', user.uid);
  }

  get isLoggedIn() {
    return !!this.user && !this.user.isAnonymous;
  }
  get isAnonymous() {
    return this.user?.isAnonymous === true;
  }
  get uid() {
    return this.user?.uid || null;
  }
  get displayName() {
    return this.user?.displayName || 'Visitante';
  }
  get photoURL() {
    return this.user?.photoURL || null;
  }
  get initials() {
    const name = this.displayName;
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}

const auth = new AuthManager();