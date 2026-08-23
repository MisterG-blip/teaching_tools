// ============================================================================
// MODULE: Firebase Init
// PURPOSE: Firebase App + Auth + Realtime Database bereitstellen
// ============================================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js';
import { accountStatus, authForm } from './dom.js';

// ---------------------------------------------------------------
// FIREBASE-KONFIGURATION – eigenes Klassenlotse-Projekt.
// Werte aus: Firebase-Konsole -> Projekteinstellungen -> Meine Apps
// ---------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBakpiJeeoG2_OpDvQBhdjBy8w8VSAQHnY",
  authDomain: "teachingtools-6266c.firebaseapp.com",
  databaseURL: "https://teachingtools-6266c-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "teachingtools-6266c",
  storageBucket: "teachingtools-6266c.firebasestorage.app",
  messagingSenderId: "631340621157",
  appId: "1:631340621157:web:96f5d6a0f93de99add158c",
  measurementId: "G-2HCD49JM4Y"
};

export let auth = null;
export let db = null;

if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'DEIN_API_KEY') {
  accountStatus.textContent = 'Firebase noch nicht konfiguriert';
  authForm.style.opacity = '0.5';
  authForm.style.pointerEvents = 'none';
} else {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
  } catch (err) {
    accountStatus.textContent = 'Firebase-Verbindung fehlgeschlagen';
    authForm.style.opacity = '0.5';
    authForm.style.pointerEvents = 'none';
  }
}
