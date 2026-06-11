/* =====================================================
   AuthManager - Gerencia a autenticação do usuário.
   Exporta a classe para ser instanciada uma única vez
   em `app.js`.
===================================================== */
class AuthManager {
  constructor(db, fbAuth) {
    this.db = db;
    this.fbAuth = fbAuth;
    this._user = null; // Armazena o objeto user do Firebase
  }

  set user(newUser) {
    this._user = newUser;
    // Aqui você pode adicionar lógica para atualizar a UI do header, etc.
    // Ou simplesmente expor o getter e deixar o app.js fazer a atualização da UI.
  }

  get user() {
    return this._user;
  }

  get uid() {
    return this._user ? this._user.uid : null;
  }

  get displayName() {
    return this._user ? (this._user.displayName || (this._user.email ? this._user.email.split('@')[0] : 'Visitante')) : 'Visitante';
  }

  get photoURL() {
    return this._user ? this._user.photoURL : null;
  }

  get isAnonymous() {
    return this._user ? this._user.isAnonymous : true;
  }

  get initials() {
    const name = this.displayName;
    return name.split(' ').slice(0, 2).map(w => w[0] ? w[0].toUpperCase() : '').join('') || '?';
  }

  async loginWithEmail(email, password) {
    try {
      await this.fbAuth.signInWithEmailAndPassword(email, password);
      return true;
    } catch (e) {
      throw this._authErrorMsg(e.code);
    }
  }

  async loginWithGoogle() {
    try {
      await this.fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
      return true;
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        throw this._authErrorMsg(e.code);
      }
      return false; // Usuário fechou o popup
    }
  }

  async registerWithEmail(name, email, password) {
    try {
      const cred = await this.fbAuth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await cred.user.reload();
      return true;
    } catch (e) {
      throw this._authErrorMsg(e.code);
    }
  }

  async loginAsGuest() {
    try {
      const cred = await this.fbAuth.signInAnonymously();
      await cred.user.updateProfile({ displayName: 'Visitante' });
      return true;
    } catch (e) {
      throw 'Erro ao entrar como visitante.';
    }
  }

  async logout() {
    try {
      await this.fbAuth.signOut();
      // O onAuthStateChanged em app.js vai lidar com a atualização da UI.
      return true;
    } catch (e) {
      console.error('Erro ao fazer logout:', e);
      throw 'Erro ao sair.';
    }
  }

  _authErrorMsg(code) {
    const msgs = {
      'auth/user-not-found': 'Usuário não encontrado.',
      'auth/wrong-password': 'Senha incorreta.',
      'auth/email-already-in-use': 'E-mail já cadastrado.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres).',
      'auth/too-many-requests': 'Muitas tentativas. Tente mais tarde.',
      'auth/cancelled-popup-request': 'Requisição de popup cancelada.',
      'auth/popup-blocked': 'Popup bloqueado pelo navegador.'
    };
    return msgs[code] || 'Ocorreu um erro no acesso.';
  }
}