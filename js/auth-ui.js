// ============================================================================
// MODULE: Auth UI
// PURPOSE: Login-/Registrierungs-Formular, Fehlermeldungen, Abmelden
// ============================================================================

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { auth } from './firebase-init.js';
import { authForm, authEmail, authPassword, authMessage, registerBtn, logoutBtn } from './dom.js';

function germanAuthError(err) {
  const map = {
    'auth/email-already-in-use': 'Für diese E-Mail existiert bereits ein Konto. Einfach anmelden.',
    'auth/invalid-email': 'Diese E-Mail-Adresse ist ungültig.',
    'auth/weak-password': 'Das Passwort muss mindestens 6 Zeichen haben.',
    'auth/wrong-password': 'Passwort ist falsch.',
    'auth/user-not-found': 'Zu dieser E-Mail existiert kein Konto.',
    'auth/invalid-credential': 'E-Mail oder Passwort ist falsch.',
    'auth/too-many-requests': 'Zu viele Versuche. Kurz warten und nochmal probieren.'
  };
  return map[err.code] || 'Etwas ist schiefgelaufen. Nochmal versuchen.';
}

function showAuthMessage(msg, success) {
  authMessage.textContent = msg;
  authMessage.className = 'auth-message show' + (success ? ' success' : '');
}
function clearAuthMessage() {
  authMessage.className = 'auth-message';
  authMessage.textContent = '';
}

authForm.addEventListener('submit', (e) => {
  e.preventDefault();
  clearAuthMessage();
  signInWithEmailAndPassword(auth, authEmail.value, authPassword.value)
    .catch(err => showAuthMessage(germanAuthError(err), false));
});

registerBtn.addEventListener('click', () => {
  clearAuthMessage();
  if (!authEmail.value || authPassword.value.length < 6) {
    showAuthMessage('E-Mail eintragen und Passwort mit mindestens 6 Zeichen wählen.', false);
    return;
  }
  createUserWithEmailAndPassword(auth, authEmail.value, authPassword.value)
    .then(() => showAuthMessage('Konto erstellt und angemeldet.', true))
    .catch(err => showAuthMessage(germanAuthError(err), false));
});

logoutBtn.addEventListener('click', () => { signOut(auth); });
