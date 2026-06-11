/* =====================================================
   AUTH MANAGER - Gerencia autenticação de usuários
===================================================== */
class AuthManager {
  constructor(firebaseAuthInstance, firebaseDbInstance) {
    this.fbAuth = firebaseAuthInstance;
    this.db = firebaseDbInstance;
    this._user = null; // Usuário autenticado
    this.onUserChangeCallbacks = []; // Callbacks para notificar sobre mudança de usuário
  }

  /**
   * Retorna o usuário atual.
   * @returns {firebase.User|null}
   */
  get user() {
    return this._user;
  }

  /**
   * Retorna o UID do usuário atual.
   * @returns {string|null}
   */
  get uid() {
    return this._user ? this._user.uid : null;
  }

  /**
   * Retorna o nome de exibição do usuário atual.
   * @returns {string}
   */
  get displayName() {
    return this._user ? (this._user.displayName || (this._user.email ? this._user.email.split('@')[0] : 'Visitante')) : 'Visitante';
  }

  /**
   * Retorna a URL da foto do usuário atual.
   * @returns {string|null}
   */
  get photoURL() {
    return this._user ? this._user.photoURL : null;
  }

  /**
   * Verifica se o usuário atual é anônimo.
   * @returns {boolean}
   */
  get isAnonymous() {
    return this._user ? this._user.isAnonymous : true; // Se não houver usuário, assume anônimo
  }

  /**
   * Inicializa o listener de estado de autenticação do Firebase.
   * Chamado uma vez na inicialização do app.
   */
  initAuthStateListener() {
    this.fbAuth.onAuthStateChanged(user => {
      this._user = user;
      if (user) {
        // Atualiza perfil do usuário no DB
        this.db.ref('users/' + user.uid).update({
          displayName: this.displayName,
          email: user.email || '',
          photoURL: user.photoURL || '',
          lastSeen: Date.now()
        });
      }
      // Notifica todos os callbacks registrados
      this.onUserChangeCallbacks.forEach(callback => callback(user));
    });
  }

  /**
   * Registra um callback para ser chamado quando o estado de autenticação mudar.
   * @param {Function} callback A função a ser chamada, que receberá o objeto user.
   */
  onUserChange(callback) {
    this.onUserChangeCallbacks.push(callback);
    // Chama imediatamente para o estado atual se já houver um usuário ou se for inicializado.
    if (this._user !== null) { // Garante que só chame se o estado já foi determinado
        callback(this._user);
    }
  }

  /**
   * Faz login com e-mail e senha.
   * @param {string} email
   * @param {string} password
   */
  async loginWithEmail(email, password) {
    await this.fbAuth.signInWithEmailAndPassword(email, password);
  }

  /**
   * Faz login com Google.
   */
  async loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    await this.fbAuth.signInWithPopup(provider);
  }

  /**
   * Registra um novo usuário com e-mail e senha.
   * @param {string} name
   * @param {string} email
   * @param {string} password
   */
  async registerWithEmail(name, email, password) {
    const cred = await this.fbAuth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    await cred.user.reload(); // Para obter o displayName atualizado na próxima vez
    return cred.user;
  }

  /**
   * Faz login como usuário anônimo (visitante).
   */
  async loginAsGuest() {
    const cred = await this.fbAuth.signInAnonymously();
    await cred.user.updateProfile({ displayName: 'Visitante' });
    return cred.user;
  }

  /**
   * Desloga o usuário atual.
   */
  async logout() {
    await this.fbAuth.signOut();
  }

  /**
   * Retorna uma mensagem de erro amigável para códigos de erro do Firebase Auth.
   * @param {string} code O código de erro do Firebase.
   * @returns {string} Mensagem de erro.
   */
  getAuthErrorMessage(code) {
    const msgs = {
      'auth/user-not-found':       'Usuário não encontrado.',
      'auth/wrong-password':       'Senha incorreta.',
      'auth/email-already-in-use': 'E-mail já cadastrado.',
      'auth/invalid-email':        'E-mail inválido.',
      'auth/weak-password':        'Senha muito fraca (mínimo 6 caracteres).',
      'auth/too-many-requests':    'Muitas tentativas. Tente mais tarde.',
      'auth/popup-closed-by-user': 'Autenticação cancelada pelo usuário.',
      'auth/network-request-failed': 'Erro de rede. Verifique sua conexão.'
    };
    return msgs[code] || 'Erro inesperado ao autenticar.';
  }
}