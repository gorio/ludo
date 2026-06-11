class AuthManager {
  constructor() {
    this.auth = null;
    this.user = null;
    this.uid = null;
    this.displayName = null;
    this.email = null;
    this.photoURL = null;
    this.isAnonymous = false;
    this.onUserChangedCallbacks = [];
  }

  /**
   * Inicializa o Firebase Authentication e configura o observador de estado do usuário.
   * @param {object} firebaseApp A instância do initialized firebase app.
   */
  initialize(firebaseApp) {
    this.auth = firebaseApp.auth();
    this.auth.onAuthStateChanged(user => {
      this.user = user;
      if (user) {
        this.uid = user.uid;
        this.displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Jogador');
        this.email = user.email;
        this.photoURL = user.photoURL;
        this.isAnonymous = user.isAnonymous;
        // Atualiza o perfil do usuário no banco de dados, se logado
        // Isso assume que `db` (Firebase Realtime Database) está disponível globalmente via app.js
        if (firebaseApp.database) {
            firebaseApp.database().ref('users/' + user.uid).update({
                displayName: this.displayName,
                email: this.email || '',
                photoURL: this.photoURL || '',
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
        }
      } else {
        this.resetUser();
      }
      this.onUserChangedCallbacks.forEach(callback => callback(this.user));
    });
  }

  resetUser() {
    this.user = null;
    this.uid = null;
    this.displayName = null;
    this.email = null;
    this.photoURL = null;
    this.isAnonymous = false;
  }

  /**
   * Registra um callback para ser chamado quando o estado de autenticação do usuário muda.
   * @param {Function} callback O callback a ser registrado.
   */
  onUserChanged(callback) {
    this.onUserChangedCallbacks.push(callback);
    // Chama o callback imediatamente com o estado atual, se já disponível
    if (this.user !== undefined) {
      callback(this.user);
    }
  }

  // Métodos de autenticação
  async loginWithEmail(email, password) {
    if (!this.auth) throw new Error("AuthManager não inicializado.");
    return this.auth.signInWithEmailAndPassword(email, password);
  }

  async loginWithGoogle() {
    if (!this.auth) throw new Error("AuthManager não inicializado.");
    const provider = new firebase.auth.GoogleAuthProvider();
    return this.auth.signInWithPopup(provider);
  }

  async registerWithEmail(name, email, password) {
    if (!this.auth) throw new Error("AuthManager não inicializado.");
    const credential = await this.auth.createUserWithEmailAndPassword(email, password);
    await credential.user.updateProfile({ displayName: name });
    await credential.user.reload();
    return credential.user;
  }

  async loginAnonymously() {
    if (!this.auth) throw new Error("AuthManager não inicializado.");
    const credential = await this.auth.signInAnonymously();
    await credential.user.updateProfile({ displayName: 'Visitante' });
    return credential.user;
  }

  async signOut() {
    if (!this.auth) throw new Error("AuthManager não inicializado.");
    return this.auth.signOut();
  }

  get currentUserUID() {
    return this.user ? this.user.uid : null;
  }
}