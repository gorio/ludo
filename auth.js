// auth.js
class AuthManager {
  constructor() {
    this.fbAuth = null;
    this.user = null;
  }

  setFirebaseAuth(fbAuthInstance) {
    this.fbAuth = fbAuthInstance;
  }

  get uid() {
    return this.user ? this.user.uid : null;
  }

  get displayName() {
    return this.user ? (this.user.displayName || (this.user.email ? this.user.email.split('@')[0] : 'Visitante')) : 'Visitante';
  }

  get email() {
    return this.user ? this.user.email : null;
  }

  get photoURL() {
    return this.user ? this.user.photoURL : null;
  }

  get initials() {
    if (!this.user || !this.displayName) return '?';
    const parts = this.displayName.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0][0].toUpperCase();
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return '?';
  }

  get isAnonymous() {
    return this.user ? this.user.isAnonymous : true;
  }

  async loginWithEmail(email, password) {
    try {
      await this.fbAuth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      throw this.getAuthErrorMessage(error.code);
    }
  }

  async loginWithGoogle() {
    try {
      await this.fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
            throw this.getAuthErrorMessage(error.code);
        }
    }
  }

  async registerWithEmail(name, email, password) {
    try {
      const userCredential = await this.fbAuth.createUserWithEmailAndPassword(email, password);
      await userCredential.user.updateProfile({ displayName: name });
      await userCredential.user.reload(); // Para obter o displayName atualizado
    } catch (error) {
      throw this.getAuthErrorMessage(error.code);
    }
  }

  async loginAsGuest() {
    try {
      const userCredential = await this.fbAuth.signInAnonymously();
      await userCredential.user.updateProfile({ displayName: 'Visitante' }); // Define um nome para o visitante
    } catch (error) {
      throw this.getAuthErrorMessage(error.code);
    }
  }

  async logout() {
    try {
      await this.fbAuth.signOut();
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  }

  getAuthErrorMessage(code) {
    switch (code) {
      case 'auth/user-not-found': return 'Usuário não encontrado.';
      case 'auth/wrong-password': return 'Senha incorreta.';
      case 'auth/email-already-in-use': return 'Este e-mail já está em uso.';
      case 'auth/invalid-email': return 'E-mail inválido.';
      case 'auth/weak-password': return 'A senha deve ter pelo menos 6 caracteres.';
      case 'auth/operation-not-allowed': return 'Autenticação por e-mail/senha não habilitada.';
      // Adicione mais casos conforme necessário
      default: return `Erro de autenticação: ${code}`;
    }
  }
}