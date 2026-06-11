/* =====================================================
   AuthManager - Gerencia autenticação de usuário com Firebase.
   Esta classe NÃO deve ser instanciada globalmente neste arquivo.
   Sua instância será criada e gerenciada por `app.js`.
===================================================== */
class AuthManager {
  constructor(firebaseAuth) {
    this.fbAuth = firebaseAuth;
    this.uid = null;
    this.displayName = null;
    this.photoURL = null;
    this.isAnonymous = false;

    // Callbacks para notificar o app.js sobre mudanças de estado
    this.onAuthStateChangedCallbacks = [];
  }

  // Registra um callback para ser chamado quando o estado de autenticação mudar
  onAuthStateChanged(callback) {
    this.onAuthStateChangedCallbacks.push(callback);
    // Dispara o callback imediatamente se o estado já estiver carregado
    if (this.uid !== null) {
      callback(this);
    }
  }

  // Inicializa o listener do Firebase e atualiza o estado interno
  init() {
    this.fbAuth.onAuthStateChanged(user => {
      if (user) {
        this.uid = user.uid;
        this.displayName = user.displayName || (user.email ? user.email.split('@')[0] : '') || 'Jogador';
        this.photoURL = user.photoURL || null;
        this.isAnonymous = user.isAnonymous;
        this.updateUserRecord(user.uid, this.displayName, user.email, this.photoURL);
      } else {
        this.uid = null;
        this.displayName = null;
        this.photoURL = null;
        this.isAnonymous = false;
      }
      this.onAuthStateChangedCallbacks.forEach(callback => callback(this));
    });
  }

  // Tenta fazer login com e-mail e senha
  async loginWithEmail(email, password) {
    try {
      await this.fbAuth.signInWithEmailAndPassword(email, password);
      return { success: true };
    } catch (e) {
      return { success: false, code: e.code };
    }
  }

  // Tenta fazer login com Google Popup
  async loginWithGoogle() {
    try {
      await this.fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
      return { success: true };
    } catch (e) {
      return { success: false, code: e.code };
    }
  }

  // Tenta registrar com e-mail e senha
  async registerWithEmail(name, email, password) {
    try {
      const cred = await this.fbAuth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await cred.user.reload();
      return { success: true };
    } catch (e) {
      return { success: false, code: e.code };
    }
  }

  // Tenta fazer login anonimamente (visitante)
  async loginAsGuest() {
    try {
      const cred = await this.fbAuth.signInAnonymously();
      await cred.user.updateProfile({ displayName: 'Visitante' });
      return { success: true };
    } catch (e) {
      return { success: false, code: e.code };
    }
  }

  // Desloga o usuário atual
  async logout() {
    try {
      await this.fbAuth.signOut();
      return { success: true };
    } catch (e) {
      return { success: false, code: e.code };
    }
  }

  // Atualiza o registro do usuário no Realtime Database (apenas para log/convenience)
  async updateUserRecord(uid, displayName, email, photoURL) {
    if (!uid) return;
    const db = firebase.database();
    return db.ref('users/' + uid).update({
      displayName: displayName,
      email: email || '',
      photoURL: photoURL || '',
      lastSeen: Date.now()
    }).catch(e => console.error('Erro ao atualizar user record:', e));
  }

  // Converte códigos de erro do Firebase Auth para mensagens amigáveis
  getAuthErrorMessage(code) {
    const msgs = {
      'auth/user-not-found': 'Usuário não encontrado.',
      'auth/wrong-password': 'Senha incorreta.',
      'auth/email-already-in-use': 'E-mail já cadastrado.',
      'auth/invalid-email': 'E-mail inválido.',
      'auth/weak-password': 'Senha muito fraca (mín: 6 caracteres).',
      'auth/too-many-requests': 'Muitas tentativas. Tente mais tarde.',
      'auth/popup-closed-by-user': 'Autenticação cancelada.' // Para Google OAuth
    };
    return msgs[code] || 'Erro inesperado. Tente novamente.';
  }

  // Obtém iniciais do nome para display (ex: "JM" para "João Maria")
  getInitials() {
    if (!this.displayName) return '?';
    const nameParts = this.displayName.split(' ').filter(Boolean);
    if (nameParts.length === 0) return '?';
    if (nameParts.length === 1) return nameParts[0][0].toUpperCase();
    return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
  }
}