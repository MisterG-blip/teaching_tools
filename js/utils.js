// ============================================================================
// MODULE: Utils
// PURPOSE: Kleine, überall gebrauchte Helferfunktionen (keine DOM-Mutation,
//          keine Firebase-Zugriffe).
// ============================================================================

import { namesEl } from './dom.js';

export function getNames() {
  return namesEl.value.split('\n').map(n => n.trim()).filter(n => n.length > 0);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
