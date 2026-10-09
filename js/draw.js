// ============================================================================
// MODULE: Draw
// PURPOSE: Namen zufällig auf eine Anzahl Gruppen verteilen
// ============================================================================

import { getNames, shuffle } from './utils.js';
import { playDrawAnimation, prefersReducedMotion } from './draw-animation.js';
import {
  modeGroupsBtn, modeSizeBtn, numberInput, numberLabel,
  decreaseBtn, increaseBtn, drawBtn, errorBox, resultsEl
} from './dom.js';

const pencilColors = ['var(--pencil-1)', 'var(--pencil-2)', 'var(--pencil-3)', 'var(--pencil-4)', 'var(--pencil-5)', 'var(--pencil-6)'];
let mode = 'groups';
export let lastGroups = null;
let activeAnim = null; // laufende Boots-Animation (falls vorhanden)

function setMode(newMode) {
  mode = newMode;
  modeGroupsBtn.setAttribute('aria-pressed', String(mode === 'groups'));
  modeSizeBtn.setAttribute('aria-pressed', String(mode === 'size'));
  numberLabel.textContent = mode === 'groups' ? 'Anzahl Gruppen' : 'Personen pro Gruppe';
}
modeGroupsBtn.addEventListener('click', () => setMode('groups'));
modeSizeBtn.addEventListener('click', () => setMode('size'));

decreaseBtn.addEventListener('click', () => {
  numberInput.value = Math.max(1, parseInt(numberInput.value || '1', 10) - 1);
});
increaseBtn.addEventListener('click', () => {
  numberInput.value = parseInt(numberInput.value || '1', 10) + 1;
});

function showError(msg) { errorBox.textContent = msg; errorBox.classList.add('show'); }
function clearError() { errorBox.classList.remove('show'); errorBox.textContent = ''; }

function buildGroups(names, count) {
  const shuffled = shuffle(names);
  const gs = Array.from({ length: count }, () => []);
  shuffled.forEach((name, i) => { gs[i % count].push(name); });
  return gs;
}

function render(gs) {
  lastGroups = gs;
  if (activeAnim) { activeAnim.cancel(); activeAnim = null; }
  resultsEl.innerHTML = '';
  const animate = !prefersReducedMotion();

  const head = document.createElement('div');
  head.className = 'results-head';
  head.innerHTML = `
    <h3>${gs.length} Gruppen ausgelost</h3>
    <div class="actions">
      ${animate ? '<button type="button" class="btn btn-ghost" id="skipBtn">Überspringen ⏭</button>' : ''}
      <button type="button" class="btn btn-ghost" id="copyBtn">Ergebnis kopieren</button>
      <button type="button" class="btn btn-ghost" id="reshuffleBtn">Nochmal auslosen</button>
    </div>
  `;
  resultsEl.appendChild(head);

  let stage = null;
  if (animate) {
    stage = document.createElement('div');
    stage.className = 'boat-stage';
    stage.setAttribute('aria-hidden', 'true');
    stage.innerHTML = `
      <div class="boat-wrap">
        <div class="boat-bob">
          <div class="boat-kick"><img src="assets/boat.png" alt="" draggable="false"></div>
        </div>
      </div>`;
    resultsEl.appendChild(stage);
  }

  const entries = [];
  const grid = document.createElement('div');
  grid.className = 'groups-grid';

  gs.forEach((members, gi) => {
    const color = pencilColors[gi % pencilColors.length];
    const groupEl = document.createElement('div');
    groupEl.className = 'result-group';
    groupEl.style.color = color;

    const title = document.createElement('p');
    title.className = 'result-group-title';
    title.textContent = 'Gruppe ' + (gi + 1);
    groupEl.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'tag-list';
    members.forEach((name, mi) => {
      const li = document.createElement('li');
      li.className = 'tag';
      li.textContent = name;
      li.style.setProperty('--delay', (gi * 0.05 + mi * 0.06) + 's');
      li.style.color = 'var(--text)';
      if (animate) {
        li.classList.add('is-pending'); // Platz reservieren, Name kommt per Boot angeflogen
        entries.push({ el: li, color, group: gi });
      }
      list.appendChild(li);
    });
    groupEl.appendChild(list);
    grid.appendChild(groupEl);
  });

  resultsEl.appendChild(grid);
  document.getElementById('reshuffleBtn').addEventListener('click', runDraw);
  document.getElementById('copyBtn').addEventListener('click', copyResults);

  if (animate) {
    const skipBtn = document.getElementById('skipBtn');
    const startAnim = () => {
      const anim = playDrawAnimation({
        stage,
        entries,
        onDone: () => { if (skipBtn) skipBtn.remove(); if (activeAnim === anim) activeAnim = null; }
      });
      activeAnim = anim;
      skipBtn.addEventListener('click', () => anim.skip());
    };
    // Erst starten, wenn das Boot-Bild geladen ist (sonst stimmt die Startposition nicht)
    const img = stage.querySelector('img');
    if (img.complete) startAnim();
    else { img.addEventListener('load', startAnim, { once: true }); img.addEventListener('error', startAnim, { once: true }); }
  }
}

function copyResults() {
  if (!lastGroups) return;
  const text = lastGroups.map((members, i) => 'Gruppe ' + (i + 1) + ': ' + members.join(', ')).join('\n');
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyBtn');
    const original = btn.textContent;
    btn.textContent = 'Kopiert';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}

function runDraw() {
  clearError();
  const names = getNames();
  const n = parseInt(numberInput.value, 10);

  if (names.length < 2) { showError('Mindestens zwei Namen eintragen, um Gruppen zu bilden.'); return; }
  if (!n || n < 1) { showError('Bitte eine Zahl größer als 0 eingeben.'); return; }

  let groupCount;
  if (mode === 'groups') {
    if (n > names.length) { showError('Es gibt weniger Namen als gewünschte Gruppen. Zahl verringern oder mehr Namen eintragen.'); return; }
    groupCount = n;
  } else {
    groupCount = Math.max(1, Math.ceil(names.length / n));
  }

  render(buildGroups(names, groupCount));
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

drawBtn.addEventListener('click', runDraw);
