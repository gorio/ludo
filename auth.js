/* =====================================================
   AuthManager - Gerencia a autenticação e dados do usuário
===================================================== */
class AuthManager {
  constructor() {
    this.user = null;
    this.db = firebase.database();
    this.fbAuth = firebase.auth();

    this.initFirebaseListeners();
  }

  initFirebaseListeners() {
    // Isso será manipulado pelo `app.js` agora para evitar duplicação de listeners
  }

  async loginWithEmail(email, password) {
    try {
      await this.fbAuth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      throw this.authErrorMsg(e.code);
    }
  }

  async loginWithGoogle() {
    try {
      await this.fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user') {
        throw this.authErrorMsg(e.code);
      } else {
        throw 'Login com Google cancelado.';
      }
    }
  }

  async registerWithEmail(name, email, password) {
    try {
      const cred = await this.fbAuth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await cred.user.reload();
      // Inicializa estatísticas de Ludo para o novo usuário
      await this.db.ref('users/' + cred.user.uid).update({
        ludoGamesPlayed: 0,
        ludoWins: 0,
        ludoLosses: 0,
        // ludoDraws (se aplicavel, adicione aqui como 0)
      });
    } catch (e) {
      throw this.authErrorMsg(e.code);
    }
  }

  async loginAsGuest() {
    try {
      const cred = await this.fbAuth.signInAnonymously();
      await cred.user.updateProfile({ displayName: 'Visitante' });
      // Não cria estatísticas de Ludo para visitantes.
    } catch (e) {
      throw 'Erro ao entrar como visitante.';
    }
  }

  logout() {
    this.fbAuth.signOut();
  }

  authErrorMsg(code) {
    const msgs = {
      'auth/user-not-found': 'Usuário não encontrado.',
      'auth/wrong-password': 'Senha incorreta.',
      'auth/email-already-in-use': 'E-mail já cadastrado.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/weak-password': 'Senha muito fraca.',
      'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
      'auth/operation-not-allowed': 'Autenticação por e-mail/senha não está habilitada.',
      'auth/account-exists-with-different-credential': 'Conta já existe com outra forma de login (e.g., Google).',
      'auth/cancelled-popup-request': 'Requisição de popup de login cancelada.',
      'auth/popup-closed-by-user': 'Popup de login fechado pelo usuário.',
    };
    return msgs[code] || 'Ocorreu um erro desconhecido na autenticação: ' + code;
  }

  // Getters para informações do usuário logado
  get uid() {
    return this.user?.uid || null;
  }
  get displayName() {
    return this.user?.displayName || 'Visitante';
  }
  get photoURL() {
    return this.user?.photoURL || null;
  }
  get email() {
    return this.user?.email || null;
  }
  get isAnonymous() {
    return this.user?.isAnonymous || true;
  }

  // Retorna as iniciais do nome, útil para avatares placeholder
  get initials() {
    const name = this.displayName;
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}