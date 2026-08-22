// ============================================================================
// MODULE: Roll Call
// PURPOSE: Zufällig eine oder mehrere Personen aufrufen (Slot-Machine-Optik)
// ============================================================================

import { getNames } from './utils.js';
import {
  callCount, callDecrease, callIncrease, noRepeat, slotWindow, slotDisplay,
  calledHint, callBtn, resetCalledBtn, calledChips
} from './dom.js';

let calledNames = new Set();

callDecrease.addEventListener('click', () => {
  callCount.value = Math.max(1, parseInt(callCount.value || '1', 10) - 1);
});
callIncrease.addEventListener('click', () => {
  callCount.value = parseInt(callCount.value || '1', 10) + 1;
});

export function updateCalledHint() {
  const total = getNames().length;
  if (total === 0) {
    calledHint.textContent = 'Noch keine Namen eingetragen.';
  } else if (calledNames.size === 0) {
    calledHint.textContent = 'Noch niemand aufgerufen. (0 von ' + total + ')';
  } else {
    calledHint.textContent = calledNames.size + ' von ' + total + ' bereits aufgerufen.';
  }
}

export function resetCalled() {
  calledNames = new Set();
  calledChips.innerHTML = '';
  slotDisplay.textContent = '–';
  slotWindow.classList.remove('landed');
  updateCalledHint();
}
resetCalledBtn.addEventListener('click', resetCalled);

function addCalledChip(name) {
  const li = document.createElement('li');
  li.textContent = name;
  calledChips.appendChild(li);
}

function spin(finalName, durationMs) {
  return new Promise(resolve => {
    const pool = getNames();
    slotWindow.classList.remove('landed');
    let elapsed = 0;
    let interval = 55;

    function tick() {
      slotDisplay.textContent = pool[Math.floor(Math.random() * pool.length)];
      elapsed += interval;
      interval *= 1.16;
      if (elapsed < durationMs) {
        setTimeout(tick, interval);
      } else {
        slotDisplay.textContent = finalName;
        slotWindow.classList.add('landed');
        resolve();
      }
    }
    tick();
  });
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callStudents() {
  const all = getNames();
  if (all.length === 0) {
    calledHint.textContent = 'Erst Namen im Feld oben eintragen.';
    return;
  }

  let pool = noRepeat.checked ? all.filter(n => !calledNames.has(n)) : all.slice();
  if (pool.length === 0) {
    calledHint.textContent = 'Alle wurden bereits aufgerufen. "Liste zurücksetzen" klicken, um erneut zu starten.';
    return;
  }

  const count = Math.min(parseInt(callCount.value, 10) || 1, pool.length);
  callBtn.disabled = true;
  resetCalledBtn.disabled = true;

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const name = pool[idx];
    pool.splice(idx, 1);
    await spin(name, 1300 + i * 150);
    calledNames.add(name);
    addCalledChip(name);
    updateCalledHint();
    if (i < count - 1) await wait(500);
  }

  callBtn.disabled = false;
  resetCalledBtn.disabled = false;
}
callBtn.addEventListener('click', callStudents);

updateCalledHint();
