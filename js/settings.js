// ============================================================================
// MODULE: Settings
// PURPOSE: Accountweite Einstellungen (aktuell: Bundesland für Ferientermine),
//          gelten für alle Klassen eines Nutzers, nicht pro Gruppe.
// ============================================================================

import { ref, onValue, set, off } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { auth, db } from './firebase-init.js';
import { accountBundesland, settingsSaveIndicator, dutiesBundeslandDisplay } from './dom.js';

export const BUNDESLAND_NAMES = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen',
  HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen',
  ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen'
};

export let userBundesland = 'HH';

function applyBundesland(code) {
  userBundesland = code;
  accountBundesland.value = code;
  dutiesBundeslandDisplay.textContent = BUNDESLAND_NAMES[code] || code;
  document.dispatchEvent(new CustomEvent('bundesland-changed', { detail: code }));
}

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
      });
      settingsUnsub = () => off(settingsRef);
    } else {
      applyBundesland('HH');
    }
  });
}
