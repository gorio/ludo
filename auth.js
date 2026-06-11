/* =====================================================
   auth.js - Gerencia a autenticação de usuários
   Define a classe AuthManager. Carregado ANTES de app.js.
===================================================== */
class AuthManager {
  constructor() {
    this.user = null;
    this.uid = null;
    this.displayName = null;
    this.photoURL = null;
    this.isAnonymous = true;
    this.authInstance = null; // Instância do Firebase Auth
    this.databaseInstance = null; // Instância do Firebase Database
  }

  /**
   * Inicializa o AuthManager com as instâncias do Firebase.
   * @param {object} auth Firebase Auth instance.
   * @param {object} db Firebase Database instance.
   */
  init(auth, db) {
    this.authInstance = auth;
    this.databaseInstance = db;
    this.authInstance.onAuthStateChanged(user => this._handleAuthStateChanged(user));
  }

  /**
   * Manipula mudanças de estado da autenticação.
   * @param {object} user Objeto User do Firebase ou null.
   */
  _handleAuthStateChanged(user) {
    if (user) {
      this.user = user;
      this.uid = user.uid;
      this.displayName = user.displayName || (user.email ? user.email.split('@')[0] : '') || 'Jogador';
      this.photoURL = user.photoURL || null;
      this.isAnonymous = user.isAnonymous;

      // Atualiza o perfil do usuário no banco de dados
      if (this.databaseInstance) {
        this.databaseInstance.ref('users/' + this.uid).update({
          displayName: this.displayName,
          email: user.email || '',
          photoURL: this.photoURL || '',
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
      }
    } else {
      this.user = null;
      this.uid = null;
      this.displayName = null;
      this.photoURL = null;
      this.isAnonymous = true;
    }
    // Pode emitir um evento ou chamar um callback para que app.js saiba da mudança.
    // console.log('Auth state changed:', this.displayName);
  }

  /**
   * Tenta fazer login com e-mail e senha.
   * @param {string} email
   * @param {string} password
   */
  async loginWithEmail(email, password) {
    try {
      await this.authInstance.signInWithEmailAndPassword(email, password);
      return { success: true };
    } catch (error) {
      return { success: false, code: error.code, message: this._getAuthErrorMessage(error.code) };
    }
  }

  /**
   * Tenta registrar um novo usuário com e-mail e senha.
   * @param {string} name
   * @param {string} email
   * @param {string} password
   */
  async registerWithEmail(name, email, password) {
    try {
      const userCredential = await this.authInstance.createUserWithEmailAndPassword(email, password);
      await userCredential.user.updateProfile({ displayName: name });
      // Reload para atualizar o objeto user com o displayName recém-definido
      await userCredential.user.reload();
      return { success: true };
    } catch (error) {
      return { success: false, code: error.code, message: this._getAuthErrorMessage(error.code) };
    }
  }

  /**
   * Tenta fazer login com a conta Google.
   */
  async loginWithGoogle() {
    try {
      await this.authInstance.signInWithPopup(new firebase.auth.GoogleAuthProvider());
      return { success: true };
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') {
        return { success: false, code: error.code, message: this._getAuthErrorMessage(error.code) };
      }
      return { success: false, code: error.code }; // Usuário fechou o popup
    }
  }

  /**
   * Entra como usuário anônimo (visitante).
   */
  async loginAsGuest() {
    try {
      const userCredential = await this.authInstance.signInAnonymously();
      await userCredential.user.updateProfile({ displayName: 'Visitante' });
      await userCredential.user.reload();
      return { success: true };
    } catch (error) {
      return { success: false, code: error.code, message: 'Erro ao entrar como visitante.' };
    }
  }

  /**
   * Desloga o usuário atual.
   */
  async logout() {
    try {
      await this.authInstance.signOut();
      return { success: true };
    } catch (error) {
      console.error('Erro ao deslogar:', error);
      return { success: false, message: 'Erro ao deslogar.' };
    }
  }

  /**
   * Retorna a mensagem de erro amigável para códigos de erro do Firebase Auth.
   * @param {string} code Código de erro do Firebase.
   * @returns {string} Mensagem de erro.
   */
  _getAuthErrorMessage(code) {
    const messages = {
      'auth/user-not-found': 'Usuário não encontrado. Verifique seu e-mail.',
      'auth/wrong-password': 'Senha incorreta.',
      'auth/email-already-in-use': 'Este e-mail já está em uso.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/weak-password': 'A senha deve ter pelo menos 6 caracteres.',
      'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
      'auth/popup-blocked': 'Pop-up bloqueado. Permita pop-ups para fazer login com Google.',
      // Outros erros genéricos
      'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
      'auth/internal-error': 'Erro interno do servidor de autenticação.'
    };
    return messages[code] || 'Ocorreu um erro desconhecido. Tente novamente.';
  }
}