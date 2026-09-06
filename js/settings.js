// ============================================================================
// MODULE: Settings
// PURPOSE: Accountweite Einstellungen (aktuell: Bundesland für Ferientermine),
//          gelten für alle Klassen eines Nutzers, nicht pro Gruppe.
// ============================================================================

import { ref, onValue, set, off, remove } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js';
import { onAuthStateChanged, deleteUser } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { auth, db } from './firebase-init.js';
import { groups } from './groups.js';
import { accountDisplayName, accountBundesland, settingsSaveIndicator, dutiesBundeslandDisplay, deleteAccountBtn, deleteAccountHint } from './dom.js';

export const BUNDESLAND_NAMES = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen',
  HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen',
  ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen'
};

export let userBundesland = 'HH';
export let userDisplayName = '';

function applyBundesland(code) {
  userBundesland = code;
  accountBundesland.value = code;
  dutiesBundeslandDisplay.textContent = BUNDESLAND_NAMES[code] || code;
  document.dispatchEvent(new CustomEvent('bundesland-changed', { detail: code }));
}

function applyDisplayName(name) {
  userDisplayName = name || '';
  accountDisplayName.value = userDisplayName;
}

// Trägt den aktuellen Anzeigenamen/E-Mail in ALLE Gruppen ein, in denen die Person
// gerade Mitglied ist - so heilen sich auch ältere Gruppen (von vor dieser Funktion)
// nach und nach selbst, sobald die Person eingeloggt ist.
async function syncDisplayNameToAllGroups() {
  const user = auth && auth.currentUser;
  if (!user) return;
  const ids = Object.keys(groups);
  for (const id of ids) {
    const g = groups[id];
    const existing = g.members && g.members[user.uid];
    const joinedAt = (existing && typeof existing === 'object' && existing.joinedAt) || Date.now();
    await set(ref(db, 'groups/' + id + '/members/' + user.uid), {
      email: user.email || '',
      displayName: userDisplayName || '',
      joinedAt
    });
  }
}

let displayNameSaveTimer = null;
accountDisplayName.addEventListener('input', () => {
  const user = auth && auth.currentUser;
  applyDisplayName(accountDisplayName.value);
  if (!user) return;
  settingsSaveIndicator.textContent = 'Speichert…';
  clearTimeout(displayNameSaveTimer);
  displayNameSaveTimer = setTimeout(async () => {
    await set(ref(db, 'userSettings/' + user.uid + '/displayName'), userDisplayName);
    await syncDisplayNameToAllGroups();
    settingsSaveIndicator.textContent = 'Gespeichert';
    setTimeout(() => { if (settingsSaveIndicator.textContent === 'Gespeichert') settingsSaveIndicator.textContent = ''; }, 1500);
  }, 700);
});

accountBundesland.addEventListener('change', () => {
  const user = auth && auth.currentUser;
  const code = accountBundesland.value;
  applyBundesland(code);
  if (!user) return;
  settingsSaveIndicator.textContent = 'Speichert…';
  set(ref(db, 'userSettings/' + user.uid + '/bundesland'), code).then(() => {
    settingsSaveIndicator.textContent = 'Gespeichert';
    setTimeout(() => { if (settingsSaveIndicator.textContent === 'Gespeichert') settingsSaveIndicator.textContent = ''; }, 1500);
  });
});

let settingsUnsub = null;

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (settingsUnsub) { settingsUnsub(); settingsUnsub = null; }
    if (user) {
      const settingsRef = ref(db, 'userSettings/' + user.uid);
      onValue(settingsRef, (snapshot) => {
        const val = snapshot.exists() ? snapshot.val() : {};
        applyBundesland(val.bundesland || 'HH');
        applyDisplayName(val.displayName || '');
      });
      settingsUnsub = () => off(settingsRef);
    } else {
      applyBundesland('HH');
      applyDisplayName('');
    }
  });
}

// ---- Konto löschen ----
async function deleteAccount() {
  const user = auth && auth.currentUser;
  if (!user) return;

  const ids = Object.keys(groups);
  const blocking = ids.filter(id => {
    const g = groups[id];
    const memberCount = g.members ? Object.keys(g.members).length : 1;
    return g.ownerUid === user.uid && memberCount > 1;
  });

  if (blocking.length > 0) {
    const names = blocking.map(id => groups[id].name || 'Ohne Namen').join(', ');
    alert(
      'Konto kann nicht gelöscht werden: Du bist Eigentümer:in von geteilten Gruppen mit anderen Personen darin (' +
      names + ').\n\nLösche diese Gruppen zuerst unter „Gruppen verwalten" oder warte, bis du die einzige Person darin bist.'
    );
    return;
  }

  const confirmText = prompt(
    'Dein Konto und alle Gruppen, in denen du die einzige Person bist, werden UNWIDERRUFLICH gelöscht.\n\n' +
    'Zum Bestätigen "LÖSCHEN" eintippen:'
  );
  if (confirmText !== 'LÖSCHEN') {
    deleteAccountHint.textContent = confirmText === null ? '' : 'Abgebrochen (Eingabe stimmte nicht mit "LÖSCHEN" überein).';
    return;
  }

  deleteAccountBtn.disabled = true;
  deleteAccountHint.textContent = 'Lösche Konto…';

  try {
    for (const id of ids) {
      const g = groups[id];
      const memberCount = g.members ? Object.keys(g.members).length : 1;
      if (memberCount <= 1) {
        await remove(ref(db, 'groups/' + id));
        await remove(ref(db, 'groupCodes/' + (g.joinCode || '')));
      } else {
        await remove(ref(db, 'groups/' + id + '/members/' + user.uid));
      }
    }
    await remove(ref(db, 'userGroups/' + user.uid));
    await remove(ref(db, 'userSettings/' + user.uid));
    await remove(ref(db, 'pendingJoinCode/' + user.uid));

    await deleteUser(user);
    // Nach erfolgreicher Löschung meldet onAuthStateChanged automatisch "kein Nutzer" -> UI räumt sich selbst auf.
  } catch (err) {
    deleteAccountBtn.disabled = false;
    if (err.code === 'auth/requires-recent-login') {
      deleteAccountHint.textContent = 'Aus Sicherheitsgründen musst du dich kurz erneut anmelden, bevor das Konto gelöscht werden kann. Bitte abmelden, neu einloggen und nochmal versuchen.';
    } else {
      deleteAccountHint.textContent = 'Löschen fehlgeschlagen: ' + err.message;
    }
  }
}

deleteAccountBtn.addEventListener('click', deleteAccount);
